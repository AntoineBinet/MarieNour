import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { Spinner, EmptyState, useToast } from "../ui";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import type { PublicUser } from "@shared/types";

interface ProfileRecipe { id: string; title: string; image_url: string | null }
interface ProfileTrip { id: string; title: string; destination: string | null; cover_url: string | null }
interface ProfileBoard { id: string; title: string; cover_url: string | null }

/* ── Carte média générique ───────────────────────────────────────────────── */
function CoverCard({ title, cover, subtitle, fallback }: { title: string; cover: string | null; subtitle?: string | null; fallback: IconName }) {
  return (
    <div className="card card-pad-sm" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 140 }}>
        {cover ? (
          <img src={cover} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "var(--muted)", background: "var(--surface-2)" }}>
            <Icon name={fallback} size={42} />
          </div>
        )}
      </div>
      <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 4 }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.02rem" }}>{title}</strong>
        {subtitle && <span className="muted small">{subtitle}</span>}
      </div>
    </div>
  );
}

export default function PublicProfile() {
  const { handle } = useParams();
  const toast = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile", handle],
    queryFn: () => api.profile(handle!),
    enabled: !!handle,
    retry: false,
  });

  const requestFriend = useMutation({
    mutationFn: (userId: string) => api.requestFriend(userId),
    onSuccess: (res) => {
      toast.push(res.status === "accepted" ? "Vous êtes maintenant amis" : "Demande envoyée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  if (isLoading) return <Spinner />;

  if (isError || !data?.user) {
    return <EmptyState icon="search" title="Profil introuvable" hint="Ce profil n'existe pas ou n'est plus accessible." />;
  }

  const user = data.user as PublicUser;
  const isSelf = data.is_self;
  const isFriend = data.is_friend;
  const recipes = (data.recipes ?? []) as ProfileRecipe[];
  const trips = (data.trips ?? []) as ProfileTrip[];
  const boards = (data.boards ?? []) as ProfileBoard[];

  const initial = (user.display_name || "?").trim().charAt(0).toUpperCase();

  return (
    <div data-accent={user.accent || undefined}>
      {/* ── En-tête profil ───────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "var(--space-5)" }}>
        <div className="row wrap" style={{ justifyContent: "space-between", gap: "var(--space-4)" }}>
          <div className="row gap-4" style={{ minWidth: 0 }}>
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name}
                style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", flex: "none" }}
              />
            ) : (
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: "50%",
                  flex: "none",
                  display: "grid",
                  placeItems: "center",
                  background: "var(--surface-2)",
                  color: "var(--accent-ink)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "2.2rem",
                }}
              >
                {initial}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <h1>{user.display_name}</h1>
              {user.handle && <p className="muted">@{user.handle}</p>}
              {user.bio && <p style={{ marginTop: "var(--space-2)" }}>{user.bio}</p>}
            </div>
          </div>

          {!isSelf && !isFriend && (
            <button
              className="btn btn-primary"
              onClick={() => requestFriend.mutate(user.id)}
              disabled={requestFriend.isPending}
            >
              <Icon name="plus" size={15} /> Ajouter en ami
            </button>
          )}
          {isFriend && <span className="chip chip-accent"><Icon name="check" size={14} /> Ami</span>}
        </div>
      </div>

      {/* ── Recettes ─────────────────────────────────────────────────── */}
      {recipes.length > 0 && (
        <section style={{ marginBottom: "var(--space-6)" }}>
          <div className="panel-head">
            <h2>Recettes</h2>
          </div>
          <div className="grid-cards">
            {recipes.map((r) => (
              <CoverCard key={r.id} title={r.title} cover={r.image_url} fallback="fork" />
            ))}
          </div>
        </section>
      )}

      {/* ── Voyages ──────────────────────────────────────────────────── */}
      {trips.length > 0 && (
        <section style={{ marginBottom: "var(--space-6)" }}>
          <div className="panel-head">
            <h2>Voyages</h2>
          </div>
          <div className="grid-cards">
            {trips.map((t) => (
              <CoverCard key={t.id} title={t.title} cover={t.cover_url} subtitle={t.destination} fallback="plane" />
            ))}
          </div>
        </section>
      )}

      {/* ── Tableaux ─────────────────────────────────────────────────── */}
      {boards.length > 0 && (
        <section style={{ marginBottom: "var(--space-6)" }}>
          <div className="panel-head">
            <h2>Tableaux</h2>
          </div>
          <div className="grid-cards">
            {boards.map((b) => (
              <CoverCard key={b.id} title={b.title} cover={b.cover_url} fallback="bookmark" />
            ))}
          </div>
        </section>
      )}

      {recipes.length === 0 && trips.length === 0 && boards.length === 0 && (
        <p className="muted">
          {isSelf ? "Tu n'as encore rien partagé publiquement." : "Cette personne n'a encore rien partagé."}
        </p>
      )}
    </div>
  );
}
