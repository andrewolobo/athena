<script lang="ts">
  import { formBuilder, formErrors } from "$lib/stores/formBuilder";
  import type { QuestionType } from "$lib/utils/xlsform";
  import {
    QUESTION_CATEGORIES,
    QUESTION_TYPE_LABELS,
  } from "$lib/utils/xlsform";
  import QuestionList from "./QuestionList.svelte";
  import FormSettings from "./FormSettings.svelte";

  export let saving = false;
  export let error: string | null = null;
  export let editMode = false;

  const FORM_ID = "builder-form";

  let selectedId: string | null = null;
  let activeTab: "fields" | "settings" = "fields";

  // Clear selection when question is deleted
  $: if (
    selectedId &&
    !$formBuilder.questions.some((q) => q._id === selectedId)
  ) {
    selectedId = null;
  }

  // Footer progress
  $: filledCount = $formBuilder.questions.filter(
    (q) => ["end_group", "end_repeat"].includes(q.type) || q.label.trim(),
  ).length;
  $: totalCount = $formBuilder.questions.length;
  $: progressPct =
    totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

  function addQuestion(type: QuestionType) {
    formBuilder.addQuestion(type);
    const added = $formBuilder.questions[$formBuilder.questions.length - 1];
    selectedId = added._id;
  }

  function handleSelect(e: CustomEvent<string>) {
    selectedId = e.detail;
  }

  function handleDelete(e: CustomEvent<string>) {
    formBuilder.removeQuestion(e.detail);
    if (selectedId === e.detail) selectedId = null;
  }

  function handleMove(e: CustomEvent<{ from: number; to: number }>) {
    formBuilder.moveQuestion(e.detail.from, e.detail.to);
  }

  const TYPE_ICONS: Record<QuestionType, string> = {
    text: "short_text",
    integer: "pin",
    decimal: "numbers",
    date: "calendar_today",
    datetime: "event",
    time: "schedule",
    note: "sticky_note_2",
    select_one: "radio_button_checked",
    select_multiple: "check_box",
    image: "photo_camera",
    audio: "mic",
    geopoint: "location_on",
    begin_group: "folder",
    end_group: "folder_off",
    begin_repeat: "repeat",
    end_repeat: "last_page",
    calculate: "functions",
  };
</script>

