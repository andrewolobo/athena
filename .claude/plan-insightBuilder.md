# Insight Builder — Implementation Plan

> Self-service ad-hoc visualisation builder for the ATHENA Data Explorer.
> Lets non-technical M&E officers click any column header in the Data Explorer
> table, get an instant chart of its distribution, and "pin" that chart to a
> personal dashboard or export it as PNG.

---

## 1. Scope reconciliation (spec ↔ ATHENA reality)

The original spec (`insight-builder.md`) was written generically and references a
"Participant_Directory" with hard-coded columns (`pt_gender_cd` etc.). ATHENA does
not have such a table — its data model is **dynamic**:

| Spec assumption                              | ATHENA reality                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| One fixed table `Participant_Directory`      | Each form has its own sector table `<folder_schema>.submissions_<form_key>` with a JSONB `payload`              |
| Hard-coded technical columns (`pt_gender_cd`) | Fields are defined per-form in `form_versions.xlsform_json` and stored as JSONB keys                            |
| Static metadata mapping layer                | Field metadata (label, type) already lives in the XLSForm definition — surfaced via `flattenPayload()`          |
| RLS by project permissions                   | ATHENA isolates by `org_id` on `public.forms`; sector tables are reached only via `resolveFormTable()`           |
| Fixed type taxonomy (Categorical/Numerical/Temporal) | Must be **derived** from XLSForm `type` (`select_one`, `integer`, `date`, etc.)                          |

**Net effect:** the feature lands on top of the existing Data Explorer. The
"data source" is whichever form the user already has open. The "metadata layer"
already exists — we just expose it as `(name, label, xlsform_type, derived_kind)`.

Out of scope for v1 (worth mentioning so reviewers can push back):

- Cross-form / cross-entity insights (would need a query builder; deferred).
- Numerical histograms with binning (the spec only calls out Categorical and
  Temporal defaults — keep numerical to a "summary stats" card for now).
- Per-user filter persistence beyond what's saved on a pinned chart.
- Sharing pinned charts with other users.

---

## 2. User flow

1. User navigates to `/dashboard/data-explorer`, selects a sector and form.
2. The submissions table renders as today, with one new affordance: a small
   "📊 Insight" button on every column header (categorical/temporal only;
   numerical and free-text show a disabled state with a tooltip).
3. Clicking the button opens a **right-hand side panel** (`InsightBuilder.svelte`) with three sections:
   - **Indicator details** — auto-populated label, technical name, and
     detected data type, with editable "Title" and "Description" inputs.
   - **Visualization type** — radio group filtered by data type
     (Categorical → Pie / Horizontal Bar; Temporal → Line, with "group by" =
     day / week / month).
   - **Dashboard pinning** — toggle "Pin to my dashboard", optional position hint.
4. The panel renders a live preview using **Chart.js** (already mature, MIT,
   tree-shakeable). Re-renders are debounced (200 ms) on config changes.
5. Action buttons at the foot of the panel:
   - **Pin to Dashboard** → POST `/insights` then close panel and toast.
   - **Export PNG** → use `html2canvas` against the preview canvas.
   - **Cancel** → close without saving.
6. The user's home dashboard (`/dashboard`) gains a "My Insights" grid that
   loads pinned charts from `/insights/mine` and renders each via the same
   `<ChartView>` component used in the preview.

---

## 3. Data model

### 3.1 New migration `apps/database/migrations/011_user_insights.sql`

```sql
CREATE TABLE public.user_insights (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL REFERENCES public.organizations(id),
    user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Source binding
    form_id         UUID        NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    folder_schema   TEXT        NOT NULL,
    form_key        TEXT        NOT NULL,
    field_name      TEXT        NOT NULL,         -- payload key, e.g. 'gender'

    -- Display & rendering
    title           TEXT        NOT NULL,
    description     TEXT,
    chart_type      TEXT        NOT NULL CHECK (
                          chart_type IN ('pie', 'bar_horizontal', 'line')
                       ),
    data_kind       TEXT        NOT NULL CHECK (
                          data_kind IN ('categorical', 'temporal')
                       ),
    -- Temporal-only: 'day' | 'week' | 'month'
    time_grain      TEXT        CHECK (time_grain IN ('day', 'week', 'month')),

    -- Snapshot of filters applied at pin time, e.g. {"status":"approved"}.
    -- Kept open-ended so we can grow it without a migration.
    filters         JSONB       NOT NULL DEFAULT '{}',

    -- Dashboard layout
    is_pinned       BOOLEAN     NOT NULL DEFAULT TRUE,
    pin_order       INTEGER     NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_insights_user    ON public.user_insights (user_id, is_pinned, pin_order);
CREATE INDEX idx_user_insights_org     ON public.user_insights (org_id);
CREATE INDEX idx_user_insights_form    ON public.user_insights (form_id);
```

