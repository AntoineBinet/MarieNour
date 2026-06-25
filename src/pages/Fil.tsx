import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import { Icon, type IconName } from "../components/Icon";
import StoryViewer from "../components/StoryViewer";
import type {
  CollectionVisibility,
  Comment,
  Memory,
  MemoryCollection,
  MemoryReel,
} from "@shared/types";

/* ── Constantes & helpers ─────────────────────────────────────────────────── */
const ACCENTS: { key: string; hex: string }[] = [
  { key: "terracotta", hex: "#c8694b" },
  { key: "plum", hex: "#8a5a7e" },
  { key: "sage", hex: "#6f8a5f" },
  { key: "ocean", hex: "#3f7d8a" },
  { key: "berry", hex: "#b04a63" },
  { key: "rose", hex: "#c4577f" },
  { key: "amber", hex: "#c2871f" },
  { key: "teal", hex: "#2f8c80" },
  { key: "indigo", hex: "#5b5fc0" },
  { key: "forest", hex: "#4a7a4e" },
  { key: "coral", hex: "#d56a52" },
  { key: "slate", hex: "#5a6b7a" },
];
const accentHex = (key: string) => ACCENTS.find((a) => a.key === key)?.hex ?? "#c8694b";

const VIS: { value: CollectionVisibility; label: string; icon: IconName; hint: string }[] = [
  { value: "private", label: "Privé", icon: "lock", hint: "Moi seul·e" },
  { value: "friends", label: "Amis", icon: "friends", hint: "Tous mes amis" },
  { value: "custom", label: "Amis choisis", icon: "users", hint: "Une sélection d'amis" },
  { value: "public", label: "Public", icon: "globe", hint: "Tout le monde" },
];
const visMeta = (v: CollectionVisibility) => VIS.find((x) => x.value === v) ?? VIS[0];

