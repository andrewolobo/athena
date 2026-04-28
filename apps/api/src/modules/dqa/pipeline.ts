/**
 * DQA (Data Quality Assurance) Pipeline
 *
 * Runs 5 sequential checks on every incoming submission before any write
 * reaches a sector table.
 *
 * Steps:
 *  1. Schema validation    — required survey fields present in payload
 *  2. Freshness check      — submission age ≤ 72 h
 *  3. Uniqueness check     — no prior non-quarantined submission for
 *                            the same entity+form with start_time > 24 h ago
 *  4. Conflict detection   — overlapping start_time within ±24 h window
 *  5. Pass                 — INSERT into sector table, status = 'pending'
 */

import { pool } from "../../db";
import { notify } from "../notifications";

// ── Constants ─────────────────────────────────────────────────
const FRESHNESS_LIMIT_MS = 72 * 60 * 60 * 1000; // 72 hours
const CONFLICT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Question types that don't produce submittable data fields.
const META_TYPES = new Set([
  "note",
  "group",
  "begin_group",
  "end_group",
  "begin_repeat",
  "end_repeat",
  "calculate",
  "start",
  "end",
  "deviceid",
  "simserial",
  "phonenumber",
]);

// ── Types ─────────────────────────────────────────────────────
export interface DqaSurveyField {
  type?: unknown;
  name?: unknown;
  required?: unknown;
}

export interface DqaInput {
  org_id: string;
  entity_id: string;
  form_id: string;
  form_version: number;
  enumerator_id: string;
  device_id?: string | null;
  start_time: Date;
  end_time: Date;
  server_received_at: Date;
  location?: { longitude: number; latitude: number } | null;
  payload: Record<string, unknown>;
  /** From public.forms */
  folder_schema: string;
  form_key: string;
  /** survey sheet rows from current form_version.xlsform_json */
  xlsform_survey: DqaSurveyField[];
}

export type DqaResult =
  | { outcome: "pass"; submission_id: string }
  | { outcome: "quarantine"; quarantine_id: string; reason: string }
  | { outcome: "conflict"; conflict_id: string };

// ── Helpers ───────────────────────────────────────────────────

/**
 * Validate that folder_schema and form_key are safe SQL identifiers
 * (lowercase letters, digits, underscores only — no dots, quotes, etc.).
 * Both values come from the DB but we re-validate before embedding in SQL.
 */
export function assertSafeIdentifier(v: string, label: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(v)) {
    throw new Error(`Unsafe SQL identifier for ${label}: '${v}'`);
  }
}

/** Step 1 — Schema validation */
function validatePayloadSchema(
  payload: Record<string, unknown>,
  survey: DqaSurveyField[],
): string[] {
  const errors: string[] = [];
  for (const row of survey) {
    const type = String(row.type ?? "")
      .toLowerCase()
      .split(" ")[0]
      .trim();
    if (!type || META_TYPES.has(type)) continue;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const required = String(row.required ?? "")
      .trim()
      .toLowerCase();
    if ((required === "yes" || required === "true") && !(name in payload)) {
      errors.push(`Required field missing: ${name}`);
    }
  }
  return errors;
}

