// Réglages du site stockés en base (table app_settings) — RUNTIME-AGNOSTIQUE.
//
// On ne stocke ici QUE des préférences non secrètes, modifiables par l'admin
// depuis l'app (destinataire des notifications, interrupteur « alerte à chaque
// inscription »…). Les secrets (mot de passe SMTP) restent des variables
// d'environnement du serveur (/etc/marienour/marienour.env), jamais en base.
//
// Chaque réglage a un repli : valeur en base → variable d'env → défaut codé.
import type { Bindings } from "./types";
import { now } from "./util";

/** Clés de réglages connues (stockées en TEXT). */
export type SettingKey = "notify_email" | "notify_on_signup" | "smtp_pass";

/** Réglages effectifs après fusion base ← env ← défaut. */
export interface EffectiveSettings {
  /** Destinataire des notifications (alerte à chaque inscription). */
  notify_email: string;
  /** Envoyer un e-mail à l'admin à chaque nouvelle inscription. */
  notify_on_signup: boolean;
}

function bool01(v: string | undefined | null, fallback: boolean): boolean {
  if (v == null || v === "") return fallback;
  return v === "1" || v === "true";
}

/** Lit toutes les valeurs persistées (clé → valeur brute). */
export async function readRawSettings(db: Bindings["DB"]): Promise<Record<string, string>> {
  try {
    const res = await db.prepare("SELECT key, value FROM app_settings").all<{ key: string; value: string }>();
    const out: Record<string, string> = {};
    for (const row of res.results ?? []) out[row.key] = row.value;
    return out;
  } catch {
    // Table absente (migration pas encore jouée / repli sans cette table) :
    // on retombe simplement sur les valeurs d'environnement.
    return {};
  }
}

/** Écrit (upsert) une valeur de réglage. */
export async function writeSetting(db: Bindings["DB"], key: SettingKey, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, now())
    .run();
}

/**
 * Réglages effectifs : valeur en base si présente, sinon variable d'env, sinon
 * défaut. Le destinataire des notifications retombe sur NOTIFY_EMAIL puis
 * ADMIN_EMAIL (= identifiant de connexion).
 */
export async function getEffectiveSettings(env: Bindings): Promise<EffectiveSettings> {
  const raw = await readRawSettings(env.DB);
  const notify_email = (raw.notify_email || env.NOTIFY_EMAIL || env.ADMIN_EMAIL || "").trim();
  const notify_on_signup = bool01(raw.notify_on_signup, true);
  return { notify_email, notify_on_signup };
}

/**
 * Mot de passe SMTP effectif : réglage `smtp_pass` posé depuis l'admin (en base)
 * en priorité, sinon la variable d'environnement SMTP_PASS du serveur. C'est le
 * SEUL secret stocké en base ; il n'est jamais renvoyé au client (cf. routes
 * admin) et data/ est hors arbre git.
 */
export async function getEffectiveSmtpPass(env: Bindings): Promise<string> {
  const raw = await readRawSettings(env.DB);
  return ((raw.smtp_pass || env.SMTP_PASS || "") as string).trim();
}

/** Indique si un mot de passe SMTP a été posé EN BASE (depuis l'admin). */
export async function isSmtpPassStoredInDb(db: Bindings["DB"]): Promise<boolean> {
  const raw = await readRawSettings(db);
  return Boolean((raw.smtp_pass || "").trim());
}
