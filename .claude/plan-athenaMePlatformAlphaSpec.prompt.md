# ATHENA — Alpha M&E Platform Systems Specification

## System Overview & Constraints

**Steps:**

1. Define system objectives, scope, and non-goals for the Alpha
2. Document all roles: `admin`, `supervisor`, `enumerator` — permissions matrix
3. Define deployment topology: single Docker Compose stack (Node API + PostgreSQL + PostGIS extension)

**Relevant files:**

- `documentation/Draft-Project-Specification.md` — primary architecture source
- `documentation/database/db.question.md` — schema tier breakdown

---

## Data Architecture (PostgreSQL)

**Steps:**

4. Define the five-level hierarchy: Database → Schema (Folder) → Table (Form) → Row (Record) → Column (Field)
5. Specify the `public` schema — core administrative tables
   - `organizations`, `users`, `entities` (identity registry), `forms` (XLSForm registry)
6. Specify sector-namespaced schemas — e.g., `wash_sector`, `health_sector` — as "Folders"
   - Each sector schema contains form-specific submission tables with `entity_id` FK to `public.entities`
7. Specify JSONB hybrid model — rigid relational metadata (IDs, timestamps, GPS) + flexible `payload JSONB`
8. Specify the data quality layer: `quarantine_queue` + `submission_conflicts` tables
9. Specify the Results Framework layer: `indicators` table + `indicator_tracking` (ITT) table — admin-populated targets, actuals derived by SQL aggregation from submissions
10. Specify PostGIS `GEOGRAPHY(POINT, 4326)` on all submission tables for spatial integrity
11. Specify GIN indexes on `payload` column for reporting performance
12. Specify reporting views — `CREATE VIEW sector_X.vw_*` flattening JSONB to relational columns using `->>` / `::` operators

**Relevant files:**

- `documentation/database/sample.schema.md` — reference DDL
- `documentation/database/data.storage.md` — JSONB storage model with JSON examples
- `documentation/database/folder.clarification.md` — Folder = PostgreSQL Schema
- `documentation/database/reporting.md` — views, GIN indexes, Materialized Views roadmap

---

## Backend API (Express.js)

**Steps:**

13. Define API module boundaries:
    - `AuthModule` — OAuth 2.0 / SSO (Google, Microsoft via `openid-client`)
    - `OrganizationModule` — org and user management
    - `FormsModule` — XLSForm upload, versioning, CRUD
    - `IngestionModule` — OpenRosa 1.0 compliant submission endpoint
    - `EntitiesModule` — identity registry read/write
    - `QualityModule` — automated DQA pipeline at ingestion (freshness, uniqueness checks)
    - `IndicatorsModule` — ITT CRUD and aggregation queries
    - `ReportingModule` — serves flattened view data to Svelte dashboard
    - `NotificationsModule` — in-app alerts + email (nodemailer / SendGrid) for quarantine events
14. Specify OpenRosa ingestion contract: `HTTP POST multipart/form-data`, chunked transfer encoding, `200 / 201 / 409` response codes
15. Specify ingestion DQA pipeline sequence:
    - Step 1: Parse and validate XLSForm payload structure
    - Step 2: Freshness check — compare `end_time` (form metadata) vs `server_received_at`
    - Step 3: Uniqueness check — hash primary identifying fields, query for duplicate `entity_id` + `form_id` combos
    - Step 4: On pass → insert to sector schema table; on fail → insert to `quarantine_queue`, fire notification
16. Specify conflict detection: on sync, if two payloads share same `entity_id` + `form_id` + overlapping time window → route to `submission_conflicts`, alert supervisor in dashboard
17. Specify offline sync protocol: Android clients send queued payloads via exponential backoff; server responds with `202 Accepted` per item in queue
18. Specify role-based middleware: `admin` full access; `supervisor` read submissions, resolve quarantine/conflicts; `enumerator` submit data only (API-level enforcement)

---

## Android Data Collection App

**Steps:**

19. Specify local storage engine: SQLite via Android Room, using EAV model (`entity_id`, `attribute_key`, `attribute_value`) for schema-agnostic offline storage
20. Specify sync queue: `SyncQueue` table with status (`pending`, `sent`, `failed`), retry counter, exponential backoff scheduler
21. Specify form engine:
    - Parse `xlsform_json` definition downloaded from API
    - Build AST at load time to evaluate skip-logic boolean expressions at runtime
    - Render one question/topic per screen (chunking UX — paginated, not scrolling)
22. Specify form field types: `text`, `integer`, `decimal`, `select_one`, `select_multiple`, `geopoint`, `image`, `barcode`, `date`, `repeat_group`
23. Specify offline entity lookup: pre-populate local `entities` table from API for identity verification at survey start ("pull existing participant")
24. Specify XLSForm metadata auto-capture: `start`, `end`, `deviceid`, `simserial`, `phonenumber`

