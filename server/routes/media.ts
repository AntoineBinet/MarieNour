import { Hono } from "hono";
import type { AppEnv } from "../types";
import { attachUser, requireAuth } from "../auth";
import { canView, mediaVisibleViaAlbum } from "../access";
import { cleanVisibility, now, str, uid } from "../util";
import type { MediaItem } from "@shared/types";

const app = new Hono<AppEnv>();

const MAX_BYTES = 25 * 1024 * 1024; // 25 Mo (photos haute résolution / HEIC iPhone)

function toMedia(r: Record<string, unknown>): MediaItem {
  return {
    id: r.id as string,
    url: `/api/media/${r.id as string}/raw`,
    filename: (r.filename as string) ?? null,
    content_type: (r.content_type as string) ?? null,
    size: (r.size as number) ?? null,
    caption: (r.caption as string) ?? null,
    visibility: cleanVisibility(r.visibility),
    created_at: r.created_at as number,
  };
}

// Liste des médias de l'utilisateur (auth requise).
app.get("/", requireAuth, async (c) => {
  const res = await c.env.DB.prepare("SELECT * FROM media WHERE user_id = ? ORDER BY created_at DESC")
    .bind(c.var.user!.id)
    .all<Record<string, unknown>>();
  return c.json({ media: (res.results ?? []).map(toMedia) });
});

// Upload (multipart). Champ "file" + optionnels "caption", "visibility".
app.post("/", requireAuth, async (c) => {
  const me = c.var.user!.id;
  const form = await c.req.formData();
  const raw = form.get("file");
  if (!raw || typeof raw === "string") return c.json({ error: "Fichier manquant" }, 400);
  const file = raw as unknown as {
    size: number;
    name: string;
    type: string;
    arrayBuffer(): Promise<ArrayBuffer>;
  };
  if (file.size > MAX_BYTES) return c.json({ error: "Fichier trop volumineux (max 15 Mo)" }, 413);

  const id = uid();
  const safeName = str(file.name || "image", 120).replace(/[^\w.\-]+/g, "_");
  const key = `media/${me}/${id}-${safeName}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  await c.env.DB.prepare(
    "INSERT INTO media (id, user_id, r2_key, filename, content_type, size, caption, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      me,
      key,
      safeName,
      file.type || null,
      file.size,
      str(form.get("caption"), 500) || null,
      cleanVisibility(form.get("visibility")),
      now(),
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return c.json({ media: toMedia(row!) });
});

// Sert le binaire depuis R2 (vérifie la visibilité). Utilisé par <img src>.
app.get("/:id/raw", attachUser, async (c) => {
  const id = c.req.param("id")!;
  const row = await c.env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: "Introuvable" }, 404);
  const viewerId = c.var.user?.id ?? null;
  // Visible si la photo elle-même est accessible, OU si elle figure dans un
  // album partagé auquel le viewer a accès (partage par album).
  const allowed =
    (await canView(c.env.DB, viewerId, row.user_id as string, cleanVisibility(row.visibility))) ||
    (await mediaVisibleViaAlbum(c.env.DB, viewerId, id));
  if (!allowed) return c.json({ error: "Accès refusé" }, 403);

  const obj = await c.env.MEDIA.get(row.r2_key as string);
  if (!obj) return c.json({ error: "Fichier absent" }, 404);
  const headers = new Headers();
  headers.set("Content-Type", (row.content_type as string) || "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=86400");
  return new Response(obj.body, { headers });
});

app.patch("/:id", requireAuth, async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.caption !== undefined) {
    fields.push("caption = ?");
    values.push(str(body.caption, 500) || null);
  }
  if (body.visibility !== undefined) {
    fields.push("visibility = ?");
    values.push(cleanVisibility(body.visibility));
  }
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  values.push(id, me);
  await c.env.DB.prepare(`UPDATE media SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

app.delete("/:id", requireAuth, async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT r2_key FROM media WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first<{ r2_key: string }>();
  if (!row) return c.json({ error: "Introuvable" }, 404);
  await c.env.MEDIA.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM media WHERE id = ? AND user_id = ?").bind(id, me).run();
  return c.json({ ok: true });
});

export default app;
