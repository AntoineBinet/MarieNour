-- Vérification d'e-mail à l'inscription (mode strict).
--
-- Un nouveau compte « membre » naît désormais NON vérifié (email_verified = 0) :
-- il reçoit un lien d'activation par e-mail et ne peut pas se connecter tant
-- qu'il n'a pas cliqué dessus. Les comptes EXISTANTS au moment de la migration
-- sont marqués vérifiés (= 1) pour ne casser aucune connexion en cours.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN verification_expires INTEGER; -- epoch ms

-- Tous les comptes déjà présents restent valides.
UPDATE users SET email_verified = 1;

CREATE INDEX IF NOT EXISTS idx_users_verif_token ON users(verification_token_hash);