**Notes**

- `org_id` denormalised so org-scoped deletes / reporting are cheap.
- `folder_schema` and `form_key` are denormalised alongside `form_id` so we can
  validate identifiers at read time without a join. They must always agree with
  `forms.id`; enforced by the route handler when writing.
- `ON DELETE CASCADE` on `form_id`: pinned charts disappear when their source
  form is deleted. Acceptable for Alpha.
- Rate / size-limit users to ≤ 50 pinned insights per user (enforced in route).

### 3.2 No materialised summary tables (yet)

The spec mentions caching. For Alpha the data volume is small (Alpha-scale per
CLAUDE.md), and Postgres `GROUP BY payload->>'<field>'` against the existing
GIN index on payload is acceptable. We add **HTTP-level** caching with
`Cache-Control: private, max-age=60` on the aggregation endpoint and an
`ETag`. If/when needed, a follow-up migration can create a refreshable
`MATERIALIZED VIEW` per (form, field). Call out as a **deferred item** in
the plan rather than building speculatively.

---

## 4. API surface

All routes mounted under `/insights` in `apps/api/src/app.ts`. New file:
`apps/api/src/routes/insights.ts`. Auth: `requireAuth(["admin", "supervisor"])`
matching the rest of the dashboard.

### 4.1 GET `/insights/fields?folder_schema&form_key`

Returns the list of pinnable fields for one form, derived from the latest
`form_versions.xlsform_json`. Response:

```json
[
  { "name": "gender", "label": "Gender", "xlsform_type": "select_one gender", "kind": "categorical" },
  { "name": "age",    "label": "Age",    "xlsform_type": "integer",            "kind": "numerical"   },
  { "name": "registration_date", "label": "Registered", "xlsform_type": "date", "kind": "temporal" }
]
```

`kind` derivation (`apps/api/src/modules/insights/typing.ts`):

```ts
const CATEGORICAL = new Set(['select_one', 'select_multiple', 'text']);
const NUMERICAL   = new Set(['integer', 'decimal', 'range']);
const TEMPORAL    = new Set(['date', 'datetime', 'time']);

function deriveKind(xlsformType: string): 'categorical' | 'numerical' | 'temporal' | 'unknown' {
  const head = xlsformType.split(/\s+/)[0]; // strip choice list name
  if (CATEGORICAL.has(head)) return 'categorical';
  if (NUMERICAL.has(head))   return 'numerical';
  if (TEMPORAL.has(head))    return 'temporal';
  return 'unknown';
}
```

This util is unit-tested independently.

### 4.2 GET `/insights/aggregate?folder_schema&form_key&field&kind&time_grain&status&start_date&end_date`

Returns the data for a chart.

**Response shape (categorical):**

```json
{
  "field":  "gender",
  "label":  "Gender",
  "kind":   "categorical",
  "buckets": [
    { "key": "female",       "label": "Female",       "count": 142 },
    { "key": "male",          "label": "Male",         "count": 138 },
    { "key": "__unspecified__","label": "Unspecified", "count": 12  }
  ],
  "total": 292
}
```

**Response shape (temporal):**

```json
{
  "field": "registration_date", "label": "Registered", "kind": "temporal",
  "time_grain": "month",
  "series": [
    { "bucket": "2026-01-01", "count": 41 },
    { "bucket": "2026-02-01", "count": 67 }
  ],
  "total": 108
}
```

**SQL strategy:**

- Reuse `resolveFormTable()` from `reporting.ts` to validate `folder_schema`,
  `form_key`, and resolve `form_id` → org isolation comes for free.
