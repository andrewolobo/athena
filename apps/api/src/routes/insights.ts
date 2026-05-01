/**
 * Insights module — endpoints powering the Insight Builder side panel
 * and the home-dashboard pinned-insights grid.
 *
 * Read endpoints (Step 2):
 *   GET    /insights/fields       list pinnable fields for one form
 *   GET    /insights/aggregate    counts grouped by a single field
 *
 * Persistence endpoints (Step 4):
 *   GET    /insights/mine         caller's pinned insights
 *   POST   /insights              create a pinned insight
 *   PATCH  /insights/:id          update title/description/chart_type/...
 *   DELETE /insights/:id          owner-only delete
 *
 * Security model:
 *  - All routes are gated by requireAuth(["admin", "supervisor"]).
 *  - resolveFormTable() enforces org isolation on every read request.
 *  - PATCH and DELETE additionally require user_id = req.user.id; admins
 *    do not override per-user pins.
 *  - The selected `field` query / body param is matched against the
 *    form's latest xlsform_json AND constrained to /^[a-z_][a-z0-9_]*$/
 *    as a second line of defence; it is then bound as a parameter to
 *    `payload->>$N` so the value never reaches the SQL parser as text.
 *  - `time_grain` is whitelisted to {day, week, month}; the validated
 *    value is interpolated into the query as a literal because
 *    DATE_TRUNC's first argument has type-resolution quirks across pg
 *    versions when bound as a parameter.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";
import { resolveFormTable } from "../modules/forms/resolveFormTable";
import {
  GROUP_TYPES,
  SKIP_TYPES,
  loadLatestSurvey,
  normalizeLabel,
} from "../modules/forms/survey";
import {
  deriveKind,
  isPinnableKind,
  type InsightKind,
} from "../modules/insights/typing";

const router = Router();
router.use(requireAuth(["admin", "supervisor"]));

// ── Constants & types ────────────────────────────────────────

const FIELD_NAME_RE = /^[a-z_][a-z0-9_]*$/;

/** Top-N visible buckets returned to the client. Anything beyond is
 *  summed into a synthetic '__other__' bucket so the client can render
 *  the long tail without scrolling, while still seeing total volume. */
const TOP_BUCKETS = 50;

/** Defensive ceiling on rows returned from the categorical aggregation.
 *  M&E forms are typically low-cardinality (select_one with bounded
 *  choice lists); this guard exists for the pathological case so a
 *  misclassified field can't load tens of thousands of rows into Node. */
const MAX_BUCKET_ROWS = 1000;

type TimeGrain = "day" | "week" | "month";
type AggregateKind = "categorical" | "temporal";

interface FieldDescriptor {
  name: string;
  label: string;
  xlsform_type: string;
  kind: InsightKind;
}

function parseGrain(v: unknown): TimeGrain | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "day" || t === "week" || t === "month") return t;
  return null;
}

/** Walk the xlsform_json survey array, returning one descriptor per
 * leaf field (skipping notes, calculates, hidden, group dividers). */
function buildFieldDescriptors(
  survey: Record<string, unknown>[],
): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  for (const row of survey) {
    const type = typeof row["type"] === "string" ? row["type"].trim() : "";
    const name = typeof row["name"] === "string" ? row["name"].trim() : "";
    if (!type || !name) continue;
    if (SKIP_TYPES.has(type)) continue;
    if (GROUP_TYPES.has(type)) continue;
    fields.push({
      name,
      label: normalizeLabel(row["label"], name),
      xlsform_type: type,
      kind: deriveKind(type),
    });
  }
  return fields;
}

