/**
 * Insight Builder — XLSForm type → analytic kind mapping.
 *
 * Field "kind" drives which charts are offered to the user:
 *   categorical → pie / horizontal bar
 *   temporal    → line over time
 *   numerical   → not pinnable in v1 (UI shows disabled state)
 *   unknown     → not pinnable (notes, calculates, free text, media, geo, …)
 *
 * The XLSForm `type` column for select fields carries the choice list
 * name, e.g. "select_one gender". We strip the suffix and key off the
 * head token so both `select_one` and `select_one gender` map the same.
 *
 * Choices were made conservatively:
 *  - `text` is NOT categorical: free-text fields can have unbounded
 *    cardinality and produce noisy charts.
 *  - `start` / `end` are NOT temporal here: they are XLSForm metadata
 *    questions captured into rigid relational columns (start_time /
 *    end_time), not the JSONB payload that aggregations read from.
 */

export type InsightKind = "categorical" | "temporal" | "numerical" | "unknown";

const CATEGORICAL = new Set([
  "select_one",
  "select_multiple",
]);

const NUMERICAL = new Set([
  "integer",
  "decimal",
  "range",
]);

const TEMPORAL = new Set([
  "date",
  "datetime",
  "time",
]);

/**
 * Derive the analytic kind for a single XLSForm field type string.
 *
 * Mirrors the head-token extraction used by the DQA pipeline
 * (apps/api/src/modules/dqa/pipeline.ts) so behaviour stays consistent.
 */
export function deriveKind(xlsformType: unknown): InsightKind {
  if (typeof xlsformType !== "string") return "unknown";
  const head = xlsformType.trim().toLowerCase().split(/\s+/)[0];
  if (!head) return "unknown";
  if (CATEGORICAL.has(head)) return "categorical";
  if (NUMERICAL.has(head)) return "numerical";
  if (TEMPORAL.has(head)) return "temporal";
  return "unknown";
}

/** Kinds that the Insight Builder can render and persist. */
export function isPinnableKind(kind: InsightKind): boolean {
  return kind === "categorical" || kind === "temporal";
}
