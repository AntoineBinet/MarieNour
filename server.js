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
  "http://marienour.work",
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
