import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import type { Board, Inspiration, Visibility } from "@shared/types";

const VIS_LABEL: Record<Visibility, string> = {
  private: "Privé",
  friends: "Amis",
  public: "Public",
};

const SOURCES: { value: string; icon: IconName; label: string }[] = [
  { value: "instagram", icon: "camera", label: "Instagram" },
  { value: "tiktok", icon: "music", label: "TikTok" },
  { value: "pinterest", icon: "pin", label: "Pinterest" },
  { value: "youtube", icon: "globe", label: "YouTube" },
  { value: "web", icon: "globe", label: "Web" },
];

function sourceIcon(source: string): IconName {
  return SOURCES.find((s) => s.value === source)?.icon ?? "globe";
}
function sourceLabel(source: string): string {
  return SOURCES.find((s) => s.value === source)?.label ?? source;
}

/* ── Carte inspiration ──────────────────────────────────────────────────── */
function InspoCard({
  ins,
  actions,
}: {
  ins: Inspiration;
  actions?: React.ReactNode;
}) {
  return (
    <div className="card card-pad-sm" style={{ padding: 0, overflow: "hidden" }}>
      {ins.image_url && (
        <img src={ins.image_url} alt={ins.title ?? ""} style={{ width: "100%", display: "block", objectFit: "cover" }} />
      )}
      <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {ins.title && <strong style={{ fontFamily: "var(--font-display)" }}>{ins.title}</strong>}
        <div className="row gap-2 wrap">
          <span className="chip"><Icon name={sourceIcon(ins.source)} size={14} /> {sourceLabel(ins.source)}</span>
        </div>
        {ins.note && <p className="muted small">{ins.note}</p>}
        {ins.url && (
          <a href={ins.url} target="_blank" rel="noreferrer" className="small"><Icon name="link" size={14} /> Ouvrir</a>
        )}
        {actions && <div className="row gap-2 wrap" style={{ marginTop: "var(--space-2)" }}>{actions}</div>}
      </div>
    </div>
  );
}

/* ── Modal : choisir un tableau pour garder une inspiration ─────────────── */
function KeepModal({
  ins,
  onClose,
}: {
  ins: Inspiration;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["boards"], queryFn: () => api.boards() });
  const boards = data?.boards ?? [];
  const [boardId, setBoardId] = useState<string>("");

  const keep = useMutation({
    mutationFn: () => api.updateInspiration(ins.id, { status: "kept", board_id: boardId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspirations"] });
      qc.invalidateQueries({ queryKey: ["boards"] });
      toast.push("Inspiration gardée");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  return (
    <Modal
      title="Garder l'inspiration"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => keep.mutate()} disabled={keep.isPending}>
            {keep.isPending ? "…" : "Garder"}
          </button>
        </>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <Field label="Ranger dans un tableau">
          <select className="select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
            <option value="">Aucun (sans tableau)</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
        </Field>
      )}
    </Modal>
  );
}

