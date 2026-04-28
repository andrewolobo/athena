import type { RequestHandler } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const API_BASE = env.API_BASE_URL ?? "http://localhost:3000";
const COOKIE_NAME = "athena_session";

/**
 * Passthrough proxy for GET /reporting/submissions/export
 *
 * The browser cannot reach the Express API directly with the HttpOnly
 * athena_session cookie (different origin), so this route forwards the
 * request and streams the CSV response back to the client.
 *
 * Query params forwarded: folder_schema, form_key, status, entity_id
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    redirect(303, "/login");
  }

  const upstream = new URL("/reporting/submissions/export", API_BASE);
  upstream.search = url.searchParams.toString();

  const apiRes = await fetch(upstream.toString(), {
    headers: { Cookie: `${COOKIE_NAME}=${token}` },
  });

  if (apiRes.status === 401) {
    redirect(303, "/login");
  }

  if (!apiRes.ok) {
    return new Response("Export failed", { status: apiRes.status });
  }

  return new Response(apiRes.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        apiRes.headers.get("Content-Disposition") ??
        'attachment; filename="export.csv"',
    },
  });
};