// ── GET /insights/fields ─────────────────────────────────────
// Returns every leaf field defined by the form's latest xlsform_json,
// each tagged with its analytic kind. The UI uses `kind` to enable or
// disable the "Insight" affordance per column header — non-pinnable
// fields are still returned so the UI can render an explanatory tooltip.
router.get(
  "/fields",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveFormTable(
        req.user!.org_id,
        req.query.folder_schema,
        req.query.form_key,
        next,
      );
      if (!resolved) return;

      const survey = await loadLatestSurvey(pool, resolved.formId);
      res.json(buildFieldDescriptors(survey));
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /insights/aggregate ──────────────────────────────────
// Aggregates submissions for a single payload field.
//
// Query params:
//   folder_schema (required)  e.g. 'wash_sector'
//   form_key      (required)  e.g. 'water_point_baseline'
//   field         (required)  payload key, must match xlsform_json
//   kind          (required)  'categorical' | 'temporal'
//   time_grain    (temporal)  'day' | 'week' | 'month'   default 'month'
//   status        (optional)  filter to one status; default excludes 'quarantined'
//
// Response (categorical):
//   { field, label, kind: 'categorical',
//     buckets: [{ key, label, count }, ...], total }
//
// Response (temporal):
//   { field, label, kind: 'temporal', time_grain,
//     series: [{ bucket: 'YYYY-MM-DD', count }, ...], total }
router.get(
  "/aggregate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveFormTable(
        req.user!.org_id,
        req.query.folder_schema,
        req.query.form_key,
        next,
      );
      if (!resolved) return;
      const { tableName, formId, tableExists } = resolved;

      // ── Validate `field` and `kind` ────────────────────────
      const field =
        typeof req.query.field === "string" ? req.query.field.trim() : "";
      if (!field || !FIELD_NAME_RE.test(field)) {
        return next(
          createError(
            "Query param `field` is required and must be a simple field name (lowercase letters, digits, underscores)",
            422,
          ),
        );
      }

      const requestedKind = req.query.kind;
      if (requestedKind !== "categorical" && requestedKind !== "temporal") {
        return next(
          createError(
            "Query param `kind` must be 'categorical' or 'temporal'",
            422,
          ),
        );
      }
      const kind: AggregateKind = requestedKind;

      // Cross-check the field exists in the latest survey definition
      // and that its derived kind matches the requested aggregation.
      const survey = await loadLatestSurvey(pool, formId);
      const descriptor =
        buildFieldDescriptors(survey).find((f) => f.name === field) ?? null;

      if (!descriptor) {
        return next(
          createError(`Field '${field}' not found in this form`, 404),
        );
      }
      if (!isPinnableKind(descriptor.kind) || descriptor.kind !== kind) {
        return next(
          createError(
            `Field '${field}' is ${descriptor.kind}; cannot aggregate as ${kind}`,
            422,
          ),
        );
      }

      // ── Empty-state shortcut ────────────────────────────────
      // Sector table not yet materialised (form registered but no submissions).
      if (!tableExists) {
        if (kind === "categorical") {
          res.json({
            field: descriptor.name,
            label: descriptor.label,
            kind: "categorical",
            buckets: [],
            total: 0,
          });
          return;
        }
        const grain = parseGrain(req.query.time_grain) ?? "month";
        res.json({
          field: descriptor.name,
          label: descriptor.label,
          kind: "temporal",
          time_grain: grain,
          series: [],
          total: 0,
        });
        return;
      }

      // ── Build common WHERE: org-scoped via form_id, status filter ──
      const params: unknown[] = [formId, field];
      const whereParts: string[] = ["s.form_id = $1"];

      const status =
        typeof req.query.status === "string" ? req.query.status.trim() : "";
      if (status) {
        params.push(status);
        whereParts.push(`s.status = $${params.length}`);
      } else {
        // Match indicators.ts behaviour: exclude quarantined rows by default.
        whereParts.push("s.status != 'quarantined'");
      }

      const where = whereParts.join(" AND ");

      // ── Categorical aggregation ────────────────────────────
      if (kind === "categorical") {
        const sql = `
          SELECT
            COALESCE(NULLIF(s.payload->>$2, ''), '__unspecified__') AS bucket_key,
            COUNT(*)::int AS count
          FROM ${tableName} s
          WHERE ${where}
          GROUP BY bucket_key
          ORDER BY count DESC, bucket_key ASC
          LIMIT ${MAX_BUCKET_ROWS}
        `;
        const result = await pool.query<{
          bucket_key: string;
          count: number;
        }>(sql, params);

        // Sentinel labels are translated client-side; we emit a sensible default.
        const labelFor = (key: string): string =>
          key === "__unspecified__" ? "Unspecified" : key;

        const allRows = result.rows;
        const total = allRows.reduce((acc, r) => acc + r.count, 0);

        // Slice top N and roll the long tail into '__other__'. The synthetic
        // bucket is only emitted when the rollup is non-empty.
        const topRows = allRows.slice(0, TOP_BUCKETS);
        const restRows = allRows.slice(TOP_BUCKETS);

        const buckets = topRows.map((r) => ({
          key: r.bucket_key,
          label: labelFor(r.bucket_key),
          count: r.count,
        }));

        if (restRows.length > 0) {
          const otherCount = restRows.reduce((acc, r) => acc + r.count, 0);
          if (otherCount > 0) {
            buckets.push({
              key: "__other__",
              label: "Other",
              count: otherCount,
            });
          }
        }

        res.json({
          field: descriptor.name,
          label: descriptor.label,
          kind: "categorical",
          buckets,
          total,
        });
        return;
      }

      // ── Temporal aggregation ───────────────────────────────
      const grain = parseGrain(req.query.time_grain) ?? "month";
      // grain is whitelisted above; safe to interpolate as a SQL literal.
      const grainLiteral = grain;

      // POSIX regex (Postgres `~`) — \d is not supported, use [0-9].
      // We only attempt the timestamptz cast for values that look like
      // an ISO date prefix; everything else collapses to NULL and is
      // discarded by the HAVING clause.
      const sql = `
        SELECT
          DATE_TRUNC(
            '${grainLiteral}',
            CASE
              WHEN s.payload->>$2 ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN (s.payload->>$2)::timestamptz
              ELSE NULL
            END
          ) AS bucket,
          COUNT(*)::int AS count
        FROM ${tableName} s
        WHERE ${where}
          AND s.payload ? $2
          AND s.payload->>$2 IS NOT NULL
          AND s.payload->>$2 <> ''
        GROUP BY bucket
        HAVING DATE_TRUNC(
          '${grainLiteral}',
          CASE
            WHEN s.payload->>$2 ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            THEN (s.payload->>$2)::timestamptz
            ELSE NULL
          END
        ) IS NOT NULL
        ORDER BY bucket ASC
      `;

      const result = await pool.query<{ bucket: Date; count: number }>(
        sql,
        params,
      );

      const series = result.rows.map((r) => ({
        bucket: r.bucket.toISOString().slice(0, 10),
        count: r.count,
      }));
      const total = series.reduce((acc, b) => acc + b.count, 0);

      res.json({
        field: descriptor.name,
        label: descriptor.label,
        kind: "temporal",
        time_grain: grain,
        series,
        total,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Persistence endpoints (Step 4) ──────────────────────────

/** Hard cap on pinned insights per user. Prevents accidental pin-spam
 *  and keeps the home-dashboard grid finite. */
const MAX_INSIGHTS_PER_USER = 50;

const ChartTypeEnum = z.enum(["pie", "bar_horizontal", "line"]);
const DataKindEnum = z.enum(["categorical", "temporal"]);
const TimeGrainEnum = z.enum(["day", "week", "month"]);

const CreateInsightSchema = z.object({
  form_id: z.string().uuid(),
  field_name: z
    .string()
    .regex(FIELD_NAME_RE, "field_name must be a simple field name")
    .max(100),
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  chart_type: ChartTypeEnum,
  data_kind: DataKindEnum,
  time_grain: TimeGrainEnum.optional(),
  filters: z.record(z.unknown()).optional(),
  dashboard_id: z.string().uuid().optional(),
});

const UpdateInsightSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  chart_type: ChartTypeEnum.optional(),
  time_grain: TimeGrainEnum.nullable().optional(),
  pin_order: z.number().int().nonnegative().optional(),
  is_pinned: z.boolean().optional(),
});

/** Cross-field check: chart_type must agree with data_kind, and temporal
 *  insights must declare a time_grain. Returns an error message when
 *  invalid, or null when the combination is acceptable. */
function validateChartShape(
  data_kind: "categorical" | "temporal",
  chart_type: "pie" | "bar_horizontal" | "line",
  time_grain: string | null | undefined,
): string | null {
  if (data_kind === "temporal") {
    if (chart_type !== "line") {
      return "Temporal insights must use chart_type='line'";
    }
    if (!time_grain) {
      return "Temporal insights require time_grain";
    }
  } else {
    if (chart_type === "line") {
      return "Categorical insights cannot use chart_type='line'";
    }
  }
  return null;
}

// ── GET /insights/mine ────────────────────────────────────────
// Returns the caller's pinned insights, ordered for the dashboard grid.
router.get("/mine", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params: unknown[] = [req.user!.id];
    let dashboardFilter = "";
    const rawDashboardId = req.query.dashboard_id;
    if (typeof rawDashboardId === "string" && rawDashboardId.trim()) {
      params.push(rawDashboardId.trim());
      dashboardFilter = `AND dashboard_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT id, org_id, user_id, form_id, folder_schema, form_key,
                field_name, title, description, chart_type, data_kind,
                time_grain, filters, is_pinned, pin_order, dashboard_id,
                created_at, updated_at
           FROM public.user_insights
          WHERE user_id = $1 AND is_pinned = TRUE
          ${dashboardFilter}
          ORDER BY pin_order ASC, created_at DESC`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ── POST /insights ────────────────────────────────────────────
// Persists a new pinned insight after validating that the field exists
// in the form's latest xlsform_json and matches the requested data_kind.
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateInsightSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(parsed.error.issues[0].message, 422));
    }
    const d = parsed.data;

    const shapeErr = validateChartShape(
      d.data_kind,
      d.chart_type,
      d.time_grain ?? null,
    );
    if (shapeErr) return next(createError(shapeErr, 422));

    // Form must belong to caller's org. Resolves folder_schema /
    // form_key from the registry so the client can't spoof them.
    const formResult = await pool.query<{
      id: string;
      folder_schema: string;
      form_key: string;
    }>(
      `SELECT id, folder_schema, form_key FROM public.forms
          WHERE id = $1 AND org_id = $2`,
      [d.form_id, req.user!.org_id],
    );
    if (!formResult.rows[0]) {
      return next(createError("Form not found in this organisation", 404));
    }
    const form = formResult.rows[0];

    // Verify the field exists in the latest xlsform_json and that its
    // derived kind matches the requested data_kind.
    const survey = await loadLatestSurvey(pool, form.id);
    const descriptor =
      buildFieldDescriptors(survey).find((f) => f.name === d.field_name) ??
      null;
    if (!descriptor) {
      return next(
        createError(`Field '${d.field_name}' not found in this form`, 404),
      );
    }
    if (!isPinnableKind(descriptor.kind) || descriptor.kind !== d.data_kind) {
      return next(
        createError(
          `Field '${d.field_name}' is ${descriptor.kind}; cannot pin as ${d.data_kind}`,
          422,
        ),
      );
    }

    // If a dashboard_id was provided, verify it belongs to the caller.
    if (d.dashboard_id) {
      const dashResult = await pool.query(
        `SELECT id FROM public.user_dashboards WHERE id = $1 AND user_id = $2`,
        [d.dashboard_id, req.user!.id],
      );
      if (!dashResult.rows[0]) {
        return next(createError("Dashboard not found", 404));
      }
    }

    // Per-user cap. There's a benign race here under concurrent
    // create requests; acceptable at Alpha scope.
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
           FROM public.user_insights
          WHERE user_id = $1`,
      [req.user!.id],
    );
    const existing = parseInt(countResult.rows[0]?.count ?? "0", 10);
    if (existing >= MAX_INSIGHTS_PER_USER) {
      return next(
        createError(
          `You have reached the limit of ${MAX_INSIGHTS_PER_USER} pinned insights`,
          409,
        ),
      );
    }

    // Append at the end of the grid. NULL + 1 = NULL, so COALESCE to 0.
    const orderResult = await pool.query<{ next_order: number | null }>(
      `SELECT COALESCE(MAX(pin_order), -1) + 1 AS next_order
           FROM public.user_insights
          WHERE user_id = $1`,
      [req.user!.id],
    );
    const pin_order = orderResult.rows[0]?.next_order ?? 0;

    const insertResult = await pool.query(
      `INSERT INTO public.user_insights
                (org_id, user_id, form_id, folder_schema, form_key, field_name,
                 title, description, chart_type, data_kind, time_grain,
                 filters, is_pinned, pin_order, dashboard_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, $13, $14)
         RETURNING id, org_id, user_id, form_id, folder_schema, form_key,
                   field_name, title, description, chart_type, data_kind,
                   time_grain, filters, is_pinned, pin_order, dashboard_id,
                   created_at, updated_at`,
      [
        req.user!.org_id,
        req.user!.id,
        form.id,
        form.folder_schema,
        form.form_key,
        d.field_name,
        d.title,
        d.description ?? null,
        d.chart_type,
        d.data_kind,
        d.time_grain ?? null,
        JSON.stringify(d.filters ?? {}),
        pin_order,
        d.dashboard_id ?? null,
      ],
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /insights/:id ───────────────────────────────────────
// Owner-only update. Re-validates the chart shape against the row's
// existing data_kind whenever chart_type or time_grain changes.
router.patch(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateInsightSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }
      const patch = parsed.data;

      if (Object.keys(patch).length === 0) {
        return next(createError("Request body has no updatable fields", 422));
      }

      // Load the existing row scoped to the caller; missing → 404.
      const existing = await pool.query<{
        id: string;
        data_kind: "categorical" | "temporal";
        chart_type: "pie" | "bar_horizontal" | "line";
        time_grain: "day" | "week" | "month" | null;
      }>(
        `SELECT id, data_kind, chart_type, time_grain
           FROM public.user_insights
          WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user!.id],
      );
      if (!existing.rows[0]) {
        return next(createError("Insight not found", 404));
      }
      const row = existing.rows[0];

      // Compute the post-patch chart shape and re-validate.
      const nextChartType = patch.chart_type ?? row.chart_type;
      const nextTimeGrain =
        patch.time_grain === undefined ? row.time_grain : patch.time_grain;
      const shapeErr = validateChartShape(
        row.data_kind,
        nextChartType,
        nextTimeGrain,
      );
      if (shapeErr) return next(createError(shapeErr, 422));

      // Build a dynamic UPDATE — only sets the fields actually present
      // in the patch so omitted keys keep their stored value.
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      const push = (col: string, val: unknown): void => {
        sets.push(`${col} = $${idx++}`);
        params.push(val);
      };

      if (patch.title !== undefined) push("title", patch.title);
      if (patch.description !== undefined)
        push("description", patch.description);
      if (patch.chart_type !== undefined) push("chart_type", patch.chart_type);
      if (patch.time_grain !== undefined) push("time_grain", patch.time_grain);
      if (patch.pin_order !== undefined) push("pin_order", patch.pin_order);
      if (patch.is_pinned !== undefined) push("is_pinned", patch.is_pinned);

      sets.push(`updated_at = NOW()`);

      params.push(req.params.id, req.user!.id);
      const idParam = idx++;
      const userParam = idx++;

      const updateResult = await pool.query(
        `UPDATE public.user_insights
            SET ${sets.join(", ")}
          WHERE id = $${idParam} AND user_id = $${userParam}
         RETURNING id, org_id, user_id, form_id, folder_schema, form_key,
                   field_name, title, description, chart_type, data_kind,
                   time_grain, filters, is_pinned, pin_order,
                   created_at, updated_at`,
        params,
      );

      res.json(updateResult.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /insights/:id ──────────────────────────────────────
// Owner-only hard delete. No soft-delete column on user_insights —
// pinning is already a soft-hide via is_pinned=false.
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `DELETE FROM public.user_insights
          WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [req.params.id, req.user!.id],
      );
      if (!result.rows[0]) {
        return next(createError("Insight not found", 404));
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
