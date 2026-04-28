Let me explore the project structure and documentation to build context before refining your prompt.

Now let me read the schema and the GitHub prompt files.

Now let me read the remaining prompt files.

I now have the full picture. Here's the refined prompt:

---

## Refined Prompt: Submission Extraction & Flattening Feature

### Context

ATHENA stores survey submissions in per-form, per-sector tables (e.g. `wash_sector.submissions_water_point_baseline`, `health_sector.submissions_clinic_visit`). Each row has rigid relational metadata columns (`entity_id`, `enumerator_id`, `status`, timestamps, GPS) plus a `payload JSONB` column holding all survey answers. The schema already defines hardcoded reporting views (`wash_sector.vw_water_point_summary`, `health_sector.vw_clinic_visit_summary`) that flatten specific `payload` keys to relational columns using `->>` operators — but these views only exist for the four seed forms and do not generalize to new forms.

The existing submissions browser at `/dashboard/submissions` shows only the metadata envelope (form name, entity, enumerator, received date, status). The `payload` answers are not surfaced anywhere in the UI. There is no generic flattening path in the API for arbitrary forms.

---

### Feature Goal

Add a complete submission flattening and inspection feature so that supervisors can see individual survey answers — not just submission metadata — both in the submissions list and in a per-submission detail view. The solution must work for any form registered in `public.forms`, not only the hardcoded seed forms.

---

### Scope

#### 1. Backend — Generic payload flattening via `xlsform_json`

**File:** `apps/api/src/routes/reporting.ts`

Update `GET /reporting/submissions/:id` to return flattened payload fields alongside the raw JSONB. The flattening source of truth is the form's `xlsform_json` stored in `public.form_versions` at the submission's `form_version`. Use the `survey` array from `xlsform_json` to derive `{ name, label, type }` for each field, then resolve each against `payload` to produce an ordered array of `{ name, label, type, value }` items. This avoids the need for per-form hardcoded views.

Shape of the new detail response:

```typescript
{
  submission_id: string;
  form_display_name: string;
  folder_schema: string;
  form_key: string;
  form_version: number;
  entity_id: string;
  entity_name: string | null;
  enumerator_display_name: string | null;
  enumerator_email: string;
  start_time: string;
  end_time: string;
  server_received_at: string;
  location: { lat: number; lng: number } | null;
  status: string;
  dqa_notes: string | null;
  fields: Array<{ name: string; label: string; type: string; value: string | null }>;
  raw_payload: Record<string, unknown>;
}
```

The `GET /reporting/submissions` paginated list endpoint should also include a `fields` summary — a subset of the flat fields for display in a configurable table (e.g. the first 5 non-metadata fields from `xlsform_json.survey`). This avoids N+1 queries by fetching the form definition once per unique `form_id` in the result page, not once per row.

Use `assertSafeIdentifier` (already exported from `apps/api/src/modules/dqa/pipeline.ts`) for any dynamic identifier construction. Never interpolate `folder_schema` or `form_key` without it.

#### 2. Frontend types

**File:** `apps/web/src/lib/types.ts`

Add:

```typescript
export interface FlatField {
  name: string;
  label: string;
  type: string;
  value: string | null;
}

export interface SubmissionDetail extends RecentSubmission {
  form_version: number;
  start_time: string;
  end_time: string;
  location: { lat: number; lng: number } | null;
  dqa_notes: string | null;
  fields: FlatField[];
  raw_payload: Record<string, unknown>;
}
```

Extend the existing `Submission` interface to include `fields: FlatField[]` for the paginated list rows.

#### 3. Frontend — Submissions page

**File:** `apps/web/src/routes/dashboard/submissions/+page.server.ts`

- The existing `load` function fetches the paginated list. Ensure the server action for fetching passes through the `fields` array from the API.
- Add a `loadDetail` action (or a child route) that calls `GET /reporting/submissions/:id` and returns `SubmissionDetail`.

**File:** `apps/web/src/routes/dashboard/submissions/+page.svelte`

Make two improvements:

**A. Table column projection** — After the user selects a form from the sector → form cascading selector, dynamically show flat field columns derived from the submission rows' `fields` arrays. Limit to the first 5 fields. Each column header is the field `label`; each cell is the field `value` or `—` if null. Keep the existing metadata columns (entity, enumerator, date, status) pinned to the left.

**B. Submission detail drawer** — Clicking a table row opens a right-side panel (no page navigation). The panel calls `GET /reporting/submissions/:id` and renders:

- Header: form name, entity name, status badge
- Metadata row: enumerator, received date, start/end times, form version, GPS link if location present
- **Flat fields section**: a two-column key/value table using `label` → `value`, grouped by `begin_group` boundaries from the `xlsform_json` (groups appear as section headings). Skip `note`, `calculate`, and `hidden` type fields in the display — show only user-visible question types.
- **Raw JSON toggle**: a collapsed `<details>` block showing the full `raw_payload` formatted as pretty-printed JSON.
- DQA notes if present.
- Link: "View entity timeline →" pointing to `/dashboard/entities/:entity_id`.

#### 4. Design constraints

- Follow the Analytical Sanctuary design system: Manrope headlines, Inter body, MD3 colour tokens (`#0056d2` primary, `#f9f9ff` surface), `ambient-shadow` utility class. No border lines on cards.
- No external charting or table libraries. Pure CSS/HTML table with `overflow-x: auto` scroll for wide column sets.
- The detail drawer should use a fixed right panel (`position: fixed; right: 0`), overlaying content with a semi-transparent backdrop. Close on backdrop click or Escape key.
- All `svelte-check` errors must remain at 0 after changes. TypeScript strict mode is on.

#### 5. Role guard

`GET /reporting/submissions` and `GET /reporting/submissions/:id` are already supervisor+ endpoints. No role changes needed. The submissions page load should not be reachable by enumerators — confirm the dashboard layout guard covers it; if not, add `if (user.role === 'enumerator') redirect(303, '/dashboard')` in the page's server load using `await parent()` (not `locals`).

#### 6. What NOT to do

- Do not add new SQL migration files. No schema changes required — the existing `payload JSONB` + `form_versions.xlsform_json` is sufficient.
- Do not create new hardcoded reporting views. The generic flattening via `xlsform_json` is the solution for new forms; existing views can be queried for the four seed forms as an optimization if desired, but the generic path must work as the fallback.
- Do not add a separate `/dashboard/submissions/:id` route — use the drawer pattern to keep navigation in the list view.

---

### Files to touch (summary)

| File                                                        | Change                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/api/src/routes/reporting.ts`                          | Update `GET /reporting/submissions/:id` to return `fields[]`; add flat-field summary to paginated list |
| `apps/web/src/lib/types.ts`                                 | Add `FlatField`, `SubmissionDetail`; extend `Submission` with `fields`                                 |
| `apps/web/src/routes/dashboard/submissions/+page.server.ts` | Pass through `fields` from list; add detail-fetch action or sub-route                                  |
| `apps/web/src/routes/dashboard/submissions/+page.svelte`    | Dynamic column projection + detail drawer                                                              |
