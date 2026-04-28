import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { createError } from "../middleware/errorHandler";

const router = Router();

// ── File upload ───────────────────────────────────────────────
// Validate MIME type in the route handler; keep fileFilter simple here.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ── XLSForm parser ────────────────────────────────────────────

// Question types that don't produce data-collection fields
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

type XlsRow = Record<string, string | number | boolean | null>;

/** Safely coerce an exceljs CellValue to a primitive. */
function cellToPrimitive(
  v: ExcelJS.CellValue,
): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  // Rich text object
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText
      .map((r) => r.text)
      .join("");
  }
  // Formula result
  if (typeof v === "object" && "result" in v) {
    return cellToPrimitive(
      (v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue,
    );
  }
  // Hyperlink
  if (typeof v === "object" && "text" in v) {
    return String((v as ExcelJS.CellHyperlinkValue).text);
  }
  return String(v);
}

/** Convert a worksheet into an array of row-objects keyed by header row values. */
function sheetToRows(sheet: ExcelJS.Worksheet): XlsRow[] {
  const rows: XlsRow[] = [];
  let headers: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    // exceljs row.values is 1-indexed; index 0 is always undefined
    const raw = (row.values as ExcelJS.CellValue[]).slice(1);

    if (rowNumber === 1) {
      headers = raw.map((v) => String(cellToPrimitive(v) ?? "").trim());
      return;
    }

    // Skip fully blank rows
    if (raw.every((v) => v === null || v === undefined || v === "")) return;

    const obj: XlsRow = {};
    headers.forEach((header, i) => {
      if (!header) return;
      obj[header] = cellToPrimitive(raw[i] ?? null);
    });
    rows.push(obj);
  });

  return rows;
}

interface ParseResult {
  ok: true;
  json: { survey: XlsRow[]; choices: XlsRow[]; settings: XlsRow[] };
  /** Names of data-collection fields (used for breaking-change detection). */
  fieldNames: string[];
}
interface ParseFailure {
  ok: false;
  errors: string[];
}

async function parseXlsForm(
  buffer: Buffer,
): Promise<ParseResult | ParseFailure> {
  // Validate the XLSX magic bytes before handing to exceljs
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    // PK magic bytes for ZIP/XLSX
    return {
      ok: false,
      errors: ["File does not appear to be a valid .xlsx file"],
    };
  }

  const wb = new ExcelJS.Workbook();
  try {
    // Cast required: @types/node v22 made Buffer generic; exceljs types predate that.
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch {
    return {
      ok: false,
      errors: ["Could not read XLSX file — it may be corrupt"],
    };
  }

  const errors: string[] = [];

  const surveySheet = wb.getWorksheet("survey");
  const choicesSheet = wb.getWorksheet("choices");

  if (!surveySheet) errors.push("Missing required sheet: 'survey'");
  if (!choicesSheet) errors.push("Missing required sheet: 'choices'");
  if (errors.length) return { ok: false, errors };

  const surveyRows = sheetToRows(surveySheet!);
  const choicesRows = sheetToRows(choicesSheet!);
  const settingsSheet = wb.getWorksheet("settings");
  const settingsRows = settingsSheet ? sheetToRows(settingsSheet) : [];

  // Validate required survey columns
  const surveyHeaders = surveyRows.length > 0 ? Object.keys(surveyRows[0]) : [];
  if (!surveyHeaders.includes("type")) {
    errors.push("'survey' sheet is missing required column: 'type'");
  }
  if (!surveyHeaders.includes("name")) {
    errors.push("'survey' sheet is missing required column: 'name'");
  }
  const hasLabel = surveyHeaders.some(
    (h) => h === "label" || h.startsWith("label::"),
  );
  if (!hasLabel) {
    errors.push(
      "'survey' sheet is missing a label column ('label' or 'label::*')",
    );
  }

  // Validate required choices columns
  const choiceHeaders =
    choicesRows.length > 0 ? Object.keys(choicesRows[0]) : [];
  if (!choiceHeaders.includes("list_name")) {
    errors.push("'choices' sheet is missing required column: 'list_name'");
  }
  if (!choiceHeaders.includes("name")) {
    errors.push("'choices' sheet is missing required column: 'name'");
  }

  if (errors.length) return { ok: false, errors };

  // Collect data-collection field names for versioning comparisons
  const fieldNames = surveyRows
    .filter((r) => {
      const t = String(r.type ?? "")
        .toLowerCase()
        .split(" ")[0]
        .trim();
      return t && !META_TYPES.has(t) && r.name;
    })
    .map((r) => String(r.name));

  return {
    ok: true,
    json: { survey: surveyRows, choices: choicesRows, settings: settingsRows },
    fieldNames,
  };
}

