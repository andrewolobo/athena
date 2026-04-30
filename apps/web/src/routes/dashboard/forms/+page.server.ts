import { fail, redirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { apiFetch, apiFetchMultipart, ApiError, API_BASE } from "$lib/api";
import type { Form, SectorConfig } from "$lib/types";

/** PATCH the API and handle 204 No Content responses. */
async function patchApi(path: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { Cookie: `athena_session=${token}` },
  });
  if (res.status === 401) redirect(303, "/login");
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
}

export const load: PageServerLoad = async ({ cookies }) => {
  const token = cookies.get("athena_session")!;
  const [forms, sectors] = await Promise.all([
    apiFetch<Form[]>("/forms?include_archived=true", token),
    apiFetch<SectorConfig[]>("/sectors", token),
  ]);
  return { forms, sectors };
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

  archiveForm: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const id = ((fd.get("id") as string | null) ?? "").trim();
    if (!id) return fail(400, { error: "Form ID is required." });
    try {
      await patchApi(`/forms/${id}/archive`, token);
    } catch (e) {
      return fail(422, {
        error: e instanceof ApiError ? e.message : "Archive failed.",
      });
    }
    return {};
  },

  unarchiveForm: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const id = ((fd.get("id") as string | null) ?? "").trim();
    if (!id) return fail(400, { error: "Form ID is required." });
    try {
      await patchApi(`/forms/${id}/unarchive`, token);
    } catch (e) {
      return fail(422, {
        error: e instanceof ApiError ? e.message : "Restore failed.",
      });
    }
    return {};
  },

  archiveSector: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const folder_schema = (
      (fd.get("folder_schema") as string | null) ?? ""
    ).trim();
    if (!folder_schema) return fail(400, { error: "Sector is required." });
    try {
      await patchApi(
        `/sectors/${encodeURIComponent(folder_schema)}/archive`,
        token,
      );
    } catch (e) {
      return fail(422, {
        error: e instanceof ApiError ? e.message : "Archive failed.",
      });
    }
    return {};
  },

  unarchiveSector: async ({ request, cookies }) => {
    const token = cookies.get("athena_session")!;
    const fd = await request.formData();
    const folder_schema = (
      (fd.get("folder_schema") as string | null) ?? ""
    ).trim();
    if (!folder_schema) return fail(400, { error: "Sector is required." });
    try {
      await patchApi(
        `/sectors/${encodeURIComponent(folder_schema)}/unarchive`,
        token,
      );
    } catch (e) {
      return fail(422, {
        error: e instanceof ApiError ? e.message : "Restore failed.",
      });
    }
    return {};
  },
};
