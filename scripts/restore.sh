#!/usr/bin/env bash
# Restores a backup. Refuses to overwrite an existing database unless --replace is given.
#   scripts/restore.sh backups/<timestamp> [--database NAME] [--replace]
# Stop the API first so nothing writes during the restore.
set -euo pipefail
source "$(dirname "$0")/_db-env.sh"
BACKUP="${1:?Usage: restore.sh <backup directory> [--database NAME] [--replace]}"; shift
TARGET_DB="$DB_NAME"; REPLACE=no
while [[ $# -gt 0 ]]; do
  case "$1" in
    --database) TARGET_DB="$2"; shift 2 ;;
    --replace) REPLACE=yes; shift ;;
    *) echo "Unknown option $1" >&2; exit 1 ;;
  esac
done

(cd "$BACKUP" && sha256sum --check --quiet SHA256SUMS)
EXISTS="$(mysql --defaults-extra-file="$MYSQL_CNF" -N -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$TARGET_DB'")"
if [[ "$EXISTS" != 0 && "$REPLACE" != yes ]]; then
  echo "Database $TARGET_DB exists. Re-run with --replace to overwrite it (take a fresh backup first)." >&2
  exit 1
fi
mysql --defaults-extra-file="$MYSQL_CNF" -e "DROP DATABASE IF EXISTS \`$TARGET_DB\`; CREATE DATABASE \`$TARGET_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gunzip -c "$BACKUP/database.sql.gz" | mysql --defaults-extra-file="$MYSQL_CNF" "$TARGET_DB"
echo "Database restored into $TARGET_DB."

if [[ "$TARGET_DB" == "$DB_NAME" ]]; then
  mkdir -p "$UPLOAD_DIR"
  tar -C "$UPLOAD_DIR" -xzf "$BACKUP/uploads.tar.gz"
  echo "Uploads restored into $UPLOAD_DIR."
fi
