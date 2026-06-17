#!/usr/bin/env bash
#
# bootstrap-vm.sh — provisioning idempotent de la VM Oracle Cloud pour marienour.
# Ubuntu 24.04 LTS. Fonctionne sur x86_64 (E2.1.Micro AMD, Always Free) ET sur
# aarch64 (Ampere A1). À lancer EN ROOT (sudo) sur la VM.
#
# Cette VM est DÉDIÉE à marienour (marienour.work) — aucun rapport avec les VM
# Portfolio (ab-azurtech.com) ou Prospup (prospup.work). User dédié, dossier
# dédié, tunnel dédié, port dédié (8002).
#
#   # Repo PRIVÉ : pas de curl raw anonyme. Récupérer ce script via une machine
#   # ayant accès, puis scp vers la VM avec la clé de déploiement :
#   #   (PC)  git show <branche>:deployment/bootstrap-vm.sh > bootstrap-vm.sh
#   #         scp bootstrap-vm.sh ubuntu@<IP>:/tmp/
#   #         scp <deploy_key>    ubuntu@<IP>:/tmp/deploy_key
#   # Puis sur la VM :
#   sudo DEPLOY_KEY_SRC=/tmp/deploy_key MARIENOUR_BRANCH=main bash /tmp/bootstrap-vm.sh
#
# Idempotent : ré-exécutable sans danger. NE DÉMARRE PAS le service (config
# runtime à poser d'abord). Voir deployment/DEPLOY.md pour la suite.
#
# Variables surchargeables :
#   MARIENOUR_BRANCH    (def: main)   — branche git à déployer
#   REPO_URL            (def: git@github.com:AntoineBinet/MarieNour.git — SSH, repo privé)
#   DEPLOY_KEY_SRC      (def: /tmp/deploy_key — clé SSH read-only pour cloner le repo privé)
#   APP_HOME            (def: /opt/marienour)
#   SERVICE_USER        (def: marienour)
#   OPS_USER            (def: ubuntu) — utilisateur SSH autorisé à piloter le service
#   NODE_MAJOR          (def: 20)     — version majeure Node.js (NodeSource)
#   MAKE_SWAP           (def: auto)   — auto|1|0 : crée un swapfile 2 Go si RAM < 2 Go

set -euo pipefail

MARIENOUR_BRANCH="${MARIENOUR_BRANCH:-main}"
# Repo PRIVÉ → clone/pull en SSH via la deploy key (cf. DEPLOY_KEY_SRC + étape 2bis).
# Repo PUBLIC ? remplace par l'URL https://github.com/AntoineBinet/MarieNour.git
REPO_URL="${REPO_URL:-git@github.com:AntoineBinet/MarieNour.git}"
DEPLOY_KEY_SRC="${DEPLOY_KEY_SRC:-/tmp/deploy_key}"
APP_HOME="${APP_HOME:-/opt/marienour}"
APP_DIR="${APP_HOME}/app"
SERVICE_USER="${SERVICE_USER:-marienour}"
OPS_USER="${OPS_USER:-ubuntu}"
NODE_MAJOR="${NODE_MAJOR:-20}"
MAKE_SWAP="${MAKE_SWAP:-auto}"

log()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }

# ── Pré-requis ────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || { echo "À lancer en root (sudo bash bootstrap-vm.sh)"; exit 1; }
case "$(uname -m)" in
  aarch64|arm64) CF_ARCH=arm64 ;;
  x86_64|amd64)  CF_ARCH=amd64 ;;
  *) CF_ARCH=amd64; warn "Architecture '$(uname -m)' inattendue — fallback amd64." ;;
esac

