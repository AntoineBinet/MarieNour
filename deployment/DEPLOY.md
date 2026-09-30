# Déploiement marienour — VM Oracle Cloud + tunnel Cloudflare

> **Modèle = identique à Portfolio (ab-azurtech.com) et Prospup (prospup.work)**,
> mais **100 % séparé** : sa propre VM, son user, son service, son tunnel et son
> port (**8002**). Aucun mélange possible avec les deux autres.

> **Octobre 2026 : marienour rejoint prospup-prod.** Les blocs A à E ci-dessous
> décrivent l'installation historique sur une VM dédiée : ils restent valables pour
> reconstruire une VM seule. Pour la machine partagée avec ProspUp, lire d'abord la
> section [« Machine partagée avec ProspUp »](#machine-partagée-avec-prospup-prospup-prod-octobre-2026).

```
Navigateur → Cloudflare edge (TLS/WAF) → tunnel « marienour-oracle »
          → cloudflared (systemd) → http://127.0.0.1:8002
          → Node/Hono (service systemd « marienour ») → SQLite + médias locaux (data/)
```

- **VM** : Oracle Always Free. La 2ᵉ micro **VM.Standard.E2.1.Micro** (AMD x86,
  1 OCPU / 1 Go) est le bon choix — Portfolio occupe déjà une micro AMD et Prospup
  prend tout l'Ampere ARM. (Une ARM convient aussi : le bootstrap auto-détecte
  x86/ARM.)
- **Port 8002 jamais exposé** (bind `127.0.0.1` + aucune ouverture Security List ;
  seul SSH/22 ouvert).
- **Données** : `/opt/marienour/app/data/` (SQLite `marienour.db` + dossier
  `media/`), **hors arbre git**, conservées entre les mises à jour.

Le kit `deployment/` est l'exact pendant de celui des deux autres projets :
[bootstrap-vm.sh](bootstrap-vm.sh) · [marienour.service](marienour.service) ·
[setup-cloudflared.sh](setup-cloudflared.sh) · [finalize-on-vm.sh](finalize-on-vm.sh) ·
[update.sh](update.sh) · [marienour.env.example](marienour.env.example) ·
[cloudflared-marienour.service](cloudflared-marienour.service) ·
[backup.sh](backup.sh) · [marienour-backup.service](marienour-backup.service) ·
[marienour-backup.timer](marienour-backup.timer) · [r2-acces.sh](r2-acces.sh).

---

## Machine partagée avec ProspUp (prospup-prod, octobre 2026)

