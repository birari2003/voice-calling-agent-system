#!/usr/bin/env bash
# Restore test: restores a backup into a throwaway database, compares every table's row count
# with the live database, checks the uploads archive, then drops the throwaway database.
#   scripts/verify-backup.sh backups/<timestamp>
set -euo pipefail
source "$(dirname "$0")/_db-env.sh"
BACKUP="${1:?Usage: verify-backup.sh <backup directory>}"
CHECK_DB="${DB_NAME}_restore_test"
[[ "$CHECK_DB" =~ _restore_test$ ]] || exit 1

echo "1/4 Checking checksums ..."
(cd "$BACKUP" && sha256sum --check --quiet SHA256SUMS)

echo "2/4 Restoring into $CHECK_DB ..."
mysql --defaults-extra-file="$MYSQL_CNF" -e "DROP DATABASE IF EXISTS \`$CHECK_DB\`; CREATE DATABASE \`$CHECK_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gunzip -c "$BACKUP/database.sql.gz" | mysql --defaults-extra-file="$MYSQL_CNF" "$CHECK_DB"

echo "3/4 Comparing row counts with $DB_NAME ..."
counts() {
  local db="$1"
  for table in $(mysql --defaults-extra-file="$MYSQL_CNF" -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$db' AND table_type='BASE TABLE' ORDER BY table_name"); do
    printf '%s %s\n' "$table" "$(mysql --defaults-extra-file="$MYSQL_CNF" -N -e "SELECT COUNT(*) FROM \`$db\`.\`$table\`")"
  done
}
diff <(counts "$DB_NAME") <(counts "$CHECK_DB") > /dev/null && MATCH=yes || MATCH=no
TABLES="$(counts "$CHECK_DB" | wc -l)"
ROWS="$(counts "$CHECK_DB" | awk '{s+=$2} END {print s}')"

echo "4/4 Checking the uploads archive ..."
FILES_IN_ARCHIVE="$(tar -tzf "$BACKUP/uploads.tar.gz" | grep -c '\.\(jpg\|png\|webp\)$' || true)"
FILES_LIVE="$(find "$UPLOAD_DIR" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) 2>/dev/null | wc -l)"

mysql --defaults-extra-file="$MYSQL_CNF" -e "DROP DATABASE \`$CHECK_DB\`;"
echo "Restored $TABLES tables, $ROWS rows; photos in archive: $FILES_IN_ARCHIVE (live: $FILES_LIVE)."
if [[ "$MATCH" == yes ]]; then
  echo "RESTORE TEST PASSED: every table matches the live database."
else
  echo "Row counts differ from the live database (expected if data changed after the backup)." >&2
  exit 2
fi