- Re-validate the field name against the latest form version's xlsform_json
  before embedding it in `payload->>'<field>'`. We **must not** trust user
  input as a JSONB key in raw SQL — even though `->>` is parameter-friendly
  semantically, parameterised JSONB key access (`payload->>$2`) is supported
  by `pg`, so we use it: `payload->>$N`. This avoids the identifier-validation
  dance entirely on the data side.
- `start_time` is the canonical timestamp for temporal aggregations (matches
  the indicator compute path in `indicators.ts`).
- For temporal queries, use `DATE_TRUNC($grain, start_time)`. `time_grain` is
  whitelisted (`day` | `week` | `month`); no string interpolation otherwise.
- Default WHERE clause: `status != 'quarantined'` (mirror indicators behaviour;
  override with `?status=` if requested).
- For categorical NULLs, `COALESCE(payload->>$2, '__unspecified__')` so the
  spec's "Unspecified" bucket appears in results.
- Categorical: cap `LIMIT 50` buckets, sort by count DESC; everything past
  position 50 is collapsed into a single `{key:'__other__', count: N}` bucket
  client-side. (Document this; field cardinality is bounded in M&E forms.)

**Caching:** `Cache-Control: private, max-age=60`. Compute a weak ETag from
`(form_id, field, kind, time_grain, filters_hash, status_count)` and short-circuit
with 304 when matched. Optional in v1.

### 4.3 CRUD `/insights`

| Method | Path              | Body / Notes                                                                  |
| ------ | ----------------- | ----------------------------------------------------------------------------- |
| GET    | `/insights/mine`  | Returns the caller's pinned insights, ordered by `pin_order ASC, created_at`. |
| POST   | `/insights`       | Create. Validates form ownership and field validity. Returns 201.             |
| PATCH  | `/insights/:id`   | Update title / description / chart_type / time_grain / pin_order.             |
| DELETE | `/insights/:id`   | Owner only. Returns 204.                                                      |

`zod` schema for create:

```ts
const CreateInsightSchema = z.object({
  form_id: z.string().uuid(),
  field_name: z.string().regex(/^[a-z_][a-z0-9_]*$/).max(100),
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  chart_type: z.enum(['pie', 'bar_horizontal', 'line']),
  data_kind: z.enum(['categorical', 'temporal']),
  time_grain: z.enum(['day', 'week', 'month']).optional(),
  filters: z.record(z.unknown()).optional(),
});
```

Server-side cross-validation:

- `data_kind === 'temporal'` ⇒ `time_grain` required and `chart_type === 'line'`.
- `data_kind === 'categorical'` ⇒ `chart_type ∈ {pie, bar_horizontal}`.
- `field_name` must be present in the form's latest `xlsform_json` survey list,
  and its derived kind must match the requested `data_kind`.
- Cap of 50 pinned insights per user; reject 4th create with 409 + clear message.

### 4.4 OpenAPI

Add the new paths to `apps/api/openapi.yaml` under `/insights`. Keep
`InsightFieldDescriptor`, `InsightAggregateCategorical`, `InsightAggregateTemporal`,
and `UserInsight` as components.

---

## 5. Frontend

### 5.1 New dependencies (apps/web)

```jsonc
{
  "dependencies": {
    "chart.js": "^4.4.0",        // visualisation
    "html2canvas": "^1.4.1"      // PNG export
  }
}
```

Both are tree-shakeable. Chart.js is ~70 kB gzipped. We register only the
controllers and elements we actually use to keep the bundle tight:

```ts
// apps/web/src/lib/components/insights/chart.ts
import {
  Chart, ArcElement, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale, TimeScale, Tooltip, Legend, Title,
  PieController, BarController, LineController,
} from 'chart.js';
Chart.register(ArcElement, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale, TimeScale, Tooltip, Legend, Title,
  PieController, BarController, LineController);
export { Chart };
```

### 5.2 New types in `apps/web/src/lib/types.ts`

