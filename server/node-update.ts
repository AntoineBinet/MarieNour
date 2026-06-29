// Mise à jour in-app (runtime Node / VM Oracle UNIQUEMENT).
//
// Équivalent du bouton « Mettre à jour » de Portfolio / Prospup, adapté à
// marienour qui doit RECONSTRUIRE (npm run build:all) après le git pull, là où
// les apps Python se contentent d'un pull + restart.
//
// Mécanique (le service tourne en tant qu'utilisateur `marienour`, SANS sudo) :
//   git fetch/pull  →  npm ci (si le lockfile a changé)  →  npm run build:all
//   →  process.exit(42)  →  systemd relance le service avec le nouveau build.
// Le code 42 est explicitement réservé à ça dans marienour.service
// (Restart=always + SuccessExitStatus=42 + RestartForceExitStatus=42).
//
// Ce fichier utilise des API Node (child_process, process, fs) absentes des
// types Cloudflare Workers : il est importé UNIQUEMENT par server/node.ts,
// exclu de tsc (tsconfig.server.json) et bundlé par esbuild. Il ne doit JAMAIS
// être importé par server/app.ts ni par les routes partagées (repli serverless).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = process.cwd();
const DATA_DIR = process.env.MARIENOUR_DATA_DIR || join(APP_DIR, "data");
const STATUS_FILE = join(DATA_DIR, ".update-status.json");
const BRANCH = process.env.MARIENOUR_BRANCH || "main";

export type UpdatePhase = "idle" | "running" | "done" | "error";

export interface UpdateStatus {
  phase: UpdatePhase;
  step: string;
  startedAt: number | null;
  finishedAt: number | null;
  fromCommit: string | null;
  toCommit: string | null;
  upToDate: boolean;
  error: string | null;
  log: string[];
}

function freshStatus(): UpdateStatus {
  return {
    phase: "idle",
    step: "",
    startedAt: null,
    finishedAt: null,
    fromCommit: null,
    toCommit: null,
    upToDate: false,
    error: null,
    log: [],
  };
}

function loadPersisted(): UpdateStatus {
  try {
    const raw = JSON.parse(readFileSync(STATUS_FILE, "utf8")) as UpdateStatus;
    // Un update « running » retrouvé au démarrage = le restart attendu vient
    // d'avoir lieu : on le considère terminé avec succès.
    if (raw.phase === "running") {
      raw.phase = "done";
      raw.step = "Redémarré";
      raw.finishedAt = raw.finishedAt ?? Date.now();
    }
    return raw;
  } catch {
    return freshStatus();
  }
}

let current: UpdateStatus = loadPersisted();
let cachedCommit: string | null = null;

function persist() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATUS_FILE, JSON.stringify(current));
  } catch {
    /* le statut est best-effort : ne jamais faire échouer l'update pour ça */
  }
}

function pushLog(chunk: string) {
  for (const line of chunk.split("\n")) {
    const t = line.replace(/\s+$/, "");
    if (t) current.log.push(t);
  }
  if (current.log.length > 120) current.log = current.log.slice(-120);
}

function setStep(step: string) {
  current.step = step;
  pushLog(`▶ ${step}`);
  persist();
}

function finish(phase: UpdatePhase, error?: string) {
  current.phase = phase;
  if (error) current.error = error;
  current.finishedAt = Date.now();
  persist();
}

interface RunResult {
  code: number;
  out: string;
}

