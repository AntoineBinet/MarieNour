#!/usr/bin/env bash
#
# update.sh — met à jour marienour sur la VM Oracle : git pull → npm ci →
# build (front + serveur) → restart systemd. Équivalent du « git pull + restart »
# de Portfolio/Prospup, mais en CLI (marienour n'a pas encore de bouton MAJ
# in-app). À lancer depuis le dossier de l'app, en tant qu'utilisateur ayant le
# droit de restart (ops via sudoers, cf. bootstrap-vm.sh).
#
#   cd /opt/marienour/app && sudo -u marienour bash deployment/update.sh
#
# Le dossier data/ (SQLite + médias) est HORS de l'arbre buildé et n'est jamais
# touché par le pull/build.

set -euo pipefail
APP_DIR="${APP_DIR:-/opt/marienour/app}"
BRANCH="${MARIENOUR_BRANCH:-main}"

log(){ printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
cd "$APP_DIR"

log "git pull (origin/$BRANCH)"
git fetch origin --prune
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

log "npm ci"
npm ci

log "build (front + serveur)"
npm run build:all

log "restart du service"
# Le service tourne en root ; restart via sudo (NOPASSWD configuré par bootstrap).
sudo systemctl restart marienour
sleep 3
if curl -fsS "http://127.0.0.1:${MARIENOUR_PORT:-8002}/api/health" >/dev/null 2>&1; then
  printf '\033[1;32m  ✓ marienour à jour et en ligne\033[0m\n'
else
  echo "ATTENTION : l'API ne répond pas — journalctl -u marienour -n 40 --no-pager" >&2
  exit 1
fi
