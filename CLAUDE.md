# marienour — marienour.work

Hub perso à **widgets**, multi-utilisateurs et semi-social (listes, notes,
voyages, recettes, inspirations, photos, amis/fil). Publié sur
**https://marienour.work** via le tunnel Cloudflare `marienour-oracle` (VM Oracle).

## Hébergement & infrastructure

> **Modèle = identique à Portfolio (ab-azurtech.com) et Prospup (prospup.work),
> mais 100 % séparé** : sa propre VM Oracle, son user, son service, son tunnel et
> son **port 8002**. Aucun mélange possible.

- **Chaîne (prod)** : Navigateur → Cloudflare edge (TLS/WAF) → tunnel
  **`marienour-oracle`** → `cloudflared` (systemd) → `http://127.0.0.1:8002` →
  **Node/Hono** (`dist-server/server.mjs`, service systemd `marienour`) → SQLite
  + médias locaux (`data/`).
- **VM cible** : Oracle Always Free **VM.Standard.E2.1.Micro** (AMD x86) — la 2ᵉ
  micro gratuite (Portfolio prend l'autre micro AMD, Prospup tout l'Ampere ARM).
  Le bootstrap auto-détecte x86/ARM.
- **Port 8002 jamais exposé** (bind `127.0.0.1` + aucune ouverture Security List ;
  seul SSH/22).
- **Service** : `marienour.service` (systemd, `Restart=always`). Statut :
  `systemctl status marienour` · logs : `journalctl -u marienour -f`.
- **Données** : `/opt/marienour/app/data/` (SQLite `marienour.db` + `media/`),
  **hors arbre git**, conservées entre MAJ. Secrets dans
  `/etc/marienour/marienour.env` (chmod 600) — **jamais** dans git.
- **Kit** : [deployment/](deployment/) ([DEPLOY.md](deployment/DEPLOY.md)) —
  `bootstrap-vm.sh`, `marienour.service`, `setup-cloudflared.sh`,
  `finalize-on-vm.sh`, `update.sh`, `marienour.env.example`.
- **Mise en ligne assistée (2 onglets Oracle + Cloudflare)** :
  [docs/SETUP-CLOUDFLARE-CHROME.md](docs/SETUP-CLOUDFLARE-CHROME.md) — runbook à
  coller dans « Claude dans Chrome ».

## Deux runtimes, une seule app Hono

L'app Hono (`server/`) est **runtime-agnostique** et tourne sur deux cibles sans
changer une seule route :

- **VM Oracle (prod)** — [`server/node.ts`](server/node.ts) via `@hono/node-server`.
  Les bindings Cloudflare sont réimplémentés en local par
  [`server/adapters/d1.ts`](server/adapters/d1.ts) (API D1 → **better-sqlite3** +
  runner de migrations) et [`server/adapters/r2.ts`](server/adapters/r2.ts) (API
  R2 → **fichiers** sous `data/media/`). Le serveur sert aussi le front buildé
  (`dist/`) avec repli SPA.
- **Cloudflare Pages (repli serverless)** — [`functions/api/[[route]].ts`](functions/api/%5B%5Broute%5D%5D.ts)
  + D1 `marienour` + R2 `marienour-media` (déjà créés, cf. `wrangler.toml`).

⚠️ **Toute route reste écrite pour l'API D1/R2** (`c.env.DB`, `c.env.MEDIA`). Ne
jamais introduire d'API spécifique à un runtime dans `server/routes/` : si un
besoin l'exige, l'abstraire dans un adaptateur.

## Architecture fichiers

```
index.html, src/            → front React 18 + Vite (build → dist/)
server/app.ts               → app Hono (basePath /api), monte les routes
server/routes/*.ts          → auth, friends, widgets, lists, notes, trips,
                              recipes, inspiration, media, social, admin,
                              expenses (Tricount), finance (budget perso),
                              polls (sondages), invites (QR codes),
                              onboarding (seed de démarrage),
                              events (planification : RSVP, sondage de dates,
                              tâches, programme, « qui apporte quoi »)
src/components/Icon.tsx      → jeu d'icônes SVG « maison » (remplace les emojis)
src/components/QrCode.tsx    → QR en SVG (lib qrcode-generator, hors-ligne)
src/components/InviteQr.tsx  → bouton « Inviter par QR » (ami / voyage / groupe)
src/components/InviteLink.tsx→ bouton « Inviter par lien » (copie le lien dans le presse-papier)
server/{auth,access,util}.ts→ sessions (cookie httpOnly, PBKDF2 Web Crypto), ACL
server/mailer.ts            → e-mails transactionnels via API HTTP Resend (fetch,
                              cross-runtime) : ex. alerte admin à chaque inscription
server/node.ts              → entrée Node (VM) : env + static + SPA + listen :8002
server/adapters/{d1,r2}.ts  → bindings locaux (SQLite / fichiers)
shared/types.ts             → types partagés front/back
migrations/000X_*.sql       → schéma (rejoué auto au démarrage sur la VM)
deployment/                 → kit VM Oracle + tunnel
docs/SETUP-CLOUDFLARE-CHROME.md → runbook « Claude dans Chrome » (2 onglets)
```

