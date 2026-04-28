# Plan: ATHENA Alpha M&E Platform — Implementation

## Scope Decisions

- All three components included in Alpha: Express.js API + SvelteKit dashboard + native Android app
- OAuth providers must be registered externally before Phase 1 begins (Google GCP Console, Microsoft Azure AD)
- Deployment target: single VPS / bare metal server (Ubuntu 22.04 LTS) — PM2 + systemd, Nginx, no Docker in production
- CSV bulk entity import deferred to post-Alpha; entities created via Android registration forms only
- Docker used for local development only (`docker-compose.dev.yml`)

## TL;DR

Build the ATHENA M&E platform in nine sequential phases:

0. Foundation (monorepo, local dev environment, migrations, seed data, OpenAPI spec)
1. Backend — Auth & Organisation (OAuth OIDC, JWT middleware, org/user management)
2. Backend — Entities & Forms (identity registry API, XLSForm upload + Android distribution)
3. Backend — Ingestion & DQA (OpenRosa endpoint, 5-step quality pipeline, quarantine, conflicts, SSE)
4. Backend — Reporting & Indicators (ITT aggregation, reporting views, map data)
5. SvelteKit dashboard (all 9 modules)
6. Android app (offline-first, form engine, sync queue)
7. Integration testing (API, E2E, Android instrumented, longitudinal tracking)
8. VPS deployment (server provisioning, PM2, Nginx, Certbot, pg_dump cron)

---

## Phase 0 — Foundation & Tooling

1. Initialize monorepo with four workspaces:
   - `/api` — Express.js + TypeScript backend
   - `/web` — SvelteKit dashboard
   - `/android` — Android app (Kotlin)
   - `/database` — migration scripts and schema

2. Create `docker-compose.dev.yml` for **local development only** (not used in production):
   - `postgres`: `postgis/postgis:15-3.3` image, persistent named volume
   - `api`: volume-mounted source, hot reload via `nodemon`
   - `web`: volume-mounted source, SvelteKit dev server
   - No Nginx in dev — services communicate directly on localhost ports

3. Create root `.env.example` with all required keys:
   - `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRY`
   - `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`
   - `OAUTH_MICROSOFT_CLIENT_ID`, `OAUTH_MICROSOFT_CLIENT_SECRET`
   - `OAUTH_CALLBACK_URL`, `APP_BASE_URL`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

4. Set up `node-pg-migrate` in `/database`:
   - Split `documentation/database/schema.sql` into numbered migration files:
     `001_extensions.sql`, `002_admin_layer.sql`, `003_noun_layer.sql`, `004_form_registry.sql`,
     `005_verb_layer.sql`, `006_dqa.sql`, `007_results_framework.sql`, `008_notifications.sql`,
     `009_audit_log.sql`, `010_reporting_views.sql`
   - Add `npm run migrate:dev`, `npm run migrate:test`, `npm run migrate:prod` scripts

5. Create dev seed script (`/database/seeds/dev_seed.sql`):
   - One organisation, one admin user, one supervisor user, one enumerator user
   - Four entities (two `beneficiary`, one `household`, one `water_point`)
   - Two forms (`wash_sector/water_point_baseline`, `health_sector/clinic_visit`)
   - Sample submissions covering all `status` values; one quarantine entry; one conflict entry

6. Register OAuth providers (external prerequisite — document steps):
   - Google: GCP Console → APIs & Services → Credentials → OAuth 2.0 Client ID → redirect URI: `https://<domain>/auth/callback/google`
   - Microsoft: Azure AD → App Registrations → redirect URI: `https://<domain>/auth/callback/microsoft`

7. Produce OpenAPI 3.0 specification (`/api/openapi.yaml`):
   - All request bodies, response schemas, HTTP status codes for every module
   - Role annotations (`admin`, `supervisor`, `enumerator`) on every endpoint
   - Single source of truth for Android and SvelteKit teams

**Verification:** `docker compose -f docker-compose.dev.yml up` → `psql` confirms all tables, schemas, indexes, and views from `schema.sql` exist

---

## Phase 1 — Backend: Auth & Organisation

**Stack:** TypeScript, Express, `openid-client`, `jsonwebtoken`, `zod`, `pg`, `node-pg-migrate`, `multer`, `nodemailer`, `cors`, `helmet`, `pino`

