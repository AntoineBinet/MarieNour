const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const express = require("express");
const session = require("express-session");
const initSqlJs = require("sql.js");
const multer = require("multer");

const pkg = require("./package.json");
const LAST_COMMIT_HASH_FILE = path.join(__dirname, ".last_commit_hash");
const LOGS_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOGS_DIR, "marienour.log");
const DEPLOY_RESTART_DELAY_SECONDS = 10;
const ALLOWED_ORIGINS = [
  "https://marienour.work",
  "https://www.marienour.work",
  "http://marienour.work",
  "http://www.marienour.work",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1",
  "http://localhost",
];

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

// Identifiants (à terme : AUTH_USER / AUTH_PASSWORD dans .env)
const AUTH_USER = process.env.AUTH_USER || "marienour";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "1234salibi";
const DATA_DIR = path.join(__dirname, "data");
const AI_CONFIG_PATH = path.join(DATA_DIR, "ai_config.json");
const MARIE_NOUR_DIR = path.join(DATA_DIR, "marie-nour");
const DB_PATH = path.join(DATA_DIR, "mnwork.sqlite");

const OLLAMA_URL_DEFAULT = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL_DEFAULT = process.env.OLLAMA_MODEL || "llama3.2";
const OLLAMA_TIMEOUT_MS = (Number(process.env.OLLAMA_TIMEOUT) || 120) * 1000;
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const AI_PROVIDER_DEFAULT = process.env.AI_PROVIDER || "ollama";
const SONAR_MODEL_DEFAULT = process.env.SONAR_MODEL || "sonar";

let aiConfigCache = null;

function _load_ai_config() {
  if (aiConfigCache) return aiConfigCache;
  const defaults = {
    provider: AI_PROVIDER_DEFAULT,
    fallback_enabled: true,
    ollama_url: OLLAMA_URL_DEFAULT,
    ollama_model: OLLAMA_MODEL_DEFAULT,
    sonar_api_key: process.env.PERPLEXITY_API_KEY || "",
    sonar_model: SONAR_MODEL_DEFAULT,
  };
  try {
    if (fs.existsSync(AI_CONFIG_PATH)) {
      const raw = fs.readFileSync(AI_CONFIG_PATH, "utf8");
      const fromFile = JSON.parse(raw);
      aiConfigCache = { ...defaults, ...fromFile };
    } else {
      aiConfigCache = { ...defaults };
    }
  } catch (_) {
    aiConfigCache = { ...defaults };
  }
  return aiConfigCache;
}

function _save_ai_config(config) {
  const safe = {
    provider: config.provider || AI_PROVIDER_DEFAULT,
    fallback_enabled: Boolean(config.fallback_enabled),
    ollama_url: config.ollama_url || OLLAMA_URL_DEFAULT,
    ollama_model: config.ollama_model || OLLAMA_MODEL_DEFAULT,
    sonar_api_key: typeof config.sonar_api_key === "string" ? config.sonar_api_key : _load_ai_config().sonar_api_key,
    sonar_model: config.sonar_model || SONAR_MODEL_DEFAULT,
  };
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(safe, null, 2), "utf8");
  aiConfigCache = safe;
  return safe;
}
const PROFILE_JSON_MAX = 5 * 1024 * 1024; // 5 MB

const EXPORTS_DIR = path.join(MARIE_NOUR_DIR, "exports");
const BACKUPS_DIR = path.join(MARIE_NOUR_DIR, "backups");
/** Fichier de secours versionné (non ignoré par Git) pour ne pas perdre le profil */
const PROFILE_BACKUP_JSON = path.join(MARIE_NOUR_DIR, "profile-backup.json");

// Créer dossiers au démarrage
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(MARIE_NOUR_DIR)) fs.mkdirSync(MARIE_NOUR_DIR, { recursive: true });
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

function appendLog(message) {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch (_) {}
}

