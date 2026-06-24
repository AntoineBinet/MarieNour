import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth";
import { Modal, Field, EmptyState, Spinner, useToast, useConfirm } from "../ui";
import { Icon } from "./Icon";
import { VisibilityField, VisibilityChip } from "./VisibilityField";
import type { Poll, PollOption, PublicUser, Visibility } from "@shared/types";

/* ── Temps relatif en français ──────────────────────────────────────────── */
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j < 7) return `il y a ${j} j`;
  const sem = Math.round(j / 7);
  if (sem < 5) return `il y a ${sem} sem`;
  const mois = Math.round(j / 30);
  if (mois < 12) return `il y a ${mois} mois`;
  return `il y a ${Math.round(j / 365)} an(s)`;
}

/* ── Petite pastille d'avatar (initiale par défaut) ─────────────────────── */
function MiniAvatar({ user, size = 22 }: { user: PublicUser; size?: number }) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.display_name}
        title={user.display_name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }}
      />
    );
  }
  const initial = (user.display_name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      title={user.display_name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        display: "grid",
        placeItems: "center",
        background: "var(--surface-2)",
        color: "var(--accent-ink)",
        fontWeight: 600,
        fontSize: size * 0.45,
      }}
    >
      {initial}
    </div>
  );
}

/* ── Carte d'un sondage ─────────────────────────────────────────────────── */
function PollCard({
  poll,
  isAuthor,
  onVote,
  onClose,
  onDelete,
  busy,
}: {
  poll: Poll;
  isAuthor: boolean;
  onVote: (optionIds: string[]) => void;
  onClose: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const total = poll.total_votes;
  const mine = new Set(poll.my_votes);

  const toggle = (opt: PollOption) => {
    if (poll.closed) return;
    if (poll.multi) {
      // Choix multiples : on bascule l'option dans/hors de la sélection.
      const next = new Set(poll.my_votes);
      if (next.has(opt.id)) next.delete(opt.id);
      else next.add(opt.id);
      onVote([...next]);
    } else {
      // Choix unique : re-cliquer sur son choix l'efface, sinon on remplace.
      onVote(mine.has(opt.id) ? [] : [opt.id]);
    }
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", fontSize: "1.05rem" }}>{poll.question}</strong>
          <span className="muted small">
            {poll.author.display_name} · {timeAgo(poll.created_at)}
            {poll.multi && " · choix multiples"}
          </span>
        </div>
        <div className="row gap-2" style={{ flex: "none" }}>
          {isAuthor && <VisibilityChip visibility={poll.visibility} sharedWith={poll.shared_with} />}
          {poll.closed && <span className="chip">Clôturé</span>}
          {isAuthor && !poll.closed && (
            <button className="btn btn-soft btn-icon btn-sm" title="Clôturer" onClick={onClose} disabled={busy}>
              <Icon name="check" size={16} />
            </button>
          )}
          {isAuthor && (
            <button className="btn btn-danger btn-icon btn-sm" title="Supprimer" onClick={onDelete} disabled={busy}>
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="col gap-2" style={{ marginTop: "var(--space-4)" }}>
        {poll.options.map((opt) => {
          const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
          const voted = mine.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt)}
              disabled={poll.closed || busy}
              style={{
                position: "relative",
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: "var(--radius-2, 12px)",
                border: voted ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                background: "var(--surface-2)",
                cursor: poll.closed ? "default" : "pointer",
                overflow: "hidden",
              }}
            >
              {/* Barre de pourcentage horizontale. */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${pct}%`,
                  background: "var(--accent)",
                  opacity: voted ? 0.28 : 0.16,
                  transition: "width .25s ease",
                }}
              />
              <div className="row" style={{ position: "relative", justifyContent: "space-between", gap: "var(--space-3)" }}>
                <span className="row gap-2" style={{ minWidth: 0 }}>
                  {voted && <Icon name="check" size={15} />}
                  <span style={{ fontWeight: voted ? 600 : 500 }}>{opt.label}</span>
                </span>
                <span className="muted small" style={{ flex: "none" }}>
                  {opt.votes} · {pct}%
                </span>
              </div>
              {opt.voters.length > 0 && (
                <div className="row gap-1" style={{ position: "relative", marginTop: 6, flexWrap: "wrap" }}>
                  {opt.voters.map((v) => (
                    <MiniAvatar key={v.id} user={v} size={20} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="row gap-2" style={{ marginTop: "var(--space-3)" }}>
        <Icon name="users" size={15} />
        <span className="muted small">
          {total} vote{total > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

/* ── Modale de création ─────────────────────────────────────────────────── */
function CreateModal({ onClose, onCreate, busy }: { onClose: () => void; onCreate: (b: { question: string; options: string[]; multi: boolean; closes_at: number | null; visibility: Visibility; shared_with: string[] }) => void; busy: boolean }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multi, setMulti] = useState(false);
  const [closeDate, setCloseDate] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("friends");
  const [sharedWith, setSharedWith] = useState<string[]>([]);

  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));
  const addOpt = () => setOptions((o) => (o.length >= 10 ? o : [...o, ""]));
  const removeOpt = (i: number) => setOptions((o) => (o.length <= 2 ? o : o.filter((_, idx) => idx !== i)));

  const submit = () => {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    const closes_at = closeDate ? new Date(closeDate + "T23:59:59").getTime() : null;
    onCreate({ question: question.trim(), options: clean, multi, closes_at, visibility, shared_with: sharedWith });
  };

  const valid = question.trim().length > 0 && options.map((o) => o.trim()).filter(Boolean).length >= 2;

  return (
    <Modal
      title="Nouveau sondage"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>Créer</button>
        </>
      }
    >
      <Field label="Question">
        <textarea
          className="input"
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="On part où ce week-end ?"
        />
      </Field>

      <Field label="Options">
        <div className="col gap-2">
          {options.map((o, i) => (
            <div key={i} className="row gap-2">
              <input
                className="input"
                value={o}
                onChange={(e) => setOpt(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-soft btn-icon btn-sm"
                onClick={() => removeOpt(i)}
                disabled={options.length <= 2}
                title="Retirer"
                type="button"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
          {options.length < 10 && (
            <button className="btn btn-soft btn-sm" onClick={addOpt} type="button">
              <Icon name="plus" size={15} /> Ajouter une option
            </button>
          )}
        </div>
      </Field>

      <Field label="Date de clôture (optionnel)">
        <input className="input" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
      </Field>

      <Field label="Visibilité">
        <VisibilityField
          value={visibility}
          sharedWith={sharedWith}
          onChange={setVisibility}
          onSharedWithChange={setSharedWith}
        />
      </Field>

      <label className="row gap-2" style={{ cursor: "pointer", marginTop: "var(--space-2)" }}>
        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
        <span>Autoriser les choix multiples</span>
      </label>
    </Modal>
  );
}

/* ── Panneau principal ──────────────────────────────────────────────────── */
export default function PollsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { confirm, confirmNode } = useConfirm();
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["polls"],
    queryFn: () => api.polls(),
  });

  const polls = data?.polls ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["polls"] });
  const onErr = (e: any) => toast.push(e?.message || "Erreur", true);

  const createPoll = useMutation({
    mutationFn: (b: { question: string; options: string[]; multi: boolean; closes_at: number | null; visibility: Visibility; shared_with: string[] }) => api.createPoll(b),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      toast.push("Sondage créé");
    },
    onError: onErr,
  });

  const votePoll = useMutation({
    mutationFn: ({ id, optionIds }: { id: string; optionIds: string[] }) => api.votePoll(id, optionIds),
    onSuccess: () => invalidate(),
    onError: onErr,
  });

  const closePoll = useMutation({
    mutationFn: (id: string) => api.closePoll(id),
    onSuccess: () => {
      invalidate();
      toast.push("Sondage clôturé");
    },
    onError: onErr,
  });

  const deletePoll = useMutation({
    mutationFn: (id: string) => api.deletePoll(id),
    onSuccess: () => {
      invalidate();
      toast.push("Sondage supprimé");
    },
    onError: onErr,
  });

  const askClose = async (poll: Poll) => {
    if (await confirm(`Clôturer le sondage « ${poll.question} » ? Les votes seront figés.`)) closePoll.mutate(poll.id);
  };
  const askDelete = async (poll: Poll) => {
    if (await confirm(`Supprimer le sondage « ${poll.question} » ?`)) deletePoll.mutate(poll.id);
  };

  const busy = votePoll.isPending || closePoll.isPending || deletePoll.isPending;

  return (
    <section className="card">
      <div className="panel-head row" style={{ justifyContent: "space-between" }}>
        <h2 className="row gap-2">
          <Icon name="polls" size={20} /> Sondages
        </h2>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Nouveau sondage
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : polls.length === 0 ? (
        <EmptyState
          icon="polls"
          title="Aucun sondage"
          hint="Lance une question à tes amis pour décider ensemble."
          action={
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} /> Créer un sondage
            </button>
          }
        />
      ) : (
        <div className="col gap-4" style={{ marginTop: "var(--space-4)" }}>
          {polls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              isAuthor={!!user && user.id === poll.author.id}
              onVote={(optionIds) => votePoll.mutate({ id: poll.id, optionIds })}
              onClose={() => askClose(poll)}
              onDelete={() => askDelete(poll)}
              busy={busy}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateModal onClose={() => setCreating(false)} onCreate={(b) => createPoll.mutate(b)} busy={createPoll.isPending} />
      )}
      {confirmNode}
    </section>
  );
}