/**
 * Validate an already-parsed xlsform_json object (builder submission path).
 * Applies the same structural checks as parseXlsForm without touching xlsx.
 */
function validateXlsFormJson(
  json: unknown,
): { ok: true; fieldNames: string[] } | { ok: false; errors: string[] } {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, errors: ["xlsform_json must be a JSON object"] };
  }

  const j = json as Record<string, unknown>;
  const errors: string[] = [];

  if (!Array.isArray(j.survey)) {
    return { ok: false, errors: ["xlsform_json.survey must be an array"] };
  }
  if (!Array.isArray(j.choices)) {
    return { ok: false, errors: ["xlsform_json.choices must be an array"] };
  }

  const survey = j.survey as XlsRow[];

  if (survey.length === 0) {
    errors.push("Survey must contain at least one row");
  } else {
    const headers = Object.keys(survey[0] ?? {});
    if (!headers.includes("type"))
      errors.push("Survey is missing required column: 'type'");
    if (!headers.includes("name"))
      errors.push("Survey is missing required column: 'name'");
    const hasLabel = headers.some(
      (h) => h === "label" || h.startsWith("label::"),
    );
    if (!hasLabel)
      errors.push(
        "Survey is missing a label column ('label' or 'label::Language')",
      );
  }

  if (errors.length) return { ok: false, errors };

  const fieldNames = (j.survey as XlsRow[])
    .filter((r) => {
      const t = String(r.type ?? "")
        .toLowerCase()
        .split(" ")[0]
        .trim();
      return t && !META_TYPES.has(t) && r.name;
    })
    .map((r) => String(r.name));

  return { ok: true, fieldNames };
}

