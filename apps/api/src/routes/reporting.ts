/**
 * Reporting module
 *
 * Serves flattened submission data for the SvelteKit dashboard.
 * All queries that touch dynamic sector tables first validate identifiers
 * against the forms registry (org-scoped) and then with assertSafeIdentifier.
 *
 * Endpoints:
 *   GET /reporting/submissions              paginated list from one form table
 *   GET /reporting/submissions/export       full CSV download for one form
 *   GET /reporting/submissions/:id          single submission detail
 *   GET /reporting/entities/:id/timeline    all submissions for one entity
 *   GET /reporting/map                      GPS points from one form table
 *   GET /reporting/summary                  org ITT snapshot
 */

import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";
import { assertSafeIdentifier } from "../modules/dqa/pipeline";

// ── Flat-field types and helpers ──────────────────────────────

export interface FlatField {
  name: string;
  label: string;
  type: string;
  value: string | null;
}

// Types that carry no user-visible answer value and are skipped entirely.
const SKIP_TYPES = new Set([
  "note",
  "calculate",
  "hidden",
  "end_group",
  "end_repeat",
]);

// Types that open a named group/repeat — emitted as section dividers with value:null.
const GROUP_TYPES = new Set(["begin_group", "begin_repeat"]);

/**
 * Resolve an XLSForm label to a plain string.
 * label may be a string or a multilingual map {"English (en)": "..."}.
 */
