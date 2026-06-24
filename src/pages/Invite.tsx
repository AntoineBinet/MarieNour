// Page d'atterrissage d'une invitation (scannée via QR ou lien partagé).
// Accessible sans être connecté : on montre l'aperçu, et si la personne n'a pas
// de compte on l'invite à s'inscrire (le retour ramène ici pour accepter).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth";
import { Spinner, useToast } from "../ui";
import { Icon, type IconName } from "../components/Icon";
import type { InviteKind } from "@shared/types";

const KIND_ICON: Record<InviteKind, IconName> = { friend: "friends", trip: "trips", group: "expenses", event: "confetti", album: "photos" };
const KIND_VERB: Record<InviteKind, string> = {
  friend: "veut t'ajouter en ami",
  trip: "t'invite à rejoindre un voyage",
  group: "t'invite dans un groupe de dépenses",
  event: "t'invite à un événement",
  album: "partage un album photo avec toi",
};
const KIND_DEST: Record<InviteKind, string> = { friend: "/amis", trip: "/voyages", group: "/depenses", event: "/evenements", album: "/photos" };

export default function Invite() {
  const { token = "" } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [done, setDone] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.inviteInfo(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: (res) => {
      setDone(true);
      toast.push("Invitation acceptée");
      // Pour un événement on ouvre directement sa fiche si on connaît la cible.
      const dest = res.kind === "event" && res.target_id ? `/evenements/${res.target_id}` : KIND_DEST[res.kind] ?? "/";
      setTimeout(() => navigate(dest, { replace: true }), 900);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const invite = data?.invite;

  return (
    <div className="auth-wrap">
      <div className="auth-card card center">
        <img src="/favicon.svg" alt="" style={{ width: 48, height: 48, borderRadius: 14 }} />
        {loading || isLoading ? (
          <Spinner />
        ) : isError || !invite ? (
          <>
            <h1 style={{ marginTop: "var(--space-3)" }}>Invitation introuvable</h1>
            <p className="muted">Ce lien n'est plus valide ou a expiré.</p>
            <Link className="btn btn-soft" to="/" style={{ marginTop: "var(--space-4)" }}>Retour à l'accueil</Link>
          </>
        ) : (
          <>
            <div
              style={{
                margin: "var(--space-4) auto",
                width: 64,
                height: 64,
                borderRadius: 20,
                display: "grid",
                placeItems: "center",
                background: "color-mix(in srgb, var(--accent) 16%, transparent)",
                color: "var(--accent-ink)",
              }}
            >
              <Icon name={KIND_ICON[invite.kind]} size={30} />
            </div>
            <h1>{invite.inviter.display_name}</h1>
            <p className="muted" style={{ marginTop: 4 }}>
              {KIND_VERB[invite.kind]}
              {invite.target_title ? <> : <strong>{invite.target_title}</strong></> : null}.
            </p>

            {!invite.valid ? (
              <p style={{ color: "var(--danger)", marginTop: "var(--space-4)" }}>{invite.reason || "Invitation expirée"}</p>
            ) : !user ? (
              <div className="col gap-2" style={{ marginTop: "var(--space-5)" }}>
                <p className="small muted">Connecte-toi ou crée ton compte pour accepter.</p>
                <Link className="btn btn-primary btn-block" to={`/login?redirect=${encodeURIComponent(`/i/${token}`)}`}>
                  Se connecter
                </Link>
                <Link className="btn btn-soft btn-block" to={`/login?mode=register&redirect=${encodeURIComponent(`/i/${token}`)}`}>
                  Créer un compte
                </Link>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: "var(--space-5)" }}
                onClick={() => accept.mutate()}
                disabled={accept.isPending || done}
              >
                {done ? (
                  <span className="row gap-2"><Icon name="check" size={15} /> C'est fait</span>
                ) : accept.isPending ? "…" : "Accepter l'invitation"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
