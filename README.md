# marienour

**L'atelier personnel pour tout garder, planifier et partager.**

Un hub perso, personnalisable et semi-social : un tableau de bord à **widgets** quasi vide au départ, qu'on enrichit de modules (listes, voyages, recettes, inspirations, photos…). Chaque utilisateur a son compte, peut rendre ses contenus privés / visibles par ses amis / publics, et suivre le fil de ses amis.

Conçu pour tourner **toujours en ligne sur Cloudflare** (Pages + Functions + D1 + R2), sur le domaine `marienour.work`.

---

## ✨ Fonctionnalités (v1)

- **Tableau de bord à widgets** : ajouter / retirer / redimensionner / réordonner (drag & drop). Le layout est sauvegardé par utilisateur.
- **Listes & checklists** : cases à cocher, progression, couleurs, archivage.
- **Notes & idées** : notes colorées, épinglage, recherche.
- **Voyages** : itinéraires jour par jour, étapes (activité / repas / logement / transport), budget, compte à rebours.
- **Recettes** : ingrédients, étapes, temps, favoris, photo, source.
- **Inspiration** : « boîte à trier » des likes/posts enregistrés (Instagram, TikTok, Pinterest, YouTube, web) + tableaux (moodboards).
- **Photos** : galerie, upload sur R2.
- **Semi-social** : comptes, amis (demandes / acceptation), fil d'actualité des amis, likes & commentaires, profils publics.
- **Admin** (toi) : statistiques, gestion des utilisateurs, réinitialisation de mot de passe, rôles — via un **mot de passe maître admin**.
- **Thème** clair/sombre + couleur d'accent personnalisable. Responsive (mobile-friendly, PWA installable).

---

## 🧱 Stack

| Couche | Techno |
| --- | --- |
| Front | React 18 + TypeScript + Vite, React Router, TanStack Query, dnd-kit |
| API | [Hono](https://hono.dev) sur **Cloudflare Pages Functions** |
| Base de données | **Cloudflare D1** (SQLite) |
| Fichiers / photos | **Cloudflare R2** |
| Auth | sessions (cookie httpOnly), mots de passe hashés PBKDF2 (Web Crypto) |

```
index.html, src/            → front React (build → dist/)
functions/api/[[route]].ts  → point d'entrée Pages Functions (monte l'app Hono)
server/                     → app Hono : auth, routes, accès, utils
shared/types.ts             → types partagés front/back
migrations/                 → schéma D1
```

---

## 🚀 Développement local

Prérequis : Node 18+.

```bash
npm install
cp .dev.vars.example .dev.vars        # renseigne ADMIN_PASSWORD et SESSION_SECRET
npm run db:migrate:local              # crée la base D1 locale + applique le schéma
npm run build                         # build initial du front (sert pour wrangler)
```

Puis, dans **deux terminaux** :

```bash
npm run dev          # 1) front Vite sur http://localhost:5173 (proxy /api → :8788)
npm run dev:api      # 2) API + D1 + R2 en local (wrangler) sur :8788
```

Ouvre http://localhost:5173. Le **premier login** avec l'email `ADMIN_EMAIL`
(voir `wrangler.toml`) et le `ADMIN_PASSWORD` crée automatiquement ton compte admin.

> Astuce : pour ne lancer qu'un seul terminal, tu peux faire `npm run build` puis
> `npm run dev:api` et ouvrir directement http://localhost:8788.

---

## ☁️ Déploiement Cloudflare

1. **Créer les ressources** (une fois) :
   ```bash
   npx wrangler d1 create marienour          # colle l'ID renvoyé dans wrangler.toml (database_id)
   npx wrangler r2 bucket create marienour-media
   npx wrangler d1 migrations apply marienour --remote
   ```
2. **Secrets** (Pages) :
   ```bash
   npx wrangler pages secret put ADMIN_PASSWORD
   npx wrangler pages secret put SESSION_SECRET
   ```
   `ADMIN_EMAIL` et `APP_NAME` sont dans `wrangler.toml` ([vars]).
3. **Déployer** :
   - soit en connectant le repo GitHub à **Cloudflare Pages** (build command `npm run build`, output `dist`, et bindings D1 `DB` + R2 `MEDIA`),
   - soit en CLI : `npm run deploy`.
4. **Domaine** : rattacher `marienour.work` (et `www`) au projet Pages dans le dashboard Cloudflare (le domaine y est déjà géré).

---

## 🧩 Ajouter un nouveau widget / module

1. Backend : nouvelle route Hono dans `server/routes/`, montée dans `server/app.ts`, + table(s) dans une nouvelle migration `migrations/000X_*.sql`.
2. Types partagés dans `shared/types.ts`, méthodes dans `src/api.ts`.
3. Page dans `src/pages/` + entrée de route dans `src/App.tsx` + lien dans `src/components/Layout.tsx`.
4. (Optionnel) Widget de dashboard : composant dans `src/widgets/index.tsx` + entrée dans `WIDGET_CATALOG`.
