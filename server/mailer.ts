// Composition des e-mails — RUNTIME-AGNOSTIQUE (aucune dépendance Node ici).
//
// L'ENVOI réel est délégué à un `Mailer` injecté par le runtime, exactement
// comme DB (D1/SQLite) et MEDIA (R2/fichiers) — cf. CLAUDE.md :
//   • VM Oracle (Node) → SMTP via nodemailer (server/adapters/smtp.ts),
//     configuré pour Gmail par défaut.
//   • Repli Cloudflare Workers → pas de SMTP possible : MAILER absent, l'e-mail
//     est simplement ignoré (l'app continue de fonctionner).
import type { Bindings } from "./types";
import { getEffectiveSettings, getEffectiveSmtpPass } from "./settings";

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
 * Prévient l'admin qu'un nouvel utilisateur vient de s'inscrire. Le destinataire
 * et l'interrupteur viennent des réglages in-app (table app_settings), avec
 * repli sur NOTIFY_EMAIL puis ADMIN_EMAIL — ainsi l'alerte part vers la boîte
 * Gmail sans dépendre du compte de connexion admin. No-op si l'alerte est
 * désactivée, si aucun destinataire, ou si l'envoi (MAILER) n'est pas configuré.
 */
export async function notifyAdminNewUser(
  env: Bindings,
  user: { display_name: string; email: string; handle: string | null },
): Promise<boolean> {
  const settings = await getEffectiveSettings(env);
  if (!settings.notify_on_signup) return false;
  const to = settings.notify_email;
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

/**
 * Envoie un e-mail de test au destinataire donné, pour vérifier que la config
 * SMTP fonctionne de bout en bout. Renvoie un message d'erreur explicite si
 * l'envoi est impossible (utile pour l'écran de réglages admin).
 */
export async function sendTestEmail(
  env: Bindings,
  to: string,
): Promise<{ ok: boolean; error?: string }> {
  const target = (to || "").trim();
  if (!target) return { ok: false, error: "Aucun destinataire renseigné" };
  if (!env.MAILER) {
    return { ok: false, error: "Envoi d'e-mails indisponible sur cet hébergement." };
  }
  const pass = await getEffectiveSmtpPass(env);
  if (!pass) {
    return {
      ok: false,
      error: "Le mot de passe SMTP n'est pas encore renseigné. Saisis-le ci-dessus puis enregistre, et réessaie.",
    };
  }

  const appName = env.APP_NAME || "MarieNour";
  const when = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
  const subject = `Test e-mail — ${appName}`;
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#1f2937">` +
    `<h2 style="margin:0 0 12px">Ça marche&nbsp;! ✅</h2>` +
    `<p style="margin:0 0 8px">Cet e-mail de test confirme que l'envoi SMTP de <strong>${escapeHtml(appName)}</strong> fonctionne.</p>` +
    `<p style="margin:0;color:#6b7280">Envoyé le ${escapeHtml(when)}.</p>` +
    `</div>`;
  const text =
    `Ça marche !\n\nCet e-mail de test confirme que l'envoi SMTP de ${appName} fonctionne.\nEnvoyé le ${when}.\n`;

  const sent = await env.MAILER.send({ to: target, subject, html, text });
  return sent ? { ok: true } : { ok: false, error: "L'envoi SMTP a échoué (voir les logs du serveur)." };
}
