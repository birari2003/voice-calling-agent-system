# Security review: Phase 8

Review date: 21 November 2026. Scope: backend API, dashboard, speech service, deployment
configuration and dependencies. This is an engineering review, not a penetration test or a
legal/compliance assessment; the blueprint requires review by the municipal authority and
qualified compliance staff before real-citizen use.

## Summary

No issue found allows one organization to read another's data, bypasses role permissions, or
lets an unauthenticated user reach personal data. Nine weaknesses were found and fixed. Three
dependency advisories remain, with documented reasons. Every fix below is covered by an
automated test in `backend/test/integration/security.test.ts` unless noted.

## Verified controls

| Area                   | Control                                                                                                                                                                                                        | Evidence                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Organization isolation | Every query is scoped to the user's organization; IDs from another organization return 404                                                                                                                     | Integration test: 7 record types, reads and writes |
| Role permissions       | Auditor read-only; Operator sees only assigned complaints, no campaigns/reports/sessions                                                                                                                       | Integration tests                                  |
| Authentication         | bcrypt (cost 12); session tokens stored as SHA-256 hashes; 8-hour expiry; HttpOnly, Secure (production), SameSite=Lax cookies; password change ends all sessions; deactivated users and organizations rejected | Code review, production smoke test                 |
| CSRF                   | Double-submit token compared in constant time, plus Origin allow-list                                                                                                                                          | Integration test                                   |
| Input validation       | zod schemas at every endpoint; 1 MB JSON limit; strict objects                                                                                                                                                 | Code review, tests                                 |
| Uploads                | Type checked by file signature plus MIME and extension; random storage names; path-traversal-proof storage keys; served with a sandboxing CSP; audit logged                                                    | Unit and integration tests (Phase 6)               |
| Citizen upload links   | 256-bit tokens, only SHA-256 stored, expiry, upload limit, revocation, uniform "not available" answer, rate limited                                                                                            | Phase 6 tests                                      |
| SQL injection          | ORM parameter binding throughout; one SQL literal uses a startup-validated UTC offset                                                                                                                          | Code review                                        |
| XSS                    | React escaping; no `innerHTML`; API sends `nosniff`; CSP at the web front                                                                                                                                      | Code review                                        |
| Exports                | Same scope as the user's reports; no citizen contact data; formula neutralisation; audited                                                                                                                     | Phase 7 tests                                      |
| AI safety              | Complaints only after an explicit "yes" to the read-back; no recognizer biasing; unreliable speech rejected                                                                                                    | Unit and integration tests                         |

## Findings fixed in Phase 8

| #   | Severity | Finding                                                                                                              | Fix                                                                                                                      |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | High     | `zod` advisory GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized collections)                                      | Upgraded to zod 4.6.7; all tests pass                                                                                    |
| 2   | Medium   | Sign-in revealed which emails have accounts (unknown emails skipped bcrypt and answered faster)                      | A dummy bcrypt comparison runs for unknown emails; identical responses (tested)                                          |
| 3   | Medium   | Speech, export, import and upload endpoints had no rate limit (CPU/disk exhaustion by one account)                   | Per-user limits: speech 60/150 per 5 min, exports 20 per 15 min, imports 30 per 15 min, photo uploads 60 per 15 min      |
| 4   | Medium   | Behind a proxy, all clients would share one rate-limit bucket                                                        | `TRUST_PROXY` setting (1 in staging)                                                                                     |
| 5   | Medium   | Production could start with development defaults (known admin password, no speech-service token, HTTP origins)       | Startup refuses and lists each problem (verified against the dev database)                                               |
| 6   | Medium   | Successful sign-ins counted toward the login limit, so ten colleagues behind one office IP would lock each other out | Only failed sign-ins count (tested)                                                                                      |
| 7   | Low      | Malformed JSON and oversized bodies returned 500                                                                     | 400 `INVALID_JSON` / 413 `BODY_TOO_LARGE` (tested)                                                                       |
| 8   | Low      | Errors logged without detail, so incidents could not be investigated; no correlation IDs                             | Structured JSON logs, request IDs in the `X-Request-Id` header and in error responses; tokens redacted from logged paths |
| 9   | Low      | Every duplicate-record error claimed a duplicate citizen phone number                                                | Generic duplicate message                                                                                                |

Also fixed: the readiness endpoint `/api/v1/health` returned 404 since Phase 0 (routing bug).
It now checks the database, storage and speech service.

## Accepted risks

| Item                                                                                                                                          | Why accepted                                                                                                                                                                                                                                              | Revisit                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `uuid` < 11.1.1 (moderate, via `sequelize` and `exceljs`)                                                                                     | Affects only `v3/v5/v6` called with a caller-supplied buffer; neither library nor this project does that. The suggested fix downgrades `exceljs` to an old major                                                                                          | When `sequelize`/`exceljs` release updates                                                                     |
| Python `filelock` 4.1.0 (several CVEs) in the local `.venv`                                                                                   | Used only to lock the local model download cache; no untrusted input. The fixed release needs Python 3.11+                                                                                                                                                | The Docker image uses Python 3.11 and installs `filelock>=4.2.1`; upgrade local Python to match                |
| MMS-TTS speech model licence (CC-BY-NC-4.0)                                                                                                   | Non-commercial: acceptable for testing only                                                                                                                                                                                                               | Replace before production (Indic-Parler-TTS, Apache-2.0)                                                       |
| Optional ElevenLabs speech-to-text and voice (`STT_PROVIDER` / `TTS_PROVIDER=elevenlabs`) send citizen audio and assistant text to ElevenLabs | Chosen for speed and accuracy on CPU-only hardware. The key lives only in the gitignored `ai-service/.env`, never reaches the browser and never appears in logs. Local fallback is on. India data residency and zero-retention exist for enterprise plans | Municipal approval; consider the India residency endpoint; rotate the key that was shared in chat during setup |
| Optional cloud speech-to-text (Sarvam AI, `STT_PROVIDER=sarvam`) sends citizen audio to a third party                                         | Off by default; adopted for speed and accuracy on CPU-only hardware. NagarSeva stores no audio, the studio shows when cloud transcription is active, and the API key stays server-side. Sarvam's documentation does not state retention or residency      | Get municipal approval and Sarvam's data-processing terms before real-citizen use                              |
| Photo EXIF metadata (for example GPS) is kept                                                                                                 | Staff-only access; may help verify location                                                                                                                                                                                                               | Decide a policy with the municipality; stripping needs an image library                                        |
| Login rate limits are in memory                                                                                                               | Resets on restart; fine for one API instance                                                                                                                                                                                                              | Use a shared store (Redis) before running several API instances                                                |
| Development `.env` uses the MySQL root account                                                                                                | Local only                                                                                                                                                                                                                                                | Staging/production use a dedicated application user (Docker setup does)                                        |

## Not covered

No penetration test or load test was run. Real phone calls and WhatsApp are not implemented.
The data retention period, the legal basis for contacting citizens, and DLT/TRAI requirements
must be settled with the municipal authority (blueprint section 16).