```ts
export type InsightKind = 'categorical' | 'temporal';
export type InsightChartType = 'pie' | 'bar_horizontal' | 'line';
export type InsightTimeGrain = 'day' | 'week' | 'month';

export interface InsightField {
  name: string;
  label: string;
  xlsform_type: string;
  kind: InsightKind | 'numerical' | 'unknown';
}

export interface InsightAggregateCategorical {
  field: string;
  label: string;
  kind: 'categorical';
  buckets: { key: string; label: string; count: number }[];
  total: number;
}

export interface InsightAggregateTemporal {
  field: string;
  label: string;
  kind: 'temporal';
  time_grain: InsightTimeGrain;
  series: { bucket: string; count: number }[];
  total: number;
}

export type InsightAggregate =
  | InsightAggregateCategorical
  | InsightAggregateTemporal;

export interface UserInsight {
  id: string;
  org_id: string;
  user_id: string;
  form_id: string;
  folder_schema: string;
  form_key: string;
  field_name: string;
  title: string;
  description: string | null;
  chart_type: InsightChartType;
  data_kind: InsightKind;
  time_grain: InsightTimeGrain | null;
  filters: Record<string, unknown>;
  is_pinned: boolean;
  pin_order: number;
  created_at: string;
  updated_at: string;
}
```

### 5.3 Component map

```
apps/web/src/lib/components/insights/
├── chart.ts                  # Chart.js controller registration
├── ChartView.svelte          # Pure renderer: takes config + data, draws chart
├── InsightBuilder.svelte     # Side-panel state machine (open/close, form, preview)
├── InsightFieldButton.svelte # Tiny "📊" button used in column headers
├── PinnedInsightsGrid.svelte # Renders the user's pinned charts on /dashboard
└── exportPng.ts              # html2canvas wrapper
```

`ChartView.svelte` accepts:

```ts
export let config: {
  chart_type: InsightChartType;
  data_kind: InsightKind;
  time_grain?: InsightTimeGrain;
  title: string;
};
export let data: InsightAggregate | null;
```

It owns the canvas, instantiates a `Chart`, and updates / destroys it on prop
changes. No data-fetching inside — keeps it reusable in both the preview and
the home-dashboard grid.

### 5.4 Data Explorer changes

`apps/web/src/routes/dashboard/data-explorer/+page.svelte`:

1. Each `<th>` (`columns` loop, line 124) becomes a flex row with the existing
   label text plus an `<InsightFieldButton>`. The button is enabled when a
   companion `fields` lookup says `kind ∈ {categorical, temporal}`.
2. Add a top-level `<InsightBuilder bind:open ... />` panel and reactive state
   `selectedField: InsightField | null`. When the button is clicked, set
   `selectedField` and `open = true`.
3. Load the field-kind metadata once per form via the page server load:

`apps/web/src/routes/dashboard/data-explorer/+page.server.ts`:

```ts
const fields = (folderSchema && formKey)
  ? await apiFetch<InsightField[]>(
      `/insights/fields?folder_schema=${encodeURIComponent(folderSchema)}&form_key=${encodeURIComponent(formKey)}`,
      token,
    )
  : [];
return { ..., fields };
```

### 5.5 InsightBuilder side panel

Local component state:

```ts
let title = '';
let description = '';
let chartType: InsightChartType;
let timeGrain: InsightTimeGrain = 'month';
let aggregate: InsightAggregate | null = null;
let saving = false;
let error: string | null = null;
```

Behaviour:

- On open, `title = field.label`, `chartType` defaults to `pie` (categorical)
  or `line` (temporal).
- A `debounce(200)` reactive block fetches `/insights/aggregate` whenever the
  config changes, populates `aggregate`, and re-renders `<ChartView>`.
- "Pin to Dashboard" calls `POST /insights`, then routes back to `/dashboard`
  with a success toast (or stays in place, configurable).
- "Export PNG" → `exportPng(chartContainerEl, ${title}.png)`; library is
  loaded dynamically via `await import('html2canvas')` so the dependency
  doesn't ship in the Data Explorer bundle when never used.

The fetch happens client-side (not via a SvelteKit `+server.ts` proxy), using
the session cookie that's automatically forwarded for same-origin requests
through the SvelteKit proxy. Since the API runs on a different port in dev,
we need a SvelteKit endpoint at `apps/web/src/routes/api/insights/+server.ts`
that proxies to the API and forwards the cookie — **mirror the existing
pattern** at `apps/web/src/routes/api/submissions/[id]/+server.ts`.

### 5.6 Home dashboard integration

`apps/web/src/routes/dashboard/+page.server.ts` — append a `pinnedInsights` load:

