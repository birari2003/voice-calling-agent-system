# NagarSeva operations runbook

For the team that installs, runs and looks after NagarSeva. Development setup is in the
main [README](../README.md).

## 1. Components

| Component       | What it does                                         | Port (internal) | Required                          |
| --------------- | ---------------------------------------------------- | --------------- | --------------------------------- |
| MySQL 8         | All records (citizens, complaints, sessions, audit)  | 3306            | Yes                               |
| API (Node)      | Business rules, authentication, file access          | 5000            | Yes                               |
| Web (Caddy)     | Serves the dashboard, HTTPS, forwards `/api`         | 443 / 80        | Yes                               |
| Speech (Python) | Speech-to-text and text-to-speech for voice sessions | 8001            | No: text sessions work without it |

Uploaded photos are stored on disk (`UPLOAD_DIR`), not in the database. Back up both.

## 2. Staging deployment (Docker)

Docker must be usable by the deploying account (`sudo`, or membership of the `docker` group).

```bash
cp deploy/staging.env.example deploy/staging.env   # edit every value; this file is gitignored
openssl rand -hex 24                               # use for AI_SERVICE_TOKEN
docker compose -f docker-compose.staging.yml --env-file deploy/staging.env up -d --build
docker compose -f docker-compose.staging.yml --env-file deploy/staging.env ps
```

- Open `PUBLIC_URL` (default `https://localhost:8443`). For `localhost`, Caddy issues a
  self-signed certificate, so the browser warns once. For a real domain, set `SITE_ADDRESS` and
  `PUBLIC_URL` to it and Caddy obtains a Let's Encrypt certificate (ports 80/443 must be reachable).
- The `migrate` job applies migrations and seeders, and creates the first Super Admin from
  `ADMIN_EMAIL` / `ADMIN_PASSWORD`. It is safe to re-run.
- Only the web service publishes ports. The database, API and speech service are internal.
- The first spoken reply downloads about 850 MB of speech models into the `speech-models` volume.
  Set `PRELOAD_MODELS=true` to do this at startup instead. The speech service needs about 2.5 GB RAM.

### The API refuses to start in production when…

These are intentional safety checks (`backend/src/startupChecks.ts`). The log lists each problem:

- `AI_SERVICE_TOKEN` is missing or shorter than 24 characters;
- `CORS_ORIGIN` or `APP_URL` is not `https://`;
- the local development account `admin@nagar-seva.local` still has its default password.

### Updating

```bash
scripts/backup.sh                                   # always back up first
git pull
docker compose -f docker-compose.staging.yml --env-file deploy/staging.env up -d --build
```

Migrations run automatically through the `migrate` job before the API starts.

## 3. Health and monitoring

| Check                     | Meaning                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live` | The API process is running (use for liveness probes)                                                            |
| `GET /api/v1/health`      | Readiness: `database` and `storage` must be `ok` (HTTP 503 otherwise). `speechService` is reported but optional |

Logs are JSON lines on stdout/stderr (`docker compose logs backend`). Each request has one
`request` line with `requestId`, method, path, status, duration and user ID. Errors:

- every response has an `X-Request-Id` header, and every error response includes `reference`
  (the same ID). When a user reports a problem, ask for the reference and search the logs for it;
- `level: "error"` lines are server faults that need attention. `level: "warn"` lines are
  rejected client requests (bad input, oversized uploads);
- logs never contain passwords, session or upload-link tokens (they are redacted from paths),
  audio, or citizen phone numbers. Stack traces appear only outside production.

Suggested alerts: readiness failing for 2 minutes; more than 5 `error` lines in 5 minutes;
`speech service error` lines (voice sessions degraded); disk usage of the uploads and MySQL volumes.

## 4. Backups and restore

```bash
scripts/backup.sh                          # -> backups/<UTC timestamp>/
scripts/verify-backup.sh backups/<stamp>   # restore test into a throwaway database
scripts/restore.sh backups/<stamp> --replace   # real restore (stop the API first)
```

- A backup contains `database.sql.gz` (a consistent `mysqldump --single-transaction`),
  `uploads.tar.gz` (all photos) and `SHA256SUMS`. The newest 14 are kept (`BACKUP_KEEP`).
- Backups contain personal data. They are created owner-only (700/600); store copies off the
  server, encrypted.
- `verify-backup.sh` restores into `<db>_restore_test`, compares every table's row count with the
  live database, checks the photo archive, then drops the copy. **Run it after every backup
  schedule change and at least monthly.** Last verified on 21 Nov 2026: 20 tables, 565 rows and
  10 photos matched.
- `restore.sh` refuses to overwrite an existing database without `--replace`.
- The scripts read database settings from `backend/.env`; override with environment variables
  (`DB_HOST`, `DB_NAME`, …) or `ENV_FILE`. With Docker, run them on the host against the MySQL
  container, or use `docker compose exec mysql mysqldump …`.

Suggested schedule: daily backup via cron (`0 1 * * * /path/scripts/backup.sh`), weekly
`verify-backup.sh`, and an off-server copy.

## 5. Tests

| Command                                        | What it covers                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test --workspace backend`                 | Unit tests: dialogue engine, speech gate, eligibility, CSV                                                                                                     |
| `npm run test:integration --workspace backend` | API suite on a throwaway `nagar_seva_test` database: the 14-step acceptance scenario, organization isolation, role permissions, CSRF, idempotency, rate limits |
| `npm run test:e2e`                             | Browser suite (installed Google Chrome): acceptance scenario in the UI, WCAG 2.1 AA scans of every page, phone-width layout                                    |
| `npm run test:ai`                              | Speech service API tests                                                                                                                                       |
| `npm test`                                     | Backend unit + integration + browser suites                                                                                                                    |

The integration and browser suites drop and recreate `nagar_seva_test` (any name ending in
`_test`, set with `TEST_DB_NAME`) and use their own ports (5056/5175). They never touch the
development database.

## 6. Common tasks

- **Rotate the speech-service token:** set a new `AI_SERVICE_TOKEN` in the env file and restart
  `backend` and `ai-service` together.
- **A user is locked out of sign-in:** failed sign-ins are limited to 10 per 15 minutes per client
  address. Wait, or restart the API (limits are in memory).
- **Deactivate a staff member:** set `is_active = 0` on their user. Their sessions stop working at
  the next request.
- **Citizen opts out:** edit the citizen and tick opted out. They are excluded from campaigns
  immediately, including campaigns already running.
