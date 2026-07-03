import { useRef, useState } from "react";
import { api } from "../api";
import { useToast } from "../ui";
import { Icon } from "./Icon";
import { IMAGE_ACCEPT, isImageFile } from "../images";

/* ── Champ image réutilisable ────────────────────────────────────────────────
   Mode principal : glisser-déposer (ou clic pour parcourir) une image — JPG,
   PNG, HEIC… — qui est aussitôt envoyée dans le cloud (R2 via /api/media) ;
   on stocke alors l'URL servie (/api/media/<id>/raw) dans le champ *_url existant.
   Mode secondaire (replié) : coller un lien d'image externe.
   Le média est créé en visibilité « public » — comme l'avatar — pour rester
   visible partout où l'élément (voyage, événement, recette…) est affiché. */
export function ImageField({
  value,
  onChange,
  disabled,
}: {
  /** URL courante (chaîne vide = aucune image). */
  value: string;
  /** Appelé avec la nouvelle URL (ou "" pour retirer). */
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const upload = async (file: File) => {
    if (!isImageFile(file)) {
      toast.push("Choisis une image (JPG, PNG, HEIC…)", true);
      return;
    }
    setUploading(true);
    try {
      const { media } = await api.uploadMedia(file, undefined, "public");
      onChange(media.url);
      toast.push("Image importée");
    } catch (e: any) {
      toast.push(e.message || "Import échoué", true);
    } finally {
      setUploading(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload(file);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (uploading || disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };
  const browse = () => {
    if (!uploading && !disabled) fileInput.current?.click();
  };

  return (
    <div className="image-field">
      <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} hidden onChange={onPick} disabled={disabled} />

      {value ? (
        <div className="image-field-preview">
          <img src={value} alt="" loading="lazy" decoding="async" />
          <div className="image-field-actions">
            <button type="button" className="btn btn-soft btn-sm row gap-1" onClick={browse} disabled={uploading || disabled}>
              <Icon name="image" size={14} /> {uploading ? "Envoi…" : "Remplacer"}
            </button>
            <button type="button" className="btn btn-soft btn-sm row gap-1" onClick={() => onChange("")} disabled={uploading || disabled}>
              <Icon name="trash" size={14} /> Retirer
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`image-drop${dragging ? " drag" : ""}${uploading ? " busy" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={browse}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); browse(); } }}
        >
          <span className="image-drop-ic"><Icon name="image" size={26} strokeWidth={1.6} /></span>
          {uploading ? (
            <p className="muted small">Envoi en cours…</p>
          ) : (
            <p className="muted small">
              {/* Libellé pointeur (ordi) et libellé tactile (mobile) : le CSS
                  n'en montre qu'un selon (hover: none) — sur iPhone il n'y a pas
                  de glisser-déposer, seulement le tap qui ouvre la photothèque. */}
              <strong className="image-drop-lead" style={{ color: "var(--accent-ink)" }}>Glisse une image ici</strong>
              <span className="image-drop-hint"> ou clique pour parcourir</span>
              <strong className="image-drop-touch" style={{ color: "var(--accent-ink)" }}>Touche pour choisir une photo</strong>
              <br />JPG, PNG, HEIC…
            </p>
          )}
        </div>
      )}

      {/* Mode secondaire : coller un lien d'image externe. */}
      {!showUrl ? (
        <button type="button" className="disclosure-toggle" onClick={() => setShowUrl(true)}>
          <span className="chev"><Icon name="arrowRight" size={14} /></span>
          Ou coller un lien d'image
        </button>
      ) : (
        <div className="disclosure-body">
          <input
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            type="url"
            inputMode="url"
            enterKeyHint="done"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