**Step 8 — Express scaffold**
- `pg` connection pool via `DATABASE_URL`
- Global middleware: `helmet`, CORS, request logger (`pino`), global error handler
- `GET /health` → `{ status: 'ok', db: 'ok', uptime: number }` — checks pool connectivity

**Step 9 — AuthModule**
- `GET /auth/google`, `GET /auth/microsoft` — redirect to OIDC authorization URL (PKCE via `openid-client`)
- `GET /auth/callback/:provider` — exchange code, verify ID token, upsert user in `public.users`, issue internal JWT (role + org_id claims, 15min expiry), set HttpOnly cookie; redirect to dashboard
- `POST /auth/logout` — clear cookie, invalidate session
- `GET /auth/me` — return current user from JWT claims
- Middleware: `requireAuth(roles?: string[])` — validates HttpOnly JWT cookie, enforces role; returns `401` if absent/invalid, `403` if role insufficient

**Step 10 — OrganisationModule**
- `GET /org` — current org details (admin + supervisor)
- `PUT /org` — update org name/slug (admin only)
- `GET /org/users` — list all users with roles (admin only)
- `POST /org/users/invite` — create `is_active: false` user record, send email invite with OAuth login link (admin only)
- `PATCH /org/users/:id/role` — change role, write to `audit_log` (admin only)
- `DELETE /org/users/:id` — set `is_active: false`, write to `audit_log` (admin only)

**Verification:** OAuth login → JWT HttpOnly cookie set → `GET /auth/me` returns user; enumerator token returns `403` on `/org/users`

---

## Phase 2 — Backend: Entities & Forms

**Step 11 — EntitiesModule**
- `POST /entities` — register entity, write to `public.entities`, enforce uniqueness on `(org_id, entity_type, external_id)` (enumerator+)
- `GET /entities/:id` — single entity with metadata (supervisor+)
- `GET /entities` — paginated list, filterable by `entity_type`, `registered_after`, full-text `search` on metadata (supervisor+)
- `GET /entities/sync` — Android delta-sync: `?since=<ISO timestamp>` returns all entities created/updated after that timestamp (all roles)

**Step 12 — FormsModule**
- `POST /forms` — upload XLSForm XLSX via `multer`; parse with `xlsx` library; validate required sheets (`survey`, `choices`) and columns (`type`, `name`, `label`); return `422` with field-level errors on failure; write to `public.forms` + `public.form_versions` on success (admin only)
- `GET /forms` — list active forms grouped by `folder_schema`, with current version (supervisor+)
- `GET /forms/:id` — form detail including current `xlsform_json` definition (supervisor+)
- `GET /forms/:id/definition` — Android distribution endpoint; returns `xlsform_json` for current version (all roles)
- `POST /forms/:id/versions` — publish new version; classify as breaking or non-breaking per versioning decision (admin only)
- `DELETE /forms/:id` — set `is_active: false`; does not delete submissions (admin only)

**Verification:** XLSX upload rejects malformed file with `422`; `GET /forms/:id/definition` returns parseable `xlsform_json`; `GET /entities/sync?since=<ts>` returns only entities registered after that timestamp

---

## Phase 3 — Backend: Ingestion & DQA Pipeline

**Step 13 — IngestionModule (OpenRosa 1.0)**
- `HEAD /submission` — capability discovery, returns `X-OpenRosa-Version: 1.0`
- `POST /submission` — accepts `multipart/form-data` with chunked transfer encoding; extracts `xml_submission_file` (XLSForm metadata) and `payload` JSON; passes to DQA pipeline
- Returns `202 Accepted` on pass; `409 Conflict` on conflict detection; `422 Unprocessable` on validation failure with OpenRosa error envelope

**Step 14 — QualityModule — DQA pipeline (synchronous, runs before any write)**
1. **Schema validation** — verify payload conforms to `xlsform_json` field list for `form_id` + `form_version`; return `422` if required fields missing
2. **Freshness check** — if `(server_received_at − end_time) > 72h` → write to `quarantine_queue` (`failure_reason = 'freshness_violation'`); do not write to sector table
3. **Uniqueness check** — query sector table for existing row with same `entity_id` + `form_id` where `status != 'quarantined'`; if found → write to `quarantine_queue` (`failure_reason = 'duplicate_entity'`)
4. **Conflict detection** — if a submission for same `entity_id` + `form_id` has `start_time` within a 24-hour window → write canonical row to sector table; write branch to `submission_conflicts`; fire conflict notification; return `409`
5. **Pass** — `INSERT` into sector schema table with `status = 'pending'`; return `202`

