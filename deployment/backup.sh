#!/usr/bin/env bash
# marienour · sauvegarde hors-site des données (SQLite + médias + vapid.json)
# vers le bucket R2 privé « marienour-backups », préfixe snapshots/.
#
# Généralisation du script de la Phase 0 bis de la cohabitation : même archive,
# même manifeste, même bucket. Il tourne sur prospup-prod comme sur une VM
# dédiée, service en marche (à chaud) ou arrêté (à froid).
#
# Installé dans /usr/local/lib/marienour/marienour-backup.sh par bootstrap-vm.sh
# (et non lancé depuis le dépôt : le code déployé peut être plus ancien que le
# kit). Lancé chaque nuit par marienour-backup.service (timer 03:30 UTC).
#
#   sudo /usr/local/lib/marienour/marienour-backup.sh --verifier   # préalables seulement
#   sudo /usr/local/lib/marienour/marienour-backup.sh              # sauvegarde + envoi + relecture
#
# Ce qu'il fait, sans arrêter le service et sans rien écrire dans data/ :
#   1. copie cohérente de marienour.db SOUS LE COMPTE marienour :
#        - à chaud (base WAL ouverte par l'app, -wal et -shm présents) :
#          « .backup » en lecture seule ;
#        - à froid (service arrêté, ni -wal ni -shm) : lecture « immutable »,
#          qui n'écrit rien ;
#        - sinon : ouverture normale, SQLite récupère le journal ;
#      la copie passe en journal DELETE, puis integrity_check et comptages ;
#   2. archive tar.gz : la copie, media/, vapid.json, .update-status.json,
#      backups/ (snapshots locaux de la maintenance Node) et un MANIFEST ;
#   3. envoi dans r2://marienour-backups/snapshots/, puis relecture depuis R2 et
#      comparaison des empreintes. Une relecture fausse = échec (code 1).
#
# La conservation (30 jours) est une règle de cycle de vie du bucket, posée
# dans le dashboard R2 : ce script n'efface jamais rien dans R2.
# N'emporte PAS /etc/marienour/marienour.env (ADMIN_PASSWORD, SESSION_SECRET).
# L'archive contient des secrets (vapid.json, smtp_pass dans la base) : le
# bucket est privé, l'accès passe par TLS et R2 chiffre au repos.
#
# Accès R2 : /etc/marienour/r2-backup.env (600 root), écrit par r2-acces.sh :
#   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
# Les clés passent à curl par un fichier de config en 600 dans le dossier de
# travail privé, jamais sur la ligne de commande (lisible dans /proc).
#
# Restaurer (pour mémoire, rien n'est restauré ici) : télécharger l'objet,
# vérifier son .sha256, extraire dans un dossier vide, comparer au MANIFEST,
# puis, service ARRÊTÉ, remplacer le contenu de data/ (sans le MANIFEST), en
# écartant les anciens marienour.db-wal et -shm, et rendre la propriété
# marienour:marienour.
set -euo pipefail
umask 077

APP_DIR=${APP_DIR:-/opt/marienour/app}
APP_DATA=${APP_DATA:-$APP_DIR/data}
APP_USER=${APP_USER:-marienour}
SERVICE=${SERVICE:-marienour.service}
ENV_FILE=${ENV_FILE:-/etc/marienour/r2-backup.env}
BUCKET=${BUCKET:-marienour-backups}
PREFIX=${PREFIX:-snapshots}
TRAVAIL=${TRAVAIL:-/var/tmp}
ELEMENTS=(media vapid.json .update-status.json backups)
VERIFIER=0; [[ ${1:-} == --verifier ]] && VERIFIER=1

say() { printf '%s\n' "$*"; }
die() { printf 'ERREUR · %s\n' "$*" >&2; say "RÉSULTAT : ÉCHEC"; exit 1; }
mo()  { awk -v t="$1" 'BEGIN{printf "%.1f Mo", t/1e6}'; }
# Commande sous le compte de l'app, sans session PAM (compatible avec le bac à
# sable de l'unité) ; repli sur runuser si setpriv manque.
en_app() {
  if command -v setpriv >/dev/null; then
    setpriv --reuid="$APP_USER" --regid="$APP_USER" --init-groups --reset-env -- "$@"
  else
    runuser -u "$APP_USER" -- "$@"
  fi
}
journal_wal() { [[ $(od -An -tu1 -j18 -N1 "$1" 2>/dev/null | tr -d ' ') == 2 ]]; }

