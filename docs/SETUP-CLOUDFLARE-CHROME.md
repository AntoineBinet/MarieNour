# Runbook « Claude dans Chrome » — mettre marienour EN LIGNE (Oracle + Cloudflare)

Ce document est un **script d'automatisation navigateur**. Tu ouvres **deux
onglets** (déjà connectés) et tu colles le **PROMPT** plus bas à *Claude dans
Chrome* : il pilote les deux onglets pour héberger marienour **comme Portfolio
et Prospup** — une **VM Oracle Cloud dédiée** + un **tunnel Cloudflare**, le tout
**100 % séparé** des deux autres sites (sa VM, son service, son tunnel, son port
**8002**, son domaine **marienour.work**).

```
Navigateur → Cloudflare edge → tunnel « marienour-oracle » → cloudflared (VM)
          → http://127.0.0.1:8002 → Node/Hono → SQLite + médias locaux
```

> 🧭 **Les deux onglets à ouvrir :**
> 1. **Oracle Cloud** — <https://cloud.oracle.com> (créer la VM + une *Cloud Shell*).
> 2. **Cloudflare** — <https://dash.cloudflare.com> → **Zero Trust** (créer le tunnel).
>
> ⚠️ Avant de lancer l'agent, **remplace** dans le PROMPT les `<<...>>` par tes
> vraies valeurs (mot de passe admin, secret de session, jeton GitHub). Ne les
> commite jamais.

---

## Pourquoi ce changement (à savoir)

marienour était codé pour du **100 % serverless Cloudflare Pages** (Hono + D1 +
R2). Pour suivre **le même principe que Portfolio/Prospup**, le code tourne
désormais aussi **en Node sur une VM** : D1 → **SQLite local**, R2 → **fichiers
locaux** (cf. [`server/node.ts`](../server/node.ts) et `server/adapters/`). Le
kit d'install est dans [`deployment/`](../deployment/) ([DEPLOY.md](../deployment/DEPLOY.md)).
La base D1 / le bucket R2 déjà créés ne servent **plus** dans ce mode (ils
restent comme repli serverless, cf. `wrangler.toml`).

---

## Valeurs à utiliser

| Champ | Valeur |
| --- | --- |
| Fournisseur VM | **Oracle Cloud** — Always Free |
| Shape conseillé | `VM.Standard.E2.1.Micro` (AMD x86) — *la 2ᵉ micro gratuite ; ARM marche aussi* |
| OS | Ubuntu **24.04** |
| Nom d'instance | `marienour` |
| Port applicatif | **8002** (bind `127.0.0.1`, jamais exposé) |
| Service systemd | `marienour` |
| Repo GitHub | `AntoineBinet/MarieNour` (privé) · branche `main` |
| Nom du tunnel | **`marienour-oracle`** |
| Domaine | **`marienour.work`** + **`www.marienour.work`** |
| Service tunnel → | `http://localhost:8002` |
| Secret 1 | `ADMIN_PASSWORD` = `<<MOT_DE_PASSE_ADMIN>>` |
| Secret 2 | `SESSION_SECRET` = `<<SESSION_SECRET>>` (chaîne aléatoire longue) |
| Accès repo privé | `GITHUB_PAT` = `<<JETON_GITHUB_LECTURE_SEULE>>` (PAT fine-grained, lecture du repo) |
| E-mail admin | `binet.antoine215@yahoo.com` (déjà câblé) |

