import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm, SwatchRow } from "../../ui";
import Icon from "../../components/Icon";
import type { CategoryKind, FinanceCategory } from "@shared/types";
import { money, CatDot } from "./shared";

export function BudgetsTab({ canEdit, owner }: { canEdit: boolean; owner: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ["finance", "categories"], queryFn: () => api.financeCategories() });
  const categories = data?.categories ?? [];
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const incomeCats = categories.filter((c) => c.kind === "income");

  const save = useMutation({
    mutationFn: ({ id, budget }: { id: string; budget: number | null }) => api.updateCategory(id, { monthly_budget: budget }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Budget mis à jour"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Catégorie supprimée"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const commit = (c: FinanceCategory) => {
    const raw = drafts[c.id];
    if (raw === undefined) return;
    const n = raw.trim() === "" ? null : Number(raw);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return toast.push("Montant invalide", true);
    save.mutate({ id: c.id, budget: n });
  };
  const askDelete = async (c: FinanceCategory) => {
    if (await confirm(`Supprimer la catégorie « ${c.name} » ?`)) del.mutate(c.id);
  };

  if (isLoading) return <Spinner />;

  const renderCat = (c: FinanceCategory) => (
    <div key={c.id} className="li-row" style={{ alignItems: "center" }}>
      <CatDot color={c.color} icon={c.icon} size={30} />
      <span className="grow" style={{ fontWeight: 600, minWidth: 0 }}>{c.name}</span>
      {c.kind === "expense" && canEdit ? (
        <input
          className="input"
          style={{ width: 120 }}
          type="number"
          min="0"
          step="0.01"
          placeholder="Pas de budget"
          value={drafts[c.id] ?? (c.monthly_budget ?? "")}
          onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
          onBlur={() => commit(c)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      ) : c.kind === "expense" ? (
        <span className="chip small">{c.monthly_budget ? money(c.monthly_budget) : "Aucun budget"}</span>
      ) : (
        <span className="chip small">Revenu</span>
      )}
      {canEdit && (
        <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(c)} aria-label="Supprimer"><Icon name="trash" size={15} /></button>
      )}
    </div>
  );

  return (
    <div>
      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvelle catégorie</button>
        </div>
      )}
      {categories.length === 0 ? (
        <div className="card">
          <EmptyState icon="target" title="Aucune catégorie" hint="Crée des catégories de dépenses et fixe-leur un budget mensuel."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvelle catégorie</button> : undefined} />
        </div>
      ) : (
        <div className="col" style={{ gap: "var(--space-4)" }}>
          <div>
            <div className="panel-head"><h2><Icon name="tag" size={18} style={{ verticalAlign: "-3px" }} /> Dépenses</h2></div>
            <div className="card card-pad-sm">
              {expenseCats.length === 0 ? <p className="muted small">Aucune catégorie de dépense.</p> : expenseCats.map(renderCat)}
            </div>
          </div>
          {incomeCats.length > 0 && (
            <div>
              <div className="panel-head"><h2><Icon name="coins" size={18} style={{ verticalAlign: "-3px" }} /> Revenus</h2></div>
              <div className="card card-pad-sm">{incomeCats.map(renderCat)}</div>
            </div>
          )}
        </div>
      )}

      {adding && <CategoryModal owner={owner} onClose={() => setAdding(false)} />}
      {confirmNode}
    </div>
  );
}

function CategoryModal({ owner: _owner, onClose }: { owner: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", kind: "expense" as CategoryKind, color: "blush", monthly_budget: "", icon: "tag" });

  const save = useMutation({
    mutationFn: (b: Partial<FinanceCategory>) => api.createCategory(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Catégorie créée "); onClose(); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.push("Le nom est requis", true);
    save.mutate({
      name: form.name.trim(),
      kind: form.kind,
      color: form.color,
      icon: form.icon || "tag",
      monthly_budget: form.kind === "expense" && form.monthly_budget.trim() !== "" ? Number(form.monthly_budget) : null,
    });
  };
  return (
    <Modal
      title="Nouvelle catégorie"
      onClose={onClose}
      footer={<>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? "…" : "Créer"}</button>
      </>}
    >
      <form onSubmit={submit}>
        <Field label="Nom"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Courses, Loisirs…" autoFocus /></Field>
        <Field label="Type">
          <div className="row gap-2">
            {(["expense", "income"] as CategoryKind[]).map((k) => (
              <button key={k} type="button" className={form.kind === k ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"} onClick={() => setForm({ ...form, kind: k })} style={{ flex: 1 }}>
                {k === "expense" ? "Dépense" : "Revenu"}
              </button>
            ))}
          </div>
        </Field>
        {form.kind === "expense" && (
          <Field label="Budget mensuel (facultatif)">
            <input className="input" type="number" min="0" step="0.01" value={form.monthly_budget} onChange={(e) => setForm({ ...form, monthly_budget: e.target.value })} placeholder="0.00" />
          </Field>
        )}
        <Field label="Couleur"><SwatchRow value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></Field>
      </form>
    </Modal>
  );
}
