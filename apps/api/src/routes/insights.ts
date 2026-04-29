/**
 * Insights module — read-only endpoints that power the Insight Builder
 * side panel in the Data Explorer.
 *
 * Endpoints (Step 2 — field discovery + aggregation):
 *   GET /insights/fields    list pinnable fields for one form
 *   GET /insights/aggregate counts grouped by a single field
 *
 * The CRUD endpoints for persisted user_insights rows arrive in Step 4.
 *
 * Security model:
 *  - All routes are gated by requireAuth(["admin", "supervisor"]).
 *  - resolveFormTable() enforces org isolation on every request.
 *  - The selected `field` query param is matched against the form's
 *    latest xlsform_json AND constrained to /^[a-z_][a-z0-9_]*$/ as a
 *    second line of defence; it is then bound as a parameter to
 *    `payload->>$N` so the value never reaches the SQL parser as text.
 *  - `time_grain` is whitelisted to {day, week, month}; the validated
 *    value is interpolated into the query as a literal because
 *    DATE_TRUNC's first argument has type-resolution quirks across pg
 *    versions when bound as a parameter.
 */

import { Router, Request, Response, NextFunction } from "express";
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

/** Hard cap on categorical buckets returned. M&E forms are typically
 * low-cardinality (select_one with bounded choice lists); this guard
 * exists for the pathological case so a misclassified field can't
 * return tens of thousands of rows. */
const MAX_BUCKETS = 100;

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
        return next(createError(`Field '${field}' not found in this form`, 404));
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
          LIMIT ${MAX_BUCKETS}
        `;
        const result = await pool.query<{
          bucket_key: string;
          count: number;
        }>(sql, params);

        const buckets = result.rows.map((r) => ({
          key: r.bucket_key,
          // Sentinel labels are translated client-side; we emit a sensible default.
          label:
            r.bucket_key === "__unspecified__" ? "Unspecified" : r.bucket_key,
          count: r.count,
        }));
        const total = buckets.reduce((acc, b) => acc + b.count, 0);

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

export default router;
