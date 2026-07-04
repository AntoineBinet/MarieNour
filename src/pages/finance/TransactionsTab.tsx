import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../../ui";
import Icon, { type IconName } from "../../components/Icon";
import type { FinanceAccount, FinanceCategory, FinanceTransaction, TxType } from "@shared/types";
import { money, fmtDayMonth, todayISO, CatDot, TYPE_META, type TxForm, emptyTxForm } from "./shared";

export function TransactionsTab({
  month,
  owner,
  canEdit,
  initialCategory,
  initialType,
  initialMonth,
}: {
  month: string;
  owner: string;
  canEdit: boolean;
  initialCategory?: string;
  initialType?: string;
  initialMonth?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [fMonth, setFMonth] = useState(initialMonth ?? month);
  const [fAccount, setFAccount] = useState("");
  const [fCategory, setFCategory] = useState(initialCategory ?? "");
  const [fType, setFType] = useState(initialType ?? "");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinanceTransaction | null>(null);

  const accountsQ = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.financeAccounts() });
  const categoriesQ = useQuery({ queryKey: ["finance", "categories"], queryFn: () => api.financeCategories() });
  const accounts = accountsQ.data?.accounts ?? [];
  const categories = categoriesQ.data?.categories ?? [];

  const txQ = useQuery({
    queryKey: ["finance", "tx", fMonth, fAccount, fCategory, fType, q, owner],
    queryFn: () =>
      api.financeTransactions({
        month: fMonth || undefined,
        account: fAccount || undefined,
        category: fCategory || undefined,
        type: fType || undefined,
        q: q || undefined,
        owner: owner || undefined,
      }),
  });
  const txs = txQ.data?.transactions ?? [];

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const grouped = useMemo(() => {
    const map = new Map<string, FinanceTransaction[]>();
    for (const t of txs) {
      const k = t.date;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [txs]);

  const del = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance"] });
      toast.push("Transaction supprimée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async (t: FinanceTransaction) => {
    if (await confirm("Supprimer cette transaction ?")) del.mutate(t.id);
  };

  return (
    <div>
      {/* Filtres */}
      <div className="card card-pad-sm" style={{ marginBottom: "var(--space-4)" }}>
        <div className="row wrap gap-2">
          <input type="month" className="input" value={fMonth} onChange={(e) => setFMonth(e.target.value)} style={{ width: 160 }} />
          <select className="select" value={fAccount} onChange={(e) => setFAccount(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">Tous les comptes</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="select" value={fCategory} onChange={(e) => setFCategory(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="select" value={fType} onChange={(e) => setFType(e.target.value)} style={{ minWidth: 110 }}>
            <option value="">Tous types</option>
            <option value="expense">Dépenses</option>
            <option value="income">Revenus</option>
            <option value="transfer">Virements</option>
          </select>
          <div className="grow" style={{ minWidth: 140 }}>
            <input
              className="input"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher…"
            />
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Ajouter
            </button>
          )}
        </div>
      </div>

      {txQ.isLoading ? (
        <Spinner />
      ) : grouped.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="lists"
            title="Aucune transaction"
            hint="Ajuste les filtres ou ajoute une nouvelle transaction."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Ajouter</button> : undefined}
          />
        </div>
      ) : (
        <div className="col" style={{ gap: "var(--space-4)" }}>
          {grouped.map(([date, list]) => (
            <div key={date}>
              <p className="eyebrow" style={{ marginBottom: 6, textTransform: "capitalize" }}>{fmtDayMonth(date)}</p>
              <div className="card card-pad-sm">
                {list.map((t) => {
                  const acc = accById.get(t.account_id);
                  const cat = t.category_id ? catById.get(t.category_id) : undefined;
                  const meta = TYPE_META[t.type];
                  const transferAcc = t.transfer_account_id ? accById.get(t.transfer_account_id) : undefined;
                  return (
                    <div key={t.id} className="li-row" style={{ alignItems: "center" }}>
                      <CatDot color={cat?.color || (t.type === "income" ? "sage" : t.type === "transfer" ? "sky" : "blush")} icon={cat?.icon || meta.icon} size={30} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.payee || cat?.name || meta.label}
                        </div>
                        <p className="muted small">
                          {acc?.name || "?"}
                          {t.type === "transfer" && transferAcc ? ` → ${transferAcc.name}` : ""}
                          {cat ? ` · ${cat.name}` : ""}
                        </p>
                      </div>
                      <span style={{ fontWeight: 700, color: meta.color, whiteSpace: "nowrap" }}>
                        {meta.sign}{money(t.amount, acc?.currency)}
                      </span>
                      {canEdit && (
                        <div className="li-actions">
                          <button className="btn btn-icon btn-soft btn-sm" onClick={() => setEditing(t)} aria-label="Modifier">
                            <Icon name="edit" size={15} />
                          </button>
                          <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(t)} aria-label="Supprimer">
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <TxModal
          tx={editing}
          accounts={accounts}
          categories={categories}
          owner={owner}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
      {confirmNode}
    </div>
  );
}

export function TxModal({
  tx,
  initial,
  accounts,
  categories,
  owner,
  onClose,
}: {
  tx: FinanceTransaction | null;
  initial?: Partial<TxForm>;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  owner: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<TxForm>(() =>
    tx
      ? {
          type: tx.type,
          amount: String(tx.amount),
          date: tx.date,
          account_id: tx.account_id,
          category_id: tx.category_id ?? "",
          transfer_account_id: tx.transfer_account_id ?? "",
          payee: tx.payee ?? "",
          note: tx.note ?? "",
        }
      : { ...emptyTxForm(), account_id: accounts[0]?.id ?? "", ...initial },
  );

  // Dès qu'un compte existe (ex. après le démarrage guidé), on le présélectionne.
  useEffect(() => {
    if (tx) return;
    setForm((f) => (f.account_id || !accounts[0] ? f : { ...f, account_id: accounts[0].id }));
  }, [accounts, tx]);

  const catsForType = categories.filter((c) => (form.type === "income" ? c.kind === "income" : c.kind === "expense"));
  const noAccounts = !tx && accounts.length === 0;

  // Démarrage guidé directement dans la modale si rien n'est encore configuré.
  const seed = useMutation({
    mutationFn: () => api.seedFinanceDefaults(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance"] });
      toast.push("Budget configuré");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const save = useMutation({
    mutationFn: async (b: Partial<FinanceTransaction> & { owner?: string }) => {
      if (tx) await api.updateTransaction(tx.id, b);
      else await api.createTransaction({ ...b, owner: owner || undefined });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance"] });
      toast.push(tx ? "Transaction modifiée" : "Transaction ajoutée");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.push("Indique un montant", true);
    if (!form.account_id) return toast.push("Choisis un compte", true);
    if (form.type === "transfer" && !form.transfer_account_id) return toast.push("Choisis le compte de destination", true);
    if (form.type === "transfer" && form.transfer_account_id === form.account_id)
      return toast.push("Les comptes source et destination doivent être différents", true);
    save.mutate({
      type: form.type,
      amount,
      date: form.date || todayISO(),
      account_id: form.account_id,
      category_id: form.type === "transfer" ? null : form.category_id || null,
      transfer_account_id: form.type === "transfer" ? form.transfer_account_id : null,
      payee: form.payee.trim() || null,
      note: form.note.trim() || null,
    });
  };

  // Premier lancement : rien à remplir tant qu'il n'y a pas de compte.
  if (noAccounts) {
    return (
      <Modal
        title="Nouvelle opération"
        onClose={onClose}
        footer={<button className="btn btn-soft" onClick={onClose}>Fermer</button>}
      >
        <div className="center col gap-3" style={{ padding: "var(--space-3) 0" }}>
          <Icon name="wallet" size={34} strokeWidth={1.5} style={{ color: "var(--accent-ink)" }} />
          <p className="muted" style={{ margin: 0 }}>
            Avant ta première opération, créons ton compte et quelques catégories courantes — ça prend une seconde.
          </p>
          <button className="btn btn-primary" onClick={() => seed.mutate()} disabled={seed.isPending}>
            <Icon name="rocket" size={16} /> {seed.isPending ? "Configuration…" : "Configurer mon budget"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={tx ? "Modifier l'opération" : "Nouvelle opération"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Enregistrement…" : tx ? "Enregistrer" : "Ajouter"}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {/* 1. Type d'opération */}
        <div className="row gap-2" style={{ marginBottom: "var(--space-4)" }}>
          {(["expense", "income", "transfer"] as TxType[]).map((tt) => (
            <button
              key={tt}
              type="button"
              className={form.type === tt ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"}
              onClick={() => setForm({ ...form, type: tt, category_id: "" })}
              style={{ flex: 1 }}
            >
              <Icon name={TYPE_META[tt].icon} size={14} /> {TYPE_META[tt].label}
            </button>
          ))}
        </div>

        {/* 2. Montant (mis en avant) */}
        <Field label="Montant">
          <div className="row gap-2 wrap" style={{ alignItems: "stretch" }}>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              enterKeyHint="done"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              autoFocus
              style={{ fontSize: "1.5rem", fontWeight: 700, flex: 1, minWidth: 140, textAlign: "right" }}
            />
            <input
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              style={{ width: 160 }}
            />
          </div>
        </Field>

        {/* 3. Catégorie en pastilles (rapide) — sauf virement */}
        {form.type === "transfer" ? (
          <div className="row gap-3 wrap">
            <div className="grow">
              <Field label="Depuis le compte">
                <select className="select" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grow">
              <Field label="Vers le compte">
                <select className="select" value={form.transfer_account_id} onChange={(e) => setForm({ ...form, transfer_account_id: e.target.value })}>
                  <option value="">—</option>
                  {accounts.filter((a) => a.id !== form.account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>
          </div>
        ) : (
          <Field label="Catégorie">
            <div className="row wrap gap-2">
              {catsForType.map((c) => {
                const sel = form.category_id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={sel ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"}
                    onClick={() => setForm({ ...form, category_id: sel ? "" : c.id })}
                  >
                    <Icon name={(c.icon as IconName) || "tag"} size={14} /> {c.name}
                  </button>
                );
              })}
              {catsForType.length === 0 && (
                <span className="muted small">Aucune catégorie — ajoute-en dans l'onglet Budgets.</span>
              )}
            </div>
          </Field>
        )}

        {/* 4. Compte (caché si un seul) + libellé + note */}
        {form.type !== "transfer" && accounts.length > 1 && (
          <Field label="Compte">
            <select className="select" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}

        <Field label="Libellé (facultatif)">
          <input
            className="input"
            value={form.payee}
            onChange={(e) => setForm({ ...form, payee: e.target.value })}
            placeholder="Supermarché, salaire…"
            autoCapitalize="sentences"
            autoComplete="off"
            enterKeyHint="done"
          />
        </Field>
        <Field label="Note (facultatif)">
          <input
            className="input"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Détail…"
            autoCapitalize="sentences"
            enterKeyHint="done"
          />
        </Field>
      </form>
    </Modal>
  );
}
