import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { apiFetch, ApiError } from "$lib/api";

export const actions: Actions = {
  save: async ({ request, cookies }) => {
    const token = cookies.get("athena_session") ?? "";
    const fd = await request.formData();

    const folder_schema = (
      (fd.get("folder_schema") as string | null) ?? ""
    ).trim();
    const form_key = ((fd.get("form_key") as string | null) ?? "").trim();
    const display_name = (
      (fd.get("display_name") as string | null) ?? ""
    ).trim();
    const xlsform_json_str = (fd.get("xlsform_json") as string | null) ?? "";

    if (!folder_schema || !form_key || !display_name) {
      return fail(422, {
        error: "Form title, key, and sector are all required.",
      });
    }

    let xlsform_json: unknown;
    try {
      xlsform_json = JSON.parse(xlsform_json_str);
    } catch {
      return fail(422, {
        error: "Internal error: could not serialise form data.",
      });
    }

    try {
      await apiFetch("/forms/from-json", token, {
        method: "POST",
        body: JSON.stringify({
          folder_schema,
          form_key,
          display_name,
          xlsform_json,
        }),
      });
    } catch (e) {
      if (e instanceof ApiError) {
        return fail(e.status, { error: e.message });
      }
      throw e;
    }

    redirect(303, "/dashboard/forms");
  },
};
