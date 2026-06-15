#!/usr/bin/env bash
#
# setup-cloudflared.sh — tunnel Cloudflare pour marienour, montage LOCALEMENT
# géré (cert + config.yml) — ALTERNATIVE scriptée.
#
# ⚠️ MÉTHODE RECOMMANDÉE = tunnel « remotely-managed » (token), plus simple et
#    pilotable depuis le dashboard (c'est ce que fait le runbook « Claude dans
#    Chrome », cf. docs/SETUP-CLOUDFLARE-CHROME.md). Sur cette VM DÉDIÉE
#    marienour, `cloudflared service install <TOKEN>` est sans risque :
#     1. Dashboard Cloudflare → Zero Trust → Networks → Tunnels → Create tunnel
#        nommé « marienour-oracle » → copier le TOKEN d'installation (eyJ...).
#     2. Sur la VM (cloudflared déjà installé par bootstrap) :
#          sudo cloudflared service install <TOKEN>
#     3. Public Hostnames (dashboard) — domaine « marienour.work ». Ajoute, tous
#        → http://localhost:8002 :
#          marienour.work · www.marienour.work
#        marienour.work est une ZONE neuve : le DNS proxifié (CNAME) est créé
#        automatiquement, AUCUNE suppression d'enregistrement nécessaire.
#
# Le script ci-dessous reste valable pour un montage LOCALEMENT géré (config.yml) :
#     sudo cloudflared tunnel login          # autorise la zone marienour.work
#     sudo bash setup-cloudflared.sh          # TEST : marienour-test.marienour.work
#     sudo PROD=1 bash setup-cloudflared.sh   # + apex + www

set -euo pipefail
TUNNEL="${TUNNEL:-marienour-oracle}"
DOMAIN="${DOMAIN:-marienour.work}"
PORT="${PORT:-8002}"
PROD="${PROD:-0}"
WWW="${WWW:-1}"   # marienour : www activé par défaut en PROD
CF_ETC=/etc/cloudflared

log(){ printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die(){ echo "ERREUR: $*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "sudo requis"
command -v cloudflared >/dev/null || die "cloudflared absent (installé par bootstrap-vm.sh)"
[[ -f /root/.cloudflared/cert.pem ]] || die "Lance d'abord (navigateur) : sudo cloudflared tunnel login"

# ── Tunnel (idempotent) ───────────────────────────────────────────────────
get_uuid(){ cloudflared tunnel list --output json 2>/dev/null \
  | python3 -c "import sys,json; ts=json.load(sys.stdin); print(next((t['id'] for t in ts if t['name']=='$TUNNEL'),''))"; }
UUID="$(get_uuid || true)"
if [[ -z "$UUID" ]]; then
  log "Création du tunnel $TUNNEL"
  cloudflared tunnel create "$TUNNEL"
  UUID="$(get_uuid)"
fi
[[ -n "$UUID" ]] || die "UUID du tunnel introuvable"
log "Tunnel $TUNNEL = $UUID"

# ── Credentials → /etc/cloudflared ────────────────────────────────────────
mkdir -p "$CF_ETC"
cp -f "/root/.cloudflared/${UUID}.json" "$CF_ETC/${UUID}.json"

# ── config.yml ────────────────────────────────────────────────────────────
# En PROD : apex (+ www si WWW=1). Toujours : marienour-test (pré-prod).
emit_ingress(){
  local d="$1"
  if [[ "$PROD" == "1" ]]; then
    echo "  - hostname: $d";              echo "    service: http://localhost:$PORT"
    [[ "$WWW" == "1" ]] && { echo "  - hostname: www.$d"; echo "    service: http://localhost:$PORT"; }
  fi
  echo "  - hostname: marienour-test.$d"; echo "    service: http://localhost:$PORT"
}

log "Écriture $CF_ETC/config.yml (PROD=$PROD, DOMAIN=$DOMAIN)"
{
  echo "tunnel: $UUID"
  echo "credentials-file: $CF_ETC/${UUID}.json"
  echo "ingress:"
  emit_ingress "$DOMAIN"
  echo "  - service: http_status:404"
} > "$CF_ETC/config.yml"

# ── Routes DNS (idempotent) ───────────────────────────────────────────────
route(){ cloudflared tunnel route dns "$TUNNEL" "$1" 2>&1 | grep -viE 'already|created' || true; log "DNS → $1"; }
route "marienour-test.$DOMAIN"
if [[ "$PROD" == "1" ]]; then
  route "$DOMAIN"
  [[ "$WWW" == "1" ]] && route "www.$DOMAIN"
fi

# ── Service systemd ───────────────────────────────────────────────────────
log "Installation/activation du service cloudflared"
cloudflared service install 2>/dev/null || true
systemctl enable --now cloudflared
systemctl restart cloudflared
sleep 2
systemctl is-active --quiet cloudflared || die "cloudflared inactif (journalctl -u cloudflared -n 40 --no-pager)"
log "cloudflared actif"
echo "  Test : https://marienour-test.$DOMAIN"
if [[ "$PROD" == "1" ]]; then
  echo "  Prod : https://$DOMAIN"
  [[ "$WWW" == "1" ]] && echo "  WWW  : https://www.$DOMAIN"
fi
exit 0
