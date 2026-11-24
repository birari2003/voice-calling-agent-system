#!/usr/bin/env bash
# Shared helper: loads database settings from backend/.env (without executing the file) and
# writes a private MySQL client config so the password never appears on a command line.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env}"

read_env() {
  local key="$1" default="${2:-}"
  local value="${!key:-}"
  if [[ -z "$value" && -f "$ENV_FILE" ]]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
    value="${value%\"}"; value="${value#\"}"
  fi
  printf '%s' "${value:-$default}"
}

DB_HOST="$(read_env DB_HOST 127.0.0.1)"
DB_PORT="$(read_env DB_PORT 3306)"
DB_NAME="$(read_env DB_NAME)"
DB_USER="$(read_env DB_USER)"
DB_PASSWORD="$(read_env DB_PASSWORD)"
UPLOAD_DIR_RAW="$(read_env UPLOAD_DIR ./storage/uploads)"
case "$UPLOAD_DIR_RAW" in
  /*) UPLOAD_DIR="$UPLOAD_DIR_RAW" ;;
  *) UPLOAD_DIR="$ROOT/backend/${UPLOAD_DIR_RAW#./}" ;;
esac

MYSQL_CNF="$(mktemp)"
chmod 600 "$MYSQL_CNF"
trap 'rm -f "$MYSQL_CNF"' EXIT
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' \
  "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" > "$MYSQL_CNF"
