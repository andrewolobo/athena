<script lang="ts">
  import { onMount } from "svelte";
  import type { InsightAggregate, UserInsight } from "$lib/types";
  import ChartView from "./ChartView.svelte";
  import { INSIGHT_LABELS } from "./labels";
  import { pushToast } from "$lib/stores/toasts";

  export let insights: UserInsight[] = [];

  /** Aggregate fetch state, keyed by insight id. The grid renders all
   *  tiles immediately with a loading placeholder, then fills them in
   *  as Promise.all resolves — gives a perceptibly faster first paint
   *  than awaiting the whole batch before rendering anything. */
  let dataMap = new Map<string, InsightAggregate>();
  let errorMap = new Map<string, string>();
  let loading = true;

  /** Local mirror of the prop so deletes can update the UI without a
   *  full page reload. */
  let visibleInsights: UserInsight[] = [];
  $: visibleInsights = insights;

  let openMenuId: string | null = null;

  onMount(() => {
    void loadAll();
  });

  async function loadAll(): Promise<void> {
    loading = true;
    const results = await Promise.allSettled(
      insights.map((ins) => fetchOne(ins)),
    );
    const nextData = new Map<string, InsightAggregate>();
    const nextErrors = new Map<string, string>();
    results.forEach((r, i) => {
      const id = insights[i].id;
      if (r.status === "fulfilled") {
        nextData.set(id, r.value);
      } else {
        nextErrors.set(
          id,
          r.reason instanceof Error ? r.reason.message : "Failed to load",
        );
      }
    });
    dataMap = nextData;
    errorMap = nextErrors;
    loading = false;
  }

  async function fetchOne(ins: UserInsight): Promise<InsightAggregate> {
    const params = new URLSearchParams({
      folder_schema: ins.folder_schema,
      form_key: ins.form_key,
      field: ins.field_name,
      kind: ins.data_kind,
    });
    if (ins.data_kind === "temporal" && ins.time_grain) {
      params.set("time_grain", ins.time_grain);
    }
    const res = await fetch(`/api/insights/aggregate?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Aggregate request failed (${res.status})`);
    }
    return (await res.json()) as InsightAggregate;
  }

  async function deleteInsight(id: string): Promise<void> {
    openMenuId = null;
    const ok = window.confirm("Delete this pinned insight?");
    if (!ok) return;

    const res = await fetch(`/api/insights/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail =
        typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
      pushToast("error", `${INSIGHT_LABELS.toastDeleteFailed} ${detail}`);
      return;
    }
    visibleInsights = visibleInsights.filter((i) => i.id !== id);
    const nextData = new Map(dataMap);
    nextData.delete(id);
    dataMap = nextData;
    const nextErrors = new Map(errorMap);
    nextErrors.delete(id);
    errorMap = nextErrors;
    pushToast("success", INSIGHT_LABELS.toastDeleted);
  }

  function toggleMenu(id: string, e: MouseEvent): void {
    e.stopPropagation();
    openMenuId = openMenuId === id ? null : id;
  }

  function handleDocumentClick(): void {
    openMenuId = null;
  }
</script>

<svelte:window on:click={handleDocumentClick} />

{#if visibleInsights.length === 0}
  <!-- Grid-level empty state — keeps the Insight surface discoverable
       for first-time users who haven't pinned anything yet. -->
  <div class="px-6 md:px-8 pb-10">
    <div
      class="bg-white rounded-2xl ambient-shadow p-6 flex flex-col sm:flex-row sm:items-center gap-4"
    >
      <div
        class="shrink-0 w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"
      >
        <span class="material-symbols-outlined text-[24px]">monitoring</span>
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-semibold text-on-surface">
          {INSIGHT_LABELS.emptyGridTitle}
        </h3>
        <p class="text-xs text-on-surface/60 mt-0.5">
          {INSIGHT_LABELS.emptyGridBody}
        </p>
      </div>
      <a
        href="/dashboard/data-explorer?insights=1"
        class="shrink-0 px-4 py-2 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 rounded-xl transition-colors"
      >
        {INSIGHT_LABELS.emptyGridCta}
      </a>
    </div>
  </div>
{:else}
  <div class="px-6 md:px-8 pb-10">
    <div class="bg-white rounded-2xl ambient-shadow p-6">
      <div class="flex items-center justify-between mb-5">
        <h2 class="font-headline font-semibold text-base text-on-surface">
          My Insights
        </h2>
        <span class="text-xs text-on-surface/40"
          >{visibleInsights.length} pinned</span
        >
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {#each visibleInsights as ins (ins.id)}
          <div
            class="bg-surface-bright rounded-2xl p-4 ambient-shadow flex flex-col"
          >
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-on-surface truncate">
                  {ins.title}
                </h3>
                <p class="text-[11px] text-on-surface/40 truncate">
                  {ins.form_key} · {ins.field_name}
                </p>
              </div>
              <div class="relative shrink-0">
                <button
                  type="button"
                  class="p-1 rounded-lg text-on-surface/40 hover:bg-surface-variant/40 hover:text-on-surface/70 transition-colors"
                  on:click={(e) => toggleMenu(ins.id, e)}
                  aria-label="Insight actions"
                >
                  <span class="material-symbols-outlined text-[18px]"
                    >more_vert</span
                  >
                </button>
                {#if openMenuId === ins.id}
                  <div
                    class="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-lg ring-1 ring-surface-variant/40 py-1 min-w-[140px] text-sm"
                    role="menu"
                    tabindex="-1"
                  >
                    <button
                      type="button"
                      class="w-full text-left px-3 py-1.5 text-error hover:bg-error/8 flex items-center gap-2"
                      on:click={() => deleteInsight(ins.id)}
                    >
                      <span class="material-symbols-outlined text-[16px]"
                        >delete</span
                      >
                      Delete
                    </button>
                  </div>
                {/if}
              </div>
            </div>

            <div class="h-48 relative">
              {#if loading && !dataMap.has(ins.id) && !errorMap.has(ins.id)}
                <div
                  class="absolute inset-0 flex items-center justify-center text-xs text-on-surface/40"
                >
                  Loading…
                </div>
              {:else if errorMap.has(ins.id)}
                <div
                  class="absolute inset-0 flex items-center justify-center text-xs text-error px-3 text-center"
                >
                  {errorMap.get(ins.id)}
                </div>
              {:else if dataMap.has(ins.id)}
                <ChartView
                  config={{
                    chart_type: ins.chart_type,
                    data_kind: ins.data_kind,
                    time_grain: ins.time_grain ?? undefined,
                    title: ins.title,
                  }}
                  data={dataMap.get(ins.id) ?? null}
                  emptyLabel={INSIGHT_LABELS.noDataTile}
                />
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
