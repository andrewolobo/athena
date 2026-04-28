import { fail, redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { Actions, PageServerLoad } from "./$types";

// In Docker: API_BASE_URL=http://api:3000 (internal network).
// In bare-dev: API_BASE_URL=http://localhost:3000 (or not set — same default).
const API_BASE = env.API_BASE_URL ?? "http://localhost:3000";

const COOKIE_NAME = "athena_session";

export const load: PageServerLoad = async ({ cookies }) => {
  // If already authenticated, skip the login page.
  if (cookies.get(COOKIE_NAME)) {
    redirect(303, "/dashboard");
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = String(data.get("email") ?? "")
      .toLowerCase()
      .trim();
    const password = String(data.get("password") ?? "");

    if (!email || !password) {
      return fail(400, { error: "Email and password are required." });
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return fail(503, {
        error: "Unable to reach the server. Please try again.",
      });
    }

    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ error: "Login failed." }));
      const status = response.status === 429 ? 429 : response.status;
      return fail(status, { error: body.error ?? "Login failed." });
    }

    // Forward the session cookie from the API to the browser.
    const setCookieHeader = response.headers.get("set-cookie");
    if (setCookieHeader) {
      // Extract the bare token value from: "athena_session=<token>; ..."
      const match = setCookieHeader.match(/^athena_session=([^;]+)/);
      if (match) {
        const maxAgeMatch = setCookieHeader.match(/[Mm]ax-[Aa]ge=(\d+)/);
        cookies.set(COOKIE_NAME, match[1], {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: env.NODE_ENV === "production",
          maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 900,
        });
      }
    }

    redirect(303, "/dashboard");
  },
};
