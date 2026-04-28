import type { RequestHandler } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const API_BASE = env.API_BASE_URL ?? "http://localhost:3000";
const COOKIE_NAME = "athena_session";

/**
 * Client-side proxy for GET /reporting/submissions/:id
 *
 * The SvelteKit `apiFetch` helper is server-only (uses $env/dynamic/private),
 * so the detail drawer fetches through this route instead.
 *
 * Query params forwarded: folder_schema, form_key
 */
export const GET: RequestHandler = async ({ params, url, cookies }) => {
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    redirect(303, "/login");
  }

  const folderSchema = url.searchParams.get("folder_schema") ?? "";
  const formKey = url.searchParams.get("form_key") ?? "";

  const upstream = new URL(`/reporting/submissions/${params.id}`, API_BASE);
  upstream.searchParams.set("folder_schema", folderSchema);
  upstream.searchParams.set("form_key", formKey);

  const res = await fetch(upstream.toString(), {
    headers: {
      Cookie: `${COOKIE_NAME}=${token}`,
    },
  });

  if (res.status === 401) {
    redirect(303, "/login");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    return new Response(JSON.stringify(body), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(res.body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
