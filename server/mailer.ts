// Composition des e-mails — RUNTIME-AGNOSTIQUE (aucune dépendance Node ici).
//
// L'ENVOI réel est délégué à un `Mailer` injecté par le runtime, exactement
// comme DB (D1/SQLite) et MEDIA (R2/fichiers) — cf. CLAUDE.md :
//   • VM Oracle (Node) → SMTP via nodemailer (server/adapters/smtp.ts),
//     configuré pour Gmail par défaut.
//   • Repli Cloudflare Workers → pas de SMTP possible : MAILER absent, l'e-mail
//     est simplement ignoré (l'app continue de fonctionner).
import type { Bindings } from "./types";

export interface MailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/** Adaptateur d'envoi d'e-mail. Implémentation fournie par le runtime. */
export interface Mailer {
  /** Envoie un message. Best effort : ne lève pas, renvoie false en cas d'échec. */
  send(msg: MailMessage): Promise<boolean>;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/**
 * Prévient l'admin (ADMIN_EMAIL) qu'un nouvel utilisateur vient de s'inscrire.
 * No-op si ADMIN_EMAIL ou l'envoi d'e-mails (MAILER) ne sont pas configurés.
 */
export async function notifyAdminNewUser(
  env: Bindings,
  user: { display_name: string; email: string; handle: string | null },
): Promise<boolean> {
  const to = (env.ADMIN_EMAIL || "").trim();
  if (!to) return false;
  if (!env.MAILER) {
    console.log("[mail] non configuré (pas de MAILER / SMTP) — inscription non notifiée par e-mail");
    return false;
  }

  const appName = env.APP_NAME || "MarieNour";
  const name = escapeHtml(user.display_name);
  const email = escapeHtml(user.email);
  const handle = user.handle ? `@${escapeHtml(user.handle)}` : "—";
  const when = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

  const subject = `Nouvelle inscription sur ${appName} : ${user.display_name}`;
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#1f2937">` +
    `<h2 style="margin:0 0 12px">Nouvelle inscription sur ${escapeHtml(appName)}</h2>` +
    `<p style="margin:0 0 16px">Un nouvel utilisateur vient de créer un compte :</p>` +
    `<table style="border-collapse:collapse">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Nom</td><td style="padding:4px 0"><strong>${name}</strong></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">E-mail</td><td style="padding:4px 0">${email}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Identifiant</td><td style="padding:4px 0">${handle}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Date</td><td style="padding:4px 0">${escapeHtml(when)}</td></tr>` +
    `</table>` +
    `</div>`;
  const text =
    `Nouvelle inscription sur ${appName}\n\n` +
    `Nom : ${user.display_name}\n` +
    `E-mail : ${user.email}\n` +
    `Identifiant : ${user.handle ? `@${user.handle}` : "—"}\n` +
    `Date : ${when}\n`;

  return env.MAILER.send({ to, subject, html, text });
}
