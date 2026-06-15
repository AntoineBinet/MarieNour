// Adaptateur « R2 » pour Node (VM Oracle) — réimplémente la surface de l'API
// Cloudflare R2 utilisée par l'app (`put` / `get` / `delete`) au-dessus du
// système de fichiers local. Les fichiers (photos) sont stockés sous
// data/media/<clé>, où <clé> est la même que celle écrite en base (colonne
// media.r2_key, ex. "media/<user>/<id>-nom.jpg").
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";

export interface R2PutOptions {
  httpMetadata?: { contentType?: string };
}

class LocalR2 {
  private base: string;

  constructor(base: string) {
    this.base = normalize(base);
    mkdirSync(this.base, { recursive: true });
  }

  /** Résout une clé en chemin absolu, en interdisant toute évasion du dossier. */
  private resolve(key: string): string {
    const p = normalize(join(this.base, key));
    if (p !== this.base && !p.startsWith(this.base + sep)) {
      throw new Error("Clé R2 invalide (hors du dossier média)");
    }
    return p;
  }

  async put(key: string, value: ArrayBuffer | Uint8Array, _opts?: R2PutOptions) {
    const p = this.resolve(key);
    mkdirSync(dirname(p), { recursive: true });
    const buf = value instanceof Uint8Array ? value : Buffer.from(value);
    writeFileSync(p, buf);
    return { key };
  }

  async get(key: string): Promise<{ key: string; body: Buffer } | null> {
    try {
      return { key, body: readFileSync(this.resolve(key)) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw e;
    }
  }

  async delete(key: string) {
    rmSync(this.resolve(key), { force: true });
  }
}

/** Crée un store de fichiers compatible R2 utilisable comme `env.MEDIA`. */
export function createR2(baseDir: string) {
  return new LocalR2(baseDir);
}