## Commandes

```bash
npm install
npm run typecheck        # tsc front + serveur (workers-types)
npm run build:all        # front (dist/) + serveur (dist-server/server.mjs)
npm start                # lance le serveur Node (lit MARIENOUR_PORT, défaut 8002)
# Dev VM rapide :
ADMIN_EMAIL=binet.antoine215@yahoo.com ADMIN_PASSWORD=dev SESSION_SECRET=dev npm start
# Dev serverless (repli) : npm run dev + npm run dev:api (wrangler)
```

## Variables d'environnement (runtime VM)

| Variable | Défaut | Usage |
| --- | --- | --- |
| `MARIENOUR_PORT` | `8002` | port d'écoute (aussi `PORT`) |
| `MARIENOUR_HOST` | `127.0.0.1` | bind (ne pas exposer en prod) |
| `MARIENOUR_DATA_DIR` | `./data` | SQLite + médias (gitignoré) |
| `ADMIN_EMAIL` | `binet.antoine215@yahoo.com` | e-mail du compte admin |
| `ADMIN_PASSWORD` | (vide) | mot de passe maître admin (1er login = création) |
| `SESSION_SECRET` | (vide) | secret de session (`openssl rand -hex 32`) |
| `APP_NAME` | `marienour` | nom affiché |
| `RESEND_API_KEY` | (vide) | clé API Resend pour l'envoi d'e-mails (vide = off) |
| `MAIL_FROM` | `onboarding@resend.dev` | expéditeur des e-mails |

> Sur la VM, ces valeurs viennent de `/etc/marienour/marienour.env` (secrets) +
> `marienour.service` (port/host/data dir). Pour le repli Pages : `wrangler.toml`
> `[vars]` + `wrangler pages secret put`.

## Git workflow

- Remote : `https://github.com/AntoineBinet/MarieNour.git` (origin).
- Le serveur Oracle ne tire que la branche déployée (`main` par défaut) ; un MAJ
  en CLI/SSH se fait via `deployment/update.sh` (git pull + build + restart).
- **Bouton « Mettre à jour » in-app** (`/admin` → carte « Mise à jour de
  l'application », réservé admin) : `git pull` → `npm ci` (si le lockfile a
  changé) → `npm run build:all` → `process.exit(42)` → systemd relance avec le
  nouveau build (`SuccessExitStatus=42`). Spécifique au runtime **Node** :
  logique dans [`server/node-update.ts`](server/node-update.ts) (exclu de tsc,
  bundlé par esbuild), montée dans [`server/node.ts`](server/node.ts) **avant**
  l'app partagée — endpoints `POST /api/admin/update` et
  `GET /api/admin/update/status` (session admin requise). Absente du repli
  serverless Cloudflare Pages (le front affiche alors « indisponible »).

## Pièges connus

- **502 via le tunnel** → le service Node est tombé : `journalctl -u marienour`.
  Souvent un secret vide (`ADMIN_PASSWORD`/`SESSION_SECRET`) ou un build manquant
  (`npm run build:all`).
- **`server/node.ts` + `server/adapters/` ne sont pas typés par tsc** (ils
  utilisent des API Node absentes de `@cloudflare/workers-types`) : ils sont
  **exclus** de `tsconfig.server.json`, bundlés par **esbuild** (`build:server`)
  et validés à l'exécution. Garder ce périmètre.
- **Confusion avec les autres sites** : marienour = port **8002**, tunnel
  **`marienour-oracle`**, service **`marienour`**. Ne jamais réutiliser les ports
  8000 (Prospup) / 8001 (Portfolio) ni leurs tunnels.
