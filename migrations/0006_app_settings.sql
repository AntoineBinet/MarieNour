-- marienour — Réglages du site (clé/valeur, modifiables par l'admin in-app)
-- Stocke uniquement des préférences NON SECRÈTES (destinataire des
-- notifications, interrupteurs…). Les secrets (mot de passe SMTP) restent
-- dans /etc/marienour/marienour.env, jamais en base. Cf. CLAUDE.md.
-- Rejoué automatiquement au démarrage de la VM (cf. server/adapters/d1.ts).

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
