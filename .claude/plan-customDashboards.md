# Custom Dashboards — Implementation Plan

> Extends the existing Insight Builder (pinning to a flat personal grid) into a
> named, navigable **Custom Dashboards** system, accessible at `/dashboard/reporting`.

---

## How the new feature fits the existing system

| Current state | After this feature |
|---|---|
| `user_insights` pins to one implicit personal grid on `/dashboard` | Insights pin to a named `UserDashboard` container |
| "Pin to Dashboard" in InsightBuilder fires immediately | A dashboard picker step appears first (select or create) |
| `/dashboard/reporting` nav link leads nowhere | Full reporting page: tab navigation across all user dashboards |
| Home `/dashboard` shows all pinned insights | Home `/dashboard` shows the **default** dashboard's insights |

---

## Phase 1 — Database (1 migration)

**New file:** `apps/database/migrations/1777890000000_user_dashboards.sql`

```sql
CREATE TABLE public.user_dashboards (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID        NOT NULL REFERENCES public.organizations(id),
    user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    description   TEXT        CHECK (char_length(description) <= 300),
    is_default    BOOLEAN     NOT NULL DEFAULT FALSE,
    display_order INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PostgreSQL partial unique index: only one default per user
CREATE UNIQUE INDEX idx_user_dashboards_one_default
    ON public.user_dashboards (user_id) WHERE (is_default = TRUE);

CREATE INDEX idx_user_dashboards_user
    ON public.user_dashboards (user_id, display_order);

CREATE INDEX idx_user_dashboards_org
    ON public.user_dashboards (org_id);

-- Extend user_insights with a dashboard binding
-- ON DELETE CASCADE: deleting a dashboard removes its charts
ALTER TABLE public.user_insights
    ADD COLUMN dashboard_id UUID REFERENCES public.user_dashboards(id) ON DELETE CASCADE;

CREATE INDEX idx_user_insights_dashboard
    ON public.user_insights (dashboard_id, pin_order);
```

**Key decisions:**

- `dashboard_id` is nullable so existing insights are not broken. The home dashboard
  renders `dashboard_id IS NULL` insights plus those from the default dashboard — a
  backfill migration is optional, not required.
- `ON DELETE CASCADE` on `dashboard_id`: deleting a dashboard deletes its charts.
  Clear, expected behaviour.
- Partial unique index for `is_default` is the idiomatic PostgreSQL approach (no
  boolean workarounds needed in application code).
- Cap at 20 dashboards per user (enforced in the route handler, not the DB).

---

## Phase 2 — Backend API

**New file:** `apps/api/src/routes/dashboards.ts`

