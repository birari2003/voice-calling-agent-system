# Backend

Express 4 and TypeScript API using Sequelize 6 with MySQL 8. Start from the repository root with `npm run dev:backend` or `npm run dev`. The readiness endpoint is `GET /api/v1/health`.

Set up `backend/.env`, create the configured database in MySQL/phpMyAdmin, and start the local MySQL server. Then run `npm run db:migrate` and `npm run db:seed` from the repository root. Add schema changes through new Sequelize CLI migration files only.

## First administrator

Run `npm run db:seed:admin` from the repository root to create the local development Super Admin. The seeder is kept outside the normal seed directory and refuses to run when `NODE_ENV=production`. There is no public registration endpoint.

Sessions use random opaque identifiers stored as hashes in `auth_sessions`, expire after eight hours, and can be revoked at logout or password change. Mutating auth endpoints use a CSRF double-submit token. Login attempts are rate limited. See `openapi.yaml` for route contracts.

## Citizens

Citizen APIs are under `/api/v1/citizens` and require `citizens:read`, `citizens:manage`, `citizens:import`, or `citizens:export` permissions. Every query is restricted to the signed-in user's organization. Citizen import accepts CSV and XLSX files up to 5 MB and 5,000 rows; preview reports column mappings, invalid rows, and duplicates before import. Phone numbers must be valid Indian mobile numbers. Contact authorization requires a recorded consent source and never overrides opt-out.
