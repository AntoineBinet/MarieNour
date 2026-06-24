import { Hono } from "hono";
import type { Gender, UserPrefs } from "@shared/types";
import type { AppEnv } from "../types";
import {
  authenticate,
  clearSession,
  createSession,
  createUser,
  generateToken,
  hashToken,
  mergePrefs,
  parsePrefs,
  toPublicUser,
  writeSessionCookie,
} from "../auth";
import { notifyAdminNewUser, sendVerificationEmail, smtpReady } from "../mailer";
import { now, slugifyHandle, str } from "../util";

const VERIFY_TTL_MS = 1000 * 60 * 60 * 24; // 24 h

/** Base URL publique (https://marienour.work) déduite de la requête. */
function appOrigin(reqUrl: string): string {
  try {
    return new URL(reqUrl).origin;
  } catch {
    return "";
  }
}

const app = new Hono<AppEnv>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise le sexe optionnel reçu à l'inscription/édition de profil. */
function parseGender(v: unknown): Gender | null {
  return v === "female" || v === "male" || v === "other" ? v : null;
}

/**
 * Personnalisation de départ proposée selon le profil. Choix purement cosmétique
 * et entièrement réversible depuis les réglages : on pose simplement un « style »
 * coordonné par défaut (ex. plus net/sombre/structuré, dans l'esprit des codes
 * 2026), que la personne peut changer à tout moment. L'interface ne mentionne
 * jamais de genre.
 */
function seedAppearance(gender: Gender | null): { accent?: string; prefs?: UserPrefs } {
  if (gender === "male") {
    return { accent: "slate", prefs: { design: "graphite", theme_mode: "dark" } };
  }
  return {};
}

app.post("/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 200).trim().toLowerCase();
  const password = str(body.password, 200);
  const displayName = str(body.display_name, 60).trim();
  const gender = parseGender(body.gender);

  if (!EMAIL_RE.test(email)) return c.json({ error: "Email invalide" }, 400);
  if (password.length < 6) return c.json({ error: "Mot de passe trop court (min. 6 caractères)" }, 400);
  if (displayName.length < 1) return c.json({ error: "Indique ton prénom ou pseudo" }, 400);

  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return c.json({ error: "Un compte existe déjà avec cet email" }, 409);

  const seed = seedAppearance(gender);
  const isAdminEmail = email === (c.env.ADMIN_EMAIL || "").trim().toLowerCase();

  // Le compte propriétaire (ADMIN_EMAIL) est créé vérifié et connecté direct :
  // pas de friction de vérification pour l'admin (qui passe d'ordinaire par le
  // mot de passe maître). Les membres, eux, doivent valider leur e-mail.
  if (isAdminEmail) {
    const admin = await createUser(c.env.DB, {
      email,
      password,
      display_name: displayName,
      role: "admin",
      email_verified: true,
      gender,
      ...seed,
    });
    const token = await createSession(c.env.DB, admin.id, c.req.header("user-agent") ?? null);
    writeSessionCookie(c, token);
    return c.json({ user: admin });
  }

  // Vérification d'e-mail OBLIGATOIRE (mode strict) : sans SMTP exploitable, le
  // lien d'activation ne pourrait jamais partir → on refuse proprement plutôt
  // que de créer un compte impossible à activer.
  if (!(await smtpReady(c.env))) {
    return c.json(
      { error: "Les inscriptions sont momentanément indisponibles (envoi d'e-mails non configuré). Réessaie plus tard." },
      503,
    );
  }

  const rawToken = generateToken();
  const tokenHash = await hashToken(rawToken);
  const user = await createUser(c.env.DB, {
    email,
    password,
    display_name: displayName,
    role: "member",
    email_verified: false,
    verification_token_hash: tokenHash,
    verification_expires: now() + VERIFY_TTL_MS,
    gender,
    ...seed,
  });

  const verifyUrl = `${appOrigin(c.req.url)}/api/auth/verify-email/${rawToken}`;
  const sent = await sendVerificationEmail(c.env, { to: email, name: displayName, url: verifyUrl }).catch(() => false);
  if (!sent) {
    // Envoi en échec → on annule la création : pas de compte fantôme non
    // activable, et l'e-mail redevient disponible pour réessayer.
    await c.env.DB.prepare("DELETE FROM users WHERE id = ? AND email_verified = 0").bind(user.id).run();
    return c.json({ error: "Impossible d'envoyer l'e-mail d'activation pour le moment. Réessaie dans quelques minutes." }, 502);
  }

  // Prévient l'admin par e-mail (best effort : ne doit jamais bloquer).
  try {
    await notifyAdminNewUser(c.env, {
      display_name: user.display_name,
      email: user.email ?? email,
      handle: user.handle,
    });
  } catch (err) {
    console.error("[auth] notification d'inscription échouée :", err);
  }

  // Pas de session : le compte n'est activable qu'après clic sur le lien.
  return c.json({ pending: true });
});

// Activation du compte via le lien reçu par e-mail. Redirige vers le SPA.
app.get("/verify-email/:token", async (c) => {
  const token = c.req.param("token");
  if (!token || token.length > 128) return c.redirect("/login?error=invalid_token");
  const tokenHash = await hashToken(token);
  const row = await c.env.DB.prepare(
    "SELECT id FROM users WHERE verification_token_hash = ? AND email_verified = 0 AND verification_expires > ?",
  )
    .bind(tokenHash, now())
    .first<{ id: string }>();
  if (!row) return c.redirect("/login?error=invalid_token");
  await c.env.DB.prepare(
    "UPDATE users SET email_verified = 1, verification_token_hash = NULL, verification_expires = NULL, updated_at = ? WHERE id = ?",
  )
    .bind(now(), row.id)
    .run();
  return c.redirect("/login?verified=1");
});