say "== marienour · sauvegarde des données → R2 ($(hostname) · $(date -u +%FT%TZ))"

# ── 1. Préalables (lecture seule) ────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "à lancer en root"
command -v sqlite3 >/dev/null || die "sqlite3 absent"
# (pas de « curl --help all | grep -q » : avec pipefail, le SIGPIPE ferait échouer le test)
[[ $(curl --help all 2>/dev/null) == *--aws-sigv4* ]] || die "curl ne sait pas signer pour R2 (--aws-sigv4)"
id "$APP_USER" >/dev/null 2>&1 || die "compte $APP_USER absent"
db="$APP_DATA/marienour.db"
[[ -f $db && ! -L $db ]] || die "base absente : $db"
[[ $(head -c 15 "$db") == 'SQLite format 3' ]] || die "$db n'est pas une base SQLite"

# Façon de lire la base (cf. en-tête)
if ! journal_wal "$db" || [[ -e $db-wal && -e $db-shm ]]; then
  mode="à chaud"; ouvrir=(-readonly "$db")
elif [[ ! -e $db-wal && ! -e $db-shm ]] && ! systemctl is-active --quiet "$SERVICE"; then
  mode="à froid"; ouvrir=(-readonly "file:$db?immutable=1")
else
  mode="récupération"; ouvrir=("$db")
fi

total=$(stat -c %s "$db")
presents=()
for p in "${ELEMENTS[@]}"; do
  if [[ -e $APP_DATA/$p ]]; then
    presents+=("$p"); total=$(( total + $(du -sb "$APP_DATA/$p" | cut -f1) ))
  fi
done
libre=$(( $(df -Pk "$TRAVAIL" | awk 'NR==2{print $4}') * 1024 ))
(( libre > total * 3 + 20000000 )) || die "$TRAVAIL : $(mo "$libre") libres pour $(mo "$total") à copier"
say "préalables : ok (base lue $mode, ${#presents[@]}/${#ELEMENTS[@]} éléments, $(mo "$total"), $(mo "$libre") libres dans $TRAVAIL)"
for p in "${ELEMENTS[@]}"; do
  [[ " ${presents[*]} " == *" $p "* ]] || say "  (absent) $p"
done

if [[ -f $ENV_FILE ]]; then
  [[ $(stat -c '%a %U' "$ENV_FILE") == "600 root" ]] || die "$ENV_FILE doit être en 600 root"
  say "accès R2 : $ENV_FILE présent (600 root)"
else
  (( VERIFIER )) || die "$ENV_FILE absent : lancer d'abord r2-acces.sh"
  say "accès R2 : $ENV_FILE pas encore écrit (normal avant la saisie)"
fi
(( VERIFIER )) && { say "RÉSULTAT : PRÉALABLES OK"; exit 0; }

# Les valeurs ont été validées à la saisie (hexadécimal et URL fixe).
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
for v in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  [[ -n ${!v:-} ]] || die "$v vide dans $ENV_FILE : relancer la saisie des accès R2"
done

# ── Espace de travail, retiré quoi qu'il arrive ──────────────────────────────
stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
archive="marienour-data-$stamp.tar.gz"
work=$(mktemp -d "$TRAVAIL/marienour-backup.XXXXXX")
chmod 711 "$work"                                   # le compte de l'app écrit dans db/
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$work/db"
cfg="$work/curl.cfg"
trap 'rm -rf -- "$work"' EXIT                       # dossier créé par ce script, rien d'autre
printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" > "$cfg"
unset R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY

