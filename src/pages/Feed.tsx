import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Spinner, EmptyState, useToast } from "../ui";
import type { Comment, FeedItem } from "@shared/types";

/* ── Temps relatif en français ──────────────────────────────────────────── */
function timeAgo(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/* ── Libellés des types de contenu ──────────────────────────────────────── */
const ENTITY_LABELS: Record<string, { emoji: string; label: string }> = {
  note: { emoji: "🗒️", label: "Note" },
  recipe: { emoji: "🍲", label: "Recette" },
  trip: { emoji: "✈️", label: "Voyage" },
  board: { emoji: "🗂️", label: "Tableau" },
  inspiration: { emoji: "✨", label: "Inspiration" },
  media: { emoji: "📸", label: "Photo" },
  list: { emoji: "✅", label: "Liste" },
};
const entityMeta = (t: string) => ENTITY_LABELS[t] ?? { emoji: "📌", label: t };

/* ── Avatar ─────────────────────────────────────────────────────────────── */
function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flex: "none" }}
      />
    );
  }
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        flex: "none",
        display: "grid",
        placeItems: "center",
        background: "var(--surface-2)",
        fontSize: "1.2rem",
      }}
      aria-hidden
    >
      🌸
    </div>
  );
}

/* ── Section commentaires (chargée à l'ouverture) ───────────────────────── */
function CommentsSection({ item }: { item: FeedItem }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["comments", item.entity_type, item.entity_id],
    queryFn: () => api.comments(item.entity_type, item.entity_id),
  });
  const comments: Comment[] = data?.comments ?? [];

  const add = useMutation({
    mutationFn: (text: string) => api.addComment(item.entity_type, item.entity_id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", item.entity_type, item.entity_id] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      setBody("");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const submit = () => {
    const text = body.trim();
    if (!text || add.isPending) return;
    add.mutate(text);
  };

  return (
    <div
      className="col gap-3"
      style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}
    >
      {isLoading ? (
        <Spinner />
      ) : comments.length === 0 ? (
        <p className="muted small">Aucun commentaire pour l'instant. Lance la conversation 💬</p>
      ) : (
        comments.map((c) => (
          <div key={c.id} className="row gap-2" style={{ alignItems: "flex-start" }}>
            <Avatar url={c.author.avatar_url} name={c.author.display_name} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-2 wrap" style={{ rowGap: 0 }}>
                {c.author.handle ? (
                  <Link to={`/u/${c.author.handle}`} style={{ fontWeight: 600 }}>{c.author.display_name}</Link>
                ) : (
                  <strong>{c.author.display_name}</strong>
                )}
                <span className="muted small">· {timeAgo(c.created_at)}</span>
              </div>
              <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink-2)" }}>{c.body}</p>
            </div>
          </div>
        ))
      )}

      <div className="row gap-2">
        <input
          className="input grow"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Écris un commentaire…"
        />
        <button className="btn btn-soft" onClick={submit} disabled={!body.trim() || add.isPending}>
          Envoyer
        </button>
      </div>
    </div>
  );
}

/* ── Carte du fil ───────────────────────────────────────────────────────── */
function FeedCard({ item }: { item: FeedItem }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [showComments, setShowComments] = useState(false);
  const meta = entityMeta(item.entity_type);
  const author = item.author;

  const like = useMutation({
    mutationFn: () => api.like(item.entity_type, item.entity_id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["feed"] });
      const prev = qc.getQueryData<{ feed: FeedItem[] }>(["feed"]);
      qc.setQueryData<{ feed: FeedItem[] }>(["feed"], (old) =>
        old
          ? {
              feed: old.feed.map((f) =>
                f.entity_type === item.entity_type && f.entity_id === item.entity_id
                  ? {
                      ...f,
                      liked_by_me: !f.liked_by_me,
                      like_count: f.like_count + (f.liked_by_me ? -1 : 1),
                    }
                  : f,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["feed"], ctx.prev);
      toast.push(e.message || "Erreur", true);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });

  return (
    <div className="card">
      <div className="row gap-3" style={{ alignItems: "center", marginBottom: "var(--space-3)" }}>
        <Avatar url={author.avatar_url} name={author.display_name} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row gap-2 wrap" style={{ rowGap: 0 }}>
            {author.handle ? (
              <Link to={`/u/${author.handle}`} style={{ fontWeight: 600 }}>{author.display_name}</Link>
            ) : (
              <strong>{author.display_name}</strong>
            )}
            {author.handle && <span className="muted small">@{author.handle}</span>}
          </div>
          <span className="muted small">{timeAgo(item.created_at)}</span>
        </div>
        <span className="chip" style={{ flex: "none" }}>{meta.emoji} {meta.label}</span>
      </div>

      {item.title && (
        <h3 style={{ marginBottom: 6, wordBreak: "break-word" }}>{item.title}</h3>
      )}
      {item.preview && (
        <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink-2)" }}>{item.preview}</p>
      )}
      {item.image_url && (
        <img
          src={item.image_url}
          alt={item.title ?? ""}
          loading="lazy"
          style={{
            width: "100%",
            marginTop: "var(--space-3)",
            borderRadius: "var(--radius)",
            display: "block",
            objectFit: "cover",
          }}
        />
      )}

      <div className="row gap-2" style={{ marginTop: "var(--space-4)" }}>
        <button
          className="btn btn-soft btn-sm"
          onClick={() => like.mutate()}
          aria-label={item.liked_by_me ? "Je n'aime plus" : "J'aime"}
        >
          {item.liked_by_me ? "❤️" : "🤍"} {item.like_count}
        </button>
        <button
          className={`btn btn-sm ${showComments ? "btn-primary" : "btn-soft"}`}
          onClick={() => setShowComments((v) => !v)}
          aria-expanded={showComments}
        >
          💬 {item.comment_count}
        </button>
      </div>

      {showComments && <CommentsSection item={item} />}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Feed() {
  const { data, isLoading } = useQuery({ queryKey: ["feed"], queryFn: () => api.feed() });
  const feed = data?.feed ?? [];

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Tes amis</p>
          <h1>Le fil 🫶</h1>
          <p className="muted">Ce que tes amis partagent en ce moment.</p>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : feed.length === 0 ? (
        <EmptyState
          emoji="🍃"
          title="Ton fil est calme"
          hint="Quand tes amis partageront des recettes, voyages ou inspirations, tu les verras ici."
          action={<Link className="btn btn-primary" to="/amis">Ajouter des amis</Link>}
        />
      ) : (
        <div className="col gap-4" style={{ maxWidth: 620, margin: "0 auto" }}>
          {feed.map((item) => (
            <FeedCard key={`${item.entity_type}:${item.entity_id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
