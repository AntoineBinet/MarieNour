import { Hono } from "hono";
import type { AppEnv } from "../types";
import { authenticate, clearSession, createSession, createUser, writeSessionCookie } from "../auth";
import { notifyAdminNewUser } from "../mailer";
import { now, slugifyHandle, str } from "../util";

const app = new Hono<AppEnv>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 200).trim().toLowerCase();
  const password = str(body.password, 200);
  const displayName = str(body.display_name, 60).trim();

  if (!EMAIL_RE.test(email)) return c.json({ error: "Email invalide" }, 400);
  if (password.length < 6) return c.json({ error: "Mot de passe trop court (min. 6 caractères)" }, 400);
  if (displayName.length < 1) return c.json({ error: "Indique ton prénom ou pseudo" }, 400);

  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return c.json({ error: "Un compte existe déjà avec cet email" }, 409);

  const isAdminEmail = email === (c.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const user = await createUser(c.env.DB, {
    email,
    password,
    display_name: displayName,
    role: isAdminEmail ? "admin" : "member",
  });

  const token = await createSession(c.env.DB, user.id, c.req.header("user-agent") ?? null);
  writeSessionCookie(c, token);

  // Prévient l'admin par e-mail (best effort : ne doit jamais bloquer ni faire
  // échouer l'inscription si l'envoi d'e-mails est indisponible/non configuré).
  try {
    await notifyAdminNewUser(c.env, {
      display_name: user.display_name,
      email: user.email ?? email,
      handle: user.handle,
    });
  } catch (err) {
    console.error("[auth] notification d'inscription échouée :", err);
  }

  return c.json({ user });
});

app.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 200).trim().toLowerCase();
  const password = str(body.password, 200);
  if (!email || !password) return c.json({ error: "Email et mot de passe requis" }, 400);

  const user = await authenticate(c, email, password);
  if (!user) return c.json({ error: "Identifiants incorrects" }, 401);

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
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);

  fields.push("updated_at = ?");
  values.push(now());
  values.push(user.id);
  await c.env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();

  const row = await c.env.DB.prepare(
    "SELECT id, email, display_name, handle, role, avatar_url, bio, accent, created_at FROM users WHERE id = ?",
  )
    .bind(user.id)
    .first();
  return c.json({ user: { ...row, email: (row as { email: string }).email } });
});

export default app;