> 🔑 **Le jeton GitHub** : crée un *fine-grained PAT* limité au repo
> `AntoineBinet/MarieNour` avec **Contents: Read-only**. Il sert uniquement à
> cloner/puller le repo privé depuis la VM (pas d'onglet GitHub nécessaire).

---

## PROMPT À COLLER DANS CLAUDE (CHROME)

```
Tu pilotes DEUX onglets déjà ouverts et connectés pour mettre le site
"marienour" en ligne, sur le modèle de mes autres sites (VM Oracle Cloud + tunnel
Cloudflare) :
  • Onglet A = Oracle Cloud (cloud.oracle.com)
  • Onglet B = Cloudflare (dash.cloudflare.com → Zero Trust)
Avance étape par étape, vérifie chaque écran avant de cliquer, et si un libellé
diffère, adapte-toi à l'intention (les dashboards changent souvent de mots). Ne
saisis JAMAIS un secret ailleurs que dans le champ prévu. Si tu es bloqué sur un
écran inattendu, arrête-toi et demande-moi plutôt que de forcer.

Valeurs :
  REPO        = AntoineBinet/MarieNour   (branche main, privé)
  PORT        = 8002
  TUNNEL      = marienour-oracle
  DOMAINES    = marienour.work, www.marienour.work
  ADMIN_PASSWORD = <<MOT_DE_PASSE_ADMIN>>
  SESSION_SECRET = <<SESSION_SECRET>>
  GITHUB_PAT     = <<JETON_GITHUB_LECTURE_SEULE>>

────────────────────────────────────────────────────────────────────────
ÉTAPE 1 (Onglet A — Oracle) — Préparer une clé SSH dans la Cloud Shell
1. Ouvre l'onglet Oracle. En haut à droite, clique l'icône "Cloud Shell" (un
   terminal s'ouvre dans le navigateur).
2. Dans la Cloud Shell, exécute :
      ssh-keygen -t ed25519 -f ~/.ssh/marienour -N ""
      cat ~/.ssh/marienour.pub
   Copie la ligne de clé publique affichée (commence par "ssh-ed25519 ...").

ÉTAPE 2 (Onglet A — Oracle) — Créer la VM
3. Menu → Compute → Instances → "Create instance".
4. Name: marienour. Image: Ubuntu 24.04. Shape: VM.Standard.E2.1.Micro
   (catégorie "Always Free eligible"). Laisse créer un VCN avec sous-réseau
   public + IP publique.
5. Section "Add SSH keys" → "Paste public keys" → colle la clé publique de
   l'ÉTAPE 1.
6. "Create". Attends l'état "Running". Note l'IP PUBLIQUE de l'instance.
7. Vérifie (Networking → la Security List du sous-réseau) : SEUL le port 22
   (SSH) doit être ouvert en entrée. Surtout PAS le 8002.

POINT DE CONTRÔLE : VM "Running", IP publique connue.

ÉTAPE 3 (Onglet A — Cloud Shell) — Provisionner la VM
8. Dans la Cloud Shell, connecte-toi à la VM (remplace <IP>) :
      ssh -o StrictHostKeyChecking=accept-new -i ~/.ssh/marienour ubuntu@<IP>
9. Une fois sur la VM, récupère le script de provisioning depuis le repo privé
   (le PAT autorise la lecture), puis lance-le. Exécute, en remplaçant le PAT :
      PAT="<<JETON_GITHUB_LECTURE_SEULE>>"
      curl -fsSL -H "Authorization: Bearer $PAT" \
        -H "Accept: application/vnd.github.raw" \
        "https://api.github.com/repos/AntoineBinet/MarieNour/contents/deployment/bootstrap-vm.sh?ref=main" \
        -o /tmp/bootstrap-vm.sh
      sudo REPO_URL="https://$PAT@github.com/AntoineBinet/MarieNour.git" \
           MARIENOUR_BRANCH=main bash /tmp/bootstrap-vm.sh
   Le script installe Node 20 + cloudflared, clone le repo, build le front et le
   serveur, crée le service systemd "marienour" (activé, pas démarré) et le
   fichier de secrets. Attends le message "Bootstrap terminé".

ÉTAPE 4 (Onglet A — VM) — Secrets + démarrage
10. Renseigne les secrets puis démarre/vérifie :
      sudo sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=<<MOT_DE_PASSE_ADMIN>>|" /etc/marienour/marienour.env
      sudo sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=<<SESSION_SECRET>>|"     /etc/marienour/marienour.env
      sudo bash /opt/marienour/app/deployment/finalize-on-vm.sh
    Tu dois voir "API OK : {\"ok\":true,\"app\":\"marienour\"}".

POINT DE CONTRÔLE : le service répond en local sur le port 8002.

ÉTAPE 5 (Onglet B — Cloudflare) — Créer le tunnel "marienour-oracle"
11. Passe à l'onglet Cloudflare → Zero Trust → Networks → Tunnels →
    "Create a tunnel" → connecteur "Cloudflared".
12. Nom du tunnel : marienour-oracle → Save.
13. À l'écran "Install connector", choisis Debian/Linux : Cloudflare affiche une
    commande "cloudflared service install eyJ...". COPIE uniquement le TOKEN
    (la longue chaîne eyJ...). Ne lance pas la commande ici.

ÉTAPE 6 (Onglet A — VM) — Installer le connecteur avec le token
14. Reviens à l'onglet Oracle (la session SSH sur la VM). Exécute (colle le
    token copié) :
      sudo cloudflared service install <TOKEN_eyJ...>
      systemctl is-active cloudflared        # doit afficher "active"

ÉTAPE 7 (Onglet B — Cloudflare) — Public Hostnames (DNS auto)
15. Toujours dans le tunnel marienour-oracle → onglet "Public Hostname" →
    "Add a public hostname" :
      - Subdomain: (vide)   Domain: marienour.work   → Service: HTTP  URL: localhost:8002
16. "Add a public hostname" une 2ᵉ fois :
      - Subdomain: www      Domain: marienour.work   → Service: HTTP  URL: localhost:8002
    La zone marienour.work est gérée par Cloudflare : le CNAME proxifié est créé
    automatiquement. Attends que le tunnel affiche l'état "HEALTHY".

ÉTAPE 8 — Vérification finale
17. Ouvre https://marienour.work dans un nouvel onglet. L'écran de connexion
    "marienour" doit s'afficher (page React servie par la VM via le tunnel).
18. Connecte-toi avec :
      Email    : binet.antoine215@yahoo.com
      Password : <<MOT_DE_PASSE_ADMIN>>
    Le PREMIER login avec cet e-mail crée automatiquement le compte ADMIN.
19. Confirme que le tableau de bord s'affiche et qu'un lien "Administration"
    apparaît (preuve que le rôle admin est actif).

Rends-moi un compte rendu : IP de la VM, état du service (systemctl status
marienour), état du tunnel (HEALTHY ?), et capture du tableau de bord connecté.
Signale tout écran inattendu plutôt que de forcer.
```

---

## Repli & alternatives

- **Pas de Cloud Shell / tu préfères ton terminal** : tu peux faire les ÉTAPES
  1–4 et 6 depuis un terminal local en SSH (`ssh -i <clé> ubuntu@<IP>`). Le reste
  (tunnel) se fait dans l'onglet Cloudflare.
- **Sécurité du PAT** : il finit dans l'URL du remote git sur la VM
  (`.git/config`, lisible par l'utilisateur du service). Limite-le en lecture
  seule à ce repo et révoque-le si besoin. Variante plus propre : une **deploy
  key** SSH (cf. `deployment/bootstrap-vm.sh`, variable `DEPLOY_KEY_SRC`) au lieu
  du PAT.
- **Tunnel locally-managed** (sans token) : `sudo cloudflared tunnel login` puis
  `sudo PROD=1 bash deployment/setup-cloudflared.sh` sur la VM (génère le
  `config.yml` + les routes DNS).

## Mises à jour ultérieures

Sur la VM : `cd /opt/marienour/app && sudo -u marienour bash deployment/update.sh`
(git pull + build + restart, sans toucher aux données).

## Dépannage rapide

- **502 / erreur via le tunnel** → le service Node est tombé :
  `journalctl -u marienour -n 50 --no-pager` (souvent un secret vide ou un build
  manquant : `cd /opt/marienour/app && sudo -u marienour npm run build:all`).
- **`cloudflared` inactif** → `journalctl -u cloudflared -n 40 --no-pager` ; le
  token est-il le bon ? Le service tourne-t-il (`systemctl status cloudflared`) ?
- **Domaine "inactive"** → vérifier les Public Hostnames du tunnel et le CNAME
  proxifié de la zone `marienour.work`.
- **Build OOM sur la micro 1 Go** → le bootstrap crée un swap de 2 Go ; sinon
  `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap
  /swapfile && sudo swapon /swapfile`, puis relance le build.
- **Admin impossible** → `ADMIN_PASSWORD` vide dans
  `/etc/marienour/marienour.env`, ou e-mail ≠ `binet.antoine215@yahoo.com`.
