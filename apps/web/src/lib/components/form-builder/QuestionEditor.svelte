<script lang="ts">
  import { formBuilder } from "$lib/stores/formBuilder";
  import {
    type BuilderQuestion,
    type BuilderChoiceList,
    type ValidationError,
    SELECT_TYPES,
    NO_NAME_TYPES,
    NO_LABEL_TYPES,
  } from "$lib/utils/xlsform";

  export let question: BuilderQuestion;
  export let choiceLists: BuilderChoiceList[];
  export let errors: ValidationError[];

  $: nameError = errors.find((e) => e.field === "name")?.message;
  $: labelError = errors.find((e) => e.field === "label")?.message;
  $: choiceListError = errors.find(
    (e) => e.field === "choice_list_name",
  )?.message;

  $: isSelect = SELECT_TYPES.has(question.type);
  $: isNoName = NO_NAME_TYPES.has(question.type);
  $: isNoLabel = NO_LABEL_TYPES.has(question.type);
  $: isCalculate = question.type === "calculate";
  $: isNote = question.type === "note";
  $: showRelevant = !isNoName && !isCalculate;
  $: showConstraint = !isNoName && !isCalculate && !isNote;

  $: selectedChoiceList =
    choiceLists.find((cl) => cl.list_name === question.choice_list_name) ??
    null;

  function patch(p: Partial<BuilderQuestion>) {
    formBuilder.updateQuestion(question._id, p);
  }

  let newListName = "";
  let showNewListInput = false;

  function createChoiceList() {
    const name = newListName.trim();
    if (!name) return;
    formBuilder.addChoiceList(name);
    patch({ choice_list_name: name });
    newListName = "";
    showNewListInput = false;
  }

  function onNewListKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      createChoiceList();
    }
    if (e.key === "Escape") {
      showNewListInput = false;
      newListName = "";
    }
  }
</script>