> marienour quitte sa micro-VM dédiée et tourne sur **prospup-prod**
> (VM.Standard.A1.Flex arm64, 24 Go), à côté de ProspUp (port 8000) et de
> Portfolio (port 8001). Même URL, même tunnel `marienour-oracle`, même dossier
> `/opt/marienour/app`. Le plan complet (ordre des étapes, répétition, bascule,
> retour arrière, garde de l'ancienne VM) vit dans le dépôt ProspUp :
> `deployment/COHABITATION.md` et `deployment/cohabitation/`. Cette section
> décrit ce que le kit marienour pose sur cette machine, et comment l'exploiter.

### Règle d'or : ne rien toucher de ce qui est à ProspUp

ProspUp est la prod métier. Rien de ce kit ne modifie `prospup.service`,
`/etc/prospup`, `/etc/litestream.yml`, `cloudflared.service`, `/etc/cloudflared`
ni la config git système. Concrètement :

- **jamais `cloudflared service install`** : cette commande réécrit
  `/etc/systemd/system/cloudflared.service`, qui porte le tunnel de
  prospup.work. Ce serait couper ProspUp. Le tunnel de marienour a sa propre
  unité, `cloudflared-marienour.service` ;
- **jamais `git config --system` ni `--global`** : le dépôt est public, cloné en
  HTTPS sans clé, et tout git de marienour tourne avec `GIT_CONFIG_NOSYSTEM=1` ;
- **aucun apt** sur la machine partagée : un outil manquant arrête le bootstrap
  avec la liste. Node vient de l'archive officielle nodejs.org (v20.20.2), son
  empreinte est écrite dans le bootstrap et comparée au `SHASUMS256.txt`
  publié, puis il est posé dans `/opt/node-v20.20.2-linux-arm64` avec le lien
  `/opt/node`. Rien n'est ajouté au `PATH` du système ;
- **jamais de `node_modules` recopié** : l'ancienne VM est en x86, celle-ci en
  arm64. Le bootstrap refait `npm ci` et le build sur place ;
- `setup-cloudflared.sh` et `finalize-on-vm.sh` **refusent de tourner** sur une
  machine partagée : ils sont faits pour une VM dédiée.

### Ce que le kit pose

| Élément | Où | Rôle |
|---|---|---|
| Node v20.20.2 | `/opt/node-v20.20.2-linux-<arch>`, lien `/opt/node` | le seul Node de marienour (unité, build, MAJ in-app) |
| `marienour.service` | `/etc/systemd/system/` | l'app, `127.0.0.1:8002`, compte `marienour` |
| `cloudflared-marienour.service` | `/etc/systemd/system/` | connecteur du tunnel `marienour-oracle`, métriques `127.0.0.1:20243`, compte éphémère (`DynamicUser`) |
| `marienour-backup.service` + `.timer` | `/etc/systemd/system/` | sauvegarde des données vers R2, chaque nuit à 03:30 UTC |
| `marienour-backup.sh`, `r2-acces.sh` | `/usr/local/lib/marienour/` | le script de sauvegarde (`deployment/backup.sh`) et la saisie de ses accès R2 |
| sudoers | `/etc/sudoers.d/marienour-ops` | `ubuntu` pilote les unités de marienour, et seulement elles |

Trois fichiers de secrets, tous `600 root:root` dans `/etc/marienour/`, lus par
systemd avant le bac à sable (l'app, elle, ne voit pas ce dossier) :

| Fichier | Contenu | D'où il vient |
|---|---|---|
| `marienour.env` | `ADMIN_PASSWORD`, `SESSION_SECRET`, `SMTP_PASS`… | recopié de l'ancienne VM (secret `marienour-env`) |
| `tunnel.env` | une ligne `TUNNEL_TOKEN=` | recopié de l'ancienne VM (secret `marienour-tunnel`) |
| `r2-backup.env` | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | recopié de l'ancienne VM (secret `marienour-r2`), ou saisi par `r2-acces.sh` |

Les secrets passent de VM à VM par les scripts `secret-emettre.sh` /
`secret-recevoir.sh` du dépôt ProspUp (copie `scp -3` par le PC, jamais affichés).
**Même `SESSION_SECRET`** qu'avant, sinon tout le monde est déconnecté. Et
**`data/vapid.json` voyage avec les données** : sans lui, les notifications
push cessent sans erreur visible.

### Plafonds et priorités (décision D4 du 30/09/2026)

Sous contention, ProspUp garde la main, puis Portfolio, puis marienour. Si la
mémoire manque, le noyau tue d'abord marienour, puis Portfolio, ProspUp en
dernier.

| Service | MemoryMax | TasksMax | CPUWeight | IOWeight | OOMScoreAdjust |
|---|---|---|---|---|---|
| ProspUp (inchangé) | aucun | défaut | 100 | 100 | 0 |
| Portfolio | 6G | 1024 | 80 | 80 | 200 |
| marienour | 4G | 512 | 30 | 30 | 400 |
| chaque `cloudflared-*` | 256M | 128 | défaut | défaut | défaut |

4 Go est un plancher réel : le build Vite de la mise à jour in-app monte à
environ 3 Go et tourne **dans** l'unité de l'app. Ne jamais descendre sous 3 Go.

Le bac à sable de l'app (`ProtectProc=invisible`, `InaccessiblePaths`) lui cache
les processus des autres, les fichiers d'unité, le bus système,
`/etc/litestream.yml`, `/etc/cloudflared` et les dossiers de ProspUp et de
Portfolio. Le build du bootstrap et de `update.sh` tourne dans une unité
transitoire (`systemd-run`) avec les mêmes plafonds et le même bac à sable : les
scripts d'installation des paquets npm n'y voient rien d'autre non plus.

### Installation en trois passes

Le kit, c'est le dossier `deployment/` de **`origin/main`**, recopié sur la VM :
jamais un clone de travail, jamais une branche. Les PR du kit sont donc mergées
AVANT le bootstrap. Les commandes exactes, avec la sortie attendue et le signal
d'alerte de chaque étape, sont dans `deployment/cohabitation/phase3.md` du dépôt
ProspUp. Le principe :

```bash
# (PC) figer le kit depuis origin/main, puis l'envoyer
git -C <dépôt MarieNour> fetch origin main
git -C <dépôt MarieNour> archive -o kit-marienour.tar origin/main deployment
scp kit-marienour.tar cohab-cible:
ssh cohab-cible 'mkdir -p ~/kit-marienour && tar -xf ~/kit-marienour.tar -C ~/kit-marienour'

# (prospup-prod) passe 1 : Node, empreinte vérifiée
sudo bash ~/kit-marienour/deployment/bootstrap-vm.sh --node
# attendu : « RÉSULTAT : OK (Node prêt) »

# (prospup-prod) passe 2 : le compte marienour et /opt/marienour, rien d'autre
sudo bash ~/kit-marienour/deployment/bootstrap-vm.sh --compte
# attendu : « RÉSULTAT : OK (compte prêt) »

# (prospup-prod) passe 3 : clone, npm ci + build plafonnés, unités posées, RIEN d'activé
sudo MARIENOUR_COMMIT=<commit déployé sur l'ancienne VM> bash ~/kit-marienour/deployment/bootstrap-vm.sh
# attendu : « RÉSULTAT : OK » ; « better-sqlite3 se charge avec node v20.20.2 » ;
#           unités « disabled · inactive » (marienour-backup.service « static »)
```

- `MARIENOUR_COMMIT` fige le code sur celui qui tourne sur l'ancienne VM : la
  bascule change de machine, pas de version. Le bootstrap refuse un commit qui
  n'appartient pas à `origin/main`.
- Rejouable : relancer le bootstrap met à jour les unités et les scripts depuis
  le kit (les anciennes sont gardées dans `/var/backups/marienour-kit/`), les
  vérifie avec `systemd-analyze verify`, et ne refait le build que si le commit
  a changé (`FORCE_BUILD=1` pour le forcer).
- `ENABLE=1` n'active que l'app et le timer de sauvegarde, et seulement si
  `ADMIN_PASSWORD` et `SESSION_SECRET` sont remplis. **Jamais le tunnel.**
- Toute sortie se termine par `RÉSULTAT : OK` ou `RÉSULTAT : ÉCHEC`.

### Le tunnel : un seul connecteur actif, toujours

`cloudflared-marienour.service` est posé, jamais activé par le bootstrap. Deux
connecteurs actifs sur `marienour-oracle` se partageraient le trafic entre
l'ancienne et la nouvelle machine. À la bascule, dans cet ordre :

1. arrêter **et désactiver** le connecteur et l'app de l'ancienne VM (et
   vérifier qu'ils sont arrêtés) ;
2. sur prospup-prod : `sudo systemctl enable --now cloudflared-marienour` ;
3. vérifier : `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:20243/ready`
   → `200`, puis `https://marienour.work/api/health` depuis le PC.

Retour arrière : `sudo systemctl disable --now cloudflared-marienour` sur
prospup-prod, puis redémarrer l'app et le connecteur de l'ancienne VM. Les DNS
ne bougent pas : un tunnel « remotely-managed » suit son connecteur.

Les ports de métriques sont fixes, un par tunnel : 20241 ProspUp, 20242
Portfolio, 20243 marienour.

### La sauvegarde (R2)

`marienour-backup` copie chaque nuit la base (`.backup` SQLite, à chaud), les
médias, `vapid.json` et les snapshots locaux dans le bucket R2 privé
`marienour-backups`, préfixe `snapshots/`, avec leur MANIFEST et une relecture
qui compare les empreintes. Même archive que la sauvegarde de la Phase 0 bis.
Conservation : 30 jours, par une règle de cycle de vie posée sur le bucket (le
script n'efface jamais rien).

```bash
ssh -t cohab-cible
sudo /usr/local/lib/marienour/marienour-backup.sh --verifier
sudo systemctl start marienour-backup                 # premier passage à la main
sudo journalctl -u marienour-backup -n 30 --no-pager  # attendu : « RÉSULTAT : OK »
# en cas de nouveau jeton R2 seulement :
sudo bash /usr/local/lib/marienour/r2-acces.sh         # attendu : « ACCÈS R2 : OK »
```

Le script lit la base de trois façons : à chaud (app en marche, lecture seule),
à froid (app arrêtée proprement, lecture « immutable » qui n'écrit rien), ou en
récupération (journal WAL resté après un arrêt brutal).

### Exploitation sur la machine partagée

```bash
ssh cohab-cible                                   # alias vers prospup-prod
sudo systemctl status marienour                   # état de l'app
sudo journalctl -u marienour -f                   # logs en direct
sudo systemctl restart marienour                  # restart manuel
sudo journalctl -u cloudflared-marienour -n 50 --no-pager   # logs du tunnel
sudo systemctl status marienour-backup            # dernière sauvegarde
```

- **Le bouton « Mettre à jour » ne change pas** : `git pull`, `npm ci` si le
  lockfile a changé, `npm run build:all`, puis sortie en 42 et systemd relance.
  Il tourne dans l'unité de l'app, donc avec son `PATH` (`/opt/node/bin`), ses
  4 Go et son bac à sable. Il ne met pas à jour les unités : une évolution du
  kit se déploie en rejouant le bootstrap depuis un kit frais.
- En CLI : `cd /opt/marienour/app && sudo bash deployment/update.sh`.
- Aucun `apt upgrade` ni reboot de prospup-prod sans fenêtre convenue : c'est la
  machine de ProspUp.

---

## Vue d'ensemble (deux onglets navigateur)

Tout se pilote depuis **deux onglets** que tu ouvres dans Chrome (et que
« Claude dans Chrome » peut conduire — cf. [../docs/SETUP-CLOUDFLARE-CHROME.md](../docs/SETUP-CLOUDFLARE-CHROME.md)) :

1. **Onglet Oracle Cloud** (`cloud.oracle.com`) — créer la VM, ouvrir une
   **Cloud Shell** pour provisionner (bootstrap + secrets + start).
2. **Onglet Cloudflare** (`dash.cloudflare.com` → Zero Trust) — créer le tunnel
   `marienour-oracle`, récupérer son **token**, déclarer les **Public Hostnames**
   (`marienour.work`, `www.marienour.work`).

---

## Bloc A — Créer la VM (onglet Oracle)

1. Oracle Cloud → **Compute → Instances → Create instance**.
2. Nom : `marienour`. Image : **Ubuntu 24.04**. Shape : **VM.Standard.E2.1.Micro**
   (Always Free). Réseau : laisse créer un VCN avec sous-réseau public.
3. **Clé SSH** : ajoute ta clé publique (ou laisse Oracle en générer une et
   télécharge la privée).
4. Crée l'instance, note l'**IP publique**. Vérifie la Security List : **seul le
   port 22 (SSH) ouvert** — surtout PAS le 8002.

## Bloc B — Provisionner (Cloud Shell ou SSH)

Le dépôt est public : aucune clé, le bootstrap clone en HTTPS. On envoie le kit
(le dossier `deployment/` de `origin/main`) sur la VM :

```bash
# (sur une machine ayant le dépôt)
git fetch origin main
git archive -o kit-marienour.tar origin/main deployment
scp -i <clé_vm> kit-marienour.tar ubuntu@<IP>:
```

Sur la VM :

```bash
ssh -i <clé_vm> ubuntu@<IP>
mkdir -p ~/kit-marienour && tar -xf ~/kit-marienour.tar -C ~/kit-marienour
sudo bash ~/kit-marienour/deployment/bootstrap-vm.sh
```

Sur une VM dédiée, le bootstrap installe les paquets manquants (sans upgrade),
cloudflared et un swap si la RAM est faible, pose Node v20.20.2 (archive
officielle, empreinte vérifiée) dans `/opt/node`, crée l'utilisateur
`marienour`, clone le dépôt, fait `npm ci && npm run build:all`, pose les unités
systemd (**ni activées, ni démarrées**) et `/etc/marienour/marienour.env`.

## Bloc C — Secrets + démarrage

```bash
sudo nano /etc/marienour/marienour.env
#   ADMIN_PASSWORD=<ton mot de passe maître admin>
#   SESSION_SECRET=<openssl rand -hex 32>
sudo bash /opt/marienour/app/deployment/finalize-on-vm.sh
```

`finalize-on-vm.sh` refuse de démarrer si les secrets sont vides, démarre le
service et fait un **health check** sur `http://127.0.0.1:8002/api/health`.

## Bloc D — Tunnel Cloudflare (onglet Cloudflare) → marienour.work

**Méthode recommandée (token, remotely-managed) :**

1. Dashboard Cloudflare → **Zero Trust → Networks → Tunnels → Create a tunnel**
   → Cloudflared → nom **`marienour-oracle`** → copie le **token** (`eyJ...`).
2. Sur la VM :
   ```bash
   sudo cloudflared service install <TOKEN>
   ```
3. Dans le tunnel → **Public Hostnames**, ajoute (Service = `HTTP` → `localhost:8002`) :
   - `marienour.work`
   - `www.marienour.work`
   La zone `marienour.work` étant gérée par Cloudflare, le **CNAME proxifié** est
   créé automatiquement.

> Alternative locally-managed (config.yml) : `sudo cloudflared tunnel login` puis
> `sudo PROD=1 bash deployment/setup-cloudflared.sh` (cf. le script).

## Bloc E — Vérification

```bash
# sur la VM
systemctl status marienour cloudflared --no-pager
curl -fsS http://127.0.0.1:8002/api/health      # {"ok":true,"app":"marienour"}
```

Puis dans le navigateur : <https://marienour.work> → écran de connexion. Connecte-toi
avec `ADMIN_EMAIL` + `ADMIN_PASSWORD` (le **premier** login crée le compte admin).

---

## Mises à jour

Deux options :

- **Bouton in-app** (recommandé) : `/admin` → carte « Mise à jour de
  l'application » (réservé admin). Fait `git pull` + rebuild puis redémarre via
  `process.exit(42)` (cf. `server/node-update.ts`).
- **CLI/SSH**, en root :

  ```bash
  cd /opt/marienour/app && sudo bash deployment/update.sh
  ```

  → `git pull` (en tant que `marienour`, sans la config git système) +
  `npm ci` + `npm run build:all` (unité transitoire plafonnée à 4 Go, en tant
  que `marienour`) + `systemctl restart marienour` + contrôle de santé. Les
  données `data/` ne sont jamais touchées.

## Sauvegarde

Les données vivent dans `/opt/marienour/app/data/` (SQLite + médias), **hors git**.
Deux niveaux, complémentaires :

1. **Snapshots locaux — AUTOMATIQUES (rien à faire).** Le service Node fait un
   snapshot SQLite cohérent rotatif (7 jours) dans `data/backups/`, purge les
   sessions expirées et fait un checkpoint WAL toutes les 24 h
   (`server/node-maintenance.ts`). Protège de la corruption de base et des
   suppressions accidentelles (restauration rapide), **pas** de la perte du disque.

2. **Copie hors-site vers R2** (protège de la perte du disque). Le timer
   `marienour-backup.timer` lance chaque nuit à 03:30 UTC
   `/usr/local/lib/marienour/marienour-backup.sh` (copie de `deployment/backup.sh`,
   posée par le bootstrap) : `.backup` SQLite + médias + `vapid.json` + snapshots
   locaux, envoyés dans le bucket privé `marienour-backups` (préfixe
   `snapshots/`), puis relus et comparés. Il ne demande qu'une chose, les accès R2
   dans `/etc/marienour/r2-backup.env` :

   ```bash
   sudo bash /usr/local/lib/marienour/r2-acces.sh       # une fois : « ACCÈS R2 : OK »
   sudo systemctl enable --now marienour-backup.timer
   sudo systemctl start marienour-backup                # premier passage
   sudo journalctl -u marienour-backup -n 30 --no-pager # « RÉSULTAT : OK »
   ```

   La conservation (30 jours) est une règle de cycle de vie posée sur le bucket.

**Restauration** : télécharger l'archive et son `.sha256`, vérifier l'empreinte,
extraire dans un dossier vide, comparer au `MANIFEST-marienour.txt`, puis,
service ARRÊTÉ, remplacer le contenu de `data/` (sans le MANIFEST, en écartant
les anciens `marienour.db-wal` et `-shm`), `chown -R marienour:marienour data/`,
et redémarrer (`sudo systemctl start marienour`). Un snapshot local
(`data/backups/marienour-*.db`) se restaure de la même façon, pour la base seule.

## Dépannage

- **Le tunnel tourne mais 502/erreur** → le service Node a crashé : `journalctl -u
  marienour -n 50 --no-pager`. Souvent un secret manquant ou un build absent
  (`npm run build:all`).
- **`better-sqlite3` ne s'installe pas** → `npm ci` n'a pas trouvé de binaire
  précompilé pour ce Node et cette architecture, et il n'y a pas de compilateur.
  Sur une VM dédiée, le bootstrap installe build-essential et python3 ; sur la
  machine partagée, aucun apt : vérifier d'abord la version de Node
  (`/opt/node/bin/node -v`, attendu v20.20.2).
- **Domaine reste "inactive"** → vérifier le CNAME proxifié de la zone
  `marienour.work` et les Public Hostnames du tunnel.
- **Admin impossible à connecter** → `ADMIN_PASSWORD` vide dans
  `/etc/marienour/marienour.env`, ou e-mail différent de `ADMIN_EMAIL`.
