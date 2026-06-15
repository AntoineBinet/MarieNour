import { handle } from "hono/cloudflare-pages";
import { createApp } from "../../server/app";

// Toutes les requêtes /api/* passent par l'app Hono.
const app = createApp();

export const onRequest = handle(app);
