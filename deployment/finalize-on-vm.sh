#!/usr/bin/env bash
#
# finalize-on-vm.sh — démarre le service marienour et vérifie qu'il répond.
# À lancer EN ROOT sur la VM, APRÈS bootstrap-vm.sh et APRÈS avoir renseigné
# /etc/marienour/marienour.env (ADMIN_PASSWORD + SESSION_SECRET).

set -euo pipefail
APP_DIR="${APP_DIR:-/opt/marienour/app}"
PORT="${PORT:-8002}"

log(){ printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok(){ printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
die(){ echo "ERREUR: $*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "sudo requis"
# Machine partagée (prospup-prod) : les données arrivent par donnees-recevoir.sh
# et la mise en service suit les runbooks de la cohabitation (dépôt ProspUp,
# deployment/cohabitation/). Ce script-ci, fait pour une VM dédiée, n'y a pas
# sa place.
for autre in prospup.service portfolio.service; do
  [[ -e /etc/systemd/system/$autre ]] && die "machine partagée ($autre présent) : utiliser les scripts de la cohabitation, pas celui-ci"
done

# Garde-fou : refuse de démarrer sans secrets (sinon admin inutilisable).
ENVF=/etc/marienour/marienour.env
[[ -f "$ENVF" ]] || die "$ENVF manquant — relance bootstrap-vm.sh."
grep -qE '^ADMIN_PASSWORD=.+'  "$ENVF" || die "ADMIN_PASSWORD vide dans $ENVF — édite-le d'abord."
grep -qE '^SESSION_SECRET=.+'  "$ENVF" || die "SESSION_SECRET vide dans $ENVF — édite-le d'abord (openssl rand -hex 32)."

# S'assure que le build existe (sinon rebuild).
if [[ ! -f "$APP_DIR/dist-server/server.mjs" || ! -f "$APP_DIR/dist/index.html" ]]; then
  log "Build manquant — npm run build:all"
  runuser -u marienour -- env -C "$APP_DIR" HOME=/opt/marienour PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin \
    npm run build:all
fi

log "Démarrage du service marienour"
# Le bootstrap pose l'unité sans l'activer : on l'active ici, sinon elle ne
# repartirait pas après un redémarrage de la VM.
systemctl enable marienour >/dev/null
systemctl restart marienour
sleep 3
systemctl is-active --quiet marienour || { journalctl -u marienour -n 40 --no-pager; die "service inactif"; }
ok "service actif"

log "Health check (http://127.0.0.1:$PORT/api/health)"
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    ok "API OK : $(curl -fsS http://127.0.0.1:$PORT/api/health)"
    break
  fi
  [[ $i -eq 15 ]] && { journalctl -u marienour -n 40 --no-pager; die "API ne répond pas sur :$PORT"; }
  sleep 1
done

cat <<EOF

────────────────────────────────────────────────────────────────────────
  marienour est en ligne en local sur http://127.0.0.1:$PORT
  Suite : configure le tunnel cloudflared → marienour.work
    sudo cloudflared service install <TOKEN>      # méthode token, VM DÉDIÉE seulement
    # (jamais sur prospup-prod : voir cloudflared-marienour.service)
    # ou : sudo cloudflared tunnel login && sudo PROD=1 bash deployment/setup-cloudflared.sh
  Logs : journalctl -u marienour -f
────────────────────────────────────────────────────────────────────────
EOF
