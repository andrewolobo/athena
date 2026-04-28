import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { apiFetch, ApiError } from "$lib/api";

export const load: PageServerLoad = async ({ params, cookies }) => {
  const token = cookies.get("athena_session") ?? "";

  // Load form metadata
  let form: {
    id: string;
    display_name: string;
    form_key: string;
    folder_schema: string;
    current_version: number;
    is_active: boolean;
  };
  try {
    form = await apiFetch(`/forms/${params.id}`, token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      throw error(404, "Form not found");
    }
    throw e;
  }

  // Load the current xlsform_json definition
  let definition: {
    survey: unknown[];
    choices: unknown[];
    settings: unknown[];
  };
  try {
    definition = await apiFetch(`/forms/${params.id}/definition`, token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      throw error(404, "Form definition not found");
    }
    throw e;
  }

  return { form, definition };
};

export const actions: Actions = {
  save: async ({ params, request, cookies }) => {
    const token = cookies.get("athena_session") ?? "";
    const fd = await request.formData();

    const xlsform_json_str = (fd.get("xlsform_json") as string | null) ?? "";

    let xlsform_json: unknown;
    try {
      xlsform_json = JSON.parse(xlsform_json_str);
    } catch {
      return fail(422, {
        error: "Internal error: could not serialise form data.",
      });
    }

    try {
      await apiFetch(`/forms/${params.id}/versions/from-json`, token, {
        method: "POST",
        body: JSON.stringify({ xlsform_json }),
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