```ts
const pinnedInsights = await apiFetch<UserInsight[]>('/insights/mine', token);
```

`apps/web/src/routes/dashboard/+page.svelte` — add a new section after
"Recent Submissions":

```svelte
{#if pinnedInsights.length > 0}
  <PinnedInsightsGrid insights={pinnedInsights} />
{/if}
```

`PinnedInsightsGrid.svelte` fetches each insight's aggregate on mount in
parallel (`Promise.all`), shows a loading skeleton, then renders one
`<ChartView>` per item in a 1/2/3-column responsive grid. A small "kebab"
menu on each tile offers `Edit`, `Unpin`, `Delete`.

---

## 6. Security checklist

| Threat                                   | Mitigation                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cross-org data leakage                   | All routes start with `resolveFormTable(req.user.org_id, ...)` — same pattern as `reporting.ts`. Defence-in-depth via `assertSafeIdentifier`. |
| SQL injection via `field_name`           | Field name is matched against the active `xlsform_json` survey list and additionally constrained by `^[a-z_][a-z0-9_]*$`. JSONB lookups use `payload->>$N` parameterised binding. |
| SQL injection via `time_grain`           | Whitelisted enum (`day`/`week`/`month`); no interpolation otherwise.                                                                |
| Pinned-insight tampering                 | `PATCH/DELETE /insights/:id` requires `user_id = req.user.id`; admins do **not** override per-user pins (no admin override needed for Alpha). |
| Quota / abuse                            | 50 pinned insights per user; aggregate endpoint relies on existing rate-limit middleware (already on the API).                       |
| PNG export DOM injection                 | Title and description are rendered via Svelte's default escaping; `html2canvas` operates on the live DOM, not raw HTML strings.      |

---

## 7. Performance notes

- Existing GIN index on `payload` (`idx_*_payload`) supports
  `payload ? '<key>'` and equality lookups; for `GROUP BY payload->>'<key>'`
  the planner falls back to a sequential scan on the sector table. At Alpha
  volume this is fine.
- If a single form ever exceeds ~100 k submissions, add a partial expression
  index per top-N field, e.g.:
  `CREATE INDEX ON wash_sector.submissions_water_point_baseline ((payload->>'water_source_type'));`
  Document this as a runbook step rather than a default migration.
- Debounce client requests (200 ms) so a user dragging a slider doesn't fire
  10 queries.

---

## 8. Acceptance-criteria mapping (from the spec)

| Criterion                                                            | How this plan delivers it                                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| User can select a field and see a chart update within < 2 seconds.   | Single round trip to `/insights/aggregate`; queries are parameterised and indexed. Debounce 200 ms; payloads under 1 kB at expected cardinality. |
| User can pin a chart and see it persist after refresh.               | `user_insights` table + `/insights/mine` loaded by the home dashboard's server-side load.                                                       |
| Exported image contains title, legend, and clear labels.             | Chart.js native legend and title plugins; the `<ChartView>` component renders title in-canvas so `html2canvas` captures it.                     |
| Null/missing data shown as a separate "Unspecified" category.        | `COALESCE(payload->>$N, '__unspecified__')` in the aggregate SQL; client maps the sentinel back to the localised "Unspecified" label.            |

---

## 9. Step-by-step delivery (suggested order)

> Each step is shippable in isolation. Steps 1–4 form the MVP; 5–7 polish.

### Step 1 — Database & typing (backend foundation)

1. Add migration `apps/database/migrations/011_user_insights.sql`.
2. Add `apps/api/src/modules/insights/typing.ts` (deriveKind helper, unit-testable).
3. Run `npm run migrate:dev` and verify schema in psql.

**Verification:** migration applies cleanly; `\d public.user_insights` shows the table.

### Step 2 — `/insights/fields` and `/insights/aggregate`

