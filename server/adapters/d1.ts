// Adaptateur « D1 » pour Node (VM Oracle) — réimplémente la surface de l'API
// Cloudflare D1 (`prepare().bind().all()/.first()/.run()` + `batch()`) au-dessus
// de better-sqlite3, pour que TOUT le code de `server/` (écrit pour D1) tourne
// tel quel sur le serveur Node, sans modification des routes.
//
// Hors Cloudflare on n'a pas la base D1 managée : on utilise un fichier SQLite
// local (data/marienour.db) + un mini-runner de migrations qui rejoue
// `migrations/*.sql` une seule fois (table de suivi `_mn_migrations`).
import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

// better-sqlite3 n'est pas typé ici (fichier non inclus dans le typecheck tsc) :
// on reste volontairement souple.
type SqliteDb = any;
type Stmt = any;

/** D1 accepte les booléens (→ 1/0) ; better-sqlite3 non. On normalise aussi
 *  `undefined` → `null` pour ne jamais lever sur un champ optionnel. */
function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

class PreparedStatement {
  constructor(
    private prep: (sql: string) => Stmt,
    private sql: string,
    private params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): PreparedStatement {
    return new PreparedStatement(this.prep, this.sql, normalizeParams(params));
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }> {
    const rows = this.prep(this.sql).all(...this.params) as T[];
    return { results: rows, success: true, meta: {} };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.prep(this.sql).get(...this.params) as T | undefined;
    return row === undefined ? null : row;
  }

  async run() {
    return this.toResult(this.runSync());
  }

  /** Exécution synchrone — nécessaire dans les transactions better-sqlite3. */
  runSync() {
    return this.prep(this.sql).run(...this.params);
  }

  toResult(info: { changes?: number; lastInsertRowid?: number | bigint }) {
    return {
      success: true,
      meta: {
        changes: info.changes ?? 0,
        last_row_id:
          typeof info.lastInsertRowid === "bigint" ? Number(info.lastInsertRowid) : info.lastInsertRowid ?? 0,
        duration: 0,
      },
    };
  }
}

class D1Adapter {
  // Cache des statements compilés : `prepare()` est appelé des milliers de fois
  // avec les mêmes chaînes SQL ; recompiler à chaque appel est du gâchis CPU sur
  // la micro-VM. Les Statement better-sqlite3 sont réutilisables sans risque.
  private stmtCache = new Map<string, Stmt>();
  private prep = (sql: string): Stmt => {
    let s = this.stmtCache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmtCache.set(sql, s);
    }
    return s;
  };

  constructor(private db: SqliteDb) {}

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.prep, sql);
  }

  /** Exécute des statements (déjà bindés) dans une seule transaction. */
  async batch(statements: PreparedStatement[]) {
    const tx = this.db.transaction((stmts: PreparedStatement[]) => stmts.map((s) => s.runSync()));
    const infos = tx(statements);
    return statements.map((s, i) => s.toResult(infos[i]));
  }

  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }

  /** Accès à la base better-sqlite3 sous-jacente — réservé à la maintenance Node
   *  (sauvegarde, checkpoint WAL, purge des sessions). N'est PAS exposé aux routes
   *  partagées (qui ne voient que la surface D1). */
  rawDb(): SqliteDb {
    return this.db;
  }
}

/** Rejoue les migrations SQL non encore appliquées (équiv. `wrangler d1 migrations apply`). */
function applyMigrations(db: SqliteDb, migrationsDir: string) {
  db.exec("CREATE TABLE IF NOT EXISTS _mn_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = new Set(
    (db.prepare("SELECT name FROM _mn_migrations").all() as { name: string }[]).map((r) => r.name),
  );

  let files: string[] = [];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    console.warn(`[marienour] dossier migrations introuvable: ${migrationsDir} (rien à appliquer)`);
    return;
  }

  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(join(migrationsDir, f), "utf8");
    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _mn_migrations (name, applied_at) VALUES (?, ?)").run(f, Date.now());
    });
    run();
    console.log(`[marienour] migration appliquée: ${f}`);
  }
}

/** Ouvre (ou crée) la base SQLite locale, applique les migrations, renvoie un objet
 *  compatible D1 utilisable comme `env.DB`. */
export function createD1(dbPath: string, migrationsDir: string): D1Adapter {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  // Réglages de fiabilité/perf adaptés à la micro-VM (1 vCPU / 1 Go) :
  db.pragma("journal_mode = WAL"); // meilleure concurrence lecture/écriture
  db.pragma("synchronous = NORMAL"); // sûr en WAL, nettement moins d'fsync (perf écriture)
  db.pragma("foreign_keys = ON"); // honore les ON DELETE CASCADE/SET NULL du schéma (comme D1)
  db.pragma("busy_timeout = 5000"); // attend jusqu'à 5 s au lieu d'échouer en SQLITE_BUSY
  db.pragma("cache_size = -16000"); // ~16 Mo de cache page (valeur négative = Kio)
  db.pragma("mmap_size = 134217728"); // 128 Mo en mmap : moins de syscalls de lecture
  db.pragma("wal_autocheckpoint = 1000"); // borne la croissance du fichier -wal
  applyMigrations(db, migrationsDir);
  return new D1Adapter(db);
}

/** Maintenance périodique (Node uniquement) : purge des sessions expirées +
 *  checkpoint WAL (tronque le fichier -wal). Best-effort, ne lève jamais. */
export function runDbMaintenance(db: SqliteDb): { sessionsPurged: number } {
  let sessionsPurged = 0;
  try {
    const r = db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    sessionsPurged = r.changes ?? 0;
  } catch (e) {
    console.error("[marienour] purge sessions échouée:", e);
  }
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch (e) {
    console.error("[marienour] checkpoint WAL échoué:", e);
  }
  return { sessionsPurged };
}
