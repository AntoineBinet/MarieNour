# Déploiement marienour — VM Oracle Cloud + tunnel Cloudflare

> **Modèle = identique à Portfolio (ab-azurtech.com) et Prospup (prospup.work)**,
> mais **100 % séparé** : sa propre VM, son user, son service, son tunnel et son
> port (**8002**). Aucun mélange possible avec les deux autres.

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
[update.sh](update.sh) · [marienour.env.example](marienour.env.example).

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

Le repo est privé : envoie le script + une **deploy key** read-only sur la VM.

```bash
# (sur une machine ayant accès au repo)
git show <branche>:deployment/bootstrap-vm.sh > bootstrap-vm.sh
ssh-keygen -t ed25519 -f marienour_deploy -C "marienour-oracle"      # si pas déjà fait
# GitHub → repo AntoineBinet/MarieNour → Settings → Deploy keys → ajoute marienour_deploy.pub (read-only)
scp -i <clé_vm> bootstrap-vm.sh   ubuntu@<IP>:/tmp/
scp -i <clé_vm> marienour_deploy  ubuntu@<IP>:/tmp/deploy_key
```

Sur la VM :

```bash
ssh -i <clé_vm> ubuntu@<IP>
sudo DEPLOY_KEY_SRC=/tmp/deploy_key MARIENOUR_BRANCH=main bash /tmp/bootstrap-vm.sh
```

Le bootstrap installe Node 20 + build-essential + cloudflared, clone le repo,
`npm ci && npm run build:all`, crée l'utilisateur `marienour`, pose le service
systemd (activé, **pas démarré**) et `/etc/marienour/marienour.env`.

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
- **CLI/SSH** — à lancer en tant qu'utilisateur **ops** (ex. `ubuntu`), **pas**
  `marienour` (les fichiers appartiennent à `marienour`, mais seul l'ops a le
  droit de redémarrer le service) :

  ```bash
  cd /opt/marienour/app && bash deployment/update.sh
  ```

  → `git pull` + `npm ci` + `npm run build:all` (en tant que `marienour`) +
  `systemctl restart marienour` (en tant qu'ops). Les données `data/` ne sont
  jamais touchées.

## Sauvegarde

Les données vivent dans `/opt/marienour/app/data/` (SQLite + médias). Sauvegarde
simple par cron (ex. snapshot quotidien `sqlite3 .backup` + `tar` du dossier
`media/` vers un stockage externe). Pour une réplication continue style Prospup,
on pourra ajouter Litestream → R2 plus tard.

## Dépannage

- **Le tunnel tourne mais 502/erreur** → le service Node a crashé : `journalctl -u
  marienour -n 50 --no-pager`. Souvent un secret manquant ou un build absent
  (`npm run build:all`).
- **`better-sqlite3` ne s'installe pas** → build-essential/python3 manquants
  (le bootstrap les installe) ; relance `npm ci`.
- **Domaine reste "inactive"** → vérifier le CNAME proxifié de la zone
  `marienour.work` et les Public Hostnames du tunnel.
- **Admin impossible à connecter** → `ADMIN_PASSWORD` vide dans
  `/etc/marienour/marienour.env`, ou e-mail différent de `ADMIN_EMAIL`.
