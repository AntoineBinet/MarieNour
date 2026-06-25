import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { bool, cleanSharedWith, cleanVisibility, intOrNull, now, parseJson, str, uid } from "../util";
import { setEntityShares, getEntityShares, getEntitySharesBulk, deleteEntityShares } from "../access";
import type { Recipe } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

function strArray(v: unknown, max = 120): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x, 500)).filter((x) => x.trim().length).slice(0, max);
}

function toRecipe(r: Record<string, unknown>): Recipe {
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    image_url: (r.image_url as string) ?? null,
    servings: (r.servings as number) ?? null,
    prep_minutes: (r.prep_minutes as number) ?? null,
    cook_minutes: (r.cook_minutes as number) ?? null,
    ingredients: parseJson<string[]>(r.ingredients, []),
    steps: parseJson<string[]>(r.steps, []),
    tags: parseJson<string[]>(r.tags, []),
    source_url: (r.source_url as string) ?? null,
    favorite: bool(r.favorite),
    visibility: cleanVisibility(r.visibility),
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
  };
}

app.get("/", async (c) => {
  const q = str(c.req.query("q"), 80).trim().toLowerCase();
  const base =
    "SELECT * FROM recipes WHERE user_id = ?" +
    (q ? " AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags) LIKE ?)" : "") +
    " ORDER BY favorite DESC, updated_at DESC";
  const stmt = q
    ? c.env.DB.prepare(base).bind(c.var.user!.id, `%${q}%`, `%${q}%`, `%${q}%`)
    : c.env.DB.prepare(base).bind(c.var.user!.id);
  const res = await stmt.all<Record<string, unknown>>();
  const items = (res.results ?? []).map(toRecipe);
  const shareMap = await getEntitySharesBulk(c.env.DB, "recipe", items.map((i) => i.id));
  for (const it of items) { const s = shareMap.get(it.id); if (s && s.length) it.shared_with = s; }
  return c.json({ recipes: items });
});

app.get("/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM recipes WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.var.user!.id)
    .first<Record<string, unknown>>();
  if (!r) return c.json({ error: "Recette introuvable" }, 404);
  const recipe = toRecipe(r);
  const _s = await getEntityShares(c.env.DB, { type: "recipe", id: recipe.id });
  if (_s.length) recipe.shared_with = _s;
  return c.json({ recipe });
});

app.post("/", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO recipes (id, user_id, title, description, image_url, servings, prep_minutes, cook_minutes, ingredients, steps, tags, source_url, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      me,
      str(body.title, 160).trim() || "Nouvelle recette",
      str(body.description, 2000) || null,
      str(body.image_url, 1000) || null,
      intOrNull(body.servings),
      intOrNull(body.prep_minutes),
      intOrNull(body.cook_minutes),
      JSON.stringify(strArray(body.ingredients)),
      JSON.stringify(strArray(body.steps)),
      JSON.stringify(strArray(body.tags, 20)),
      str(body.source_url, 1000) || null,
      cleanVisibility(body.visibility),
      ts,
      ts,
    )
    .run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me, { type: "recipe", id }, _sw);
  return c.json({ id });
});

app.patch("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("title", "title", (v) => str(v, 160));
  setIf("description", "description", (v) => str(v, 2000) || null);
  setIf("image_url", "image_url", (v) => str(v, 1000) || null);
  setIf("servings", "servings", (v) => intOrNull(v));
  setIf("prep_minutes", "prep_minutes", (v) => intOrNull(v));
  setIf("cook_minutes", "cook_minutes", (v) => intOrNull(v));
  setIf("ingredients", "ingredients", (v) => JSON.stringify(strArray(v)));
  setIf("steps", "steps", (v) => JSON.stringify(strArray(v)));
  setIf("tags", "tags", (v) => JSON.stringify(strArray(v, 20)));
  setIf("source_url", "source_url", (v) => str(v, 1000) || null);
  setIf("favorite", "favorite", (v) => (bool(v) ? 1 : 0));
  setIf("visibility", "visibility", (v) => cleanVisibility(v));
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), id, me);
  await c.env.DB.prepare(`UPDATE recipes SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me, { type: "recipe", id }, _sw);
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM recipes WHERE id = ? AND user_id = ?")
    .bind(id, c.var.user!.id)
    .run();
  await deleteEntityShares(c.env.DB, { type: "recipe", id });
  return c.json({ ok: true });
});

export default app;
