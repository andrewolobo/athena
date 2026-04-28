/**
 * Ingestion — OpenRosa 1.0 compatible submission endpoint.
 *
 * Accepts multipart/form-data with:
 *  - xml_submission_file  (binary)  — XLSForm instance XML (metadata)
 *  - payload              (text)    — JSON survey answers + envelope fields
 *
 * The payload JSON must include:
 *   entity_id, form_id, form_version, start_time, end_time
 *   location? { longitude, latitude }
 *   ...all survey answer fields
 */

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";
import { runDqaPipeline, DqaSurveyField } from "../modules/dqa/pipeline";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ── Payload schema ────────────────────────────────────────────
const LocationSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});

const SubmissionEnvelopeSchema = z.object({
  entity_id: z.string().uuid(),
  form_id: z.string().uuid(),
  form_version: z.number().int().positive(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  location: LocationSchema.optional(),
});

/**
 * Extract the form_key from the OpenRosa XML root element's `id` attribute.
 * Used only to cross-validate against the DB; not authoritative.
 */
function extractXmlFormKey(xml: string): string | undefined {
  const match = xml.match(/<data\b[^>]*>/i);
  if (!match) return undefined;
  return match[0].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
}

// ── HEAD /submissions ─────────────────────────────────────────
router.head("/", requireAuth(), (_req: Request, res: Response) => {
  res.set("X-OpenRosa-Version", "1.0").sendStatus(204);
});

// ── POST /submissions ─────────────────────────────────────────
router.post(
  "/",
  requireAuth(),
  upload.single("xml_submission_file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // ── Parse envelope from multipart payload field ──────────
      const rawPayloadStr = req.body?.payload as string | undefined;
      if (!rawPayloadStr) {
        return next(
          createError("Missing `payload` field in multipart body", 422),
        );
      }

      let rawPayload: unknown;
      try {
        rawPayload = JSON.parse(rawPayloadStr);
      } catch {
        return next(createError("`payload` field must be valid JSON", 422));
      }

      if (
        typeof rawPayload !== "object" ||
        rawPayload === null ||
        Array.isArray(rawPayload)
      ) {
        return next(createError("`payload` must be a JSON object", 422));
      }

      const envelope = SubmissionEnvelopeSchema.safeParse(rawPayload);
      if (!envelope.success) {
        return next(createError(envelope.error.issues[0].message, 422));
      }

      const {
        entity_id,
        form_id,
        form_version,
        start_time,
        end_time,
        location,
      } = envelope.data;

      // Survey answers = everything except the envelope keys
      const envelopeKeys = new Set([
        "entity_id",
        "form_id",
        "form_version",
        "start_time",
        "end_time",
        "location",
      ]);
      const surveyAnswers: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(
        rawPayload as Record<string, unknown>,
      )) {
        if (!envelopeKeys.has(k)) surveyAnswers[k] = v;
      }

      // ── Optional XML cross-validation ───────────────────────
      if (req.file) {
        const xmlText = req.file.buffer.toString("utf8");
        const xmlFormKey = extractXmlFormKey(xmlText);
        // Non-fatal: log mismatch but continue (form_id is authoritative)
        if (xmlFormKey && !form_id.includes(xmlFormKey)) {
          // form_id is a UUID; we cannot directly compare to form_key.
          // This check is informational only for debugging.
        }
      }

      // ── Load form + current version from DB ──────────────────
      const formResult = await pool.query<{
        folder_schema: string;
        form_key: string;
        xlsform_json: { survey: DqaSurveyField[] };
        org_id: string;
      }>(
        `SELECT f.folder_schema, f.form_key, f.org_id, fv.xlsform_json
           FROM public.forms f
           JOIN public.form_versions fv
             ON fv.form_id = f.id AND fv.version = f.current_version
          WHERE f.id = $1 AND f.is_active = true`,
        [form_id],
      );

      if (!formResult.rows[0]) {
        return next(createError("Form not found or inactive", 422));
      }

      const {
        folder_schema,
        form_key,
        xlsform_json,
        org_id: form_org_id,
      } = formResult.rows[0];

      // Ensure the form belongs to the caller's org
      if (form_org_id !== req.user!.org_id) {
        return next(createError("Form not found or inactive", 422));
      }

      // Ensure the entity belongs to the caller's org
      const entityResult = await pool.query(
        `SELECT id FROM public.entities WHERE id = $1 AND org_id = $2`,
        [entity_id, req.user!.org_id],
      );
      if (!entityResult.rows[0]) {
        return next(createError("Entity not found in your organisation", 422));
      }

      // ── Run DQA pipeline ─────────────────────────────────────
      const serverReceivedAt = new Date();
      const result = await runDqaPipeline({
        org_id: req.user!.org_id,
        entity_id,
        form_id,
        form_version,
        enumerator_id: req.user!.id,
        device_id: null,
        start_time: new Date(start_time),
        end_time: new Date(end_time),
        server_received_at: serverReceivedAt,
        location: location ?? null,
        payload: surveyAnswers,
        folder_schema,
        form_key,
        xlsform_survey: xlsform_json.survey ?? [],
      });

      // ── Respond based on outcome ──────────────────────────────
      if (result.outcome === "pass") {
        res.status(202).json({
          status: "accepted",
          submission_id: result.submission_id,
        });
        return;
      }

      if (result.outcome === "quarantine") {
        res.status(202).json({
          status: "quarantined",
          quarantine_id: result.quarantine_id,
          reason: result.reason,
        });
        return;
      }

      // conflict
      res.status(409).json({
        error: "Submission conflict detected — two submissions within 24 h",
        conflict_id: result.conflict_id,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
