-- marienour — Notifications (cloche en haut de l'app)
-- Le flux de notifications est DÉRIVÉ des données existantes (demandes d'amis,
-- invitations à un voyage / événement, événements à venir) : on ne stocke donc
-- pas chaque notification. On persiste seulement les notifications « écartées »
-- par l'utilisateur (clic ou petite croix) afin qu'elles ne réapparaissent pas.
-- Rejoué automatiquement au démarrage de la VM (cf. server/adapters/d1.ts).

CREATE TABLE IF NOT EXISTS notification_dismissals (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notif_key  TEXT NOT NULL,          -- clé stable, ex. "friend:<id>" / "trip:<id>"
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, notif_key)
);

CREATE INDEX IF NOT EXISTS idx_notif_dismiss_user ON notification_dismissals(user_id);
