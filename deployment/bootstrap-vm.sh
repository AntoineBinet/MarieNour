#!/usr/bin/env bash
#
# bootstrap-vm.sh · installation idempotente de marienour sur une VM Oracle.
# Ubuntu 24.04 LTS, x86_64 ou aarch64. À lancer EN ROOT.
#
# Deux cas, détectés tout seuls :
#   - MACHINE PARTAGÉE (prospup-prod, depuis octobre 2026) : une autre app y
#     tourne déjà (prospup.service ou portfolio.service). Le script ne touche à
#     RIEN de ce qui n'est pas à marienour : aucun apt, aucun swap, aucune
#     installation de cloudflared, aucun `git config --system` ni `--global`,
#     aucune écriture dans /etc/gitconfig, /etc/litestream.yml, /etc/cloudflared
#     ni dans les unités des autres. Un outil manquant = arrêt, avec la liste.
#     Seule chose posée hors des dossiers de marienour : Node, dans
#     /opt/node-v<version>-linux-<arch> et le lien /opt/node (décision D3).
#   - VM DÉDIÉE (reconstruction, plan de reprise) : il peut installer les
#     paquets manquants (sans upgrade), cloudflared et un swap si RAM < 2 Go.
#
# Node vient de l'archive officielle nodejs.org, jamais d'apt : son empreinte
# est écrite dans ce script (relue en revue de code) ET comparée au
# SHASUMS256.txt publié. Les deux doivent concorder.
#
# Il est lancé DEPUIS LE KIT (le dossier deployment/ de origin/main, recopié
# sur la VM), pas depuis le dépôt cloné : l'app déployée peut être figée sur un
# commit plus ancien que le kit (MARIENOUR_COMMIT). Les unités et les scripts
# d'exploitation sont pris dans le dossier de CE script.
#
#   sudo bash ~/kit-marienour/deployment/bootstrap-vm.sh --node     # Node seul
#   sudo bash ~/kit-marienour/deployment/bootstrap-vm.sh --compte   # compte + dossiers
#   sudo MARIENOUR_COMMIT=<sha> bash ~/kit-marienour/deployment/bootstrap-vm.sh
#
# Le build (npm ci + build:all) tourne dans une unité transitoire plafonnée
# (systemd-run : 4 Go, poids 30), sous le compte marienour et dans le même bac
# à sable que l'app : les scripts d'installation des paquets npm ne voient ni
# les processus ni les fichiers de ProspUp et de Portfolio.
#
# N'active et ne démarre RIEN, sauf ENABLE=1 (app + timer, jamais le tunnel :
# un second connecteur actif sur marienour-oracle se ferait voler le trafic).
# Voir deployment/DEPLOY.md, section « Machine partagée avec ProspUp ».
#
# Variables surchargeables :
#   MARIENOUR_BRANCH  (def: main)  branche suivie (celle que tire le bouton « Mettre à jour »)
#   MARIENOUR_COMMIT  (def: vide)  commit exact à déployer (doit appartenir à origin/<branche>)
#   REPO_URL          (def: https://github.com/AntoineBinet/MarieNour.git, dépôt public, sans clé)
#   APP_HOME          (def: /opt/marienour)
#   SERVICE_USER      (def: marienour)
#   OPS_USER          (def: ubuntu) compte SSH autorisé à piloter les unités
#   ENABLE            (def: 0)     1 = enable --now marienour + timer de sauvegarde
#   FORCE_BUILD       (def: 0)     1 = refaire npm ci + build même si le build est à jour
#   MAKE_SWAP         (def: auto)  VM dédiée seulement : swapfile 2 Go si RAM < 2 Go

set -Eeuo pipefail
umask 022

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARIENOUR_BRANCH="${MARIENOUR_BRANCH:-main}"
MARIENOUR_COMMIT="${MARIENOUR_COMMIT:-}"
REPO_URL="${REPO_URL:-https://github.com/AntoineBinet/MarieNour.git}"
APP_HOME="${APP_HOME:-/opt/marienour}"
APP_DIR="${APP_HOME}/app"
SERVICE_USER="${SERVICE_USER:-marienour}"
OPS_USER="${OPS_USER:-ubuntu}"
ENABLE="${ENABLE:-0}"
FORCE_BUILD="${FORCE_BUILD:-0}"
MAKE_SWAP="${MAKE_SWAP:-auto}"
LIB_DIR=/usr/local/lib/marienour