# ── 0. Swap (utile sur la micro 1 Go : évite l'OOM pendant npm install/build) ─
if [[ "$MAKE_SWAP" != "0" ]]; then
  mem_kb="$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  if [[ "$MAKE_SWAP" == "1" || ( "$MAKE_SWAP" == "auto" && "$mem_kb" -lt 2000000 ) ]]; then
    if ! swapon --show | grep -q '/swapfile'; then
      log "0/8 — Swapfile 2 Go (RAM faible détectée — le build Vite consomme)"
      fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
      chmod 600 /swapfile
      mkswap /swapfile >/dev/null
      swapon /swapfile
      grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
      ok "swap actif ($(free -h | awk '/Swap/{print $2}'))"
    else
      ok "swap déjà présent"
    fi
  fi
fi

# ── 1. Paquets système ────────────────────────────────────────────────────
log "1/8 — Paquets système (apt)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
# build-essential + python3 : filet de sécurité si better-sqlite3 doit compiler
# (sinon prebuild-install télécharge un binaire). sqlite3 = inspection en CLI.
apt-get install -y \
  git curl unzip ca-certificates build-essential python3 sqlite3
ok "deps de base installées"

# ── 1bis. Node.js (NodeSource) ────────────────────────────────────────────
log "1bis/8 — Node.js $NODE_MAJOR.x"
if command -v node &>/dev/null && [[ "$(node -v)" == v${NODE_MAJOR}.* ]]; then
  ok "Node déjà présent ($(node -v))"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  ok "Node installé ($(node -v), npm $(npm -v))"
fi

# ── 2. Utilisateur système marienour ──────────────────────────────────────
log "2/8 — Utilisateur '$SERVICE_USER'"
if id "$SERVICE_USER" &>/dev/null; then
  ok "existe déjà"
else
  useradd -r -m -d "$APP_HOME" -s /bin/bash "$SERVICE_USER"
  ok "créé"
fi
mkdir -p "$APP_HOME"
chown "$SERVICE_USER:$SERVICE_USER" "$APP_HOME"

# ── 2bis. Auth GitHub (repo privé) : clé de déploiement read-only ─────────
# Si une clé SSH read-only (deploy key) est fournie via $DEPLOY_KEY_SRC (scp
# préalable → /tmp/deploy_key), on la pose pour l'utilisateur marienour et on
# configure git en SSH au niveau SYSTÈME. Couvre le clone ET les `git pull`.
# Génération côté PC :
#   ssh-keygen -t ed25519 -f marienour_deploy -C "marienour-oracle"
#   gh repo deploy-key add marienour_deploy.pub --repo AntoineBinet/MarieNour
if [[ -f "$DEPLOY_KEY_SRC" ]]; then
  log "2bis/8 — Clé de déploiement GitHub ($SERVICE_USER)"
  install -d -m700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$APP_HOME/.ssh"
  install -m600 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DEPLOY_KEY_SRC" "$APP_HOME/.ssh/deploy_key"
  git config --system core.sshCommand "ssh -i $APP_HOME/.ssh/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  ok "clé installée + git core.sshCommand (system)"