**Step 15 — NotificationsModule**
- `GET /notifications/stream` — SSE endpoint; long-lived connection per authenticated user; pushes `quarantine_alert`, `conflict_detected`, `submission_approved` events
- `GET /notifications` — paginated notification feed (supervisor+)
- `PATCH /notifications/:id/read` — mark as read
- Internal `notify()` helper: writes to `public.notifications` + pushes to all active SSE connections for the org; called by QualityModule on every DQA event

**Step 16 — QuarantineModule**
- `GET /quarantine` — paginated list of unresolved entries, filterable by `failure_reason`, `form_id`, `enumerator_id` (supervisor+)
- `POST /quarantine/:id/resolve` — re-run payload through DQA pipeline; on pass write to sector table with `status = 'approved'`; mark resolved; write to `audit_log`
- `POST /quarantine/:id/reject` — permanently reject; mark resolved with `resolution_note`; write to `audit_log`

**Step 17 — ConflictsModule**
- `GET /conflicts` — list unresolved conflicts (supervisor+)
- `GET /conflicts/:id` — returns canonical submission + `branch_payload` for diff view
- `POST /conflicts/:id/resolve` — accepts `merge_strategy` (`accept_branch` / `keep_canonical` / `manual_merge`) + optional `merged_payload`; updates canonical row; marks resolved; writes to `audit_log`

**Verification:** Valid submission → sector table row `status = 'pending'`; `end_time` 96h ago → quarantine entry + SSE event; duplicate `entity_id` + `form_id` → quarantine; two submissions within 24h window → `submission_conflicts` row; quarantine resolve → `audit_log` entry

---

## Phase 4 — Backend: Reporting & Indicators

**Step 18 — IndicatorsModule**
- `POST /indicators` — create SMART indicator; validate `source_form_id`, `source_field_path`, `aggregation_fn` with zod (admin only)
- `GET /indicators` — list all indicators with latest computed actual (supervisor+)
- `GET /indicators/:id` — detail: baseline, target, all recorded actuals
- `POST /indicators/:id/compute` — execute aggregation SQL against reporting view for `source_form_id`, apply `filter_expression` and `aggregation_fn`; upsert into `indicator_actuals`; return computed value (admin only)
- `PUT /indicators/:id` — update target / reporting period dates (admin only)
- `DELETE /indicators/:id` — soft delete (admin only)

**Step 19 — ReportingModule**
- `GET /reporting/submissions` — paginated list across `folder_schema` + `form_key`; returns flattened data from sector reporting view; filters: `status`, `entity_id`, `enumerator_id`, `date_range` (supervisor+)
- `GET /reporting/submissions/:id` — full submission detail: raw `payload` + flattened view columns
- `GET /reporting/entities/:id/timeline` — all submissions for an entity across all forms in chronological order
- `GET /reporting/map` — returns `{ submission_id, entity_id, form_key, location, status }` with optional bounding box filter; feeds geospatial map
- `GET /reporting/summary` — org-level counts: total entities, submissions by status, quarantine backlog, open conflicts

**Verification:** `POST /indicators/:id/compute` returns value matching manual `SELECT` on reporting view; `GET /reporting/map` returns valid coordinates; `GET /reporting/entities/:id/timeline` returns submissions sorted by `start_time`

---

## Phase 5 — SvelteKit Dashboard

**Stack:** SvelteKit + `@sveltejs/adapter-node` (SSR), TypeScript, TailwindCSS, LayerCake (charts), MapLibre GL JS (maps)

**Step 20 — Scaffold & auth**
- `hooks.server.ts`: validate JWT HttpOnly cookie on every request; inject `event.locals.user`; redirect unauthenticated requests to `/login`
- `/login`: "Sign in with Google" / "Sign in with Microsoft" — redirects to `GET /auth/google` or `GET /auth/microsoft`
- `/logout`: calls `POST /auth/logout`, clears cookie, redirects to `/login`
- API client module (`/lib/api.ts`): typed `fetch` wrapper that forwards session cookie; handles `401` by redirecting to `/login`

