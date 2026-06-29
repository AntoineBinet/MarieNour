-- Index de performance (audit) — sans changement de schéma, idempotents.
--
-- 1) expense_shares(member_id) : les soldes Tricount et le digest « Aujourd'hui »
--    filtrent/agrègent par member_id (server/routes/expenses.ts, assistant.ts).
--    L'index UNIQUE existant (expense_id, member_id) place member_id en queue →
--    inutilisable pour un seek sur member_id seul. On ajoute l'index dédié.
CREATE INDEX IF NOT EXISTS idx_eshares_member ON expense_shares(member_id);

-- 2) sessions(expires_at) : la purge périodique des sessions expirées
--    (DELETE ... WHERE expires_at < ?) doit pouvoir cibler sans full scan.
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