// ── GET /forms ────────────────────────────────────────────────
router.get(
  "/",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT id, org_id, folder_schema, form_key, display_name,
                current_version, is_active, created_by, created_at
           FROM public.forms
          WHERE org_id = $1 AND is_active = true
          ORDER BY folder_schema, display_name`,
        [req.user!.org_id],
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /forms ───────────────────────────────────────────────
const CreateFormSchema = z.object({
  folder_schema: z.string().min(1).max(100),
  form_key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, {
      message:
        "form_key must only contain lowercase letters, digits, and underscores",
    }),
  display_name: z.string().min(1).max(255),
});

router.post(
  "/",
  requireAuth(["admin"]),
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return next(createError("An XLSForm .xlsx file is required", 422));
      }

      const parsed = CreateFormSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const parseResult = await parseXlsForm(req.file.buffer);
      if (!parseResult.ok) {
        res.status(422).json({
          error: "XLSForm validation failed",
          details: parseResult.errors,
        });
        return;
      }

      const { folder_schema, form_key, display_name } = parsed.data;
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const formResult = await client.query(
          `INSERT INTO public.forms
                  (org_id, folder_schema, form_key, display_name,
                   current_version, created_by)
           VALUES ($1, $2, $3, $4, 1, $5)
           RETURNING id, org_id, folder_schema, form_key, display_name,
                     current_version, is_active, created_by, created_at`,
          [
            req.user!.org_id,
            folder_schema,
            form_key,
            display_name,
            req.user!.id,
          ],
        );

        const form = formResult.rows[0];

        await client.query(
          `INSERT INTO public.form_versions
                  (form_id, version, xlsform_json, published_by)
           VALUES ($1, 1, $2, $3)`,
          [form.id, JSON.stringify(parseResult.json), req.user!.id],
        );

        await client.query("COMMIT");
        res.status(201).json(form);
      } catch (txErr: unknown) {
        await client.query("ROLLBACK");
        if (
          typeof txErr === "object" &&
          txErr !== null &&
          (txErr as { code?: string }).code === "23505"
        ) {
          return next(
            createError(
              "A form with this folder_schema and form_key already exists in your organisation",
              409,
            ),
          );
        }
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /forms/from-json ─────────────────────────────────
// Accepts a pre-built xlsform_json object from the visual form builder
// instead of a raw .xlsx upload.  Same validation and storage as POST /.
const CreateFormJsonSchema = z.object({
  folder_schema: z.string().min(1).max(100),
  form_key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, {
      message:
        "form_key must only contain lowercase letters, digits, and underscores",
    }),
  display_name: z.string().min(1).max(255),
  xlsform_json: z.record(z.unknown()),
});

router.post(
  "/from-json",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateFormJsonSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const { folder_schema, form_key, display_name, xlsform_json } =
        parsed.data;

      const validation = validateXlsFormJson(xlsform_json);
      if (!validation.ok) {
        res.status(422).json({
          error: "XLSForm validation failed",
          details: validation.errors,
        });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const formResult = await client.query(
          `INSERT INTO public.forms
                  (org_id, folder_schema, form_key, display_name,
                   current_version, created_by)
           VALUES ($1, $2, $3, $4, 1, $5)
           RETURNING id, org_id, folder_schema, form_key, display_name,
                     current_version, is_active, created_by, created_at`,
          [
            req.user!.org_id,
            folder_schema,
            form_key,
            display_name,
            req.user!.id,
          ],
        );

        const form = formResult.rows[0];

        await client.query(
          `INSERT INTO public.form_versions
                  (form_id, version, xlsform_json, published_by)
           VALUES ($1, 1, $2, $3)`,
          [form.id, JSON.stringify(xlsform_json), req.user!.id],
        );

        await client.query("COMMIT");
        res.status(201).json(form);
      } catch (txErr: unknown) {
        await client.query("ROLLBACK");
        if (
          typeof txErr === "object" &&
          txErr !== null &&
          (txErr as { code?: string }).code === "23505"
        ) {
          return next(
            createError(
              "A form with this folder_schema and form_key already exists in your organisation",
              409,
            ),
          );
        }
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /forms/:id ────────────────────────────────────────────
router.get(
  "/:id",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT f.id, f.org_id, f.folder_schema, f.form_key, f.display_name,
                f.current_version, f.is_active, f.created_by, f.created_at,
                fv.xlsform_json
           FROM public.forms f
           JOIN public.form_versions fv
             ON fv.form_id = f.id AND fv.version = f.current_version
          WHERE f.id = $1 AND f.org_id = $2`,
        [req.params.id, req.user!.org_id],
      );

      if (!result.rows[0]) {
        return next(createError("Form not found", 404));
      }

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /forms/:id/definition ─────────────────────────────────
// Android endpoint — returns the xlsform_json payload for offline use.
router.get(
  "/:id/definition",
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT fv.xlsform_json
           FROM public.forms f
           JOIN public.form_versions fv
             ON fv.form_id = f.id AND fv.version = f.current_version
          WHERE f.id = $1 AND f.org_id = $2 AND f.is_active = true`,
        [req.params.id, req.user!.org_id],
      );

      if (!result.rows[0]) {
        return next(createError("Form not found", 404));
      }

      res.json(result.rows[0].xlsform_json);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /forms/:id/export ─────────────────────────────────────
// Returns the current xlsform_json serialised as an .xlsx file so field
// teams can load it directly into ODK Collect.
router.get(
  "/:id/export",
  requireAuth(["admin", "supervisor"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT f.display_name, f.form_key, fv.xlsform_json
           FROM public.forms f
           JOIN public.form_versions fv
             ON fv.form_id = f.id AND fv.version = f.current_version
          WHERE f.id = $1 AND f.org_id = $2 AND f.is_active = true`,
        [req.params.id, req.user!.org_id],
      );

      if (!result.rows[0]) {
        return next(createError("Form not found", 404));
      }

      const { display_name, form_key, xlsform_json } = result.rows[0] as {
        display_name: string;
        form_key: string;
        xlsform_json: {
          survey: XlsRow[];
          choices: XlsRow[];
          settings: XlsRow[];
        };
      };

      const wb = new ExcelJS.Workbook();

      function addSheet(name: string, rows: XlsRow[]) {
        const ws = wb.addWorksheet(name);
        if (rows.length === 0) return;
        const cols = Object.keys(rows[0]);
        ws.addRow(cols);
        for (const row of rows) {
          ws.addRow(cols.map((c) => row[c] ?? ""));
        }
        // Bold header row
        ws.getRow(1).font = { bold: true };
      }

      addSheet("survey", xlsform_json.survey ?? []);
      addSheet("choices", xlsform_json.choices ?? []);
      addSheet(
        "settings",
        xlsform_json.settings?.length
          ? xlsform_json.settings
          : [{ form_title: display_name, form_id: form_key }],
      );

      const fileName = `${form_key}.xlsx`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`,
      );

      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /forms/:id/versions ──────────────────────────────────
router.post(
  "/:id/versions",
  requireAuth(["admin"]),
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return next(createError("An XLSForm .xlsx file is required", 422));
      }

      // Load existing form and current version definition
      const existing = await pool.query(
        `SELECT f.id, f.current_version, fv.xlsform_json
           FROM public.forms f
           JOIN public.form_versions fv
             ON fv.form_id = f.id AND fv.version = f.current_version
          WHERE f.id = $1 AND f.org_id = $2 AND f.is_active = true`,
        [req.params.id, req.user!.org_id],
      );

      if (!existing.rows[0]) {
        return next(createError("Form not found", 404));
      }

      const { current_version, xlsform_json } = existing.rows[0];

      const parseResult = await parseXlsForm(req.file.buffer);
      if (!parseResult.ok) {
        res.status(422).json({
          error: "XLSForm validation failed",
          details: parseResult.errors,
        });
        return;
      }

      // Breaking-change detection: any data-collection field from the
      // current version that is absent in the new version is a breaking change.
      const prevFields = new Set<string>(
        (xlsform_json.survey as XlsRow[])
          .filter((r) => {
            const t = String(r.type ?? "")
              .toLowerCase()
              .split(" ")[0]
              .trim();
            return t && !META_TYPES.has(t) && r.name;
          })
          .map((r) => String(r.name)),
      );

      const newFields = new Set<string>(parseResult.fieldNames);
      const removed = [...prevFields].filter((f) => !newFields.has(f));

      if (removed.length > 0) {
        res.status(422).json({
          error:
            "Breaking change detected: existing data-collection fields have been " +
            "removed or renamed. Create a new form with a different form_key instead.",
          removed_fields: removed,
        });
        return;
      }

      const nextVersion = (current_version as number) + 1;
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        await client.query(
          `INSERT INTO public.form_versions
                  (form_id, version, xlsform_json, published_by)
           VALUES ($1, $2, $3, $4)`,
          [
            req.params.id,
            nextVersion,
            JSON.stringify(parseResult.json),
            req.user!.id,
          ],
        );

        const formResult = await client.query(
          `UPDATE public.forms
              SET current_version = $1
            WHERE id = $2
           RETURNING id, org_id, folder_schema, form_key, display_name,
                     current_version, is_active, created_by, created_at`,
          [nextVersion, req.params.id],
        );

        await client.query("COMMIT");
        res.status(201).json(formResult.rows[0]);
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /forms/:id/versions/from-json ───────────────────
// Publishes a new version from the builder's xlsform_json directly.
// Runs the same breaking-change detection as POST /:id/versions.
router.post(
  "/:id/versions/from-json",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({ xlsform_json: z.record(z.unknown()) });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(parsed.error.issues[0].message, 422));
      }

      const { xlsform_json } = parsed.data;

      const existing = await pool.query(
        `SELECT f.id, f.current_version, fv.xlsform_json
           FROM public.forms f
           JOIN public.form_versions fv
             ON fv.form_id = f.id AND fv.version = f.current_version
          WHERE f.id = $1 AND f.org_id = $2 AND f.is_active = true`,
        [req.params.id, req.user!.org_id],
      );

      if (!existing.rows[0]) {
        return next(createError("Form not found", 404));
      }

      const { current_version, xlsform_json: prevJson } = existing.rows[0];

      const validation = validateXlsFormJson(xlsform_json);
      if (!validation.ok) {
        res.status(422).json({
          error: "XLSForm validation failed",
          details: validation.errors,
        });
        return;
      }

      const prevFields = new Set<string>(
        (prevJson.survey as XlsRow[])
          .filter((r) => {
            const t = String(r.type ?? "")
              .toLowerCase()
              .split(" ")[0]
              .trim();
            return t && !META_TYPES.has(t) && r.name;
          })
          .map((r) => String(r.name)),
      );

      const newFields = new Set<string>(validation.fieldNames);
      const removed = [...prevFields].filter((f) => !newFields.has(f));

      if (removed.length > 0) {
        res.status(422).json({
          error:
            "Breaking change detected: existing data-collection fields have been " +
            "removed or renamed. Create a new form with a different form_key instead.",
          removed_fields: removed,
        });
        return;
      }

      const nextVersion = (current_version as number) + 1;
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        await client.query(
          `INSERT INTO public.form_versions
                  (form_id, version, xlsform_json, published_by)
           VALUES ($1, $2, $3, $4)`,
          [
            req.params.id,
            nextVersion,
            JSON.stringify(xlsform_json),
            req.user!.id,
          ],
        );

        const formResult = await client.query(
          `UPDATE public.forms
              SET current_version = $1
            WHERE id = $2
           RETURNING id, org_id, folder_schema, form_key, display_name,
                     current_version, is_active, created_by, created_at`,
          [nextVersion, req.params.id],
        );

        await client.query("COMMIT");
        res.status(201).json(formResult.rows[0]);
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /forms/:id ─────────────────────────────────────────
router.delete(
  "/:id",
  requireAuth(["admin"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `UPDATE public.forms
            SET is_active = false
          WHERE id = $1 AND org_id = $2
         RETURNING id`,
        [req.params.id, req.user!.org_id],
      );

      if (!result.rows[0]) {
        return next(createError("Form not found", 404));
      }

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
