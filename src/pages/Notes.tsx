import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import {
  Modal,
  Spinner,
  EmptyState,
  Field,
  useToast,
  useConfirm,
  SwatchRow,
  NOTE_COLORS,
} from "../ui";
import { Icon } from "../components/Icon";
import type { Note, Visibility } from "@shared/types";

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: "private", label: "Privé" },
  { value: "friends", label: "Amis" },
  { value: "public", label: "Public" },
];
const visLabel = (v: Visibility) => VISIBILITIES.find((x) => x.value === v)?.label ?? v;

function VisibilitySelect({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as Visibility)}>
      {VISIBILITIES.map((v) => (
        <option key={v.value} value={v.value}>{v.label}</option>
      ))}
    </select>
  );
}

/* ── Formulaire création / édition ──────────────────────────────────────── */
function NoteForm({ initial, onClose }: { initial?: Note; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [color, setColor] = useState(initial?.color ?? NOTE_COLORS[0]);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "private");

  const buildBody = (): Partial<Note> => ({
    title: title.trim() || null,
    body: body.trim() || null,
    color,
    visibility,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (initial) await api.updateNote(initial.id, buildBody());
      else await api.createNote(buildBody());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast.push(initial ? "Note mise à jour" : "Note créée");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const canSave = (title.trim() || body.trim()) && !save.isPending;

  return (
    <Modal
      title={initial ? "Modifier la note" : "Nouvelle note"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={() => save.mutate()}>
            {initial ? "Enregistrer" : "Créer"}
          </button>
        </>
      }
    >
      <Field label="Titre">
        <input
          className="input"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Une idée, un rappel, une pensée…"
        />
      </Field>
      <Field label="Contenu">
        <textarea
          className="textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Écris ce que tu veux garder…"
          rows={6}
        />
      </Field>
      <Field label="Couleur">
        <SwatchRow value={color} onChange={setColor} />
      </Field>
      <Field label="Visibilité">
        <VisibilitySelect value={visibility} onChange={setVisibility} />
      </Field>
    </Modal>
  );
}

/* ── Carte note ─────────────────────────────────────────────────────────── */
function NoteCard({
  note,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  note: Note;
  onEdit: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="card card-pad-sm"
      style={{
        background: `var(--${note.color})`,
        borderColor: "transparent",
        cursor: "pointer",
      }}
      onClick={onEdit}
    >
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow" style={{ minWidth: 0 }}>
          {note.title && (
            <h3 style={{ wordBreak: "break-word", marginBottom: note.body ? 6 : 0 }}>{note.title}</h3>
          )}
        </div>
        <button
          className="btn btn-icon btn-sm"
          style={{ background: note.pinned ? "rgba(0,0,0,0.08)" : "transparent", flex: "none" }}
          aria-label={note.pinned ? "Détacher" : "Épingler"}
          title={note.pinned ? "Détacher" : "Épingler"}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
        >
          <Icon name="pin" size={16} filled={note.pinned} />
        </button>
      </div>

      {note.body && (
        <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink-2)" }}>
          {note.body}
        </p>
      )}

      <div className="row wrap gap-2" style={{ marginTop: "var(--space-3)" }}>
        <span className="chip">{visLabel(note.visibility)}</span>
        <span className="spacer" />
        <button
          className="btn btn-icon btn-soft btn-sm"
          aria-label="Modifier"
          title="Modifier"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Icon name="edit" size={15} />
        </button>
        <button
          className="btn btn-icon btn-danger btn-sm"
          aria-label="Supprimer"
          title="Supprimer"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Notes() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["notes", q],
    queryFn: () => api.notes(q),
  });
  const notes = data?.notes ?? [];

  const togglePin = useMutation({
    mutationFn: (note: Note) => api.updateNote(note.id, { pinned: !note.pinned }),
    onSuccess: (_d, note) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast.push(note.pinned ? "Note détachée" : "Note épinglée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast.push("Note supprimée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async (note: Note) => {
    const ok = await confirm(`Supprimer définitivement « ${note.title || "cette note"} » ?`);
    if (ok) remove.mutate(note.id);
  };

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Tes pensées</p>
          <h1>Notes & idées</h1>
          <p className="muted">Capture tout ce qui te passe par la tête, épingle l'essentiel.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Nouvelle note</button>
      </div>

      <div className="row" style={{ marginBottom: "var(--space-5)" }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher dans tes notes…"
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : notes.length === 0 ? (
        <EmptyState
          icon="notes"
          title={q ? "Aucune note trouvée" : "Pas encore de notes"}
          hint={q ? "Essaie un autre mot-clé." : "Note une idée, un rappel ou une envie en un clic."}
          action={
            !q ? (
              <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Créer ma première note</button>
            ) : undefined
          }
        />
      ) : (
        <div className="masonry">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={() => setEditing(note)}
              onTogglePin={() => togglePin.mutate(note)}
              onDelete={() => askDelete(note)}
            />
          ))}
        </div>
      )}

      {creating && <NoteForm onClose={() => setCreating(false)} />}
      {editing && <NoteForm initial={editing} onClose={() => setEditing(null)} />}

      {confirmNode}
    </div>
  );
}
