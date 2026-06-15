import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import type { Recipe, Visibility } from "@shared/types";

const VIS_LABEL: Record<Visibility, string> = {
  private: "Privé",
  friends: "Amis",
  public: "Public",
};

function totalTime(r: Recipe): string | null {
  const t = (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0);
  return t > 0 ? `${t} min` : null;
}

/* ── Formulaire création / édition ──────────────────────────────────────── */
function RecipeForm({
  initial,
  onClose,
}: {
  initial?: Recipe;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [servings, setServings] = useState(initial?.servings != null ? String(initial.servings) : "");
  const [prep, setPrep] = useState(initial?.prep_minutes != null ? String(initial.prep_minutes) : "");
  const [cook, setCook] = useState(initial?.cook_minutes != null ? String(initial.cook_minutes) : "");
  const [ingredients, setIngredients] = useState((initial?.ingredients ?? []).join("\n"));
  const [steps, setSteps] = useState((initial?.steps ?? []).join("\n"));
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "private");

  const buildBody = (): Partial<Recipe> => ({
    title: title.trim(),
    description: description.trim() || null,
    image_url: imageUrl.trim() || null,
    servings: servings.trim() ? Number(servings) : null,
    prep_minutes: prep.trim() ? Number(prep) : null,
    cook_minutes: cook.trim() ? Number(cook) : null,
    ingredients: ingredients.split("\n").map((s) => s.trim()).filter(Boolean),
    steps: steps.split("\n").map((s) => s.trim()).filter(Boolean),
    tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
    source_url: sourceUrl.trim() || null,
    visibility,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (initial) await api.updateRecipe(initial.id, buildBody());
      else await api.createRecipe(buildBody());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      if (initial) qc.invalidateQueries({ queryKey: ["recipe", initial.id] });
      toast.push(initial ? "Recette mise à jour ✨" : "Recette ajoutée ✨");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const submit = () => {
    if (!title.trim()) {
      toast.push("Donne un titre à ta recette", true);
      return;
    }
    save.mutate();
  };

  return (
    <Modal
      title={initial ? "Modifier la recette" : "Nouvelle recette"}
      onClose={onClose}
      wide
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
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tarte aux pommes" />
      </Field>
      <Field label="Description">
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quelques mots sur ce plat…" />
      </Field>
      <Field label="Image (URL)">
        <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <div className="row gap-3 wrap">
        <div className="field grow" style={{ minWidth: 120 }}>
          <label className="label">Portions</label>
          <input className="input" type="number" min="0" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" />
        </div>
        <div className="field grow" style={{ minWidth: 120 }}>
          <label className="label">Préparation (min)</label>
          <input className="input" type="number" min="0" value={prep} onChange={(e) => setPrep(e.target.value)} placeholder="20" />
        </div>
        <div className="field grow" style={{ minWidth: 120 }}>
          <label className="label">Cuisson (min)</label>
          <input className="input" type="number" min="0" value={cook} onChange={(e) => setCook(e.target.value)} placeholder="40" />
        </div>
      </div>
      <Field label="Ingrédients (un par ligne)">
        <textarea className="textarea" style={{ minHeight: 130 }} value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder={"200 g de farine\n3 pommes\n1 pincée de sel"} />
      </Field>
      <Field label="Étapes (une par ligne)">
        <textarea className="textarea" style={{ minHeight: 130 }} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={"Préchauffer le four à 180°C\nÉplucher les pommes\nEnfourner 40 minutes"} />
      </Field>
      <Field label="Tags (séparés par des virgules)">
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="dessert, automne, facile" />
      </Field>
      <Field label="Source (URL)">
        <input className="input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
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

/* ── Modal de lecture ───────────────────────────────────────────────────── */
function RecipeReader({
  id,
  onClose,
  onEdit,
  onDelete,
}: {
  id: string;
  onClose: () => void;
  onEdit: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
}) {
  const { data, isLoading } = useQuery({ queryKey: ["recipe", id], queryFn: () => api.recipe(id) });
  const r = data?.recipe;

  return (
    <Modal title={r?.title ?? "Recette"} onClose={onClose} wide>
      {isLoading || !r ? (
        <Spinner />
      ) : (
        <div className="col gap-4">
          {r.image_url && (
            <img
              src={r.image_url}
              alt={r.title}
              style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: "var(--radius)" }}
            />
          )}

          {r.description && <p className="muted">{r.description}</p>}

          <div className="row gap-2 wrap">
            {r.servings != null && <span className="chip">🍽️ {r.servings} portions</span>}
            {r.prep_minutes != null && <span className="chip">🔪 Prépa {r.prep_minutes} min</span>}
            {r.cook_minutes != null && <span className="chip">🔥 Cuisson {r.cook_minutes} min</span>}
            <span className="chip">{VIS_LABEL[r.visibility]}</span>
          </div>

          {r.tags.length > 0 && (
            <div className="row gap-2 wrap">
              {r.tags.map((t) => (
                <span key={t} className="chip chip-accent">{t}</span>
              ))}
            </div>
          )}

          {r.ingredients.length > 0 && (
            <div>
              <h3 style={{ marginBottom: "var(--space-2)" }}>Ingrédients</h3>
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {r.ingredients.map((ing, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{ing}</li>
                ))}
              </ul>
            </div>
          )}

          {r.steps.length > 0 && (
            <div>
              <h3 style={{ marginBottom: "var(--space-2)" }}>Étapes</h3>
              <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {r.steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: "var(--space-2)" }}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {r.source_url && (
            <p>
              <a href={r.source_url} target="_blank" rel="noreferrer">🔗 Voir la source</a>
            </p>
          )}

          <div className="row gap-2 wrap" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-danger" onClick={() => onDelete(r)}>🗑️ Supprimer</button>
            <button className="btn btn-soft" onClick={() => onEdit(r)}>✎ Éditer</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Carte recette ──────────────────────────────────────────────────────── */
function RecipeCard({
  r,
  onOpen,
  onToggleFav,
}: {
  r: Recipe;
  onOpen: () => void;
  onToggleFav: () => void;
}) {
  const time = totalTime(r);
  return (
    <div className="card card-pad-sm" style={{ cursor: "pointer", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={onOpen}>
      <div style={{ position: "relative", height: 150 }}>
        {r.image_url ? (
          <img src={r.image_url} alt={r.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: "2.8rem", background: "var(--surface-2)" }}>
            🍳
          </div>
        )}
        <button
          className="btn btn-icon btn-soft"
          style={{ position: "absolute", top: 8, right: 8 }}
          aria-label={r.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
        >
          {r.favorite ? "⭐" : "☆"}
        </button>
      </div>
      <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: 1 }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.02rem" }}>{r.title}</strong>
        {time && <span className="muted small">⏱️ {time}</span>}
        {r.tags.length > 0 && (
          <div className="row gap-2 wrap">
            {r.tags.slice(0, 3).map((t) => (
              <span key={t} className="chip chip-accent">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Recipes() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [q, setQ] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["recipes", q],
    queryFn: () => api.recipes(q || undefined),
  });
  const recipes = data?.recipes ?? [];

  const toggleFav = useMutation({
    mutationFn: (r: Recipe) => api.updateRecipe(r.id, { favorite: !r.favorite }),
    onSuccess: (_d, r) => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["recipe", r.id] });
      toast.push(r.favorite ? "Retiré des favoris" : "Ajouté aux favoris ⭐");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRecipe(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.push("Recette supprimée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async (r: Recipe) => {
    const ok = await confirm(`Supprimer la recette « ${r.title} » ?`);
    if (ok) {
      remove.mutate(r.id);
      setReading(null);
    }
  };

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Ta cuisine</p>
          <h1>Recettes 🍳</h1>
          <p className="muted">Toutes tes idées de plats, gardées au chaud.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ Nouvelle recette</button>
      </div>

      <div className="row" style={{ marginBottom: "var(--space-5)" }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Rechercher une recette, un ingrédient, un tag…"
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : recipes.length === 0 ? (
        <EmptyState
          emoji="🍽️"
          title={q ? "Aucune recette trouvée" : "Pas encore de recette"}
          hint={q ? "Essaie un autre mot-clé." : "Ajoute ta première recette pour commencer ton carnet."}
          action={!q && <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ Nouvelle recette</button>}
        />
      ) : (
        <div className="grid-cards">
          {recipes.map((r) => (
            <RecipeCard
              key={r.id}
              r={r}
              onOpen={() => setReading(r.id)}
              onToggleFav={() => toggleFav.mutate(r)}
            />
          ))}
        </div>
      )}

      {reading && (
        <RecipeReader
          id={reading}
          onClose={() => setReading(null)}
          onEdit={(r) => { setReading(null); setEditing(r); }}
          onDelete={askDelete}
        />
      )}

      {creating && <RecipeForm onClose={() => setCreating(false)} />}
      {editing && <RecipeForm initial={editing} onClose={() => setEditing(null)} />}

      {confirmNode}
    </div>
  );
}
