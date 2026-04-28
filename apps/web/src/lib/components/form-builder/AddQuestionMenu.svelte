<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { QUESTION_CATEGORIES, QUESTION_TYPE_LABELS, type QuestionType } from '$lib/utils/xlsform';

  const dispatch = createEventDispatcher<{ add: QuestionType }>();

  let open = false;

  function pick(type: QuestionType) {
    dispatch('add', type);
    open = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="relative">
  <button
    type="button"
    on:click={() => (open = !open)}
    class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed
           border-primary/30 text-primary text-sm font-medium hover:border-primary/60 hover:bg-primary/5
           transition-colors"
  >
    <span class="material-symbols-outlined text-[18px]">add</span>
    Add Question
  </button>

  {#if open}
    <!-- Backdrop -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="fixed inset-0 z-10"
      on:click={() => (open = false)}
      on:keydown={(e) => e.key === 'Escape' && (open = false)}
    />

    <!-- Dropdown -->
    <div
      class="absolute bottom-full left-0 right-0 mb-2 z-20 bg-white rounded-2xl ambient-shadow
             overflow-hidden max-h-80 overflow-y-auto"
    >
      {#each QUESTION_CATEGORIES as cat, ci}
        {#if ci > 0}
          <div class="border-t border-surface-variant/20 mx-3" />
        {/if}
        <div class="py-2">
          <div class="px-4 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface/35">
            {cat.label}
          </div>
          {#each cat.types as type}
            <button
              type="button"
              on:click={() => pick(type)}
              class="w-full text-left px-4 py-2 text-sm text-on-surface/80 hover:bg-surface-container
                     hover:text-primary transition-colors"
            >
              {QUESTION_TYPE_LABELS[type]}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>