**Step 21 — Layout & navigation**
- Root authenticated layout with sidebar; role-based nav items
- Notification bell in header: SSE connection to `GET /notifications/stream` on mount; live badge count update

**Step 22 — Home / Overview** (`/dashboard`)
- Server load: `GET /reporting/summary` + `GET /indicators`
- Org-level stats, quarantine backlog, open conflicts
- ITT progress bars (baseline → actual → target) per indicator

**Step 23 — Forms Manager** (`/dashboard/forms`)
- List forms grouped by sector folder; upload XLSX → `POST /forms`; show `422` validation errors inline; form detail with version history

**Step 24 — Submissions Browser** (`/dashboard/submissions`)
- Filterable table (sector, form, status, date, enumerator) from `GET /reporting/submissions`
- Row click → submission detail drawer: flattened columns + raw `payload` JSON viewer; entity link to timeline

**Step 25 — Quarantine Queue** (`/dashboard/quarantine`)
- List from `GET /quarantine`; SSE `quarantine_alert` events prepend new entries without page refresh
- Entry detail: `failure_reason`, `failure_detail`, raw payload; Resolve / Reject buttons

**Step 26 — Conflict Resolution** (`/dashboard/conflicts`)
- List + side-by-side diff of canonical vs `branch_payload` (highlight diverging keys)
- "Accept Branch" / "Keep Canonical" / "Manual Merge" (inline editor for `merged_payload`) → `POST /conflicts/:id/resolve`

**Step 27 — Entity Registry** (`/dashboard/entities`)
- Searchable paginated list; entity detail: baseline `metadata` + submission timeline from `GET /reporting/entities/:id/timeline`

**Step 28 — Geospatial Map** (`/dashboard/map`)
- MapLibre GL JS; points from `GET /reporting/map`; colour-coded by status; filter controls; point popups

**Step 29 — Indicator Tracking Table** (`/dashboard/indicators`)
- List with baseline / actual / target; create indicator form (admin); "Compute Actuals" button → `POST /indicators/:id/compute`

**Step 30 — User Management** (`/dashboard/users`) — admin only
- List users; invite form → `POST /org/users/invite`; role dropdown → `PATCH /org/users/:id/role`; deactivate button

**Verification:** OAuth login → cookie → protected route → logout cycle; SSE updates Quarantine Queue without refresh; enumerator token redirected from all dashboard routes; supervisor cannot reach `/dashboard/users`

---

## Phase 6 — Android Data Collection App

**Stack:** Kotlin, min SDK 26, Jetpack Compose, Android Room, Retrofit, Hilt, AppAuth, WorkManager, ML Kit

**Step 31 — Scaffold & local DB (Room)**
- `EntityRecord` table — populated from `GET /entities/sync`
- `FormDefinition` table — stores `xlsform_json` from `GET /forms/:id/definition`
- `SyncQueue` table — `id`, `payload` (JSON), `status` (`pending`/`sent`/`failed`), `retry_count`, `last_attempted_at`
- EAV `SubmissionDraft` table — `(draft_id, entity_id, form_id, attribute_key, attribute_value)`

**Step 32 — Auth**
- OAuth 2.0 PKCE via `AppAuth` library; provider selection screen
- Store JWT in `EncryptedSharedPreferences`; attach as `Authorization: Bearer` via Retrofit interceptor

**Step 33 — Entity sync**
- On app open: `GET /entities/sync?since=<last_sync_timestamp>` → upsert into local `EntityRecord` table

**Step 34 — Form engine**
- Download `xlsform_json` via `GET /forms/:id/definition`; parse into in-memory AST
- AST evaluator resolves `relevant` (skip logic) and `calculate` expressions on each answer change
- Render one question/screen via `HorizontalPager`; field type → widget mapping:
  `text`/`integer`/`decimal` → TextField; `select_one` → radio; `select_multiple` → checkbox;
  `geopoint` → `FusedLocationProviderClient`; `image` → camera intent; `barcode` → ML Kit;
  `date` → date picker; `repeat_group` → nested pager
- Auto-capture: `start` timestamp, `deviceid`, `simserial`, `phonenumber`; `end` timestamp on submit

