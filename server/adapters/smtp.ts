// Adaptateur d'envoi d'e-mail SMTP pour Node (VM Oracle) — implémente le
// contrat `Mailer` (cf. server/mailer.ts) au-dessus de nodemailer.
//
// Pensé pour Gmail par défaut (smtp.gmail.com:465), mais marche avec n'importe
// quel serveur SMTP. nodemailer utilise des API Node (net/tls) absentes des
// Workers : ce fichier est exclu du typecheck tsc (cf. tsconfig.server.json) et
// bundlé par esbuild en gardant nodemailer externe (--packages=external).
//
// ⚠️ Gmail : il faut un « mot de passe d'application » (16 caractères, généré
// après activation de la validation en 2 étapes), PAS le mot de passe du compte.
import nodemailer from "nodemailer";
import type { Mailer, MailMessage } from "../mailer";

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean; // true pour le port 465 (SSL), false pour 587 (STARTTLS)
  user: string;
  pass: string;
  from: string;
}

export function createSmtpMailer(opts: SmtpOptions): Mailer {
  const transport = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: { user: opts.user, pass: opts.pass },
  });

  return {
    async send(msg: MailMessage): Promise<boolean> {
      try {
        await transport.sendMail({
          from: opts.from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        });
        return true;
      } catch (err) {
        console.error("[mail] échec d'envoi SMTP :", err);
        return false;
      }
    },
  };
}
