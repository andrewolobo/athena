# ATHENA — Implementation Plan

**Platform:** Self-hosted M&E platform  
**Components:** Express.js/PostgreSQL backend · SvelteKit dashboard · Native Android app  
**Release target:** Alpha (single organisation, single deployment)

---

## Current State

| Artefact | Status |
|---|---|
| Draft Project Specification | Complete |
| Database schema (`schema.sql`) | Complete |
| Implementation specification (`specifcation.md`) | Complete |
| Codebase | Not started |

---

## Resolved Decisions

These decisions must be locked before any code is written. Record the outcome here and do not revisit during Alpha.

| Decision | Resolution |
|---|---|
| Frontend framework | SvelteKit with `@sveltejs/adapter-node` (SSR mode) |
| Auth token storage | HttpOnly cookie set by Express after OAuth callback; SvelteKit server load functions forward cookie to API |
| Database migrations | `node-pg-migrate` — keeps toolchain in Node.js; migrations run as a pre-start script on the server |
| Form versioning | Non-breaking changes (label edits, new optional fields) increment minor version only. Breaking changes (renamed/removed fields) require a new `form_key`, creating a distinct form entry. Reporting views are version-scoped. |
| Entity bulk import | Out of scope for Alpha. Entities are created exclusively via Android registration forms. |
| Conflict detection window | Two submissions sharing `entity_id` + `form_id` within a 24-hour window are flagged as a conflict. |
| Notification delivery | In-app only via Server-Sent Events (SSE). Email (nodemailer) for quarantine alerts. No SMS, no Android push. |
| Input validation library | `zod` — used on both Express API boundaries and SvelteKit server actions |
| SQL query layer | `pg` (node-postgres) with parameterised queries only. No ORM. |
| Server topology | Single VPS/bare metal server running Ubuntu 22.04 LTS. Services: PostgreSQL 15 (system service) · API process (PM2) · SvelteKit web process (PM2) · Nginx (reverse proxy + TLS termination). Docker is used for local development only. |

---

## Phase Dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 (Dashboard) ──┐
                              │                                                        ├──► Phase 7 ──► Phase 8
                              └──────────────────────────────────► Phase 6 (Android) ─┘
