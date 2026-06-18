// Envoi d'e-mail transactionnel — RUNTIME-AGNOSTIQUE.
//
// On passe par l'API HTTP de Resend (https://resend.com) via `fetch`. Aucun
// SMTP, aucune dépendance native : le même code marche sur la VM Oracle (Node)
// ET sur le repli serverless (Cloudflare Workers). Cf. CLAUDE.md : les routes
// ne doivent jamais introduire d'API spécifique à un runtime.
//
// Configuration (variables d'environnement, toutes optionnelles) :
//   RESEND_API_KEY  → clé API Resend. ABSENTE = e-mails désactivés (no-op).
//   MAIL_FROM       → expéditeur, ex. "MarieNour <hello@marienour.work>".
//                     Défaut : "MarieNour <onboarding@resend.dev>" (bac à sable).
// Le destinataire des notifications admin est ADMIN_EMAIL.
import type { Bindings } from "./types";

export interface MailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Envoie un e-mail. Best effort : ne lève jamais, renvoie `false` en cas d'échec
 * ou si l'envoi d'e-mails n'est pas configuré (RESEND_API_KEY absent).
 */
export async function sendMail(env: Bindings, msg: MailMessage): Promise<boolean> {
  const apiKey = (env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    console.log(`[mail] non configuré (RESEND_API_KEY absent) — e-mail « ${msg.subject} » ignoré`);
    return false;
  }
  const from = (env.MAIL_FROM || "").trim() || `${env.APP_NAME || "MarieNour"} <onboarding@resend.dev>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        ...(msg.html ? { html: msg.html } : {}),
        ...(msg.text ? { text: msg.text } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[mail] échec d'envoi (${res.status}) : ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[mail] erreur réseau :", err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/**
 * Prévient l'admin (ADMIN_EMAIL) qu'un nouvel utilisateur vient de s'inscrire.
 * No-op si ADMIN_EMAIL ou l'envoi d'e-mails ne sont pas configurés.
 */
export async function notifyAdminNewUser(
  env: Bindings,
  user: { display_name: string; email: string; handle: string | null },
): Promise<boolean> {
  const to = (env.ADMIN_EMAIL || "").trim();
  if (!to) return false;

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

  return sendMail(env, { to, subject, html, text });
}
