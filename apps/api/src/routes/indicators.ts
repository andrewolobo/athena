import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";
import { assertSafeIdentifier } from "../modules/dqa/pipeline";

const router = Router();

// ── Shared schema ─────────────────────────────────────────────
const IndicatorSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  unit_of_measure: z.string().max(100).optional(),
  disaggregations: z.array(z.string().max(100)).optional(),
  baseline_value: z.number().optional(),
  baseline_date: z.string().date().optional(),
  annual_target: z.number().optional(),
  reporting_period_start: z.string().date().optional(),
  reporting_period_end: z.string().date().optional(),
  source_form_id: z.string().uuid().optional(),
  // Only simple field names (used in payload->>'fieldname'). No dots/operators.
  source_field_path: z
    .string()
    .max(100)
    .regex(
      /^[a-z_][a-z0-9_]*$/,
      "source_field_path must be a simple field name (lowercase, underscores only)",
    )
    .optional(),
  aggregation_fn: z.enum(["count", "sum", "avg", "count_distinct"]).optional(),
});

// ── Helper: verify form belongs to org ───────────────────────
async function assertFormBelongsToOrg(
  formId: string,
  orgId: string,
  next: NextFunction,
): Promise<boolean> {
  const check = await pool.query(
    `SELECT id FROM public.forms WHERE id = $1 AND org_id = $2`,
    [formId, orgId],
  );
  if (!check.rows[0]) {
    next(createError("Form not found in this organisation", 404));
    return false;
  }
  return true;
}

// ── GET /indicators ───────────────────────────────────────────
router.get(
  "/",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT i.*,
                f.display_name         AS source_form_name,
                f.form_key             AS source_form_key,
                ia_latest.actual_value AS latest_actual_value,
                ia_latest.period_start AS latest_period_start,
                ia_latest.period_end   AS latest_period_end,
                ia_latest.computed_at  AS latest_computed_at
           FROM public.indicators i
           LEFT JOIN public.forms f ON f.id = i.source_form_id
           LEFT JOIN LATERAL (
               SELECT actual_value, period_start, period_end, computed_at
                 FROM public.indicator_actuals
                WHERE indicator_id = i.id
                ORDER BY period_start DESC
                LIMIT 1
           ) ia_latest ON TRUE
          WHERE i.org_id = $1
          ORDER BY i.created_at DESC`,
        [req.user!.org_id],
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /indicators ──────────────────────────────────────────
router.post(
  "/",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = IndicatorSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }
      const d = parsed.data;

      if (d.source_form_id) {
        const ok = await assertFormBelongsToOrg(
          d.source_form_id,
          req.user!.org_id,
          next,
        );
        if (!ok) return;
      }

      const result = await pool.query(
        `INSERT INTO public.indicators
                (org_id, code, name, description, unit_of_measure, disaggregations,
                 baseline_value, baseline_date, annual_target,
                 reporting_period_start, reporting_period_end,
                 source_form_id, source_field_path, aggregation_fn, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          req.user!.org_id,
          d.code,
          d.name,
          d.description ?? null,
          d.unit_of_measure ?? null,
          d.disaggregations ?? null,
          d.baseline_value ?? null,
          d.baseline_date ?? null,
          d.annual_target ?? null,
          d.reporting_period_start ?? null,
          d.reporting_period_end ?? null,
          d.source_form_id ?? null,
          d.source_field_path ?? null,
          d.aggregation_fn ?? null,
          req.user!.id,
        ],
      );
      res.status(201).json(result.rows[0]);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "23505") {
        return next(
          createError("An indicator with this code already exists", 409),
        );
      }
      next(err);
    }
  },
);

