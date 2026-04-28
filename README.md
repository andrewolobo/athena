# ATHENA — M&E Platform

A self-hosted, offline-capable Monitoring & Evaluation (M&E) platform built for international development programmes. ATHENA replaces fragmented spreadsheet workflows with a unified data pipeline — from field data collection on Android devices through to a web-based management dashboard.

---

## Overview

ATHENA is built around an **Identity-First** data model. Every participant or facility in a programme receives an immutable UUID at registration (the "Noun"). All subsequent data collection events — assessments, follow-ups, monitoring visits — are linked back to that identity as time-stamped "Verbs". This eliminates the dashboard trap of unlinked, per-form datasets and enables longitudinal tracking across a programme's lifetime.

**Core capabilities:**

- Offline-first Android data collection with automatic sync and conflict detection
- OpenRosa-compliant ingestion API with automated data quality assessment at the point of entry
- Real-time quarantine queue and conflict resolution UI for field supervisors
- Indicator Tracking Table (ITT) with configurable SMART indicators and SQL-driven aggregation
- Role-based access control (`admin`, `supervisor`, `enumerator`)
- In-app notifications via Server-Sent Events; quarantine alerts via email

---

## Architecture

```
┌─────────────────────┐      OpenRosa API      ┌──────────────────────┐
│  Android App        │ ─────────────────────► │  Express.js API      │
│  (Offline-first,    │                         │  Port 3000           │
│   SQLite/Room,      │                         │                      │
│   XLSForm engine)   │ ◄───────────────────── │  JWT · HttpOnly      │
└─────────────────────┘   form definitions /   │  cookie auth         │
                           entity delta-sync   └──────────┬───────────┘
                                                          │
┌─────────────────────┐      REST + SSE        ┌──────────▼───────────┐
│  SvelteKit Dashboard│ ◄────────────────────► │  PostgreSQL 15       │
│  Port 5173          │                         │  + PostGIS 3.3       │
│  SSR · adapter-node │                         │                      │
└─────────────────────┘                         │  Hybrid relational + │
                                                │  JSONB payload model │
                                                └──────────────────────┘
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend API | Node.js 20, Express.js, TypeScript |
| Database | PostgreSQL 15 + PostGIS 3.3 |
| Web dashboard | SvelteKit 2, `@sveltejs/adapter-node` (SSR), Tailwind CSS 3 |
| Android client | Native Android (Kotlin), SQLite/Room, offline-first |
| Auth | OAuth 2.0 / OIDC (`openid-client`, PKCE), JWT, HttpOnly cookies |
| Migrations | `node-pg-migrate` |
| Query layer | `pg` (node-postgres), parameterised queries only — no ORM |
| Validation | `zod` — API boundaries and SvelteKit server actions |
| Dev environment | Docker Compose |
| Logging | `pino` |
| Monorepo | npm workspaces + `concurrently` |

---

## Repository Structure

```
ATHENA/
├── apps/
│   ├── api/              # Express.js backend API
│   │   ├── src/
│   │   │   ├── routes/   # All API route modules
│   │   │   ├── modules/  # Auth OIDC client, DQA pipeline, notifications
│   │   │   ├── middleware/
│   │   │   └── app.ts    # Express app entry point
│   │   └── openapi.yaml  # OpenAPI 3.0 specification (source of truth)
│   ├── web/              # SvelteKit management dashboard
│   │   └── src/
│   │       ├── routes/   # Page and API route files
│   │       └── lib/      # Shared components, API client, types
│   ├── database/
│   │   ├── migrations/   # Numbered SQL migration files
│   │   └── seeds/        # dev_seed.sql for local development
│   └── android/          # Android app (in development)
├── documentation/
│   ├── Draft-Project-Specification.md
│   └── implementation/
│       ├── plan.md
│       └── specifcation.md
├── docker-compose.dev.yml
├── .env.example
└── package.json
```

---

## Data Model

### Five-Level Hierarchy

```
Organisation
  └── Folder (PostgreSQL Schema — e.g. wash_sector, health_sector)
        └── Form (XLSForm-defined table — e.g. water_point_baseline)
              └── Submission (Row — linked to an Entity via entity_id)
                    └── Field (JSONB payload key)
