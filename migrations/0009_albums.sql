-- Albums photo + partage d'albums.
--
-- Un album regroupe des photos (table media). Un même média peut appartenir à
-- plusieurs albums (table de liaison album_media). Le partage explicite d'un
-- album à un ami précis réutilise la table générique `shares`
-- (entity_type = 'album'). La visibilité (private/friends/public) reste portée
-- par l'album lui-même, comme les autres contenus.

CREATE TABLE IF NOT EXISTS albums (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  cover_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  visibility     TEXT NOT NULL DEFAULT 'private', -- 'private' | 'friends' | 'public'
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_albums_user ON albums(user_id, position);

CREATE TABLE IF NOT EXISTS album_media (
  album_id  TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  media_id  TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL DEFAULT 0,
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (album_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_album_media_album ON album_media(album_id, position);
CREATE INDEX IF NOT EXISTS idx_album_media_media ON album_media(media_id);