---

## Management Dashboard (Svelte SPA)

**Steps:**

25. Specify dashboard modules:
    - **Home / Overview** — org-level indicator progress summary (ITT snapshot)
    - **Forms Manager** — upload XLSForm XLSX, manage versions, assign to folders
    - **Submissions Browser** — filterable table of submissions per form, per sector folder
    - **Quarantine Queue** — list of failed-DQA submissions, resolve/reject UI, real-time alert badge
    - **Conflict Resolution** — side-by-side diff of branched submissions, manual merge interface
    - **Indicator Tracking Table (ITT)** — admin creates indicators (name, baseline, target, reporting period), view actuals pulled from aggregated views
    - **Entity Registry** — search/view participant and facility records
    - **Geospatial Map** — Leaflet or MapLibre layer plotting submission GPS points, filterable by form/sector
    - **User Management** — invite users, assign roles (admin only)
26. Specify OAuth SSO integration on the Svelte side: redirect flow to Google/Microsoft, receive JWT session token from Express after verification
27. Specify real-time quarantine alerts: Server-Sent Events (SSE) or WebSocket channel from Express → Svelte for live quarantine queue updates

---

## Security

**Steps:**

28. Specify OAuth 2.0 / OIDC flow: PKCE-based flow via `openid-client`; Express issues internal session JWT after identity verified; short-lived access tokens + refresh tokens stored server-side
29. Specify API authentication: Bearer JWT on every request; middleware validates signature + expiry + role claims
30. Specify input validation: all incoming payloads validated with `zod` or `joi` at API boundary before any DB interaction
31. Specify SQL injection protection: parameterised queries / ORM only — no raw string interpolation
32. Specify data isolation: row-level `org_id` filter on every query; no cross-org data leakage possible
33. Specify HTTPS requirement: TLS termination at reverse proxy (Nginx) — no plaintext API traffic

---

## Infrastructure & Deployment

**Steps:**

34. Specify Docker Compose services: `postgres` (PostGIS image), `api` (Node.js), `web` (Nginx serving Svelte build)
35. Specify environment configuration: `.env` for secrets (DB credentials, OAuth client IDs/secrets, email credentials) — never committed to VCS
36. Specify database migrations: managed via `node-pg-migrate` or `Flyway` — version-controlled DDL scripts
37. Specify backup strategy: `pg_dump` on a scheduled cron, stored to a configurable backup directory

---

## Relevant Files

| File                                             | Role                                 |
| ------------------------------------------------ | ------------------------------------ |
| `documentation/Draft-Project-Specification.md`   | Primary architecture source          |
| `documentation/database/sample.schema.md`        | Reference DDL                        |
| `documentation/database/data.storage.md`         | JSONB storage model                  |
| `documentation/database/folder.clarification.md` | Folder = PostgreSQL Schema rationale |
| `documentation/database/reporting.md`            | Views, GIN indexes, chart libraries  |
| `documentation/database/db.question.md`          | Schema tiers and ITT model           |

---

## Verification

1. Every API endpoint has a defined request/response contract and HTTP status code
2. All three role types (`admin`, `supervisor`, `enumerator`) are explicitly constrained at the API middleware layer
3. DQA pipeline covers both **Freshness** and **Uniqueness** checks before write
4. Android EAV model supports all XLSForm field types including `repeat_group`
5. Dashboard quarantine queue receives real-time alerts when a submission is rejected
6. OAuth flow produces a short-lived JWT with role claims before any protected resource is accessible
7. Database schema includes GIN indexes on all `payload` columns prior to first reporting query

---

## Decisions

- Single-org deployment → no multi-tenant row-level isolation needed, but `org_id` retained in schema for potential future extension
- OAuth only (no local password auth) → no `password_hash` column needed on `users` table
- Admin-defined indicators → ITT `actuals` column populated by a SQL aggregate query executed on demand, not a live trigger
- Alpha scope only → Materialized Views, ETL pipelines, and BI tool integrations are explicitly **out of scope**
- Notifications: in-app SSE/WebSocket alerts + email only (no SMS, no Android push)

---

## Open Questions (Pre-Implementation)

1. **Form versioning strategy** — If an XLSForm definition changes mid-project (e.g., a question is renamed), old submissions reference `form_id v1` while new ones reference `v2`. The `payload` JSONB will have different keys. The reporting views will need version-conditional column projections. Recommend a decision on how breaking vs non-breaking changes are handled before implementing the Forms Module.
2. **Entity registration flow** — The spec assumes entities are created via a "Registration" form submitted on Android. Should entities also be bulk-importable (e.g., via CSV upload in the dashboard) for programmes with pre-existing beneficiary lists?
