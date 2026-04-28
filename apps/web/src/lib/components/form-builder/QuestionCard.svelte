<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type {
    BuilderQuestion,
    BuilderChoiceList,
    ValidationError,
  } from "$lib/utils/xlsform";
  import {
    QUESTION_TYPE_LABELS,
    typeColorClass,
    NO_NAME_TYPES,
    STRUCTURE_TYPES,
  } from "$lib/utils/xlsform";
  import QuestionEditor from "./QuestionEditor.svelte";

  export let question: BuilderQuestion;
  export let selected: boolean;
  export let hasError: boolean;
  export let depth: number = 0;
  export let questionIndex: number;
  export let choiceLists: BuilderChoiceList[];
  export let errors: ValidationError[];

  const dispatch = createEventDispatcher<{ select: void; delete: void }>();

  $: isStructure = STRUCTURE_TYPES.has(question.type);
</script>

<div
  class="bg-white rounded-2xl transition-all
    {selected
    ? 'border-2 border-primary ring-4 ring-primary-container/20 shadow-sm'
    : 'border border-surface-variant/20 shadow-sm hover:border-primary/20 hover:shadow-md'}
    {isStructure ? 'border-dashed' : ''}"
  style="margin-left: {depth * 16}px"
>
  <!-- Card header row -->
  <div class="flex items-center gap-3 px-5 py-4">
    <!-- Left: clickable area — select question -->
    <button
      type="button"
      class="flex-1 min-w-0 flex items-center gap-3 text-left"
      on:click={() => dispatch("select")}
    >
      <!-- Index badge -->
      <span
        class="shrink-0 bg-primary-container text-primary w-8 h-8 rounded-lg flex items-center
               justify-center font-bold text-sm"
      >
        {questionIndex + 1}
      </span>

      <!-- Type chip + label preview -->
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-0.5">
          <span
            class="text-[10px] font-medium px-1.5 py-0.5 rounded-md {typeColorClass(
              question.type,
            )}"
          >
            {QUESTION_TYPE_LABELS[question.type] ?? question.type}
          </span>
          {#if hasError}
            <span class="material-symbols-outlined text-[14px] text-error"
              >warning</span
            >
          {/if}
        </div>
        <div
          class="text-sm font-medium truncate {selected
            ? 'text-primary'
            : 'text-on-surface/70'}"
        >
          {#if NO_NAME_TYPES.has(question.type)}
            <em class="text-on-surface/30"
              >{QUESTION_TYPE_LABELS[question.type]}</em
            >
          {:else if question.label}
            {question.label}
          {:else if question.name}
            <em class="text-on-surface/40">{question.name}</em>
          {:else}
            <em class="text-on-surface/25">Untitled question</em>
          {/if}
        </div>
      </div>
    </button>

    <!-- Right: drag handle + delete -->
    <div class="flex items-center gap-0.5 shrink-0">
      <span
        class="material-symbols-outlined text-[20px] text-on-surface/20 cursor-grab
               active:cursor-grabbing px-1 hover:text-on-surface/50 transition-colors"
      >
        drag_indicator
      </span>
      <button
        type="button"
        on:click={() => dispatch("delete")}
        class="p-1.5 rounded-lg text-on-surface/30 hover:text-error hover:bg-error/8
               transition-colors"
        aria-label="Remove question"
      >
        <span class="material-symbols-outlined text-[18px]">delete</span>
      </button>
    </div>
  </div>

  <!-- Inline editor — visible only when selected -->
  {#if selected}
    <div class="border-t border-primary/10 px-5 pb-6 pt-5">
      <QuestionEditor {question} {choiceLists} {errors} />
    </div>
  {/if}
</div>