function timeAgo(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Construit un reel à un seul souvenir (pour ouvrir le lecteur sur une carte). */
const singleReel = (m: Memory): MemoryReel => ({
  author: m.author,
  is_mine: m.is_mine,
  count: 1,
  latest_at: m.taken_at,
  cover_url: m.media_url ?? m.link_image ?? null,
  memories: [m],
});

/* ── Avatar ───────────────────────────────────────────────────────────────── */
function Avatar({ url, size = 36 }: { url: string | null; size?: number }) {
  return url ? (
    <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
  ) : (
    <div
      style={{ width: size, height: size, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)", color: "var(--ink-2)" }}
    >
      <Icon name="flower" size={size * 0.5} />
    </div>
  );
}

/* ── Commentaires (toggle sur une carte) ──────────────────────────────────── */
function CommentsSection({ memory }: { memory: Memory }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["comments", "memory", memory.id],
    queryFn: () => api.comments("memory", memory.id),
  });
  const comments: Comment[] = data?.comments ?? [];
  const add = useMutation({
    mutationFn: (text: string) => api.addComment("memory", memory.id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", "memory", memory.id] });
      qc.invalidateQueries({ queryKey: ["memories"] });
      setBody("");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const submit = () => {
    const t = body.trim();
    if (!t || add.isPending) return;
    add.mutate(t);
  };
  return (
    <div className="col gap-3" style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}>
      {isLoading ? (
        <Spinner />
      ) : comments.length === 0 ? (
        <p className="muted small">Pas encore de commentaire.</p>
      ) : (
        comments.map((c) => (
          <div key={c.id} className="row gap-2" style={{ alignItems: "flex-start" }}>
            <Avatar url={c.author.avatar_url} size={30} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-2 wrap" style={{ rowGap: 0 }}>
                <strong style={{ fontSize: "0.9rem" }}>{c.author.display_name}</strong>
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
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
          placeholder="Écris un commentaire…"
        />
        <button className="btn btn-soft" onClick={submit} disabled={!body.trim() || add.isPending}>Envoyer</button>
      </div>
    </div>
  );
}

/* ── Vignette média d'un souvenir ─────────────────────────────────────────── */
function MemoryThumb({ memory, onOpen }: { memory: Memory; onOpen: () => void }) {
  if (memory.kind === "text") {
    return (
      <button className="mem-thumb mem-thumb-text" onClick={onOpen} style={{ background: `linear-gradient(140deg, ${accentHex(memory.collection_accent)}, ${accentHex(memory.collection_accent)}cc)` }}>
        <span>{memory.caption}</span>
      </button>
    );
  }
  if (memory.kind === "photo" && memory.media_url) {
    return (
      <button className="mem-thumb" onClick={onOpen}>
        <img src={memory.media_url} alt={memory.caption ?? ""} loading="lazy" />
      </button>
    );
  }
  if (memory.kind === "video" && memory.media_url) {
    return (
      <button className="mem-thumb" onClick={onOpen}>
        <video src={memory.media_url} muted playsInline preload="metadata" />
        <span className="mem-play"><Icon name="play" size={26} /></span>
      </button>
    );
  }
  // lien
  return (
    <button className="mem-thumb" onClick={onOpen}>
      {memory.link_image ? (
        <img src={memory.link_image} alt={memory.link_title ?? ""} loading="lazy" />
      ) : (
        <div className="mem-thumb-text" style={{ background: `linear-gradient(140deg, ${accentHex(memory.collection_accent)}, ${accentHex(memory.collection_accent)}cc)` }}>
          <Icon name="link" size={30} />
        </div>
      )}
      <span className="mem-play">
        <Icon name={memory.kind === "video" ? "play" : "link"} size={24} />
      </span>
      {memory.link_provider && memory.link_provider !== "web" && (
        <span className="mem-provider">{memory.link_provider}</span>
      )}
    </button>
  );
}

/* ── Carte d'un souvenir (fil) ────────────────────────────────────────────── */
function MemoryCard({ memory, onOpen, onDelete }: { memory: Memory; onOpen: () => void; onDelete: (m: Memory) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [showComments, setShowComments] = useState(false);
  const like = useMutation({
    mutationFn: () => api.like("memory", memory.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memories"] }),
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  return (
    <div className="card mem-card">
      <MemoryThumb memory={memory} onOpen={onOpen} />
      <div className="mem-card-body">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <Avatar url={memory.author.avatar_url} size={28} />
          <div className="grow" style={{ minWidth: 0 }}>
            <strong style={{ fontSize: "0.88rem" }}>{memory.is_mine ? "Moi" : memory.author.display_name}</strong>
            <div className="muted small">{timeAgo(memory.taken_at)}</div>
          </div>
          {memory.collection_title && (
            <span className="chip" style={{ flex: "none" }}>{memory.collection_title}</span>
          )}
        </div>
        {memory.caption && memory.kind !== "text" && (
          <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink-2)", marginTop: "var(--space-2)" }}>{memory.caption}</p>
        )}
        <div className="row gap-2" style={{ marginTop: "var(--space-3)" }}>
          <button className="btn btn-soft btn-sm row gap-1" style={{ alignItems: "center" }} onClick={() => like.mutate()}>
            <Icon name="heart" size={15} filled={memory.liked_by_me} /> {memory.like_count || ""}
          </button>
          <button className={`btn btn-sm row gap-1 ${showComments ? "btn-primary" : "btn-soft"}`} style={{ alignItems: "center" }} onClick={() => setShowComments((v) => !v)}>
            <Icon name="chat" size={15} /> {memory.comment_count || ""}
          </button>
          <span className="spacer" />
          {memory.is_mine && (
            <button className="btn btn-soft btn-sm btn-icon" onClick={() => onDelete(memory)} aria-label="Supprimer">
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
        {showComments && <CommentsSection memory={memory} />}
      </div>
    </div>
  );
}

/* ── Rangée de stories (récap hebdo) ──────────────────────────────────────── */
function StoriesRow({ reels, onOpen, onAdd }: { reels: MemoryReel[]; onOpen: (i: number) => void; onAdd: () => void }) {
  return (
    <div className="stories-row">
      <button className="story-chip" onClick={onAdd}>
        <span className="story-chip-ring story-chip-add"><Icon name="plus" size={24} /></span>
        <span className="story-chip-name">Ajouter</span>
      </button>
      {reels.map((reel, i) => (
        <button className="story-chip" key={reel.author.id} onClick={() => onOpen(i)}>
          <span className="story-chip-ring" style={{ ["--ring" as string]: accentHex(reel.author.accent) }}>
            {reel.cover_url ? (
              <img src={reel.cover_url} alt="" />
            ) : reel.author.avatar_url ? (
              <img src={reel.author.avatar_url} alt="" />
            ) : (
              <span className="story-chip-fallback"><Icon name="flower" size={22} /></span>
            )}
            <span className="story-chip-count">{reel.count}</span>
          </span>
          <span className="story-chip-name">{reel.is_mine ? "Ma semaine" : reel.author.display_name}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Carte de collection ──────────────────────────────────────────────────── */
function CollectionCard({ collection, onOpen }: { collection: MemoryCollection; onOpen: () => void }) {
  const vm = visMeta(collection.visibility);
  const previews = collection.preview_urls.slice(0, 4);
  return (
    <button className="card coll-card" onClick={onOpen}>
      <div className="coll-cover" style={{ background: `linear-gradient(140deg, ${accentHex(collection.accent)}, ${accentHex(collection.accent)}aa)` }}>
        {previews.length > 0 ? (
          <div className={`coll-cover-grid coll-cover-grid-${Math.min(previews.length, 4)}`}>
            {previews.map((u, i) => <img key={i} src={u} alt="" loading="lazy" />)}
          </div>
        ) : (
          <span className="coll-cover-icon"><Icon name="memories" size={34} /></span>
        )}
      </div>
      <div className="coll-card-body">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <strong className="grow" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{collection.title}</strong>
          <span className="chip row gap-1" style={{ flex: "none", alignItems: "center" }}><Icon name={vm.icon} size={12} /> {vm.label}</span>
        </div>
        <div className="muted small row gap-2" style={{ marginTop: 2 }}>
          <span>{collection.memory_count} souvenir{collection.memory_count > 1 ? "s" : ""}</span>
          {!collection.is_owner && collection.owner && <span>· par {collection.owner.display_name}</span>}
        </div>
      </div>
    </button>
  );
}

/* ── Formulaire de collection (création / édition) ────────────────────────── */
function CollectionFormModal({ existing, onClose, onSaved }: { existing?: MemoryCollection; onClose: () => void; onSaved: (id?: string) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [accent, setAccent] = useState(existing?.accent ?? "terracotta");
  const [visibility, setVisibility] = useState<CollectionVisibility>(existing?.visibility ?? "private");
  const [memberIds, setMemberIds] = useState<string[]>(existing?.members?.map((m) => m.id) ?? []);

  const { data: friendsData } = useQuery({ queryKey: ["friends"], queryFn: () => api.friends() });
  const friends = friendsData?.friends ?? [];

  const save = useMutation({
    mutationFn: async () => {
      const payload = { title: title.trim(), description, accent, visibility, member_ids: visibility === "custom" ? memberIds : [] };
      if (existing) {
        await api.updateMemoryCollection(existing.id, payload);
        return existing.id;
      }
      const res = await api.createMemoryCollection(payload);
      return res.id;
    },
    onSuccess: (id) => {
      toast.push(existing ? "Collection mise à jour" : "Collection créée");
      onSaved(id);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const toggleMember = (id: string) => setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <Modal title={existing ? "Modifier la collection" : "Nouvelle collection"} onClose={onClose} footer={
      <>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>{existing ? "Enregistrer" : "Créer"}</button>
      </>
    }>
      <div className="col gap-4">
        <Field label="Nom de la collection">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Été 2026, Soirées entre amis…" autoFocus />
        </Field>
        <Field label="Description (optionnel)">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Une petite note…" />
        </Field>
        <Field label="Couleur">
          <div className="row gap-2 wrap">
            {ACCENTS.map((a) => (
              <button key={a.key} type="button" className={`swatch${accent === a.key ? " sel" : ""}`} style={{ background: a.hex }} onClick={() => setAccent(a.key)} aria-label={a.key} />
            ))}
          </div>
        </Field>
        <Field label="Qui peut voir cette collection ?">
          <div className="vis-grid">
            {VIS.map((v) => (
              <button key={v.value} type="button" className={`vis-opt${visibility === v.value ? " sel" : ""}`} onClick={() => setVisibility(v.value)}>
                <Icon name={v.icon} size={18} />
                <strong>{v.label}</strong>
                <span className="muted small">{v.hint}</span>
              </button>
            ))}
          </div>
        </Field>
        {visibility === "custom" && (
          <Field label="Amis autorisés">
            {friends.length === 0 ? (
              <p className="muted small">Ajoute d'abord des amis pour partager avec une sélection. <Link to="/amis">Gérer mes amis</Link></p>
            ) : (
              <div className="col gap-2" style={{ maxHeight: 220, overflowY: "auto" }}>
                {friends.map((f) => (
                  <button key={f.user.id} type="button" className={`friend-pick${memberIds.includes(f.user.id) ? " sel" : ""}`} onClick={() => toggleMember(f.user.id)}>
                    <Avatar url={f.user.avatar_url} size={32} />
                    <span className="grow" style={{ textAlign: "left", minWidth: 0 }}>{f.user.display_name}</span>
                    {memberIds.includes(f.user.id) && <Icon name="check" size={16} />}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ── Compositeur de souvenir ──────────────────────────────────────────────── */
function AddMemoryModal({
  collections,
  defaultCollection,
  onClose,
  onSaved,
  onNewCollection,
}: {
  collections: MemoryCollection[];
  defaultCollection?: string;
  onClose: () => void;
  onSaved: () => void;
  onNewCollection: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<"media" | "link" | "text">("media");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [collectionId, setCollectionId] = useState(defaultCollection ?? collections[0]?.id ?? "");
  const [preview, setPreview] = useState<{ title: string | null; image: string | null; provider: string | null } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    setFile(f);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(f ? URL.createObjectURL(f) : null);
  };

  const loadPreview = async () => {
    const u = url.trim();
    if (!u) return;
    setPreviewing(true);
    try {
      const res = await api.linkPreview(u);
      setPreview({ title: res.preview.title, image: res.preview.image, provider: res.preview.provider });
    } catch {
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!collectionId) throw new Error("Choisis une collection");
      if (kind === "media") {
        if (!file) throw new Error("Choisis une photo ou une vidéo");
        await api.uploadMemory(file, { collection_id: collectionId, caption: caption.trim() || undefined });
      } else if (kind === "link") {
        if (!url.trim()) throw new Error("Colle un lien");
        await api.createMemory({
          collection_id: collectionId,
          url: url.trim(),
          caption: caption.trim() || undefined,
          link_title: preview?.title ?? undefined,
          link_image: preview?.image ?? undefined,
          link_provider: preview?.provider ?? undefined,
        });
      } else {
        if (!caption.trim()) throw new Error("Écris ton souvenir");
        await api.createMemory({ collection_id: collectionId, caption: caption.trim() });
      }
    },
    onSuccess: () => {
      toast.push("Souvenir ajouté");
      if (filePreview) URL.revokeObjectURL(filePreview);
      onSaved();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const KINDS: { value: "media" | "link" | "text"; label: string; icon: IconName }[] = [
    { value: "media", label: "Photo / Vidéo", icon: "image" },
    { value: "link", label: "Lien", icon: "link" },
    { value: "text", label: "Texte", icon: "notes" },
  ];

  return (
    <Modal title="Nouveau souvenir" onClose={onClose} footer={
      <>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>Ajouter au fil</button>
      </>
    }>
      <div className="col gap-4">
        <div className="seg" role="tablist">
          {KINDS.map((k) => (
            <button key={k.value} className={`seg-item${kind === k.value ? " active" : ""}`} onClick={() => setKind(k.value)}>
              <Icon name={k.icon} size={15} /> {k.label}
            </button>
          ))}
        </div>

        {kind === "media" && (
          <div>
            <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            {filePreview ? (
              <div className="mem-upload-preview" onClick={() => fileInput.current?.click()}>
                {file?.type.startsWith("video/") ? <video src={filePreview} muted /> : <img src={filePreview} alt="" />}
                <span className="muted small">Changer</span>
              </div>
            ) : (
              <button className="card mem-dropzone" onClick={() => fileInput.current?.click()}>
                <Icon name="image" size={30} />
                <span>Choisir une photo ou une vidéo</span>
              </button>
            )}
          </div>
        )}

        {kind === "link" && (
          <div className="col gap-3">
            <Field label="Lien (vidéo, post Instagram/TikTok, page web…)">
              <div className="row gap-2">
                <input className="input grow" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={loadPreview} placeholder="https://…" inputMode="url" />
                <button className="btn btn-soft" onClick={loadPreview} disabled={!url.trim() || previewing}>{previewing ? "…" : "Aperçu"}</button>
              </div>
            </Field>
            {preview && (preview.image || preview.title) && (
              <div className="link-preview">
                {preview.image && <img src={preview.image} alt="" />}
                <div className="col" style={{ minWidth: 0 }}>
                  {preview.provider && <span className="chip chip-accent" style={{ alignSelf: "flex-start" }}>{preview.provider}</span>}
                  {preview.title && <strong style={{ wordBreak: "break-word" }}>{preview.title}</strong>}
                </div>
              </div>
            )}
          </div>
        )}

        <Field label={kind === "text" ? "Ton souvenir" : "Légende (optionnel)"}>
          <textarea className="textarea" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={kind === "text" ? "Raconte ce moment…" : "Ajoute un mot…"} rows={kind === "text" ? 4 : 2} />
        </Field>

        <Field label="Collection">
          <div className="row gap-2">
            <select className="select grow" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              {collections.length === 0 && <option value="">Mes souvenirs (créée automatiquement)</option>}
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.title} · {visMeta(c.visibility).label}</option>
              ))}
            </select>
            <button className="btn btn-soft btn-icon" onClick={onNewCollection} aria-label="Nouvelle collection"><Icon name="plus" size={16} /></button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/* ── Détail d'une collection (modale) ─────────────────────────────────────── */
function CollectionModal({
  collectionId,
  onClose,
  onOpenStory,
  onEdit,
}: {
  collectionId: string;
  onClose: () => void;
  onOpenStory: (memories: Memory[], index: number) => void;
  onEdit: (c: MemoryCollection) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ["collection", collectionId], queryFn: () => api.memoryCollection(collectionId) });
  const collection = data?.collection;
  const memories = data?.memories ?? [];

  const removeColl = useMutation({
    mutationFn: () => api.deleteMemoryCollection(collectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memory-collections"] });
      qc.invalidateQueries({ queryKey: ["memories"] });
      qc.invalidateQueries({ queryKey: ["memory-recap"] });
      toast.push("Collection supprimée");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const removeMem = useMutation({
    mutationFn: (id: string) => api.deleteMemory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collection", collectionId] });
      qc.invalidateQueries({ queryKey: ["memories"] });
      qc.invalidateQueries({ queryKey: ["memory-recap"] });
      toast.push("Souvenir supprimé");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDeleteColl = async () => {
    if (await confirm("Supprimer cette collection et tous ses souvenirs ?")) removeColl.mutate();
  };
  const askDeleteMem = async (m: Memory) => {
    if (await confirm("Supprimer ce souvenir ?")) removeMem.mutate(m.id);
  };

  const vm = collection ? visMeta(collection.visibility) : null;

  return (
    <Modal title={collection?.title ?? "Collection"} onClose={onClose} wide>
      {isLoading || !collection ? (
        <Spinner />
      ) : (
        <div className="col gap-4">
          <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
            {vm && <span className="chip chip-accent row gap-1" style={{ alignItems: "center" }}><Icon name={vm.icon} size={13} /> {vm.label}</span>}
            <span className="muted small">{collection.memory_count} souvenir{collection.memory_count > 1 ? "s" : ""}</span>
            {!collection.is_owner && collection.owner && <span className="muted small">· par {collection.owner.display_name}</span>}
            <span className="spacer" />
            {collection.can_edit && (
              <>
                <button className="btn btn-soft btn-sm row gap-1" onClick={() => onEdit(collection)}><Icon name="edit" size={14} /> Modifier</button>
                <button className="btn btn-danger btn-sm row gap-1" onClick={askDeleteColl}><Icon name="trash" size={14} /> Supprimer</button>
              </>
            )}
          </div>
          {collection.description && <p className="muted">{collection.description}</p>}
          {collection.visibility === "custom" && collection.members && collection.members.length > 0 && (
            <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
              <span className="muted small">Partagé avec :</span>
              {collection.members.map((m) => <span key={m.id} className="chip">{m.display_name}</span>)}
            </div>
          )}

          {memories.length === 0 ? (
            <EmptyState icon="memories" title="Collection vide" hint="Ajoute des souvenirs depuis le bouton « Ajouter un souvenir »." />
          ) : (
            <div className="mem-mini-grid">
              {memories.map((m, i) => (
                <div className="mem-mini" key={m.id}>
                  <MemoryThumb memory={m} onOpen={() => onOpenStory(memories, i)} />
                  {m.is_mine && (
                    <button className="mem-mini-del" onClick={() => askDeleteMem(m)} aria-label="Supprimer"><Icon name="trash" size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {confirmNode}
    </Modal>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function Fil() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [tab, setTab] = useState<"feed" | "collections">("feed");
  const [composing, setComposing] = useState(false);
  const [editingColl, setEditingColl] = useState<MemoryCollection | null>(null);
  const [creatingColl, setCreatingColl] = useState(false);
  const [openColl, setOpenColl] = useState<string | null>(null);
  const [story, setStory] = useState<{ reels: MemoryReel[]; start: number } | null>(null);

  const recapQ = useQuery({ queryKey: ["memory-recap"], queryFn: () => api.memoryRecap(7) });
  const memoriesQ = useQuery({ queryKey: ["memories"], queryFn: () => api.memories() });
  const collectionsQ = useQuery({ queryKey: ["memory-collections"], queryFn: () => api.memoryCollections() });

  const reels = recapQ.data?.reels ?? [];
  const memories = memoriesQ.data?.memories ?? [];
  const myCollections = collectionsQ.data?.collections ?? [];
  const sharedCollections = collectionsQ.data?.shared ?? [];

  const removeMem = useMutation({
    mutationFn: (id: string) => api.deleteMemory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memories"] });
      qc.invalidateQueries({ queryKey: ["memory-recap"] });
      toast.push("Souvenir supprimé");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const askDeleteMem = async (m: Memory) => {
    if (await confirm("Supprimer ce souvenir ?")) removeMem.mutate(m.id);
  };

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["memories"] });
    qc.invalidateQueries({ queryKey: ["memory-recap"] });
    qc.invalidateQueries({ queryKey: ["memory-collections"] });
  };

  const loading = recapQ.isLoading && memoriesQ.isLoading && collectionsQ.isLoading;
  const empty = !loading && memories.length === 0 && myCollections.length === 0 && sharedCollections.length === 0;

  const openSingle = (m: Memory) => setStory({ reels: [singleReel(m)], start: 0 });
  const openGroup = useMemo(
    () => (list: Memory[], index: number) => {
      const author = list[index]?.author;
      const reel: MemoryReel = {
        author,
        is_mine: list[index]?.is_mine ?? false,
        count: list.length,
        latest_at: list[index]?.taken_at ?? 0,
        cover_url: null,
        memories: list,
      };
      setStory({ reels: [reel], start: 0 });
    },
    [],
  );

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p className="eyebrow">Tes souvenirs, à ta façon</p>
          <h1>Mon fil</h1>
          <p className="muted">Un fil privé de souvenirs — photos, vidéos, liens — partagé avec qui tu veux.</p>
        </div>
        <button className="btn btn-primary row gap-1" style={{ alignItems: "center" }} onClick={() => setComposing(true)}>
          <Icon name="plus" size={16} /> Ajouter un souvenir
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : empty ? (
        <EmptyState
          icon="memories"
          title="Commence ton fil de souvenirs"
          hint="Ajoute une photo, une vidéo ou un lien. Range tes souvenirs en collections et choisis avec quels amis les partager."
          action={<button className="btn btn-primary row gap-1" style={{ alignItems: "center" }} onClick={() => setComposing(true)}><Icon name="plus" size={15} /> Ajouter mon premier souvenir</button>}
        />
      ) : (
        <>
          {reels.length > 0 && (
            <div className="col gap-2" style={{ marginBottom: "var(--space-5)" }}>
              <p className="eyebrow" style={{ color: "var(--accent-ink)" }}>Récap de la semaine</p>
              <StoriesRow reels={reels} onOpen={(i) => setStory({ reels, start: i })} onAdd={() => setComposing(true)} />
            </div>
          )}

          <div className="seg" style={{ maxWidth: 360, marginBottom: "var(--space-5)" }}>
            <button className={`seg-item${tab === "feed" ? " active" : ""}`} onClick={() => setTab("feed")}>Tout le fil</button>
            <button className={`seg-item${tab === "collections" ? " active" : ""}`} onClick={() => setTab("collections")}>
              Collections {myCollections.length + sharedCollections.length > 0 && <span className="seg-badge">{myCollections.length + sharedCollections.length}</span>}
            </button>
          </div>

          {tab === "feed" ? (
            memories.length === 0 ? (
              <EmptyState icon="image" title="Aucun souvenir pour l'instant" hint="Ajoute ton premier souvenir pour démarrer ton fil." action={<button className="btn btn-primary" onClick={() => setComposing(true)}>Ajouter un souvenir</button>} />
            ) : (
              <div className="mem-masonry">
                {memories.map((m) => (
                  <MemoryCard key={m.id} memory={m} onOpen={() => openSingle(m)} onDelete={askDeleteMem} />
                ))}
              </div>
            )
          ) : (
            <div className="col gap-5">
              <div>
                <div className="panel-head">
                  <h2 style={{ fontSize: "1.1rem" }}>Mes collections</h2>
                  <button className="btn btn-soft btn-sm row gap-1" onClick={() => setCreatingColl(true)}><Icon name="plus" size={14} /> Nouvelle</button>
                </div>
                {myCollections.length === 0 ? (
                  <EmptyState icon="memories" title="Pas encore de collection" hint="Crée une collection pour organiser tes souvenirs et choisir qui les voit." action={<button className="btn btn-primary" onClick={() => setCreatingColl(true)}>Créer une collection</button>} />
                ) : (
                  <div className="coll-grid">
                    {myCollections.map((c) => <CollectionCard key={c.id} collection={c} onOpen={() => setOpenColl(c.id)} />)}
                  </div>
                )}
              </div>

              {sharedCollections.length > 0 && (
                <div>
                  <div className="panel-head"><h2 style={{ fontSize: "1.1rem" }}>Partagées avec moi</h2></div>
                  <div className="coll-grid">
                    {sharedCollections.map((c) => <CollectionCard key={c.id} collection={c} onOpen={() => setOpenColl(c.id)} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {composing && (
        <AddMemoryModal
          collections={myCollections}
          onClose={() => setComposing(false)}
          onSaved={() => {
            setComposing(false);
            refreshAll();
          }}
          onNewCollection={() => {
            setComposing(false);
            setCreatingColl(true);
          }}
        />
      )}

      {creatingColl && (
        <CollectionFormModal
          onClose={() => setCreatingColl(false)}
          onSaved={() => {
            setCreatingColl(false);
            qc.invalidateQueries({ queryKey: ["memory-collections"] });
          }}
        />
      )}

      {editingColl && (
        <CollectionFormModal
          existing={editingColl}
          onClose={() => setEditingColl(null)}
          onSaved={() => {
            setEditingColl(null);
            qc.invalidateQueries({ queryKey: ["memory-collections"] });
            qc.invalidateQueries({ queryKey: ["collection", editingColl.id] });
          }}
        />
      )}

      {openColl && (
        <CollectionModal
          collectionId={openColl}
          onClose={() => setOpenColl(null)}
          onOpenStory={(list, i) => openGroup(list, i)}
          onEdit={(c) => {
            setOpenColl(null);
            setEditingColl(c);
          }}
        />
      )}

      {story && <StoryViewer reels={story.reels} startReel={story.start} onClose={() => setStory(null)} />}

      {confirmNode}
    </div>
  );
}
