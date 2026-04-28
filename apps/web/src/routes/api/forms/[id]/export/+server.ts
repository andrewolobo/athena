import type { RequestHandler } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const API_BASE = env.API_BASE_URL ?? "http://localhost:3000";
const COOKIE_NAME = "athena_session";

export const GET: RequestHandler = async ({ params, cookies }) => {
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    redirect(303, "/login");
  }

  const res = await fetch(`${API_BASE}/forms/${params.id}/export`, {
    headers: {
      Cookie: `${COOKIE_NAME}=${token}`,
    },
  });

  if (res.status === 401) {
    redirect(303, "/login");
  }

  if (!res.ok) {
    return new Response("Failed to export form", { status: res.status });
  }

  const contentType =
    res.headers.get("Content-Type") ??
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const contentDisposition =
    res.headers.get("Content-Disposition") ?? "attachment";

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
    },
  });
};