<div>
  <div class="space-y-5">
    <!-- ── Name ─────────────────────────────────────── -->
    {#if !isNoName}
      <div>
        <label
          class="block text-sm font-medium text-on-surface mb-1.5"
          for="qe-name"
        >
          Field Name <span class="text-error">*</span>
        </label>
        <input
          id="qe-name"
          type="text"
          value={question.name}
          on:input={(e) => patch({ name: e.currentTarget.value })}
          placeholder="e.g. water_source"
          class="w-full px-3 py-2.5 text-sm rounded-xl bg-white font-mono
                 focus:outline-none focus:ring-2 focus:ring-primary/20
                 {nameError
            ? 'border border-error/60 ring-2 ring-error/10'
            : 'border border-surface-variant/40 focus:border-primary'}"
        />
        {#if nameError}
          <p class="text-xs text-error mt-1">{nameError}</p>
        {:else}
          <p class="text-xs text-on-surface/40 mt-1">
            Internal identifier used in data exports. Use underscores, no
            spaces.
          </p>
        {/if}
      </div>
    {/if}

    <!-- ── Label ─────────────────────────────────────── -->
    {#if !isNoLabel}
      <div>
        <label
          class="block text-sm font-medium text-on-surface mb-1.5"
          for="qe-label"
        >
          Label
          {#if !isCalculate}<span class="text-error">*</span>{/if}
        </label>
        <input
          id="qe-label"
          type="text"
          value={question.label}
          on:input={(e) => patch({ label: e.currentTarget.value })}
          placeholder="e.g. What is the main water source?"
          class="w-full px-3 py-2.5 text-sm rounded-xl bg-white
                 focus:outline-none focus:ring-2 focus:ring-primary/20
                 {labelError
            ? 'border border-error/60 ring-2 ring-error/10'
            : 'border border-surface-variant/40 focus:border-primary'}"
        />
        {#if labelError}
          <p class="text-xs text-error mt-1">{labelError}</p>
        {/if}
      </div>
    {/if}

    <!-- ── Hint ──────────────────────────────────────── -->
    {#if !isNoName && !isNoLabel && !isCalculate}
      <div>
        <label
          class="block text-sm font-medium text-on-surface mb-1.5"
          for="qe-hint">Hint</label
        >
        <input
          id="qe-hint"
          type="text"
          value={question.hint}
          on:input={(e) => patch({ hint: e.currentTarget.value })}
          placeholder="Optional guidance shown below the question"
          class="w-full px-3 py-2.5 text-sm rounded-xl bg-white border border-surface-variant/40
                 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
    {/if}

    <!-- ── Required toggle ───────────────────────────── -->
    {#if !isNoName && !isCalculate && !isNote}
      <div class="flex items-center justify-between py-1">
        <div>
          <div class="text-sm font-medium text-on-surface">Required</div>
          <div class="text-xs text-on-surface/40">
            Enumerator must answer before continuing
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={question.required}
          on:click={() => patch({ required: !question.required })}
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0
                 {question.required ? 'bg-primary' : 'bg-surface-variant'}"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                   {question.required ? 'translate-x-6' : 'translate-x-1'}"
          />
        </button>
      </div>
    {/if}

    <!-- ── Calculation expression ─────────────────────── -->
    {#if isCalculate}
      <div>
        <label
          class="block text-sm font-medium text-on-surface mb-1.5"
          for="qe-calc"
        >
          Calculation <span class="text-error">*</span>
        </label>
        <input
          id="qe-calc"
          type="text"
          value={question.calculation}
          on:input={(e) => patch({ calculation: e.currentTarget.value })}
          placeholder="e.g. num_adults + num_children"
          class="w-full px-3 py-2.5 text-sm rounded-xl bg-white font-mono border border-surface-variant/40
                 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <p class="text-xs text-on-surface/40 mt-1">XPath / ODK formula.</p>
      </div>
    {/if}

    <!-- ── Choice list ────────────────────────────────── -->
    {#if isSelect}
      <div class="pt-2 border-t border-surface-variant/15">
        <div class="text-sm font-semibold text-on-surface mb-3">
          Choice List
        </div>

        <div class="flex gap-2 mb-3">
          <select
            value={question.choice_list_name}
            on:change={(e) =>
              patch({ choice_list_name: e.currentTarget.value })}
            class="flex-1 px-3 py-2 text-sm rounded-xl bg-white
                   focus:outline-none focus:ring-2 focus:ring-primary/20
                   {choiceListError
              ? 'border border-error/60'
              : 'border border-surface-variant/40 focus:border-primary'}"
          >
            <option value="">— Select or create a list —</option>
            {#each choiceLists as cl}
              <option value={cl.list_name}>{cl.list_name}</option>
            {/each}
          </select>
          <button
            type="button"
            on:click={() => (showNewListInput = !showNewListInput)}
            class="px-3 py-2 text-sm rounded-xl border border-surface-variant/40 text-primary
                   hover:bg-primary/5 transition-colors shrink-0"
          >
            New list
          </button>
        </div>

        {#if choiceListError}
          <p class="text-xs text-error -mt-1 mb-3">{choiceListError}</p>
        {/if}

        {#if showNewListInput}
          <div class="flex gap-2 mb-3">
            <input
              type="text"
              bind:value={newListName}
              on:keydown={onNewListKeydown}
              placeholder="List name (e.g. water_sources)"
              class="flex-1 px-3 py-2 text-sm rounded-xl border border-surface-variant/40 bg-white
                     font-mono focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              on:click={createChoiceList}
              disabled={!newListName.trim()}
              class="px-4 py-2 text-sm bg-primary text-white rounded-xl hover:bg-primary-dim
                     transition-colors disabled:opacity-40"
            >
              Create
            </button>
          </div>
        {/if}

        {#if selectedChoiceList}
          <div class="bg-surface-container-low/70 rounded-xl p-3">
            <div class="text-xs font-medium text-on-surface/50 mb-2.5">
              Choices in
              <code
                class="font-mono bg-surface-container-high px-1 py-0.5 rounded"
              >
                {selectedChoiceList.list_name}
              </code>
            </div>

            {#each selectedChoiceList.choices as choice (choice._id)}
              <div class="flex gap-2 mb-2">
                <input
                  type="text"
                  value={choice.name}
                  on:input={(e) =>
                    formBuilder.updateChoice(
                      selectedChoiceList.list_name,
                      choice._id,
                      {
                        name: e.currentTarget.value,
                      },
                    )}
                  placeholder="value"
                  class="w-28 px-2 py-1.5 text-xs rounded-lg border border-surface-variant/40 bg-white
                         font-mono focus:outline-none focus:border-primary"
                />
                <input
                  type="text"
                  value={choice.label}
                  on:input={(e) =>
                    formBuilder.updateChoice(
                      selectedChoiceList.list_name,
                      choice._id,
                      {
                        label: e.currentTarget.value,
                      },
                    )}
                  placeholder="Label shown to enumerator"
                  class="flex-1 px-2 py-1.5 text-xs rounded-lg border border-surface-variant/40 bg-white
                         focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  on:click={() =>
                    formBuilder.removeChoice(
                      selectedChoiceList.list_name,
                      choice._id,
                    )}
                  class="p-1.5 rounded-lg text-on-surface/30 hover:text-error hover:bg-error/10
                         transition-colors shrink-0"
                  aria-label="Remove choice"
                >
                  <span class="material-symbols-outlined text-[14px]"
                    >close</span
                  >
                </button>
              </div>
            {/each}

            <button
              type="button"
              on:click={() =>
                selectedChoiceList &&
                formBuilder.addChoice(selectedChoiceList.list_name)}
              class="w-full mt-1 py-2 text-xs text-primary border border-dashed border-primary/30
                     rounded-lg hover:border-primary/60 hover:bg-primary/5 transition-colors"
            >
              + Add choice
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Relevant (conditional logic) ──────────────── -->
    {#if showRelevant}
      <div class="pt-2 border-t border-surface-variant/15">
        <label
          class="block text-sm font-medium text-on-surface mb-1.5"
          for="qe-relevant"
        >
          Show if… <span class="text-xs font-normal text-on-surface/40"
            >(relevant)</span
          >
        </label>
        <input
          id="qe-relevant"
          type="text"
          value={question.relevant}
          on:input={(e) => patch({ relevant: e.currentTarget.value })}
          placeholder="e.g. has_water_source = 'yes'"
          class="w-full px-3 py-2.5 text-sm rounded-xl bg-white font-mono border border-surface-variant/40
                 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <p class="text-xs text-on-surface/40 mt-1">
          XPath expression. Leave empty to always show.
        </p>
      </div>
    {/if}

    <!-- ── Constraint (validation) ────────────────────── -->
    {#if showConstraint}
      <div>
        <label
          class="block text-sm font-medium text-on-surface mb-1.5"
          for="qe-constraint"
        >
          Validate if… <span class="text-xs font-normal text-on-surface/40"
            >(constraint)</span
          >
        </label>
        <input
          id="qe-constraint"
          type="text"
          value={question.constraint}
          on:input={(e) => patch({ constraint: e.currentTarget.value })}
          placeholder="e.g. . > 0 and . <= 150"
          class="w-full px-3 py-2.5 text-sm rounded-xl bg-white font-mono border border-surface-variant/40
                 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {#if question.constraint}
          <input
            type="text"
            value={question.constraint_message}
            on:input={(e) =>
              patch({ constraint_message: e.currentTarget.value })}
            placeholder="Error message shown when validation fails"
            class="mt-2 w-full px-3 py-2.5 text-sm rounded-xl bg-white border border-surface-variant/40
                   focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        {/if}
      </div>
    {/if}
  </div>
</div>