function _schedule_restart(delaySeconds) {
  const delay = (delaySeconds || DEPLOY_RESTART_DELAY_SECONDS) * 1000;
  setTimeout(() => {
    appendLog("Deploy: exiting with code 42 for supervisor restart");
    process.exit(42);
  }, delay);
}

function sendSSE(res, data) {
  res.write("data: " + JSON.stringify(data) + "\n\n");
}

function runGitStream(cwd, args, res, step) {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd });
    let out = "";
    proc.stdout.on("data", (chunk) => {
      const s = chunk.toString("utf8").trim();
      if (s) {
        out += s + "\n";
        sendSSE(res, { step, message: s });
      }
    });
    proc.stderr.on("data", (chunk) => {
      const s = chunk.toString("utf8").trim();
      if (s) {
        out += s + "\n";
        sendSSE(res, { step, message: s });
      }
    });
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(out || `git exit ${code}`));
      resolve(out);
    });
    proc.on("error", reject);
  });
}

/** Exécute une commande git et retourne { stdout, stderr, code }. */
function runGit(cwd, args) {
  return new Promise((resolve) => {
    const proc = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    proc.on("close", (code) => resolve({ stdout, stderr, code }));
    proc.on("error", (err) => resolve({ stdout: "", stderr: String(err), code: 1 }));
  });
}

let db;
let SQL;

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

