<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type {
    BuilderQuestion,
    BuilderChoiceList,
    ValidationError,
  } from "$lib/utils/xlsform";
  import { computeDepths } from "$lib/utils/xlsform";
  import QuestionCard from "./QuestionCard.svelte";

  export let questions: BuilderQuestion[];
  export let selectedId: string | null;
  export let errors: ValidationError[];
  export let choiceLists: BuilderChoiceList[];

  const dispatch = createEventDispatcher<{
    select: string;
    delete: string;
    move: { from: number; to: number };
  }>();

  let dragFromIndex: number | null = null;
  let dragOverIndex: number | null = null;

  $: depths = computeDepths(questions);

  function onDragStart(index: number) {
    dragFromIndex = index;
  }

  function onDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    dragOverIndex = index;
  }

  function onDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    if (dragFromIndex !== null && dragFromIndex !== toIndex) {
      dispatch("move", { from: dragFromIndex, to: toIndex });
    }
    dragFromIndex = null;
    dragOverIndex = null;
  }

  function onDragEnd() {
    dragFromIndex = null;
    dragOverIndex = null;
  }

  function hasError(q: BuilderQuestion): boolean {
    return errors.some((e) => e.questionId === q._id);
  }
</script>

<div class="space-y-0">
  {#if questions.length === 0}
    <div class="py-8 text-center">
      <span
        class="material-symbols-outlined text-4xl text-on-surface/15 block mb-2"
      >
        format_list_bulleted
      </span>
      <p class="text-sm text-on-surface/30 leading-relaxed">
        No questions yet.<br />Select a field type from the sidebar to get
        started.
      </p>
    </div>
  {:else}
    {#each questions as q, i (q._id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        draggable="true"
        on:dragstart={() => onDragStart(i)}
        on:dragover={(e) => onDragOver(e, i)}
        on:drop={(e) => onDrop(e, i)}
        on:dragend={onDragEnd}
        class="mb-3 transition-opacity
          {dragOverIndex === i && dragFromIndex !== i ? 'opacity-40' : ''}"
      >
        <QuestionCard
          question={q}
          selected={selectedId === q._id}
          hasError={hasError(q)}
          depth={depths[i]}
          questionIndex={i}
          {choiceLists}
          errors={errors.filter((e) => e.questionId === q._id)}
          on:select={() => dispatch("select", q._id)}
          on:delete={() => dispatch("delete", q._id)}
        />
      </div>
    {/each}
  {/if}
</div>