All endpoints: `requireAuth(['admin', 'supervisor'])`, scoped to `req.user.id` / `req.user.org_id`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/dashboards` | List user's dashboards, ordered `is_default DESC, display_order ASC` |
| `POST` | `/dashboards` | Create dashboard. Body: `{ name, description?, is_default? }`. Returns 201. |
| `PATCH` | `/dashboards/:id` | Update name / description / is_default / display_order. Owner-only. |
| `DELETE` | `/dashboards/:id` | Delete dashboard + cascade its insights. Owner-only. Returns 204. |

`POST` Zod schema:

```ts
const CreateDashboardSchema = z.object({
  name:        z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  is_default:  z.boolean().optional(),
});
```

`PATCH` logic for `is_default=true`: within a transaction, run
`UPDATE ... SET is_default=FALSE WHERE user_id=$1` then set the target row to `TRUE`.
This atomically enforces the one-default invariant without relying solely on the
partial index.

Cap: check `COUNT(*) FROM user_dashboards WHERE user_id=$1` before insert; reject
409 if ≥ 20.

**Modify** `apps/api/src/routes/insights.ts`:

- `POST /insights`: add `dashboard_id: z.string().uuid()` to `CreateInsightSchema`.
  Validate the dashboard belongs to the caller
  (`SELECT id FROM user_dashboards WHERE id=$1 AND user_id=$2`). Return 404 if not found.
- `GET /insights/mine`: add optional `?dashboard_id=UUID` query param. When provided,
  filter by `dashboard_id = $1`; when absent, return all (preserves home-dashboard
  backward compatibility).

**Register in** `apps/api/src/app.ts`:

```ts
import { dashboardsRouter } from './routes/dashboards';
app.use('/dashboards', dashboardsRouter);
```

---

## Phase 3 — Frontend Types

**Edit** `apps/web/src/lib/types.ts`:

```ts
export interface UserDashboard {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Add to existing UserInsight interface:
// dashboard_id: string | null;  // null = legacy insight (pre-migration)
```

---

## Phase 4 — SvelteKit Proxy Routes

**New files** (mirror existing proxy pattern at `apps/web/src/routes/api/insights/`):

- `apps/web/src/routes/api/dashboards/+server.ts` — handles `GET` (list) and `POST` (create)
- `apps/web/src/routes/api/dashboards/[id]/+server.ts` — handles `PATCH` and `DELETE`

Both forward `athena_session` cookie to the upstream API.

---

## Phase 5 — InsightBuilder: Dashboard Picker

**Edit** `apps/web/src/lib/components/insights/InsightBuilder.svelte`

Add a "Pin to Dashboard" section between the chart preview and the footer buttons.
Replace the immediate-pin pattern with a picker:

```
[ Chart preview ]

[ Pin to Dashboard ]
  ┌──────────────────────────────────┐
  │ Select a dashboard          [▾] │  ← dropdown lists UserDashboard[].name
  │ ── Create new dashboard ──      │  ← bottom option in dropdown
  └──────────────────────────────────┘
  [ inline: new dashboard name field + Create button ]  ← shown on "Create new" select
```

New local state:

```ts
let dashboards: UserDashboard[] = [];
let selectedDashboardId: string | null = null;
let showNewDashboard = false;
let newDashboardName = '';
let creatingDashboard = false;
let dashboardsLoading = false;
```

Behaviour:

1. On builder `open = true`: fetch `GET /api/dashboards`; auto-select the default
   dashboard (or first one if none is default).
2. If `dashboards.length === 0`: skip the dropdown; show "You haven't created any
   dashboards yet" with an inline name field.
3. Selecting "Create new…" from the dropdown shows an inline name field + "Create"
   button → `POST /api/dashboards` → prepends result to `dashboards` → auto-selects it.
4. "Pin to Dashboard" button: enabled when `selectedDashboardId !== null && title.trim()`.
   Sends `dashboard_id: selectedDashboardId` in the POST body.
5. Success toast changes from "Pinned to your dashboard" to "Pinned to **{dashboardName}**".

---

## Phase 6 — Reporting Page

**New files:**

- `apps/web/src/routes/dashboard/reporting/+page.server.ts`
- `apps/web/src/routes/dashboard/reporting/+page.svelte`

**`+page.server.ts`:**

```ts
export const load = async ({ url, cookies, fetch }) => {
  const dashboards = await apiFetch<UserDashboard[]>('/dashboards', token);

  const activeDashboardId =
    url.searchParams.get('d') ??
    dashboards.find(d => d.is_default)?.id ??
    dashboards[0]?.id ??
    null;

  const insights = activeDashboardId
    ? await apiFetch<UserInsight[]>(`/insights/mine?dashboard_id=${activeDashboardId}`, token)
    : [];

  return { dashboards, activeDashboardId, insights };
};
```

**`+page.svelte`** layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ Reporting                                  [+ New Dashboard]     │
│                                                                  │
│ [My WASH Overview] [Health Monitoring] [Q2 Summary]              │  ← tab bar
│ ────────────────────────────────────────────────────────────────  │
│                                                                  │
│ My WASH Overview                            [Edit] [Delete]      │
│ Description text here                                            │
│                                                                  │
│ ┌───────────┐  ┌───────────┐  ┌───────────┐                     │
│ │ Chart 1   │  │ Chart 2   │  │ Chart 3   │                     │
│ └───────────┘  └───────────┘  └───────────┘                     │
│                                                                  │
│ [ Empty state: "Pin charts from the Data Explorer" CTA ]         │
└──────────────────────────────────────────────────────────────────┘
```

Implementation details:

- **Tab navigation**: each dashboard is a tab. Clicking a tab does `goto('?d=<id>')`
  — triggers a SvelteKit load re-run, swaps the insight grid. The URL is the source of
  truth so tabs are bookmarkable.
- **Dashboard management**: "New Dashboard" opens an inline slide-over form. Edit
  renames in-place via PATCH. Delete triggers a confirm dialog warning that all charts
  will be deleted.
- **Insight grid**: reuses `PinnedInsightsGrid.svelte` with the `insights` prop. The
  grid's per-tile delete menu calls `DELETE /api/insights/:id` and removes the tile
  locally.
- **Reorder**: out of scope for v1 (same deferral as `pin_order` in the original plan).

**Empty state — no dashboards:**

```
No dashboards yet
Create your first dashboard to start pinning charts from the Data Explorer.
[Create a Dashboard]
```

**Empty state — dashboard exists but no insights:**

```
This dashboard is empty
Go to the Data Explorer, click a column header, and pin charts here.
[Open Data Explorer →]
```

---

## Phase 7 — Home Dashboard Alignment

**Edit** `apps/web/src/routes/dashboard/+page.server.ts`:

Change the `pinnedInsights` load to fetch only the default dashboard's insights:

```ts
const dashboards = await apiFetch<UserDashboard[]>('/dashboards', token);
const defaultDashboard = dashboards.find(d => d.is_default) ?? dashboards[0];
const pinnedInsights = defaultDashboard
  ? await apiFetch<UserInsight[]>(`/insights/mine?dashboard_id=${defaultDashboard.id}`, token)
  : [];
```

**Edit** `apps/web/src/routes/dashboard/+page.svelte`:

Add a "View all dashboards →" link below the grid pointing to `/dashboard/reporting`.

---

## Phase 8 — OpenAPI Documentation

**Edit** `apps/api/openapi.yaml`:

- Add `UserDashboard` component schema
- Add `/dashboards` paths (GET, POST)
- Add `/dashboards/{id}` paths (PATCH, DELETE)
- Update `/insights` POST to document `dashboard_id` as required
- Update `/insights/mine` GET to document `dashboard_id` query param

---

## Files touched summary

```
NEW   apps/database/migrations/1777890000000_user_dashboards.sql
NEW   apps/api/src/routes/dashboards.ts
NEW   apps/web/src/routes/api/dashboards/+server.ts
NEW   apps/web/src/routes/api/dashboards/[id]/+server.ts
NEW   apps/web/src/routes/dashboard/reporting/+page.server.ts
NEW   apps/web/src/routes/dashboard/reporting/+page.svelte

EDIT  apps/api/src/routes/insights.ts           (dashboard_id in POST; filter in mine)
EDIT  apps/api/src/app.ts                       (mount /dashboards router)
EDIT  apps/api/openapi.yaml                     (/dashboards paths + UserDashboard schema)
EDIT  apps/web/src/lib/types.ts                 (UserDashboard type; UserInsight.dashboard_id)
EDIT  apps/web/src/lib/components/insights/InsightBuilder.svelte  (dashboard picker)
EDIT  apps/web/src/routes/dashboard/+page.server.ts               (load default dashboard)
EDIT  apps/web/src/routes/dashboard/+page.svelte                  (View all link)
```

The sidebar nav link is already wired (`/dashboard/reporting` with `bar_chart` icon)
— no layout changes needed.

---

## Open questions before implementation

1. **Deletion behaviour**: Plan assumes delete dashboard → cascade delete its insights.
   Alternative: orphan insights (set `dashboard_id = NULL`) and let the user re-pin
   them elsewhere. Cascade is simpler and expected; confirm before coding.

2. **`dashboard_id` required on POST /insights**: Making it required breaks existing
   clients until the InsightBuilder picker is shipped. Suggested: deploy the API change
   and the InsightBuilder change in the same release so there is no window where the
   contract is broken.

3. **Legacy insights (null `dashboard_id`)**: Existing pinned insights keep
   `dashboard_id = NULL`. The home dashboard grid can render these as-is for zero-risk
   migration. A one-time backfill script to assign them to a generated "My Dashboard"
   default can be added as a follow-up if preferred.

4. **Dashboard cap**: 20 per user proposed. Adjust if needed.
