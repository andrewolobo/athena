<script lang="ts">
  import type { PageData } from "./$types";
  export let data: PageData;

  $: indicators = data.summary?.indicators ?? [];
  $: topIndicators = indicators.slice(0, 6);
  $: activity = data.activity ?? [];
  $: recentSubmissions = data.recentSubmissions ?? [];
  $: activityMax = Math.max(...activity.map((d) => d.count), 1);
  $: chartPoints = activity.map((d, i) => ({
    ...d,
    x: 40 + (i / Math.max(activity.length - 1, 1)) * 620,
    y: 10 + (1 - d.count / activityMax) * 110,
  }));
  $: pointsStr = chartPoints.map((p) => `${p.x},${p.y}`).join(" ");

  function fmt(n: number | null | undefined, decimals = 1): string {
    if (n == null) return "—";
    return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
  }

  function progressColor(pct: number | null): string {
    if (pct == null) return "bg-surface-variant";
    if (pct >= 90) return "bg-secondary";
    if (pct >= 60) return "bg-primary";
    if (pct >= 30) return "bg-warning";
    return "bg-error";
  }

  $: sectorMax = Math.max(...(data.sectors?.map((s) => s.count) ?? [1]), 1);

  function statusBadge(status: string): { label: string; cls: string } {
    switch (status) {
      case "approved":
        return { label: "Verified", cls: "bg-primary/10 text-primary" };
      case "pending":
        return {
          label: "Pending",
          cls: "bg-surface-variant/60 text-on-surface/60",
        };
      case "quarantined":
        return { label: "Quarantined", cls: "bg-warning/10 text-warning" };
      case "flagged":
        return { label: "Flagged", cls: "bg-error/10 text-error" };
      default:
        return {
          label: status,
          cls: "bg-surface-variant/60 text-on-surface/60",
        };
    }
  }

  function fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
</script>