async function writeQuarantine(params: {
  org_id: string;
  payload: Record<string, unknown>;
  entity_id: string;
  form_id: string;
  enumerator_id: string;
  device_id?: string | null;
  failure_reason: string;
  failure_detail: Record<string, unknown>;
}): Promise<string> {
  const q = await pool.query(
    `INSERT INTO public.quarantine_queue
            (org_id, raw_payload, entity_id, form_id, enumerator_id, device_id,
             failure_reason, failure_detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      params.org_id,
      JSON.stringify(params.payload),
      params.entity_id,
      params.form_id,
      params.enumerator_id,
      params.device_id ?? null,
      params.failure_reason,
      JSON.stringify(params.failure_detail),
    ],
  );
  return q.rows[0].id as string;
}

// ── Main pipeline ─────────────────────────────────────────────
export async function runDqaPipeline(input: DqaInput): Promise<DqaResult> {
  assertSafeIdentifier(input.folder_schema, "folder_schema");
  assertSafeIdentifier(input.form_key, "form_key");
  const sectorTable = `${input.folder_schema}.submissions_${input.form_key}`;

  // ── Step 1: Schema validation ──────────────────────────────
  const schemaErrors = validatePayloadSchema(
    input.payload,
    input.xlsform_survey,
  );
  if (schemaErrors.length > 0) {
    const qId = await writeQuarantine({
      ...input,
      failure_reason: "schema_error",
      failure_detail: { errors: schemaErrors },
    });
    await notify({
      org_id: input.org_id,
      type: "quarantine_alert",
      title: "Submission quarantined: schema error",
      body: schemaErrors.join("; "),
      reference_id: qId,
      reference_table: "quarantine_queue",
    });
    return {
      outcome: "quarantine",
      quarantine_id: qId,
      reason: "schema_error",
    };
  }

  // ── Step 2: Freshness check ────────────────────────────────
  const ageMs = input.server_received_at.getTime() - input.end_time.getTime();
  if (ageMs > FRESHNESS_LIMIT_MS) {
    const ageHours = Math.round(ageMs / 3_600_000);
    const qId = await writeQuarantine({
      ...input,
      failure_reason: "freshness_violation",
      failure_detail: { age_hours: ageHours, threshold_hours: 72 },
    });
    await notify({
      org_id: input.org_id,
      type: "quarantine_alert",
      title: "Submission quarantined: freshness violation",
      body: `Submission is ${ageHours}h old (limit: 72h)`,
      reference_id: qId,
      reference_table: "quarantine_queue",
    });
    return {
      outcome: "quarantine",
      quarantine_id: qId,
      reason: "freshness_violation",
    };
  }

  // ── Steps 3 & 4 share a single sector-table query ──────────
  // We look for any non-quarantined submission for this entity+form.
  // • start_time OUTSIDE ±24 h window → plain duplicate (quarantine)
  // • start_time WITHIN  ±24 h window → temporal conflict
  const windowStart = new Date(input.start_time.getTime() - CONFLICT_WINDOW_MS);
  const windowEnd = new Date(input.start_time.getTime() + CONFLICT_WINDOW_MS);

  const existing = await pool.query<{ id: string; start_time: Date }>(
    `SELECT id, start_time
       FROM ${sectorTable}
      WHERE entity_id = $1
        AND form_id   = $2
        AND status   != 'quarantined'
      LIMIT 1`,
    [input.entity_id, input.form_id],
  );

  if (existing.rows.length > 0) {
    const { id: existingId, start_time: existingStartTime } = existing.rows[0];
    const existingTime = new Date(existingStartTime).getTime();
    const withinWindow =
      existingTime >= windowStart.getTime() &&
      existingTime <= windowEnd.getTime();

    if (!withinWindow) {
      // ── Step 3: Duplicate ────────────────────────────────
      const qId = await writeQuarantine({
        ...input,
        failure_reason: "duplicate_entity",
        failure_detail: { existing_submission_id: existingId },
      });
      await notify({
        org_id: input.org_id,
        type: "quarantine_alert",
        title: "Submission quarantined: duplicate",
        body: "Entity already has an approved submission for this form",
        reference_id: qId,
        reference_table: "quarantine_queue",
      });
      return {
        outcome: "quarantine",
        quarantine_id: qId,
        reason: "duplicate_entity",
      };
    }

    // ── Step 4: Conflict ────────────────────────────────────
    // Record the incoming payload as the branch; the existing row stays
    // as canonical. Do NOT write a new sector-table row.
    const conflict = await pool.query(
      `INSERT INTO public.submission_conflicts
              (org_id, entity_id, form_id,
               canonical_submission_id, canonical_table,
               branch_payload, branch_enumerator_id,
               branch_device_id, branch_submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.org_id,
        input.entity_id,
        input.form_id,
        existingId,
        sectorTable,
        JSON.stringify(input.payload),
        input.enumerator_id,
        input.device_id ?? null,
        input.start_time.toISOString(),
      ],
    );
    const conflictId = conflict.rows[0].id as string;

    await notify({
      org_id: input.org_id,
      type: "conflict_detected",
      title: "Submission conflict detected",
      body: "Two submissions within 24 h for the same entity and form",
      reference_id: conflictId,
      reference_table: "submission_conflicts",
    });

    return { outcome: "conflict", conflict_id: conflictId };
  }

  // ── Step 5: Pass ───────────────────────────────────────────
  let row: { id: string };

  if (input.location) {
    const r = await pool.query(
      `INSERT INTO ${sectorTable}
              (entity_id, form_id, form_version, enumerator_id, device_id,
               start_time, end_time, server_received_at,
               location, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
               $11, 'pending')
       RETURNING id`,
      [
        input.entity_id,
        input.form_id,
        input.form_version,
        input.enumerator_id,
        input.device_id ?? null,
        input.start_time.toISOString(),
        input.end_time.toISOString(),
        input.server_received_at.toISOString(),
        input.location.longitude,
        input.location.latitude,
        JSON.stringify(input.payload),
      ],
    );
    row = r.rows[0];
  } else {
    const r = await pool.query(
      `INSERT INTO ${sectorTable}
              (entity_id, form_id, form_version, enumerator_id, device_id,
               start_time, end_time, server_received_at, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING id`,
      [
        input.entity_id,
        input.form_id,
        input.form_version,
        input.enumerator_id,
        input.device_id ?? null,
        input.start_time.toISOString(),
        input.end_time.toISOString(),
        input.server_received_at.toISOString(),
        JSON.stringify(input.payload),
      ],
    );
    row = r.rows[0];
  }

  return { outcome: "pass", submission_id: row.id };
}

