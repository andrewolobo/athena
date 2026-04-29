<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type {
    InsightAggregate,
    InsightChartType,
    InsightField,
    InsightTimeGrain,
  } from "$lib/types";
  import ChartView from "./ChartView.svelte";

  export let open = false;
  export let field: InsightField | null = null;
  export let folderSchema = "";
  export let formKey = "";

  const dispatch = createEventDispatcher<{ close: void }>();

  // ── Local state ─────────────────────────────────────────
  let title = "";
  let description = "";
  let chartType: InsightChartType = "pie";
  let timeGrain: InsightTimeGrain = "month";
  let aggregate: InsightAggregate | null = null;
  let loading = false;
  let error: string | null = null;

  // ── Reset on field change ───────────────────────────────
  // When the user opens the panel against a new field, populate the
  // editable inputs with sensible defaults derived from its descriptor.
  let lastFieldName: string | null = null;
  $: if (field && field.name !== lastFieldName) {
    lastFieldName = field.name;
    title = field.label;
    description = "";
    chartType = field.kind === "temporal" ? "line" : "pie";
    timeGrain = "month";
    aggregate = null;
    error = null;
  }

  // ── Debounced fetch ─────────────────────────────────────
  // Re-aggregate whenever the dimension or grain changes. Chart-type
  // toggles (pie ↔ bar) don't require a new fetch — same data, different
  // rendering — so they're intentionally excluded from the dependency.
  let fetchTimer: ReturnType<typeof setTimeout> | null = null;

  $: triggerFetch(field, folderSchema, formKey, timeGrain, open);

  function triggerFetch(
    f: InsightField | null,
    schema: string,
    key: string,
    grain: InsightTimeGrain,
    isOpen: boolean,
  ): void {
    if (!isOpen || !f || !schema || !key) return;
    if (f.kind !== "categorical" && f.kind !== "temporal") return;

    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => fetchAggregate(f, schema, key, grain), 200);
  }

  async function fetchAggregate(
    f: InsightField,
    schema: string,
    key: string,
    grain: InsightTimeGrain,
  ): Promise<void> {
    loading = true;
    error = null;

    const params = new URLSearchParams({
      folder_schema: schema,
      form_key: key,
      field: f.name,
      kind: f.kind,
    });
    if (f.kind === "temporal") params.set("time_grain", grain);

    try {
      const res = await fetch(`/api/insights/aggregate?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Aggregate request failed (${res.status})`);
      }
      aggregate = (await res.json()) as InsightAggregate;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load chart";
      aggregate = null;
    } finally {
      loading = false;
    }
  }

  function close(): void {
    open = false;
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }

  $: chartTypeOptions =
    field?.kind === "temporal"
      ? ([{ value: "line" as const, label: "Line", icon: "show_chart" }])
      : ([
          { value: "pie" as const, label: "Pie", icon: "pie_chart" },
          {
            value: "bar_horizontal" as const,
            label: "Horizontal bar",
            icon: "bar_chart",
          },
        ]);

  const TIME_GRAINS: InsightTimeGrain[] = ["day", "week", "month"];
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <button
    type="button"
    class="fixed inset-0 bg-black/30 z-40"
    aria-label="Close insight panel"
    on:click={close}
  ></button>

  <!-- Panel -->
  <aside
    class="fixed right-0 top-0 bottom-0 w-full sm:w-[460px] bg-surface-bright shadow-2xl z-50 flex flex-col"
    role="dialog"
    aria-label="Insight builder"
  >
    <header
      class="flex items-center justify-between px-5 py-4 border-b border-surface-variant/40"
    >
      <div class="min-w-0">
        <h2 class="font-headline text-lg font-semibold text-on-surface truncate">
          {field?.label ?? "Insight"}
        </h2>
        <p class="text-xs text-on-surface/50 mt-0.5 truncate">
          {field?.name ?? ""} · {field?.kind ?? ""}
        </p>
      </div>
      <button
        type="button"
        on:click={close}
        class="p-1.5 text-on-surface/50 hover:text-on-surface hover:bg-surface-variant/40 rounded-lg transition-colors"
        aria-label="Close"
      >
        <span class="material-symbols-outlined text-[20px]">close</span>
      </button>
    </header>

    <!-- Scrollable body -->
    <div class="flex-1 overflow-y-auto px-5 py-5 space-y-6">
      <!-- Indicator details -->
      <section>
        <h3
          class="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-3"
        >
          Indicator details
        </h3>
        <label class="block mb-3">
          <span class="text-xs font-medium text-on-surface/70 block mb-1"
            >Title</span
          >
          <input
            type="text"
            bind:value={title}
            maxlength="120"
            class="w-full px-3 py-2 text-sm rounded-xl bg-white border-0 shadow-sm text-on-surface focus:ring-2 focus:ring-primary"
          />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-on-surface/70 block mb-1"
            >Description (optional)</span
          >
          <textarea
            bind:value={description}
            maxlength="500"
            rows="2"
            class="w-full px-3 py-2 text-sm rounded-xl bg-white border-0 shadow-sm text-on-surface focus:ring-2 focus:ring-primary resize-none"
          ></textarea>
        </label>
      </section>

      <!-- Visualization type -->
      <section>
        <h3
          class="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-3"
        >
          Visualization type
        </h3>
        <div class="grid grid-cols-2 gap-2">
          {#each chartTypeOptions as opt}
            <label
              class="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors text-sm
                {chartType === opt.value
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-white border-surface-variant/40 text-on-surface/70 hover:border-primary/40'}"
            >
              <input
                type="radio"
                bind:group={chartType}
                value={opt.value}
                class="sr-only"
              />
              <span class="material-symbols-outlined text-[18px]"
                >{opt.icon}</span
              >
              <span class="font-medium">{opt.label}</span>
            </label>
          {/each}
        </div>

        {#if field?.kind === "temporal"}
          <div class="mt-3">
            <span class="text-xs font-medium text-on-surface/70 block mb-1"
              >Group by</span
            >
            <div class="inline-flex rounded-xl bg-white shadow-sm overflow-hidden">
              {#each TIME_GRAINS as g (g)}
                <button
                  type="button"
                  on:click={() => (timeGrain = g)}
                  class="px-3 py-1.5 text-xs font-medium transition-colors
                    {timeGrain === g
                    ? 'bg-primary text-white'
                    : 'text-on-surface/60 hover:bg-surface-variant/40'}"
                >
                  {g}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </section>

      <!-- Preview -->
      <section>
        <h3
          class="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-3"
        >
          Preview
        </h3>
        <div
          class="bg-white rounded-2xl ambient-shadow p-4 h-72 relative"
        >
          {#if loading}
            <div
              class="absolute inset-0 flex items-center justify-center text-sm text-on-surface/50"
            >
              Loading…
            </div>
          {:else if error}
            <div
              class="absolute inset-0 flex items-center justify-center text-sm text-error px-4 text-center"
            >
              {error}
            </div>
          {:else}
            <ChartView
              config={{
                chart_type: chartType,
                data_kind:
                  field?.kind === "temporal" ? "temporal" : "categorical",
                time_grain: timeGrain,
                title,
              }}
              data={aggregate}
            />
          {/if}
        </div>
        {#if aggregate && !loading && !error}
          <p class="text-[11px] text-on-surface/50 mt-2">
            Total: {aggregate.total.toLocaleString()} submission{aggregate.total ===
            1
              ? ""
              : "s"}
            {#if aggregate.kind === "categorical" && aggregate.buckets.length === 100}
              · showing top 100 buckets
            {/if}
          </p>
        {/if}
      </section>

      <!-- Dashboard pinning (Step 4 placeholder) -->
      <section>
        <h3
          class="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-3"
        >
          Dashboard pinning
        </h3>
        <div
          class="bg-surface-container-low rounded-xl px-4 py-3 text-xs text-on-surface/60"
        >
          Pin-to-dashboard persistence arrives in the next step.
        </div>
      </section>
    </div>

    <!-- Footer actions -->
    <footer
      class="flex items-center justify-between gap-3 px-5 py-4 border-t border-surface-variant/40 bg-white"
    >
      <button
        type="button"
        on:click={close}
        class="px-4 py-2 text-sm font-medium text-on-surface/70 hover:bg-surface-variant/40 rounded-xl transition-colors"
      >
        Cancel
      </button>
      <div class="flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Available in step 5"
          class="px-4 py-2 text-sm font-medium text-on-surface/40 bg-surface-container-low rounded-xl cursor-not-allowed flex items-center gap-1.5"
        >
          <span class="material-symbols-outlined text-[18px]">image</span>
          Export PNG
        </button>
        <button
          type="button"
          disabled
          title="Available in step 4"
          class="px-4 py-2 text-sm font-medium text-white bg-primary/40 rounded-xl cursor-not-allowed flex items-center gap-1.5"
        >
          <span class="material-symbols-outlined text-[18px]">push_pin</span>
          Pin to Dashboard
        </button>
      </div>
    </footer>
  </aside>
{/if}