**Step 35 — Entity lookup at survey start**
- Search local `EntityRecord` table; barcode scan for `external_id` lookup; display baseline `metadata` for verification before proceeding

**Step 36 — Sync engine**
- `SyncWorker` (WorkManager `PeriodicWorkRequest`, 15min interval on WiFi/unmetered)
- `202` → `status = 'sent'`; `4xx` → `status = 'failed'`; `5xx` / network error → increment `retry_count`, exponential backoff (`2^retry_count × 30s`, cap 4h)
- After successful sync: call `GET /entities/sync` to pull new entities

**Verification:** Full offline cycle (fill form → save to SyncQueue) works with no network; sync engine delivers queued payload and marks `sent`; AST evaluator correctly hides/shows fields per `relevant` expressions

---

## Phase 7 — Integration Testing

**Step 37 — API integration tests** (Jest + `supertest` + real test DB)
- Valid submission → sector table row with `status = 'pending'`
- `end_time` 96h ago → quarantine entry + SSE event emitted
- Duplicate `entity_id` + `form_id` → quarantine entry
- Two submissions within 24h window → `submission_conflicts` row + canonical row in sector table
- Quarantine resolve → sector table row + `audit_log` entry
- Conflict `manual_merge` → `merged_payload` written to canonical row
- Enumerator calling `GET /reporting/submissions` → `403`

**Step 38 — SvelteKit E2E tests** (Playwright)
- Login via OAuth mock → dashboard loads with ITT summary
- DQA failure triggered via API → entry appears in Quarantine Queue without page refresh
- Quarantine resolve → entry removed from list
- Conflict "Keep Canonical" → conflict marked resolved
- Admin creates indicator → computes actuals → value displayed in ITT

**Step 39 — Android tests**
- Unit: AST evaluator resolves skip logic correctly for sample XLSForm
- Unit: SyncQueue retry applies correct backoff intervals
- Instrumented: offline form → SyncQueue entry → API connection → `status = 'sent'`

**Step 40 — Longitudinal tracking E2E**
- Register entity via Android → baseline form → follow-up form → `GET /reporting/entities/:id/timeline` returns both submissions in chronological order, linked by `entity_id`

**Verification:** All API tests pass against a clean test DB; all Playwright flows pass; Android instrumented sync test passes against local API

---

## Phase 8 — Infrastructure & Deployment (VPS / Bare Metal)

**Target:** Ubuntu 22.04 LTS server; domain name pointed at server IP; no Docker in production

**Step 41 — Server hardening**
- Create non-root deploy user (`athena`); SSH key-only auth (`PermitRootLogin no`, `PasswordAuthentication no`)
- UFW: allow OpenSSH + `Nginx Full`; deny all else; API (3000) and web (3001) bound to `localhost` only

**Step 42 — Install system dependencies**
- PostgreSQL 15 + PostGIS 3: official PostgreSQL apt repo
- Node.js 20 LTS: NodeSource
- PM2 globally: `npm install -g pm2`
- Nginx: `apt install nginx`
- Certbot: `apt install certbot python3-certbot-nginx`

**Step 43 — Provision database**
- Create restricted role `athena_app` (no superuser); create `athena_db` owned by that role
- Enable extensions as `athena_app`; grant `CREATE` on database for sector schema creation
- `postgresql.conf`: `listen_addresses = 'localhost'`; `pg_hba.conf`: `md5` for `athena_app` local connections

**Step 44 — Deploy application code**
- Clone repo to `/srv/athena`; create `.env` from `.env.example` (mode `600`, owned by `athena`)
- `npm ci --omit=dev` (api); `npm ci && npm run build` (web); `npm run migrate:prod`

**Step 45 — PM2 process management**
- `ecosystem.config.js`: `athena-api` (./api/dist/server.js) + `athena-web` (./web/build/index.js), both with `env_file: '.env'`
- `pm2 start ecosystem.config.js && pm2 save`
- `pm2 startup systemd -u athena` — survive reboots

**Step 46 — Nginx reverse proxy**
- `/api/*` → `http://127.0.0.1:3000/`; `/*` → `http://127.0.0.1:3001`
- SSE: `proxy_buffering off; proxy_cache off` on `/notifications/stream`
- Rate limit on `POST /submission`: `limit_req_zone` 30r/m, burst 20

