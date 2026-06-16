#!/usr/bin/env bash
#
# update.sh — met à jour marienour sur la VM Oracle : git pull → npm ci →
# build (front + serveur) → restart systemd. Équivalent du « git pull + restart »
# de Portfolio/Prospup, mais avec une étape de BUILD en plus (Node).
#
# À lancer en tant qu'utilisateur OPS — celui qui a le droit sudo de redémarrer
# le service (p.ex. « ubuntu ») — ou via root :
#
#   cd /opt/marienour/app && bash deployment/update.sh
#   # (ou : sudo bash deployment/update.sh)
#
# Pourquoi pas « sudo -u marienour … » ? Les fichiers appartiennent à l'utilisateur
# du SERVICE (« marienour »), mais SEUL l'utilisateur ops a le droit
# « systemctl restart marienour » (sudoers posé par bootstrap-vm.sh). Ce script
# fait donc le git pull + build EN TANT QUE marienour (sudo -u) et le restart EN
# TANT QU'OPS (sudo systemctl). Le dossier data/ (SQLite + médias) est hors de
# l'arbre buildé et n'est jamais touché.

set -euo pipefail
APP_DIR="${APP_DIR:-/opt/marienour/app}"
BRANCH="${MARIENOUR_BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-marienour}"
PORT="${MARIENOUR_PORT:-8002}"

log(){ printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die(){ printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

ME="$(id -un)"

# Le restart exige les droits root (via sudo). L'utilisateur du service ne les a
# pas : on refuse tôt plutôt que d'échouer après un long build.
if [[ "$ME" == "$SERVICE_USER" ]]; then
  die "À lancer en tant qu'utilisateur ops (ex. ubuntu) ou root, pas « $SERVICE_USER » — il ne peut pas redémarrer le service."
fi

# Exécute une commande en tant qu'utilisateur du service (propriétaire des fichiers).
as_service(){ sudo -u "$SERVICE_USER" bash -lc "$*"; }
# systemctl : direct si root, via sudo sinon (droit accordé à l'ops par le bootstrap).
sysctl_do(){ if [[ "$(id -u)" -eq 0 ]]; then systemctl "$@"; else sudo systemctl "$@"; fi; }

log "git pull (origin/$BRANCH) — en tant que $SERVICE_USER"
as_service "git -C '$APP_DIR' config --global --add safe.directory '$APP_DIR' || true"
as_service "git -C '$APP_DIR' fetch origin --prune"
as_service "git -C '$APP_DIR' checkout '$BRANCH'"
as_service "git -C '$APP_DIR' pull --ff-only origin '$BRANCH'"

log "npm ci + build (front + serveur) — en tant que $SERVICE_USER"
as_service "cd '$APP_DIR' && npm ci --include=dev && npm run build:all"

log "restart du service marienour"
sysctl_do restart marienour

sleep 3
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  printf '\033[1;32m  ✓ marienour à jour et en ligne\033[0m\n'
else
  echo "ATTENTION : l'API ne répond pas — journalctl -u marienour -n 40 --no-pager" >&2
  exit 1
fi
