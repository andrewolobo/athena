import type { RequestHandler } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const API_BASE = env.API_BASE_URL ?? "http://localhost:3000";
const COOKIE_NAME = "athena_session";

/**
 * Proxy for GET /dashboards (list) and POST /dashboards (create).
 *
 * Forwards the auth cookie to the upstream API; validation and business
 * logic live entirely in the Express handler.
 */
export const GET: RequestHandler = async ({ cookies }) => {
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    redirect(303, "/login");
  }

  const apiRes = await fetch(`${API_BASE}/dashboards`, {
    headers: { Cookie: `${COOKIE_NAME}=${token}` },
  });

  if (apiRes.status === 401) {
    redirect(303, "/login");
  }

  return new Response(apiRes.body, {
    status: apiRes.status,
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    redirect(303, "/login");
  }

  const body = await request.text();

  const apiRes = await fetch(`${API_BASE}/dashboards`, {
    method: "POST",
    headers: {
      Cookie: `${COOKIE_NAME}=${token}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (apiRes.status === 401) {
    redirect(303, "/login");
  }

  return new Response(apiRes.body, {
    status: apiRes.status,
    headers: { "Content-Type": "application/json" },
  });
};