**Step 47 — TLS via Certbot**
- `certbot --nginx -d <domain>` — auto-configures HTTPS + HTTP redirect
- Verify renewal: `systemctl status certbot.timer`; test: `certbot renew --dry-run`

**Step 48 — Automated backups**
- `/srv/athena/scripts/backup.sh`: `pg_dump -Fc athena_db`; retain last 30 `.dump` files
- System cron (`crontab -u postgres`): `0 2 * * * /srv/athena/scripts/backup.sh`

**Step 49 — Deploy script** (`/srv/athena/scripts/deploy.sh`)
- `git pull → npm ci → npm run build → npm run migrate:prod → pm2 reload --update-env`

**Step 50 — Deployment runbook** (`/docs/deployment.md`)
- Initial provisioning (steps 41–48); applying updates (`deploy.sh`); checking service status (`pm2 status`, `systemctl status nginx/postgresql`); viewing logs (`pm2 logs`, `journalctl -u nginx`); restoring from backup (`pg_restore`); rolling back (`git checkout <tag>` + deploy); manual SSL renewal

**Verification:** HTTPS at production domain; PM2 processes survive reboot; `pg_dump` cron produces restorable archive; ports 3000/3001/5432 unreachable from public internet; `GET /health` returns `200`

---

## Relevant Files

| File | Role |
|---|---|
| `documentation/database/schema.sql` | Canonical DDL — split into migration files in Phase 0 |
| `documentation/implementation/plan.md` | Full implementation plan — authoritative reference for all phases |
| `documentation/Draft-Project-Specification.md` | Primary architecture reference |
| `documentation/database/reporting.md` | Reporting view patterns and GIN index strategy |
| `documentation/database/data.storage.md` | JSONB payload examples |
| `/api` | Express.js application (to be initialized in Phase 0) |
| `/web` | SvelteKit application (to be initialized in Phase 0) |
| `/android` | Android application (to be initialized in Phase 6) |
| `/database` | Migration scripts (to be initialized in Phase 0) |

---

## Verification Checklist

1. `docker compose -f docker-compose.dev.yml up` → all tables, schemas, views from `schema.sql` exist
2. `POST /auth/callback/:provider` → JWT HttpOnly cookie set; user row upserted in `public.users`
3. `POST /submission` with valid payload → row in sector table with `status = 'pending'`
4. `POST /submission` with `end_time` 96h ago → row in `quarantine_queue`; SSE event received on dashboard
5. `POST /submission` with duplicate `entity_id` + `form_id` → row in `quarantine_queue`
6. Two submissions same `entity_id` + `form_id` within 24h → `submission_conflicts` row + `409` response
7. `POST /indicators/:id/compute` → returned value matches manual `SELECT` on reporting view
8. `GET /reporting/map` → GPS coordinates render on MapLibre map
9. All protected routes return `401` without JWT; supervisor routes return `403` for enumerator token
10. VPS: HTTPS enforced; HTTP redirects to HTTPS; ports 3000/3001/5432 not reachable externally
11. Android: offline form completion → SyncQueue entry → sync delivers payload → `status = 'sent'`
12. Longitudinal: entity registered → baseline submission → follow-up submission → timeline returns both in order

---

## Decisions

- All three components (API, dashboard, Android) included in Alpha
- Android OpenRosa ingestion endpoint included even though Android app is Phase 6 — endpoint usable by any compliant client
- OAuth only (no local password auth); `password_hash` column not present in `public.users` (already removed in `schema.sql`)
- CSV entity bulk import deferred to post-Alpha; entities created via Android registration forms only
- Single-org Alpha; `org_id` retained in schema for future multi-tenancy extension
- SSE for real-time notifications (simpler than WebSocket for read-only server push)
- `node-pg-migrate` for migrations (Node.js-native, no Java dependency)
- Conflict detection window: 24 hours (`entity_id` + `form_id` overlap)
- Freshness violation threshold: 72 hours (`server_received_at − end_time`)
- Deployment: bare metal VPS — PM2 + systemd, Nginx reverse proxy, Certbot TLS; Docker for local dev only
- Alpha out of scope: Materialized Views, BI integrations, multi-tenancy, SMS notifications, Android tablet layouts, form builder UI