// Renvoi du lien d'activation. Réponse toujours « ok » (anti-énumération) :
// on ne révèle pas si l'e-mail correspond à un compte.
app.post("/resend-verification", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 200).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return c.json({ error: "Email invalide" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT id, display_name FROM users WHERE email = ? AND email_verified = 0",
  )
    .bind(email)
    .first<{ id: string; display_name: string }>();

  if (row && (await smtpReady(c.env))) {
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    await c.env.DB.prepare(
      "UPDATE users SET verification_token_hash = ?, verification_expires = ?, updated_at = ? WHERE id = ?",
    )
      .bind(tokenHash, now() + VERIFY_TTL_MS, now(), row.id)
      .run();
    const verifyUrl = `${appOrigin(c.req.url)}/api/auth/verify-email/${rawToken}`;
    await sendVerificationEmail(c.env, { to: email, name: row.display_name, url: verifyUrl }).catch(() => false);
  }
  return c.json({ ok: true });
});

app.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 200).trim().toLowerCase();
  const password = str(body.password, 200);
  if (!email || !password) return c.json({ error: "Email et mot de passe requis" }, 400);

  const user = await authenticate(c, email, password);
  if (!user) return c.json({ error: "Identifiants incorrects" }, 401);

  // Vérification d'e-mail obligatoire pour les membres (l'admin en est exempt).
  if (user.role !== "admin") {
    const row = await c.env.DB.prepare("SELECT email_verified FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ email_verified: number }>();
    if (row && !row.email_verified) {
      return c.json(
        {
          error: "Compte non activé — clique sur le lien reçu par e-mail pour l'activer (pense à vérifier tes spams).",
          code: "email_not_verified",
        },
        403,
      );
    }
  }

  const token = await createSession(c.env.DB, user.id, c.req.header("user-agent") ?? null);
  writeSessionCookie(c, token);
  return c.json({ user });
});

app.post("/logout", async (c) => {
  await clearSession(c);
  return c.json({ ok: true });
});

app.get("/me", (c) => c.json({ user: c.var.user }));

app.patch("/me", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "Non authentifié" }, 401);
  const body = await c.req.json().catch(() => ({}));

  const fields: string[] = [];
  const values: unknown[] = [];

  // E-mail : modifiable, mais validé et unique (insensible à la casse).
  if (typeof body.email === "string") {
    const email = str(body.email, 200).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return c.json({ error: "Email invalide" }, 400);
    const clash = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ? AND id <> ?").bind(email, user.id).first();
    if (clash) return c.json({ error: "Un compte existe déjà avec cet email" }, 409);
    fields.push("email = ?");
    values.push(email);
  }

  // Pseudo (handle) : normalisé en slug, non vide, unique.
  if (typeof body.handle === "string") {
    const handle = slugifyHandle(body.handle);
    if (!handle) return c.json({ error: "Pseudo invalide" }, 400);
    const clash = await c.env.DB.prepare("SELECT 1 FROM users WHERE handle = ? AND id <> ?").bind(handle, user.id).first();
    if (clash) return c.json({ error: "Ce pseudo est déjà pris" }, 409);
    fields.push("handle = ?");
    values.push(handle);
  }

  if (typeof body.display_name === "string" && body.display_name.trim()) {
    fields.push("display_name = ?");
    values.push(str(body.display_name, 60).trim());
  }
  if (typeof body.bio === "string") {
    fields.push("bio = ?");
    values.push(str(body.bio, 500));
  }
  if (typeof body.avatar_url === "string") {
    fields.push("avatar_url = ?");
    values.push(str(body.avatar_url, 1000));
  }
  if (typeof body.accent === "string") {
    fields.push("accent = ?");
    values.push(str(body.accent, 40));
  }

  // Sexe : modifiable depuis le profil. N'altère PAS le style en place — c'est
  // juste une donnée de profil (le style reste piloté par les réglages).
  if (typeof body.gender === "string" || body.gender === null) {
    fields.push("gender = ?");
    values.push(parseGender(body.gender));
  }

  // Préférences d'apparence & d'accueil : fusionnées avec l'existant (un champ
  // absent reste inchangé ; un champ à `null` revient au défaut). Tout est
  // validé/borné par mergePrefs.
  if (body.prefs && typeof body.prefs === "object") {
    const current = await c.env.DB.prepare("SELECT prefs FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ prefs: string | null }>();
    const merged = mergePrefs(parsePrefs(current?.prefs), body.prefs);
    fields.push("prefs = ?");
    values.push(JSON.stringify(merged));
  }

  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);

  fields.push("updated_at = ?");
  values.push(now());
  values.push(user.id);
  await c.env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();

  const row = await c.env.DB.prepare(
    "SELECT id, email, display_name, handle, role, avatar_url, bio, accent, prefs, gender, created_at FROM users WHERE id = ?",
  )
    .bind(user.id)
    .first();
  return c.json({ user: toPublicUser(row as any, true) });
});

export default app;