/* ── Formulaire tableau (création / édition) ────────────────────────────── */
function BoardForm({
  initial,
  onClose,
}: {
  initial?: Board;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.cover_url ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "private");

  const buildBody = (): Partial<Board> => ({
    title: title.trim(),
    description: description.trim() || null,
    cover_url: coverUrl.trim() || null,
    visibility,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (initial) await api.updateBoard(initial.id, buildBody());
      else await api.createBoard(buildBody());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boards"] });
      toast.push(initial ? "Tableau mis à jour" : "Tableau créé");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const submit = () => {
    if (!title.trim()) {
      toast.push("Donne un titre à ton tableau", true);
      return;
    }
    save.mutate();
  };

  return (
    <Modal
      title={initial ? "Modifier le tableau" : "Nouveau tableau"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <Field label="Titre">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Déco salon" />
      </Field>
      <Field label="Description">
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="L'ambiance que tu vises…" />
      </Field>
      <Field label="Couverture (URL)">
        <input className="input" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <Field label="Visibilité">
        <select className="select" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
          <option value="private">Privé</option>
          <option value="friends">Amis</option>
          <option value="public">Public</option>
        </select>
      </Field>
    </Modal>
  );
}

/* ── Modal d'un tableau (ses inspirations) ──────────────────────────────── */
function BoardView({
  board,
  onClose,
  onEdit,
  onDelete,
}: {
  board: Board;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["inspirations", { board: board.id }],
    queryFn: () => api.inspirations({ board: board.id }),
  });
  const items = data?.items ?? [];

  return (
    <Modal title={board.title} onClose={onClose} wide>
      <div className="col gap-4">
        {board.cover_url && (
          <img src={board.cover_url} alt={board.title} style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: "var(--radius)" }} />
        )}
        {board.description && <p className="muted">{board.description}</p>}
        <div className="row gap-2 wrap">
          <span className="chip">{VIS_LABEL[board.visibility]}</span>
          {board.item_count != null && <span className="chip">{board.item_count} élément{board.item_count > 1 ? "s" : ""}</span>}
        </div>

        <div className="row gap-2 wrap" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-danger" onClick={onDelete}><Icon name="trash" size={15} /> Supprimer</button>
          <button className="btn btn-soft" onClick={onEdit}><Icon name="edit" size={15} /> Éditer</button>
        </div>

        {isLoading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState icon="image" title="Tableau vide" hint="Garde des inspirations ici depuis l'onglet « À trier »." />
        ) : (
          <div className="masonry">
            {items.map((ins) => (
              <InspoCard key={ins.id} ins={ins} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── Onglet « À trier » ─────────────────────────────────────────────────── */
function InboxTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [source, setSource] = useState("instagram");
  const [note, setNote] = useState("");
  const [keeping, setKeeping] = useState<Inspiration | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["inspirations", { status: "inbox" }],
    queryFn: () => api.inspirations({ status: "inbox" }),
  });
  const items = data?.items ?? [];

  const add = useMutation({
    mutationFn: () =>
      api.createInspiration({
        status: "inbox",
        url: url.trim() || null,
        title: title.trim() || null,
        image_url: imageUrl.trim() || null,
        source,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspirations"] });
      toast.push("Ajouté à la boîte");
      setUrl(""); setTitle(""); setImageUrl(""); setNote("");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const done = useMutation({
    mutationFn: (id: string) => api.updateInspiration(id, { status: "done" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspirations"] });
      toast.push("Marqué comme fait");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteInspiration(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspirations"] });
      toast.push("Supprimé");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async (ins: Inspiration) => {
    const ok = await confirm("Supprimer cette inspiration ?");
    if (ok) remove.mutate(ins.id);
  };

  const submit = () => {
    if (!url.trim() && !title.trim() && !imageUrl.trim()) {
      toast.push("Ajoute au moins un lien, un titre ou une image", true);
      return;
    }
    add.mutate();
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: "var(--space-5)" }}>
        <div className="panel-head">
          <h2>Ajout rapide</h2>
        </div>
        <div className="col gap-3">
          <div className="row gap-3 wrap">
            <input className="input grow" style={{ minWidth: 200 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Lien (Instagram, TikTok, Pinterest…)" />
            <select className="select" style={{ width: "auto" }} value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="row gap-3 wrap">
            <input className="input grow" style={{ minWidth: 160 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (optionnel)" />
            <input className="input grow" style={{ minWidth: 160 }} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL (optionnel)" />
          </div>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Une note pour te souvenir pourquoi ça t'a plu…" />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={submit} disabled={add.isPending}>
              {add.isPending ? "…" : "Ajouter à la boîte"}
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="archive" title="Boîte vide" hint="Colle un lien ci-dessus pour commencer à trier tes coups de cœur." />
      ) : (
        <div className="masonry">
          {items.map((ins) => (
            <InspoCard
              key={ins.id}
              ins={ins}
              actions={
                <>
                  <button className="btn btn-soft btn-sm" onClick={() => setKeeping(ins)}><Icon name="heart" size={14} /> Garder</button>
                  <button className="btn btn-soft btn-sm" onClick={() => done.mutate(ins.id)}><Icon name="check" size={14} /> Fait</button>
                  <button className="btn btn-danger btn-sm" onClick={() => askDelete(ins)}><Icon name="trash" size={14} /></button>
                </>
              }
            />
          ))}
        </div>
      )}

      {keeping && <KeepModal ins={keeping} onClose={() => setKeeping(null)} />}
      {confirmNode}
    </div>
  );
}

/* ── Onglet « Mes tableaux » ────────────────────────────────────────────── */
function BoardsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Board | null>(null);
  const [viewing, setViewing] = useState<Board | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["boards"], queryFn: () => api.boards() });
  const boards = data?.boards ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteBoard(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boards"] });
      toast.push("Tableau supprimé");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async (b: Board) => {
    const ok = await confirm(`Supprimer le tableau « ${b.title} » ?`);
    if (ok) {
      remove.mutate(b.id);
      setViewing(null);
    }
  };

  return (
    <div>
      <div className="row wrap" style={{ justifyContent: "flex-end", marginBottom: "var(--space-5)" }}>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Nouveau tableau</button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : boards.length === 0 ? (
        <EmptyState
          icon="archive"
          title="Aucun tableau"
          hint="Crée un moodboard pour regrouper tes inspirations par thème."
          action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Nouveau tableau</button>}
        />
      ) : (
        <div className="grid-cards">
          {boards.map((b) => (
            <div key={b.id} className="card card-pad-sm" style={{ cursor: "pointer", padding: 0, overflow: "hidden" }} onClick={() => setViewing(b)}>
              <div style={{ height: 140 }}>
                {b.cover_url ? (
                  <img src={b.cover_url} alt={b.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "var(--muted)", background: "var(--surface-2)" }}><Icon name="archive" size={40} /></div>
                )}
              </div>
              <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.02rem" }}>{b.title}</strong>
                <div className="row gap-2 wrap">
                  <span className="chip">{b.item_count ?? 0} élément{(b.item_count ?? 0) > 1 ? "s" : ""}</span>
                  <span className="chip">{VIS_LABEL[b.visibility]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <BoardForm onClose={() => setCreating(false)} />}
      {editing && <BoardForm initial={editing} onClose={() => setEditing(null)} />}
      {viewing && (
        <BoardView
          board={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { const b = viewing; setViewing(null); setEditing(b); }}
          onDelete={() => askDelete(viewing)}
        />
      )}

      {confirmNode}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Inspiration() {
  const [tab, setTab] = useState<"inbox" | "boards">("inbox");

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Tes idées</p>
          <h1>Inspiration</h1>
          <p className="muted">Trie tes coups de cœur et compose tes moodboards.</p>
        </div>
      </div>

      <div className="row gap-2 wrap" style={{ marginBottom: "var(--space-5)" }}>
        <button
          className={`btn ${tab === "inbox" ? "btn-primary" : "btn-soft"}`}
          onClick={() => setTab("inbox")}
        >
          <Icon name="archive" size={15} /> À trier
        </button>
        <button
          className={`btn ${tab === "boards" ? "btn-primary" : "btn-soft"}`}
          onClick={() => setTab("boards")}
        >
          <Icon name="grid" size={15} /> Mes tableaux
        </button>
      </div>

      {tab === "inbox" ? <InboxTab /> : <BoardsTab />}
    </div>
  );
}