<!-- Page header -->
<div class="px-6 py-6 md:px-8">
  <h1 class="font-headline text-2xl font-semibold text-on-surface">Overview</h1>
  <p class="text-sm text-on-surface/50 mt-0.5">
    {#if data.summary}
      Last updated {new Date(data.summary.generated_at).toLocaleString()}
    {:else}
      Dashboard summary
    {/if}
  </p>
</div>

<!-- ─── Hero banner ─────────────────────────────────── -->
<div class="px-6 md:px-8 mb-6">
  <div
    class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 min-h-[200px] flex items-center"
    style="min-height: 210px;"
  >
    <!-- Decorative blobs -->
    <div
      class="absolute -top-10 -right-10 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none"
    ></div>
    <div
      class="absolute bottom-0 left-1/2 w-80 h-48 rounded-full bg-indigo-400/20 blur-3xl pointer-events-none"
    ></div>

    <!-- Decorative SVG illustration (right side) -->
    <div
      class="absolute right-6 bottom-0 opacity-20 select-none pointer-events-none hidden sm:block"
    >
      <svg
        width="220"
        height="210"
        viewBox="0 0 220 210"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <!-- Grid lines -->
        <line
          x1="10"
          y1="170"
          x2="210"
          y2="170"
          stroke="white"
          stroke-width="1.5"
          stroke-dasharray="4 4"
        />
        <line
          x1="10"
          y1="130"
          x2="210"
          y2="130"
          stroke="white"
          stroke-width="1.5"
          stroke-dasharray="4 4"
        />
        <line
          x1="10"
          y1="90"
          x2="210"
          y2="90"
          stroke="white"
          stroke-width="1.5"
          stroke-dasharray="4 4"
        />
        <!-- Bars -->
        <rect x="20" y="120" width="24" height="50" rx="6" fill="white" />
        <rect x="60" y="90" width="24" height="80" rx="6" fill="white" />
        <rect x="100" y="110" width="24" height="60" rx="6" fill="white" />
        <rect x="140" y="70" width="24" height="100" rx="6" fill="white" />
        <rect x="180" y="100" width="24" height="70" rx="6" fill="white" />
        <!-- Line chart overlay -->
        <polyline
          points="32,120 72,90 112,105 152,65 192,95"
          fill="none"
          stroke="white"
          stroke-width="2.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <circle cx="32" cy="120" r="4" fill="white" />
        <circle cx="72" cy="90" r="4" fill="white" />
        <circle cx="112" cy="105" r="4" fill="white" />
        <circle cx="152" cy="65" r="4" fill="white" />
        <circle cx="192" cy="95" r="4" fill="white" />
      </svg>
    </div>

    <!-- Content -->
    <div class="relative z-10 px-8 py-10">
      <div class="flex items-center gap-2 mb-2">
        <span class="material-symbols-outlined text-white/80 text-[22px]"
          >rocket_launch</span
        >
        <span
          class="text-white/80 text-sm font-medium uppercase tracking-widest"
          >Get started</span
        >
      </div>
      <h2
        class="font-headline text-3xl font-bold text-white leading-tight mb-2"
      >
        Build your first form
      </h2>
      <p class="text-white/70 text-sm max-w-xs mb-6">
        Design XLSForm-powered surveys, deploy them to field teams, and watch
        data flow in—no code required.
      </p>
      <a
        href="/dashboard/forms"
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-600 font-semibold text-sm rounded-xl shadow hover:bg-blue-50 transition-colors"
      >
        <span class="material-symbols-outlined text-[18px]">add</span>
        Create Form
      </a>
    </div>
  </div>
</div>

<!-- ─── Stat cards ──────────────────────────────────── -->
<div class="px-6 md:px-8 grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <div class="bg-white rounded-2xl ambient-shadow px-5 py-4">
    <div class="flex items-center justify-between mb-3">
      <span
        class="text-xs font-medium text-on-surface/50 uppercase tracking-wider"
        >Forms</span
      >
      <span class="material-symbols-outlined text-secondary text-[20px]"
        >description</span
      >
    </div>
    <div class="text-3xl font-headline font-semibold text-on-surface">
      {data.activeForms}
    </div>
    <div class="text-xs text-on-surface/40 mt-1">
      active of {data.formsTotal} total
    </div>
  </div>
  <!-- Indicators tracked -->

  <!-- Quarantine -->
  <div class="bg-white rounded-2xl ambient-shadow px-5 py-4">
    <div class="flex items-center justify-between mb-3">
      <span
        class="text-xs font-medium text-on-surface/50 uppercase tracking-wider"
        >Quarantine</span
      >
      <span class="material-symbols-outlined text-warning text-[20px]"
        >warning</span
      >
    </div>
    <div
      class="text-3xl font-headline font-semibold {data.quarantineTotal > 0
        ? 'text-warning'
        : 'text-on-surface'}"
    >
      {data.quarantineTotal}
    </div>
    <div class="text-xs text-on-surface/40 mt-1">records pending review</div>
  </div>

  <!-- Conflicts -->
  <div class="bg-white rounded-2xl ambient-shadow px-5 py-4">
    <div class="flex items-center justify-between mb-3">
      <span
        class="text-xs font-medium text-on-surface/50 uppercase tracking-wider"
        >Conflicts</span
      >
      <span class="material-symbols-outlined text-error text-[20px]"
        >merge_type</span
      >
    </div>
    <div
      class="text-3xl font-headline font-semibold {data.conflictsTotal > 0
        ? 'text-error'
        : 'text-on-surface'}"
    >
      {data.conflictsTotal}
    </div>
    <div class="text-xs text-on-surface/40 mt-1">unresolved</div>
  </div>

  <div class="bg-white rounded-2xl ambient-shadow px-5 py-4">
    <div class="flex items-center justify-between mb-3">
      <span
        class="text-xs font-medium text-on-surface/50 uppercase tracking-wider"
        >Indicators</span
      >
      <span class="material-symbols-outlined text-primary text-[20px]"
        >analytics</span
      >
    </div>
    <div class="text-3xl font-headline font-semibold text-on-surface">
      {indicators.length}
    </div>
    <div class="text-xs text-on-surface/40 mt-1">tracked</div>
  </div>
</div>

