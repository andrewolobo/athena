import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";
import {
  resolveQuarantinedSubmission,
  DqaSurveyField,
} from "../modules/dqa/pipeline";

const router = Router();
router.use(requireAuth(["admin", "supervisor"]));

// ── GET /quarantine ───────────────────────────────────────────
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)),
    );
    const offset = (page - 1) * limit;

    const conditions: string[] = ["q.org_id = $1", "q.resolved = false"];
    const params: unknown[] = [req.user!.org_id];
    let idx = 2;

    const { failure_reason, form_id } = req.query;

    if (failure_reason && typeof failure_reason === "string") {
      conditions.push(`q.failure_reason = $${idx++}`);
      params.push(failure_reason);
    }
    if (form_id && typeof form_id === "string") {
      conditions.push(`q.form_id = $${idx++}`);
      params.push(form_id);
    }

    const where = conditions.join(" AND ");

    const [countResult, rowsResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM public.quarantine_queue q WHERE ${where}`,
        params,
      ),
      pool.query(
        `SELECT q.id, q.org_id, q.entity_id, q.form_id, q.enumerator_id,
                q.failure_reason, q.failure_detail, q.raw_payload,
                q.resolved, q.queued_at
           FROM public.quarantine_queue q
          WHERE ${where}
          ORDER BY q.queued_at DESC
          LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      data: rowsResult.rows,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /quarantine/:id/resolve ──────────────────────────────
const ResolveSchema = z.object({
  resolution_note: z.string().max(1000).optional(),
});

router.post(
  "/:id/resolve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ResolveSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      // Load the quarantine entry + form metadata
      const qResult = await pool.query<{
        id: string;
        org_id: string;
        raw_payload: Record<string, unknown>;
        entity_id: string;
        form_id: string;
        enumerator_id: string;
        device_id: string | null;
        resolved: boolean;
      }>(
        `SELECT q.id, q.org_id, q.raw_payload, q.entity_id, q.form_id,
                q.enumerator_id, q.device_id, q.resolved
           FROM public.quarantine_queue q
          WHERE q.id = $1 AND q.org_id = $2`,
        [req.params.id, req.user!.org_id],
      );

      if (!qResult.rows[0]) {
        return next(createError("Quarantine entry not found", 404));
      }

      const q = qResult.rows[0];

      if (q.resolved) {
        return next(createError("Quarantine entry is already resolved", 409));
      }

      // Load form + current version
      const formResult = await pool.query<{
        folder_schema: string;
        form_key: string;
        xlsform_json: { survey: DqaSurveyField[] };
        current_version: number;
      }>(
        `SELECT f.folder_schema, f.form_key, f.current_version, fv.xlsform_json
           FROM public.forms f
           JOIN public.form_versions fv
             ON fv.form_id = f.id AND fv.version = f.current_version
          WHERE f.id = $1`,
        [q.form_id],
      );

      if (!formResult.rows[0]) {
        return next(createError("Associated form not found", 422));
      }

      const { folder_schema, form_key, xlsform_json, current_version } =
        formResult.rows[0];

      // Extract timing fields from raw_payload (written at ingestion time)
      const raw = q.raw_payload as Record<string, unknown>;
      const startTime = raw.start_time
        ? new Date(raw.start_time as string)
        : new Date();
      const endTime = raw.end_time
        ? new Date(raw.end_time as string)
        : new Date();

      let location: { longitude: number; latitude: number } | null = null;
      if (
        raw.location &&
        typeof raw.location === "object" &&
        raw.location !== null
      ) {
        const loc = raw.location as Record<string, unknown>;
        if (
          typeof loc.longitude === "number" &&
          typeof loc.latitude === "number"
        ) {
          location = { longitude: loc.longitude, latitude: loc.latitude };
        }
      }

      const submissionId = await resolveQuarantinedSubmission({
        org_id: q.org_id,
        entity_id: q.entity_id,
        form_id: q.form_id,
        form_version: current_version,
        enumerator_id: q.enumerator_id,
        device_id: q.device_id,
        start_time: startTime,
        end_time: endTime,
        location,
        payload: raw,
        folder_schema,
        form_key,
        xlsform_survey: xlsform_json.survey ?? [],
      });

      // Mark quarantine entry resolved
      await pool.query(
        `UPDATE public.quarantine_queue
            SET resolved        = true,
                resolved_by     = $1,
                resolved_at     = NOW(),
                resolution_note = $2
          WHERE id = $3`,
        [req.user!.id, parsed.data.resolution_note ?? null, q.id],
      );

      // Audit log
      await pool.query(
        `INSERT INTO public.audit_log
                (org_id, actor_id, action, target_table, target_id, after_state)
         VALUES ($1, $2, 'quarantine.resolve', 'quarantine_queue', $3, $4)`,
        [
          req.user!.org_id,
          req.user!.id,
          q.id,
          JSON.stringify({
            submission_id: submissionId,
            resolution_note: parsed.data.resolution_note,
          }),
        ],
      );

      res.json({ status: "resolved", submission_id: submissionId });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /quarantine/:id/reject ───────────────────────────────
const RejectSchema = z.object({
  resolution_note: z.string().min(1).max(1000),
});

router.post(
  "/:id/reject",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = RejectSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const result = await pool.query(
        `UPDATE public.quarantine_queue
            SET resolved        = true,
                resolved_by     = $1,
                resolved_at     = NOW(),
                resolution_note = $2
          WHERE id = $3 AND org_id = $4 AND resolved = false
         RETURNING id`,
        [
          req.user!.id,
          parsed.data.resolution_note,
          req.params.id,
          req.user!.org_id,
        ],
      );

      if (!result.rows[0]) {
        return next(
          createError("Quarantine entry not found or already resolved", 404),
        );
      }

      await pool.query(
        `INSERT INTO public.audit_log
                (org_id, actor_id, action, target_table, target_id, after_state)
         VALUES ($1, $2, 'quarantine.reject', 'quarantine_queue', $3, $4)`,
        [
          req.user!.org_id,
          req.user!.id,
          req.params.id,
          JSON.stringify({ resolution_note: parsed.data.resolution_note }),
        ],
      );

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
