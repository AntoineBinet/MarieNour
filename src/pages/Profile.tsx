import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Spinner, Field, useToast } from "../ui";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth";

/* ── Accents disponibles ─────────────────────────────────────────────────── */
const ACCENTS: { key: string; label: string; color: string }[] = [
  { key: "terracotta", label: "Terracotta", color: "#c8694b" },
  { key: "plum", label: "Prune", color: "#8a5a7e" },
  { key: "sage", label: "Sauge", color: "#6f8a5f" },
  { key: "ocean", label: "Océan", color: "#3f7d8a" },
  { key: "berry", label: "Baie", color: "#b04a63" },
];

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? "");

  const save = useMutation({
    mutationFn: () =>
      api.updateMe({
        display_name: displayName.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl.trim(),
      }),
    onSuccess: (res) => {
      setUser(res.user);
      toast.push("Profil mis à jour");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const setAccent = useMutation({
    mutationFn: (accent: string) => api.updateMe({ accent }),
    onSuccess: (res) => {
      setUser(res.user);
      toast.push("Couleur appliquée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const pickAccent = (accent: string) => {
    // Aperçu immédiat
    document.documentElement.setAttribute("data-accent", accent);
    setAccent.mutate(accent);
  };

  const submit = () => {
    if (!displayName.trim()) {
      toast.push("Donne-toi un nom à afficher", true);
      return;
    }
    save.mutate();
  };

  if (!user) {
    return <Spinner />;
  }

  const currentAccent = user.accent || "terracotta";

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

        <Field label="Avatar (URL)">
          <input
            className="input"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Field label="Pseudo">
          <input className="input" value={user.handle ? `@${user.handle}` : "—"} readOnly disabled />
        </Field>

        <Field label="Email">
          <input className="input" value={user.email ?? "—"} readOnly disabled />
        </Field>

        <div className="field">
          <label className="label">Couleur du thème</label>
          <div className="row gap-2 wrap">
            {ACCENTS.map((a) => {
              const selected = currentAccent === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  className={`btn ${selected ? "btn-ghost" : "btn-soft"} btn-sm`}
                  onClick={() => pickAccent(a.key)}
                  disabled={setAccent.isPending}
                  aria-pressed={selected}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: a.color,
                      display: "inline-block",
                      border: "1px solid rgba(0,0,0,0.12)",
                    }}
                  />
                  {a.label}
                  {selected && <Icon name="check" size={14} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: "var(--space-5)" }}>
          <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
