import { NextFunction } from "express";
import { pool } from "../../db";
import { createError } from "../../middleware/errorHandler";
import { assertSafeIdentifier } from "../dqa/pipeline";

export interface ResolvedFormTable {
  /** Fully qualified submissions table, e.g. `wash_sector.submissions_water_point_baseline`. */
  tableName: string;
  /** UUID of the row in public.forms. */
  formId: string;
  /** Whether the sector submissions table physically exists yet (forms can be registered before any data is ingested). */
  tableExists: boolean;
}

/**
 * Validate `folder_schema` and `form_key` query params, confirm the form
 * belongs to the caller's organisation, and return the qualified table
 * name plus the form's id. Centralises org isolation for read endpoints.
 *
 * Returns null after invoking `next(createError(...))` on any validation
 * failure, so route handlers should `if (!resolved) return;` after calling.
 */
export async function resolveFormTable(
  orgId: string,
  folderSchema: unknown,
  formKey: unknown,
  next: NextFunction,
): Promise<ResolvedFormTable | null> {
  if (!folderSchema || typeof folderSchema !== "string") {
    next(createError("Query param `folder_schema` is required", 422));
    return null;
  }
  if (!formKey || typeof formKey !== "string") {
    next(createError("Query param `form_key` is required", 422));
    return null;
  }

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
