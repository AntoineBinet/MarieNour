# marienour

**L'atelier personnel pour tout garder, planifier et partager.**

Un hub perso, personnalisable et semi-social : un tableau de bord à **widgets** quasi vide au départ, qu'on enrichit de modules (listes, voyages, recettes, inspirations, photos…). Chaque utilisateur a son compte, peut rendre ses contenus privés / visibles par ses amis / publics, et suivre le fil de ses amis.

Hébergé sur le domaine `marienour.work`, **comme Portfolio (ab-azurtech.com) et Prospup (prospup.work)** : une **VM Oracle Cloud dédiée** + un **tunnel Cloudflare** (`marienour-oracle`), 100 % séparée des deux autres. Le même code Hono tourne aussi en serverless Cloudflare Pages (voir « Hébergement »).

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
| API | [Hono](https://hono.dev) — runtime-agnostique |
| Prod (VM Oracle) | **Node** (`@hono/node-server`) + **SQLite** (better-sqlite3) + **fichiers locaux** |
| Repli serverless | **Cloudflare Pages Functions** + **D1** + **R2** |
| Auth | sessions (cookie httpOnly), mots de passe hashés PBKDF2 (Web Crypto) |

La **même app Hono** (`server/`) tourne sur deux runtimes : sur la VM, les
adaptateurs `server/adapters/` réimplémentent les API D1/R2 au-dessus de SQLite
et du système de fichiers, donc **aucune route ne change**.

```
index.html, src/            → front React (build → dist/)
server/                     → app Hono : auth, routes, accès, utils (commun aux 2 runtimes)
server/node.ts              → point d'entrée VM Oracle (Node) — sert l'API + le front (dist/)
server/adapters/{d1,r2}.ts  → bindings locaux : D1→SQLite, R2→fichiers (data/)
functions/api/[[route]].ts  → point d'entrée Cloudflare Pages Functions (repli serverless)
shared/types.ts             → types partagés front/back
migrations/                 → schéma SQL (D1 et SQLite)
deployment/                 → kit VM Oracle + tunnel (bootstrap, systemd, cloudflared)
```

---

## 🚀 Développement local

Prérequis : Node 20+.

### Option A — runtime VM (Node + SQLite, comme la prod)

```bash
npm install
npm run build:all            # build du front (dist/) + du serveur (dist-server/)
ADMIN_EMAIL=binet.antoine215@yahoo.com ADMIN_PASSWORD=dev SESSION_SECRET=dev \
  MARIENOUR_PORT=8002 npm start
```

Ouvre http://127.0.0.1:8002. La base SQLite et les médias sont créés sous
`data/` (gitignoré, migrations rejouées au démarrage). Le **premier login** avec
`ADMIN_EMAIL` + `ADMIN_PASSWORD` crée ton compte admin.

### Option B — runtime serverless (Vite + wrangler, repli Cloudflare)

```bash
cp .dev.vars.example .dev.vars        # renseigne ADMIN_PASSWORD et SESSION_SECRET
npm run db:migrate:local              # base D1 locale + schéma
npm run build
npm run dev          # 1) front Vite sur http://localhost:5173 (proxy /api → :8788)
npm run dev:api      # 2) API + D1 + R2 en local (wrangler) sur :8788
```

---

## ☁️ Hébergement — VM Oracle + tunnel Cloudflare (prod)

La prod tourne sur une **VM Oracle Cloud dédiée** derrière un **tunnel
Cloudflare** (`marienour-oracle` → `localhost:8002`), exactement comme Portfolio
et Prospup, mais **100 % séparée**.

- **Pas à pas complet** : [`deployment/DEPLOY.md`](deployment/DEPLOY.md).
- **Mise en ligne assistée (2 onglets : Oracle + Cloudflare)** : colle le runbook
  [`docs/SETUP-CLOUDFLARE-CHROME.md`](docs/SETUP-CLOUDFLARE-CHROME.md) à *Claude
  dans Chrome*, il pilote les deux onglets.
- **Mise à jour** : bouton « Mettre à jour » dans `/admin` (carte « Mise à jour de
  l'application »), ou en SSH **en tant qu'utilisateur ops** (ex. `ubuntu`)&nbsp;:
  `cd /opt/marienour/app && bash deployment/update.sh`.

> **Repli serverless Cloudflare Pages** (toujours possible — le code Hono est
> commun) : la base **D1 `marienour`** et le bucket **R2 `marienour-media`** sont
> déjà créés (cf. `wrangler.toml`). Connecter le repo à un projet Pages
> (`npm run build` / output `dist`), poser les secrets
> `wrangler pages secret put ADMIN_PASSWORD|SESSION_SECRET`, rattacher le domaine.
> Migrations distantes : `npm run db:migrate`.

---

## 🧩 Ajouter un nouveau widget / module

1. Backend : nouvelle route Hono dans `server/routes/`, montée dans `server/app.ts`, + table(s) dans une nouvelle migration `migrations/000X_*.sql`.
2. Types partagés dans `shared/types.ts`, méthodes dans `src/api.ts`.
3. Page dans `src/pages/` + entrée de route dans `src/App.tsx` + lien dans `src/components/Layout.tsx`.
4. (Optionnel) Widget de dashboard : composant dans `src/widgets/index.tsx` + entrée dans `WIDGET_CATALOG`.