```

### Storage: Hybrid Relational + JSONB

Each submission table contains:
- **Rigid relational columns** — `submission_id`, `entity_id`, `form_id`, `enumerator_id`, `start_time`, `end_time`, `status`, `location` (PostGIS geography point)
- **Flexible JSONB `payload` column** — all survey question responses; supports nested repeat groups

This allows XLSForm definitions to evolve without database migrations. Reporting views use `->>` and `::` operators to flatten JSONB to queryable columns.

### Data Quality Pipeline

Every incoming submission passes through a synchronous 5-step pipeline before any write:

1. **Schema validation** — payload conforms to the `xlsform_json` field list
2. **Freshness check** — submission not older than 72 hours (catches hoarded submissions)
3. **Uniqueness check** — no existing approved row for the same `entity_id` + `form_id`
4. **Conflict detection** — two submissions for the same entity/form within a 24-hour window → routed to `submission_conflicts`
5. **Pass** — written to the sector table with `status = 'pending'`

Failed checks route to the `quarantine_queue` and trigger real-time supervisor notifications.

---

## API Modules

| Module | Prefix | Description |
|---|---|---|
| Health | `GET /health` | DB connectivity check |
| Auth | `/auth` | OAuth 2.0 OIDC login (Google, Microsoft), JWT cookie, logout |
| Organisation | `/org` | Org info, user management, device management |
| Entities | `/entities` | Identity registry — register participants/facilities, delta-sync for Android |
| Forms | `/forms` | XLSForm upload, versioning, distribution endpoint for Android |
| Ingestion | `/submissions` | OpenRosa 1.0 compliant multipart submission endpoint |
| Quarantine | `/quarantine` | DQA failure review — resolve or reject entries |
| Conflicts | `/conflicts` | Side-by-side conflict review and manual merge |
| Indicators | `/indicators` | SMART indicator CRUD and on-demand SQL aggregation |
| Reporting | `/reporting` | Flattened submission views, entity timelines, geospatial map data |
| Notifications | `/notifications` | SSE stream for real-time alerts, paginated notification list |

The full contract is defined in [`apps/api/openapi.yaml`](apps/api/openapi.yaml).

---

## Dashboard Pages

| Route | Role | Description |
|---|---|---|
| `/dashboard` | All | Overview — indicator progress, submission counts, quarantine backlog |
| `/dashboard/submissions` | Supervisor+ | Filterable submissions browser with payload viewer |
| `/dashboard/indicators` | Supervisor+ | ITT — baselines, targets, computed actuals |
| `/dashboard/forms` | Supervisor+ | XLSForm upload, versioning, field list viewer |
| `/dashboard/quarantine` | Supervisor+ | Real-time DQA failure queue, resolve/reject UI |
| `/dashboard/conflicts` | Supervisor+ | Side-by-side conflict diff and merge interface |
| `/dashboard/users` | Admin | Invite users, change roles, deactivate, reset passwords |
| `/dashboard/devices` | Admin | View and remove registered Android devices |

---

## Local Development

### Prerequisites

- Docker Desktop
- Node.js 20+
- A `.env` file (see below)

### Setup

**1. Clone the repository and install dependencies:**

```bash
git clone <repo-url>
cd ATHENA
npm install
```

**2. Configure environment variables:**

```bash
cp .env.example .env
# Edit .env — fill in JWT_SECRET and OAuth credentials at minimum
```

**3. Start the full stack with Docker:**

```bash
docker compose -f docker-compose.dev.yml up
```

This starts three services:
- `postgres` — PostgreSQL 15 + PostGIS on port 5432
- `api` — Express API on port 3000 (hot reload via nodemon)
- `web` — SvelteKit dashboard on port 5173 (hot reload)

**4. Run database migrations:**

```bash
npm run migrate:dev
```

**5. Load development seed data:**

```bash
npm run seed:dev
```

The seed creates one organisation, three users (admin / supervisor / enumerator), sample entities, forms, and submissions covering all status values.

### Running without Docker

```bash
# Start API and web concurrently (requires a local PostgreSQL instance)
npm run dev

# Or individually
npm run dev:api
npm run dev:web
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | Docker Compose postgres container password |
| `JWT_SECRET` | Minimum 64 random hex characters |
| `JWT_EXPIRY` | Token lifetime (e.g. `15m`, `1h`) |
| `OAUTH_GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `OAUTH_MICROSOFT_CLIENT_ID` | Azure AD app client ID |
| `OAUTH_MICROSOFT_CLIENT_SECRET` | Azure AD app client secret |
| `OAUTH_CALLBACK_URL` | Full URL to `/auth/callback` on the API |
| `APP_BASE_URL` | Public base URL of the web dashboard |
| `SMTP_HOST` | SMTP server hostname (for quarantine alert emails) |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for outbound email |
| `PORT` | API server port (default: `3000`) |
| `NODE_ENV` | `development` or `production` |

See [`.env.example`](.env.example) for the full annotated template.

---

## Database Migrations

Migrations live in `apps/database/migrations/` as numbered SQL files.

```bash
npm run migrate:dev    # Run pending migrations (dev database)
npm run migrate:test   # Run pending migrations (test database)
npm run migrate:prod   # Run pending migrations (production database)
```

---

## Roles & Permissions

| Permission | Admin | Supervisor | Enumerator |
|---|---|---|---|
| Submit data (via Android) | ✓ | ✓ | ✓ |
| Browse submissions | ✓ | ✓ | — |
| Resolve quarantine / conflicts | ✓ | ✓ | — |
| Manage indicators & forms | ✓ | — | — |
| Manage users & devices | ✓ | — | — |
| Access dashboard | ✓ | ✓ | — |

---

## Production Deployment

Production topology: single VPS / bare metal running Ubuntu 22.04 LTS.

- **PostgreSQL 15** — system service
- **API process** — managed by PM2
- **SvelteKit web process** — managed by PM2 (`adapter-node` build output)
- **Nginx** — reverse proxy with TLS termination

Docker is used for local development only and is not part of the production stack.
