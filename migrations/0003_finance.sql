-- marienour — Gestion de budget personnel (« Mes finances »)
-- Comptes, catégories + budgets mensuels, transactions, opérations récurrentes,
-- objectifs d'épargne, et partage optionnel avec un partenaire.
-- Centré sur la gestion personnelle ; le partage est secondaire.

-- ── Comptes (courant, épargne, espèces, carte, investissement) ─────────────
CREATE TABLE IF NOT EXISTS finance_accounts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'checking', -- checking|savings|cash|card|investment
  currency      TEXT NOT NULL DEFAULT 'EUR',
  start_balance REAL NOT NULL DEFAULT 0,           -- solde initial (avant transactions)
  icon          TEXT DEFAULT 'wallet',
  color         TEXT DEFAULT 'sand',
  archived      INTEGER NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_accounts_user ON finance_accounts(user_id, archived, position);

-- ── Catégories (dépense / revenu) + budget mensuel optionnel ───────────────
CREATE TABLE IF NOT EXISTS finance_categories (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'expense',  -- expense|income
  icon          TEXT DEFAULT 'tag',
  color         TEXT DEFAULT 'sand',
  monthly_budget REAL,                            -- NULL = pas de budget suivi
  position      INTEGER NOT NULL DEFAULT 0,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_cat_user ON finance_categories(user_id, kind, position);

-- ── Transactions (dépense / revenu / virement) ─────────────────────────────
CREATE TABLE IF NOT EXISTS finance_transactions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id       TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
  category_id      TEXT REFERENCES finance_categories(id) ON DELETE SET NULL,
  type             TEXT NOT NULL DEFAULT 'expense', -- expense|income|transfer
  amount           REAL NOT NULL,                   -- toujours > 0 ; le signe vient du type
  date             TEXT NOT NULL,                   -- 'YYYY-MM-DD'
  payee            TEXT,
  note             TEXT,
  transfer_account_id TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL, -- pour 'transfer'
  recurring_id     TEXT,                            -- généré par une récurrence (optionnel)
  created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_tx_user ON finance_transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_fin_tx_account ON finance_transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_fin_tx_category ON finance_transactions(category_id, date);

-- ── Opérations récurrentes (abonnements, salaire, loyer…) ──────────────────
CREATE TABLE IF NOT EXISTS finance_recurring (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
  category_id  TEXT REFERENCES finance_categories(id) ON DELETE SET NULL,
  type         TEXT NOT NULL DEFAULT 'expense',
  amount       REAL NOT NULL,
  label        TEXT NOT NULL,
  cadence      TEXT NOT NULL DEFAULT 'monthly',   -- weekly|monthly|yearly
  next_date    TEXT NOT NULL,                      -- 'YYYY-MM-DD'
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_rec_user ON finance_recurring(user_id, active, next_date);

-- ── Objectifs d'épargne ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_goals (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  target_amount REAL NOT NULL,
  saved_amount  REAL NOT NULL DEFAULT 0,
  target_date   TEXT,
  account_id    TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL,
  icon          TEXT DEFAULT 'target',
  color         TEXT DEFAULT 'sage',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_goals_user ON finance_goals(user_id);

-- ── Partage avec un partenaire (lecture, ou lecture + écriture) ────────────
CREATE TABLE IF NOT EXISTS finance_shares (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- propriétaire de l'espace
  partner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- partenaire invité
  can_edit   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(owner_id, partner_id)
);
CREATE INDEX IF NOT EXISTS idx_fin_shares_partner ON finance_shares(partner_id);
