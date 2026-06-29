-- Abonnements Web Push (notifications même app fermée). Une ligne par appareil/
-- navigateur abonné. La clé VAPID est gérée côté runtime Node (data/vapid.json,
-- auto-générée) ; ici on ne stocke que les abonnements des navigateurs.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
