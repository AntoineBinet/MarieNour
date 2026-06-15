-- marienour — schéma initial
-- D1 (SQLite). Visibilité commune aux contenus : 'private' | 'friends' | 'public'.

-- ── Utilisateurs & sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  handle        TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',  -- 'member' | 'admin'
  avatar_url    TEXT,
  bio           TEXT,
  accent        TEXT DEFAULT 'terracotta',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,        -- hash du jeton de session
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ── Amitiés (semi-social) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendships (
  id           TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'blocked'
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE(requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requester ON friendships(requester_id, status);

-- ── Dashboard à widgets (layout par utilisateur) ───────────────────────────
CREATE TABLE IF NOT EXISTS widgets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,           -- clé du widget (ex. 'lists', 'notes', 'trips'...)
  title      TEXT,
  config     TEXT,                    -- JSON: réglages spécifiques au widget
  size       TEXT NOT NULL DEFAULT 'md', -- 'sm' | 'md' | 'lg'
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_widgets_user ON widgets(user_id, position);

-- ── Productivité : listes / checklists ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS lists (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  emoji      TEXT DEFAULT '📝',
  color      TEXT DEFAULT 'sand',
  kind       TEXT NOT NULL DEFAULT 'checklist', -- 'checklist' | 'list'
  archived   INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'private',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id, archived, position);

CREATE TABLE IF NOT EXISTS list_items (
  id         TEXT PRIMARY KEY,
  list_id    TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  note       TEXT,
  done       INTEGER NOT NULL DEFAULT 0,
  due_date   TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id, position);

-- ── Notes & idées ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  body       TEXT,
  color      TEXT DEFAULT 'sand',
  pinned     INTEGER NOT NULL DEFAULT 0,
  tags       TEXT,                    -- JSON array
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, pinned, updated_at);

-- ── Voyages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  destination TEXT,
  start_date  TEXT,
  end_date    TEXT,
  cover_url   TEXT,
  notes       TEXT,
  budget      REAL,
  currency    TEXT DEFAULT 'EUR',
  visibility  TEXT NOT NULL DEFAULT 'private',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id, start_date);

CREATE TABLE IF NOT EXISTS trip_items (
  id        TEXT PRIMARY KEY,
  trip_id   TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_date  TEXT,                     -- 'YYYY-MM-DD' (NULL = idées / à caser)
  time      TEXT,                     -- 'HH:MM'
  title     TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'activity', -- activity|food|lodging|transport|note
  location  TEXT,
  url       TEXT,
  notes     TEXT,
  cost      REAL,
  done      INTEGER NOT NULL DEFAULT 0,
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_trip_items_trip ON trip_items(trip_id, day_date, position);

-- ── Recettes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  image_url    TEXT,
  servings     INTEGER,
  prep_minutes INTEGER,
  cook_minutes INTEGER,
  ingredients  TEXT,                  -- JSON array de chaînes
  steps        TEXT,                  -- JSON array de chaînes
  tags         TEXT,                  -- JSON array
  source_url   TEXT,
  favorite     INTEGER NOT NULL DEFAULT 0,
  visibility   TEXT NOT NULL DEFAULT 'private',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id, updated_at);

-- ── Inspiration : tableaux (moodboards) + items / enregistrés ──────────────
CREATE TABLE IF NOT EXISTS boards (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  cover_url   TEXT,
  visibility  TEXT NOT NULL DEFAULT 'private',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id, position);

CREATE TABLE IF NOT EXISTS inspirations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_id   TEXT REFERENCES boards(id) ON DELETE SET NULL,
  title      TEXT,
  url        TEXT,
  image_url  TEXT,
  note       TEXT,
  source     TEXT DEFAULT 'web',      -- instagram|tiktok|pinterest|web|...
  tags       TEXT,                    -- JSON array
  status     TEXT NOT NULL DEFAULT 'inbox', -- inbox|kept|done
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_insp_user ON inspirations(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_insp_board ON inspirations(board_id);

-- ── Médias (photos) stockés sur R2 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key       TEXT NOT NULL,
  filename     TEXT,
  content_type TEXT,
  size         INTEGER,
  caption      TEXT,
  visibility   TEXT NOT NULL DEFAULT 'private',
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_user ON media(user_id, created_at);

-- ── Social générique : likes & commentaires sur n'importe quel contenu ─────
CREATE TABLE IF NOT EXISTS likes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,          -- 'note'|'recipe'|'trip'|'board'|'inspiration'|'list'|'media'
  entity_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE(user_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_entity ON likes(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id, created_at);

-- ── Partage explicite avec un ami précis (en plus de la visibilité) ────────
CREATE TABLE IF NOT EXISTS shares (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  shared_with_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_edit       INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  UNIQUE(entity_type, entity_id, shared_with_id)
);
CREATE INDEX IF NOT EXISTS idx_shares_with ON shares(shared_with_id);
