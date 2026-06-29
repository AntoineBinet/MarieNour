import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Spinner, Field, Modal, useToast } from "../ui";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth";
import { IMAGE_ACCEPT, isImageFile } from "../images";
import type { Gender } from "@shared/types";

const GENDERS: { key: Gender | ""; label: string }[] = [
  { key: "", label: "Non précisé" },
  { key: "female", label: "Femme" },
  { key: "male", label: "Homme" },
  { key: "other", label: "Autre" },
];

/** Aperçu du pseudo normalisé (miroir de slugifyHandle côté serveur). */
function slugifyHandle(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20)
  );
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [handle, setHandle] = useState(user?.handle ?? "");
  const [gender, setGender] = useState<Gender | "">(user?.gender ?? "");

  const avatarInput = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: () =>
      api.updateMe({
        display_name: displayName.trim(),
        bio: bio.trim(),
        email: email.trim(),
        handle: handle.trim(),
        gender: gender || null,
      }),
    onSuccess: (res) => {
      setUser(res.user);
      toast.push("Profil mis à jour");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => api.uploadAvatar(file),
    onSuccess: (res) => {
      setUser(res.user);
      toast.push("Photo de profil mise à jour");
    },
    onError: (e: any) => toast.push(e.message || "Envoi échoué", true),
  });

  const removeAvatar = useMutation({
    mutationFn: () => api.removeAvatar(),
    onSuccess: (res) => {
      setUser(res.user);
      toast.push("Photo de profil retirée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isImageFile(file)) {
      toast.push("Choisis une image (JPEG, PNG, HEIC…)", true);
      return;
    }
    uploadAvatar.mutate(file);
  };

  // Suppression de compte (re-confirmation par mot de passe).
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const del = useMutation({
    mutationFn: () => api.deleteMyAccount(deletePassword),
    onSuccess: () => {
      // Session effacée côté serveur : on recharge sur l'écran de connexion.
      window.location.href = "/login";
    },
    onError: (e: any) => toast.push(e.message || "Suppression impossible", true),
  });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const submit = () => {
    if (!displayName.trim()) {
      toast.push("Donne-toi un nom à afficher", true);
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.push("Indique un e-mail valide", true);
      return;
    }
    if (!handle.trim()) {
      toast.push("Choisis un pseudo", true);
      return;
    }
    save.mutate();
  };

  if (!user) {
    return <Spinner />;
  }

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Toi</p>
          <h1 className="row gap-2">Mon profil <Icon name="mirror" size={22} /></h1>
          <p className="muted">Personnalise la façon dont les autres te voient.</p>
        </div>
        {user.role === "admin" && (
          <div className="row gap-2">
            <span className="chip chip-accent">Admin</span>
            <Link to="/admin" className="btn btn-soft">Administration</Link>
          </div>
        )}
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        <Field label="Nom affiché">
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ton nom"
          />
        </Field>

        <Field label="Bio">
          <textarea
            className="textarea"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Quelques mots sur toi…"
          />
        </Field>

        <div className="field">
          <label className="label">Photo de profil</label>
          <div className="row gap-3 wrap" style={{ alignItems: "center" }}>
            <span className="avatar-lg" aria-hidden>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" />
              ) : (
                <Icon name="profile" size={30} />
              )}
            </span>
            <div className="col gap-2">
              <div className="row gap-2 wrap">
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => avatarInput.current?.click()}
                  disabled={uploadAvatar.isPending}
                >
                  <Icon name="camera" size={15} /> {uploadAvatar.isPending ? "Envoi…" : user.avatar_url ? "Changer la photo" : "Ajouter une photo"}
                </button>
                {user.avatar_url && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeAvatar.mutate()} disabled={removeAvatar.isPending}>
                    <Icon name="trash" size={15} /> Retirer
                  </button>
                )}
              </div>
              <p className="muted small">Depuis ton appareil — JPEG, PNG, HEIC (iPhone)… jusqu'à 25 Mo.</p>
            </div>
          </div>
          <input ref={avatarInput} type="file" accept={IMAGE_ACCEPT} hidden onChange={onPickAvatar} />
        </div>

        <Field label="Pseudo">
          <input
            className="input"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="ton-pseudo"
          />
          <p className="muted small" style={{ marginTop: 4 }}>
            Lettres et chiffres uniquement (les accents et espaces sont retirés). C'est ton identifiant public&nbsp;: @{slugifyHandle(handle) || "pseudo"}.
          </p>
        </Field>

        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
          />
          <p className="muted small" style={{ marginTop: 4 }}>
            Sert à te connecter. En le changeant, tu te connecteras désormais avec ce nouvel e-mail.
          </p>
        </Field>

        <Field label="Sexe">
          <select className="select" value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
            {GENDERS.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
          <p className="muted small" style={{ marginTop: 4 }}>
            Information privée. Le style de l'app se règle indépendamment dans{" "}
            <Link to="/personnalisation">Personnalisation</Link>.
          </p>
        </Field>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: "var(--space-5)" }}>
          <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Renvoi vers le centre de personnalisation (couleurs, thème, typo…). */}
      <Link to="/personnalisation" className="card fin-click" style={{ maxWidth: 620, marginTop: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-4)", textDecoration: "none", color: "inherit" }}>
        <span className="appr-section-ic"><Icon name="palette" size={22} /></span>
        <span className="grow col" style={{ gap: 2 }}>
          <strong>Personnaliser l'apparence</strong>
          <span className="muted small">Couleurs, thème, fond, typographie, prénom d'accueil… à ton image.</span>
        </span>
        <Icon name="arrowRight" size={18} />
      </Link>

      {/* Données & compte (RGPD) : export + suppression. */}
      <div className="card" style={{ maxWidth: 620, marginTop: "var(--space-4)" }}>
        <h2 className="row gap-2" style={{ marginTop: 0, marginBottom: 6 }}>
          <Icon name="lock" size={18} /> Données &amp; compte
        </h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Télécharge une copie de tout ce que tu as créé, ou supprime définitivement ton compte.
        </p>
        <div className="row gap-2 wrap" style={{ marginTop: "var(--space-3)" }}>
          <a className="btn btn-soft" href={api.exportUrl} download>
            <Icon name="download" size={15} /> Exporter mes données
          </a>
          {user.role !== "admin" && (
            <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
              <Icon name="trash" size={15} /> Supprimer mon compte
            </button>
          )}
        </div>
      </div>

      {showDelete && (
        <Modal
          title="Supprimer mon compte"
          onClose={() => {
            setShowDelete(false);
            setDeletePassword("");
          }}
          footer={
            <>
              <button
                className="btn btn-soft"
                onClick={() => {
                  setShowDelete(false);
                  setDeletePassword("");
                }}
              >
                Annuler
              </button>
              <button
                className="btn btn-danger"
                onClick={() => del.mutate()}
                disabled={!deletePassword || del.isPending}
              >
                {del.isPending ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            Cette action est <strong>irréversible</strong>. Toutes tes données (notes, listes, voyages, photos,
            souvenirs, dépenses…) seront définitivement supprimées.
          </p>
          <Field label="Confirme avec ton mot de passe">
            <input
              className="input"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Ton mot de passe"
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