# ── 2. Copie cohérente de la base ────────────────────────────────────────────
copie="$work/db/marienour.db"
en_app sqlite3 "${ouvrir[@]}" ".timeout 20000" ".backup '$copie'" || die ".backup a échoué ($mode)"
en_app sqlite3 "$copie" "PRAGMA journal_mode=DELETE;" >/dev/null || die "journal DELETE impossible"
integ=$(en_app sqlite3 "$copie" "PRAGMA integrity_check;" | sed -n 1p)
[[ $integ == ok ]] || die "integrity_check de la copie : $integ"
compte() { en_app sqlite3 "$copie" "SELECT count(*) FROM $1;" 2>/dev/null || echo "?"; }
say "base ($mode) : integrity_check=ok · tables=$(en_app sqlite3 "$copie" "SELECT count(*) FROM sqlite_master WHERE type='table';") · migrations=$(compte _mn_migrations) · users=$(compte users) · sessions=$(compte sessions) · lists=$(compte lists) · trips=$(compte trips) · events=$(compte events) · widgets=$(compte widgets)"
chown root:root "$copie"

# ── 3. Manifeste et archive ──────────────────────────────────────────────────
commit=$(en_app git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo '?')
{
  printf '# MarieNour · sauvegarde %s · hôte %s · commit %s · base lue %s\n' "$stamp" "$(hostname)" "$commit" "$mode"
  printf '# sha256  taille  chemin (relatif à data/ ; marienour.db = copie .backup en journal DELETE)\n'
  ( cd "$work/db" && printf '%s %s %s\n' "$(sha256sum marienour.db | cut -d' ' -f1)" "$(stat -c %s marienour.db)" marienour.db )
  if (( ${#presents[@]} )); then
    ( cd "$APP_DATA" && find "${presents[@]}" -type f -print0 | sort -z | while IFS= read -r -d '' f; do
        printf '%s %s %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$(stat -c %s "$f")" "$f"
      done )
  fi
} > "$work/MANIFEST-marienour.txt"
nb=$(grep -vc '^#' "$work/MANIFEST-marienour.txt")

tar -czf "$work/$archive" --owner=0 --group=0 --numeric-owner \
  -C "$work" MANIFEST-marienour.txt \
  -C "$work/db" marienour.db \
  -C "$APP_DATA" "${presents[@]}"
sha=$(sha256sum "$work/$archive" | cut -d' ' -f1)
say "archive : $archive · $nb fichiers · $(mo "$(stat -c %s "$work/$archive")") · sha256=${sha:0:16}…"

# ── 4. Envoi, puis relecture depuis R2 ───────────────────────────────────────
cle="$PREFIX/$archive"
url="$R2_ENDPOINT/$BUCKET/$cle"
envoyer() {  # $1 = fichier local, $2 = URL
  local code
  code=$(curl -sS --retry 3 --aws-sigv4 "aws:amz:auto:s3" -K "$cfg" \
    -T "$1" -o "$work/http.txt" -w '%{http_code}' "$2") || code="réseau"
  if [[ $code != 200 ]]; then
    die "envoi refusé (HTTP $code $(grep -o '<Code>[^<]*</Code>' "$work/http.txt" 2>/dev/null | sed -n 1p || true))"
  fi
}
envoyer "$work/$archive" "$url"
printf '%s  %s\n' "$sha" "$archive" > "$work/$archive.sha256"
envoyer "$work/$archive.sha256" "$url.sha256"
say "envoi : HTTP 200 · r2://$BUCKET/$cle (+ .sha256)"

code=$(curl -sS --retry 3 --aws-sigv4 "aws:amz:auto:s3" -K "$cfg" \
  -o "$work/retour.tar.gz" -w '%{http_code}' "$url") || code="réseau"
[[ $code == 200 ]] || die "relecture refusée (HTTP $code)"
[[ $(sha256sum "$work/retour.tar.gz" | cut -d' ' -f1) == "$sha" ]] || die "l'objet relu depuis R2 n'a pas la même empreinte"
tar -tzf "$work/retour.tar.gz" >/dev/null || die "l'objet relu n'est pas une archive lisible"
say "relecture : HTTP 200 · empreinte identique · archive lisible"
say "RÉSULTAT : OK"
