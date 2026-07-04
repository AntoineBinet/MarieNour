import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { takeCompose } from "../compose";
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
import { VisibilityField, VisibilityChip } from "../components/VisibilityField";
import type { List, ListItem, Visibility } from "@shared/types";

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "var(--surface-2)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--accent)",
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {done}/{total} terminé{total > 1 ? "s" : ""}
      </p>
    </div>
  );
}

function ListCard({ list, onOpen }: { list: List; onOpen: () => void }) {
  const total = list.item_count ?? 0;
  const done = list.done_count ?? 0;
  return (
    // Carte tappable en entier sur mobile ; le bouton « Ouvrir » reste pour le clavier.
    <div className="card" style={{ display: "flex", flexDirection: "column", cursor: "pointer" }} onClick={onOpen}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>{list.emoji || "📝"}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 style={{ wordBreak: "break-word" }}>{list.title}</h3>
        </div>
      </div>
      <ProgressBar done={done} total={total} />
      <div className="row wrap gap-2" style={{ marginTop: "var(--space-4)" }}>
        <span className="chip">{list.kind === "checklist" ? "Checklist" : "Liste"}</span>
        <VisibilityChip visibility={list.visibility} sharedWith={list.shared_with} />
        <span className="spacer" />
        <button className="btn btn-soft btn-sm" onClick={onOpen}>Ouvrir</button>
      </div>
    </div>
  );
}

/* ── Modal de création ──────────────────────────────────────────────────── */
function CreateListModal({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: { title?: string; emoji?: string; kind?: List["kind"] };
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "📝");
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [kind, setKind] = useState<List["kind"]>(initial?.kind ?? "checklist");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [sharedWith, setSharedWith] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () => api.createList({ title: title.trim(), emoji: emoji || "📝", color, kind, visibility, shared_with: sharedWith }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lists"] });
      toast.push("Liste créée");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  return (
    <Modal
      title="Nouvelle liste"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary"
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Créer
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
          placeholder="Courses, à lire, idées cadeaux…"
          enterKeyHint="done"
          autoCapitalize="sentences"
          autoComplete="off"
          onKeyDown={(e) => e.key === "Enter" && title.trim() && create.mutate()}
        />
      </Field>
      <div className="row gap-3" style={{ marginTop: "var(--space-4)" }}>
        <div style={{ width: 90 }}>
          <Field label="Emoji">
            <input className="input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2} style={{ textAlign: "center" }} />
          </Field>
        </div>
        <div className="grow">
          <Field label="Type">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as List["kind"])}>
              <option value="checklist">Checklist</option>
              <option value="list">Liste</option>
            </select>
          </Field>
        </div>
      </div>
      <Field label="Couleur">
        <SwatchRow value={color} onChange={setColor} />
      </Field>
      <Field label="Visibilité">
        <VisibilityField
          value={visibility}
          sharedWith={sharedWith}
          onChange={setVisibility}
          onSharedWithChange={setSharedWith}
        />
      </Field>
    </Modal>
  );
}

