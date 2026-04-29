/**
 * XLSForm survey utilities shared across reporting and insights.
 *
 * The DQA pipeline (apps/api/src/modules/dqa/pipeline.ts) maintains its
 * own stricter META_TYPES set used during ingestion validation; these
 * helpers are for read-time presentation and aggregation.
 */

import type { Pool } from "pg";

/** Question types that carry no user-visible answer and are skipped entirely. */
export const SKIP_TYPES = new Set([
  "note",
  "calculate",
  "hidden",
  "end_group",
  "end_repeat",
]);

/** Question types that open a named group / repeat block. */
export const GROUP_TYPES = new Set(["begin_group", "begin_repeat"]);

/**
 * Resolve an XLSForm label to a plain string.
 * label may be a string or a multilingual map like {"English (en)": "..."}.
 * Falls back to the provided fallback (typically the field's name).
 */
export function normalizeLabel(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw !== null && typeof raw === "object") {
    for (const v of Object.values(raw as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return fallback;
}

/**
 * Load the latest published version of a form's `xlsform_json` survey array.
 * Returns an empty array if no version exists or the survey field is missing
 * or malformed — callers can check `length === 0` to detect that case.
 */
export async function loadLatestSurvey(
  pool: Pool,
  formId: string,
): Promise<Record<string, unknown>[]> {
  const fvResult = await pool.query<{
    xlsform_json: { survey?: unknown[]; fields?: unknown[] };
  }>(
    `SELECT xlsform_json
       FROM public.form_versions
      WHERE form_id = $1
      ORDER BY version DESC
      LIMIT 1`,
    [formId],
  );
  const xls = fvResult.rows[0]?.xlsform_json;
  const rawSurvey = xls?.survey ?? xls?.fields;
  return Array.isArray(rawSurvey)
    ? (rawSurvey as Record<string, unknown>[])
    : [];
}
