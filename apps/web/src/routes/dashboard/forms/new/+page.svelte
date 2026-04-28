<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { formBuilder } from '$lib/stores/formBuilder';
  import { serialize } from '$lib/utils/xlsform';
  import FormBuilder from '$lib/components/form-builder/FormBuilder.svelte';
  import type { ActionData } from './$types';

  export let form: ActionData;

  let saving = false;

  // Keep the hidden input in sync with the builder state
  $: xlsformJson = JSON.stringify(serialize($formBuilder));

  onMount(() => {
    // Always start with an empty form when navigating to this page
    formBuilder.reset();
  });
</script>

<svelte:head>
  <title>New Form — Athena</title>
</svelte:head>

<!--
  The form wraps FormBuilder so that the Save button inside FormBuilder
  (form="builder-form") can submit this element by ID reference.
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
      // reset: false keeps the builder state intact so the user sees
      // their work even if the save returned an error
      await update({ reset: false });
    };
  }}
>
  <!-- Hidden inputs carry the serialised builder state to the server action -->
  <input type="hidden" name="folder_schema" value={$formBuilder.folder_schema} />
  <input type="hidden" name="form_key" value={$formBuilder.form_key} />
  <input type="hidden" name="display_name" value={$formBuilder.display_name} />
  <input type="hidden" name="xlsform_json" value={xlsformJson} />

  <FormBuilder {saving} error={form?.error ?? null} />
</form>
