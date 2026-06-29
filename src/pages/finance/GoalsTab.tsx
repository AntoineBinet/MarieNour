import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm, SwatchRow } from "../../ui";
import Icon from "../../components/Icon";
import type { FinanceGoal } from "@shared/types";
import { money, ProgressBar, CatDot, colorVar, fmtDate, ContributeModal } from "./shared";

export function GoalsTab({ canEdit, owner }: { canEdit: boolean; owner: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinanceGoal | null>(null);
  const [contrib, setContrib] = useState<FinanceGoal | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["finance", "goals"], queryFn: () => api.financeGoals() });
  const goals = data?.goals ?? [];
  // Devise réelle de l'espace (1er compte), au lieu d'un EUR codé en dur — réutilise
  // la requête « accounts » déjà en cache (aucun appel réseau supplémentaire).
  const accountsQ = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.financeAccounts() });
  const accs = accountsQ.data?.accounts ?? [];
  const cur = (accs.find((a) => !a.archived) ?? accs[0])?.currency || "EUR";

  const del = useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Objectif supprimé"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const askDelete = async (g: FinanceGoal) => {
    if (await confirm(`Supprimer l'objectif « ${g.name} » ?`)) del.mutate(g.id);
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvel objectif</button>
        </div>
      )}
      {goals.length === 0 ? (
        <div className="card">
          <EmptyState icon="piggybank" title="Aucun objectif" hint="Définis un objectif d'épargne (vacances, achat…) et suis ta progression."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvel objectif</button> : undefined} />
        </div>
      ) : (
        <div className="grid-cards">
          {goals.map((g) => {
            const pct = g.target_amount > 0 ? (g.saved_amount / g.target_amount) * 100 : 0;
            return (
              <div key={g.id} className="card card-pad-sm col" style={{ gap: "var(--space-2)" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="row gap-2"><CatDot color={g.color} icon={g.icon || "target"} size={30} /><strong>{g.name}</strong></span>
                  {pct >= 100 && <Icon name="trophy" size={18} style={{ color: "var(--accent)" }} />}
                </div>
                <ProgressBar pct={pct} color={colorVar(g.color)} />
                <p className="small muted">
                  {money(g.saved_amount, cur)} / {money(g.target_amount, cur)} · {Math.round(pct)}%
                  {g.target_date ? ` · échéance ${fmtDate(g.target_date)}` : ""}
                </p>
                {canEdit && (
                  <div className="row gap-2" style={{ marginTop: "auto" }}>
                    <button className="btn btn-soft btn-sm" onClick={() => setContrib(g)}><Icon name="plus" size={14} /> Contribuer</button>
                    <button className="btn btn-icon btn-soft btn-sm" onClick={() => setEditing(g)} aria-label="Modifier"><Icon name="edit" size={14} /></button>
                    <span className="spacer" />
                    <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(g)} aria-label="Supprimer"><Icon name="trash" size={15} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(adding || editing) && <GoalModal goal={editing} owner={owner} onClose={() => { setAdding(false); setEditing(null); }} />}
      {contrib && <ContributeModal goal={contrib} cur={cur} onClose={() => setContrib(null)} />}
      {confirmNode}
    </div>
  );
}

function GoalModal({ goal, owner: _owner, onClose }: { goal: FinanceGoal | null; owner: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: goal?.name ?? "",
    target_amount: goal ? String(goal.target_amount) : "",
    target_date: goal?.target_date ?? "",
    color: goal?.color || "lilac",
    icon: goal?.icon ?? "target",
  });

  const save = useMutation({
    mutationFn: async (b: Partial<FinanceGoal>) => {
      if (goal) await api.updateGoal(goal.id, b);
      else await api.createGoal(b);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push(goal ? "Objectif modifié" : "Objectif créé"); onClose(); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.push("Le nom est requis", true);
    const target = Number(form.target_amount);
    if (!Number.isFinite(target) || target <= 0) return toast.push("Montant cible invalide", true);
    save.mutate({
      name: form.name.trim(),
      target_amount: target,
      target_date: form.target_date || null,
      color: form.color,
      icon: form.icon || "target",
    });
  };
  return (
    <Modal
      title={goal ? "Modifier l'objectif" : "Nouvel objectif"}
      onClose={onClose}
      footer={<>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? "…" : goal ? "Enregistrer" : "Créer"}</button>
      </>}
    >
      <form onSubmit={submit}>
        <Field label="Nom"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vacances, voiture…" autoFocus /></Field>
        <div className="row gap-3 wrap">
          <div style={{ width: 150 }}><Field label="Montant cible"><input className="input" type="number" min="0" step="0.01" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} placeholder="0.00" /></Field></div>
          <div className="grow"><Field label="Échéance (facultatif)"><input className="input" type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></Field></div>
        </div>
        <Field label="Couleur"><SwatchRow value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></Field>
      </form>
    </Modal>
  );
}
