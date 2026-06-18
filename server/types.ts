import type { PublicUser } from "@shared/types";

export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  APP_NAME: string;
  // Envoi d'e-mails (optionnel) — cf. server/mailer.ts. Absent = e-mails off.
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

export interface Variables {
  user: PublicUser | null;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
