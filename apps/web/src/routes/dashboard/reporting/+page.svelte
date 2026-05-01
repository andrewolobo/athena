<script lang="ts">
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";
  import type { UserDashboard } from "$lib/types";
  import PinnedInsightsGrid from "$lib/components/insights/PinnedInsightsGrid.svelte";
  import { pushToast } from "$lib/stores/toasts";

  export let data: PageData;

  $: dashboards = (data.dashboards ?? []) as UserDashboard[];
  $: activeDashboardId = data.activeDashboardId as string | null;
  $: activeDashboard = (dashboards.find(
    (d: UserDashboard) => d.id === activeDashboardId,
  ) ?? null) as UserDashboard | null;
  $: insights = data.insights ?? [];

  // ── New dashboard form ────────────────────────────────────
  let showNewForm = false;
  let newName = "";
  let newDescription = "";
  let creating = false;

  async function createDashboard(): Promise<void> {
    const name = newName.trim();
    if (!name) return;
    creating = true;
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: newDescription.trim() || undefined,
          is_default: dashboards.length === 0,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Failed to create dashboard (${res.status})`,
        );
      }
      const created = await res.json();
      showNewForm = false;
      newName = "";
      newDescription = "";
      // Navigate to the new dashboard — the server load will re-run.
      await goto(`?d=${created.id}`, { invalidateAll: true });
    } catch (err) {
      pushToast(
        "error",
        err instanceof Error ? err.message : "Could not create dashboard",
      );
    } finally {
      creating = false;
    }
  }

  // ── Edit dashboard name ───────────────────────────────────
  let editingId: string | null = null;
  let editName = "";
  let editDescription = "";
  let saving = false;

  function startEdit(id: string): void {
    const d = dashboards.find((x: UserDashboard) => x.id === id);
    if (!d) return;
    editingId = id;
    editName = d.name;
    editDescription = d.description ?? "";
  }

  function cancelEdit(): void {
    editingId = null;
    editName = "";
    editDescription = "";
  }

  async function saveEdit(): Promise<void> {
    const name = editName.trim();
    if (!name || !editingId) return;
    saving = true;
    try {
      const res = await fetch(`/api/dashboards/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: editDescription.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Failed to update dashboard (${res.status})`,
        );
      }
      editingId = null;
      await goto(`?d=${activeDashboardId}`, { invalidateAll: true });
    } catch (err) {
      pushToast(
        "error",
        err instanceof Error ? err.message : "Could not update dashboard",
      );
    } finally {
      saving = false;
    }
  }

  // ── Delete dashboard ──────────────────────────────────────
  let deleting = false;

  async function deleteDashboard(id: string): Promise<void> {
    const d = dashboards.find((x: UserDashboard) => x.id === id);
    if (!d) return;
    const confirmed = window.confirm(
      `Delete "${d.name}"? All charts pinned to this dashboard will be permanently removed.`,
    );
    if (!confirmed) return;
    deleting = true;
    try {
      const res = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Failed to delete dashboard (${res.status})`,
        );
      }
      // Navigate to another dashboard or stay on the page with an empty list.
      const remaining = dashboards.filter((x: UserDashboard) => x.id !== id);
      const next =
        remaining.find((x: UserDashboard) => x.is_default) ??
        remaining[0] ??
        null;
      await goto(next ? `?d=${next.id}` : "?", { invalidateAll: true });
    } catch (err) {
      pushToast(
        "error",
        err instanceof Error ? err.message : "Could not delete dashboard",
      );
    } finally {
      deleting = false;
    }
  }

  // ── Set as default ────────────────────────────────────────
  async function setDefault(id: string): Promise<void> {
    try {
      const res = await fetch(`/api/dashboards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update dashboard");
      }
      await goto(`?d=${id}`, { invalidateAll: true });
      pushToast("success", "Default dashboard updated.");
    } catch (err) {
      pushToast(
        "error",
        err instanceof Error ? err.message : "Could not update dashboard",
      );
    }
  }
</script>

<svelte:head>
  <title>Reporting — Athena</title>
</svelte:head>

<!-- Page header -->
<div class="px-6 py-6 md:px-8"></div>

<!-- ── Page banner ──────────────────────────────────────────── -->
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
      <h2
        class="font-headline text-3xl font-bold text-white leading-tight mb-2"
      >
        Reporting
      </h2>
      <p class="text-white/70 text-sm max-w-xs mb-6">
        Build and organise named dashboards of pinned charts from the Data
        Explorer. Each dashboard is bookmarkable and independently managed.
      </p>
      <button
        type="button"
        on:click={() => {
          showNewForm = true;
          editingId = null;
        }}
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-600 font-semibold text-sm rounded-xl shadow hover:bg-blue-50 transition-colors"
      >
        <span class="material-symbols-outlined text-[18px]">add</span>
        New Dashboard
      </button>
    </div>
  </div>
</div>

<!-- ── New dashboard slide-in form ─────────────────────────── -->
{#if showNewForm}
  <div class="px-6 md:px-8 mb-6">
    <div class="bg-white rounded-2xl ambient-shadow p-6 max-w-xl">
      <h2 class="font-headline text-lg font-semibold text-on-surface mb-4">
        Create Dashboard
      </h2>
      <label class="block mb-3">
        <span class="text-xs font-medium text-on-surface/70 block mb-1"
          >Name</span
        >
        <input
          type="text"
          bind:value={newName}
          maxlength="80"
          placeholder="e.g. WASH Monitoring Q2"
          class="w-full px-3 py-2 text-sm rounded-xl bg-surface border border-surface-variant/40 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
        />
      </label>
      <label class="block mb-5">
        <span class="text-xs font-medium text-on-surface/70 block mb-1"
          >Description (optional)</span
        >
        <textarea
          bind:value={newDescription}
          maxlength="300"
          rows="2"
          class="w-full px-3 py-2 text-sm rounded-xl bg-surface border border-surface-variant/40 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
        ></textarea>
      </label>
      <div class="flex items-center gap-3">
        <button
          type="button"
          on:click={createDashboard}
          disabled={!newName.trim() || creating}
          class="px-5 py-2 text-sm font-semibold rounded-xl transition-colors
            {newName.trim() && !creating
            ? 'bg-primary text-white hover:bg-primary-dim cursor-pointer'
            : 'bg-primary/40 text-white cursor-not-allowed'}"
        >
          {creating ? "Creating…" : "Create Dashboard"}
        </button>
        <button
          type="button"
          on:click={() => {
            showNewForm = false;
            newName = "";
            newDescription = "";
          }}
          class="px-4 py-2 text-sm font-medium text-on-surface/60 hover:text-on-surface hover:bg-surface-variant/40 rounded-xl transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="px-6 md:px-8 pb-10">
  <!-- ── Empty state: no dashboards ─────────────────────── -->
  {#if dashboards.length === 0}
    <div class="flex flex-col items-center justify-center py-24 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface/20 mb-4"
        >bar_chart</span
      >
      <p class="text-on-surface/70 font-semibold text-base mb-1">
        No dashboards yet
      </p>
      <p class="text-on-surface/50 text-sm max-w-sm mb-6">
        Create your first dashboard to start pinning charts from the Data
        Explorer.
      </p>
      <button
        type="button"
        on:click={() => (showNewForm = true)}
        class="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-semibold rounded-2xl hover:bg-primary-dim transition-colors"
      >
        <span class="material-symbols-outlined text-[20px]">add</span>
        Create a Dashboard
      </button>
    </div>
  {:else}
    <!-- ── Tab bar ────────────────────────────────────────── -->
    <div
      class="flex items-center gap-1 border-b border-surface-variant/30 mb-6 overflow-x-auto pb-px"
    >
      {#each dashboards as d (d.id)}
        <a
          href="?d={d.id}"
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-xl whitespace-nowrap transition-colors border-b-2
            {d.id === activeDashboardId
            ? 'border-primary text-primary bg-primary/5'
            : 'border-transparent text-on-surface/60 hover:text-on-surface hover:bg-surface-variant/30'}"
        >
          {d.name}
          {#if d.is_default}
            <span
              class="material-symbols-outlined text-[14px] text-on-surface/40"
              title="Default dashboard">home</span
            >
          {/if}
        </a>
      {/each}
    </div>

    <!-- ── Active dashboard panel ─────────────────────────── -->
    {#if activeDashboard}
      <div class="mb-6">
        {#if editingId === activeDashboard.id}
          <!-- Inline edit form -->
          <div class="bg-white rounded-2xl ambient-shadow p-6 max-w-xl mb-4">
            <h2
              class="font-headline text-base font-semibold text-on-surface mb-4"
            >
              Edit Dashboard
            </h2>
            <label class="block mb-3">
              <span class="text-xs font-medium text-on-surface/70 block mb-1"
                >Name</span
              >
              <input
                type="text"
                bind:value={editName}
                maxlength="80"
                class="w-full px-3 py-2 text-sm rounded-xl bg-surface border border-surface-variant/40 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </label>
            <label class="block mb-5">
              <span class="text-xs font-medium text-on-surface/70 block mb-1"
                >Description (optional)</span
              >
              <textarea
                bind:value={editDescription}
                maxlength="300"
                rows="2"
                class="w-full px-3 py-2 text-sm rounded-xl bg-surface border border-surface-variant/40 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
              ></textarea>
            </label>
            <div class="flex items-center gap-3">
              <button
                type="button"
                on:click={saveEdit}
                disabled={!editName.trim() || saving}
                class="px-5 py-2 text-sm font-semibold rounded-xl transition-colors
                  {editName.trim() && !saving
                  ? 'bg-primary text-white hover:bg-primary-dim cursor-pointer'
                  : 'bg-primary/40 text-white cursor-not-allowed'}"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                on:click={cancelEdit}
                class="px-4 py-2 text-sm font-medium text-on-surface/60 hover:text-on-surface hover:bg-surface-variant/40 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        {:else}
          <!-- Dashboard header -->
          <div class="flex items-start justify-between gap-4 mb-4">
            <div class="min-w-0">
              <h2
                class="font-headline text-xl font-bold text-on-surface flex items-center gap-2"
              >
                {activeDashboard.name}
                {#if activeDashboard.is_default}
                  <span
                    class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-primary/10 text-primary rounded-full"
                    >Default</span
                  >
                {/if}
              </h2>
              {#if activeDashboard.description}
                <p class="text-sm text-on-surface/60 mt-1">
                  {activeDashboard.description}
                </p>
              {/if}
            </div>
            <div class="flex items-center gap-2 shrink-0">
              {#if !activeDashboard.is_default}
                <button
                  type="button"
                  on:click={() => setDefault(activeDashboard.id)}
                  title="Set as default dashboard"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface/60 hover:text-on-surface hover:bg-surface-variant/40 rounded-xl transition-colors"
                >
                  <span class="material-symbols-outlined text-[16px]">home</span
                  >
                  Set default
                </button>
              {/if}
              <button
                type="button"
                on:click={() => startEdit(activeDashboard.id)}
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface/60 hover:text-on-surface hover:bg-surface-variant/40 rounded-xl transition-colors"
              >
                <span class="material-symbols-outlined text-[16px]">edit</span>
                Edit
              </button>
              <button
                type="button"
                on:click={() => deleteDashboard(activeDashboard.id)}
                disabled={deleting}
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-error/70 hover:text-error hover:bg-error/10 rounded-xl transition-colors"
              >
                <span class="material-symbols-outlined text-[16px]">delete</span
                >
                Delete
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- ── Insight grid or empty state ─────────────────── -->
      {#key activeDashboardId}
        {#if insights.length === 0}
          <div
            class="flex flex-col items-center justify-center py-24 text-center"
          >
            <span
              class="material-symbols-outlined text-5xl text-on-surface/20 mb-4"
              >push_pin</span
            >
            <p class="text-on-surface/70 font-semibold text-base mb-1">
              This dashboard is empty
            </p>
            <p class="text-on-surface/50 text-sm max-w-sm mb-6">
              Go to the Data Explorer, click a column header, and pin charts
              here.
            </p>
            <a
              href="/dashboard/data-explorer"
              class="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-semibold rounded-2xl hover:bg-primary-dim transition-colors"
            >
              <span class="material-symbols-outlined text-[20px]">table</span>
              Open Data Explorer
            </a>
          </div>
        {:else}
          <PinnedInsightsGrid {insights} />
        {/if}
      {/key}
    {/if}
  {/if}
</div>
