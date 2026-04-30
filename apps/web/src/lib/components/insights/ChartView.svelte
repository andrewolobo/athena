<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { ChartConfiguration } from "chart.js";
  import type {
    InsightAggregate,
    InsightChartType,
    InsightKind,
    InsightTimeGrain,
  } from "$lib/types";
  import { Chart } from "./chart";
  import { INSIGHT_LABELS, resolveBucketLabel } from "./labels";

  /** Pure chart renderer. The parent owns config + data fetching; this
   *  component only mirrors them onto a Chart.js canvas and cleans up
   *  on destroy. */
  export let config: {
    chart_type: InsightChartType;
    data_kind: InsightKind;
    time_grain?: InsightTimeGrain;
    title: string;
  };
  export let data: InsightAggregate | null;
  /** Caller-supplied empty-state copy. Lets the parent provide
   *  context-specific guidance (e.g. categorical vs temporal) instead
   *  of the generic fallback. */
  export let emptyLabel: string = INSIGHT_LABELS.noDataTile;

  // Material-aligned palette derived from tailwind.config.js. Reused
  // across pie/bar slices in stable order so re-rendering doesn't
  // shuffle colours under the user's eyes.
  const PALETTE = [
    "#0056d2", // primary
    "#5b8cff", // inverse-primary
    "#536073", // secondary
    "#615b77", // tertiary
    "#9f403d", // error
    "#004bb9", // primary-dim
    "#475467", // secondary-dim
    "#55506b", // tertiary-dim
    "#99b2e9", // outline-variant
    "#0053cc", // on-primary-fixed-variant
  ];

  let canvasEl: HTMLCanvasElement | undefined;
  let chart: Chart | undefined;
  let lastChartType: InsightChartType | null = null;

  function buildConfig(): ChartConfiguration | null {
    if (!data) return null;

    if (data.kind === "categorical") {
      const labels = data.buckets.map((b) =>
        resolveBucketLabel(b.key, b.label),
      );
      const counts = data.buckets.map((b) => b.count);
      const colors = data.buckets.map((_, i) => PALETTE[i % PALETTE.length]);

      if (config.chart_type === "pie") {
        return {
          type: "pie",
          data: {
            labels,
            datasets: [
              { data: counts, backgroundColor: colors, borderWidth: 0 },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: { display: true, text: config.title, font: { size: 14 } },
              legend: { position: "right" },
            },
          },
        };
      }
      // Horizontal bar
      return {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: data.label,
              data: counts,
              backgroundColor: colors[0],
              borderWidth: 0,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: config.title, font: { size: 14 } },
            legend: { display: false },
          },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      };
    }

    // Temporal — line chart of pre-bucketed counts
    return {
      type: "line",
      data: {
        labels: data.series.map((p) => p.bucket),
        datasets: [
          {
            label: data.label,
            data: data.series.map((p) => p.count),
            borderColor: PALETTE[0],
            backgroundColor: PALETTE[0] + "33",
            fill: true,
            tension: 0.25,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: config.title, font: { size: 14 } },
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    };
  }

  function renderChart(): void {
    if (!canvasEl) return;
    const cfg = buildConfig();
    if (!cfg) {
      chart?.destroy();
      chart = undefined;
      lastChartType = null;
      return;
    }

    // Destroy + recreate when the chart type changes — Chart.js can't
    // morph between pie / bar / line in place.
    if (chart && lastChartType !== config.chart_type) {
      chart.destroy();
      chart = undefined;
    }

    if (chart) {
      chart.data = cfg.data;
      chart.options = cfg.options ?? {};
      chart.update();
    } else {
      chart = new Chart(canvasEl, cfg);
      lastChartType = config.chart_type;
    }
  }

  $: if (canvasEl && (data || !data) && config) {
    renderChart();
  }

  onMount(() => {
    renderChart();
  });

  onDestroy(() => {
    chart?.destroy();
  });
</script>

<div class="relative w-full h-full">
  {#if data && (data.kind === "categorical" ? data.buckets.length === 0 : data.series.length === 0)}
    <div
      class="absolute inset-0 flex items-center justify-center text-sm text-on-surface/40 px-4 text-center"
    >
      {emptyLabel}
    </div>
  {/if}
  <canvas bind:this={canvasEl}></canvas>
</div>
