<script lang="ts">
  import { fly } from "svelte/transition";
  import { toasts, dismissToast, type ToastType } from "$lib/stores/toasts";

  function iconFor(type: ToastType): string {
    if (type === "success") return "check_circle";
    if (type === "error") return "error";
    return "info";
  }

  function colorClassFor(type: ToastType): string {
    if (type === "success") return "text-primary";
    if (type === "error") return "text-error";
    return "text-on-surface/60";
  }
</script>

<!-- Fixed bottom-right stack. pointer-events-none on the wrapper so
     toasts don't block clicks on underlying UI; each toast re-enables
     pointer events on itself. -->
<div
  class="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none"
  aria-live="polite"
  aria-atomic="true"
>
  {#each $toasts as toast (toast.id)}
    <div
      class="pointer-events-auto bg-white rounded-xl shadow-lg ring-1 ring-surface-variant/40 px-4 py-3 flex items-start gap-3 min-w-[260px] max-w-md"
      in:fly={{ y: 12, duration: 180 }}
      out:fly={{ y: 12, duration: 150 }}
      role="status"
    >
      <span
        class="material-symbols-outlined text-[20px] mt-0.5 {colorClassFor(
          toast.type,
        )}"
        aria-hidden="true"
      >
        {iconFor(toast.type)}
      </span>
      <span class="flex-1 text-sm text-on-surface">{toast.message}</span>
      <button
        type="button"
        on:click={() => dismissToast(toast.id)}
        class="shrink-0 -mr-1 -mt-1 p-1 text-on-surface/40 hover:text-on-surface/70 rounded-md hover:bg-surface-variant/30"
        aria-label="Dismiss notification"
      >
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  {/each}
</div>
