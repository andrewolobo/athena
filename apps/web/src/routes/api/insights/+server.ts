import type { RequestHandler } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const API_BASE = env.API_BASE_URL ?? "http://localhost:3000";
const COOKIE_NAME = "athena_session";

/**
 * Client-side proxy for POST /insights.
 *
 * Forwards the JSON body verbatim — server-side zod validation in the
 * Express handler is the source of truth for shape and cross-field
 * checks; the proxy only ensures the auth cookie travels with the
 * request.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    redirect(303, "/login");
  }

  const body = await request.text();

  const apiRes = await fetch(`${API_BASE}/insights`, {
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
