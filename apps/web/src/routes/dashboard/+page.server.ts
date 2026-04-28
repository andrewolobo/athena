import type { PageServerLoad } from "./$types";
import { apiFetch } from "$lib/api";
import type {
  ReportingSummary,
  Paginated,
  QuarantineEntry,
  Conflict,
  Form,
  DayActivity,
  RecentSubmission,
} from "$lib/types";

export const load: PageServerLoad = async ({ cookies }) => {
  const token = cookies.get("athena_session")!;

  const [summary, quarantine, conflicts, forms, activity, recentSubmissions] =
    await Promise.allSettled([
      apiFetch<ReportingSummary>("/reporting/summary", token),
      apiFetch<Paginated<QuarantineEntry>>("/quarantine?limit=1", token),
      apiFetch<Conflict[]>("/conflicts", token),
      apiFetch<Form[]>("/forms", token),
      apiFetch<DayActivity[]>("/reporting/activity", token),
      apiFetch<RecentSubmission[]>("/reporting/recent", token),
    ]);

  const reportingSummary =
    summary.status === "fulfilled" ? summary.value : null;
  const quarantineTotal =
    quarantine.status === "fulfilled" ? quarantine.value.pagination.total : 0;
  const conflictsTotal =
    conflicts.status === "fulfilled" ? conflicts.value.length : 0;
  const formsTotal = forms.status === "fulfilled" ? forms.value.length : 0;
  const activeForms =
    forms.status === "fulfilled"
      ? forms.value.filter((f) => f.is_active).length
      : 0;

  // Derive sector distribution from forms
  const sectorMap: Record<string, number> = {};
  if (forms.status === "fulfilled") {
    for (const f of forms.value) {
      sectorMap[f.folder_schema] = (sectorMap[f.folder_schema] ?? 0) + 1;
    }
  }
  const sectors = Object.entries(sectorMap).map(([name, count]) => ({
    name,
    count,
  }));

  return {
    summary: reportingSummary,
    quarantineTotal,
    conflictsTotal,
    formsTotal,
    activeForms,
    sectors,
    activity: activity.status === "fulfilled" ? activity.value : [],
    recentSubmissions:
      recentSubmissions.status === "fulfilled" ? recentSubmissions.value : [],
  };
};
