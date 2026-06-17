// marienour — bouton « Inviter par QR code ». Crée une invitation côté serveur
// puis affiche le QR + le lien partageable. Sert à ajouter rapidement quelqu'un
// (même pas encore inscrit) à : ses amis, un voyage, ou un groupe de dépenses.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { Modal, useToast } from "../ui";
import { Icon } from "./Icon";
import { QrCode } from "./QrCode";
import type { Invite, InviteKind } from "@shared/types";

const TITLES: Record<InviteKind, string> = {
  friend: "Ajoute-moi en ami",
  trip: "Rejoins le voyage",
  group: "Rejoins le groupe de dépenses",
  event: "Rejoins l'événement",
};

const HINTS: Record<InviteKind, string> = {
  friend: "Fais scanner ce QR code (ou partage le lien). Même sans compte, la personne pourra s'inscrire puis t'ajouter d'un tap.",
  trip: "La personne scanne, crée son compte si besoin, et rejoint automatiquement le voyage.",
  group: "La personne scanne et rejoint le groupe — ses dépenses seront partagées avec toi.",
  event: "La personne scanne, crée son compte si besoin, et rejoint l'événement pour répondre à l'invitation (RSVP).",
};

export interface InviteQrProps {
  kind: InviteKind;
  targetId?: string;
  memberId?: string;
  label?: string;
  /** Rendu du déclencheur : "button" (défaut) ou "soft". */
  variant?: "primary" | "soft" | "sm";
  children?: React.ReactNode;
}

export function InviteQr({ kind, targetId, memberId, label, variant = "soft", children }: InviteQrProps) {
  const toast = useToast();
  const [invite, setInvite] = useState<Invite | null>(null);

  const create = useMutation({
    mutationFn: () => api.createInvite({ kind, target_id: targetId, member_id: memberId, label }),
    onSuccess: (res) => setInvite(res.invite),
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      toast.push("Lien copié");
    } catch {
      toast.push("Copie impossible", true);
    }
  };

  const share = async () => {
    if (!invite) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: TITLES[kind], text: TITLES[kind], url: invite.url });
      } catch {
        /* annulé */
      }
    } else {
      copy();
    }
  };

  const btnClass = variant === "primary" ? "btn btn-primary" : variant === "sm" ? "btn btn-soft btn-sm" : "btn btn-soft";

  return (
    <>
      <button className={btnClass} onClick={() => create.mutate()} disabled={create.isPending}>
        <Icon name="qr" size={variant === "sm" ? 15 : 18} />
        {children ?? "Inviter par QR"}
      </button>

      {invite && (
        <Modal title={TITLES[kind]} onClose={() => setInvite(null)}>
          <div className="col gap-4" style={{ alignItems: "center", textAlign: "center" }}>
            <div style={{ padding: 14, background: "#fff", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
              <QrCode value={invite.url} size={220} />
            </div>
            <p className="muted small" style={{ maxWidth: 360 }}>{HINTS[kind]}</p>
            <div
              className="row gap-2"
              style={{ width: "100%", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.7rem" }}
            >
              <Icon name="link" size={16} />
              <span className="small" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {invite.url}
              </span>
            </div>
            <div className="row gap-2" style={{ width: "100%" }}>
              <button className="btn btn-soft grow" onClick={copy}>Copier le lien</button>
              <button className="btn btn-primary grow" onClick={share}>
                <Icon name="share" size={16} /> Partager
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default InviteQr;