/* ── Modal de détail / édition ──────────────────────────────────────────── */
function ListDetailModal({ listId, onClose }: { listId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [newItem, setNewItem] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["list", listId], queryFn: () => api.list(listId) });
  const list = data?.list;
  const items = list?.items ?? [];

  // Champs d'édition (initialisés depuis la liste chargée).
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📝");
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [sharedWith, setSharedWith] = useState<string[]>([]);

  const startEdit = () => {
    if (!list) return;
    setTitle(list.title);
    setEmoji(list.emoji || "📝");
    setColor(list.color || NOTE_COLORS[0]);
    setVisibility(list.visibility);
    setSharedWith(list.shared_with ?? []);
    setEditing(true);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["list", listId] });
    qc.invalidateQueries({ queryKey: ["lists"] });
  };

  const saveList = useMutation({
    mutationFn: () => api.updateList(listId, { title: title.trim(), emoji: emoji || "📝", color, visibility, shared_with: sharedWith }),
    onSuccess: () => {
      invalidate();
      toast.push("Liste mise à jour");
      setEditing(false);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const toggleItem = useMutation({
    mutationFn: (item: ListItem) => api.updateListItem(listId, item.id, { done: !item.done }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const addItem = useMutation({
    mutationFn: (content: string) => api.addListItem(listId, { content }),
    onSuccess: () => {
      invalidate();
      setNewItem("");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.deleteListItem(listId, itemId),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const archive = useMutation({
    mutationFn: () => api.updateList(listId, { archived: true }),
    onSuccess: () => {
      invalidate();
      toast.push("Liste archivée");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const removeList = useMutation({
    mutationFn: () => api.deleteList(listId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lists"] });
      toast.push("Liste supprimée");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async () => {
    if (await confirm("Supprimer définitivement cette liste et tous ses éléments ?")) removeList.mutate();
  };

  const submitItem = () => {
    const v = newItem.trim();
    if (v) addItem.mutate(v);
  };

  return (
    <>
      <Modal
        title={
          isLoading || !list ? (
            "Chargement…"
          ) : (
            <span className="row gap-2">
              <span>{list.emoji || "📝"}</span> {list.title}
            </span>
          )
        }
        onClose={onClose}
        wide
      >
        {isLoading || !list ? (
          <Spinner />
        ) : editing ? (
          <div>
            <Field label="Titre">
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                enterKeyHint="done"
                autoCapitalize="sentences"
                autoComplete="off"
              />
            </Field>
            <div className="row gap-3" style={{ marginTop: "var(--space-4)" }}>
              <div style={{ width: 90 }}>
                <Field label="Emoji">
                  <input className="input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2} style={{ textAlign: "center" }} />
                </Field>
              </div>
              <div className="grow">
                <Field label="Visibilité">
                  <VisibilityField
                    value={visibility}
                    sharedWith={sharedWith}
                    onChange={setVisibility}
                    onSharedWithChange={setSharedWith}
                  />
                </Field>
              </div>
            </div>
            <Field label="Couleur">
              <SwatchRow value={color} onChange={setColor} />
            </Field>
            <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: "var(--space-5)" }}>
              <button className="btn btn-soft" onClick={() => setEditing(false)}>Annuler</button>
              <button className="btn btn-primary" disabled={!title.trim() || saveList.isPending} onClick={() => saveList.mutate()}>
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="row wrap gap-2" style={{ marginBottom: "var(--space-4)" }}>
              <span className="chip">{list.kind === "checklist" ? "Checklist" : "Liste"}</span>
              <VisibilityChip visibility={list.visibility} sharedWith={list.shared_with} />
              <span className="spacer" />
              <button className="btn btn-soft btn-sm" onClick={startEdit}><Icon name="edit" size={15} /> Modifier</button>
              <button className="btn btn-soft btn-sm" onClick={() => archive.mutate()} disabled={archive.isPending}><Icon name="archive" size={15} /> Archiver</button>
              <button className="btn btn-danger btn-sm" onClick={askDelete}><Icon name="trash" size={15} /> Supprimer</button>
            </div>

            <div className="row gap-2" style={{ marginBottom: "var(--space-4)" }}>
              <input
                className="input"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Ajouter un élément…"
                enterKeyHint="send"
                autoCapitalize="sentences"
                autoComplete="off"
                onKeyDown={(e) => e.key === "Enter" && submitItem()}
              />
              <button className="btn btn-primary" onClick={submitItem} disabled={!newItem.trim() || addItem.isPending} aria-label="Ajouter">
                <Icon name="plus" size={15} />
              </button>
            </div>

            {items.length === 0 ? (
              <EmptyState icon="lists" title="Liste vide" hint="Ajoute ton premier élément ci-dessus." />
            ) : (
              <div className="stack" style={{ marginTop: 0 }}>
                {items.map((item) => (
                  <div className="li-row" key={item.id}>
                    <button
                      className={`check${item.done ? " done" : ""}`}
                      onClick={() => toggleItem.mutate(item)}
                      aria-label={item.done ? "Marquer non fait" : "Marquer fait"}
                    >
                      {item.done ? <Icon name="check" size={14} /> : ""}
                    </button>
                    <span className={`li-text grow${item.done ? " done" : ""}`} style={{ wordBreak: "break-word" }}>
                      {item.content}
                    </span>
                    <button
                      className="btn btn-icon btn-soft btn-sm"
                      onClick={() => removeItem.mutate(item.id)}
                      aria-label="Supprimer l'élément"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
      {confirmNode}
    </>
  );
}

/* ── Carte archivée ─────────────────────────────────────────────────────── */
function ArchivedCard({ list }: { list: List }) {
  const qc = useQueryClient();
  const toast = useToast();
  const unarchive = useMutation({
    mutationFn: () => api.updateList(list.id, { archived: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lists", "archived"] });
      qc.invalidateQueries({ queryKey: ["lists"] });
      toast.push("Liste désarchivée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  return (
    <div className="card card-pad-sm row" style={{ justifyContent: "space-between" }}>
      <span className="row gap-2" style={{ minWidth: 0 }}>
        <span style={{ fontSize: "1.3rem" }}>{list.emoji || "📝"}</span>
        <span style={{ wordBreak: "break-word" }}>{list.title}</span>
      </span>
      <button className="btn btn-soft btn-sm" onClick={() => unarchive.mutate()} disabled={unarchive.isPending}>
        Désarchiver
      </button>
    </div>
  );
}

export default function Lists() {
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [prefill, setPrefill] = useState<{ title?: string; emoji?: string; kind?: List["kind"] } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Ouverture pré-remplie depuis une note convertie (« Transformer en liste »).
  useEffect(() => {
    const c = takeCompose("list");
    if (!c) return;
    setPrefill(c.prefill as { title?: string; emoji?: string; kind?: List["kind"] });
    setCreating(true);
  }, []);

  // Quick-add : /listes?new=1 ouvre la création puis nettoie l'URL (idempotent,
  // compatible React.StrictMode grâce à la mise à jour fonctionnelle).
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setCreating(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const { data, isLoading } = useQuery({ queryKey: ["lists"], queryFn: () => api.lists() });
  const lists = data?.lists ?? [];

  const { data: archivedData, isLoading: archivedLoading } = useQuery({
    queryKey: ["lists", "archived"],
    queryFn: () => api.lists(true),
    enabled: showArchived,
  });
  const archived = archivedData?.lists ?? [];

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Organisation</p>
          <h1>Listes & checklists</h1>
          <p className="muted">Tout ce que tu veux cocher, suivre et ne pas oublier.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Nouvelle liste</button>
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
        <button
          className={`btn btn-sm ${showArchived ? "btn-soft" : "btn-ghost"}`}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? (
            <><Icon name="arrowLeft" size={15} /> Masquer les archives</>
          ) : (
            <><Icon name="archive" size={15} /> Voir les archives</>
          )}
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : lists.length === 0 ? (
        <EmptyState
          icon="lists"
          title="Aucune liste pour l'instant"
          hint="Crée ta première liste pour commencer à t'organiser."
          action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Nouvelle liste</button>}
        />
      ) : (
        <div className="grid-cards">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} onOpen={() => setOpenId(list.id)} />
          ))}
        </div>
      )}

      {showArchived && (
        <div style={{ marginTop: "var(--space-6)" }}>
          <h2 style={{ marginBottom: "var(--space-3)" }}>Archives</h2>
          {archivedLoading ? (
            <Spinner />
          ) : archived.length === 0 ? (
            <p className="muted">Aucune liste archivée.</p>
          ) : (
            <div className="stack">
              {archived.map((list) => (
                <ArchivedCard key={list.id} list={list} />
              ))}
            </div>
          )}
        </div>
      )}

      {creating && (
        <CreateListModal
          initial={prefill ?? undefined}
          onClose={() => {
            setCreating(false);
            setPrefill(null);
          }}
        />
      )}
      {openId && <ListDetailModal listId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
