#!/usr/bin/env bash
# Backs up the MySQL database and uploaded complaint photos.
#   scripts/backup.sh                 -> backups/<timestamp>/
# Output: database.sql.gz, uploads.tar.gz, SHA256SUMS. Keeps the newest $BACKUP_KEEP (14).
set -euo pipefail
source "$(dirname "$0")/_db-env.sh"
[[ -n "$DB_NAME" ]] || { echo "DB_NAME is not set" >&2; exit 1; }

BACKUP_ROOT="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_ROOT/$STAMP"
mkdir -p "$TARGET"
chmod 700 "$BACKUP_ROOT" "$TARGET"

echo "Backing up database $DB_NAME ..."
# --single-transaction gives a consistent snapshot of InnoDB tables without locking them.
mysqldump --defaults-extra-file="$MYSQL_CNF" --single-transaction --routines --triggers \
  --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 "$DB_NAME" \
  | gzip -9 > "$TARGET/database.sql.gz"

echo "Backing up uploads from $UPLOAD_DIR ..."
if [[ -d "$UPLOAD_DIR" ]]; then
  tar -C "$UPLOAD_DIR" -czf "$TARGET/uploads.tar.gz" .
else
  tar -czf "$TARGET/uploads.tar.gz" --files-from /dev/null
fi

printf 'database=%s\ncreated_utc=%s\n' "$DB_NAME" "$STAMP" > "$TARGET/MANIFEST"
(cd "$TARGET" && sha256sum database.sql.gz uploads.tar.gz MANIFEST > SHA256SUMS)
chmod 600 "$TARGET"/*

KEEP="${BACKUP_KEEP:-14}"
mapfile -t OLD < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | sort -r | tail -n +"$((KEEP + 1))")
for dir in "${OLD[@]}"; do
  [[ "$dir" == "$BACKUP_ROOT"/20*Z ]] && rm -r -- "$dir"
done

echo "Backup written to $TARGET"
du -sh "$TARGET" | cut -f1 | xargs echo "Size:"