<div class="h-full flex overflow-hidden bg-surface">
  <!-- ── Left Sidebar ─────────────────────────────────── -->
  <aside
    class="w-72 shrink-0 flex flex-col bg-white border-r border-surface-variant/20"
  >
    <!-- Sidebar header -->
    <div class="px-6 py-5 border-b border-surface-variant/15">
      <h2
        class="text-[10px] font-bold uppercase tracking-widest text-on-surface/40"
      >
        Builder Tools
      </h2>
    </div>

    <!-- Tab switchers -->
    <div class="flex gap-1 px-3 py-3 border-b border-surface-variant/15">
      <button
        type="button"
        on:click={() => (activeTab = "fields")}
        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm
               font-medium transition-colors
               {activeTab === 'fields'
          ? 'bg-primary/10 text-primary'
          : 'text-on-surface/60 hover:bg-surface-container'}"
      >
        <span class="material-symbols-outlined text-[16px]">add_circle</span>
        Fields
      </button>
      <button
        type="button"
        on:click={() => (activeTab = "settings")}
        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm
               font-medium transition-colors
               {activeTab === 'settings'
          ? 'bg-primary/10 text-primary'
          : 'text-on-surface/60 hover:bg-surface-container'}"
      >
        <span class="material-symbols-outlined text-[16px]">settings</span>
        Settings
      </button>
    </div>

    <!-- Tab content -->
    <div class="flex-1 overflow-y-auto px-4 py-4">
      {#if activeTab === "fields"}
        {#each QUESTION_CATEGORIES as cat}
          <div class="mb-5">
            <div
              class="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 px-1 mb-2"
            >
              {cat.label}
            </div>
            <div class="grid grid-cols-1 gap-1.5">
              {#each cat.types as type}
                <button
                  type="button"
                  on:click={() => addQuestion(type)}
                  class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border
                         border-surface-variant/30 text-left hover:bg-primary/5
                         hover:border-primary/30 transition-colors group"
                >
                  <span
                    class="material-symbols-outlined text-[20px] text-on-surface/40
                           group-hover:text-primary transition-colors shrink-0"
                  >
                    {TYPE_ICONS[type]}
                  </span>
                  <span
                    class="text-sm font-medium text-on-surface group-hover:text-primary
                           transition-colors"
                  >
                    {QUESTION_TYPE_LABELS[type]}
                  </span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {:else}
        <FormSettings {editMode} />
      {/if}
    </div>
  </aside>

  <!-- ── Main area ─────────────────────────────────────── -->
  <div class="flex flex-col flex-1 min-w-0">
    <!-- Slim toolbar -->
    <div
      class="shrink-0 flex items-center justify-between gap-4 px-6 py-4 bg-white
             border-b border-surface-variant/20"
    >
      <div class="flex items-center gap-3 min-w-0">
        <a
          href="/dashboard/forms"
          class="flex items-center gap-1 text-sm text-on-surface/50 hover:text-primary
                 transition-colors shrink-0"
        >
          <span class="material-symbols-outlined text-[18px]">arrow_back</span>
          Forms
        </a>
        <span class="text-on-surface/20 shrink-0">/</span>
        <span class="font-headline font-semibold text-on-surface truncate">
          {$formBuilder.display_name || "New Form"}
        </span>
      </div>
      {#if error}
        <span class="flex items-center gap-1 text-sm text-error shrink-0">
          <span class="material-symbols-outlined text-[16px]">error</span>
          {error}
        </span>
      {/if}
    </div>

    <!-- Scrollable canvas -->
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-3xl mx-auto px-6 py-8 space-y-5">
        <!-- Form header card -->
        <div
          class="bg-white rounded-2xl shadow-sm relative overflow-hidden px-8 py-7"
        >
          <div
            class="absolute top-0 left-0 w-full h-1.5"
            style="background: linear-gradient(to right, #0056d2, #004bb9)"
          ></div>
          <div class="flex items-start justify-between gap-4 pt-1">
            <div>
              <h1
                class="font-headline text-2xl font-bold text-on-surface leading-snug"
              >
                {$formBuilder.display_name || "Untitled Form"}
              </h1>
              <p class="text-sm text-on-surface/50 mt-1">
                {#if $formBuilder.folder_schema}
                  Sector: {$formBuilder.folder_schema}
                {:else}
                  Configure form details in the
                  <button
                    type="button"
                    class="text-primary underline-offset-2 hover:underline"
                    on:click={() => (activeTab = "settings")}
                    >Settings tab</button
                  >
                {/if}
              </p>
            </div>
            <span
              class="shrink-0 bg-secondary-container text-on-secondary-container px-3 py-1
                     rounded-full text-xs font-bold uppercase tracking-widest"
            >
              Draft
            </span>
          </div>
        </div>

        <!-- Question canvas -->
        <QuestionList
          questions={$formBuilder.questions}
          {selectedId}
          errors={$formErrors}
          choiceLists={$formBuilder.choice_lists}
          on:select={handleSelect}
          on:delete={handleDelete}
          on:move={handleMove}
        />

        <!-- Drop target / add-next prompt -->
        <button
          type="button"
          on:click={() => (activeTab = "fields")}
          class="w-full border-2 border-dashed border-outline-variant/30 rounded-2xl py-10 px-6
                 flex flex-col items-center justify-center hover:bg-surface-container-low/50
                 hover:border-primary/40 transition-all group"
        >
          <div
            class="bg-white w-14 h-14 rounded-full flex items-center justify-center shadow-sm mb-3
                   group-hover:scale-110 transition-transform"
          >
            <span class="material-symbols-outlined text-primary text-[28px]"
              >add</span
            >
          </div>
          <p class="font-headline font-semibold text-on-surface mb-1">
            Add your next field
          </p>
          <p class="text-sm text-on-surface/40 text-center max-w-xs">
            Select a field type from the left sidebar to add it to your form.
          </p>
        </button>
      </div>
    </main>

    <!-- Sticky footer -->
    <div
      class="shrink-0 bg-white/90 backdrop-blur-xl border-t border-surface-variant/20 px-6 py-4"
    >
      <div class="flex items-center justify-between gap-6">
        <!-- Progress -->
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <div
              class="w-32 h-1.5 bg-surface-variant/40 rounded-full overflow-hidden"
            >
              <div
                class="h-full bg-primary rounded-full transition-all duration-300"
                style="width: {progressPct}%"
              ></div>
            </div>
            <span class="text-xs font-bold text-primary">{progressPct}%</span>
          </div>
          <p
            class="text-[10px] uppercase tracking-wider text-on-surface/40 font-semibold"
          >
            {filledCount} of {totalCount} fields complete
          </p>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3">
          <button
            type="submit"
            form={FORM_ID}
            disabled={saving}
            class="px-5 py-2 text-sm font-medium text-on-surface border border-surface-variant/40
                   rounded-xl hover:bg-surface-container-low transition-colors disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={saving}
            class="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-white rounded-xl
                   hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
            style="background: linear-gradient(135deg, #0056d2 0%, #004bb9 100%)"
          >
            {#if saving}
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            {:else}
              <span class="material-symbols-outlined text-[16px]">save</span>
            {/if}
            Save Form
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
