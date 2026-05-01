<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type {
    InsightAggregate,
    InsightChartType,
    InsightField,
    InsightTimeGrain,
    UserDashboard,
  } from "$lib/types";
  import ChartView from "./ChartView.svelte";
  import { exportElementAsPng, buildInsightFilename } from "./exportPng";
  import { INSIGHT_LABELS } from "./labels";
  import { pushToast } from "$lib/stores/toasts";

  export let open = false;
  export let field: InsightField | null = null;
  export let formId: string | null = null;
  export let folderSchema = "";
  export let formKey = "";

  const dispatch = createEventDispatcher<{
    close: void;
    pinned: { id: string };
  }>();

  // ── Local state ─────────────────────────────────────────
  let title = "";
  let description = "";
  let chartType: InsightChartType = "pie";
  let timeGrain: InsightTimeGrain = "month";
  let aggregate: InsightAggregate | null = null;
  let loading = false;
  let error: string | null = null;

  // Pin-to-Dashboard state
  let saving = false;
  let saveError: string | null = null;
  let savedId: string | null = null;
  let savedDashboardName = "";

  // Dashboard picker state
  let dashboards: UserDashboard[] = [];
  let selectedDashboardId: string | null = null;
  let showNewDashboard = false;
  let newDashboardName = "";
  let creatingDashboard = false;
  let dashboardsLoading = false;
  let dashboardsFetched = false;

  // PNG export state
  let previewEl: HTMLElement | undefined;
  let exporting = false;
  let exportError: string | null = null;

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
    saving = false;
    saveError = null;
    savedId = null;
    savedDashboardName = "";
    exporting = false;
    exportError = null;
  }

  // Fetch dashboards the first time the panel opens.
  $: if (open && !dashboardsFetched) {
    fetchDashboards();
  }

  async function fetchDashboards(): Promise<void> {
    dashboardsLoading = true;
    dashboardsFetched = true;
    try {
      const res = await fetch("/api/dashboards");
      if (!res.ok) throw new Error("Failed to load dashboards");
      dashboards = (await res.json()) as UserDashboard[];
      const def = dashboards.find((d) => d.is_default) ?? dashboards[0] ?? null;
      selectedDashboardId = def?.id ?? null;
      showNewDashboard = dashboards.length === 0;
    } catch {
      // Don't block the panel on failure; pinning will remain disabled.
    } finally {
      dashboardsLoading = false;
    }
  }

  async function createDashboard(): Promise<void> {
    const name = newDashboardName.trim();
    if (!name) return;
    creatingDashboard = true;
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create dashboard");
      const created = (await res.json()) as UserDashboard;
      dashboards = [created, ...dashboards];
      selectedDashboardId = created.id;
      showNewDashboard = false;
      newDashboardName = "";
    } catch {
      // Silently ignore; user can retry.
    } finally {
      creatingDashboard = false;
    }
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
        throw new Error(
          body.error ?? `Aggregate request failed (${res.status})`,
        );
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

  /** Persist the current configuration. Disabled unless the field is
   *  pinnable AND the page has resolved a form_id from the active form
   *  selector — without it we can't address a row in public.forms. */
  async function pinInsight(): Promise<void> {
    if (!field || !formId || !selectedDashboardId) return;
    if (field.kind !== "categorical" && field.kind !== "temporal") return;

    saving = true;
    saveError = null;

    const dashName =
      dashboards.find((d) => d.id === selectedDashboardId)?.name ??
      "your dashboard";
    const body = {
      form_id: formId,
      field_name: field.name,
      title: title.trim() || field.label,
      description: description.trim() || undefined,
      chart_type: chartType,
      data_kind: field.kind,
      time_grain: field.kind === "temporal" ? timeGrain : undefined,
      dashboard_id: selectedDashboardId,
    };

    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Pin failed (${res.status})`);
      }
      const created = (await res.json()) as { id: string };
      savedId = created.id;
      savedDashboardName = dashName;
      dispatch("pinned", { id: created.id });
      pushToast("success", `Insight pinned to ${dashName}.`);
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Failed to pin insight";
      pushToast("error", `${INSIGHT_LABELS.toastPinFailed} ${saveError}`);
    } finally {
      saving = false;
    }
  }

  $: canPin =
    !!field &&
    !!formId &&
    !!selectedDashboardId &&
    (field.kind === "categorical" || field.kind === "temporal") &&
    !saving &&
    !savedId &&
    title.trim().length > 0;

  /** Export the current preview as a PNG. Disabled until aggregate data
   *  has loaded — html2canvas captures the live DOM, so a blank chart
   *  would produce a blank export. */
  async function exportPng(): Promise<void> {
    if (!previewEl || !aggregate) return;
    exporting = true;
    exportError = null;
    try {
      await exportElementAsPng(previewEl, buildInsightFilename(title));
    } catch (err) {
      exportError = err instanceof Error ? err.message : "Export failed";
      pushToast("error", `Export failed: ${exportError}`);
    } finally {
      exporting = false;
    }
  }

  $: canExport = !!aggregate && !exporting && !loading && !error;

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }

  $: chartTypeOptions =
    field?.kind === "temporal"
      ? [{ value: "line" as const, label: "Line", icon: "show_chart" }]
      : [
          { value: "pie" as const, label: "Pie", icon: "pie_chart" },
          {
            value: "bar_horizontal" as const,
            label: "Horizontal bar",
            icon: "bar_chart",
          },
        ];

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
        <h2
          class="font-headline text-lg font-semibold text-on-surface truncate"
        >
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
            <div
              class="inline-flex rounded-xl bg-white shadow-sm overflow-hidden"
            >
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
          bind:this={previewEl}
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
              emptyLabel={field?.kind === "temporal"
                ? INSIGHT_LABELS.noDataTemporal
                : INSIGHT_LABELS.noDataCategorical}
            />
          {/if}
        </div>
        {#if aggregate && !loading && !error}
          <p class="text-[11px] text-on-surface/50 mt-2">
            Total: {aggregate.total.toLocaleString()} submission{aggregate.total ===
            1
              ? ""
              : "s"}
            {#if aggregate.kind === "categorical" && aggregate.buckets.some((b) => b.key === "__other__")}
              · showing top 50, remainder grouped as "Other"
            {/if}
          </p>
        {/if}
      </section>

      <!-- Dashboard pinning -->
      <section>
        <h3
          class="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-3"
        >
          Pin to Dashboard
        </h3>

        {#if savedId}
          <div
            class="bg-primary/10 text-primary rounded-xl px-4 py-3 text-xs flex items-center gap-2"
          >
            <span class="material-symbols-outlined text-[16px]"
              >check_circle</span
            >
            Pinned to <strong>{savedDashboardName}</strong>.
            <a href="/dashboard/reporting" class="underline font-medium">View</a
            >
          </div>
        {:else if saveError}
          <div class="bg-error/10 text-error rounded-xl px-4 py-3 text-xs">
            {saveError}
          </div>
        {:else if !formId}
          <div
            class="bg-surface-container-low rounded-xl px-4 py-3 text-xs text-on-surface/60"
          >
            Select a form first to enable pinning.
          </div>
        {:else if dashboardsLoading}
          <div
            class="bg-surface-container-low rounded-xl px-4 py-3 text-xs text-on-surface/60"
          >
            Loading dashboards…
          </div>
        {:else if dashboards.length === 0 || showNewDashboard}
          {#if dashboards.length === 0}
            <p class="text-xs text-on-surface/60 mb-3">
              You haven't created any dashboards yet. Create one to start
              pinning charts.
            </p>
          {:else}
            <button
              type="button"
              on:click={() => (showNewDashboard = false)}
              class="text-xs text-on-surface/50 hover:text-on-surface mb-3 flex items-center gap-1 transition-colors"
            >
              <span class="material-symbols-outlined text-[14px]"
                >arrow_back</span
              >
              Back to dashboard list
            </button>
          {/if}
          <div class="flex items-center gap-2">
            <input
              type="text"
              bind:value={newDashboardName}
              placeholder="Dashboard name"
              maxlength="80"
              class="flex-1 px-3 py-2 text-sm rounded-xl bg-white border-0 shadow-sm text-on-surface focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              on:click={createDashboard}
              disabled={!newDashboardName.trim() || creatingDashboard}
              class="px-3 py-2 text-sm font-medium rounded-xl transition-colors
                {newDashboardName.trim() && !creatingDashboard
                ? 'bg-primary text-white hover:bg-primary-dim cursor-pointer'
                : 'bg-primary/40 text-white cursor-not-allowed'}"
            >
              {creatingDashboard ? "Creating…" : "Create"}
            </button>
          </div>
        {:else}
          <!-- Dashboard selector dropdown -->
          <div class="relative">
            <select
              value={selectedDashboardId}
              on:change={(e) => {
                const v = e.currentTarget.value;
                if (v === "__new__") {
                  showNewDashboard = true;
                } else {
                  selectedDashboardId = v;
                }
              }}
              class="w-full px-3 py-2 text-sm rounded-xl bg-white border-0 shadow-sm text-on-surface focus:ring-2 focus:ring-primary appearance-none pr-8"
            >
              {#each dashboards as d (d.id)}
                <option value={d.id}>
                  {d.name}{d.is_default ? " (default)" : ""}
                </option>
              {/each}
              <option value="__new__">── Create new dashboard ──</option>
            </select>
            <span
              class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-on-surface/50 pointer-events-none"
              >expand_more</span
            >
          </div>
        {/if}
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
          on:click={exportPng}
          disabled={!canExport}
          title={exportError ?? "Download the current chart as a PNG"}
          class="px-4 py-2 text-sm font-medium rounded-xl flex items-center gap-1.5 transition-colors
            {canExport
            ? 'text-on-surface/70 hover:bg-surface-variant/40 cursor-pointer'
            : 'text-on-surface/40 bg-surface-container-low cursor-not-allowed'}"
        >
          <span class="material-symbols-outlined text-[18px]">image</span>
          {#if exporting}
            Exporting…
          {:else}
            Export PNG
          {/if}
        </button>
        <button
          type="button"
          on:click={pinInsight}
          disabled={!canPin}
          class="px-4 py-2 text-sm font-medium text-white rounded-xl flex items-center gap-1.5 transition-colors
            {canPin
            ? 'bg-primary hover:bg-primary-dim cursor-pointer'
            : 'bg-primary/40 cursor-not-allowed'}"
        >
          <span class="material-symbols-outlined text-[18px]">push_pin</span>
          {#if saving}
            Pinning…
          {:else if savedId}
            Pinned
          {:else}
            Pin to Dashboard
          {/if}
        </button>
      </div>
    </footer>
  </aside>
{/if}
