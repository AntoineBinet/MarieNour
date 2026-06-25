import { Hono } from "hono";
import type { AppEnv } from "./types";
import { attachUser } from "./auth";

import authRoutes from "./routes/auth";
import friendsRoutes from "./routes/friends";
import widgetsRoutes from "./routes/widgets";
import listsRoutes from "./routes/lists";
import notesRoutes from "./routes/notes";
import tripsRoutes from "./routes/trips";
import recipesRoutes from "./routes/recipes";
import inspirationRoutes from "./routes/inspiration";
import mediaRoutes from "./routes/media";
import albumsRoutes from "./routes/albums";
import socialRoutes from "./routes/social";
import adminRoutes from "./routes/admin";
import expensesRoutes from "./routes/expenses";
import pollsRoutes from "./routes/polls";
import invitesRoutes from "./routes/invites";
import onboardingRoutes from "./routes/onboarding";
import financeRoutes from "./routes/finance";
import eventsRoutes from "./routes/events";
import notificationsRoutes from "./routes/notifications";
import filRoutes from "./routes/fil";
import assistantRoutes from "./routes/assistant";
import searchRoutes from "./routes/search";

export function createApp() {
  const app = new Hono<AppEnv>().basePath("/api");

  // Charge l'utilisateur courant pour toutes les routes.
  app.use("*", attachUser);

  app.get("/health", (c) => c.json({ ok: true, app: c.env.APP_NAME ?? "MarieNour" }));

  app.route("/auth", authRoutes);
  app.route("/friends", friendsRoutes);
  app.route("/widgets", widgetsRoutes);
  app.route("/lists", listsRoutes);
  app.route("/notes", notesRoutes);
  app.route("/trips", tripsRoutes);
  app.route("/recipes", recipesRoutes);
  app.route("/inspiration", inspirationRoutes);
  app.route("/media", mediaRoutes);
  app.route("/albums", albumsRoutes);
  app.route("/social", socialRoutes);
  app.route("/admin", adminRoutes);
  app.route("/expenses", expensesRoutes);
  app.route("/polls", pollsRoutes);
  app.route("/invites", invitesRoutes);
  app.route("/onboarding", onboardingRoutes);
  app.route("/finance", financeRoutes);
  app.route("/events", eventsRoutes);
  app.route("/notifications", notificationsRoutes);
  app.route("/fil", filRoutes);
  app.route("/assistant", assistantRoutes);
  app.route("/search", searchRoutes);

  app.notFound((c) => c.json({ error: "Route introuvable" }, 404));
  app.onError((err, c) => {
    console.error("API error:", err);
    return c.json({ error: "Erreur serveur" }, 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
