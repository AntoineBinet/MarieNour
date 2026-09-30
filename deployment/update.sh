#!/usr/bin/env bash
#
# update.sh · met à jour marienour en ligne de commande : git pull, npm ci,
# build (front + serveur), redémarrage systemd, contrôle de santé. Équivalent
# du bouton « Mettre à jour » de l'admin (server/node-update.ts), pour quand
# l'app ne répond plus.
#
# À lancer EN ROOT depuis le dépôt déployé :
#
#   cd /opt/marienour/app && sudo bash deployment/update.sh
#
# Tout ce qui touche au dépôt tourne sous le compte marienour (propriétaire
# des fichiers), avec Node de /opt/node et sans la config git système (sur
# prospup-prod, /etc/gitconfig appartient à ProspUp). Le build tourne dans une
# unité transitoire plafonnée (4 Go, poids 30) et dans le même bac à sable que
# l'app. Le dossier data/ (SQLite + médias) n'est jamais touché.

set -euo pipefail
APP_HOME="${APP_HOME:-/opt/marienour}"
APP_DIR="${APP_DIR:-$APP_HOME/app}"
BRANCH="${MARIENOUR_BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-marienour}"
PORT="${MARIENOUR_PORT:-8002}"
NODE_PATH_ENV="/opt/node/bin:/usr/local/bin:/usr/bin:/bin"
CACHES="-/etc/systemd/system -/run/dbus -/etc/litestream.yml -/etc/cloudflared -/etc/prospup -/opt/prospup -/etc/portfolio -/opt/portfolio -/etc/marienour"

log(){ printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die(){ printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "à lancer en root : cd $APP_DIR && sudo bash deployment/update.sh"
[[ -x /opt/node/bin/node ]] || die "/opt/node/bin/node absent : lancer bootstrap-vm.sh --node"
[[ -d $APP_DIR/.git ]] || die "$APP_DIR n'est pas le dépôt de l'app"

git_app() {
  runuser -u "$SERVICE_USER" -- env -C "$APP_HOME" HOME="$APP_HOME" PATH="$NODE_PATH_ENV" \
    GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0 git -C "$APP_DIR" "$@"
}

log "git (origin/$BRANCH), sous le compte $SERVICE_USER"
avant=$(git_app rev-parse --short HEAD)
git_app fetch origin --prune
git_app checkout "$BRANCH"
git_app merge --ff-only "origin/$BRANCH"
apres=$(git_app rev-parse --short HEAD)
echo "  $avant → $apres"

log "npm ci + build:all (unité transitoire : 4 Go, poids 30)"
# shellcheck disable=SC2016  # $… évalué dans l'unité, pas ici
systemd-run --unit="marienour-build-$(date -u +%Y%m%dT%H%M%SZ)" --wait --pipe --collect --quiet \
  --uid="$SERVICE_USER" --gid="$SERVICE_USER" \
  -p WorkingDirectory="$APP_DIR" \
  -p MemoryMax=4G -p TasksMax=512 -p CPUWeight=30 -p IOWeight=30 -p Nice=10 \
  -p NoNewPrivileges=yes -p PrivateTmp=yes -p ProtectSystem=strict -p ProtectHome=yes \
  -p ReadWritePaths="$APP_HOME" -p ProtectProc=invisible \
  -p "InaccessiblePaths=$CACHES" \
  --setenv=HOME="$APP_HOME" --setenv=PATH="$NODE_PATH_ENV" \
  --setenv=GIT_CONFIG_NOSYSTEM=1 --setenv=npm_config_update_notifier=false \
  /bin/bash -c 'set -e
    NODE_ENV=development npm ci --include=dev --no-audit --no-fund
    NODE_ENV=production npm run build:all' \
  || die "build en échec : l'app tourne toujours sur l'ancien build tant qu'elle n'est pas redémarrée"

log "redémarrage de marienour"
systemctl restart marienour

for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    printf '\033[1;32m  ✓ marienour à jour (%s) et en ligne\033[0m\n' "$apres"
    exit 0
  fi
  sleep 1
done
die "l'API ne répond pas : journalctl -u marienour -n 40 --no-pager"
