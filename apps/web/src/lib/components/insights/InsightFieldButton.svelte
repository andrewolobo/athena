<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { InsightField } from "$lib/types";

  export let field: InsightField;

  $: pinnable = field.kind === "categorical" || field.kind === "temporal";
  $: tooltip = pinnable
    ? `View distribution of ${field.label}`
    : field.kind === "numerical"
      ? "Numerical fields aren't pinnable yet"
      : "This field type can't be charted";

  const dispatch = createEventDispatcher<{ open: InsightField }>();

  function handleClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (pinnable) dispatch("open", field);
  }
</script>

<button
  type="button"
  on:click={handleClick}
  disabled={!pinnable}
  title={tooltip}
  class="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded text-[14px] leading-none transition-colors
    {pinnable
    ? 'text-primary/60 hover:text-primary hover:bg-primary/10 cursor-pointer'
    : 'text-on-surface/20 cursor-not-allowed'}"
  aria-label={tooltip}
>
  <span class="material-symbols-outlined text-[14px]">monitoring</span>
</button>
