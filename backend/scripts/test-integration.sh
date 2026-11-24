#!/usr/bin/env bash
# Runs the API integration suite against a throwaway database (default: nagar_seva_test).
# Uses the DB host and credentials from backend/.env; the database itself is dropped and
# recreated on every run, so it must be dedicated to tests (its name must end in _test).
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV=test
export DB_NAME="${TEST_DB_NAME:-nagar_seva_test}"
export UPLOAD_DIR=./storage/test-uploads
# Point the speech service at a closed port so tests never depend on it.
export AI_SERVICE_URL=http://127.0.0.1:9
export AI_SERVICE_TIMEOUT_MS=2000
npx tsx test/integration/prepare.ts
node --import tsx --test --test-concurrency=1 test/integration/*.test.ts