```

Phase 5 (Dashboard) requires all backend phases (1–4). Phase 6 (Android) only requires Phase 2 (entities and form endpoints) and can start earlier. Both must complete before Phase 7 (Integration Testing).

---

## Phase 0 — Project Foundation

**Goal:** Establish the repository structure, local development environment, and the API contract that all three components build against.

**Prerequisites:** Resolved Decisions table above is complete.

### Steps

1. Initialise monorepo with three workspaces:
   - `/api` — Express.js backend
   - `/web` — SvelteKit dashboard
   - `/android` — Android app
   - `/database` — migration scripts and schema

2. Create `docker-compose.dev.yml` for local development only (not used in production):
   - `postgres` service using `postgis/postgis:15-3.3` image
   - `api` service with volume mount for hot reload (`nodemon`)
   - `web` service with volume mount for SvelteKit dev server
   - No Nginx in dev — services communicate directly on localhost ports

3. Add `.env.example` documenting all required environment variables:
   - `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRY`
   - `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`
   - `OAUTH_MICROSOFT_CLIENT_ID`, `OAUTH_MICROSOFT_CLIENT_SECRET`
   - `OAUTH_CALLBACK_URL`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
   - `APP_BASE_URL`

4. Set up `node-pg-migrate` in `/database`:
   - Configure migration runner script
   - Convert `schema.sql` into numbered migration files (`001_extensions.sql`, `002_admin_layer.sql`, `003_noun_layer.sql`, `004_form_registry.sql`, `005_verb_layer.sql`, `006_dqa.sql`, `007_results_framework.sql`, `008_notifications.sql`, `009_audit_log.sql`, `010_reporting_views.sql`)
   - Add `npm run migrate:dev` and `npm run migrate:test` scripts

5. Create database seed script (`/database/seeds/dev_seed.sql`):
   - One organisation record
   - One admin user, one supervisor user, one enumerator user
   - Four sample entities (two `beneficiary`, one `household`, one `water_point`)
   - Two sample forms (`wash_sector / water_point_baseline`, `health_sector / clinic_visit`)
   - Sample submissions covering all `status` values (`pending`, `approved`, `quarantined`, `flagged`)
   - One quarantine queue entry, one conflict entry

6. Produce the OpenAPI 3.0 specification (`/api/openapi.yaml`):
   - Define all request bodies, response schemas, and HTTP status codes for every module (Auth, Org, Forms, Ingestion, Entities, Quality, Indicators, Reporting, Notifications)
   - Mark which endpoints require `admin`, `supervisor`, or `enumerator` role
   - This file is the single source of truth that the Android and SvelteKit teams build against

**Deliverables:**
- Monorepo with three workspace scaffolds
- `docker-compose.dev.yml` that brings up a working local stack with `docker compose up`
- Migration files that reproduce `schema.sql` from scratch on a clean database
- Dev seed data loadable via `npm run seed:dev`
- `openapi.yaml` covering all API surfaces

---

## Phase 1 — Backend: Auth & Organisation

**Goal:** A running Express server with working OAuth login and role-enforced middleware. Every subsequent phase builds on top of this.

**Prerequisites:** Phase 0 complete. OAuth app registered with Google and Microsoft. `.env` populated.

### Steps

7. Scaffold Express application (`/api`):
   - TypeScript with `ts-node` / `esbuild`
   - `pg` connection pool with `DATABASE_URL`
   - Structured request logging (`pino`)
   - Global error handler middleware
   - `GET /health` endpoint returning `{ status: 'ok', db: 'ok' }` — checks pool connectivity

8. Implement `AuthModule`:
   - OAuth 2.0 / OIDC flow using `openid-client` (PKCE)
   - `GET /auth/google` and `GET /auth/microsoft` — redirect to provider
   - `GET /auth/callback/:provider` — handle redirect, verify ID token, upsert user in `public.users`, issue internal JWT, set HttpOnly cookie
   - `POST /auth/logout` — clear cookie, invalidate server-side session record
   - `GET /auth/me` — return current user from JWT claims

9. Implement JWT middleware:
   - Extract JWT from HttpOnly cookie on every request
   - Validate signature, expiry, and `org_id` + `role` claims
   - Attach `req.user` for downstream handlers
   - Return `401` if token is absent or invalid; `403` if role is insufficient

10. Implement `OrganisationModule`:
    - `GET /org` — return the single organisation record (admin + supervisor)
    - `GET /org/users` — list all users with roles (admin only)
    - `POST /org/users/invite` — create a user record with `is_active: false`; send invite email with OAuth login link (admin only)
    - `PATCH /org/users/:id/role` — update role; writes to `audit_log` (admin only)
    - `DELETE /org/users/:id` — set `is_active: false`; does not delete (admin only)

**Deliverables:**
- OAuth login flow working end-to-end in local dev
- `GET /health` returning `200` with DB connectivity check
- All `/org` endpoints tested against the OpenAPI spec
- Role middleware blocking requests at the correct permission boundary

---

## Phase 2 — Backend: Entities & Forms

**Goal:** The Noun and Form registry APIs. These are the foundational read/write surfaces that both the Android app and the dashboard depend on.

**Prerequisites:** Phase 1 complete.

### Steps

11. Implement `EntitiesModule`:
    - `POST /entities` — register a new entity; generates UUID, writes to `public.entities`; enforces uniqueness on `(org_id, entity_type, external_id)` (enumerator + above)
    - `GET /entities/:id` — fetch a single entity with its metadata (supervisor + above)
    - `GET /entities` — paginated list with filters: `entity_type`, `registered_after`, `search` (metadata full-text) (supervisor + above)
    - `GET /entities/sync` — delta-sync endpoint for Android: accepts `?since=<ISO timestamp>`, returns all entities created or updated after that timestamp; used to keep the local Android entity table current

12. Implement `FormsModule`:
    - `POST /forms` — upload XLSForm XLSX; parse and validate structure (required sheets: `survey`, `choices`; required columns: `type`, `name`, `label`); on validation failure return `422` with field-level errors; on success write to `public.forms` + `public.form_versions` (admin only)
    - `GET /forms` — list all active forms with current version, grouped by `folder_schema` (supervisor + above)
    - `GET /forms/:id` — form detail including current `xlsform_json` definition (supervisor + above)
    - `GET /forms/:id/definition` — the Android distribution endpoint; returns `xlsform_json` for the current version; Android clients call this to download form definitions for offline use (all roles)
    - `POST /forms/:id/versions` — publish a new version; classifies change as breaking or non-breaking per the form versioning decision (admin only)
    - `DELETE /forms/:id` — set `is_active: false`; does not delete submissions (admin only)

**Deliverables:**
- All entity and form endpoints returning correct responses against OpenAPI spec
- XLSForm XLSX upload rejecting malformed files with clear error messages
- Android `GET /entities/sync` and `GET /forms/:id/definition` endpoints verified

---

## Phase 3 — Backend: Ingestion & DQA Pipeline

**Goal:** The OpenRosa-compliant ingestion endpoint and the automated data quality pipeline. This is the most critical backend module — data integrity depends on it.

**Prerequisites:** Phase 2 complete.

### Steps

13. Implement `IngestionModule` (OpenRosa 1.0):
    - `POST /submissions` — accepts `multipart/form-data` with chunked transfer encoding; extracts `xml_submission_file` part containing XLSForm metadata and a `payload` JSON part containing survey answers
    - Parse and extract mandatory metadata: `entity_id`, `form_id`, `form_version`, `enumerator_id`, `device_id`, `start_time`, `end_time`, `location`
    - Returns `202 Accepted` per item in a batch sync; `409 Conflict` if a conflict is detected; `422 Unprocessable` if payload structure is invalid

14. Implement `QualityModule` — DQA pipeline runs synchronously before any write:
    - **Step 1 — Schema validation:** Verify payload conforms to the `xlsform_json` field list for the specified `form_id` + `form_version`. Return `422` if required fields are missing.
    - **Step 2 — Freshness check:** If `(server_received_at - end_time) > 72 hours`, flag as `freshness_violation`. Write to `quarantine_queue`; do not write to sector table.
    - **Step 3 — Uniqueness check:** Query the target sector table for an existing row with the same `entity_id` + `form_id`. If found and `status != 'quarantined'`, flag as `duplicate_entity`. Write to `quarantine_queue`.
    - **Step 4 — Conflict detection:** If a submission for the same `entity_id` + `form_id` exists with a `start_time` within a 24-hour window of the incoming submission, route to `submission_conflicts`; write canonical row to sector table; fire conflict notification.
    - **Step 5 — Pass:** Write to the correct sector schema submission table with `status = 'pending'`.

15. Implement `NotificationsModule`:
    - `GET /notifications/stream` — SSE endpoint; supervisor and admin clients connect on page load and keep the connection open. Emits events for: `quarantine_alert`, `conflict_detected`, `submission_approved`.
    - `GET /notifications` — paginated list of all notifications for the current user (supervisor + above)
    - `PATCH /notifications/:id/read` — mark a notification as read
    - Internal `notify()` helper called by QualityModule and IngestionModule after any DQA event; writes to `public.notifications` and pushes to all active SSE connections for the org

16. Implement `QuarantineModule`:
    - `GET /quarantine` — paginated list of unresolved quarantine entries, filterable by `failure_reason`, `form_id`, `enumerator_id` (supervisor + above)
    - `POST /quarantine/:id/resolve` — supervisor reviews and approves: re-runs payload through the DQA pipeline; on pass, writes to the sector table with `status = 'approved'`; marks quarantine entry as resolved; writes to `audit_log`
    - `POST /quarantine/:id/reject` — supervisor permanently rejects; marks resolved with `resolution_note`; writes to `audit_log`

17. Implement `ConflictsModule`:
    - `GET /conflicts` — list of unresolved conflicts (supervisor + above)
    - `GET /conflicts/:id` — returns both the canonical submission and `branch_payload` side-by-side for the merge UI
    - `POST /conflicts/:id/resolve` — accepts `merge_strategy` (`accept_branch`, `keep_canonical`, `manual_merge`) and optional `merged_payload`; updates the canonical row in the sector table; marks conflict resolved; writes to `audit_log`

**Deliverables:**
- End-to-end ingestion test: submit a valid payload → appears in sector table with `status = 'pending'`
- End-to-end DQA tests: freshness violation → quarantine; duplicate → quarantine; conflict → `submission_conflicts`
- SSE stream emitting events to a connected client when a quarantine entry is created
- All quarantine resolve/reject and conflict merge flows writing to `audit_log`

---

## Phase 4 — Backend: Reporting & Indicators

**Goal:** The indicator tracking and reporting APIs that feed the dashboard's overview and ITT modules.

**Prerequisites:** Phase 3 complete. Sector tables populated with seed submissions.

### Steps

18. Implement `IndicatorsModule`:
    - `POST /indicators` — create a SMART indicator; validates `source_form_id`, `source_field_path`, and `aggregation_fn` (admin only)
    - `GET /indicators` — list all indicators with latest actual value if computed (supervisor + above)
    - `GET /indicators/:id` — detail view including baseline, target, all recorded actuals
    - `POST /indicators/:id/compute` — on-demand aggregation: executes SQL against the reporting view for `source_form_id`, applying `filter_expression` and `aggregation_fn`; writes result to `indicator_actuals`; returns computed value (admin only)
    - `DELETE /indicators/:id` — soft delete (admin only)

19. Implement `ReportingModule`:
    - `GET /reporting/submissions` — paginated, filterable list of submissions across a given `folder_schema` and `form_key`; returns flattened data from the sector reporting view (e.g., `wash_sector.vw_water_point_summary`). Filters: `status`, `entity_id`, `enumerator_id`, `date_range` (supervisor + above)
    - `GET /reporting/submissions/:id` — full submission detail including raw `payload` and flattened view columns
    - `GET /reporting/entities/:id/timeline` — all submissions for a given entity across all forms in chronological order; uses `vw_entity_wash_timeline` pattern (supervisor + above)
    - `GET /reporting/map` — returns `{ submission_id, entity_id, form_key, location, status }` for all submissions within an optional bounding box; feeds the geospatial map (supervisor + above)
    - `GET /reporting/summary` — org-level counts: total entities, submissions by status, quarantine backlog, open conflicts (supervisor + above)

**Deliverables:**
- ITT compute endpoint producing correct aggregate values against seed data
- Reporting endpoints returning flattened JSONB data using the views defined in `schema.sql`
- Map endpoint returning valid GeoJSON-compatible location objects

---

## Phase 5 — SvelteKit Dashboard

**Goal:** The full management dashboard. All data flows through the API; SvelteKit server load functions handle API calls server-side using the session cookie.

**Prerequisites:** Phases 1–4 complete. `openapi.yaml` finalised.

### Steps

20. Scaffold SvelteKit project (`/web`):
    - `@sveltejs/adapter-node` (SSR mode)
    - TypeScript
    - TailwindCSS for utility styling
    - API client module (`/lib/api.ts`) — typed wrapper around `fetch` that forwards the session cookie and handles `401` by redirecting to login

21. Implement authentication flow:
    - `/login` — shows "Sign in with Google" / "Sign in with Microsoft" buttons; redirects to `GET /auth/google` or `GET /auth/microsoft`
    - OAuth callback lands on Express; after JWT cookie is set, Express redirects to `/dashboard`
    - SvelteKit `hooks.server.ts` — validates the JWT cookie on every request; injects `event.locals.user`; redirects unauthenticated requests to `/login`
    - `/logout` — calls `POST /auth/logout`, clears cookie, redirects to `/login`

22. Implement layout and navigation:
    - Root authenticated layout with sidebar navigation
    - Notification bell icon in header showing unread count; connects to `GET /notifications/stream` SSE on mount; updates badge count in real time
    - Role-based nav items (admin sees User Management; enumerator role blocked from dashboard entirely)

23. Implement **Home / Overview** (`/dashboard`):
    - Server load function calls `GET /reporting/summary`
    - Displays total entities, submission counts by status, quarantine backlog, open conflicts
    - ITT progress bars for each indicator (baseline → actual → target)

24. Implement **Forms Manager** (`/dashboard/forms`):
    - List all forms grouped by sector folder
    - Upload XLSForm XLSX via `POST /forms` — show validation errors inline if `422` returned
    - Form detail page showing version history and field list from `xlsform_json`
    - Publish new version button (admin only)

25. Implement **Submissions Browser** (`/dashboard/submissions`):
    - Filterable table: sector, form, status, date range, enumerator
    - Data from `GET /reporting/submissions`
    - Row click opens submission detail showing both flattened columns and raw `payload` JSON viewer
    - Entity link navigates to the entity timeline

26. Implement **Quarantine Queue** (`/dashboard/quarantine`):
    - List of unresolved quarantine entries from `GET /quarantine`
    - Real-time: SSE `quarantine_alert` events append new entries to the top of the list without page refresh
    - Entry detail shows `failure_reason`, `failure_detail`, and the raw payload
    - Resolve and Reject buttons call `POST /quarantine/:id/resolve` and `POST /quarantine/:id/reject`; optimistic UI update on response

27. Implement **Conflict Resolution** (`/dashboard/conflicts`):
    - List of open conflicts
    - Conflict detail: side-by-side diff of canonical submission vs `branch_payload`; highlights divergent field values
    - Resolution controls: "Accept Branch", "Keep Canonical", or manual merge (editable JSON fields)
    - Submit calls `POST /conflicts/:id/resolve`

28. Implement **Entity Registry** (`/dashboard/entities`):
    - Searchable, paginated entity list with `entity_type` filter
    - Entity detail page showing baseline `metadata` and full submission timeline from `GET /reporting/entities/:id/timeline`

29. Implement **Geospatial Map** (`/dashboard/map`):
    - MapLibre GL JS map initialised with data from `GET /reporting/map`
    - Submission points plotted as markers, coloured by `status`
    - Filter controls: sector, form, date range — re-fetch map data on filter change
    - Marker popups show `entity_id`, `form_key`, `enumerator_id`, `status`

30. Implement **Indicator Tracking Table** (`/dashboard/indicators`):
    - List all indicators with baseline, target, and latest actual
    - Create indicator form (admin only): name, code, unit, baseline, target, source form + field, aggregation function
    - "Compute Actuals" button per indicator calls `POST /indicators/:id/compute`; updates displayed actual in place

31. Implement **User Management** (`/dashboard/users`) — admin only:
    - List all users with role badges and active/inactive status
    - Invite user form: email + role → calls `POST /org/users/invite`
    - Role dropdown per user → calls `PATCH /org/users/:id/role`
    - Deactivate button → calls `DELETE /org/users/:id`

**Deliverables:**
- All 9 dashboard modules functional in local dev
- SSE real-time updates working in Quarantine Queue
- OAuth login → session cookie → protected route → logout cycle verified
- Role-based access: supervisor cannot access User Management; enumerator redirected from all dashboard routes

---

## Phase 6 — Android Data Collection App

**Goal:** Offline-first Android application for field data collection, syncing to the backend when connectivity is available.

**Prerequisites:** Phase 2 complete (entities and form distribution endpoints available). OpenAPI spec finalised.

### Steps

32. Scaffold Android project (`/android`):
    - Kotlin, minimum SDK 26 (Android 8.0)
    - Jetpack Compose for UI
    - Android Room for SQLite ORM
    - Retrofit for HTTP
    - Hilt for dependency injection

33. Implement local database (Room):
    - `EntityRecord` table — mirrors `public.entities`; populated from `GET /entities/sync`
    - `FormDefinition` table — stores `xlsform_json` downloaded from `GET /forms/:id/definition`
    - `SyncQueue` table — columns: `id`, `payload` (JSON), `status` (`pending`/`sent`/`failed`), `retry_count`, `last_attempted_at`
    - EAV `SubmissionDraft` table — `(draft_id, entity_id, form_id, attribute_key, attribute_value)` — stores in-progress form state before final submission

34. Implement authentication:
    - OAuth 2.0 PKCE flow using Android's `AppAuth` library
    - Provider selection screen (Google / Microsoft)
    - After callback, store JWT in Android `EncryptedSharedPreferences`
    - Attach JWT as `Authorization: Bearer` header via Retrofit interceptor

35. Implement entity sync:
    - On app open and on manual refresh, call `GET /entities/sync?since=<last_sync_timestamp>`
    - Write returned entities into local `EntityRecord` table
    - Store `last_sync_timestamp` in `SharedPreferences`

36. Implement form engine:
    - On login / refresh, call `GET /forms` to list available forms; download `xlsform_json` for each via `GET /forms/:id/definition`
    - Parse `xlsform_json` into an in-memory AST at load time
    - AST evaluator: walk the tree on each answer change to resolve `relevant` expressions (skip logic) and `calculate` expressions
    - Render one question per screen (Compose `HorizontalPager`) using field type to determine widget:
      - `text` → `TextField`
      - `integer` / `decimal` → numeric `TextField`
      - `select_one` → radio group
      - `select_multiple` → checkbox group
      - `geopoint` → GPS capture button (uses `FusedLocationProviderClient`)
      - `image` → camera intent
      - `barcode` → ML Kit barcode scanner
      - `date` → date picker dialog
      - `repeat_group` → nested pager with add/remove instance controls
    - Auto-capture metadata on form start: `start` timestamp, `deviceid`, `simserial`, `phonenumber`
    - Auto-capture `end` timestamp on final submission

37. Implement entity lookup at survey start:
    - Before beginning a form, present a search screen querying local `EntityRecord` table
    - Barcode scan support for `external_id` lookup
    - Display matched entity's baseline `metadata` for visual verification before proceeding

38. Implement sync engine:
    - `SyncWorker` (WorkManager `PeriodicWorkRequest`, 15-minute interval when on WiFi or unmetered connection)
    - On each work run: query `SyncQueue` for `status = 'pending'` or `status = 'failed' AND retry_count < 5`
    - POST each payload to `POST /submissions`
    - `202` → update `status = 'sent'`
    - `4xx` (non-retryable) → update `status = 'failed'`, store server error in `SyncQueue.last_error`
    - `5xx` or network error → increment `retry_count`; apply exponential backoff (`2^retry_count * 30s`, capped at 4 hours)
    - After successful sync run, call `GET /entities/sync` to pull any new entities

**Deliverables:**
- Full offline form completion cycle: open form → fill → save to `SyncQueue`
- Entity lookup finding a local record and pre-filling survey context
- Sync engine submitting queued payloads and handling retry logic
- GPS, barcode, and image capture working on a physical device
- All XLSForm field types rendering correctly

---

## Phase 7 — Integration Testing

**Goal:** Verify that the three components work correctly together and that the DQA pipeline, conflict resolution, and longitudinal tracking produce correct results under realistic conditions.

**Prerequisites:** Phases 1–6 complete.

### Steps

39. API integration tests (Jest + `supertest` + real test database):
    - Ingestion pipeline: submit valid payload → assert sector table row created with `status = 'pending'`
    - Freshness violation: submit payload with `end_time` 96 hours ago → assert quarantine entry created, SSE event emitted
    - Uniqueness violation: submit duplicate `entity_id` + `form_id` → assert quarantine entry created
    - Conflict detection: submit two payloads for same entity + form within 24-hour window → assert `submission_conflicts` row created, canonical row in sector table
    - Quarantine resolve: resolve a quarantine entry → assert payload moves to sector table, `audit_log` entry created
    - Conflict merge: resolve conflict with `manual_merge` → assert `merged_payload` written to canonical row
    - Role enforcement: enumerator calling `GET /reporting/submissions` → assert `403`

40. SvelteKit E2E tests (Playwright):
    - Login via OAuth mock → land on dashboard → verify ITT summary loads
    - Navigate to Quarantine Queue → trigger a DQA failure via API → assert new entry appears without page refresh
    - Resolve a quarantine entry → assert entry disappears from list and count decrements
    - Open a conflict → select "Keep Canonical" → assert conflict marked resolved
    - Admin creates an indicator → computes actuals → assert value displayed in ITT

41. Android integration tests:
    - Unit test: AST evaluator correctly hides/shows fields based on `relevant` expressions for a sample XLSForm
    - Unit test: `SyncQueue` retry logic applies correct backoff intervals
    - Instrumented test: submit a form offline → verify `SyncQueue` entry created → connect to test API → verify sync engine delivers submission and marks `status = 'sent'`

42. End-to-end longitudinal tracking test:
    - Register an entity via Android
    - Complete a baseline form for that entity
    - Complete a follow-up form for the same entity
    - Verify `GET /reporting/entities/:id/timeline` returns both submissions linked by `entity_id` in correct chronological order

**Deliverables:**
- All API integration tests passing against a clean test database
- All Playwright E2E flows passing in CI
- Android instrumented sync test passing against the local API

---

## Phase 8 — Production Deployment (VPS / Bare Metal)

**Goal:** A production-ready server deployment on a single VPS or bare metal machine, serving the platform over HTTPS with process supervision and automated backups. No containers in production.

**Prerequisites:** Phase 7 complete and all tests passing. A server running Ubuntu 22.04 LTS with a domain name pointed at its IP.

### Steps

43. Provision and harden the server:
    - Create a non-root deployment user (`athena`); add to `sudo` group
    - Disable root SSH login; disable password authentication; enforce SSH key-only access (`/etc/ssh/sshd_config`: `PermitRootLogin no`, `PasswordAuthentication no`)
    - Configure UFW firewall: allow SSH (port 22), HTTP (port 80), HTTPS (port 443); deny all other inbound traffic
      ```
      ufw allow OpenSSH
      ufw allow 'Nginx Full'
      ufw enable
      ```
    - Keep API (port 3000) and SvelteKit web (port 3001) bound to `localhost` only — never exposed directly to the internet; all public traffic goes through Nginx

44. Install system dependencies:
    - **PostgreSQL 15 + PostGIS** via the official PostgreSQL apt repository:
      ```
      apt install -y postgresql-15 postgresql-15-postgis-3
      ```
    - **Node.js 20 LTS** via NodeSource:
      ```
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt install -y nodejs
      ```
    - **PM2** globally for process management:
      ```
      npm install -g pm2
      ```
    - **Nginx**:
      ```
      apt install -y nginx
      ```
    - **Certbot** for Let's Encrypt:
      ```
      apt install -y certbot python3-certbot-nginx
      ```

45. Provision the database:
    - Create a PostgreSQL role and database owned by that role (no superuser):
      ```sql
      CREATE ROLE athena_app WITH LOGIN PASSWORD '<strong-password>';
      CREATE DATABASE athena_db OWNER athena_app;
      ```
    - Connect as `athena_app` and enable extensions:
      ```sql
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE EXTENSION IF NOT EXISTS "postgis";
      ```
    - Grant the `athena_app` role permission to create schemas (required for sector folder creation):
      ```sql
      GRANT CREATE ON DATABASE athena_db TO athena_app;
      ```
    - Edit `/etc/postgresql/15/main/pg_hba.conf` to allow `athena_app` local connections via `md5`
    - Bind PostgreSQL to `localhost` only (`listen_addresses = 'localhost'` in `postgresql.conf`) — never expose port 5432 to the network

46. Deploy application code:
    - Clone the repository to `/srv/athena`:
      ```
      git clone <repo-url> /srv/athena
      chown -R athena:athena /srv/athena
      ```
    - Create `/srv/athena/.env` from `.env.example`; populate all production values — this file must be owned by `athena` with mode `600`
    - Install dependencies and build both applications:
      ```
      cd /srv/athena/api  && npm ci --omit=dev
      cd /srv/athena/web  && npm ci && npm run build
      ```
    - Run database migrations:
      ```
      cd /srv/athena && npm run migrate:prod
      ```

47. Configure PM2 process management:
    - Create `/srv/athena/ecosystem.config.js`:
      ```js
      module.exports = {
        apps: [
          {
            name: 'athena-api',
            script: './api/dist/server.js',
            cwd: '/srv/athena',
            env_file: '.env',
            instances: 1,
            restart_delay: 3000,
            max_restarts: 10,
          },
          {
            name: 'athena-web',
            script: './web/build/index.js',
            cwd: '/srv/athena',
            env_file: '.env',
            instances: 1,
            restart_delay: 3000,
            max_restarts: 10,
          }
        ]
      };
      ```
    - Start processes and save PM2 state:
      ```
      pm2 start ecosystem.config.js
      pm2 save
      ```
    - Register PM2 as a systemd startup service so processes resume after reboot:
      ```
      pm2 startup systemd -u athena --hp /home/athena
      ```

48. Configure Nginx as reverse proxy:
    - Create `/etc/nginx/sites-available/athena`:
      ```nginx
      server {
          listen 80;
          server_name your.domain.com;

          location /api/ {
              proxy_pass         http://127.0.0.1:3000/;
              proxy_http_version 1.1;
              proxy_set_header   Upgrade $http_upgrade;
              proxy_set_header   Connection 'upgrade';
              proxy_set_header   Host $host;
              proxy_set_header   X-Real-IP $remote_addr;
              proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header   X-Forwarded-Proto $scheme;
              # Required for SSE — disable buffering on the notifications stream
              proxy_buffering    off;
              proxy_cache        off;
          }

          location / {
              proxy_pass         http://127.0.0.1:3001;
              proxy_http_version 1.1;
              proxy_set_header   Host $host;
              proxy_set_header   X-Real-IP $remote_addr;
              proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header   X-Forwarded-Proto $scheme;
          }

          # Rate limit on ingestion endpoint to prevent sync storms
          limit_req_zone $binary_remote_addr zone=submissions:10m rate=30r/m;
          location /api/submissions {
              limit_req zone=submissions burst=20 nodelay;
              proxy_pass http://127.0.0.1:3000/submissions;
          }
      }
      ```
    - Enable the site: `ln -s /etc/nginx/sites-available/athena /etc/nginx/sites-enabled/`
    - Test config: `nginx -t`
    - Reload: `systemctl reload nginx`

49. Provision TLS with Certbot:
    - Obtain and install a Let's Encrypt certificate; Certbot automatically modifies the Nginx config to add the HTTPS server block and HTTP → HTTPS redirect:
      ```
      certbot --nginx -d your.domain.com
      ```
    - Verify auto-renewal is active (Certbot installs a systemd timer by default):
      ```
      systemctl status certbot.timer
      ```
    - Test renewal dry-run: `certbot renew --dry-run`

50. Set up automated database backups:
    - Create backup directory: `mkdir -p /srv/athena/backups` owned by `postgres`
    - Create `/srv/athena/scripts/backup.sh`:
      ```bash
      #!/bin/bash
      BACKUP_DIR=/srv/athena/backups
      FILENAME="athena_$(date +%Y%m%d_%H%M%S).dump"
      pg_dump -U athena_app -Fc athena_db > "$BACKUP_DIR/$FILENAME"
      # Retain last 30 backups; delete older files
      ls -t "$BACKUP_DIR"/*.dump | tail -n +31 | xargs -r rm
      ```
    - Make executable: `chmod +x /srv/athena/scripts/backup.sh`
    - Schedule via system cron (`crontab -u postgres -e`):
      ```
      0 2 * * * /srv/athena/scripts/backup.sh >> /var/log/athena-backup.log 2>&1
      ```
    - Test manually: run the script and confirm a `.dump` file is created and restorable via `pg_restore`

51. Update `GET /health` depth:
    - Return DB pool status (`pg.query('SELECT 1')`), pending migration count, process uptime, and Node.js memory usage
    - This endpoint is used by Nginx `upstream` health checks and any external uptime monitor (e.g., UptimeRobot, Grafana)

52. Create deploy script (`/srv/athena/scripts/deploy.sh`) for applying updates:
    ```bash
    #!/bin/bash
    set -e
    cd /srv/athena
    git pull origin main
    cd api && npm ci --omit=dev && cd ..
    cd web && npm ci && npm run build && cd ..
    npm run migrate:prod
    pm2 reload ecosystem.config.js --update-env
    echo "Deploy complete: $(date)"
    ```
    - Run as the `athena` user: `sudo -u athena /srv/athena/scripts/deploy.sh`

53. Write deployment runbook (`/docs/deployment.md`) covering:
    - **Initial provisioning:** steps 43–51 in order
    - **Applying updates:** run `deploy.sh`; verify `GET /health` returns `200` after reload
    - **Checking service status:** `pm2 status`, `systemctl status nginx`, `systemctl status postgresql`
    - **Viewing logs:** `pm2 logs athena-api`, `pm2 logs athena-web`, `journalctl -u nginx`
    - **Restoring from backup:** `pg_restore -U athena_app -d athena_db -Fc <backup_file>.dump`
    - **Rolling back a bad deploy:** `git checkout <previous-tag>` + re-run `deploy.sh`
    - **Renewing SSL manually:** `certbot renew`

**Deliverables:**
- Server accessible over HTTPS at the production domain with a valid Let's Encrypt certificate
- Both API and web processes running under PM2, surviving a server reboot
- PostgreSQL bound to localhost; ports 3000 and 3001 not reachable from the public internet
- `pg_dump` running nightly via cron and producing restorable archives
- `deploy.sh` verified end-to-end: pull → build → migrate → reload with no downtime
- Deployment runbook verified against a fresh server provisioning

---

## Verification Checklist

Before Alpha release, confirm all of the following:

**Data integrity**
- [ ] Every submission in every sector table has a valid `entity_id` FK to `public.entities`
- [ ] No submission can be written to a sector table without passing the DQA pipeline
- [ ] Every quarantine resolution and conflict merge produces an `audit_log` entry

**Auth & access control**
- [ ] `enumerator` role cannot access any dashboard route or reporting endpoint
- [ ] `supervisor` role cannot access User Management or create/delete forms
- [ ] OAuth callback correctly creates or updates the user record without creating duplicates
- [ ] JWT cookie is HttpOnly and not accessible via `document.cookie`

**Offline & sync**
- [ ] Android app functions fully without network: form rendering, entity lookup, submission drafting
- [ ] Sync engine retries on failure with correct exponential backoff
- [ ] Conflict detection correctly fires when two offline devices submit for the same entity within 24 hours

**Dashboard**
- [ ] Quarantine Queue updates in real time via SSE without page refresh
- [ ] Entity timeline correctly joins submissions across multiple form types via `entity_id`
- [ ] ITT actuals match the result of running the SQL aggregate query directly

**Infrastructure**
- [ ] `GET /health` returns `200` with DB connectivity confirmed
- [ ] API and web processes restart automatically after a server reboot (`pm2 startup` registered)
- [ ] PostgreSQL port 5432 is not reachable from the public internet (UFW + localhost binding confirmed)
- [ ] Nginx rate limiting is active on `POST /submissions`
- [ ] SSL certificate is valid and auto-renewal timer is running
- [ ] Backup restore procedure produces a working database (`pg_restore` tested against a real backup file)

---

## Out of Scope (Alpha)

These items are explicitly deferred and should not be implemented until post-Alpha:

- Materialized views and ETL pipelines
- BI tool integrations (Metabase, PowerBI)
- Multi-tenancy (multiple organisations on one instance)
- Bulk entity CSV import
- SMS notifications and Android push notifications
- Android tablet layout optimisations
- Form builder UI (forms are authored as XLSX and uploaded)
