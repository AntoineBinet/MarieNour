-- Sexe (optionnel) demandé à l'inscription.
--
-- Sert uniquement à proposer un STYLE D'INTERFACE de départ adapté au moment de
-- la création du compte (cf. prefs.design). Le style lui-même vit dans le blob
-- `prefs` et reste 100 % personnalisable depuis les réglages, sans aucune notion
-- de genre dans l'interface. La valeur peut être 'female', 'male', 'other' ou
-- NULL (non précisé).
ALTER TABLE users ADD COLUMN gender TEXT;
