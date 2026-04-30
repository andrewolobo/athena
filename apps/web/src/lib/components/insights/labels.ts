/**
 * Insight Builder — user-facing string constants.
 *
 * The codebase has no i18n framework yet. Centralising the labels here
 * gives us i18n-readiness: when a translation layer lands, this file
 * becomes the single point of change for the Insight Builder strings.
 *
 * The API emits sentinel bucket keys (`__unspecified__`, `__other__`)
 * with English fallback labels so non-localised consumers get sensible
 * output by default; the dashboard overrides those fallbacks at render
 * time using these constants.
 */

export const INSIGHT_LABELS = {
  unspecified: "Unspecified",
  other: "Other",

  // Empty-state copy
  noDataCategorical:
    "No values yet for this field. The chart will populate as submissions arrive.",
  noDataTemporal:
    "No dated submissions yet for this field. The trend will appear once data starts arriving.",
  noDataTile: "No data to display",

  emptyGridTitle: "No insights pinned yet",
  emptyGridBody:
    "Pin a chart from the Data Explorer to monitor it from your dashboard.",
  emptyGridCta: "Open the Data Explorer",

  // Toast copy
  toastPinned: "Insight pinned to your dashboard.",
  toastPinFailed: "Could not pin insight.",
  toastDeleted: "Insight removed.",
  toastDeleteFailed: "Could not delete insight.",
} as const;

/** Resolve a server-emitted bucket key to a localised display label.
 *  Sentinel keys take precedence over the server-supplied label so the
 *  same fallback string never gets rendered untranslated. */
export function resolveBucketLabel(key: string, fallback: string): string {
  if (key === "__unspecified__") return INSIGHT_LABELS.unspecified;
  if (key === "__other__") return INSIGHT_LABELS.other;
  return fallback;
}