// ── GET /indicators/:id ───────────────────────────────────────
router.get(
  "/:id",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT i.*,
                f.display_name AS source_form_name,
                f.form_key     AS source_form_key,
                COALESCE(json_agg(ia ORDER BY ia.period_start DESC)
                  FILTER (WHERE ia.id IS NOT NULL), '[]') AS actuals
           FROM public.indicators i
           LEFT JOIN public.forms f ON f.id = i.source_form_id
           LEFT JOIN public.indicator_actuals ia ON ia.indicator_id = i.id
          WHERE i.id = $1 AND i.org_id = $2
          GROUP BY i.id, f.display_name, f.form_key`,
        [req.params.id, req.user!.org_id],
      );

      if (!result.rows[0]) {
        return next(createError("Indicator not found", 404));
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /indicators/:id ───────────────────────────────────────
router.put(
  "/:id",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = IndicatorSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }
      const d = parsed.data;

      if (d.source_form_id) {
        const ok = await assertFormBelongsToOrg(
          d.source_form_id,
          req.user!.org_id,
          next,
        );
        if (!ok) return;
      }

      const result = await pool.query(
        `UPDATE public.indicators
            SET code                   = $1,
                name                   = $2,
                description            = $3,
                unit_of_measure        = $4,
                disaggregations        = $5,
                baseline_value         = $6,
                baseline_date          = $7,
                annual_target          = $8,
                reporting_period_start = $9,
                reporting_period_end   = $10,
                source_form_id         = $11,
                source_field_path      = $12,
                aggregation_fn         = $13
          WHERE id = $14 AND org_id = $15
         RETURNING *`,
        [
          d.code,
          d.name,
          d.description ?? null,
          d.unit_of_measure ?? null,
          d.disaggregations ?? null,
          d.baseline_value ?? null,
          d.baseline_date ?? null,
          d.annual_target ?? null,
          d.reporting_period_start ?? null,
          d.reporting_period_end ?? null,
          d.source_form_id ?? null,
          d.source_field_path ?? null,
          d.aggregation_fn ?? null,
          req.params.id,
          req.user!.org_id,
        ],
      );

      if (!result.rows[0]) {
        return next(createError("Indicator not found", 404));
      }
      res.json(result.rows[0]);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "23505") {
        return next(
          createError("An indicator with this code already exists", 409),
        );
      }
      next(err);
    }
  },
);

// ── DELETE /indicators/:id ────────────────────────────────────
router.delete(
  "/:id",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `DELETE FROM public.indicators WHERE id = $1 AND org_id = $2 RETURNING id`,
        [req.params.id, req.user!.org_id],
      );
      if (!result.rows[0]) {
        return next(createError("Indicator not found", 404));
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /indicators/:id/compute ──────────────────────────────
// Runs the configured aggregate function against the source form's sector
// table and upserts the result into indicator_actuals.
const ComputeSchema = z.object({
  period_start: z.string().date(),
  period_end: z.string().date(),
  notes: z.string().max(500).optional(),
});

router.post(
  "/:id/compute",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ComputeSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }
      const { period_start, period_end, notes } = parsed.data;

      if (new Date(period_end) <= new Date(period_start)) {
        return next(createError("period_end must be after period_start", 422));
      }

      // Load indicator + joined form metadata in one query
      const indResult = await pool.query<{
        id: string;
        org_id: string;
        source_form_id: string | null;
        source_field_path: string | null;
        aggregation_fn: string | null;
        folder_schema: string | null;
        form_key: string | null;
      }>(
        `SELECT i.id, i.org_id, i.source_form_id, i.source_field_path,
                i.aggregation_fn, f.folder_schema, f.form_key
           FROM public.indicators i
           LEFT JOIN public.forms f ON f.id = i.source_form_id
          WHERE i.id = $1 AND i.org_id = $2`,
        [req.params.id, req.user!.org_id],
      );

      if (!indResult.rows[0]) {
        return next(createError("Indicator not found", 404));
      }

      const ind = indResult.rows[0];

      if (
        !ind.source_form_id ||
        !ind.aggregation_fn ||
        !ind.folder_schema ||
        !ind.form_key
      ) {
        return next(
          createError(
            "Indicator requires source_form_id and aggregation_fn to be computed automatically",
            422,
          ),
        );
      }

      // Validate table name components before embedding in SQL
      assertSafeIdentifier(ind.folder_schema, "folder_schema");
      assertSafeIdentifier(ind.form_key, "form_key");
      const tableName = `${ind.folder_schema}.submissions_${ind.form_key}`;

      // Build the aggregate expression.
      // source_field_path is already constrained by the DB insert to match
      // /^[a-z_][a-z0-9_]*$/ (enforced by IndicatorSchema above). The regex
      // below is a defence-in-depth guard at read time.
      const fieldPath = ind.source_field_path;
      const fn = ind.aggregation_fn;

      let aggregateExpr: string;

      if (fn === "count" && !fieldPath) {
        // COUNT(*) — no field required
        aggregateExpr = "COUNT(*)";
      } else {
        if (!fieldPath || !/^[a-z_][a-z0-9_]*$/.test(fieldPath)) {
          return next(
            createError(
              "source_field_path is required and must be a simple field name (lowercase letters and underscores only)",
              422,
            ),
          );
        }
        // fieldPath is safe to embed; it matches [a-z_][a-z0-9_]*
        switch (fn) {
          case "count":
            aggregateExpr = `COUNT(payload->>'${fieldPath}')`;
            break;
          case "count_distinct":
            aggregateExpr = `COUNT(DISTINCT payload->>'${fieldPath}')`;
            break;
          case "sum":
            aggregateExpr = `SUM((payload->>'${fieldPath}')::numeric)`;
            break;
          case "avg":
            aggregateExpr = `AVG((payload->>'${fieldPath}')::numeric)`;
            break;
          default:
            return next(createError("Unknown aggregation function", 422));
        }
      }

      const aggResult = await pool.query<{ actual_value: string | null }>(
        // Table name validated above; aggregateExpr built from safe strings only.
        `SELECT ${aggregateExpr} AS actual_value
           FROM ${tableName}
          WHERE status != 'quarantined'
            AND start_time >= $1
            AND start_time <  $2`,
        [period_start, period_end],
      );

      const actual_value =
        parseFloat(aggResult.rows[0]?.actual_value ?? "0") || 0;

      // Upsert so repeated calls within the same period refresh the value
      const upsertResult = await pool.query(
        `INSERT INTO public.indicator_actuals
                (indicator_id, period_start, period_end, actual_value, computed_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (indicator_id, period_start, period_end)
         DO UPDATE SET actual_value = EXCLUDED.actual_value,
                       computed_at  = NOW(),
                       computed_by  = EXCLUDED.computed_by,
                       notes        = COALESCE(EXCLUDED.notes, indicator_actuals.notes)
         RETURNING *`,
        [
          ind.id,
          period_start,
          period_end,
          actual_value,
          req.user!.id,
          notes ?? null,
        ],
      );

      res.json(upsertResult.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
