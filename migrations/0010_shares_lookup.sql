-- marienour — partage avec des amis choisis (visibilité 'shared')
-- La table `shares` existe depuis 0001 (owner/entity/shared_with). Elle est
-- désormais réellement utilisée : un contenu en visibilité 'shared' n'est visible
-- que par les amis listés ici. On ajoute l'index de lecture « par entité »
-- (l'index « par destinataire » idx_shares_with existe déjà).
CREATE INDEX IF NOT EXISTS idx_shares_entity ON shares(entity_type, entity_id);