# Node : la version qui tourne sur l'ancienne VM. Empreintes des archives
# .tar.gz, relevées dans https://nodejs.org/dist/v20.20.2/SHASUMS256.txt.
NODE_VERSION=20.20.2
NODE_SHA256_ARM64=47ef73d543ecf6eb19435f6c03a0ac4809b3bf0dd6b26c7c571efc2a6572a74d
NODE_SHA256_X64=19e56f0825510207dd904f087fe52faa0a4eb6b2aab5f0ea7a33830d04888b8b
NODE_LIEN=/opt/node
NODE_PATH_ENV="$NODE_LIEN/bin:/usr/local/bin:/usr/bin:/bin"

UNITES=(marienour.service cloudflared-marienour.service marienour-backup.service marienour-backup.timer)
# Même bac à sable que marienour.service, pour le build transitoire.
CACHES="-/etc/systemd/system -/run/dbus -/etc/litestream.yml -/etc/cloudflared -/etc/prospup -/opt/prospup -/etc/portfolio -/opt/portfolio -/etc/marienour"

log()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERREUR · %s\033[0m\n' "$*" >&2; echo "RÉSULTAT : ÉCHEC"; exit 1; }
# Toute commande qui échoue sans passer par die() finit sur la même ligne :
# les runbooks jugent chaque étape à « RÉSULTAT : … ».
echec() { printf '\033[1;31mERREUR · commande en échec (code %s, ligne %s)\033[0m\n' "$1" "$2" >&2; echo "RÉSULTAT : ÉCHEC"; }
trap 'echec $? $LINENO' ERR
# Commande sous le compte de l'app : HOME = son dossier, Node dans le PATH, et
# JAMAIS la config git système (sur prospup-prod, /etc/gitconfig est à ProspUp).
en_app() {
  runuser -u "$SERVICE_USER" -- env -C "$APP_HOME" HOME="$APP_HOME" PATH="$NODE_PATH_ENV" \
    GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0 "$@"
}
git_app() { en_app git -C "$APP_DIR" "$@"; }

NODE_TMP=""
nettoyer() { if [[ -n $NODE_TMP && -d $NODE_TMP ]]; then rm -rf -- "$NODE_TMP"; fi; }
trap nettoyer EXIT

MODE=tout
case "${1:-}" in
  --node)   MODE=node ;;
  --compte) MODE=compte ;;
  "") ;;
  *) die "option inconnue : $1 (--node, --compte, ou rien)" ;;
esac

# ── 0. Pré-requis et nature de la machine ─────────────────────────────────
[[ $EUID -eq 0 ]] || die "à lancer en root (sudo bash bootstrap-vm.sh)"
for f in "${UNITES[@]}" backup.sh r2-acces.sh; do
  [[ -f $KIT_DIR/$f ]] || die "kit incomplet : $KIT_DIR/$f absent"
done
PARTAGEE=0
for autre in prospup.service portfolio.service; do
  [[ -e /etc/systemd/system/$autre ]] && PARTAGEE=1
done
case "$(uname -m)" in
  aarch64|arm64) CF_ARCH=arm64; NODE_ARCH=arm64; NODE_SHA256=$NODE_SHA256_ARM64 ;;
  x86_64|amd64)  CF_ARCH=amd64; NODE_ARCH=x64;   NODE_SHA256=$NODE_SHA256_X64 ;;
  *) die "architecture $(uname -m) non prévue" ;;
esac
if (( PARTAGEE )); then
  log "Machine PARTAGÉE ($(hostname), $(uname -m)) : on ne touche qu'à marienour · mode $MODE"
else
  log "VM dédiée ($(hostname), $(uname -m)) · mode $MODE"
fi

