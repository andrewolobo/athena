<script lang="ts">
  import { formBuilder, formErrors } from "$lib/stores/formBuilder";

  export let editMode = false;

  $: displayNameError = $formErrors.find(
    (e) => e.field === "display_name",
  )?.message;
  $: formKeyError = $formErrors.find((e) => e.field === "form_key")?.message;
  $: folderSchemaError = $formErrors.find(
    (e) => e.field === "folder_schema",
  )?.message;
  $: questionsError = $formErrors.find((e) => e.field === "questions")?.message;

  // Track whether the user has manually edited the form_key so we stop auto-suggesting
  let manualKey = !!$formBuilder.form_key;

  function onDisplayNameInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    const patch: Parameters<typeof formBuilder.setMeta>[0] = {
      display_name: val,
    };
    if (!manualKey) {
      patch.form_key = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
    }
    formBuilder.setMeta(patch);
  }

  function onFormKeyInput(e: Event) {
    manualKey = true;
    formBuilder.setMeta({ form_key: (e.target as HTMLInputElement).value });
  }
</script>

<div class="max-w-xl">
  <h2 class="font-headline font-semibold text-lg text-on-surface mb-6">
    Form Settings
  </h2>

  <div class="space-y-5">
    <!-- Display name -->
    <div>
      <label
        class="block text-sm font-medium text-on-surface mb-1.5"
        for="fs-display-name"
      >
        Form Title <span class="text-error">*</span>
      </label>
      <input
        id="fs-display-name"
        type="text"
        value={$formBuilder.display_name}
        on:input={onDisplayNameInput}
        placeholder="e.g. Water Point Baseline Survey"
        class="w-full px-3 py-2.5 text-sm rounded-xl bg-white
               focus:outline-none focus:ring-2 focus:ring-primary/20
               {displayNameError
          ? 'border border-error/60 ring-2 ring-error/10'
          : 'border border-surface-variant/40 focus:border-primary'}"
      />
      {#if displayNameError}
        <p class="text-xs text-error mt-1">{displayNameError}</p>
      {/if}
    </div>

    <!-- Form key -->
    <div>
      <label
        class="block text-sm font-medium text-on-surface mb-1.5"
        for="fs-form-key"
      >
        Form Key <span class="text-error">*</span>
      </label>
      <input
        id="fs-form-key"
        type="text"
        value={$formBuilder.form_key}
        on:input={onFormKeyInput}
        placeholder="e.g. water_point_baseline"
        disabled={editMode}
        class="w-full px-3 py-2.5 text-sm rounded-xl font-mono
               focus:outline-none focus:ring-2 focus:ring-primary/20
               {editMode
          ? 'bg-surface-container-low text-on-surface/50 border border-surface-variant/20 cursor-not-allowed'
          : formKeyError
            ? 'bg-white border border-error/60 ring-2 ring-error/10'
            : 'bg-white border border-surface-variant/40 focus:border-primary'}"
      />
      {#if formKeyError}
        <p class="text-xs text-error mt-1">{formKeyError}</p>
      {:else}
        <p class="text-xs text-on-surface/40 mt-1">
          {editMode
            ? "Locked — form key cannot be changed after publishing."
            : "Unique identifier within the sector. Lowercase letters, digits, underscores only. Cannot be changed after first save."}
        </p>
      {/if}
    </div>

    <!-- Folder / sector schema -->
    <div>
      <label
        class="block text-sm font-medium text-on-surface mb-1.5"
        for="fs-folder-schema"
      >
        Sector / Folder <span class="text-error">*</span>
      </label>
      <input
        id="fs-folder-schema"
        type="text"
        value={$formBuilder.folder_schema}
        on:input={(e) =>
          formBuilder.setMeta({ folder_schema: e.currentTarget.value })}
        placeholder="e.g. wash_sector"
        disabled={editMode}
        class="w-full px-3 py-2.5 text-sm rounded-xl font-mono
               focus:outline-none focus:ring-2 focus:ring-primary/20
               {editMode
          ? 'bg-surface-container-low text-on-surface/50 border border-surface-variant/20 cursor-not-allowed'
          : folderSchemaError
            ? 'bg-white border border-error/60 ring-2 ring-error/10'
            : 'bg-white border border-surface-variant/40 focus:border-primary'}"
      />
      {#if folderSchemaError}
        <p class="text-xs text-error mt-1">{folderSchemaError}</p>
      {:else}
        <p class="text-xs text-on-surface/40 mt-1">
          The PostgreSQL schema this form belongs to (e.g.
          <code class="font-mono">wash_sector</code>,
          <code class="font-mono">health_sector</code>).
        </p>
      {/if}
    </div>

    {#if questionsError}
      <div
        class="flex items-start gap-2 text-sm text-error bg-error/5 px-3 py-2.5 rounded-xl"
      >
        <span class="material-symbols-outlined text-[18px] shrink-0 mt-0.5"
          >warning</span
        >
        {questionsError}
      </div>
    {/if}
  </div>
</div>
