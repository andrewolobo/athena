import { fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { apiFetch, apiFetchMultipart, ApiError } from "$lib/api";
import type { Form } from "$lib/types";

export const load: PageServerLoad = async ({ cookies }) => {
  const token = cookies.get("athena_session")!;
  const forms = await apiFetch<Form[]>("/forms", token);
  return { forms };
};

export const actions: Actions = {
  upload: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const file = fd.get("file");
    if (!file || typeof file === "string") {
      return fail(400, { error: "Please select an XLSForm file." });
    }

    const folder_schema = (
      (fd.get("folder_schema") as string | null) ?? ""
    ).trim();
    const form_key = ((fd.get("form_key") as string | null) ?? "").trim();
    const display_name = (
      (fd.get("display_name") as string | null) ?? ""
    ).trim();

    if (!folder_schema || !form_key || !display_name) {
      return fail(422, {
        error: "Display name, sector, and form key are all required.",
      });
    }

    const body = new FormData();
    body.append("file", file);
    body.append("folder_schema", folder_schema);
    body.append("form_key", form_key);
    body.append("display_name", display_name);

    try {
      await apiFetchMultipart("/forms", token, body);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Upload failed.";
      return fail(422, { error: msg });
    }

    return { success: true };
  },
};
