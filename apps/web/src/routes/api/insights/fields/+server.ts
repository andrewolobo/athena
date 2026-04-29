import type { RequestHandler } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const API_BASE = env.API_BASE_URL ?? "http://localhost:3000";
const COOKIE_NAME = "athena_session";

/**
 * Client-side proxy for GET /insights/fields.
 *
 * The browser cannot reach the Express API directly with the HttpOnly
 * athena_session cookie, so this route forwards the request along with
 * the cookie and streams the JSON response back.
 *
 * Query params forwarded: folder_schema, form_key
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    redirect(303, "/login");
  }

  const upstream = new URL("/insights/fields", API_BASE);
  upstream.search = url.searchParams.toString();

  const apiRes = await fetch(upstream.toString(), {
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