# ── 1. Outils ─────────────────────────────────────────────────────────────
log "1/10 · Outils"
requis=(curl tar gzip sha256sum awk)
if [[ $MODE != node ]]; then
  requis+=(git sqlite3 runuser setpriv visudo systemd-run systemd-analyze)
fi
manque=()
for c in "${requis[@]}"; do command -v "$c" >/dev/null || manque+=("$c"); done
if [[ $MODE == tout && ! -x /usr/bin/cloudflared ]]; then manque+=("cloudflared"); fi
if (( ${#manque[@]} )); then
  if (( PARTAGEE )); then
    die "outils absents sur une machine partagée : ${manque[*]}. Aucun apt ici : les installer à part, sur GO."
  fi
  log "VM dédiée : installation de ${manque[*]} (sans upgrade)"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  # build-essential + python3 : repli si better-sqlite3 doit compiler (sinon
  # prebuild-install télécharge un binaire tout fait).
  apt-get install -y git curl ca-certificates sqlite3 util-linux sudo tar gzip build-essential python3
  if [[ $MODE == tout && ! -x /usr/bin/cloudflared ]]; then
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/cloudflared.deb" \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb"
    apt-get install -y "$tmp/cloudflared.deb"
    rm -f "$tmp/cloudflared.deb"; rmdir "$tmp"
  fi
fi
ok "outils présents${manque[*]:+ (installés : ${manque[*]})}"

# ── 2. Node (archive officielle, empreinte vérifiée) ──────────────────────
if [[ $MODE != compte ]]; then
  log "2/10 · Node v$NODE_VERSION ($NODE_ARCH)"
  nom="node-v$NODE_VERSION-linux-$NODE_ARCH"
  dir="/opt/$nom"
  if [[ -x $dir/bin/node ]] && [[ $("$dir/bin/node" -v) == "v$NODE_VERSION" ]]; then
    ok "déjà en place : $dir"
  else
    [[ -e $dir ]] && die "$dir existe mais n'est pas un Node v$NODE_VERSION complet : le retirer à la main, sur GO"
    NODE_TMP=$(mktemp -d /opt/.node-install.XXXXXX)   # même disque que /opt : mv atomique
    base="https://nodejs.org/dist/v$NODE_VERSION"
    curl -fsSL --retry 3 -o "$NODE_TMP/$nom.tar.gz" "$base/$nom.tar.gz" || die "téléchargement de $nom.tar.gz"
    curl -fsSL --retry 3 -o "$NODE_TMP/SHASUMS256.txt" "$base/SHASUMS256.txt" || die "téléchargement de SHASUMS256.txt"
    recu=$(sha256sum "$NODE_TMP/$nom.tar.gz" | cut -d' ' -f1)
    [[ $recu == "$NODE_SHA256" ]] || die "empreinte de $nom.tar.gz : $recu, attendu (kit) $NODE_SHA256"
    publie=$(awk -v f="$nom.tar.gz" '$2 == f {print $1}' "$NODE_TMP/SHASUMS256.txt")
    [[ $publie == "$NODE_SHA256" ]] || die "SHASUMS256.txt de nodejs.org ne concorde pas avec le kit (${publie:-absent})"
    ok "empreinte vérifiée (kit et SHASUMS256.txt) : ${recu:0:16}…"
    tar -xzf "$NODE_TMP/$nom.tar.gz" -C "$NODE_TMP" --no-same-owner
    [[ $("$NODE_TMP/$nom/bin/node" -v) == "v$NODE_VERSION" ]] || die "le node extrait ne répond pas v$NODE_VERSION"
    chown -R root:root "$NODE_TMP/$nom"
    chmod -R go-w "$NODE_TMP/$nom"
    mv "$NODE_TMP/$nom" "$dir"
    nettoyer; NODE_TMP=""
    ok "installé : $dir"
  fi
  if [[ -L $NODE_LIEN && $(readlink "$NODE_LIEN") == "$dir" ]]; then
    ok "$NODE_LIEN → $dir"
  elif [[ -e $NODE_LIEN && ! -L $NODE_LIEN ]]; then
    die "$NODE_LIEN existe et n'est pas un lien : à examiner à la main"
  else
    [[ -L $NODE_LIEN ]] && warn "$NODE_LIEN visait $(readlink "$NODE_LIEN") : remplacé"
    ln -s "$dir" "$NODE_LIEN.nouveau.$$"
    mv -T "$NODE_LIEN.nouveau.$$" "$NODE_LIEN"
    ok "$NODE_LIEN → $dir"
  fi
  ok "node $("$NODE_LIEN/bin/node" -v) · npm $(PATH="$NODE_PATH_ENV" "$NODE_LIEN/bin/npm" -v)"
  if [[ $MODE == node ]]; then echo "RÉSULTAT : OK (Node prêt)"; exit 0; fi
fi

# ── 3. Swap (VM dédiée à peu de RAM seulement : le build Vite monte à 3 Go) ─
if [[ $MODE == tout && $MAKE_SWAP != 0 ]] && (( ! PARTAGEE )); then
  mem_kb="$(awk '/MemTotal/{print $2}' /proc/meminfo)"
  if [[ $MAKE_SWAP == 1 || ( $MAKE_SWAP == auto && $mem_kb -lt 2000000 ) ]]; then
    if [[ $(swapon --show=NAME --noheadings) != *'/swapfile'* ]]; then
      log "3/10 · Swapfile 2 Go (RAM faible)"
      fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
      chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
      grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
      ok "swap actif"
    fi
  fi
fi

# ── 4. Compte système et dossiers ─────────────────────────────────────────
log "4/10 · Compte '$SERVICE_USER'"
if id "$SERVICE_USER" >/dev/null 2>&1; then
  ok "existe déjà ($(id "$SERVICE_USER"))"
else
  useradd --system --create-home --home-dir "$APP_HOME" --shell /usr/sbin/nologin \
    --user-group "$SERVICE_USER"
  ok "créé ($(id "$SERVICE_USER"), shell nologin)"
fi
[[ $(getent passwd "$SERVICE_USER" | cut -d: -f6) == "$APP_HOME" ]] \
  || die "le dossier du compte $SERVICE_USER n'est pas $APP_HOME"
install -d -m 750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$APP_HOME"
install -d -m 755 -o root -g root /etc/marienour
ok "$APP_HOME $(stat -c '%a %U:%G' "$APP_HOME") · /etc/marienour $(stat -c '%a %U:%G' /etc/marienour)"
if [[ $MODE == compte ]]; then echo "RÉSULTAT : OK (compte prêt)"; exit 0; fi

[[ -x $NODE_LIEN/bin/node ]] || die "$NODE_LIEN/bin/node absent : lancer d'abord le mode --node"

# ── 5. Dépôt : clone HTTPS ou mise à jour, commit éventuellement figé ──────
log "5/10 · Dépôt ($REPO_URL, branche $MARIENOUR_BRANCH${MARIENOUR_COMMIT:+, commit $MARIENOUR_COMMIT})"
if [[ -d $APP_DIR/.git ]]; then
  [[ $(stat -c %U "$APP_DIR") == "$SERVICE_USER" ]] || die "$APP_DIR n'appartient pas à $SERVICE_USER"
  # Une ancienne installation clonait avec un jeton dans l'URL : on le retire
  # sans jamais l'afficher.
  if [[ $(git_app remote get-url origin) != "$REPO_URL" ]]; then
    git_app remote set-url origin "$REPO_URL"
    warn "URL du dépôt remplacée par $REPO_URL (l'ancienne n'est pas affichée : elle pouvait porter un jeton)"
  fi
  git_app fetch origin --prune
  ok "dépôt existant, récupéré"
else
  en_app git clone --branch "$MARIENOUR_BRANCH" "$REPO_URL" "$APP_DIR"
  ok "cloné"
fi
if [[ -n $MARIENOUR_COMMIT ]]; then
  git_app cat-file -e "$MARIENOUR_COMMIT^{commit}" 2>/dev/null || die "commit $MARIENOUR_COMMIT inconnu"
  git_app merge-base --is-ancestor "$MARIENOUR_COMMIT" "origin/$MARIENOUR_BRANCH" \
    || die "$MARIENOUR_COMMIT n'appartient pas à origin/$MARIENOUR_BRANCH"
  if [[ $(git_app rev-parse HEAD) != $(git_app rev-parse "$MARIENOUR_COMMIT^{commit}") ]]; then
    git_app checkout -B "$MARIENOUR_BRANCH" "$MARIENOUR_COMMIT"
  fi
  git_app branch --set-upstream-to="origin/$MARIENOUR_BRANCH" "$MARIENOUR_BRANCH" >/dev/null
else
  git_app checkout "$MARIENOUR_BRANCH"
  git_app merge --ff-only "origin/$MARIENOUR_BRANCH"
fi
head=$(git_app rev-parse HEAD)
ok "HEAD = $head ($(git_app log -1 --format=%cs))"

# ── 6. npm ci + build, dans une unité transitoire plafonnée ────────────────
log "6/10 · npm ci + build:all (unité transitoire : 4 Go, poids 30)"
marqueur="$APP_DIR/dist-server/.bootstrap-commit"
if [[ $FORCE_BUILD != 1 && -f $APP_DIR/dist-server/server.mjs && -f $APP_DIR/dist/index.html \
      && -f $marqueur && $(cat "$marqueur") == "$head" ]]; then
  ok "build déjà à jour pour $head (FORCE_BUILD=1 pour le refaire)"
else
  unite="marienour-build-$(date -u +%Y%m%dT%H%M%SZ)"
  # shellcheck disable=SC2016  # $… évalué dans l'unité, pas ici
  systemd-run --unit="$unite" --wait --pipe --collect --quiet \
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
    || die "build en échec (sortie ci-dessus ; journal : journalctl -u $unite). Si better-sqlite3 a voulu compiler : binaire précompilé introuvable pour linux-$NODE_ARCH"
  [[ -f $APP_DIR/dist-server/server.mjs && -f $APP_DIR/dist/index.html ]] || die "build incomplet (dist/ ou dist-server/ absent)"
  printf '%s\n' "$head" | runuser -u "$SERVICE_USER" -- tee "$marqueur" >/dev/null
  ok "build prêt pour $head"
fi
# better-sqlite3 est un module natif : il doit se charger avec CE Node.
runuser -u "$SERVICE_USER" -- env -C "$APP_DIR" HOME="$APP_HOME" PATH="$NODE_PATH_ENV" \
  node -e "const D = require('better-sqlite3'); new D(':memory:').prepare('select 1').get()" \
  || die "better-sqlite3 ne se charge pas avec node $("$NODE_LIEN/bin/node" -v)"
ok "better-sqlite3 se charge avec node $("$NODE_LIEN/bin/node" -v)"

# ── 7. Dossier de données ─────────────────────────────────────────────────
log "7/10 · Données"
install -d -m 750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$APP_DIR/data"
if [[ -f $APP_DIR/data/marienour.db ]]; then
  ok "data/ présent ($(du -sh "$APP_DIR/data" | cut -f1))"
else
  warn "data/ vide : sur une machine partagée, les données arrivent par donnees-recevoir.sh (dépôt ProspUp)"
fi

# ── 8. Secrets ────────────────────────────────────────────────────────────
log "8/10 · /etc/marienour"
if [[ -f /etc/marienour/marienour.env ]]; then
  chown root:root /etc/marienour/marienour.env; chmod 600 /etc/marienour/marienour.env
  ok "marienour.env présent (600 root)"
elif (( PARTAGEE )); then
  warn "marienour.env absent : à recevoir de l'ancienne VM (secret-recevoir.sh marienour-env)"
else
  install -m 600 -o root -g root "$APP_DIR/deployment/marienour.env.example" /etc/marienour/marienour.env
  warn "marienour.env créé depuis l'exemple : ADMIN_PASSWORD et SESSION_SECRET à renseigner"
fi
for f in tunnel.env r2-backup.env; do
  if [[ -f /etc/marienour/$f ]]; then ok "$f présent ($(stat -c '%a %U' "/etc/marienour/$f"))"; else warn "$f absent"; fi
done

# ── 9. Unités et scripts d'exploitation (depuis le kit) ────────────────────
log "9/10 · Unités systemd et scripts (depuis $KIT_DIR)"
install -d -m 755 "$LIB_DIR"
install -m 755 "$KIT_DIR/backup.sh" "$LIB_DIR/marienour-backup.sh"
install -m 755 "$KIT_DIR/r2-acces.sh" "$LIB_DIR/r2-acces.sh"
sauvegarde=/var/backups/marienour-kit
changees=()
for u in "${UNITES[@]}"; do
  dest=/etc/systemd/system/$u
  if [[ -f $dest ]] && cmp -s "$KIT_DIR/$u" "$dest"; then continue; fi
  if [[ -f $dest ]]; then
    install -d -m 700 "$sauvegarde"
    cp -p "$dest" "$sauvegarde/$u.avant-$(date -u +%Y%m%dT%H%M%SZ)"
  fi
  install -m 644 -o root -g root "$KIT_DIR/$u" "$dest"
  changees+=("$u")
done
for u in "${UNITES[@]}"; do
  systemd-analyze verify "/etc/systemd/system/$u" || die "systemd-analyze verify en échec : $u"
done
systemctl daemon-reload
ok "unités vérifiées${changees[*]:+ · mises à jour : ${changees[*]}}"
if systemctl is-active --quiet marienour.service && [[ " ${changees[*]} " == *" marienour.service "* ]]; then
  warn "marienour tourne avec l'ancienne unité : la nouvelle s'applique au prochain redémarrage"
fi

SUDOERS=/etc/sudoers.d/marienour-ops
tmp=$(mktemp)
cat > "$tmp" <<EOF
# Pilotage des unités de marienour par $OPS_USER (ops manuelles). Le bouton
# « Mettre à jour » de l'app n'en a pas besoin (exit 42 + RestartForceExitStatus).
# Formes journalctl explicites : pas de « -u marienour * », qui laissait lire
# les journaux de n'importe quel service par un second « -u ».
$OPS_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart marienour, /usr/bin/systemctl start marienour, /usr/bin/systemctl stop marienour, /usr/bin/systemctl status marienour, /usr/bin/systemctl status cloudflared-marienour, /usr/bin/systemctl status marienour-backup, /usr/bin/systemctl start marienour-backup, /usr/bin/journalctl -u marienour, /usr/bin/journalctl -u marienour -n [0-9]*, /usr/bin/journalctl -u marienour -f, /usr/bin/journalctl -u marienour --no-pager, /usr/bin/journalctl -u marienour --since *, /usr/bin/journalctl -u cloudflared-marienour -n [0-9]* --no-pager, /usr/bin/journalctl -u marienour-backup -n [0-9]* --no-pager
EOF
visudo -cf "$tmp" >/dev/null || { rm -f "$tmp"; die "sudoers généré invalide"; }
install -m 440 -o root -g root "$tmp" "$SUDOERS"; rm -f "$tmp"
ok "sudoers $SUDOERS valide"

# ── 10. Activation (seulement si demandée) ────────────────────────────────
log "10/10 · Activation"
if [[ $ENABLE == 1 ]]; then
  grep -qE '^ADMIN_PASSWORD=.+' /etc/marienour/marienour.env 2>/dev/null \
    && grep -qE '^SESSION_SECRET=.+' /etc/marienour/marienour.env \
    || die "ENABLE=1 refusé : ADMIN_PASSWORD ou SESSION_SECRET vide dans /etc/marienour/marienour.env"
  systemctl enable --now marienour.service
  systemctl enable --now marienour-backup.timer
  ok "marienour et son timer de sauvegarde activés ; le tunnel reste à activer à la main"
else
  ok "rien n'est activé (ENABLE=1 pour activer l'app et le timer)"
fi
for u in "${UNITES[@]}"; do
  printf '  %-34s %s · %s\n' "$u" "$(systemctl is-enabled "$u" 2>/dev/null || true)" "$(systemctl is-active "$u" 2>/dev/null || true)"
done
echo "RÉSULTAT : OK"