function normalizeLabel(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw !== null && typeof raw === "object") {
    for (const v of Object.values(raw as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return fallback;
}

/**
 * Flatten a submission payload against the form's xlsform survey array.
 *
 * @param survey  The `survey` array from `xlsform_json` stored in form_versions.
 * @param payload The raw JSONB payload from a submission row.
 * @param limit   Optional cap on the number of visible (non-group) fields emitted.
 *                Group dividers (begin_group) do not count toward this limit.
 */
export function flattenPayload(
  survey: Record<string, unknown>[],
  payload: Record<string, unknown>,
  limit?: number,
): FlatField[] {
  const fields: FlatField[] = [];
  let visibleCount = 0;

  for (const field of survey) {
    const type = typeof field["type"] === "string" ? field["type"].trim() : "";
    const name = typeof field["name"] === "string" ? field["name"].trim() : "";

    if (!type || !name) continue;
    if (SKIP_TYPES.has(type)) continue;

    if (GROUP_TYPES.has(type)) {
      // Section dividers are always emitted (no limit applies)
      fields.push({
        name,
        label: normalizeLabel(field["label"], name),
        type,
        value: null,
      });
      continue;
    }

    if (limit !== undefined && visibleCount >= limit) break;

    const raw = payload[name];
    fields.push({
      name,
      label: normalizeLabel(field["label"], name),
      type,
      value: raw != null ? String(raw) : null,
    });
    visibleCount++;
  }

  return fields;
}

const router = Router();
router.use(requireAuth(["admin", "supervisor"]));

// ── Helper: resolve folder_schema + form_key from query params ──
// Validates that the form belongs to the caller's org before returning
// the table identifier.
async function resolveFormTable(
  orgId: string,
  folderSchema: unknown,
  formKey: unknown,
  next: NextFunction,
): Promise<{ tableName: string; formId: string; tableExists: boolean } | null> {
  if (!folderSchema || typeof folderSchema !== "string") {
    next(createError("Query param `folder_schema` is required", 422));
    return null;
  }
  if (!formKey || typeof formKey !== "string") {
    next(createError("Query param `form_key` is required", 422));
    return null;
  }

  // Check the form exists in this org (row-level isolation)
  const formCheck = await pool.query<{ id: string }>(
    `SELECT id FROM public.forms
      WHERE org_id = $1 AND folder_schema = $2 AND form_key = $3`,
    [orgId, folderSchema, formKey],
  );
  if (!formCheck.rows[0]) {
    next(createError("Form not found in this organisation", 404));
    return null;
  }

  // Defence-in-depth: validate identifier shape even though it came from DB
  try {
    assertSafeIdentifier(folderSchema, "folder_schema");
    assertSafeIdentifier(formKey, "form_key");
  } catch {
    next(createError("Invalid form identifier", 422));
    return null;
  }

  const tableName = `${folderSchema}.submissions_${formKey}`;

  // Check whether the submissions table has been created yet.
  // A form can exist in the registry before any data has been ingested.
  const tableCheck = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
     ) AS exists`,
    [folderSchema, `submissions_${formKey}`],
  );

  return {
    tableName,
    formId: formCheck.rows[0].id,
    tableExists: tableCheck.rows[0]?.exists ?? false,
  };
}

// ── GET /reporting/submissions ────────────────────────────────
// Query params: folder_schema, form_key, status, entity_id, page, limit, all_fields
// all_fields=true — return all JSONB fields instead of the default 5-field preview
router.get(
  "/submissions",
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

      // No submissions have been ingested yet — the table hasn't been created.
      if (!tableExists) {
        const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
        const limit = Math.min(
          500,
          Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)),
        );
        res.json({
          data: [],
          pagination: { total: 0, page, limit, pages: 0 },
        });
        return;
      }

      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(
        500,
        Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)),
      );
      const offset = (page - 1) * limit;

      // Sector submission tables don't have org_id; isolate by form_id
      // (form_id is org-scoped via public.forms, validated by resolveFormTable)
      const conditions: string[] = ["s.form_id = $1"];
      const params: unknown[] = [formId];
      let idx = 2;

      if (req.query.status && typeof req.query.status === "string") {
        conditions.push(`s.status = $${idx++}`);
        params.push(req.query.status);
      }
      if (req.query.entity_id && typeof req.query.entity_id === "string") {
        conditions.push(`s.entity_id = $${idx++}`);
        params.push(req.query.entity_id);
      }

      const where = conditions.join(" AND ");

      // Fetch the latest form definition once — used to flatten payload previews
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
      const survey: Record<string, unknown>[] = Array.isArray(rawSurvey)
        ? (rawSurvey as Record<string, unknown>[])
        : [];

      const [countResult, rowsResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FROM ${tableName} s WHERE ${where}`,
          params,
        ),
        pool.query(
          `SELECT s.id, s.entity_id, s.enumerator_id, s.form_id, s.form_version,
                  s.start_time, s.end_time, s.server_received_at, s.status,
                  s.payload
             FROM ${tableName} s
            WHERE ${where}
            ORDER BY s.server_received_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, limit, offset],
        ),
      ]);

      const total = parseInt(countResult.rows[0].count, 10);

      // Strip raw payload from list rows; attach a field preview (5 fields by default,
      // all fields when all_fields=true is requested by the data-explorer route).
      const fieldsLimit = req.query.all_fields === "true" ? undefined : 5;
      const rows = rowsResult.rows.map((row) => {
        const { payload, ...rest } = row as {
          payload: Record<string, unknown>;
          [k: string]: unknown;
        };
        return {
          ...rest,
          fields: flattenPayload(survey, payload ?? {}, fieldsLimit),
        };
      });

      res.json({
        data: rows,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── Export helpers ────────────────────────────────────────────

interface Column {
  name: string;
  label: string;
}

/**
 * Derive a flat, ordered list of answer columns from the survey array.
 * begin_group / begin_repeat entries prefix subsequent field labels but emit
 * no column themselves. end_group / end_repeat reset the current prefix.
 * SKIP_TYPES (note, calculate, hidden) are skipped entirely.
 */
function extractColumns(survey: Record<string, unknown>[]): Column[] {
  const columns: Column[] = [];
  let currentGroupLabel: string | null = null;

  for (const field of survey) {
    const type = typeof field["type"] === "string" ? field["type"].trim() : "";
    const name = typeof field["name"] === "string" ? field["name"].trim() : "";

    if (!type || !name) continue;

    // Reset group prefix — handle before SKIP_TYPES check because
    // end_group / end_repeat are in SKIP_TYPES but still need to clear state.
    if (type === "end_group" || type === "end_repeat") {
      currentGroupLabel = null;
      continue;
    }

    if (SKIP_TYPES.has(type)) continue;

    if (type === "begin_group" || type === "begin_repeat") {
      currentGroupLabel = normalizeLabel(field["label"], name);
      continue;
    }

    const fieldLabel = normalizeLabel(field["label"], name);
    columns.push({
      name,
      label: currentGroupLabel
        ? `${currentGroupLabel} > ${fieldLabel}`
        : fieldLabel,
    });
  }

  return columns;
}

/**
 * Map a submission payload to a string array aligned with the column list
 * produced by extractColumns(). Missing or null values become empty string.
 */
function buildRowValues(
  columns: Column[],
  payload: Record<string, unknown>,
): string[] {
  return columns.map((col) => {
    const v = payload[col.name];
    if (v == null) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

/**
 * Wrap a cell value in double quotes for CSV, escaping internal double
 * quotes by doubling them (RFC 4180). Null / undefined become empty string.
 */
function csvCell(value: string | null | undefined): string {
  return `"${(value ?? "").replaceAll('"', '""')}"`;
}

// ── GET /reporting/submissions/export ────────────────────────
// Query params: folder_schema (required), form_key (required),
//               status (optional), entity_id (optional)
// Streams all matching submissions as a flat CSV file download.
// Must appear before /:id so Express matches the literal path first.
router.get(
  "/submissions/export",
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

      // No submissions yet — return an empty CSV with only the header row.
      if (!tableExists) {
        const fkExport = req.query.form_key as string;
        const todayExport = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fkExport}_${todayExport}.csv"`,
        );
        res.end();
        return;
      }

      // Build filter conditions — same pattern as the paginated route
      const conditions: string[] = ["s.form_id = $1"];
      const params: unknown[] = [formId];
      let idx = 2;

      if (req.query.status && typeof req.query.status === "string") {
        conditions.push(`s.status = $${idx++}`);
        params.push(req.query.status);
      }
      if (req.query.entity_id && typeof req.query.entity_id === "string") {
        conditions.push(`s.entity_id = $${idx++}`);
        params.push(req.query.entity_id);
      }

      const where = conditions.join(" AND ");

      // Load the latest form definition to derive column structure
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
      const xlsExport = fvResult.rows[0]?.xlsform_json;
      const rawSurveyExport = xlsExport?.survey ?? xlsExport?.fields;
      const survey: Record<string, unknown>[] = Array.isArray(rawSurveyExport)
        ? (rawSurveyExport as Record<string, unknown>[])
        : [];

      const columns = extractColumns(survey);

      // Fetch all matching rows — no LIMIT; Alpha scale is acceptable in memory
      const rowsResult = await pool.query<{
        id: string;
        entity_id: string;
        entity_name: string | null;
        enumerator_email: string | null;
        enumerator_display_name: string | null;
        start_time: Date;
        end_time: Date;
        server_received_at: Date;
        form_version: number;
        status: string;
        dqa_notes: string | null;
        payload: Record<string, unknown>;
        latitude: string | null;
        longitude: string | null;
      }>(
        `SELECT s.id,
                s.entity_id,
                e.metadata->>'name'    AS entity_name,
                u.email                AS enumerator_email,
                u.display_name         AS enumerator_display_name,
                s.start_time,
                s.end_time,
                s.server_received_at,
                s.form_version,
                s.status,
                s.dqa_notes,
                s.payload,
                (ST_AsGeoJSON(s.location)::json->'coordinates'->1)::text AS latitude,
                (ST_AsGeoJSON(s.location)::json->'coordinates'->0)::text AS longitude
           FROM ${tableName} s
           LEFT JOIN public.entities e ON e.id = s.entity_id
           LEFT JOIN public.users    u ON u.id = s.enumerator_id
          WHERE ${where}
          ORDER BY s.server_received_at DESC`,
        params,
      );

      // Set response headers — Transfer-Encoding: chunked is set automatically
      // by Node when res.write() is used without Content-Length.
      const formKey = req.query.form_key as string;
      const today = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${formKey}_${today}.csv"`,
      );

      // Header row: fixed metadata columns, then one column per survey field
      const metaHeaders = [
        "submission_id",
        "entity_id",
        "entity_name",
        "enumerator_email",
        "enumerator_name",
        "start_time",
        "end_time",
        "server_received_at",
        "form_version",
        "status",
        "dqa_notes",
        "latitude",
        "longitude",
      ];
      res.write(
        [...metaHeaders, ...columns.map((c) => c.label)]
          .map(csvCell)
          .join(",") + "\n",
      );

      // Data rows
      for (const row of rowsResult.rows) {
        const metaValues = [
          row.id,
          row.entity_id,
          row.entity_name ?? "",
          row.enumerator_email ?? "",
          row.enumerator_display_name ?? "",
          row.start_time.toISOString(),
          row.end_time.toISOString(),
          row.server_received_at.toISOString(),
          String(row.form_version),
          row.status,
          row.dqa_notes ?? "",
          row.latitude ?? "",
          row.longitude ?? "",
        ];
        const payloadValues = buildRowValues(columns, row.payload ?? {});
        res.write(
          [...metaValues, ...payloadValues].map(csvCell).join(",") + "\n",
        );
      }

      res.end();
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /reporting/submissions/:id ────────────────────────────
// Query params: folder_schema, form_key
// Returns a fully shaped SubmissionDetail including flattened payload fields.
router.get(
  "/submissions/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveFormTable(
        req.user!.org_id,
        req.query.folder_schema,
        req.query.form_key,
        next,
      );
      if (!resolved) return;
      const { tableName, formId } = resolved;

      const result = await pool.query<{
        id: string;
        form_version: number;
        entity_id: string;
        entity_name: string | null;
        enumerator_display_name: string | null;
        enumerator_email: string | null;
        start_time: string;
        end_time: string;
        server_received_at: string;
        status: string;
        dqa_notes: string | null;
        payload: Record<string, unknown>;
        location_geojson: {
          type: string;
          coordinates: [number, number];
        } | null;
        form_display_name: string;
        folder_schema: string;
        form_key: string;
        xlsform_json: { survey?: unknown[]; fields?: unknown[] } | null;
      }>(
        `SELECT s.id, s.form_version, s.entity_id,
                s.start_time, s.end_time, s.server_received_at,
                s.status, s.dqa_notes, s.payload,
                ST_AsGeoJSON(s.location)::json                AS location_geojson,
                e.metadata->>'name'                           AS entity_name,
                u.display_name                                AS enumerator_display_name,
                u.email                                       AS enumerator_email,
                f.display_name                                AS form_display_name,
                f.folder_schema,
                f.form_key,
                fv.xlsform_json
           FROM ${tableName} s
           LEFT JOIN public.entities     e  ON e.id  = s.entity_id
           LEFT JOIN public.users        u  ON u.id  = s.enumerator_id
           LEFT JOIN public.forms        f  ON f.id  = s.form_id
           LEFT JOIN public.form_versions fv ON fv.form_id = s.form_id
                                            AND fv.version  = s.form_version
          WHERE s.id = $1 AND s.form_id = $2`,
        [req.params.id, formId],
      );

      if (!result.rows[0]) {
        return next(createError("Submission not found", 404));
      }

      const row = result.rows[0];

      // Derive flat fields from the exact form version used at submission time
      const xlsDetail = row.xlsform_json;
      const rawSurveyDetail = xlsDetail?.survey ?? xlsDetail?.fields;
      const survey: Record<string, unknown>[] = Array.isArray(rawSurveyDetail)
        ? (rawSurveyDetail as Record<string, unknown>[])
        : [];

      // Convert PostGIS GeoJSON Point to {lat, lng} or null
      const location =
        row.location_geojson?.type === "Point" &&
        Array.isArray(row.location_geojson.coordinates)
          ? {
              lng: row.location_geojson.coordinates[0],
              lat: row.location_geojson.coordinates[1],
            }
          : null;

      res.json({
        submission_id: row.id,
        form_display_name: row.form_display_name,
        folder_schema: row.folder_schema,
        form_key: row.form_key,
        form_version: row.form_version,
        entity_id: row.entity_id,
        entity_name: row.entity_name ?? null,
        enumerator_display_name: row.enumerator_display_name ?? null,
        enumerator_email: row.enumerator_email ?? "",
        start_time: row.start_time,
        end_time: row.end_time,
        server_received_at: row.server_received_at,
        location,
        status: row.status,
        dqa_notes: row.dqa_notes ?? null,
        fields: flattenPayload(survey, row.payload ?? {}),
        raw_payload: row.payload ?? {},
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /reporting/entities/:id/timeline ─────────────────────
// Returns all submissions for a given entity across every form table
// registered to this org.  Results are sorted newest-first.
router.get(
  "/entities/:id/timeline",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityId = req.params.id;

      // Verify the entity belongs to this org
      const entityCheck = await pool.query(
        `SELECT id FROM public.entities WHERE id = $1 AND org_id = $2`,
        [entityId, req.user!.org_id],
      );
      if (!entityCheck.rows[0]) {
        return next(createError("Entity not found", 404));
      }

      // Load all forms for this org to know which tables to query
      const formsResult = await pool.query<{
        id: string;
        display_name: string;
        folder_schema: string;
        form_key: string;
      }>(
        `SELECT id, display_name, folder_schema, form_key
           FROM public.forms
          WHERE org_id = $1`,
        [req.user!.org_id],
      );

      const timeline: {
        form_id: string;
        form_name: string;
        folder_schema: string;
        form_key: string;
        submission_id: string;
        start_time: unknown;
        end_time: unknown;
        status: string;
        enumerator_id: string;
        payload: Record<string, unknown>;
      }[] = [];

      // Query each form's submission table for this entity.
      // Done sequentially — form count is bounded by org size (Alpha: small).
      for (const form of formsResult.rows) {
        // Validate identifiers even though they came from the DB
        try {
          assertSafeIdentifier(form.folder_schema, "folder_schema");
          assertSafeIdentifier(form.form_key, "form_key");
        } catch {
          continue; // Skip malformed entries defensively
        }

        const tbl = `${form.folder_schema}.submissions_${form.form_key}`;

        let rows: {
          submission_id: string;
          start_time: unknown;
          end_time: unknown;
          status: string;
          enumerator_id: string;
          payload: Record<string, unknown>;
        }[];

        try {
          const r = await pool.query(
            `SELECT id AS submission_id, start_time, end_time,
                    status, enumerator_id, payload
               FROM ${tbl}
              WHERE entity_id = $1 AND form_id = $2
              ORDER BY start_time DESC`,
            [entityId, form.id],
          );
          rows = r.rows as typeof rows;
        } catch {
          // Table may not exist yet (form created but no submissions)
          continue;
        }

        for (const row of rows) {
          timeline.push({
            form_id: form.id,
            form_name: form.display_name,
            folder_schema: form.folder_schema,
            form_key: form.form_key,
            ...row,
          });
        }
      }

      // Sort merged results newest-first
      timeline.sort((a, b) => {
        const ta =
          a.start_time instanceof Date
            ? a.start_time.getTime()
            : new Date(String(a.start_time)).getTime();
        const tb =
          b.start_time instanceof Date
            ? b.start_time.getTime()
            : new Date(String(b.start_time)).getTime();
        return tb - ta;
      });

      res.json(timeline);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /reporting/map ────────────────────────────────────────
// Returns GeoJSON FeatureCollection of GPS points from one form table.
// Query params: folder_schema, form_key, status
router.get("/map", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resolved = await resolveFormTable(
      req.user!.org_id,
      req.query.folder_schema,
      req.query.form_key,
      next,
    );
    if (!resolved) return;
    const { tableName, formId } = resolved;

    // Sector submission tables don't have org_id; isolate by form_id
    const conditions: string[] = ["s.form_id = $1", "s.location IS NOT NULL"];
    const params: unknown[] = [formId];
    let idx = 2;

    if (req.query.status && typeof req.query.status === "string") {
      conditions.push(`s.status = $${idx++}`);
      params.push(req.query.status);
    }

    const where = conditions.join(" AND ");

    const result = await pool.query(
      `SELECT s.id AS submission_id,
                s.entity_id,
                s.start_time,
                s.status,
                ST_AsGeoJSON(s.location)::json AS geometry,
                s.payload
           FROM ${tableName} s
          WHERE ${where}
          ORDER BY s.start_time DESC`,
      params,
    );

    // Return as GeoJSON FeatureCollection for direct consumption by Leaflet/MapLibre
    const features = result.rows.map((row) => ({
      type: "Feature",
      geometry: row.geometry,
      properties: {
        submission_id: row.submission_id,
        entity_id: row.entity_id,
        start_time: row.start_time,
        status: row.status,
        payload: row.payload,
      },
    }));

    res.json({ type: "FeatureCollection", features });
  } catch (err) {
    next(err);
  }
});

// ── GET /reporting/summary ────────────────────────────────────
// Returns the ITT snapshot: all indicators with their latest actual,
// target, and progress ratio for the org overview dashboard card.
router.get(
  "/summary",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT
              i.id,
              i.code,
              i.name,
              i.unit_of_measure,
              i.annual_target,
              i.reporting_period_start,
              i.reporting_period_end,
              i.baseline_value,
              f.display_name            AS source_form_name,
              ia_latest.actual_value    AS latest_actual,
              ia_latest.period_start    AS latest_period_start,
              ia_latest.period_end      AS latest_period_end,
              ia_latest.computed_at     AS latest_computed_at,
              CASE
                WHEN i.annual_target IS NULL OR i.annual_target = 0 THEN NULL
                ELSE ROUND(
                  (ia_latest.actual_value / i.annual_target) * 100, 2
                )
              END                       AS progress_pct
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
        ORDER BY i.code`,
        [req.user!.org_id],
      );

      res.json({
        org_id: req.user!.org_id,
        generated_at: new Date().toISOString(),
        indicators: result.rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── Helper: load all org form table descriptors ───────────────
async function getOrgForms(orgId: string): Promise<
  {
    id: string;
    display_name: string;
    folder_schema: string;
    form_key: string;
  }[]
> {
  const result = await pool.query<{
    id: string;
    display_name: string;
    folder_schema: string;
    form_key: string;
  }>(
    `SELECT id, display_name, folder_schema, form_key
       FROM public.forms
      WHERE org_id = $1`,
    [orgId],
  );
  return result.rows;
}

// ── GET /reporting/activity ───────────────────────────────────
// Returns a rolling 7-day submission count per day across all org forms.
// Response: Array<{ date: string; day: string; count: number }> (7 items, oldest first)
router.get(
  "/activity",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const forms = await getOrgForms(req.user!.org_id);

      // Build a map: ISO date string → count
      const countMap = new Map<string, number>();

      for (const form of forms) {
        try {
          assertSafeIdentifier(form.folder_schema, "folder_schema");
          assertSafeIdentifier(form.form_key, "form_key");
        } catch {
          continue;
        }

        const tbl = `${form.folder_schema}.submissions_${form.form_key}`;

        try {
          const r = await pool.query<{ day: Date; count: string }>(
            `SELECT DATE_TRUNC('day', server_received_at AT TIME ZONE 'UTC') AS day,
                    COUNT(*)::text AS count
               FROM ${tbl}
              WHERE form_id = $1
                AND server_received_at >= NOW() - INTERVAL '7 days'
              GROUP BY 1`,
            [form.id],
          );
          for (const row of r.rows) {
            const key = new Date(row.day).toISOString().slice(0, 10);
            countMap.set(
              key,
              (countMap.get(key) ?? 0) + Number.parseInt(row.count, 10),
            );
          }
        } catch {
          // Table may not exist yet
          continue;
        }
      }

      // Build exactly 7 entries, oldest → newest
      const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const activity: { date: string; day: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        const date = d.toISOString().slice(0, 10);
        activity.push({
          date,
          day: DAY_LABELS[d.getUTCDay()],
          count: countMap.get(date) ?? 0,
        });
      }

      res.json(activity);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /reporting/recent ─────────────────────────────────────
// Returns the 10 most recent submissions across all org form tables,
// enriched with entity name, enumerator info, and form display name.
router.get(
  "/recent",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const forms = await getOrgForms(req.user!.org_id);

      type RawRow = {
        submission_id: string;
        form_id: string;
        entity_id: string;
        enumerator_id: string;
        server_received_at: Date;
        status: string;
        display_name: string;
        folder_schema: string;
        form_key: string;
      };

      const rows: RawRow[] = [];

      for (const form of forms) {
        try {
          assertSafeIdentifier(form.folder_schema, "folder_schema");
          assertSafeIdentifier(form.form_key, "form_key");
        } catch {
          continue;
        }

        const tbl = `${form.folder_schema}.submissions_${form.form_key}`;

        try {
          const r = await pool.query<
            Omit<RawRow, "display_name" | "folder_schema" | "form_key">
          >(
            `SELECT id AS submission_id,
                    form_id,
                    entity_id,
                    enumerator_id,
                    server_received_at,
                    status
               FROM ${tbl}
              WHERE form_id = $1
              ORDER BY server_received_at DESC
              LIMIT 10`,
            [form.id],
          );
          for (const row of r.rows) {
            rows.push({
              ...row,
              display_name: form.display_name,
              folder_schema: form.folder_schema,
              form_key: form.form_key,
            });
          }
        } catch {
          continue;
        }
      }

      // Sort merged rows newest-first and take top 10
      rows.sort(
        (a, b) =>
          new Date(b.server_received_at).getTime() -
          new Date(a.server_received_at).getTime(),
      );
      const top10 = rows.slice(0, 10);

      if (top10.length === 0) {
        return res.json([]);
      }

      // Batch-resolve entities and users to avoid N+1
      const entityIds = [...new Set(top10.map((r) => r.entity_id))];
      const userIds = [...new Set(top10.map((r) => r.enumerator_id))];

      const [entityResult, userResult] = await Promise.all([
        pool.query<{ id: string; metadata: { name?: string } }>(
          `SELECT id, metadata FROM public.entities WHERE id = ANY($1)`,
          [entityIds],
        ),
        pool.query<{ id: string; display_name: string | null; email: string }>(
          `SELECT id, display_name, email FROM public.users WHERE id = ANY($1)`,
          [userIds],
        ),
      ]);

      const entityMap = new Map(
        entityResult.rows.map((e) => [e.id, e.metadata?.name ?? null]),
      );
      const userMap = new Map(userResult.rows.map((u) => [u.id, u]));

      const enriched = top10.map((row) => ({
        submission_id: row.submission_id,
        form_display_name: row.display_name,
        folder_schema: row.folder_schema,
        form_key: row.form_key,
        entity_id: row.entity_id,
        entity_name: entityMap.get(row.entity_id) ?? null,
        enumerator_display_name:
          userMap.get(row.enumerator_id)?.display_name ?? null,
        enumerator_email: userMap.get(row.enumerator_id)?.email ?? "",
        server_received_at: row.server_received_at,
        status: row.status,
      }));

      res.json(enriched);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
