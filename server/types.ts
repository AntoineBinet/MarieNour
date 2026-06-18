import type { PublicUser } from "@shared/types";
import type { Mailer } from "./mailer";

export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  APP_NAME: string;
  // Envoi d'e-mails (optionnel). Injecté par le runtime Node (SMTP/nodemailer) ;
  // absent sur le repli Cloudflare → e-mails désactivés. Cf. server/mailer.ts.
  MAILER?: Mailer;
}

export interface Variables {
  user: PublicUser | null;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
