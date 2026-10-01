// Banc navigateur de MarieNour : démarre le VRAI serveur bâti pour la durée des
// tests navigateur, sur un port libre et un dossier de données jetable.
//
//   npm run build:all
//   MN_CHROMIUM=/chemin/vers/chrome npm run test:e2e
//
// Sans MN_CHROMIUM, rien ne démarre et chaque test se saute (la CI n'a pas de
// navigateur). Les tests reçoivent par `inject()` l'adresse du serveur et un
// jeton de session du compte admin (créé au premier login maître), dont le
// contenu de démarrage a été semé (POST /api/onboarding/seed).

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GlobalSetupContext } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** Adresse du serveur de test (vide quand le banc est sauté). */
    mnBase: string;
    /** Jeton de session (cookie mn_session) du compte admin de test. */
    mnToken: string;
    /** Identifiants du compte admin de test. */
    mnAdmin: { email: string; password: string };
  }
}

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const ADMIN = { email: "e2e@marienour.test", password: "e2e-mot-de-passe-maitre" };

function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = createServer();
    s.unref();
    s.on("error", ko);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const port = typeof a === "object" && a ? a.port : 0;
      s.close(() => ok(port));
    });
  });
}

async function attendreSante(base: string, enfant: ChildProcess, journal: () => string): Promise<void> {
  const limite = Date.now() + 30_000;
  while (Date.now() < limite) {
    if (enfant.exitCode !== null) throw new Error(`Le serveur de test s'est arrêté (code ${enfant.exitCode}) :\n${journal()}`);
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {
      /* pas encore en écoute */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Le serveur de test ne répond pas sur ${base}/api/health :\n${journal()}`);
}

async function connecter(base: string): Promise<string> {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ADMIN),
  });
  const cookie = (r.headers.getSetCookie?.() ?? [])
    .map((s) => /^mn_session=([^;]+)/.exec(s)?.[1])
    .find(Boolean);
  if (!r.ok || !cookie) throw new Error(`Connexion du compte de test impossible : ${r.status} ${(await r.text()).slice(0, 200)}`);
  return cookie;
}

export default async function setup({ provide }: GlobalSetupContext) {
  provide("mnAdmin", ADMIN);
  if (!process.env.MN_CHROMIUM) {
    provide("mnBase", "");
    provide("mnToken", "");
    return;
  }
  const manque = [join(RACINE, "dist/index.html"), join(RACINE, "dist-server/server.mjs")].filter((f) => !existsSync(f));
  if (manque.length) {
    throw new Error(
      `Les tests navigateur servent l'app BÂTIE, et il manque : ${manque.map((f) => f.replace(RACINE + "/", "")).join(", ")}.\n` +
        "Lance d'abord : npm run build:all",
    );
  }

  const port = await portLibre();
  const donnees = mkdtempSync(join(tmpdir(), "mn-e2e-"));
  const base = `http://127.0.0.1:${port}`;
  let sortie = "";
  const enfant = spawn(process.execPath, [join(RACINE, "dist-server/server.mjs")], {
    cwd: RACINE,
    env: {
      ...process.env,
      MARIENOUR_PORT: String(port),
      MARIENOUR_HOST: "127.0.0.1",
      MARIENOUR_DATA_DIR: donnees,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      SESSION_SECRET: "e2e-secret-de-session",
      NOTIFY_EMAIL: ADMIN.email,
      SMTP_PASS: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const garder = (b: Buffer) => {
    sortie = (sortie + b.toString()).slice(-8000);
  };
  enfant.stdout?.on("data", garder);
  enfant.stderr?.on("data", garder);

  const arreter = async () => {
    if (enfant.exitCode === null) {
      enfant.kill("SIGTERM");
      await new Promise((r) => {
        const t = setTimeout(() => {
          enfant.kill("SIGKILL");
          r(null);
        }, 5000);
        enfant.once("exit", () => {
          clearTimeout(t);
          r(null);
        });
      });
    }
    rmSync(donnees, { recursive: true, force: true });
  };

  try {
    await attendreSante(base, enfant, () => sortie);
    const token = await connecter(base);
    const seme = await fetch(`${base}/api/onboarding/seed`, { method: "POST", headers: { cookie: `mn_session=${token}` } });
    if (!seme.ok) throw new Error(`Semis du contenu de démarrage impossible : ${seme.status}`);
    provide("mnBase", base);
    provide("mnToken", token);
  } catch (e) {
    await arreter();
    throw e;
  }

  return arreter;
}