1. Create `apps/api/src/routes/insights.ts`.
2. Mount in `apps/api/src/app.ts` after `reportingRouter`.
3. Implement both GET endpoints. Reuse `resolveFormTable()` (export it from
   `reporting.ts` if it isn't already, or duplicate the small helper —
   prefer extracting to `apps/api/src/modules/forms/resolveFormTable.ts`
   so we don't grow `reporting.ts`).
4. Add OpenAPI definitions.

**Verification:** curl the endpoints with a valid session cookie against the dev seed forms; manually confirm bucket counts.

### Step 3 — Frontend: chart preview behind a feature flag URL

1. Install `chart.js`. Build `ChartView.svelte` and `chart.ts`.
2. Build `InsightBuilder.svelte` and the `InsightFieldButton.svelte`.
3. Wire into `data-explorer/+page.svelte` and its `+page.server.ts` load (add `fields`).
4. Add SvelteKit proxy at `apps/web/src/routes/api/insights/+server.ts` and
   `.../api/insights/[id]/+server.ts` mirroring the submissions proxy.

**Verification:** clicking a column header renders a chart in <2 s for a small dev seed form.

### Step 4 — Pinning persistence

1. Implement `POST /insights`, `GET /insights/mine`, `PATCH /insights/:id`,
   `DELETE /insights/:id`.
2. Add `PinnedInsightsGrid.svelte` and load `pinnedInsights` from the home
   dashboard server load.

**Verification:** create → refresh → chart still there. Delete → it's gone.

### Step 5 — PNG export

1. Install `html2canvas`. Add `exportPng.ts`. Wire the export button.

**Verification:** PNG opens in an external image viewer with title + legend visible.

### Step 6 — Polish

1. Empty-state copy in the panel and in the pinned-insights grid.
2. Localise "Unspecified" string.
3. Clamp categorical buckets to top 50 + "Other".
4. Toast on save / delete.

### Step 7 — Documentation

1. Append the dashboard page entry in `CLAUDE.md` and the Dashboard Pages
   table — the home dashboard now optionally shows pinned insights; Data
   Explorer gains an "Insight" affordance.
2. Record the new API module in the API Modules table.

---

## 10. Files touched (summary)

```
NEW   apps/database/migrations/011_user_insights.sql
NEW   apps/api/src/routes/insights.ts
NEW   apps/api/src/modules/insights/typing.ts
NEW   apps/api/src/modules/forms/resolveFormTable.ts          (optional refactor)
EDIT  apps/api/src/app.ts                                     (mount /insights)
EDIT  apps/api/src/routes/reporting.ts                        (export resolveFormTable if extracted)
EDIT  apps/api/openapi.yaml                                   (add /insights paths)

NEW   apps/web/src/lib/components/insights/chart.ts
NEW   apps/web/src/lib/components/insights/ChartView.svelte
NEW   apps/web/src/lib/components/insights/InsightBuilder.svelte
NEW   apps/web/src/lib/components/insights/InsightFieldButton.svelte
NEW   apps/web/src/lib/components/insights/PinnedInsightsGrid.svelte
NEW   apps/web/src/lib/components/insights/exportPng.ts
NEW   apps/web/src/routes/api/insights/+server.ts             (proxy)
NEW   apps/web/src/routes/api/insights/[id]/+server.ts        (proxy)
NEW   apps/web/src/routes/api/insights/aggregate/+server.ts   (proxy)
NEW   apps/web/src/routes/api/insights/fields/+server.ts      (proxy)
NEW   apps/web/src/routes/api/insights/mine/+server.ts        (proxy)

EDIT  apps/web/src/lib/types.ts                               (Insight* types)
EDIT  apps/web/src/routes/dashboard/data-explorer/+page.server.ts
EDIT  apps/web/src/routes/dashboard/data-explorer/+page.svelte
EDIT  apps/web/src/routes/dashboard/+page.server.ts
EDIT  apps/web/src/routes/dashboard/+page.svelte
EDIT  apps/web/package.json                                   (chart.js, html2canvas)
```

---

## 11. Open questions / decisions for the user

1. **Chart library.** Spec mentions Chart.js *or* ApexCharts. This plan picks
   Chart.js (smaller, MIT, no extra runtime config). Ack to lock that in?
2. **Numerical fields.** Do we want histograms in v1, or a "Summary stats"
   card (count / mean / min / max / median)? Plan defers numerical to a
   separate ticket — confirm that's acceptable.
3. **Cross-form / cross-entity insights.** Keeping out of scope for v1. Confirm.
4. **Sharing pinned insights between users.** Per-user only in v1. Confirm.
5. **Enumerator role.** Today they can't access the dashboard at all
   (`+layout.server.ts` redirects). Insight Builder inherits that — confirm
   no change.
