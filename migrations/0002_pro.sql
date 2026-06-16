-- marienour — MAJ « professionnalisation »
-- Dépenses partagées (type Tricount), sondages, participants & invités de
-- voyage, invitations par QR code, onboarding. Rejoué automatiquement au
-- démarrage sur la VM (runner de migrations, cf. server/adapters/d1.ts).

-- ── Onboarding (contenu de démarrage déjà proposé ?) ───────────────────────
ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0;

-- ── Voyages : type + couleur d'accent ──────────────────────────────────────
-- kind : 'trip' (voyage) | 'roadtrip' | 'weekend' | 'solo'
ALTER TABLE trips ADD COLUMN kind TEXT NOT NULL DEFAULT 'trip';

-- ── Invitations génériques (alimentent les QR codes) ───────────────────────
-- kind : 'friend' (ajout d'ami) | 'trip' (rejoindre un voyage) | 'group' (dépenses)
CREATE TABLE IF NOT EXISTS invites (
  id         TEXT PRIMARY KEY,
  token      TEXT NOT NULL UNIQUE,        -- code court porté par l'URL / le QR
  kind       TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  TEXT,                        -- trip_id / group_id selon kind (NULL pour 'friend')
  member_id  TEXT,                        -- participant/membre « invité » à réclamer (optionnel)
  label      TEXT,
  max_uses   INTEGER,                     -- NULL = illimité
  uses       INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_creator ON invites(created_by, kind);

-- ── Sondages (section « Amis ») ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS polls (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  multi      INTEGER NOT NULL DEFAULT 0,  -- choix multiples autorisés
  closes_at  INTEGER,
  visibility TEXT NOT NULL DEFAULT 'friends',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_polls_user ON polls(user_id, created_at);

CREATE TABLE IF NOT EXISTS poll_options (
  id       TEXT PRIMARY KEY,
  poll_id  TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id, position);

CREATE TABLE IF NOT EXISTS poll_votes (
  id         TEXT PRIMARY KEY,
  poll_id    TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id  TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(poll_id, option_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

-- ── Participants de voyage (inscrits OU invités sans compte) ───────────────
CREATE TABLE IF NOT EXISTS trip_participants (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL = invité hors-app
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'traveller',  -- owner | editor | traveller
  color      TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(trip_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_trip_part_trip ON trip_participants(trip_id);

-- Votes sur les étapes / idées d'un voyage (le groupe décide ensemble)
CREATE TABLE IF NOT EXISTS trip_item_votes (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES trip_items(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_trip_item_votes ON trip_item_votes(item_id);

-- ── Dépenses partagées (type Tricount) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_groups (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  icon       TEXT DEFAULT 'wallet',
  currency   TEXT NOT NULL DEFAULT 'EUR',
  trip_id    TEXT REFERENCES trips(id) ON DELETE SET NULL,  -- lien optionnel à un voyage
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_egroups_owner ON expense_groups(owner_id, archived);
CREATE INDEX IF NOT EXISTS idx_egroups_trip ON expense_groups(trip_id);

CREATE TABLE IF NOT EXISTS expense_members (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL = participant sans compte
  name       TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 1,     -- parts par défaut (foyer, etc.)
  created_at INTEGER NOT NULL,
  UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_emembers_group ON expense_members(group_id);

CREATE TABLE IF NOT EXISTS expenses (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
  payer_id   TEXT NOT NULL REFERENCES expense_members(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  amount     REAL NOT NULL,               -- montant total
  category   TEXT DEFAULT 'other',
  split_mode TEXT NOT NULL DEFAULT 'equal',  -- equal | shares | amounts
  spent_at   TEXT,                        -- 'YYYY-MM-DD'
  note       TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id, spent_at);

-- Part de chaque membre dans une dépense (montant dû)
CREATE TABLE IF NOT EXISTS expense_shares (
  id         TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES expense_members(id) ON DELETE CASCADE,
  amount     REAL NOT NULL,
  UNIQUE(expense_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_eshares_expense ON expense_shares(expense_id);

-- Remboursements enregistrés (« j'ai rendu X à Y »)
CREATE TABLE IF NOT EXISTS settlements (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
  from_id    TEXT NOT NULL REFERENCES expense_members(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES expense_members(id) ON DELETE CASCADE,
  amount     REAL NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
