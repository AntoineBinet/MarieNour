// marienour — bouton « Inviter par lien ». Crée une invitation côté serveur puis
// copie directement son lien partageable dans le presse-papier, prêt à coller
// dans un message. Alternative au QR code (InviteQr.tsx) pour inviter à distance.
// Mêmes usages : ami, voyage ou groupe de dépenses.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { Modal, useToast } from "../ui";
import { Icon } from "./Icon";
import type { InviteKind } from "@shared/types";

const TITLES: Record<InviteKind, string> = {
  friend: "Ajoute-moi en ami",
  trip: "Rejoins le voyage",
  group: "Rejoins le groupe de dépenses",
  event: "Rejoins l'événement",
};

export interface InviteLinkProps {
  kind: InviteKind;
  targetId?: string;
  memberId?: string;
  label?: string;
  /** Rendu du déclencheur : "soft" (défaut), "primary" ou "sm". */
  variant?: "primary" | "soft" | "sm";
  children?: React.ReactNode;
}

export function InviteLink({ kind, targetId, memberId, label, variant = "soft", children }: InviteLinkProps) {
  const toast = useToast();
  // Repli affiché quand l'écriture directe dans le presse-papier est refusée
  // (Safari/iOS perd l'« activation utilisateur » après l'appel réseau) : on
  // montre alors le lien pour une copie manuelle au clic suivant.
  const [fallback, setFallback] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.createInvite({ kind, target_id: targetId, member_id: memberId, label }),
    onSuccess: async ({ invite }) => {
      try {
        await navigator.clipboard.writeText(invite.url);
        toast.push("Lien d'invitation copié");
      } catch {
        // Repli 1 : feuille de partage native (mobile surtout).
        if (navigator.share) {
          try {
            await navigator.share({ title: TITLES[kind], text: TITLES[kind], url: invite.url });
            return;
          } catch {
            /* annulé */
          }
        }
        // Repli 2 : affichage du lien pour copie manuelle.
        setFallback(invite.url);
      }
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const copyFallback = async () => {
    if (!fallback) return;
    try {
      await navigator.clipboard.writeText(fallback);
      toast.push("Lien copié");
      setFallback(null);
    } catch {
      toast.push("Copie impossible", true);
    }
  };

  const btnClass = variant === "primary" ? "btn btn-primary" : variant === "sm" ? "btn btn-soft btn-sm" : "btn btn-soft";

  return (
    <>
      <button className={btnClass} onClick={() => create.mutate()} disabled={create.isPending}>
        <Icon name="link" size={variant === "sm" ? 15 : 18} />
        {children ?? "Inviter par lien"}
      </button>

      {fallback && (
        <Modal title={TITLES[kind]} onClose={() => setFallback(null)}>
          <div className="col gap-4">
            <p className="muted small">Copie ce lien et envoie-le à la personne à inviter.</p>
            <div
              className="row gap-2"
              style={{ width: "100%", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.7rem" }}
            >
              <Icon name="link" size={16} />
              <span className="small" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fallback}
              </span>
            </div>
            <button className="btn btn-primary" onClick={copyFallback}>Copier le lien</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default InviteLink;
