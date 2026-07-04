// Onglet « Récurrent » de la section Finances + sa modale d'édition.
// Extrait VERBATIM de l'ancien Finance.tsx monolithique.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../../ui";
import Icon from "../../components/Icon";
import type { Cadence, FinanceAccount, FinanceRecurring, TxType } from "@shared/types";
import { money, todayISO, fmtDate, CADENCE_LABEL, TYPE_META } from "./shared";

export function RecurringTab({ canEdit, owner }: { canEdit: boolean; owner: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinanceRecurring | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["finance", "recurring"], queryFn: () => api.financeRecurring() });
  const recurring = data?.recurring ?? [];
  const accountsQ = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.financeAccounts() });
  const accounts = accountsQ.data?.accounts ?? [];
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const del = useMutation({
    mutationFn: (id: string) => api.deleteRecurring(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Récurrence supprimée"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.updateRecurring(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const run = useMutation({
    mutationFn: (id: string) => api.runRecurring(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Pointé  — prochaine échéance reportée"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const askDelete = async (r: FinanceRecurring) => {
    if (await confirm(`Supprimer « ${r.label} » ?`)) del.mutate(r.id);
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvelle récurrence</button>
        </div>
      )}
      {recurring.length === 0 ? (
        <div className="card">
          <EmptyState icon="repeat" title="Aucune récurrence" hint="Ajoute tes revenus et charges réguliers (loyer, abonnements, salaire…)."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvelle récurrence</button> : undefined} />
        </div>
      ) : (
        <div className="card card-pad-sm">
          {recurring.map((r) => {
            const acc = accById.get(r.account_id);
            const meta = TYPE_META[r.type];
            return (
              <div key={r.id} className="li-row" style={{ alignItems: "center", opacity: r.active ? 1 : 0.55 }}>
                <Icon name="repeat" size={16} className="muted" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  <p className="muted small">
                    {CADENCE_LABEL[r.cadence]} · prochaine {fmtDate(r.next_date)}{acc ? ` · ${acc.name}` : ""}
                    {!r.active ? " · en pause" : ""}
                  </p>
                </div>
                <span style={{ fontWeight: 700, color: meta.color, whiteSpace: "nowrap" }}>{meta.sign}{money(r.amount, acc?.currency)}</span>
                {canEdit && (
                  <div className="li-actions">
                    <button className="btn btn-soft btn-sm" onClick={() => run.mutate(r.id)} disabled={run.isPending} title="Créer la transaction et reporter">
                      <Icon name="check" size={14} /> Pointer
                    </button>
                    <button className="btn btn-icon btn-soft btn-sm" onClick={() => toggle.mutate({ id: r.id, active: !r.active })} aria-label={r.active ? "Mettre en pause" : "Activer"}>
                      <Icon name={r.active ? "eye" : "clock"} size={15} />
                    </button>
                    <button className="btn btn-icon btn-soft btn-sm" onClick={() => setEditing(r)} aria-label="Modifier"><Icon name="edit" size={15} /></button>
                    <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(r)} aria-label="Supprimer"><Icon name="trash" size={15} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(adding || editing) && <RecurringModal rec={editing} accounts={accounts} owner={owner} onClose={() => { setAdding(false); setEditing(null); }} />}
      {confirmNode}
    </div>
  );
}

function RecurringModal({ rec, accounts, owner: _owner, onClose }: { rec: FinanceRecurring | null; accounts: FinanceAccount[]; owner: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const categoriesQ = useQuery({ queryKey: ["finance", "categories"], queryFn: () => api.financeCategories() });
  const categories = categoriesQ.data?.categories ?? [];
  const [form, setForm] = useState({
    label: rec?.label ?? "",
    type: (rec?.type ?? "expense") as TxType,
    amount: rec ? String(rec.amount) : "",
    account_id: rec?.account_id ?? accounts[0]?.id ?? "",
    category_id: rec?.category_id ?? "",
    cadence: (rec?.cadence ?? "monthly") as Cadence,
    next_date: rec?.next_date ?? todayISO(),
    active: rec?.active ?? true,
  });
  const catsForType = categories.filter((c) => (form.type === "income" ? c.kind === "income" : c.kind === "expense"));

  const save = useMutation({
    mutationFn: async (b: Partial<FinanceRecurring>) => {
      if (rec) await api.updateRecurring(rec.id, b);
      else await api.createRecurring(b);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push(rec ? "Récurrence modifiée" : "Récurrence créée"); onClose(); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) return toast.push("Le libellé est requis", true);
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.push("Montant invalide", true);
    if (!form.account_id) return toast.push("Choisis un compte", true);
    save.mutate({
      label: form.label.trim(),
      type: form.type,
      amount,
      account_id: form.account_id,
      category_id: form.type === "transfer" ? null : form.category_id || null,
      cadence: form.cadence,
      next_date: form.next_date || todayISO(),
      active: form.active,
    });
  };
  return (
    <Modal
      title={rec ? "Modifier la récurrence" : "Nouvelle récurrence"}
      onClose={onClose}
      footer={<>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? "…" : rec ? "Enregistrer" : "Créer"}</button>
      </>}
    >
      <form onSubmit={submit}>
        <Field label="Libellé"><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Loyer, salaire, Netflix…" autoCapitalize="sentences" enterKeyHint="done" autoFocus /></Field>
        <div className="row gap-2" style={{ marginBottom: "var(--space-3)" }}>
          {(["expense", "income", "transfer"] as TxType[]).map((tt) => (
            <button key={tt} type="button" className={form.type === tt ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"} onClick={() => setForm({ ...form, type: tt, category_id: "" })} style={{ flex: 1 }}>
              {TYPE_META[tt].label}
            </button>
          ))}
        </div>
        <div className="row gap-3 wrap">
          <div style={{ width: 140 }}><Field label="Montant"><input className="input" type="number" inputMode="decimal" enterKeyHint="done" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></Field></div>
          <div className="grow">
            <Field label="Cadence">
              <select className="select" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as Cadence })}>
                {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <Field label="Compte">
          <select className="select" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {form.type !== "transfer" && (
          <Field label="Catégorie">
            <select className="select" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Sans catégorie</option>
              {catsForType.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Prochaine échéance"><input className="input" type="date" value={form.next_date} onChange={(e) => setForm({ ...form, next_date: e.target.value })} /></Field>
        <label className="row gap-2" style={{ cursor: "pointer", marginTop: "var(--space-2)" }}>
          <input className="check-lg" type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          <span>Active</span>
        </label>
      </form>
    </Modal>
  );
}
