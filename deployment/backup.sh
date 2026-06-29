#!/usr/bin/env bash
# Sauvegarde HORS-SITE de marienour (SQLite + médias) — à lancer par un timer
# systemd (cf. marienour-backup.timer) ou manuellement.
#
# Deux niveaux de protection complémentaires :
#   1. Snapshot LOCAL rotatif de la base : déjà fait AUTOMATIQUEMENT par le
#      service Node (server/node-maintenance.ts) → data/backups/. Ce script en
#      refait un par sécurité s'il tourne seul.
#   2. Copie OFF-SITE (ce script) : SQLite (.backup cohérent) + archive des médias
#      → poussées vers un stockage distant via `rclone` (recommandé : un bucket
#      objet, p.ex. Cloudflare R2). C'est ce qui protège de la PERTE DU DISQUE.
#
# Idempotent, sans interaction. Conçu pour un cron/timer quotidien.
set -euo pipefail

APP_DIR="${MARIENOUR_APP_DIR:-/opt/marienour/app}"
DATA_DIR="${MARIENOUR_DATA_DIR:-$APP_DIR/data}"
DB_PATH="$DATA_DIR/marienour.db"
MEDIA_DIR="$DATA_DIR/media"
BACKUP_DIR="${MARIENOUR_BACKUP_DIR:-$DATA_DIR/backups}"
KEEP_DAYS="${MARIENOUR_BACKUP_KEEP_DAYS:-14}"

# Destination distante rclone, ex. "r2:marienour-backups" (vide = pas d'off-site,
# on se contente du snapshot local + archive locale).
RCLONE_REMOTE="${MARIENOUR_RCLONE_REMOTE:-}"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

log() { echo "[backup] $*"; }

# 1) Snapshot SQLite cohérent (ne verrouille pas longuement la base).
DB_SNAP="$BACKUP_DIR/marienour-$STAMP.db"
if [[ -f "$DB_PATH" ]]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$DB_SNAP'"
  else
    # Repli : copie simple (la base est en WAL ; acceptable pour un hub perso).
    cp "$DB_PATH" "$DB_SNAP"
  fi
  log "snapshot base → $DB_SNAP ($(du -h "$DB_SNAP" | cut -f1))"
else
  log "base introuvable ($DB_PATH) — ignorée"
fi

# 2) Archive des médias.
MEDIA_TAR="$BACKUP_DIR/media-$STAMP.tar.gz"
if [[ -d "$MEDIA_DIR" ]]; then
  tar -czf "$MEDIA_TAR" -C "$DATA_DIR" media
  log "archive médias → $MEDIA_TAR ($(du -h "$MEDIA_TAR" | cut -f1))"
fi

# 3) Copie off-site (optionnelle, recommandée).
if [[ -n "$RCLONE_REMOTE" ]] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$DB_SNAP" "$RCLONE_REMOTE/" --no-traverse || log "WARN: rclone base a échoué"
  [[ -f "$MEDIA_TAR" ]] && { rclone copy "$MEDIA_TAR" "$RCLONE_REMOTE/" --no-traverse || log "WARN: rclone médias a échoué"; }
  log "copie off-site → $RCLONE_REMOTE"
else
  [[ -z "$RCLONE_REMOTE" ]] && log "MARIENOUR_RCLONE_REMOTE non défini : pas de copie off-site (snapshots LOCAUX seulement)"
fi

# 4) Purge des archives locales > KEEP_DAYS.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'marienour-*.db' -o -name 'media-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete || true
log "purge des sauvegardes locales de plus de $KEEP_DAYS jours"
log "terminé ✓"
