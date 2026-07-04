import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Spinner, EmptyState, useToast, useConfirm } from "../ui";
import { Icon } from "../components/Icon";
import { InviteQr } from "../components/InviteQr";
import { InviteLink } from "../components/InviteLink";
import PollsPanel from "../components/PollsPanel";
import type { Friendship, PublicUser } from "@shared/types";

/* ── Pastille avatar ─────────────────────────────────────────────────────── */
function Avatar({ user, size = 44 }: { user: PublicUser; size?: number }) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.display_name}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }}
      />
    );
  }
  const initial = (user.display_name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        display: "grid",
        placeItems: "center",
        background: "var(--surface-2)",
        color: "var(--accent-ink)",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: size * 0.42,
      }}
    >
      {initial}
    </div>
  );
}

export default function Friends() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.friends(),
  });

  // Partage la même clé que PollsPanel (pas de requête en double) : sert juste à
  // savoir s'il existe déjà des sondages, pour ne pas les cacher à un membre sans
  // amis (sondage qu'il a créé, ou reçu en public/partagé).
  const pollsQ = useQuery({ queryKey: ["polls"], queryFn: () => api.polls() });
  const hasPolls = (pollsQ.data?.polls?.length ?? 0) > 0;

  const search = useQuery({
    queryKey: ["search-users", q],
    queryFn: () => api.searchUsers(q),
    enabled: q.trim().length >= 1,
  });

  const friends = data?.friends ?? [];
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["friends"] });
  const onErr = (e: any) => toast.push(e.message || "Erreur", true);

  const requestFriend = useMutation({
    mutationFn: (userId: string) => api.requestFriend(userId),
    onSuccess: (res) => {
      invalidate();
      toast.push(res.status === "accepted" ? "Vous êtes maintenant amis" : "Demande envoyée");
    },
    onError: onErr,
  });

  const acceptFriend = useMutation({
    mutationFn: (id: string) => api.acceptFriend(id),
    onSuccess: () => {
      invalidate();
      toast.push("Demande acceptée");
    },
    onError: onErr,
  });

  const removeFriend = useMutation({
    mutationFn: (id: string) => api.removeFriend(id),
    onSuccess: () => invalidate(),
    onError: onErr,
  });

  const askRemove = async (f: Friendship) => {
    const ok = await confirm(`Retirer ${f.user.display_name} de tes amis ?`);
    if (ok) {
      // La mutation invalide déjà la liste en onSuccess : on ajoute juste le toast.
      removeFriend.mutate(f.id, { onSuccess: () => toast.push("Ami retiré") });
    }
  };

  const results = search.data?.results ?? [];

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Ton cercle</p>
          <h1>Amis &amp; sondages</h1>
          <p className="muted">Retrouve tes proches, invite-les d'un scan et sonde le groupe.</p>
        </div>
        <div className="row gap-2 wrap">
          <InviteLink kind="friend" variant="primary">Inviter par lien</InviteLink>
          <InviteQr kind="friend" variant="soft">QR code</InviteQr>
        </div>
      </div>

      {/* ── Recherche ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "var(--space-5)" }}>
        <div className="row gap-2">
          <Icon name="search" size={18} />
          <input
            className="input"
            style={{ border: "none", padding: "0.3rem 0", background: "transparent" }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher quelqu'un par nom ou @pseudo…"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        {q.trim().length >= 1 && (
          <div style={{ marginTop: "var(--space-4)" }}>
            {search.isLoading ? (
              <Spinner />
            ) : results.length === 0 ? (
              <p className="muted small">Aucun résultat pour « {q} ».</p>
            ) : (
              <div className="grid-cards">
                {results.map((u) => (
                  <div key={u.id} className="card card-pad-sm row" style={{ justifyContent: "space-between" }}>
                    <Link to={`/u/${u.handle}`} className="row gap-3" style={{ minWidth: 0, color: "inherit", textDecoration: "none" }}>
                      <Avatar user={u} size={40} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block" }}>{u.display_name}</strong>
                        {u.handle && <span className="muted small">@{u.handle}</span>}
                      </div>
                    </Link>
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => requestFriend.mutate(u.id)}
                      disabled={requestFriend.isPending && requestFriend.variables === u.id}
                    >
                      Ajouter
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : friends.length === 0 && incoming.length === 0 && outgoing.length === 0 ? (
        /* Compte tout neuf : une seule carte accueillante, pas quatre boîtes
           vides empilées. */
        <div className="card">
          <EmptyState
            icon="friends"
            title="Construis ton cercle"
            hint="Recherche un proche ci-dessus, ou invite quelqu'un d'un simple lien ou QR code — même s'il n'a pas encore de compte."
            action={
              <div className="row gap-2 wrap" style={{ justifyContent: "center" }}>
                <InviteLink kind="friend" variant="primary">Inviter par lien</InviteLink>
                <InviteQr kind="friend" variant="soft">QR code</InviteQr>
              </div>
            }
          />
        </div>
      ) : (
        <div className="col gap-4">
          {/* ── Demandes reçues (seulement s'il y en a) ──────────────── */}
          {incoming.length > 0 && (
            <section className="card">
              <div className="panel-head">
                <h2>Demandes reçues <span className="chip">{incoming.length}</span></h2>
              </div>
              <div className="col gap-3">
                {incoming.map((f) => (
                  <div key={f.id} className="row" style={{ justifyContent: "space-between" }}>
                    <div className="row gap-3" style={{ minWidth: 0 }}>
                      <Avatar user={f.user} size={40} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block" }}>{f.user.display_name}</strong>
                        {f.user.handle && <span className="muted small">@{f.user.handle}</span>}
                      </div>
                    </div>
                    <div className="row gap-2">
                      <button className="btn btn-primary btn-sm" onClick={() => acceptFriend.mutate(f.id)} disabled={acceptFriend.isPending}>
                        Accepter
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => removeFriend.mutate(f.id)} disabled={removeFriend.isPending}>
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── En attente (seulement s'il y en a) ───────────────────── */}
          {outgoing.length > 0 && (
            <section className="card">
              <div className="panel-head">
                <h2>En attente <span className="chip">{outgoing.length}</span></h2>
              </div>
              <div className="col gap-3">
                {outgoing.map((f) => (
                  <div key={f.id} className="row" style={{ justifyContent: "space-between" }}>
                    <div className="row gap-3" style={{ minWidth: 0 }}>
                      <Avatar user={f.user} size={40} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block" }}>{f.user.display_name}</strong>
                        {f.user.handle && <span className="muted small">@{f.user.handle}</span>}
                      </div>
                    </div>
                    <button className="btn btn-soft btn-sm" onClick={() => removeFriend.mutate(f.id)} disabled={removeFriend.isPending}>
                      Annuler
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Mes amis ─────────────────────────────────────────────── */}
          {friends.length > 0 ? (
            <section className="card">
              <div className="panel-head">
                <h2>Mes amis <span className="chip">{friends.length}</span></h2>
              </div>
              <div className="grid-cards">
                {friends.map((f) => (
                  <div key={f.id} className="card card-pad-sm row" style={{ justifyContent: "space-between" }}>
                    <Link to={`/u/${f.user.handle}`} className="row gap-3" style={{ minWidth: 0, color: "inherit", textDecoration: "none" }}>
                      <Avatar user={f.user} size={44} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block" }}>{f.user.display_name}</strong>
                        {f.user.handle && <span className="muted small">@{f.user.handle}</span>}
                      </div>
                    </Link>
                    <button className="btn btn-danger btn-sm" onClick={() => askRemove(f)} disabled={removeFriend.isPending}>
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="card">
              <EmptyState icon="friends" title="Pas encore d'amis" hint="Recherche quelqu'un ci-dessus pour l'ajouter." />
            </section>
          )}
        </div>
      )}

      {/* ── Sondages : visibles dès qu'on a un ami OU qu'il existe déjà des
          sondages (créés, ou reçus en public/partagé). On garde la page d'un
          compte tout neuf épurée sans jamais masquer un sondage existant. ── */}
      {(friends.length > 0 || hasPolls) && (
        <div style={{ marginTop: "var(--space-6)" }}>
          <PollsPanel />
        </div>
      )}

      {confirmNode}
    </div>
  );
}