async function start() {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, "node_modules", "sql.js", "dist", file),
  });
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    category TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
  saveDb();

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: PROFILE_JSON_MAX }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "mnwork-session-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: "lax",
        secure: "auto",
      },
    })
  );

  const loginPageHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connexion — MNWork</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&family=Nunito:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #faf9f7; --surface: #f5f3f0; --text: #2d2a26; --muted: #6b6660; --primary: #5a9a8e; --primary-hover: #4a8579; --border: #e5e1db; --radius: 1rem; --font-display: 'Plus Jakarta Sans', sans-serif; --font-body: 'Nunito', sans-serif; }
    @media (prefers-color-scheme: dark) { :root { --bg: #1c1b19; --surface: #232220; --text: #e5e3df; --muted: #a8a49d; --primary: #6eb5a8; --primary-hover: #85c7bc; --border: #3d3b38; } }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: var(--font-body); font-size: 1rem; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
    .login-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 2rem; max-width: 360px; width: 100%; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
    h1 { font-family: var(--font-display); font-size: 1.5rem; margin: 0 0 0.5rem 0; }
    p { color: var(--muted); margin: 0 0 1.5rem 0; font-size: 0.9375rem; }
    label { display: block; font-weight: 600; margin-bottom: 0.375rem; font-size: 0.875rem; }
    input { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid var(--border); border-radius: 0.5rem; font: inherit; background: var(--bg); color: var(--text); margin-bottom: 1rem; }
    input:focus { outline: 2px solid var(--primary); outline-offset: 2px; }
    button { width: 100%; padding: 0.75rem 1rem; background: var(--primary); color: #fff; border: none; border-radius: 0.5rem; font: 600 1rem var(--font-body); cursor: pointer; }
    button:hover { background: var(--primary-hover); }
    .error { color: #c45d8a; font-size: 0.875rem; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>Connexion</h1>
    <p>Identifiez-vous pour accéder à l’assistant candidature.</p>
    <form method="post" action="/login">
      <label for="username">Identifiant</label>
      <input id="username" name="username" type="text" required autocomplete="username" autofocus />
      <label for="password">Mot de passe</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" />
      <button type="submit">Se connecter</button>
    </form>
    {{error}}
  </div>
</body>
</html>`;

  app.get("/login", (req, res) => {
    if (req.session && req.session.user) {
      return res.redirect("/");
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.send(loginPageHtml.replace("{{error}}", ""));
  });

  app.post("/login", (req, res) => {
    if (req.session && req.session.user) {
      return res.redirect("/");
    }
    const username = (req.body && req.body.username) ? String(req.body.username).trim() : "";
    const password = (req.body && req.body.password) ? String(req.body.password) : "";
    const ok = username === AUTH_USER && password === AUTH_PASSWORD;
    if (!ok) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(401).send(
        loginPageHtml.replace("{{error}}", '<p class="error">Identifiant ou mot de passe incorrect.</p>')
      );
      return;
    }
    req.session.user = username;
    res.redirect("/");
  });

  app.post("/logout", (req, res) => {
    req.session.destroy(() => {});
    res.redirect("/login");
  });

  function requireAuth(req, res, next) {
    if (req.path === "/login" || req.path === "/api/health") return next();
    if (req.session && req.session.user) return next();
    res.redirect("/login");
  }

  app.use(requireAuth);

  app.get("/parametres", (req, res) => {
    res.sendFile(path.join(__dirname, "parametres.html"));
  });

  app.get("/api/deploy/health", (req, res) => {
    res.status(200).json({ ok: true });
  });

  function getGitInfo() {
    const cwd = __dirname;
    let commitHash = "";
    let branch = "";
    try {
      commitHash = require("child_process").execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
    } catch (_) {}
    try {
      branch = require("child_process").execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8" }).trim();
    } catch (_) {}
    return { commitHash, branch };
  }

  app.get("/api/app-version", (req, res) => {
    const version = process.env.APP_VERSION || pkg.version || "1.0.0";
    const { commitHash, branch } = getGitInfo();
    res.json({ version, commitHash, branch });
  });

  app.post("/api/deploy/pull", (req, res) => {
    const origin = (req.get("Origin") || req.get("Referer") || "").trim();
    const allowed = !origin || ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
    if (!allowed) {
      return res.status(403).json({ error: "Origin non autorisée" });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const repoRoot = __dirname;
    const gitDir = path.join(repoRoot, ".git");

    (async () => {
      try {
        if (!fs.existsSync(gitDir)) {
          sendSSE(res, { step: "error", message: "Dépôt Git introuvable (.git)" });
          sendSSE(res, { step: "done", alreadyUpToDate: false, restartInSeconds: 0, error: true });
          res.end();
          return;
        }
        sendSSE(res, { step: "log", message: "Vérification du dépôt Git..." });
        const { commitHash: currentHash } = getGitInfo();
        if (currentHash) {
          fs.writeFileSync(LAST_COMMIT_HASH_FILE, currentHash, "utf8");
        }
        sendSSE(res, { step: "log", message: "git fetch origin..." });
        await runGitStream(repoRoot, ["fetch", "origin"], res, "fetch");
        const beforePull = getGitInfo().commitHash;
        if (beforePull) {
          fs.writeFileSync(LAST_COMMIT_HASH_FILE, beforePull, "utf8");
        }
        sendSSE(res, { step: "log", message: "git pull --ff-only origin main..." });
        let pullOk = false;
        try {
          await runGitStream(repoRoot, ["pull", "--ff-only", "origin", "main"], res, "pull");
          pullOk = true;
        } catch (pullErr) {
          sendSSE(res, { step: "log", message: "Pull en échec, tentative git reset --hard origin/main..." });
          try {
            await runGitStream(repoRoot, ["reset", "--hard", "origin/main"], res, "reset");
            pullOk = true;
          } catch (resetErr) {
            sendSSE(res, { step: "error", message: (resetErr && resetErr.message) || String(resetErr) });
          }
        }
        const { commitHash: afterHash } = getGitInfo();
        const changed = afterHash && beforePull && afterHash !== beforePull;
        if (pullOk && changed) {
          _schedule_restart(DEPLOY_RESTART_DELAY_SECONDS);
          sendSSE(res, {
            step: "done",
            alreadyUpToDate: false,
            restartInSeconds: DEPLOY_RESTART_DELAY_SECONDS,
            commitHash: afterHash,
          });
        } else if (pullOk) {
          sendSSE(res, { step: "done", alreadyUpToDate: true, restartInSeconds: 0, commitHash: afterHash });
        } else {
          sendSSE(res, { step: "done", alreadyUpToDate: false, restartInSeconds: 0, error: true });
        }
      } catch (err) {
        sendSSE(res, { step: "error", message: (err && err.message) || String(err) });
        sendSSE(res, { step: "done", alreadyUpToDate: false, restartInSeconds: 0, error: true });
      }
      res.end();
    })();
  });

  app.get("/api/system/logs", (req, res) => {
    const lines = Math.min(parseInt(req.query.lines, 10) || 100, 500);
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({ logs: "", message: "Logs non configurés ou fichier absent." });
    }
    try {
      const content = fs.readFileSync(LOG_FILE, "utf8");
      const all = content.split("\n").filter(Boolean);
      const last = all.slice(-lines).join("\n");
      res.json({ logs: last });
    } catch (e) {
      res.status(500).json({ error: "Erreur lecture logs." });
    }
  });

  app.post("/api/system/verify", (req, res) => {
    const checks = [];
    const repoRoot = __dirname;
    const gitDir = path.join(repoRoot, ".git");
    checks.push({
      name: "Dépôt Git",
      ok: fs.existsSync(gitDir),
      message: fs.existsSync(gitDir) ? "Présent" : "Absent",
    });
    const { commitHash, branch } = getGitInfo();
    checks.push({ name: "Branche", ok: !!branch, message: branch || "Inconnue" });
    checks.push({ name: "Commit HEAD", ok: !!commitHash, message: commitHash ? commitHash.slice(0, 7) : "Inconnu" });
    checks.push({
      name: "server.js",
      ok: fs.existsSync(path.join(repoRoot, "server.js")),
      message: fs.existsSync(path.join(repoRoot, "server.js")) ? "Présent" : "Absent",
    });
    checks.push({
      name: "package.json",
      ok: fs.existsSync(path.join(repoRoot, "package.json")),
      message: fs.existsSync(path.join(repoRoot, "package.json")) ? "Présent" : "Absent",
    });
    checks.push({
      name: ".last_commit_hash",
      ok: fs.existsSync(LAST_COMMIT_HASH_FILE),
      message: fs.existsSync(LAST_COMMIT_HASH_FILE) ? "Présent" : "Optionnel (créé au premier pull)",
    });
    res.json({ checks });
  });

  app.get("/api/system/check-deployment", (req, res) => {
    const { commitHash, branch } = getGitInfo();
    let lastSavedHash = null;
    if (fs.existsSync(LAST_COMMIT_HASH_FILE)) {
      lastSavedHash = fs.readFileSync(LAST_COMMIT_HASH_FILE, "utf8").trim();
    }
    res.json({
      branch,
      commitHash: commitHash || null,
      lastSavedCommitHash: lastSavedHash,
      repoOk: !!commitHash,
    });
  });

  /** Redémarrage du serveur (code 42 pour le superviseur). */
  app.post("/api/system/restart", (req, res) => {
    res.json({ ok: true, message: "Redémarrage dans 2 s…" });
    _schedule_restart(2);
  });

  app.use(express.static(__dirname));

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MARIE_NOUR_DIR),
    filename: (_req, file, cb) => {
      const base = path.basename(file.originalname, path.extname(file.originalname));
      const ext = path.extname(file.originalname) || "";
      const safe = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
      const date = new Date().toISOString().slice(0, 10);
      const unique = `${safe}_${date}_${Date.now()}${ext}`;
      cb(null, unique);
    }
  });
  const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB par fichier

  function sendError(res, status, message) {
    res.status(status).json({ error: message });
  }

  async function callOllama(prompt, opts = {}) {
    const cfg = _load_ai_config();
    const url = (cfg.ollama_url || OLLAMA_URL_DEFAULT).replace(/\/$/, "") + "/api/generate";
    const body = {
      model: opts.model || cfg.ollama_model || OLLAMA_MODEL_DEFAULT,
      prompt: typeof prompt === "string" ? prompt : (Array.isArray(prompt) ? prompt.map((m) => m.content || m).join("\n") : String(prompt)),
      stream: opts.stream ?? false,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || OLLAMA_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Ollama ${res.status}`);
      }
      const data = await res.json();
      return data.response || data.message || "";
    } finally {
      clearTimeout(timeout);
    }
  }

  async function callSonar(messages, opts = {}) {
    const cfg = _load_ai_config();
    const key = cfg.sonar_api_key || process.env.PERPLEXITY_API_KEY;
    if (!key) throw new Error("Clé API Sonar (Perplexity) non configurée.");
    const model = opts.model || cfg.sonar_model || SONAR_MODEL_DEFAULT;
    const msgs = Array.isArray(messages)
      ? messages.map((m) => (typeof m === "string" ? { role: "user", content: m } : { role: m.role || "user", content: m.content || "" }))
      : [{ role: "user", content: String(messages) }];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 60000);
    try {
      const res = await fetch(PERPLEXITY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: msgs,
          max_tokens: opts.max_tokens ?? 1024,
          temperature: opts.temperature ?? 0.2,
          stream: opts.stream ?? false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Perplexity ${res.status}`);
      }
      const data = await res.json();
      const choice = data.choices && data.choices[0];
      return choice ? (choice.message && choice.message.content) || choice.text || "" : "";
    } finally {
      clearTimeout(timeout);
    }
  }

  async function generateWithFallback(prompt, providerOverride = null) {
    const cfg = _load_ai_config();
    const primary = providerOverride || cfg.provider || "ollama";
    const tryOrder = primary === "sonar" ? ["sonar", "ollama"] : ["ollama", "sonar"];
    for (const p of tryOrder) {
      try {
        if (p === "ollama") return { provider: "ollama", text: await callOllama(prompt) };
        if (p === "sonar") return { provider: "sonar", text: await callSonar([{ role: "user", content: prompt }]) };
      } catch (err) {
        if (!cfg.fallback_enabled || tryOrder.indexOf(p) === tryOrder.length - 1) throw err;
      }
    }
    throw new Error("Aucun fournisseur IA disponible.");
  }

  app.get("/api/ai/config", (req, res) => {
    try {
      const cfg = _load_ai_config();
      const key = cfg.sonar_api_key || "";
      res.json({
        provider: cfg.provider,
        fallback_enabled: cfg.fallback_enabled,
        ollama_url: cfg.ollama_url,
        ollama_model: cfg.ollama_model,
        sonar_model: cfg.sonar_model,
        sonar_api_key_set: key.length > 0,
        sonar_api_key_preview: key.length > 4 ? key.slice(0, 4) + "…" + key.slice(-2) : key ? "***" : "",
      });
    } catch (e) {
      sendError(res, 500, "Erreur lecture config IA.");
    }
  });

  app.post("/api/ai/config", (req, res) => {
    const body = req.body || {};
    try {
      const updated = _save_ai_config({
        provider: body.provider,
        fallback_enabled: body.fallback_enabled,
        ollama_url: body.ollama_url,
        ollama_model: body.ollama_model,
        sonar_api_key: body.sonar_api_key,
        sonar_model: body.sonar_model,
      });
      res.json({
        ok: true,
        provider: updated.provider,
        fallback_enabled: updated.fallback_enabled,
        ollama_url: updated.ollama_url,
        ollama_model: updated.ollama_model,
        sonar_model: updated.sonar_model,
        sonar_api_key_set: (updated.sonar_api_key || "").length > 0,
      });
    } catch (e) {
      sendError(res, 500, "Erreur sauvegarde config IA.");
    }
  });

  app.post("/api/ai/test", (req, res) => {
    const provider = (req.body && req.body.provider) || _load_ai_config().provider;
    const testPrompt = "Réponds uniquement par le mot OK.";
    (async () => {
      try {
        let text = "";
        if (provider === "sonar") text = await callSonar([{ role: "user", content: testPrompt }]);
        else text = await callOllama(testPrompt);
        const excerpt = (text || "").trim().slice(0, 200);
        res.json({ ok: true, provider, excerpt, message: "Connexion réussie." });
      } catch (err) {
        res.status(500).json({ ok: false, provider, error: (err && err.message) || String(err) });
      }
    })();
  });

  app.post("/api/ai/generate", (req, res) => {
    const prompt = req.body && req.body.prompt;
    if (!prompt || typeof prompt !== "string") {
      return sendError(res, 400, "prompt requis.");
    }
    (async () => {
      try {
        const out = await generateWithFallback(prompt.trim());
        res.json({ ok: true, provider: out.provider, text: out.text });
      } catch (err) {
        sendError(res, 500, (err && err.message) || "Erreur génération IA.");
      }
    })();
  });

  const EXTRACT_CV_SYSTEM = `Tu es un assistant qui extrait les informations structurées d'un CV (texte brut).
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni texte autour, avec les clés suivantes (utilise des chaînes vides si absent) :
firstName, lastName, email, phone, summary, skills (tableau de strings), experiences (tableau d'objets avec: title, company, dates, description), education (tableau d'objets avec: diploma, school, dates), languages (tableau de strings).`;

  app.post("/api/ai/extract-cv", (req, res) => {
    const text = req.body && req.body.text;
    if (!text || typeof text !== "string") {
      return sendError(res, 400, "text requis (contenu texte du CV).");
    }
    const prompt = `${EXTRACT_CV_SYSTEM}\n\n---\nCV à analyser:\n${text.slice(0, 15000)}`;
    (async () => {
      try {
        const out = await generateWithFallback(prompt);
        let parsed = null;
        const raw = (out.text || "").replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1").trim();
        try {
          parsed = JSON.parse(raw);
        } catch (_) {
          parsed = { raw: out.text, error: "Réponse non JSON" };
        }
        res.json({ ok: true, provider: out.provider, extracted: parsed });
      } catch (err) {
        sendError(res, 500, (err && err.message) || "Erreur extraction CV.");
      }
    })();
  });

  app.post("/api/ai/find-jobs", (req, res) => {
    const { query, location } = req.body || {};
    const q = typeof query === "string" ? query.trim() : "";
    if (!q) return sendError(res, 400, "query requis (ex: titre du poste, secteur).");
    const cfg = _load_ai_config();
    const sonarKey = cfg.sonar_api_key || process.env.PERPLEXITY_API_KEY;
    if (!sonarKey) return sendError(res, 400, "Recherche de postes nécessite Sonar (Perplexity). Configurez une clé API dans Paramètres > Configuration IA.");
    const locationPart = location && String(location).trim() ? ` à ${location}` : "";
    const prompt = `Liste des postes ouverts correspondant à cette recherche. Donne une liste concise et actuelle (sites d'emploi, offres récentes) : "${q}"${locationPart}. Pour chaque offre : titre du poste, entreprise ou source, lieu si connu, lien ou source si possible. Réponds en français, format lisible (liste à puces).`;
    (async () => {
      try {
        const text = await callSonar([{ role: "user", content: prompt }], { max_tokens: 2048 });
        res.json({ ok: true, provider: "sonar", text: text || "" });
      } catch (err) {
        sendError(res, 500, (err && err.message) || "Erreur recherche de postes.");
      }
    })();
  });

  app.get("/api/health", (req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/api/profile", (req, res) => {
    try {
      const row = dbGet("SELECT data, updated_at FROM profile WHERE id = 1");
      if (!row) {
        return res.status(404).json({ error: "no_profile" });
      }
      const data = JSON.parse(row.data);
      res.json({ data, updated_at: row.updated_at });
    } catch (e) {
      sendError(res, 500, "Erreur lecture profil.");
    }
  });

  app.post("/api/profile", (req, res) => {
    let body = req.body;
    if (!body || typeof body !== "object") {
      return sendError(res, 400, "Body JSON invalide.");
    }
    const raw = JSON.stringify(body);
    if (Buffer.byteLength(raw, "utf8") > PROFILE_JSON_MAX) {
      return sendError(res, 400, "Profil trop volumineux.");
    }
    try {
      dbRun(
        `INSERT INTO profile (id, data, updated_at) VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`,
        [raw]
      );
      try {
        fs.writeFileSync(PROFILE_BACKUP_JSON, raw, "utf8");
      } catch (_) {}
      res.json({ ok: true });
    } catch (e) {
      sendError(res, 500, "Erreur sauvegarde profil.");
    }
  });

  app.delete("/api/profile", (req, res) => {
    try {
      dbRun("DELETE FROM profile WHERE id = 1");
      res.json({ ok: true });
    } catch (e) {
      sendError(res, 500, "Erreur suppression profil.");
    }
  });

  /** Restauration depuis le fichier versionné (profile-backup.json) quand la base et le localStorage sont vides */
  app.get("/api/profile-from-backup", (req, res) => {
    try {
      if (!fs.existsSync(PROFILE_BACKUP_JSON)) {
        return res.status(404).json({ error: "no_backup_file" });
      }
      const raw = fs.readFileSync(PROFILE_BACKUP_JSON, "utf8");
      const data = JSON.parse(raw);
      res.json({ data, source: "profile-backup.json" });
    } catch (e) {
      sendError(res, 500, "Erreur lecture backup profil.");
    }
  });

  /** Git : pousser le backup profil (data/marie-nour/profile-backup.json) sur origin main */
  app.post("/api/git/push-backup", async (req, res) => {
    const repoRoot = __dirname;
    const gitDir = path.join(repoRoot, ".git");
    if (!fs.existsSync(gitDir)) {
      return sendError(res, 400, "Dépôt Git introuvable.");
    }
    const backupPath = "data/marie-nour/profile-backup.json";
    if (!fs.existsSync(path.join(repoRoot, backupPath))) {
      return sendError(res, 400, "Aucun fichier backup profil à pousser. Enregistre d'abord ton profil dans l'app.");
    }
    try {
      const log = [];
      let r = await runGit(repoRoot, ["add", backupPath]);
      log.push((r.stdout + r.stderr).trim() || "git add ok");
      if (r.code !== 0) {
        return res.json({ ok: false, log: log.join("\n"), error: r.stderr || r.stdout });
      }
      r = await runGit(repoRoot, ["commit", "-m", "Backup profil"]);
      log.push((r.stdout + r.stderr).trim() || "git commit ok");
      if (r.code !== 0 && !/nothing to commit/.test(r.stdout + r.stderr)) {
        return res.json({ ok: false, log: log.join("\n"), error: r.stderr || r.stdout });
      }
      r = await runGit(repoRoot, ["push", "origin", "main"]);
      log.push((r.stdout + r.stderr).trim() || "git push ok");
      if (r.code !== 0) {
        return res.json({ ok: false, log: log.join("\n"), error: r.stderr || r.stdout });
      }
      res.json({ ok: true, log: log.join("\n") });
    } catch (e) {
      sendError(res, 500, (e && e.message) || "Erreur Git.");
    }
  });

  /** Git : add -A, commit, push (mise à jour code sur origin main) */
  app.post("/api/git/push-code", async (req, res) => {
    const repoRoot = __dirname;
    const gitDir = path.join(repoRoot, ".git");
    if (!fs.existsSync(gitDir)) {
      return sendError(res, 400, "Dépôt Git introuvable.");
    }
    try {
      const log = [];
      let r = await runGit(repoRoot, ["add", "-A"]);
      log.push((r.stdout + r.stderr).trim() || "git add -A ok");
      if (r.code !== 0) {
        return res.json({ ok: false, log: log.join("\n"), error: r.stderr || r.stdout });
      }
      r = await runGit(repoRoot, ["status", "--short"]);
      const hasChanges = (r.stdout + r.stderr).trim().length > 0;
      r = await runGit(repoRoot, ["commit", "-m", "Mise à jour"]);
      log.push((r.stdout + r.stderr).trim() || "git commit ok");
      if (r.code !== 0 && !/nothing to commit/.test(r.stdout + r.stderr)) {
        return res.json({ ok: false, log: log.join("\n"), error: r.stderr || r.stdout });
      }
      r = await runGit(repoRoot, ["push", "origin", "main"]);
      log.push((r.stdout + r.stderr).trim() || "git push ok");
      if (r.code !== 0) {
        return res.json({ ok: false, log: log.join("\n"), error: r.stderr || r.stdout });
      }
      res.json({ ok: true, log: log.join("\n"), hadChanges: hasChanges });
    } catch (e) {
      sendError(res, 500, (e && e.message) || "Erreur Git.");
    }
  });

  app.post("/api/exports", (req, res) => {
    const { type, content, optionalName } = req.body || {};
    if (!type || typeof content !== "string") {
      return sendError(res, 400, "type et content requis.");
    }
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10);
    const timeStr = date.toTimeString().slice(0, 5).replace(":", "-");
    const base = optionalName && typeof optionalName === "string"
      ? optionalName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)
      : `${type}_${dateStr}_${timeStr}`;
    const filepath = path.join(EXPORTS_DIR, `${base}.txt`);
    try {
      fs.writeFileSync(filepath, content, "utf8");
      res.json({ ok: true, path: path.relative(DATA_DIR, filepath) });
    } catch (e) {
      sendError(res, 500, "Erreur écriture export.");
    }
  });

  app.post("/api/backup", (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return sendError(res, 400, "Body JSON invalide.");
    }
    const raw = JSON.stringify(body);
    if (Buffer.byteLength(raw, "utf8") > PROFILE_JSON_MAX) {
      return sendError(res, 400, "Backup trop volumineux.");
    }
    const date = new Date();
    const name = `backup_${date.toISOString().slice(0, 10)}_${date.toTimeString().slice(0, 8).replace(/:/g, "-")}.json`;
    const filepath = path.join(BACKUPS_DIR, name);
    try {
      fs.writeFileSync(filepath, raw, "utf8");
      res.json({ ok: true, path: path.relative(DATA_DIR, filepath) });
    } catch (e) {
      sendError(res, 500, "Erreur écriture backup.");
    }
  });

  app.get("/api/documents/:id/file", (req, res) => {
    const id = req.params.id;
    if (!id) return sendError(res, 400, "id manquant.");
    try {
      const row = dbGet("SELECT filename, stored_path FROM documents WHERE id = ?", [id]);
      if (!row) return sendError(res, 404, "Document introuvable.");
      const fullPath = path.join(DATA_DIR, row.stored_path);
      if (!fs.existsSync(fullPath)) return sendError(res, 404, "Fichier introuvable.");
      res.setHeader("Content-Disposition", `attachment; filename="${row.filename.replace(/"/g, "%22")}"`);
      res.sendFile(fullPath);
    } catch (e) {
      sendError(res, 500, "Erreur lecture document.");
    }
  });

  app.post("/api/documents", upload.single("file"), (req, res) => {
    if (!req.file) {
      return sendError(res, 400, "Aucun fichier envoyé.");
    }
    const category = (req.body && req.body.category) || "cv";
    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const storedPath = path.relative(DATA_DIR, req.file.path);
    try {
      dbRun(
        "INSERT INTO documents (id, filename, category, stored_path) VALUES (?, ?, ?, ?)",
        [id, req.file.originalname, category, storedPath]
      );
      res.json({
        id,
        filename: req.file.originalname,
        path: storedPath
      });
    } catch (e) {
      sendError(res, 500, "Erreur enregistrement document.");
    }
  });

  app.listen(PORT, HOST, () => {
    console.log(`Serveur MNWork démarré sur http://${HOST}:${PORT}`);
    appendLog(`Serveur démarré sur http://${HOST}:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
