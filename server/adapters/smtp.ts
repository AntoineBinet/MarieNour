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
  from: string;
  // Le mot de passe est résolu À L'ENVOI (et non au démarrage) : il peut venir
  // de la variable d'env SMTP_PASS ou du réglage posé depuis l'admin (en base).
  // Ainsi, le changer dans l'app prend effet sans redémarrer le service.
  getPass: () => Promise<string>;
}

export function createSmtpMailer(opts: SmtpOptions): Mailer {
  // On garde le transport en cache et on ne le recrée que si le mot de passe a
  // changé (low volume : ne pas multiplier les connexions SMTP).
  let cachedPass = "";
  let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

  return {
    async send(msg: MailMessage): Promise<boolean> {
      let pass = "";
      try {
        pass = await opts.getPass();
      } catch (err) {
        console.error("[mail] impossible de lire le mot de passe SMTP :", err);
        return false;
      }
      if (!pass) {
        console.log("[mail] mot de passe SMTP absent — e-mail non envoyé");
        return false;
      }
      if (!transport || pass !== cachedPass) {
        transport = nodemailer.createTransport({
          host: opts.host,
          port: opts.port,
          secure: opts.secure,
          auth: { user: opts.user, pass },
        });
        cachedPass = pass;
      }
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
