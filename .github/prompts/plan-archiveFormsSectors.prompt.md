# Plan: Archive Forms and Sectors

**TL;DR**: Add reversible archive for forms and sectors. Forms reuse the existing `is_active` column (archive replaces the current one-way Delete). Sectors need a new `sector_config` table since they aren't stored in the DB. Both are hidden from the dashboard with a toggle to reveal them.

---

## Phase 1 — Database Migration

1. Create `apps/database/migrations/011_sector_config.sql` — new `public.sector_config` table:
   - Columns: `org_id` (FK → organizations), `folder_schema TEXT`, `is_archived BOOLEAN DEFAULT false`, `archived_at TIMESTAMPTZ`, `archived_by` (FK → users)
   - Primary key on `(org_id, folder_schema)`

---

## Phase 2 — API

2. Update `apps/api/src/routes/forms.ts`:
   - **Remove** `DELETE /:id` — replaced by archive
   - **Add** `PATCH /:id/archive` — sets `is_active = false`; auth: admin + supervisor
   - **Add** `PATCH /:id/unarchive` — sets `is_active = true`; auth: admin + supervisor
   - **Update** `GET /` — accept `?include_archived=true`; when present, remove the `is_active = true` WHERE clause
   - **Update** `GET /:id` — remove `is_active = true` filter so the management UI can fetch an archived form to unarchive it
   - `GET /:id/definition` (Android) keeps its `is_active = true` filter — archived forms are already excluded from Android ✓

3. Create `apps/api/src/routes/sectors.ts` (new file):
   - `GET /` — `SELECT DISTINCT folder_schema FROM public.forms … LEFT JOIN sector_config` → returns `[{ folder_schema, is_archived }]`
   - `PATCH /:folder_schema/archive` — upserts `sector_config` row with `is_archived = true`, `archived_at`, `archived_by`; auth: admin + supervisor
   - `PATCH /:folder_schema/unarchive` — upserts with `is_archived = false`; auth: admin + supervisor

4. Update `apps/api/src/app.ts` — register the `/sectors` router (parallel with step 3)

---

## Phase 3 — Frontend

5. Update `apps/web/src/routes/dashboard/forms/+page.server.ts`:
   - `load`: fetch `/forms?include_archived=true` (always load all; filter client-side) **and** `/sectors` (parallel fetches)
   - Add actions: `archiveForm`, `unarchiveForm` → `PATCH /forms/:id/archive|unarchive`
   - Add actions: `archiveSector`, `unarchiveSector` → `PATCH /sectors/:folder_schema/archive|unarchive`

6. Update `apps/web/src/routes/dashboard/forms/+page.svelte` (depends on step 5):
   - Add `showArchived` boolean toggle button in the toolbar
   - Sector grid: filter out archived sectors unless `showArchived`; when shown, render with muted styling + archive icon badge
   - Sector cards: add an "Archive sector" icon button; if archived, show "Unarchive" instead
   - Form cards: replace current "Delete" button → "Archive" button; add "Unarchive" button visible only on archived cards in `showArchived` mode

7. Update `apps/web/src/lib/types.ts` — add `SectorConfig` interface: `{ folder_schema: string; is_archived: boolean }`

---

## Phase 4 — OpenAPI (parallel with phases 2 & 3)

8. Update `apps/api/openapi.yaml` — document:
   - `PATCH /forms/{id}/archive`, `PATCH /forms/{id}/unarchive`
   - `GET /sectors`, `PATCH /sectors/{folder_schema}/archive`, `PATCH /sectors/{folder_schema}/unarchive`
   - `include_archived` query param on `GET /forms`

---

## Verification

1. `npm run migrate:dev` — confirm migration runs cleanly
2. `GET /forms` — archived forms absent; `GET /forms?include_archived=true` — they appear
3. `GET /forms/:id/definition` (Android) — returns 404 for archived form
4. `PATCH /forms/:id/archive` and `PATCH /forms/:id/unarchive` — accessible to supervisor, blocked to enumerator
5. Sector archive: archived sector hidden from grid; visible with toggle; forms inside are still reachable via `/forms/:id`
6. Toggle "show archived" in the UI — archived sectors and forms appear with distinct styling

---

## Decisions

- Sector archiving is a **dashboard-UI-only** concern — forms within an archived sector remain individually active and sync to Android
- Form archiving also excludes from Android (enforced by existing `is_active` filter on the definition endpoint)
- No `archived_at` column added to `forms` — the `sector_config` table captures the audit trail for sectors; form archive timestamps can be added later if needed
