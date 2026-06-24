-- marienour — « Mon fil » : souvenirs (photos, vidéos, liens réseaux sociaux),
-- organisés en collections au partage choisi (privé / amis / amis précis / public),
-- avec récap hebdomadaire en mode « stories ».
--
-- Visibilité d'une collection : 'private' | 'friends' | 'custom' | 'public'.
--   • private : moi seul·e
--   • friends : tous mes amis acceptés
--   • custom  : seulement les amis listés dans memory_collection_members
--   • public  : tout le monde (membre connecté)

-- ── Collections de souvenirs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_collections (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  cover_url   TEXT,                       -- URL de couverture (sinon dérivée du dernier souvenir)
  accent      TEXT NOT NULL DEFAULT 'terracotta',
  visibility  TEXT NOT NULL DEFAULT 'private', -- private|friends|custom|public
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcoll_user ON memory_collections(user_id, position);

-- ── Amis autorisés sur une collection « custom » ───────────────────────────
CREATE TABLE IF NOT EXISTS memory_collection_members (
  collection_id TEXT NOT NULL REFERENCES memory_collections(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (collection_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mcoll_member_user ON memory_collection_members(user_id);

-- ── Souvenirs ──────────────────────────────────────────────────────────────
-- kind : 'photo' (image R2) | 'video' (vidéo R2) | 'link' (lien externe) | 'text'
CREATE TABLE IF NOT EXISTS memories (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL REFERENCES memory_collections(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'photo',
  caption       TEXT,
  -- média importé (photo/vidéo) stocké sur R2
  r2_key        TEXT,
  content_type  TEXT,
  size          INTEGER,
  -- lien externe (vidéo / post réseau social / page web)
  url           TEXT,
  link_title    TEXT,
  link_image    TEXT,                      -- vignette/aperçu (URL absolue)
  link_provider TEXT,                      -- youtube|tiktok|instagram|pinterest|spotify|web…
  taken_at      INTEGER NOT NULL,          -- quand le souvenir « a eu lieu » (def = created_at)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_coll ON memories(collection_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id, taken_at);
