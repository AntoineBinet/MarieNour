import type { PublicUser } from "@shared/types";
import type { Mailer } from "./mailer";

export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  APP_NAME: string;
  // Destinataire des notifications (alerte admin à chaque inscription). Distinct
  // de ADMIN_EMAIL (= identifiant de connexion) : permet d'envoyer les alertes
  // vers binet.antoine2@gmail.com sans toucher au compte admin. Repli sur
  // ADMIN_EMAIL si absent. Cf. server/mailer.ts.
  NOTIFY_EMAIL?: string;
  // Envoi d'e-mails (optionnel). Injecté par le runtime Node (SMTP/nodemailer) ;
  // absent sur le repli Cloudflare → e-mails désactivés. Cf. server/mailer.ts.
  MAILER?: Mailer;
}

export interface Variables {
  user: PublicUser | null;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
