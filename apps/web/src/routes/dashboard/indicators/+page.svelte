<script lang="ts">
  import type { PageData } from "./$types";
  export let data: PageData;

  function fmt(n: number | null | undefined): string {
    if (n == null) return "—";
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function progressPct(ind: (typeof data.indicators)[0]): number {
    if (!ind.annual_target || !ind.latest_actual_value) return 0;
    return Math.min((ind.latest_actual_value / ind.annual_target) * 100, 100);
  }

  function barColor(pct: number) {
    if (pct >= 90) return "#2ca58d"; // secondary green
    if (pct >= 60) return "#0056d2"; // primary blue
    if (pct >= 30) return "#f4a261"; // warning
    return "#e63946"; // error red
  }
</script>

<!-- Banner -->
<div class="px-6 md:px-8 pt-6 pb-8">
  <div
    class="relative overflow-hidden rounded-[28px] bg-gradient-primary p-10 md:p-14 shadow-2xl"
  >
    <!-- Decorative blobs -->
    <div
      class="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none"
    ></div>
    <div
      class="absolute bottom-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -ml-36 -mb-36 pointer-events-none"
    ></div>

    <div
      class="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-8"
    >
      <div>
        <p
          class="text-on-primary/70 text-sm font-semibold uppercase tracking-widest mb-2"
        >
          Results Framework
        </p>
        <h1
          class="font-headline text-3xl md:text-5xl font-extrabold text-on-primary leading-tight mb-3"
        >
          Indicators
        </h1>
        <p class="text-on-primary/80 text-base md:text-lg max-w-lg">
          Track your program's key performance indicators, monitor progress
          against targets, and surface insights that drive decisions.
        </p>
        <p class="text-on-primary/50 text-sm mt-3">
          {data.indicators.length} indicator{data.indicators.length === 1
            ? ""
            : "s"} tracked
        </p>
      </div>

      <a
        href="/dashboard/indicators/new"
        class="self-start md:self-center shrink-0 flex items-center gap-2 px-7 py-4 bg-surface text-primary
               text-base font-bold rounded-2xl hover:bg-surface-container transition-colors shadow-lg"
      >
        <span class="material-symbols-outlined text-[22px]">add_chart</span>
        Create Indicator
      </a>
    </div>
  </div>
</div>

<div class="px-6 md:px-8 pb-10">
  {#if data.indicators.length === 0}
    <div class="flex flex-col items-center justify-center py-24 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface/20 mb-4"
        >analytics</span
      >
      <p class="text-on-surface/50 text-sm">No indicators configured yet.</p>
    </div>
  {:else}
    <div class="bg-white rounded-2xl ambient-shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="text-left text-xs text-on-surface/40 uppercase tracking-wider border-b border-surface-variant/20"
            >
              <th class="px-5 py-3 font-medium">Code</th>
              <th class="px-5 py-3 font-medium">Name</th>
              <th class="px-5 py-3 font-medium">Baseline</th>
              <th class="px-5 py-3 font-medium">Actual</th>
              <th class="px-5 py-3 font-medium">Target</th>
              <th class="px-5 py-3 font-medium w-40">Progress</th>
              <th class="px-5 py-3 font-medium">Source form</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-variant/15">
            {#each data.indicators as ind}
              {@const pct = progressPct(ind)}
              <tr class="hover:bg-surface-variant/10 transition-colors">
                <td class="px-5 py-3">
                  <span
                    class="text-xs font-mono bg-primary/8 text-primary px-1.5 py-0.5 rounded"
                    >{ind.code}</span
                  >
                </td>
                <td class="px-5 py-3 font-medium text-on-surface max-w-xs">
                  <div class="truncate">{ind.name}</div>
                  {#if ind.description}
                    <div class="text-xs text-on-surface/40 truncate">
                      {ind.description}
                    </div>
                  {/if}
                </td>
                <td class="px-5 py-3 text-on-surface/60 whitespace-nowrap">
                  {fmt(ind.baseline_value)}
                  {ind.unit_of_measure ?? ""}
                </td>
                <td
                  class="px-5 py-3 font-medium text-on-surface whitespace-nowrap"
                >
                  {fmt(ind.latest_actual_value)}
                  {ind.unit_of_measure ?? ""}
                </td>
                <td class="px-5 py-3 text-on-surface/60 whitespace-nowrap">
                  {fmt(ind.annual_target)}
                  {ind.unit_of_measure ?? ""}
                </td>
                <td class="px-5 py-3">
                  <div class="flex items-center gap-2">
                    <div
                      class="flex-1 h-2 bg-surface-variant/30 rounded-full overflow-hidden"
                    >
                      <div
                        class="h-full rounded-full transition-all"
                        style="width: {pct}%; background-color: {barColor(pct)}"
                      ></div>
                    </div>
                    <span
                      class="text-xs text-on-surface/50 w-10 text-right shrink-0"
                    >
                      {ind.latest_actual_value != null && ind.annual_target
                        ? pct.toFixed(0) + "%"
                        : "—"}
                    </span>
                  </div>
                </td>
                <td class="px-5 py-3 text-on-surface/50 text-xs">
                  {ind.source_form_name ?? "—"}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
