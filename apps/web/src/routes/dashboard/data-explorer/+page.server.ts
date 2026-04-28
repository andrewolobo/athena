import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { apiFetch, ApiError } from "$lib/api";
import type { Form, Paginated, Submission } from "$lib/types";

export const load: PageServerLoad = async ({ cookies, url, parent }) => {
  const { user } = await parent();
  if (user.role === "enumerator") {
    redirect(303, "/dashboard");
  }

  const token = cookies.get("athena_session")!;
  const folderSchema = url.searchParams.get("folder_schema") ?? "";
  const formKey = url.searchParams.get("form_key") ?? "";
  const page = Number(url.searchParams.get("page") ?? "1");

  const forms = await apiFetch<Form[]>("/forms", token);

  let submissions: Paginated<Submission> | null = null;
  let submissionsError: string | null = null;

  if (folderSchema && formKey) {
    try {
      submissions = await apiFetch<Paginated<Submission>>(
        `/reporting/submissions?folder_schema=${encodeURIComponent(folderSchema)}&form_key=${encodeURIComponent(formKey)}&page=${page}&limit=25&all_fields=true`,
        token,
      );
    } catch (err) {
      submissionsError =
        err instanceof ApiError ? err.message : "Failed to load submissions";
    }
  }

  return { forms, submissions, submissionsError, folderSchema, formKey, page };
};
