import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import { Icon, type IconName } from "../components/Icon";
import { InviteQr } from "../components/InviteQr";
import { InviteLink } from "../components/InviteLink";
import { IMAGE_ACCEPT, isImageFile } from "../images";
import type { Album, MediaItem, Visibility } from "@shared/types";

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: "private", label: "Privé" },
  { value: "friends", label: "Amis" },
  { value: "public", label: "Public" },
];
const visLabel = (v: Visibility) => VISIBILITIES.find((x) => x.value === v)?.label ?? v;

function formatDate(ts: number): string {
  return new Date(ts * (ts < 1e12 ? 1000 : 1)).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/* ════════════════════════════════════════════════════════════════════════
   Aperçu / édition d'une photo
   ════════════════════════════════════════════════════════════════════════ */
function PhotoModal({ media, onClose, onDelete }: { media: MediaItem; onClose: () => void; onDelete: (m: MediaItem) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [caption, setCaption] = useState(media.caption ?? "");
  const [visibility, setVisibility] = useState<Visibility>(media.visibility);

  const update = useMutation({
    mutationFn: (b: Partial<{ caption: string; visibility: Visibility }>) => api.updateMedia(media.id, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
      toast.push("Photo mise à jour");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const saveCaption = () => {
    const next = caption.trim();
    if (next === (media.caption ?? "")) return;
    update.mutate({ caption: next });
  };
  const changeVisibility = (v: Visibility) => {
    setVisibility(v);
    update.mutate({ visibility: v });
  };

  return (
    <Modal title={media.filename || "Photo"} onClose={onClose} wide>
      <div className="col gap-4">
        <img
          src={media.url}
          alt={media.caption ?? media.filename ?? ""}
          style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", borderRadius: "var(--radius)", background: "var(--surface-2)" }}
        />
        <Field label="Légende">
          <input
            className="input"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={saveCaption}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="Ajoute une légende…"
          />
        </Field>
        <Field label="Visibilité">
          <select className="select" value={visibility} onChange={(e) => changeVisibility(e.target.value as Visibility)}>
            {VISIBILITIES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </Field>
        <div className="row wrap gap-2">
          <span className="muted small row gap-1" style={{ alignItems: "center" }}><Icon name="calendar" size={14} /> {formatDate(media.created_at)}</span>
          <span className="spacer" />
          <button className="btn btn-danger row gap-1" style={{ alignItems: "center" }} onClick={() => onDelete(media)}><Icon name="trash" size={15} /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Zone d'envoi (drag & drop + bouton), réutilisée
   ════════════════════════════════════════════════════════════════════════ */
function useUploader(onDone?: () => void) {
  const qc = useQueryClient();
  const toast = useToast();
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);

  const uploadFiles = async (files: File[]) => {
    const images = files.filter(isImageFile);
    if (images.length === 0) {
      if (files.length) toast.push("Seules les images sont acceptées", true);
      return;
    }
    setUploading({ done: 0, total: images.length });
    let ok = 0;
    for (let i = 0; i < images.length; i++) {
      try {
        await api.uploadMedia(images[i]);
        ok++;
      } catch (e: any) {
        toast.push(e.message || "Envoi échoué", true);
      }
      setUploading({ done: i + 1, total: images.length });
    }
    setUploading(null);
    qc.invalidateQueries({ queryKey: ["media"] });
    if (ok > 0) {
      toast.push(`${ok} photo${ok > 1 ? "s" : ""} importée${ok > 1 ? "s" : ""}`);
      onDone?.();
    }
  };
  return { uploading, uploadFiles };
}

/* ════════════════════════════════════════════════════════════════════════
   Onglet « Mes photos »
   ════════════════════════════════════════════════════════════════════════ */
function MyPhotos() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<MediaItem | null>(null);
  const [dragging, setDragging] = useState(false);
  const { uploading, uploadFiles } = useUploader();

  const { data, isLoading } = useQuery({ queryKey: ["media"], queryFn: () => api.media() });
  const media = data?.media ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMedia(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
      qc.invalidateQueries({ queryKey: ["albums"] });
      toast.push("Photo supprimée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async (m: MediaItem) => {
    const ok = await confirm("Supprimer définitivement cette photo ?");
    if (ok) {
      remove.mutate(m.id);
      setViewing(null);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) uploadFiles(files);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) uploadFiles(files);
  };

  return (
    <div>
      <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={onPick} />
      <div
        className="card"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileInput.current?.click()}
        style={{
          marginBottom: "var(--space-5)", textAlign: "center", cursor: uploading ? "default" : "pointer",
          borderStyle: "dashed", borderColor: dragging ? "var(--accent)" : "var(--border-strong)",
          background: dragging ? "color-mix(in srgb, var(--accent) 8%, transparent)" : undefined,
        }}
      >
        {uploading ? (
          <p className="muted">Envoi en cours… {uploading.done}/{uploading.total}</p>
        ) : (
          <p className="muted">
            <strong style={{ color: "var(--accent-ink)" }}>Glisse tes photos ici</strong> ou clique pour parcourir — JPEG, PNG, HEIC…
          </p>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : media.length === 0 ? (
        <EmptyState
          icon="image"
          title="Pas encore de photos"
          hint="Importe tes premières images pour commencer ta galerie."
          action={<button className="btn btn-primary row gap-1" style={{ alignItems: "center" }} onClick={() => fileInput.current?.click()}><Icon name="plus" size={15} /> Importer des photos</button>}
        />
      ) : (
        <div className="masonry">
          {media.map((m) => (
            <div key={m.id} className="card card-pad-sm" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => setViewing(m)}>
              <img src={m.url} alt={m.caption ?? m.filename ?? ""} loading="lazy" style={{ width: "100%", display: "block", borderRadius: "var(--radius)" }} />
              {(m.caption || m.visibility !== "private") && (
                <div style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {m.caption && <span className="small" style={{ color: "var(--ink-2)" }}>{m.caption}</span>}
                  <span className="chip" style={{ alignSelf: "flex-start" }}>{visLabel(m.visibility)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {viewing && <PhotoModal media={viewing} onClose={() => setViewing(null)} onDelete={askDelete} />}
      {confirmNode}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Choisir des photos existantes à ajouter à un album
   ════════════════════════════════════════════════════════════════════════ */
function AddPhotosModal({ albumId, existing, onClose }: { albumId: string; existing: Set<string>; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["media"], queryFn: () => api.media() });
  const candidates = (data?.media ?? []).filter((m) => !existing.has(m.id));
  const [sel, setSel] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const add = useMutation({
    mutationFn: () => api.addAlbumPhotos(albumId, [...sel]),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["album", albumId] });
      qc.invalidateQueries({ queryKey: ["albums"] });
      toast.push(`${res.added} photo${res.added > 1 ? "s" : ""} ajoutée${res.added > 1 ? "s" : ""}`);
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  return (
    <Modal
      title="Ajouter des photos"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => add.mutate()} disabled={!sel.size || add.isPending}>
            {add.isPending ? "…" : `Ajouter${sel.size ? ` (${sel.size})` : ""}`}
          </button>
        </>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : candidates.length === 0 ? (
        <EmptyState icon="image" title="Aucune photo à ajouter" hint="Toutes tes photos sont déjà dans cet album, ou tu n'en as pas encore importé." />
      ) : (
        <div className="photo-pick">
          {candidates.map((m) => {
            const on = sel.has(m.id);
            return (
              <button key={m.id} type="button" className={`photo-pick-item${on ? " sel" : ""}`} onClick={() => toggle(m.id)} aria-pressed={on}>
                <img src={m.url} alt={m.caption ?? ""} loading="lazy" />
                {on && <span className="photo-pick-check"><Icon name="check" size={14} /></span>}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Détail d'un album (propriétaire : édition/partage ; invité : lecture)
   ════════════════════════════════════════════════════════════════════════ */
function AlbumModal({ albumId, onClose }: { albumId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [zoom, setZoom] = useState<MediaItem | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["album", albumId], queryFn: () => api.album(albumId) });
  const album = data?.album;

  const friendsQ = useQuery({ queryKey: ["friends"], queryFn: () => api.friends(), enabled: !!album?.is_owner });
  const friends = (friendsQ.data?.friends ?? []).map((f) => f.user);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["album", albumId] });
    qc.invalidateQueries({ queryKey: ["albums"] });
  };

  const patch = useMutation({
    mutationFn: (b: Partial<{ title: string; description: string; visibility: Visibility; cover_media_id: string | null }>) => api.updateAlbum(albumId, b),
    onSuccess: invalidate,
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const removePhoto = useMutation({
    mutationFn: (mediaId: string) => api.removeAlbumPhoto(albumId, mediaId),
    onSuccess: invalidate,
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const del = useMutation({
    mutationFn: () => api.deleteAlbum(albumId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["albums"] }); toast.push("Album supprimé"); onClose(); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const share = useMutation({
    mutationFn: (userId: string) => api.shareAlbum(albumId, userId),
    onSuccess: () => { invalidate(); toast.push("Album partagé"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const unshare = useMutation({
    mutationFn: (userId: string) => api.unshareAlbum(albumId, userId),
    onSuccess: invalidate,
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async () => {
    if (await confirm("Supprimer cet album ? Les photos elles-mêmes restent dans « Mes photos ».")) del.mutate();
  };

  if (isLoading || !album) {
    return <Modal title="Album" onClose={onClose}><Spinner /></Modal>;
  }

  const owner = album.is_owner;
  const sharedIds = new Set((album.shared_with ?? []).map((u) => u.id));
  const shareable = friends.filter((f) => !sharedIds.has(f.id));

  return (
    <>
      <Modal title={owner ? "Mon album" : album.title} onClose={onClose} wide>
        <div className="col gap-4">
          {owner ? (
            <>
              <Field label="Titre">
                <input
                  className="input"
                  defaultValue={album.title}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== album.title) patch.mutate({ title: v }); }}
                />
              </Field>
              <Field label="Description">
                <textarea
                  className="textarea"
                  defaultValue={album.description ?? ""}
                  placeholder="Quelques mots sur cet album…"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (album.description ?? "")) patch.mutate({ description: v }); }}
                />
              </Field>
              <Field label="Visibilité">
                <select className="select" value={album.visibility} onChange={(e) => patch.mutate({ visibility: e.target.value as Visibility })}>
                  {VISIBILITIES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
                <p className="muted small" style={{ marginTop: 4 }}>
                  « Amis » : visible par tous tes amis. « Privé » : visible seulement par les amis à qui tu le partages ci-dessous.
                </p>
              </Field>
            </>
          ) : (
            <div className="row gap-2" style={{ alignItems: "center" }}>
              {album.owner?.avatar_url ? (
                <img src={album.owner.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <span className="notif-ic" style={{ width: 32, height: 32 }}><Icon name="profile" size={16} /></span>
              )}
              <div className="col" style={{ lineHeight: 1.2 }}>
                <strong>{album.owner?.display_name ?? "Un ami"}</strong>
                {album.description && <span className="muted small">{album.description}</span>}
              </div>
            </div>
          )}

          {/* Grille des photos */}
          {album.photos.length === 0 ? (
            <EmptyState icon="image" title="Album vide" hint={owner ? "Ajoute des photos depuis ta galerie." : "Cet album ne contient pas encore de photos."} />
          ) : (
            <div className="album-grid">
              {album.photos.map((m) => (
                <div key={m.id} className="album-grid-item">
                  <img src={m.url} alt={m.caption ?? ""} loading="lazy" onClick={() => setZoom(m)} />
                  {owner && (
                    <div className="album-grid-actions">
                      <button
                        type="button"
                        className="album-grid-btn"
                        title="Définir comme couverture"
                        onClick={() => patch.mutate({ cover_media_id: m.id })}
                      >
                        <Icon name="star" size={14} />
                      </button>
                      <button type="button" className="album-grid-btn danger" title="Retirer de l'album" onClick={() => removePhoto.mutate(m.id)}>
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {owner && (
            <button className="btn btn-soft" onClick={() => setAdding(true)}><Icon name="plus" size={15} /> Ajouter des photos</button>
          )}

          {/* Partage (propriétaire) */}
          {owner && (
            <div className="card card-pad-sm" style={{ background: "var(--surface-2)" }}>
              <div className="row gap-2" style={{ marginBottom: "var(--space-3)" }}>
                <Icon name="share" size={16} />
                <strong>Partager cet album</strong>
              </div>

              {album.shared_with && album.shared_with.length > 0 && (
                <div className="row gap-2 wrap" style={{ marginBottom: "var(--space-3)" }}>
                  {album.shared_with.map((u) => (
                    <span key={u.id} className="chip">
                      {u.display_name}
                      <button className="chip-x" onClick={() => unshare.mutate(u.id)} aria-label={`Retirer ${u.display_name}`}><Icon name="close" size={12} /></button>
                    </span>
                  ))}
                </div>
              )}

              {shareable.length > 0 ? (
                <select
                  className="select"
                  value=""
                  onChange={(e) => { if (e.target.value) share.mutate(e.target.value); }}
                  style={{ marginBottom: "var(--space-3)" }}
                >
                  <option value="">Partager avec un ami…</option>
                  {shareable.map((f) => <option key={f.id} value={f.id}>{f.display_name}</option>)}
                </select>
              ) : (
                <p className="muted small" style={{ marginBottom: "var(--space-3)" }}>
                  {friends.length === 0 ? "Ajoute des amis pour partager directement, ou utilise un lien ci-dessous." : "Album déjà partagé avec tous tes amis."}
                </p>
              )}

              <div className="row gap-2 wrap">
                <InviteQr kind="album" targetId={album.id} variant="sm">Partager par QR</InviteQr>
                <InviteLink kind="album" targetId={album.id} variant="sm">Copier le lien</InviteLink>
              </div>
            </div>
          )}

          <div className="row wrap gap-2">
            <span className="muted small">{album.photo_count} photo{album.photo_count > 1 ? "s" : ""}</span>
            <span className="spacer" />
            {owner && <button className="btn btn-danger row gap-1" style={{ alignItems: "center" }} onClick={askDelete}><Icon name="trash" size={15} /> Supprimer l'album</button>}
          </div>
        </div>
        {confirmNode}
      </Modal>

      {adding && <AddPhotosModal albumId={albumId} existing={new Set(album.photos.map((p) => p.id))} onClose={() => setAdding(false)} />}
      {zoom && (
        <Modal title={zoom.caption || "Photo"} onClose={() => setZoom(null)} wide>
          <img src={zoom.url} alt={zoom.caption ?? ""} style={{ width: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: "var(--radius)", background: "var(--surface-2)" }} />
        </Modal>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Créer un album
   ════════════════════════════════════════════════════════════════════════ */
function CreateAlbumModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");

  const create = useMutation({
    mutationFn: () => api.createAlbum({ title: title.trim(), visibility }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["albums"] });
      toast.push("Album créé");
      onCreated(res.album.id);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  return (
    <Modal
      title="Nouvel album"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => title.trim() ? create.mutate() : toast.push("Donne un titre", true)} disabled={create.isPending}>
            {create.isPending ? "…" : "Créer"}
          </button>
        </>
      }
    >
      <Field label="Titre">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Vacances en Italie" autoFocus />
      </Field>
      <Field label="Visibilité">
        <select className="select" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
          {VISIBILITIES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
      </Field>
    </Modal>
  );
}

/* ── Carte d'album ──────────────────────────────────────────────────────── */
function AlbumCard({ album, onOpen }: { album: Album; onOpen: () => void }) {
  return (
    <button type="button" className="card album-card" onClick={onOpen}>
      <div className="album-card-cover">
        {album.cover_url ? <img src={album.cover_url} alt="" loading="lazy" /> : <span className="album-card-empty"><Icon name="image" size={28} /></span>}
        <span className="album-card-count"><Icon name="image" size={12} /> {album.photo_count}</span>
      </div>
      <div className="album-card-body">
        <strong className="album-card-title">{album.title}</strong>
        <div className="row gap-2 wrap" style={{ marginTop: 4 }}>
          {!album.is_owner && album.owner && <span className="chip"><Icon name="profile" size={12} /> {album.owner.display_name}</span>}
          {album.is_owner && <span className="chip">{visLabel(album.visibility)}</span>}
          {album.is_owner && (album.shared_count ?? 0) > 0 && <span className="chip chip-accent"><Icon name="share" size={12} /> {album.shared_count}</span>}
        </div>
      </div>
    </button>
  );
}

/* ── Onglets albums / partagés ──────────────────────────────────────────── */
function AlbumsTab({ shared }: { shared: boolean }) {
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: shared ? ["albums", "shared"] : ["albums"],
    queryFn: () => api.albums(shared ? "shared" : "mine"),
  });
  const albums = data?.albums ?? [];

  return (
    <div>
      {!shared && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Nouvel album</button>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : albums.length === 0 ? (
        <EmptyState
          icon={shared ? "share" : "image"}
          title={shared ? "Rien de partagé pour l'instant" : "Aucun album"}
          hint={shared ? "Les albums que tes amis partagent avec toi apparaîtront ici." : "Crée un album pour regrouper et partager tes photos."}
          action={!shared ? <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Créer un album</button> : undefined}
        />
      ) : (
        <div className="grid-cards">
          {albums.map((a) => <AlbumCard key={a.id} album={a} onOpen={() => setOpenId(a.id)} />)}
        </div>
      )}

      {creating && <CreateAlbumModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
      {openId && <AlbumModal albumId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Page Photos
   ════════════════════════════════════════════════════════════════════════ */
type Tab = "photos" | "albums" | "shared";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "photos", label: "Mes photos", icon: "photos" },
  { id: "albums", label: "Albums", icon: "image" },
  { id: "shared", label: "Partagé avec moi", icon: "share" },
];

export default function Photos() {
  const [tab, setTab] = useState<Tab>("photos");
  const subtitle = useMemo(() => {
    if (tab === "albums") return "Regroupe tes photos en albums et partage-les.";
    if (tab === "shared") return "Les albums que tes amis ont partagés avec toi.";
    return "Importe directement tes images — tous formats, même HEIC.";
  }, [tab]);

  return (
    <div>
      <div className="page-head">
        <p className="eyebrow">Tes souvenirs</p>
        <h1>Photos</h1>
        <p className="muted">{subtitle}</p>
      </div>

      <div className="seg seg-scroll" role="tablist" style={{ marginBottom: "var(--space-5)" }}>
        {TABS.map((t) => (
          <button key={t.id} className={`seg-item${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)} role="tab" aria-selected={tab === t.id}>
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "photos" && <MyPhotos />}
      {tab === "albums" && <AlbumsTab shared={false} />}
      {tab === "shared" && <AlbumsTab shared />}
    </div>
  );
}