/**
 * Re-run DQA for a supervisor-resolved quarantine entry.
 * Freshness and the original failure check are skipped; the supervisor's
 * explicit approval is honoured.  Writes directly to sector table with
 * status = 'approved'.
 */
export async function resolveQuarantinedSubmission(params: {
  org_id: string;
  entity_id: string;
  form_id: string;
  form_version: number;
  enumerator_id: string;
  device_id?: string | null;
  start_time: Date;
  end_time: Date;
  location?: { longitude: number; latitude: number } | null;
  payload: Record<string, unknown>;
  folder_schema: string;
  form_key: string;
  xlsform_survey: DqaSurveyField[];
}): Promise<string> {
  assertSafeIdentifier(params.folder_schema, "folder_schema");
  assertSafeIdentifier(params.form_key, "form_key");
  const sectorTable = `${params.folder_schema}.submissions_${params.form_key}`;
  const now = new Date();

  let submissionId: string;
  if (params.location) {
    const r = await pool.query(
      `INSERT INTO ${sectorTable}
              (entity_id, form_id, form_version, enumerator_id, device_id,
               start_time, end_time, server_received_at,
               location, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
               $11, 'approved')
       RETURNING id`,
      [
        params.entity_id,
        params.form_id,
        params.form_version,
        params.enumerator_id,
        params.device_id ?? null,
        params.start_time.toISOString(),
        params.end_time.toISOString(),
        now.toISOString(),
        params.location.longitude,
        params.location.latitude,
        JSON.stringify(params.payload),
      ],
    );
    submissionId = r.rows[0].id;
  } else {
    const r = await pool.query(
      `INSERT INTO ${sectorTable}
              (entity_id, form_id, form_version, enumerator_id, device_id,
               start_time, end_time, server_received_at, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved')
       RETURNING id`,
      [
        params.entity_id,
        params.form_id,
        params.form_version,
        params.enumerator_id,
        params.device_id ?? null,
        params.start_time.toISOString(),
        params.end_time.toISOString(),
        now.toISOString(),
        JSON.stringify(params.payload),
      ],
    );
    submissionId = r.rows[0].id;
  }

  return submissionId;
}
