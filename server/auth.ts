import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Bindings } from "./types";
import type { Gender, PublicUser, Role, UserPrefs } from "@shared/types";
import { now, uid } from "./util";

const SESSION_COOKIE = "mn_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours
const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return toHex(digest);
}

/** Jeton aléatoire url-safe (hex) — utilisé pour l'activation d'e-mail. */
export function generateToken(bytes = 32): string {
  return randomToken(bytes);
}

/** Hash SHA-256 d'un jeton, à stocker en base (on ne garde jamais le jeton clair). */
export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ?? randomToken(16);
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return { hash: toHex(bits), salt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const { hash: candidate } = await hashPassword(password, salt);
  // Comparaison à temps quasi constant.
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  handle: string | null;
  role: Role;
  avatar_url: string | null;
  bio: string | null;
  accent: string;
  prefs: string | null;
  gender: Gender | null;
  created_at: number;
}

/** Parse le blob JSON des préférences en objet sûr (jamais d'exception). */
export function parsePrefs(raw: string | null | undefined): UserPrefs {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as UserPrefs) : {};
  } catch {
    return {};
  }
}

/* Valeurs autorisées pour les champs « énumérés » des préférences. */
const THEME_MODES = ["system", "light", "dark"];
const DESIGNS = ["default", "graphite", "editorial"];
const RADIUS = ["sharp", "soft", "round"];
const DENSITY = ["compact", "cozy", "comfortable"];
const FONTS = ["default", "serif", "sans", "rounded", "mono", "humanist"];
const BACKGROUNDS = ["default", "plain", "warm", "cool", "dawn", "mesh"];
const GREETINGS = ["time", "custom", "simple", "none"];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Fusionne des préférences entrantes avec les préférences existantes, en ne
 * gardant que des valeurs valides et bornées. Une valeur `null` efface le champ
 * (retour au défaut). Renvoie un objet propre prêt à être stocké en JSON.
 */
export function mergePrefs(existing: UserPrefs, incoming: unknown): UserPrefs {
  const out: UserPrefs = { ...existing };
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return out;
  const p = incoming as Record<string, unknown>;

  const setStr = (key: keyof UserPrefs, max: number) => {
    if (!(key in p)) return;
    const v = p[key];
    if (v === null || v === "") delete out[key];
    else if (typeof v === "string") (out as Record<string, unknown>)[key] = v.slice(0, max);
  };
  const setEnum = (key: keyof UserPrefs, allowed: string[]) => {
    if (!(key in p)) return;
    const v = p[key];
    if (v === null) delete out[key];
    else if (typeof v === "string" && allowed.includes(v)) (out as Record<string, unknown>)[key] = v;
  };
  const setBool = (key: keyof UserPrefs) => {
    if (!(key in p)) return;
    const v = p[key];
    if (v === null) delete out[key];
    else if (typeof v === "boolean") (out as Record<string, unknown>)[key] = v;
  };

  setStr("nickname", 40);
  setStr("greeting_custom", 120);
  setStr("greeting_emoji", 8);
  setEnum("design", DESIGNS);
  setEnum("theme_mode", THEME_MODES);
  setEnum("radius", RADIUS);
  setEnum("density", DENSITY);
  setEnum("font_display", FONTS);
  setEnum("font_body", FONTS);
  setEnum("background", BACKGROUNDS);
  setEnum("greeting_style", GREETINGS);
  setBool("contrast");
  setBool("reduce_motion");

  if ("accent_custom" in p) {
    const v = p.accent_custom;
    if (v === null || v === "") delete out.accent_custom;
    else if (typeof v === "string" && HEX_RE.test(v)) out.accent_custom = v.toLowerCase();
  }
  if ("font_scale" in p) {
    const v = p.font_scale;
    if (v === null) delete out.font_scale;
    else if (typeof v === "number" && isFinite(v)) out.font_scale = Math.min(1.3, Math.max(0.85, Math.round(v * 100) / 100));
  }
  return out;
}

export function toPublicUser(row: UserRow, includeEmail = false): PublicUser {
  return {
    id: row.id,
    email: includeEmail ? row.email : undefined,
    display_name: row.display_name,
    handle: row.handle,
    role: row.role,
    avatar_url: row.avatar_url,
    bio: row.bio,
    accent: row.accent,
    // Les préférences (dont le surnom) ne sont exposées qu'à soi-même.
    prefs: includeEmail ? parsePrefs(row.prefs) : {},
    gender: includeEmail ? row.gender ?? null : undefined,
    created_at: row.created_at,
  };
}

const USER_COLS = "id, email, display_name, handle, role, avatar_url, bio, accent, prefs, gender, created_at";
const USER_COLS_U = USER_COLS.split(", ")
  .map((c) => `u.${c}`)
  .join(", ");

export async function createSession(db: Bindings["DB"], userId: string, userAgent: string | null): Promise<string> {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const ts = now();
  await db
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
    .bind(id, userId, ts, ts + SESSION_TTL_MS, userAgent)
    .run();
  return token;
}

