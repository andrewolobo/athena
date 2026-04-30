import type { RequestHandler } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const API_BASE = env.API_BASE_URL ?? "http://localhost:3000";
const COOKIE_NAME = "athena_session";

/**
 * Client-side proxy for GET /insights/mine.
 *
 * Returns the caller's pinned insights for the home-dashboard grid.
 */
export const GET: RequestHandler = async ({ cookies }) => {
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    redirect(303, "/login");
  }

  const apiRes = await fetch(`${API_BASE}/insights/mine`, {
    headers: { Cookie: `${COOKIE_NAME}=${token}` },
  });

  if (apiRes.status === 401) {
    redirect(303, "/login");
  }

  if (!apiRes.ok) {
    const body = await apiRes.json().catch(() => ({ error: apiRes.statusText }));
    return new Response(JSON.stringify(body), {
      status: apiRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(apiRes.body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
