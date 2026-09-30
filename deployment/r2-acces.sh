#!/usr/bin/env bash
# marienour · saisie des accès R2 de la sauvegarde (bucket marienour-backups).
#
# INTERACTIF : c'est Antoine qui le lance, dans un terminal SSH ouvert avec
# « ssh -t ». Il colle trois valeurs lues sur la page du jeton R2 (jeton limité
# au bucket marienour-backups, Object Read & Write). Rien n'est affiché : ni à
# l'écran, ni dans un journal, ni sur une ligne de commande.
#
# Écrit /etc/marienour/r2-backup.env (600 root), puis teste l'accès en envoyant
# et relisant un petit fichier de test dans le bucket (acces-test/…).
#
#   sudo bash /usr/local/lib/marienour/r2-acces.sh
#
# Rejouable : il demande avant de remplacer un fichier déjà écrit.
# Sur prospup-prod, ce fichier arrive déjà rempli depuis l'ancienne VM (secret
# marienour-r2 de la cohabitation) : ce script sert à une reconstruction ou à un
# changement de jeton. Il remplace phase0bis-r2-secret.sh (dépôt ProspUp).
set -euo pipefail

DEST=${DEST:-/etc/marienour/r2-backup.env}
BUCKET=${BUCKET:-marienour-backups}

die() { printf '\nERREUR · %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "à lancer avec sudo"
[[ -t 0 ]] || die "il faut un terminal interactif : ouvre la session avec « ssh -t »"
[[ -d $(dirname "$DEST") ]] || die "$(dirname "$DEST") absent : ce n'est pas une machine MarieNour"
# (pas de « curl --help all | grep -q » : avec pipefail, le SIGPIPE ferait échouer le test)
[[ $(curl --help all 2>/dev/null) == *--aws-sigv4* ]] || die "ce curl ne sait pas signer pour R2 (--aws-sigv4)"

umask 077

if [[ -e $DEST ]]; then
  read -rp "$DEST existe déjà. Le remplacer ? (oui/non) " rep
  [[ $rep == oui ]] || { echo "Rien n'a été changé."; exit 0; }
fi

echo "Colle les trois valeurs affichées par Cloudflare (rien ne s'affiche pour les deux dernières)."
read -rp  "1/3 · Point de terminaison S3 « Default » (https://….r2.cloudflarestorage.com) : " EP
read -rsp "2/3 · Access Key ID : " KID; echo
read -rsp "3/3 · Secret Access Key : " SEC; echo

# Un copier-coller Windows peut ajouter un retour chariot ou des espaces.
EP=${EP//[$'\r\t ']/}; KID=${KID//[$'\r\t ']/}; SEC=${SEC//[$'\r\t ']/}
EP=${EP%/}

# Le point de terminaison d'un bucket en juridiction européenne porte « .eu ».
[[ $EP =~ ^https://[0-9a-f]{32}(\.eu)?\.r2\.cloudflarestorage\.com$ ]] \
  || die "point de terminaison inattendu : il faut https://<32 caractères>[.eu].r2.cloudflarestorage.com"
[[ $KID =~ ^[0-9a-f]{32}$ ]] || die "Access Key ID : 32 caractères hexadécimaux attendus (reçu : ${#KID} caractères)"
[[ $SEC =~ ^[0-9a-f]{64}$ ]] || die "Secret Access Key : 64 caractères hexadécimaux attendus (reçu : ${#SEC} caractères)"

tmp=$(mktemp "$DEST.XXXXXX")
printf 'R2_ENDPOINT=%s\nR2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\n' "$EP" "$KID" "$SEC" > "$tmp"
chown root:root "$tmp"; chmod 600 "$tmp"
mv -f "$tmp" "$DEST"
echo "Écrit : $DEST ($(stat -c '%a %U:%G' "$DEST"))"

# ── Test d'accès : un envoi puis une relecture, avec les droits du jeton ─────
work=$(mktemp -d /dev/shm/mn-r2test.XXXXXX)
cfg="$work/curl.cfg"
trap 'rm -f "$cfg" "$work/test.txt" "$work/retour.txt" "$work/http.txt"; rmdir "$work" 2>/dev/null || true' EXIT
printf 'user = "%s:%s"\n' "$KID" "$SEC" > "$cfg"
unset SEC KID

key="acces-test/$(hostname)-$(date -u +%Y%m%dT%H%M%SZ).txt"
printf 'test d accès R2 · %s\n' "$(date -u +%FT%TZ)" > "$work/test.txt"
code=$(curl -sS --retry 2 --aws-sigv4 "aws:amz:auto:s3" -K "$cfg" \
  -T "$work/test.txt" -o "$work/http.txt" -w '%{http_code}' "$EP/$BUCKET/$key") || code="réseau"
if [[ $code != 200 ]]; then
  motif=$(grep -o '<Code>[^<]*</Code>' "$work/http.txt" 2>/dev/null | sed -n 1p || true)
  die "envoi de test refusé (HTTP $code ${motif:-}). Vérifie le bucket du jeton et relance ce script."
fi
code=$(curl -sS --retry 2 --aws-sigv4 "aws:amz:auto:s3" -K "$cfg" \
  -o "$work/retour.txt" -w '%{http_code}' "$EP/$BUCKET/$key") || code="réseau"
[[ $code == 200 ]] && cmp -s "$work/test.txt" "$work/retour.txt" \
  || die "relecture du fichier de test en échec (HTTP $code)"

echo "ACCÈS R2 : OK (envoi et relecture dans r2://$BUCKET/$key)"
echo "Tu peux fermer l'onglet du jeton et revenir à la session Claude du PC."
