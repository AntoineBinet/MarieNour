import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm, SwatchRow } from "../../ui";
import Icon from "../../components/Icon";
import type { AccountKind, FinanceAccount } from "@shared/types";
import { money, colorVar, CatDot, ACCOUNT_KINDS, ACCOUNT_KIND_LABEL, ACCOUNT_KIND_ICON } from "./shared";

export function AccountsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [editing, setEditing] = useState<FinanceAccount | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.financeAccounts() });
  const accounts = data?.accounts ?? [];

  const del = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Compte supprimé"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async (a: FinanceAccount) => {
    if (await confirm(`Supprimer le compte « ${a.name} » et ses transactions ?`)) del.mutate(a.id);
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouveau compte</button>
        </div>
      )}
      {accounts.length === 0 ? (
        <div className="card">
          <EmptyState icon="wallet" title="Aucun compte" hint="Ajoute tes comptes (courant, épargne, espèces…) pour suivre ton solde."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouveau compte</button> : undefined} />
        </div>
      ) : (
        <div className="grid-cards">
          {accounts.map((a) => (
            <div key={a.id} className="card card-pad-sm col" style={{ gap: "var(--space-2)", borderTop: `3px solid ${colorVar(a.color)}` }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="row gap-2"><CatDot color={a.color} icon={a.icon || ACCOUNT_KIND_ICON[a.kind]} size={30} /><strong>{a.name}</strong></span>
                <span className="chip small">{ACCOUNT_KIND_LABEL[a.kind] ?? a.kind}</span>
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{money(a.balance, a.currency)}</div>
              {canEdit && (
                <div className="row gap-2" style={{ marginTop: "auto" }}>
                  <button className="btn btn-soft btn-sm" onClick={() => setEditing(a)}><Icon name="edit" size={14} /> Modifier</button>
                  <span className="spacer" />
                  <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(a)} aria-label="Supprimer"><Icon name="trash" size={15} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && <AccountModal account={editing} onClose={() => { setAdding(false); setEditing(null); }} />}
      {confirmNode}
    </div>
  );
}

function AccountModal({ account, onClose }: { account: FinanceAccount | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: account?.name ?? "",
    kind: (account?.kind ?? "checking") as AccountKind,
    start_balance: account ? String(account.start_balance) : "",
    currency: account?.currency ?? "EUR",
    color: account?.color || "sky",
    icon: account?.icon ?? "",
  });

  const save = useMutation({
    mutationFn: async (b: Partial<FinanceAccount>) => {
      if (account) await api.updateAccount(account.id, b);
      else await api.createAccount(b);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push(account ? "Compte modifié" : "Compte créé"); onClose(); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.push("Le nom est requis", true);
    save.mutate({
      name: form.name.trim(),
      kind: form.kind,
      start_balance: Number(form.start_balance) || 0,
      currency: form.currency.trim() || "EUR",
      color: form.color,
      icon: form.icon.trim() || ACCOUNT_KIND_ICON[form.kind],
    });
  };

  return (
    <Modal
      title={account ? "Modifier le compte" : "Nouveau compte"}
      onClose={onClose}
      footer={<>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? "…" : account ? "Enregistrer" : "Créer"}</button>
      </>}
    >
      <form onSubmit={submit}>
        <Field label="Nom"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Compte courant" autoFocus /></Field>
        <div className="row gap-3 wrap">
          <div className="grow">
            <Field label="Type">
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AccountKind })}>
                {ACCOUNT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ width: 100 }}><Field label="Devise"><input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Field></div>
        </div>
        <Field label="Solde de départ">
          <input className="input" type="number" step="0.01" value={form.start_balance} onChange={(e) => setForm({ ...form, start_balance: e.target.value })} placeholder="0.00" />
        </Field>
        <Field label="Couleur"><SwatchRow value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></Field>
      </form>
    </Modal>
  );
}
