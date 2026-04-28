import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { apiFetch, ApiError } from "$lib/api";
import type { OrgUser } from "$lib/types";

export const load: PageServerLoad = async ({ cookies, parent }) => {
  const { user } = await parent();
  if (user?.role !== "admin") {
    redirect(303, "/dashboard");
  }

  const token = cookies.get("athena_session")!;
  const users = await apiFetch<OrgUser[]>("/org/users", token);
  return { users };
};

export const actions: Actions = {
  invite: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const email = String(fd.get("email") ?? "").trim();
    const display_name =
      String(fd.get("display_name") ?? "").trim() || undefined;
    const role = String(fd.get("role") ?? "enumerator");
    const password = String(fd.get("password") ?? "").trim() || undefined;

    if (!email) return fail(400, { inviteError: "Email is required." });

    try {
      await apiFetch("/org/users", token, {
        method: "POST",
        body: JSON.stringify({ email, display_name, role, password }),
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not create user.";
      return fail(422, { inviteError: msg });
    }
  },

  changeRole: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const id = String(fd.get("id") ?? "");
    const role = String(fd.get("role") ?? "");

    if (!id || !role) return fail(400, { roleError: "Missing id or role." });

    try {
      await apiFetch(`/org/users/${id}/role`, token, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Role change failed.";
      return fail(422, { roleError: msg });
    }
  },

  deactivate: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const id = String(fd.get("id") ?? "");

    if (!id) return fail(400, { deactivateError: "Missing user id." });

    try {
      await apiFetch(`/org/users/${id}`, token, { method: "DELETE" });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Deactivation failed.";
      return fail(422, { deactivateError: msg });
    }
  },

  setPassword: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const id = String(fd.get("id") ?? "");
    const new_password = String(fd.get("new_password") ?? "").trim();

    if (!id) return fail(400, { passwordError: "Missing user id." });
    if (new_password.length < 12)
      return fail(400, {
        passwordError: "Password must be at least 12 characters.",
        passwordUserId: id,
      });

    try {
      await apiFetch(`/org/users/${id}/set-password`, token, {
        method: "POST",
        body: JSON.stringify({ new_password }),
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Password reset failed.";
      return fail(422, { passwordError: msg, passwordUserId: id });
    }
    return { passwordSuccess: true, passwordUserId: id };
  },
};
