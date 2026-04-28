<script lang="ts">
  import { onMount } from "svelte";
  import { enhance } from "$app/forms";
  import { formBuilder } from "$lib/stores/formBuilder";
  import { serialize, deserialize } from "$lib/utils/xlsform";
  import FormBuilder from "$lib/components/form-builder/FormBuilder.svelte";
  import type { ActionData, PageData } from "./$types";

  export let data: PageData;
  export let form: ActionData;

  let saving = false;

  $: xlsformJson = JSON.stringify(serialize($formBuilder));

  onMount(() => {
    // Populate the builder with the existing form's xlsform_json
    const state = deserialize(
      data.definition as Parameters<typeof deserialize>[0],
      {
        display_name: data.form.display_name,
        form_key: data.form.form_key,
        folder_schema: data.form.folder_schema,
      },
    );
    formBuilder.load(state);
  });
</script>

<svelte:head>
  <title>Edit {data.form.display_name} — Athena</title>
</svelte:head>

<!--
  The hidden xlsform_json input is synced reactively.
  The form_key and folder_schema are read-only on edits (breaking-change
  protection on the API side); we only post the updated survey content.
-->
<form
  id="builder-form"
  method="POST"
  action="?/save"
  class="h-full flex flex-col"
  use:enhance={() => {
    saving = true;
    return async ({ update }) => {
      saving = false;
      await update({ reset: false });
    };
  }}
>
  <input type="hidden" name="xlsform_json" value={xlsformJson} />

  <FormBuilder {saving} error={form?.error ?? null} editMode />
</form>
