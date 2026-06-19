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
 * Indique si l'envoi d'e-mails est RÉELLEMENT possible : un runtime capable
 * (MAILER présent → VM Node) ET un mot de passe SMTP disponible (réglage admin
 * en base ou variable d'env). Sert à bloquer proprement l'inscription quand la
 * vérification d'e-mail ne pourrait pas aboutir.
 */
export async function smtpReady(env: Bindings): Promise<boolean> {
  if (!env.MAILER) return false;
  const pass = await getEffectiveSmtpPass(env);
  return pass.length > 0;
}

/**
 * Envoie l'e-mail d'activation de compte (vérification d'adresse). Best effort :
 * renvoie false si l'envoi échoue (l'appelant décide quoi faire — ici on annule
 * l'inscription pour ne pas laisser de compte fantôme non activable).
 */
export async function sendVerificationEmail(
  env: Bindings,
  params: { to: string; name: string; url: string },
): Promise<boolean> {
  if (!env.MAILER) return false;
  const appName = env.APP_NAME || "MarieNour";
  const name = escapeHtml(params.name || "");
  const url = params.url; // construite côté serveur, non issue de l'utilisateur
  const subject = `Active ton compte ${appName}`;
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#1f2937">` +
    `<h2 style="margin:0 0 12px">Bienvenue sur ${escapeHtml(appName)}${name ? `, ${name}` : ""}&nbsp;!</h2>` +
    `<p style="margin:0 0 16px">Ton compte a bien été créé. Clique sur le bouton ci-dessous pour l'activer&nbsp;:</p>` +
    `<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;background:#c06b4f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Activer mon compte</a></p>` +
    `<p style="margin:0 0 6px;color:#6b7280">Ou copie ce lien dans ton navigateur&nbsp;:</p>` +
    `<p style="margin:0 0 16px;word-break:break-all"><a href="${url}">${url}</a></p>` +
    `<p style="margin:0;color:#6b7280;font-size:13px">Le lien expire dans 24&nbsp;h. Si tu n'es pas à l'origine de cette inscription, ignore cet e-mail.</p>` +
    `</div>`;
  const text =
    `Bienvenue sur ${appName}${params.name ? `, ${params.name}` : ""} !\n\n` +
    `Active ton compte en ouvrant ce lien (valable 24 h) :\n${url}\n\n` +
    `Si tu n'es pas à l'origine de cette inscription, ignore cet e-mail.\n`;
  return env.MAILER.send({ to: params.to, subject, html, text });
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