function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; quiet?: boolean } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    let out = "";
    const child = spawn(cmd, args, { cwd: APP_DIR, env: { ...process.env, ...opts.env } });
    const onData = (d: Buffer) => {
      const s = d.toString();
      out += s;
      if (!opts.quiet) pushLog(s); // les lectures (rev-parse, diff) ne polluent pas le journal
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (e) => resolve({ code: 1, out: `${out}\n${String(e)}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

async function must(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<RunResult> {
  const r = await run(cmd, args, { env });
  if (r.code !== 0) throw new Error(`« ${cmd} ${args.join(" ")} » a échoué (code ${r.code})`);
  return r;
}

/** Vérifie que le build a produit des artefacts plausibles (sinon un `vite build`
 *  qui a échoué partiellement — ex. OOM — laisserait un dist/ vide). Lève si KO. */
function assertBuildArtifacts(): void {
  const checks: { path: string; min: number; label: string }[] = [
    { path: join(APP_DIR, "dist", "index.html"), min: 200, label: "front (dist/index.html)" },
    { path: join(APP_DIR, "dist-server", "server.mjs"), min: 10_000, label: "serveur (dist-server/server.mjs)" },
  ];
  for (const ch of checks) {
    let size = 0;
    try {
      size = statSync(ch.path).size;
    } catch {
      throw new Error(`Build incomplet : ${ch.label} manquant`);
    }
    if (size < ch.min) throw new Error(`Build incomplet : ${ch.label} trop petit (${size} o)`);
  }
}

async function gitShort(ref: string): Promise<string> {
  const r = await run("git", ["rev-parse", "--short", ref], { quiet: true });
  return r.code === 0 ? r.out.trim() : "";
}

/** Commit actuellement servi (mis en cache : ne change qu'au redémarrage). */
export async function getCurrentCommit(): Promise<string | null> {
  if (cachedCommit === null) cachedCommit = (await gitShort("HEAD")) || "";
  return cachedCommit || null;
}

export function getStatus(): UpdateStatus {
  return current;
}

/** Démarre une mise à jour en arrière-plan (ne bloque pas la requête HTTP). */
export function startUpdate(): { started: boolean; reason?: string } {
  if (current.phase === "running") return { started: false, reason: "Une mise à jour est déjà en cours." };
  if (!existsSync(join(APP_DIR, ".git"))) {
    return { started: false, reason: "Dépôt git introuvable : mise à jour indisponible sur cet hébergement." };
  }
  current = { ...freshStatus(), phase: "running", step: "Démarrage…", startedAt: Date.now() };
  persist();
  void doUpdate();
  return { started: true };
}

async function doUpdate() {
  try {
    setStep("Lecture de la version installée");
    current.fromCommit = (await gitShort("HEAD")) || null;

    setStep("Récupération depuis GitHub (git fetch)");
    await must("git", ["fetch", "--prune", "origin", BRANCH]);

    const local = await gitShort("HEAD");
    const remote = await gitShort(`origin/${BRANCH}`);
    if (local && remote && local === remote) {
      current.toCommit = local;
      current.upToDate = true;
      setStep("Déjà à jour ✓");
      finish("done");
      return; // rien à reconstruire, pas de redémarrage
    }

    // `local` = commit AVANT la MAJ : sert de point de rollback si le build casse.
    const prevHead = local;

    setStep("Application des changements (git pull)");
    await must("git", ["checkout", BRANCH]);
    await must("git", ["merge", "--ff-only", `origin/${BRANCH}`]);

    // À partir d'ici, git a avancé : toute panne (npm ci, build, smoke-test) doit
    // RESTAURER la version précédente pour ne pas laisser le service cassé sans
    // rollback (le serveur en cours sert toujours l'ancien build tant qu'on n'a
    // pas sorti en 42).
    try {
      // Réinstaller les dépendances seulement si le lockfile a bougé.
      const lock = await run("git", ["diff", "--name-only", `${prevHead}`, "HEAD", "--", "package-lock.json"], {
        quiet: true,
      });
      if (lock.out.trim().length > 0) {
        setStep("Installation des dépendances (npm ci)");
        await must("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], { NODE_ENV: "development" });
      }

      setStep("Reconstruction (front + serveur)");
      await must("npm", ["run", "build:all"], { NODE_ENV: "production" });

      // Smoke-test : le nouveau build est-il exploitable AVANT de redémarrer ?
      setStep("Vérification du build");
      assertBuildArtifacts();
      // `node --check` parse le bundle serveur sans l'exécuter (pas de bind :8002).
      await must("node", ["--check", join(APP_DIR, "dist-server", "server.mjs")]);
    } catch (buildErr) {
      setStep("Échec du build — restauration de la version précédente");
      // Rollback best-effort : on revient au commit qui tournait + on rebuild pour
      // garantir un dist/ cohérent au prochain (re)démarrage.
      if (prevHead) await run("git", ["reset", "--hard", prevHead]);
      await run("npm", ["run", "build:all"], { env: { NODE_ENV: "production" } });
      throw new Error(
        `${(buildErr as Error)?.message || String(buildErr)} — version précédente restaurée (aucun redémarrage).`,
      );
    }

    current.toCommit = (await gitShort("HEAD")) || null;
    setStep("Redémarrage du service…");
    finish("done"); // persisté AVANT l'exit → relu « done » au redémarrage

    // Laisse la réponse HTTP / le statut se flusher, puis sort en 42 : systemd
    // relance le service avec le nouveau dist-server/server.mjs.
    setTimeout(() => process.exit(42), 800);
  } catch (e) {
    finish("error", (e as Error)?.message || String(e));
  }
}