export function writeSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSession(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const id = await sha256Hex(token);
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Charge l'utilisateur courant depuis le cookie de session (ou null). */
export async function loadCurrentUser(c: Context<AppEnv>): Promise<PublicUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    `SELECT ${USER_COLS_U} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(id, now())
    .first<UserRow>();
  return row ? toPublicUser(row, true) : null;
}

/** Middleware : attache l'utilisateur courant à c.var.user (sans bloquer). */
export async function attachUser(c: Context<AppEnv>, next: Next) {
  c.set("user", await loadCurrentUser(c));
  await next();
}

/** Middleware : exige un utilisateur connecté. */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  if (!c.var.user) return c.json({ error: "Non authentifié" }, 401);
  await next();
}

/** Middleware : exige le rôle admin. */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (!c.var.user) return c.json({ error: "Non authentifié" }, 401);
  if (c.var.user.role !== "admin") return c.json({ error: "Réservé à l'admin" }, 403);
  await next();
}

export async function findUserByEmail(db: Bindings["DB"], email: string): Promise<UserRow | null> {
  return db.prepare(`SELECT ${USER_COLS}, password_hash, password_salt FROM users WHERE email = ?`).bind(email).first<UserRow>();
}

/**
 * Connexion. Gère le mot de passe maître admin (ADMIN_EMAIL/ADMIN_PASSWORD) :
 * crée/garantit le compte admin au premier login.
 */
export async function authenticate(
  c: Context<AppEnv>,
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const db = c.env.DB;
  const normEmail = email.trim().toLowerCase();
  const isAdminEmail = normEmail === (c.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const masterMatch = isAdminEmail && c.env.ADMIN_PASSWORD && password === c.env.ADMIN_PASSWORD;

  const row = await db
    .prepare(`SELECT ${USER_COLS}, password_hash, password_salt FROM users WHERE email = ?`)
    .bind(normEmail)
    .first<UserRow & { password_hash: string; password_salt: string }>();

  if (!row) {
    // Bootstrap admin au tout premier login avec le mot de passe maître.
    if (masterMatch) {
      const created = await createUser(db, {
        email: normEmail,
        display_name: "Antoine",
        password,
        role: "admin",
        email_verified: true, // le compte admin (propriétaire) n'a pas à se vérifier
      });
      return created;
    }
    return null;
  }

  if (masterMatch) {
    // Garantit le rôle admin pour le compte propriétaire.
    if (row.role !== "admin") {
      await db.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").bind(now(), row.id).run();
      row.role = "admin";
    }
    return toPublicUser(row, true);
  }

  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  return ok ? toPublicUser(row, true) : null;
}

export async function createUser(
  db: Bindings["DB"],
  params: {
    email: string;
    display_name: string;
    password: string;
    role?: Role;
    handle?: string;
    // Vérification d'e-mail (cf. migration 0007). Par défaut un compte est créé
    // NON vérifié ; les appelants qui n'ont pas besoin de vérification (bootstrap
    // admin) passent email_verified: true.
    email_verified?: boolean;
    verification_token_hash?: string | null;
    verification_expires?: number | null;
    // Personnalisation de départ (semée à l'inscription selon le profil).
    accent?: string;
    prefs?: UserPrefs;
    gender?: Gender | null;
  },
): Promise<PublicUser> {
  const { hash, salt } = await hashPassword(params.password);
  const id = uid();
  const ts = now();
  const handle = await ensureUniqueHandle(db, params.handle || params.display_name || params.email.split("@")[0]);
  const accent = params.accent ?? "terracotta";
  const prefs = params.prefs ?? {};
  const gender = params.gender ?? null;
  await db
    .prepare(
      `INSERT INTO users (id, email, display_name, handle, password_hash, password_salt, role, accent, prefs, gender,
         created_at, updated_at, email_verified, verification_token_hash, verification_expires)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.email.toLowerCase(),
      params.display_name,
      handle,
      hash,
      salt,
      params.role ?? "member",
      accent,
      JSON.stringify(prefs),
      gender,
      ts,
      ts,
      params.email_verified ? 1 : 0,
      params.verification_token_hash ?? null,
      params.verification_expires ?? null,
    )
    .run();
  return {
    id,
    email: params.email.toLowerCase(),
    display_name: params.display_name,
    handle,
    role: params.role ?? "member",
    avatar_url: null,
    bio: null,
    accent,
    prefs,
    gender,
    created_at: ts,
  };
}

async function ensureUniqueHandle(db: Bindings["DB"], base: string): Promise<string> {
  const { slugifyHandle } = await import("./util");
  let handle = slugifyHandle(base);
  let suffix = 0;
  // Quelques tentatives suffisent largement.
  for (let i = 0; i < 50; i++) {
    const candidate = suffix === 0 ? handle : `${handle}${suffix}`;
    const exists = await db.prepare("SELECT 1 FROM users WHERE handle = ?").bind(candidate).first();
    if (!exists) return candidate;
    suffix++;
  }
  return `${handle}${Math.floor(Math.random() * 100000)}`;
}
