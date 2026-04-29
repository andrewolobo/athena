Let me check the current state of the relevant files before writing the plan.

Let me also check the submissions server load and the types file.

Good. I have everything I need. Here's the full execution plan:

---

## Execution Plan: Bulk CSV Export

### What already exists (no duplication needed)

- `flattenPayload()` in [reporting.ts:65](apps/api/src/routes/reporting.ts) — already flattens a single row against `xlsform_json`, supports unlimited fields when no `limit` is passed
- `resolveFormTable()` in [reporting.ts:112](apps/api/src/routes/reporting.ts) — already validates org ownership and runs `assertSafeIdentifier` on dynamic identifiers
- The `GET /reporting/submissions` paginated route already joins entity/enumerator metadata
- The submissions page already has `folder_schema` and `form_key` in the URL query string

Nothing needs restructuring. The export is an additive feature with three touch points.

---

### Step 1 — API: `GET /reporting/submissions/export`

**File:** `apps/api/src/routes/reporting.ts`

Add a new route **before** the existing `router.get('/submissions/:id', ...)` at line 250 so Express matches the literal path `export` first.

**Query params:** `folder_schema` (required), `form_key` (required), `status` (optional), `entity_id` (optional) — same filter surface as the paginated endpoint.

**Implementation:**

1. Call `resolveFormTable()` — reuses all existing org-scoping and identifier validation.
2. Load the latest `xlsform_json` from `form_versions` for this form (same query pattern as the paginated endpoint at line 193).
3. Extract the `survey` array. Derive the CSV column list: skip `note`, `calculate`, `hidden`, `end_group`, `end_repeat` types. Keep `begin_group` entries only to produce a section-prefixed column header (e.g. `"Household Details > water_source_type"`). This keeps the CSV flat with no structural rows.
4. Query ALL rows from the sector table (no LIMIT) with LEFT JOINs to `public.entities` and `public.users` for `entity_name`, `enumerator_display_name`, `enumerator_email`. Also join `public.form_versions` on `form_id + form_version` to capture the exact version used per row. Use `ST_AsGeoJSON(location)::json` to extract lat/lng.
5. Set response headers before writing any data:
   ```
   Content-Type: text/csv; charset=utf-8
   Content-Disposition: attachment; filename="${form_key}_${YYYY-MM-DD}.csv"
   Transfer-Encoding: chunked
   ```
   The filename uses `form_key` only (already validated by `assertSafeIdentifier` — no user-controlled values).
6. Write the header row via `res.write()` — fixed metadata columns first, then one column per question field (using `label` as the header, falling back to `name`):
   ```
   submission_id, entity_id, entity_name, enumerator_email, enumerator_name,
   start_time, end_time, server_received_at, form_version, status, dqa_notes,
   latitude, longitude, [field labels…]
   ```
7. For each row: call `flattenPayload(survey, row.payload)` (no limit), build a map of `name → value`, then write a CSV row in the same column order.
8. CSV escaping: wrap every cell in double quotes, escape internal double quotes by doubling them (`"` → `""`). Handle `null` as empty string. Apply this to every cell — metadata and payload fields alike.
9. Call `res.end()` after all rows.

**Memory profile:** All rows are loaded into the `pool.query` result set before streaming begins. For Alpha scale (hundreds to low thousands of rows) this is acceptable. A streaming cursor is a post-Alpha optimization.

---

### Step 2 — SvelteKit proxy: `/dashboard/submissions/export`

**New file:** `apps/web/src/routes/dashboard/submissions/export/+server.ts`

The browser can't hit the Express API directly with the HttpOnly `athena_session` cookie (different origin). This server route proxies the download.

```typescript
import type { RequestHandler } from "./$types";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

export const GET: RequestHandler = async ({ cookies, url }) => {
  const token = cookies.get("athena_session");
  if (!token) redirect(303, "/login");

  const apiRes = await fetch(
    `${env.API_BASE_URL}/reporting/submissions/export?${url.searchParams.toString()}`,
    { headers: { Cookie: `athena_session=${token}` } },
  );

  if (apiRes.status === 401) redirect(303, "/login");
  if (!apiRes.ok)
    return new Response("Export failed", { status: apiRes.status });

  return new Response(apiRes.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        apiRes.headers.get("Content-Disposition") ??
        'attachment; filename="export.csv"',
    },
  });
};
```

`apiRes.body` is a `ReadableStream` — SvelteKit passes it through directly, so large files never accumulate in the proxy's memory.

---

### Step 3 — Frontend: Export button

**File:** `apps/web/src/routes/dashboard/submissions/+page.svelte`

Add an "Export CSV" anchor link in the form selector toolbar, visible only when both `folder_schema` and `form_key` are selected (same condition as the Load button visibility at line 103).

Place it to the right of the Load button as a secondary action:

```svelte
<a
  href="/dashboard/submissions/export?folder_schema={data.folderSchema}&form_key={data.formKey}"
  download
  class="px-4 py-2 bg-surface-variant/30 text-on-surface text-sm font-medium rounded-xl
         hover:bg-surface-variant/50 transition-colors ambient-shadow"
>
  Export CSV
</a>
```

The `download` attribute signals to the browser to treat it as a file download rather than navigation. The `href` carries the same `folder_schema` and `form_key` already in `data` — no new state needed. If a status filter is added to the page later, append it to the href at the same time.

No changes to `+page.server.ts` — the export is a GET to a different route, not a form action.

---

### No-change files

| File                                                        | Reason                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/web/src/lib/types.ts`                                 | No new types needed for a file download                         |
| `apps/web/src/routes/dashboard/submissions/+page.server.ts` | Export is a separate `+server.ts`, not a load action            |
| Any migration files                                         | No schema changes — export reads existing tables and views      |
| `apps/api/src/app.ts`                                       | `reportingRouter` is already mounted; no new router to register |

---

### Summary of files touched

| File                                                          | Action                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/api/src/routes/reporting.ts`                            | Add `GET /reporting/submissions/export` before the `/:id` route |
| `apps/web/src/routes/dashboard/submissions/export/+server.ts` | Create (new file) — proxy endpoint                              |
| `apps/web/src/routes/dashboard/submissions/+page.svelte`      | Add Export CSV anchor link in the selector toolbar              |
