-- marienour — Planification d'événements (week-end, EVG/EVJF, soirée, anniv…)
-- Section complète et semi-sociale : un organisateur, des invités (inscrits ou
-- non), un système de RSVP, un sondage de dates (façon Doodle), des tâches
-- assignables, un programme/itinéraire, une liste « qui apporte quoi », et un
-- lien optionnel vers un Tricount. Rejoué automatiquement au démarrage de la VM
-- (runner de migrations, cf. server/adapters/d1.ts).

-- ── Événement ──────────────────────────────────────────────────────────────
-- kind   : weekend | evg | evjf | party | birthday | dinner | aperitif | wedding | trip | other
-- status : planning (en préparation) | confirmed (confirmé) | cancelled | done
CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- organisateur
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'party',
  description   TEXT,
  location      TEXT,            -- nom du lieu ("Chez Marie", "Le Perchoir"…)
  address       TEXT,            -- adresse complète éventuelle
  start_date    TEXT,            -- 'YYYY-MM-DD' (NULL tant que la date n'est pas fixée)
  start_time    TEXT,            -- 'HH:MM'
  end_date      TEXT,
  end_time      TEXT,
  cover_url     TEXT,
  budget        REAL,
  currency      TEXT DEFAULT 'EUR',
  capacity      INTEGER,         -- nb max d'invités attendus (NULL = illimité)
  rsvp_deadline TEXT,            -- 'YYYY-MM-DD' (date limite de réponse)
  status        TEXT NOT NULL DEFAULT 'planning',
  date_decided  INTEGER NOT NULL DEFAULT 0,  -- la date est-elle figée (sondage clos) ?
  visibility    TEXT NOT NULL DEFAULT 'private',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, start_date);

-- ── Invités (inscrits OU invités sans compte) + RSVP ───────────────────────
-- role : owner (organisateur) | cohost (co-organisateur) | guest
-- rsvp : pending | yes | no | maybe
CREATE TABLE IF NOT EXISTS event_guests (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL = invité hors-app
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'guest',
  rsvp       TEXT NOT NULL DEFAULT 'pending',
  plus_ones  INTEGER NOT NULL DEFAULT 0,    -- accompagnants (+1, +2…)
  note       TEXT,                          -- mot de l'invité (allergie, horaire…)
  color      TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_guests_event ON event_guests(event_id);

-- ── Sondage de dates (disponibilités, façon Doodle) ────────────────────────
CREATE TABLE IF NOT EXISTS event_date_options (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day_date   TEXT NOT NULL,    -- 'YYYY-MM-DD'
  start_time TEXT,             -- 'HH:MM' (optionnel)
  end_time   TEXT,
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_event_date_opts ON event_date_options(event_id, position);

-- vote : yes (dispo) | maybe (si besoin) | no (pas dispo)
CREATE TABLE IF NOT EXISTS event_date_votes (
  id         TEXT PRIMARY KEY,
  option_id  TEXT NOT NULL REFERENCES event_date_options(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote       TEXT NOT NULL DEFAULT 'yes',
  created_at INTEGER NOT NULL,
  UNIQUE(option_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_date_votes ON event_date_votes(option_id);

-- ── Tâches assignables (qui fait quoi) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_tasks (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  assignee_id TEXT REFERENCES event_guests(id) ON DELETE SET NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  due_date    TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_tasks ON event_tasks(event_id, position);

-- ── Programme / itinéraire de l'événement ──────────────────────────────────
-- kind : activity | food | transport | break | other
CREATE TABLE IF NOT EXISTS event_items (
  id        TEXT PRIMARY KEY,
  event_id  TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day_date  TEXT,             -- 'YYYY-MM-DD' (NULL = non daté)
  time      TEXT,             -- 'HH:MM'
  title     TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'activity',
  location  TEXT,
  notes     TEXT,
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_event_items ON event_items(event_id, day_date, position);

-- ── « Qui apporte quoi » (potluck / matériel) ──────────────────────────────
-- category : food | drink | material | other
CREATE TABLE IF NOT EXISTS event_bring (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  qty_needed INTEGER NOT NULL DEFAULT 1,
  category   TEXT NOT NULL DEFAULT 'other',
  claimed_by TEXT REFERENCES event_guests(id) ON DELETE SET NULL,  -- qui s'en charge
  note       TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_bring ON event_bring(event_id, position);

-- ── Lien optionnel vers un groupe de dépenses (Tricount) ───────────────────
ALTER TABLE expense_groups ADD COLUMN event_id TEXT REFERENCES events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_egroups_event ON expense_groups(event_id);
