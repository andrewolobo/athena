export type Role = "admin" | "supervisor" | "enumerator";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  org_id: string;
}

export interface IndicatorSummaryRow {
  id: string;
  code: string;
  name: string;
  unit_of_measure: string | null;
  annual_target: number | null;
  baseline_value: number | null;
  latest_actual: number | null;
  progress_pct: number | null;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  latest_computed_at: string | null;
  source_form_name: string | null;
}

export interface ReportingSummary {
  org_id: string;
  generated_at: string;
  indicators: IndicatorSummaryRow[];
}

export interface Paginated<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export interface Form {
  id: string;
  org_id: string;
  folder_schema: string;
  form_key: string;
  display_name: string;
  current_version: number;
  is_active: boolean;
  created_at: string;
}

export interface Indicator {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit_of_measure: string | null;
  annual_target: number | null;
  baseline_value: number | null;
  baseline_date: string | null;
  latest_actual_value: number | null;
  latest_computed_at: string | null;
  source_form_name: string | null;
  source_form_key: string | null;
}

export interface OrgUser {
  id: string;
  org_id: string;
  email: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface FlatField {
  name: string;
  label: string;
  type: string;
  value: string | null;
}

export interface Submission {
  id: string;
  entity_id: string;
  enumerator_id: string;
  form_id: string;
  form_version: number;
  status: "pending" | "approved" | "quarantined" | "conflict";
  start_time: string;
  end_time: string;
  server_received_at: string;
  fields?: FlatField[];
}

export interface SubmissionDetail {
  submission_id: string;
  form_display_name: string;
  folder_schema: string;
  form_key: string;
  form_version: number;
  entity_id: string;
  entity_name: string | null;
  enumerator_display_name: string | null;
  enumerator_email: string;
  start_time: string;
  end_time: string;
  server_received_at: string;
  location: { lat: number; lng: number } | null;
  status: string;
  dqa_notes: string | null;
  fields: FlatField[];
  raw_payload: Record<string, unknown>;
}

export interface QuarantineEntry {
  id: string;
  entity_id: string;
  form_id: string;
  failure_reason: string;
  failure_detail: string | null;
  queued_at: string;
  resolved: boolean;
}

export interface Conflict {
  id: string;
  entity_id: string;
  form_id: string;
  resolved: boolean;
  created_at: string;
}
export interface Device {
  id: string;
  user_id: string;
  device_id: string;
  sim_serial: string | null;
  phone_number: string | null;
  last_seen_at: string | null;
  registered_at: string;
  user_email: string;
  user_display_name: string | null;
}

export interface DayActivity {
  date: string;
  day: string;
  count: number;
}

export interface RecentSubmission {
  submission_id: string;
  form_display_name: string;
  folder_schema: string;
  form_key: string;
  entity_id: string;
  entity_name: string | null;
  enumerator_display_name: string | null;
  enumerator_email: string;
  server_received_at: string;
  status: string;
}

// ── Insight Builder ──────────────────────────────────────────

export type InsightKind = "categorical" | "temporal" | "numerical" | "unknown";
export type InsightChartType = "pie" | "bar_horizontal" | "line";
export type InsightTimeGrain = "day" | "week" | "month";

export interface InsightField {
  name: string;
  label: string;
  xlsform_type: string;
  kind: InsightKind;
}

export interface InsightAggregateCategorical {
  field: string;
  label: string;
  kind: "categorical";
  buckets: { key: string; label: string; count: number }[];
  total: number;
}

export interface InsightAggregateTemporal {
  field: string;
  label: string;
  kind: "temporal";
  time_grain: InsightTimeGrain;
  series: { bucket: string; count: number }[];
  total: number;
}

export type InsightAggregate =
  | InsightAggregateCategorical
  | InsightAggregateTemporal;
