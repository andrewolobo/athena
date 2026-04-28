import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { apiFetch, ApiError } from "$lib/api";
import type { Device } from "$lib/types";

export const load: PageServerLoad = async ({ cookies, parent }) => {
  const { user } = await parent();
  if (user?.role !== "admin") {
    redirect(303, "/dashboard");
  }

  const token = cookies.get("athena_session")!;
  const devices = await apiFetch<Device[]>("/org/devices", token);
  return { devices };
};

export const actions: Actions = {
  remove: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const id = String(fd.get("id") ?? "");

    if (!id) return fail(400, { removeError: "Missing device id." });

    try {
      await apiFetch(`/org/devices/${id}`, token, { method: "DELETE" });
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : "Could not remove device.";
      return fail(422, { removeError: msg });
    }
  },
};
