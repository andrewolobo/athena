import type { PageServerLoad } from "./$types";
import { apiFetch } from "$lib/api";
import type { UserDashboard, UserInsight } from "$lib/types";

export const load: PageServerLoad = async ({ url, cookies }) => {
  const token = cookies.get("athena_session")!;

  // Always load the full dashboard list so the tab bar can render.
  // Errors are caught individually so a single API blip doesn't blank the page.
  let dashboards: UserDashboard[] = [];
  try {
    dashboards = await apiFetch<UserDashboard[]>("/dashboards", token);
  } catch {
    dashboards = [];
  }

  // The active dashboard is driven by the ?d= query param; fall back to the
  // default dashboard, then the first in the list, then null (no dashboards yet).
  const requestedId = url.searchParams.get("d");
  const activeDashboard =
    dashboards.find((d) => d.id === requestedId) ??
    dashboards.find((d) => d.is_default) ??
    dashboards[0] ??
    null;

  const activeDashboardId = activeDashboard?.id ?? null;

  let insights: UserInsight[] = [];
  if (activeDashboardId) {
    try {
      insights = await apiFetch<UserInsight[]>(
        `/insights/mine?dashboard_id=${activeDashboardId}`,
        token,
      );
    } catch {
      insights = [];
    }
  }

  return { dashboards, activeDashboardId, insights };
};
