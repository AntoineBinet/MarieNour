import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Spinner, EmptyState, useToast, useConfirm } from "../ui";
import { Icon } from "../components/Icon";
import { InviteQr } from "../components/InviteQr";
import PollsPanel from "../components/PollsPanel";
import type { Friendship, PublicUser } from "@shared/types";

/* ── Pastille avatar ─────────────────────────────────────────────────────── */
function Avatar({ user, size = 44 }: { user: PublicUser; size?: number }) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.display_name}
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
      removeFriend.mutate(f.id, { onSuccess: () => { invalidate(); toast.push("Ami retiré"); } });
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
        <InviteQr kind="friend" variant="primary">Inviter un ami</InviteQr>
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
                      disabled={requestFriend.isPending}
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
      ) : (
        <div className="col gap-4">
          {/* ── Demandes reçues ──────────────────────────────────────── */}
          <section className="card">
            <div className="panel-head">
              <h2>Demandes reçues {incoming.length > 0 && <span className="chip">{incoming.length}</span>}</h2>
            </div>
            {incoming.length === 0 ? (
              <EmptyState icon="bell" title="Aucune demande" hint="Les invitations reçues apparaîtront ici." />
            ) : (
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
            )}
          </section>

          {/* ── En attente ───────────────────────────────────────────── */}
          <section className="card">
            <div className="panel-head">
              <h2>En attente {outgoing.length > 0 && <span className="chip">{outgoing.length}</span>}</h2>
            </div>
            {outgoing.length === 0 ? (
              <EmptyState icon="clock" title="Aucune demande en attente" hint="Tes invitations envoyées apparaîtront ici." />
            ) : (
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
            )}
          </section>

          {/* ── Mes amis ─────────────────────────────────────────────── */}
          <section className="card">
            <div className="panel-head">
              <h2>Mes amis {friends.length > 0 && <span className="chip">{friends.length}</span>}</h2>
            </div>
            {friends.length === 0 ? (
              <EmptyState icon="friends" title="Pas encore d'amis" hint="Recherche quelqu'un ci-dessus pour l'ajouter." />
            ) : (
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
            )}
          </section>
        </div>
      )}

      {/* ── Sondages ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: "var(--space-6)" }}>
        <PollsPanel />
      </div>

      {confirmNode}
    </div>
  );
}
