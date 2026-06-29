// Maintenance & sauvegarde locale (runtime Node / VM Oracle UNIQUEMENT).
//
// Active AUTOMATIQUEMENT au démarrage du service (donc dès la prochaine mise à
// jour in-app, sans aucune intervention sur la VM) :
//   • snapshot SQLite cohérent (sqlite3 .backup) dans data/backups/, ROTATIF ;
//   • purge des sessions expirées + checkpoint WAL (cf. runDbMaintenance).
//
// ⚠️ Le snapshot local protège contre la corruption de base et les suppressions
// accidentelles (restauration rapide), PAS contre la perte du disque de la VM.
// Pour une copie HORS-SITE durable, voir deployment/backup.sh (Litestream/rclone
// → R2), à installer une fois sur la VM.
//
// Ce fichier utilise des API Node (fs, better-sqlite3 .backup) absentes des types
// Cloudflare Workers : importé UNIQUEMENT par server/node.ts, exclu de tsc, bundlé
// par esbuild. Jamais importé par les routes partagées.

import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { runDbMaintenance } from "./adapters/d1";

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_SNAPSHOTS = 7; // ~1 semaine de snapshots quotidiens

/** Horodatage compact YYYYMMDD-HHmmss (UTC) pour nommer les snapshots. */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/** Supprime les snapshots les plus anciens au-delà de KEEP_SNAPSHOTS. */
function pruneOldSnapshots(dir: string): void {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith("marienour-") && f.endsWith(".db"));
  } catch {
    return;
  }
  if (files.length <= KEEP_SNAPSHOTS) return;
  const sorted = files
    .map((f) => ({ f, t: safeMtime(join(dir, f)) }))
    .sort((a, b) => b.t - a.t); // plus récent d'abord
  for (const { f } of sorted.slice(KEEP_SNAPSHOTS)) {
    try {
      unlinkSync(join(dir, f));
    } catch {
      /* best-effort */
    }
  }
}

function safeMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** Effectue un snapshot + la maintenance. `db` = base better-sqlite3 brute. */
async function runOnce(db: any, dataDir: string): Promise<void> {
  try {
    const backupsDir = join(dataDir, "backups");
    mkdirSync(backupsDir, { recursive: true });
    const dest = join(backupsDir, `marienour-${stamp(new Date())}.db`);
    // better-sqlite3 : .backup() fait une copie cohérente en ligne (sans verrou long).
    await db.backup(dest);
    pruneOldSnapshots(backupsDir);
    const { sessionsPurged } = runDbMaintenance(db);
    console.log(`[marienour] sauvegarde locale ✓ (${dest}) · sessions purgées: ${sessionsPurged}`);
  } catch (e) {
    // Une sauvegarde ratée ne doit jamais faire tomber le service.
    console.error("[marienour] maintenance/sauvegarde échouée:", e);
  }
}

/**
 * Démarre la maintenance : une première passe ~30 s après le démarrage (laisse le
 * service se stabiliser), puis toutes les 24 h. Renvoie une fonction d'arrêt.
 */
export function startMaintenance(db: any, dataDir: string): () => void {
  const first = setTimeout(() => void runOnce(db, dataDir), 30_000);
  const timer = setInterval(() => void runOnce(db, dataDir), DAY_MS);
  // Ne maintient pas le process en vie juste pour ces timers.
  if (typeof first.unref === "function") first.unref();
  if (typeof timer.unref === "function") timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
