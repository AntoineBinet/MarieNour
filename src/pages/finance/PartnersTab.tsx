// Onglet « Partage » de la section Finances.
// Extrait VERBATIM de l'ancien Finance.tsx monolithique.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { Modal, Spinner, EmptyState, useToast, useConfirm } from "../../ui";
import Icon from "../../components/Icon";
import type { FinancePartner } from "@shared/types";
import { CatDot } from "./shared";

export function PartnersTab({ partners, loading }: { partners: FinancePartner[]; loading: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [adding, setAdding] = useState(false);

  const sharedByMe = partners.filter((p) => p.direction === "shared_by_me");
  const sharedWithMe = partners.filter((p) => p.direction === "shared_with_me");

  const friendsQ = useQuery({ queryKey: ["friends"], queryFn: () => api.friends() });
  const friends = (friendsQ.data?.friends ?? []).filter((f) => f.status === "accepted");
  const alreadyShared = new Set(sharedByMe.map((p) => p.user.id));
  const candidates = friends.map((f) => f.user).filter((u) => !alreadyShared.has(u.id));

  const setPartner = useMutation({
    mutationFn: ({ id, can_edit }: { id: string; can_edit: boolean }) => api.addFinancePartner(id, can_edit),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Partage mis à jour"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.removeFinancePartner(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Partage retiré"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const askRemove = async (p: FinancePartner) => {
    if (await confirm(`Retirer l'accès de ${p.user.display_name} à tes finances ?`)) remove.mutate(p.user.id);
  };

  if (loading) return <Spinner />;

  return (
    <div className="col" style={{ gap: "var(--space-5)" }}>
      <section>
        <div className="panel-head row" style={{ justifyContent: "space-between" }}>
          <h2><Icon name="share" size={18} style={{ verticalAlign: "-3px" }} /> Je partage avec</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Ajouter</button>
        </div>
        <div className="card card-pad-sm">
          {sharedByMe.length === 0 ? (
            <p className="muted small"><Icon name="info" size={14} style={{ verticalAlign: "-2px" }} /> Tu ne partages tes finances avec personne. Ajoute un ami pour lui donner accès (lecture ou édition).</p>
          ) : (
            sharedByMe.map((p) => (
              <div key={p.user.id} className="li-row" style={{ alignItems: "center" }}>
                <CatDot color="sage" icon="profile" size={30} />
                <span className="grow" style={{ fontWeight: 600 }}>{p.user.display_name}</span>
                <label className="row gap-2 small" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={p.can_edit} onChange={(e) => setPartner.mutate({ id: p.user.id, can_edit: e.target.checked })} />
                  <span>Édition</span>
                </label>
                <button className="btn btn-icon btn-danger btn-sm" onClick={() => askRemove(p)} aria-label="Retirer"><Icon name="trash" size={15} /></button>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="panel-head"><h2><Icon name="users" size={18} style={{ verticalAlign: "-3px" }} /> Partagé avec moi</h2></div>
        <div className="card card-pad-sm">
          {sharedWithMe.length === 0 ? (
            <p className="muted small">Personne ne partage ses finances avec toi pour l'instant.</p>
          ) : (
            sharedWithMe.map((p) => (
              <div key={p.user.id} className="li-row" style={{ alignItems: "center" }}>
                <CatDot color="sky" icon="profile" size={30} />
                <span className="grow" style={{ fontWeight: 600 }}>{p.user.display_name}</span>
                <span className="chip small">{p.can_edit ? "Édition" : "Lecture seule"}</span>
              </div>
            ))
          )}
          {sharedWithMe.length > 0 && (
            <p className="muted small" style={{ marginTop: "var(--space-2)" }}>
              <Icon name="lightbulb" size={14} style={{ verticalAlign: "-2px" }} /> Bascule sur leur espace via le sélecteur en haut de page.
            </p>
          )}
        </div>
      </section>

      {adding && (
        <Modal
          title="Partager mes finances"
          onClose={() => setAdding(false)}
          footer={<button className="btn btn-soft" onClick={() => setAdding(false)}>Fermer</button>}
        >
          {friendsQ.isLoading ? (
            <Spinner />
          ) : candidates.length === 0 ? (
            <EmptyState icon="friends" title="Aucun ami à ajouter" hint="Ajoute des amis (onglet Amis) puis reviens leur partager tes finances." />
          ) : (
            <div className="col" style={{ gap: "var(--space-2)" }}>
              <p className="muted small">Choisis un ami pour lui donner accès à ton espace finances (lecture par défaut).</p>
              {candidates.map((u) => (
                <div key={u.id} className="li-row" style={{ alignItems: "center" }}>
                  <CatDot color="lilac" icon="profile" size={30} />
                  <span className="grow" style={{ fontWeight: 600 }}>{u.display_name}</span>
                  <button className="btn btn-primary btn-sm" onClick={() => { setPartner.mutate({ id: u.id, can_edit: false }); }} disabled={setPartner.isPending}>
                    <Icon name="share" size={14} /> Partager
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {confirmNode}
    </div>
  );
}