elif [[ "$REPO_URL" == git@* || "$REPO_URL" == ssh://* ]]; then
  warn "REPO_URL en SSH mais aucune clé ($DEPLOY_KEY_SRC) — le clone d'un repo privé échouera."
  warn "→ soit fournis la deploy key, soit passe REPO_URL en https://… si le repo est public."
fi

# ── 3. Clone / mise à jour du dépôt ────────────────────────────────────────
log "3/8 — Dépôt ($REPO_URL @ $MARIENOUR_BRANCH)"
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$SERVICE_USER" git -C "$APP_DIR" config --global --add safe.directory "$APP_DIR" || true
  sudo -u "$SERVICE_USER" git -C "$APP_DIR" fetch origin --prune
  sudo -u "$SERVICE_USER" git -C "$APP_DIR" checkout "$MARIENOUR_BRANCH"
  sudo -u "$SERVICE_USER" git -C "$APP_DIR" pull --ff-only origin "$MARIENOUR_BRANCH"
  ok "mis à jour"
else
  sudo -u "$SERVICE_USER" git clone -b "$MARIENOUR_BRANCH" "$REPO_URL" "$APP_DIR"
  git config --global --add safe.directory "$APP_DIR" || true
  ok "cloné"
fi

# ── 4. Dépendances npm + build (front + serveur) ──────────────────────────
log "4/8 — npm ci + build:all (peut prendre quelques minutes sur la micro)"
sudo -u "$SERVICE_USER" bash -lc "
  set -e
  cd '$APP_DIR'
  npm ci
  npm run build:all
"
ok "build prêt (dist/ + dist-server/server.mjs)"

# ── 5. cloudflared (tunnel Cloudflare) ─────────────────────────────────────
log "5/8 — cloudflared ($CF_ARCH)"
if command -v cloudflared &>/dev/null; then
  ok "déjà installé ($(cloudflared --version 2>/dev/null | head -1))"
else
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/cloudflared.deb" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb"
  apt-get install -y "$tmp/cloudflared.deb"
  rm -rf "$tmp"
  ok "installé ($(cloudflared --version 2>/dev/null | head -1))"
fi

# ── 6. Secrets + dossier données ──────────────────────────────────────────
log "6/8 — /etc/marienour/marienour.env"
mkdir -p /etc/marienour
if [[ ! -f /etc/marienour/marienour.env ]]; then
  if [[ -f "$APP_DIR/deployment/marienour.env.example" ]]; then
    cp "$APP_DIR/deployment/marienour.env.example" /etc/marienour/marienour.env
  else
    cat > /etc/marienour/marienour.env <<'EOF'
ADMIN_EMAIL=binet.antoine215@yahoo.com
ADMIN_PASSWORD=
SESSION_SECRET=
APP_NAME=MarieNour
EOF
  fi
  warn "Édite /etc/marienour/marienour.env (ADMIN_PASSWORD + SESSION_SECRET) avant de démarrer."
else
  ok "marienour.env déjà présent (laissé tel quel)"
fi
chmod 600 /etc/marienour/marienour.env
chown root:root /etc/marienour/marienour.env
# Dossier de données persistant (SQLite + médias), hors arbre git, propriété du service.
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$APP_DIR/data"

# ── 7. Unité systemd + sudoers ops ────────────────────────────────────────
log "7/8 — systemd + sudoers"
cp "$APP_DIR/deployment/marienour.service" /etc/systemd/system/marienour.service
systemctl daemon-reload
systemctl enable marienour
ok "unité marienour activée (NON démarrée — pose ADMIN_PASSWORD/SESSION_SECRET d'abord)"

# sudoers : l'utilisateur SSH ($OPS_USER) pilote le service sans mot de passe
SUDOERS=/etc/sudoers.d/marienour-ops
cat > "$SUDOERS" <<EOF
# Pilotage du service marienour par $OPS_USER (ops manuelles).
$OPS_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart marienour, /usr/bin/systemctl start marienour, /usr/bin/systemctl stop marienour, /usr/bin/systemctl status marienour, /usr/bin/journalctl -u marienour *
EOF
chmod 440 "$SUDOERS"
if visudo -cf "$SUDOERS" >/dev/null; then ok "sudoers valide"; else rm -f "$SUDOERS"; warn "sudoers invalide, retiré"; fi

# ── 8. Récap ──────────────────────────────────────────────────────────────
cat <<EOF

────────────────────────────────────────────────────────────────────────
  Bootstrap terminé. Service activé mais PAS démarré.

  Suite (cf. deployment/DEPLOY.md) :
   1. Renseigne /etc/marienour/marienour.env (ADMIN_PASSWORD + SESSION_SECRET) :
        sudo nano /etc/marienour/marienour.env
        # SESSION_SECRET : openssl rand -hex 32
   2. Démarre + vérifie :
        sudo bash $APP_DIR/deployment/finalize-on-vm.sh
        # (ou : sudo systemctl start marienour
        #       curl -fsS http://127.0.0.1:8002/api/health )
   3. Configure le tunnel cloudflared (cf. setup-cloudflared.sh / DEPLOY.md) →
      marienour.work.
────────────────────────────────────────────────────────────────────────
EOF
