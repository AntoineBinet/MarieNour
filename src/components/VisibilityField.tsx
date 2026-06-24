import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Icon, type IconName } from "./Icon";
import type { Visibility } from "@shared/types";

/* ── Partage : visibilité d'un contenu ────────────────────────────────────────
   Composant réutilisable par toutes les sections partageables du site (notes,
   listes, voyages, recettes, inspiration, photos, sondages, événements…).

   Quatre choix mutuellement exclusifs :
     • Privé        — moi seul
     • Amis         — tous mes amis
     • Public       — tout le monde
     • Amis choisis — uniquement les amis sélectionnés (visibility 'shared')

   Quand « Amis choisis » est actif, une liste d'amis cochables apparaît ;
   les ids retenus sont remontés via `onSharedWithChange`. */

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: IconName; hint: string }[] = [
  { value: "private", label: "Privé", icon: "lock", hint: "Toi seul" },
  { value: "friends", label: "Amis", icon: "users", hint: "Tous tes amis" },
  { value: "public", label: "Public", icon: "globe", hint: "Tout le monde" },
  { value: "shared", label: "Amis choisis", icon: "share", hint: "Quelques amis précis" },
];

export function visibilityLabel(v: Visibility, sharedWith?: string[] | null): string {
  if (v === "shared") {
    const n = sharedWith?.length ?? 0;
    return n > 0 ? `${n} ami${n > 1 ? "s" : ""}` : "Amis choisis";
  }
  return VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

/** Petit badge en lecture seule (cartes / listes). */
export function VisibilityChip({
  visibility,
  sharedWith,
}: {
  visibility: Visibility;
  sharedWith?: string[] | null;
}) {
  const opt = VISIBILITY_OPTIONS.find((o) => o.value === visibility);
  return (
    <span className="chip">
      {opt && <Icon name={opt.icon} size={12} />} {visibilityLabel(visibility, sharedWith)}
    </span>
  );
}

/** Sélecteur de visibilité + (si « Amis choisis ») multi-sélection d'amis. */
export function VisibilityField({
  value,
  sharedWith,
  onChange,
  onSharedWithChange,
}: {
  value: Visibility;
  sharedWith: string[];
  onChange: (v: Visibility) => void;
  onSharedWithChange: (ids: string[]) => void;
}) {
  const { data } = useQuery({ queryKey: ["friends"], queryFn: () => api.friends() });
  const friends = (data?.friends ?? []).map((f) => f.user);

  const toggle = (id: string) => {
    onSharedWithChange(
      sharedWith.includes(id) ? sharedWith.filter((x) => x !== id) : [...sharedWith, id],
    );
  };

  return (
    <div>
      <div className="seg seg-scroll" role="group" aria-label="Visibilité">
        {VISIBILITY_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`seg-item${value === o.value ? " active" : ""}`}
            aria-pressed={value === o.value}
            title={o.hint}
            onClick={() => onChange(o.value)}
          >
            <Icon name={o.icon} size={14} /> {o.label}
          </button>
        ))}
      </div>

      {value === "shared" && (
        <div style={{ marginTop: "var(--space-3)" }}>
          {friends.length === 0 ? (
            <p className="muted small">
              Ajoute d'abord des amis pour pouvoir partager avec certains d'entre eux.
            </p>
          ) : (
            <>
              <div className="row wrap gap-2">
                {friends.map((u) => {
                  const on = sharedWith.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`chip chip-pick${on ? " sel" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggle(u.id)}
                    >
                      {on && <Icon name="check" size={12} />} {u.display_name}
                    </button>
                  );
                })}
              </div>
              <p className="muted small" style={{ marginTop: "var(--space-2)" }}>
                {sharedWith.length === 0
                  ? "Sélectionne un ou plusieurs amis."
                  : `Partagé avec ${sharedWith.length} ami${sharedWith.length > 1 ? "s" : ""}.`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
