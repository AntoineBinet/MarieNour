import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import { Icon } from "../components/Icon";
import type { MediaItem, Visibility } from "@shared/types";

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: "private", label: "Privé" },
  { value: "friends", label: "Amis" },
  { value: "public", label: "Public" },
];
const visLabel = (v: Visibility) => VISIBILITIES.find((x) => x.value === v)?.label ?? v;

function formatDate(ts: number): string {
  return new Date(ts * (ts < 1e12 ? 1000 : 1)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ── Modal d'aperçu / édition d'une photo ───────────────────────────────── */
function PhotoModal({
  media,
  onClose,
  onDelete,
}: {
  media: MediaItem;
  onClose: () => void;
  onDelete: (m: MediaItem) => void;
}) {
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
          style={{
            width: "100%",
            maxHeight: "60vh",
            objectFit: "contain",
            borderRadius: "var(--radius)",
            background: "var(--surface-2)",
          }}
        />

        <Field label="Légende">
          <input
            className="input"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={saveCaption}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Ajoute une légende…"
          />
        </Field>

        <Field label="Visibilité">
          <select className="select" value={visibility} onChange={(e) => changeVisibility(e.target.value as Visibility)}>
            {VISIBILITIES.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
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

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Photos() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const fileInput = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<MediaItem | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["media"], queryFn: () => api.media() });
  const media = data?.media ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMedia(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
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

  const uploadFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
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
        toast.push(e.message || "Upload échoué", true);
      }
      setUploading({ done: i + 1, total: images.length });
    }
    setUploading(null);
    qc.invalidateQueries({ queryKey: ["media"] });
    if (ok > 0) toast.push(`${ok} photo${ok > 1 ? "s" : ""} importée${ok > 1 ? "s" : ""}`);
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
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Tes souvenirs</p>
          <h1>Photos</h1>
          <p className="muted">Importe, légende et partage tes images préférées.</p>
        </div>
        <button className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={!!uploading}>
          {uploading ? `Envoi en cours… (${uploading.done}/${uploading.total})` : <><Icon name="plus" size={15} /> Importer</>}
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={onPick}
      />

      <div
        className="card"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileInput.current?.click()}
        style={{
          marginBottom: "var(--space-5)",
          textAlign: "center",
          cursor: uploading ? "default" : "pointer",
          borderStyle: "dashed",
          borderColor: dragging ? "var(--accent)" : "var(--border-strong)",
          background: dragging ? "color-mix(in srgb, var(--accent) 8%, transparent)" : undefined,
        }}
      >
        {uploading ? (
          <p className="muted">Envoi en cours… {uploading.done}/{uploading.total}</p>
        ) : (
          <p className="muted">
            <strong style={{ color: "var(--accent-ink)" }}>Glisse tes photos ici</strong> ou clique pour parcourir.
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
            <div
              key={m.id}
              className="card card-pad-sm"
              style={{ padding: 0, overflow: "hidden", cursor: "pointer" }}
              onClick={() => setViewing(m)}
            >
              <img
                src={m.url}
                alt={m.caption ?? m.filename ?? ""}
                loading="lazy"
                style={{ width: "100%", display: "block", borderRadius: "var(--radius)" }}
              />
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

      {viewing && (
        <PhotoModal media={viewing} onClose={() => setViewing(null)} onDelete={askDelete} />
      )}

      {confirmNode}
    </div>
  );
}