<!-- ─── Two-column grid ──────────────────────────────── -->
<div class="px-6 md:px-8 grid grid-cols-1 xl:grid-cols-3 gap-6 pb-10">
  <!-- Weekly activity (2/3 width) -->
  <div class="xl:col-span-2 bg-white rounded-2xl ambient-shadow p-6">
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-headline font-semibold text-base text-on-surface">
        Weekly Activity
      </h2>
      <span
        class="text-[10px] font-bold text-primary bg-primary/8 px-2 py-0.5 rounded-full"
        >LAST 7 DAYS</span
      >
    </div>
    {#if activity.every((d) => d.count === 0)}
      <p class="text-sm text-on-surface/40 py-8 text-center">
        No submission data for the past 7 days.
      </p>
    {:else}
      <svg
        viewBox="0 0 700 155"
        class="w-full overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
      >
        {#each [0, 33, 67, 100] as tick}
          <line
            x1="40"
            y1={10 + (1 - tick / 100) * 110}
            x2="660"
            y2={10 + (1 - tick / 100) * 110}
            stroke="#d8e2ff"
            stroke-width="1"
          />
        {/each}
        <polyline
          points={pointsStr}
          fill="none"
          stroke="#0056d2"
          stroke-width="2.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        {#each chartPoints as pt}
          {#if pt.count > 0}
            <text
              x={pt.x}
              y={pt.y - 10}
              text-anchor="middle"
              font-size="11"
              fill="#143161"
              fill-opacity="0.5">{pt.count}</text
            >
          {/if}
          <circle cx={pt.x} cy={pt.y} r="5" fill="#0056d2" />
          <circle cx={pt.x} cy={pt.y} r="2.5" fill="white" />
          <text
            x={pt.x}
            y="150"
            text-anchor="middle"
            font-size="11"
            fill="#143161"
            fill-opacity="0.5">{pt.day}</text
          >
        {/each}
      </svg>
    {/if}
  </div>

  <!-- Right column -->
  <div>
    <!-- Sector distribution -->
    <div class="bg-white rounded-2xl ambient-shadow p-6 h-full">
      <h2 class="font-headline font-semibold text-base text-on-surface mb-4">
        Forms by Sector
      </h2>
      {#if data.sectors.length === 0}
        <p class="text-sm text-on-surface/40 py-4 text-center">
          No forms registered.
        </p>
      {:else}
        <div class="space-y-3">
          {#each data.sectors as sector}
            {@const barPct = Math.round((sector.count / sectorMax) * 100)}
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-on-surface/70 capitalize"
                  >{sector.name.replace(/_/g, " ")}</span
                >
                <span class="font-medium text-on-surface">{sector.count}</span>
              </div>
              <div class="h-1.5 bg-surface-variant/40 rounded-full">
                <div
                  class="h-full bg-primary/60 rounded-full"
                  style="width: {barPct}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- ─── Indicator Progress ────────────────────────────────── -->
<div class="px-6 md:px-8 pb-6">
  <div class="bg-white rounded-2xl ambient-shadow p-6">
    <h2 class="font-headline font-semibold text-base text-on-surface mb-4">
      Indicator Progress
    </h2>
    {#if topIndicators.length === 0}
      <p class="text-sm text-on-surface/40 py-8 text-center">
        No indicator data available yet.
      </p>
    {:else}
      <div class="space-y-4">
        {#each topIndicators as ind}
          {@const pct = Math.min(ind.progress_pct ?? 0, 100)}
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="text-xs font-mono bg-primary/8 text-primary px-1.5 py-0.5 rounded shrink-0"
                  >{ind.code}</span
                >
                <span class="text-sm text-on-surface truncate">{ind.name}</span>
              </div>
              <div class="text-xs text-on-surface/50 ml-2 shrink-0">
                {fmt(ind.latest_actual)} / {fmt(ind.annual_target)}
                {ind.unit_of_measure ?? ""}
              </div>
            </div>
            <div class="h-2 bg-surface-variant/40 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all {progressColor(
                  ind.progress_pct,
                )}"
                style="width: {pct}%"
              ></div>
            </div>
            <div class="text-right text-xs text-on-surface/40 mt-0.5">
              {ind.progress_pct != null ? pct.toFixed(1) + "%" : "—"}
            </div>
          </div>
        {/each}
      </div>
      {#if indicators.length > 6}
        <a
          href="/dashboard/indicators"
          class="block text-center text-xs text-primary hover:underline mt-4"
        >
          View all {indicators.length} indicators →
        </a>
      {/if}
    {/if}
  </div>
</div>

<!-- ─── Recent Submissions ────────────────────────────────── -->
<div class="px-6 md:px-8 pb-10">
  <div class="bg-white rounded-2xl ambient-shadow p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-headline font-semibold text-base text-on-surface">
        Recent Submissions
      </h2>
      <a
        href="/dashboard/submissions"
        class="text-primary text-xs font-semibold flex items-center gap-0.5 hover:underline"
      >
        View all <span class="material-symbols-outlined text-[16px]"
          >chevron_right</span
        >
      </a>
    </div>

    {#if recentSubmissions.length === 0}
      <p class="text-sm text-on-surface/40 py-8 text-center">
        No submissions yet.
      </p>
    {:else}
      <div class="space-y-2">
        {#each recentSubmissions as sub}
          {@const badge = statusBadge(sub.status)}
          <div
            class="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-surface-variant/20 transition-colors group"
          >
            <div class="flex items-center gap-3 min-w-0">
              <!-- Avatar placeholder -->
              <div
                class="w-9 h-9 rounded-full bg-surface-variant/40 flex items-center justify-center shrink-0"
              >
                <span
                  class="material-symbols-outlined text-[18px] text-on-surface/40"
                  >person</span
                >
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-sm font-medium text-on-surface truncate">
                    {sub.entity_name ?? sub.form_display_name}
                  </span>
                  <span
                    class="text-xs text-on-surface/40 truncate hidden sm:block"
                    >· {sub.form_display_name}</span
                  >
                </div>
                <p
                  class="text-[11px] text-on-surface/50 mt-0.5 uppercase tracking-wide"
                >
                  {sub.enumerator_display_name ?? sub.enumerator_email} · {fmtDateTime(
                    sub.server_received_at,
                  )}
                </p>
              </div>
            </div>
            <span
              class="ml-3 shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase {badge.cls}"
            >
              {badge.label}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
