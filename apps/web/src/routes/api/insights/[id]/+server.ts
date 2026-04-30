import type { RequestHandler } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const API_BASE = env.API_BASE_URL ?? "http://localhost:3000";
const COOKIE_NAME = "athena_session";

/** Forward an authenticated request to the upstream Insight API. */
async function forward(
  method: "PATCH" | "DELETE",
  id: string,
  cookies: { get: (name: string) => string | undefined },
  body: string | null,
): Promise<Response> {
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    redirect(303, "/login");
  }

  const apiRes = await fetch(`${API_BASE}/insights/${id}`, {
    method,
    headers: {
      Cookie: `${COOKIE_NAME}=${token}`,
      ...(body !== null ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });

  if (apiRes.status === 401) {
    redirect(303, "/login");
  }

  // 204 No Content has an empty body; preserve it.
  if (apiRes.status === 204) {
    return new Response(null, { status: 204 });
  }

  return new Response(apiRes.body, {
    status: apiRes.status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
  const body = await request.text();
  return forward("PATCH", params.id!, cookies, body);
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
  return forward("DELETE", params.id!, cookies, null);
};
