<script lang="ts">
  import type { PageData } from "./$types";
  import type { SubmissionDetail } from "$lib/types";
  export let data: PageData;

  // Group forms by folder_schema for the selector
  const grouped: Record<string, typeof data.forms> = {};
  for (const f of data.forms) {
    (grouped[f.folder_schema] ??= []).push(f);
  }

  function statusColor(status: string) {
    return status === "approved"
      ? "text-secondary bg-secondary/10"
      : status === "quarantined"
        ? "text-warning bg-warning/10"
        : status === "conflict"
          ? "text-error bg-error/10"
          : "text-on-surface/50 bg-surface-variant/30";
  }

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
  }

  // ── Detail drawer state ───────────────────────────────────
  let drawerDetail: SubmissionDetail | null = null;
  let drawerLoading = false;
  let drawerError: string | null = null;

  async function openDetail(rowId: string) {
    drawerLoading = true;
    drawerError = null;
    drawerDetail = null;

    const params = new URLSearchParams({
      folder_schema: data.folderSchema,
      form_key: data.formKey,
    });

    try {
      const res = await fetch(`/api/submissions/${rowId}?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        drawerError =
          (body as { error?: string }).error ?? "Failed to load submission";
      } else {
        drawerDetail = (await res.json()) as SubmissionDetail;
      }
    } catch {
      drawerError = "Network error — please try again.";
    } finally {
      drawerLoading = false;
    }
  }

  function closeDrawer() {
    drawerDetail = null;
    drawerError = null;
    drawerLoading = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") closeDrawer();
  }
</script>

<svelte:head>
  <title>Submissions — Athena</title>
</svelte:head>

<div class="px-6 py-6 md:px-8">
  <h1 class="font-headline text-2xl font-semibold text-on-surface">
    Submissions
  </h1>
  <p class="text-sm text-on-surface/50 mt-0.5">
    Browse form submissions by form
  </p>
</div>

<!-- Form selector -->
<div class="px-6 md:px-8 mb-6">
  <form method="GET" class="flex flex-wrap gap-3 items-end">
    <div>
      <label
        for="folder_schema"
        class="block text-xs font-medium text-on-surface/60 mb-1">Sector</label
      >
      <select
        id="folder_schema"
        name="folder_schema"
        class="rounded-xl border-0 bg-white shadow-sm text-sm text-on-surface px-3 py-2 pr-8 focus:ring-2 focus:ring-primary ambient-shadow"
        on:change={(e) => {
          e.currentTarget.form?.submit();
        }}
      >
        <option value="">— Select sector —</option>
        {#each Object.keys(grouped) as schema}
          <option value={schema} selected={schema === data.folderSchema}>
            {schema.replace(/_/g, " ")}
          </option>
        {/each}
      </select>
    </div>

    {#if data.folderSchema && grouped[data.folderSchema]}
      <div>
        <label
          for="form_key"
          class="block text-xs font-medium text-on-surface/60 mb-1">Form</label
        >
        <select
          id="form_key"
          name="form_key"
          class="rounded-xl border-0 bg-white shadow-sm text-sm text-on-surface px-3 py-2 pr-8 focus:ring-2 focus:ring-primary ambient-shadow"
        >
          <option value="">— Select form —</option>
          {#each grouped[data.folderSchema] as f}
            <option value={f.form_key} selected={f.form_key === data.formKey}>
              {f.display_name}
            </option>
          {/each}
        </select>
      </div>

      <button
        type="submit"
        class="px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-dark transition-colors"
      >
        Load
      </button>

      {#if data.formKey}
        <a
          href="/api/submissions/export?folder_schema={data.folderSchema}&form_key={data.formKey}"
          download
          class="px-4 py-2 bg-surface-variant/30 text-on-surface text-sm font-medium rounded-xl hover:bg-surface-variant/50 transition-colors ambient-shadow"
        >
          Export CSV
        </a>
      {/if}
    {/if}
  </form>
</div>

<!-- Results table -->
{#if data.submissionsError}
  <div class="px-6 md:px-8 pb-10">
    <div class="bg-error/10 text-error rounded-2xl px-5 py-4 text-sm">
      {data.submissionsError}
    </div>
  </div>
{:else if data.submissions}
  {@const { data: rows, pagination } = data.submissions}
  {@const dynamicCols = (rows[0]?.fields ?? [])
    .filter((f) => f.type !== "begin_group")
    .slice(0, 5)}
  <div class="px-6 md:px-8 pb-10">
    <div class="bg-white rounded-2xl ambient-shadow overflow-hidden">
      <div
        class="px-5 py-3 border-b border-surface-variant/20 text-sm text-on-surface/50"
      >
        {pagination.total.toLocaleString()} submissions &nbsp;·&nbsp; page {pagination.page}
        of {pagination.pages}
      </div>
      {#if rows.length === 0}
        <p class="text-center text-sm text-on-surface/40 py-12">
          No submissions found.
        </p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr
                class="text-left text-xs text-on-surface/40 uppercase tracking-wider border-b border-surface-variant/20"
              >
                <th class="px-5 py-3 font-medium">ID</th>
                <th class="px-5 py-3 font-medium">Entity</th>
                <th class="px-5 py-3 font-medium">Status</th>
                <th class="px-5 py-3 font-medium">Start</th>
                <th class="px-5 py-3 font-medium">Received</th>
                {#each dynamicCols as col}
                  <th class="px-5 py-3 font-medium max-w-[160px] truncate"
                    >{col.label}</th
                  >
                {/each}
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-variant/15">
              {#each rows as row}
                <tr
                  class="hover:bg-surface-variant/10 transition-colors cursor-pointer"
                  on:click={() => openDetail(row.id)}
                  on:keydown={(e) => e.key === "Enter" && openDetail(row.id)}
                  role="button"
                  tabindex="0"
                >
                  <td class="px-5 py-3 font-mono text-xs text-on-surface/60"
                    >{row.id.slice(0, 8)}…</td
                  >
                  <td class="px-5 py-3 font-mono text-xs text-on-surface/60"
                    >{row.entity_id.slice(0, 8)}…</td
                  >
                  <td class="px-5 py-3">
                    <span
                      class="text-xs px-2 py-0.5 rounded-full font-medium {statusColor(
                        row.status,
                      )}"
                    >
                      {row.status}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-on-surface/60 whitespace-nowrap"
                    >{fmtDate(row.start_time)}</td
                  >
                  <td class="px-5 py-3 text-on-surface/60 whitespace-nowrap"
                    >{fmtDate(row.server_received_at)}</td
                  >
                  {#each dynamicCols as col}
                    {@const fieldValue = (row.fields ?? []).find(
                      (f) => f.name === col.name,
                    )?.value}
                    <td
                      class="px-5 py-3 text-on-surface/70 max-w-[160px] truncate"
                    >
                      {fieldValue ?? "—"}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        {#if pagination.pages > 1}
          <div
            class="flex items-center justify-between px-5 py-3 border-t border-surface-variant/20"
          >
            <a
              href="?folder_schema={data.folderSchema}&form_key={data.formKey}&page={data.page -
                1}"
              class="text-sm text-primary hover:underline disabled:opacity-30 {data.page <=
              1
                ? 'pointer-events-none opacity-30'
                : ''}">← Prev</a
            >
            <span class="text-xs text-on-surface/40"
              >Page {data.page} / {pagination.pages}</span
            >
            <a
              href="?folder_schema={data.folderSchema}&form_key={data.formKey}&page={data.page +
                1}"
              class="text-sm text-primary hover:underline {data.page >=
              pagination.pages
                ? 'pointer-events-none opacity-30'
                : ''}">Next →</a
            >
          </div>
        {/if}
      {/if}
    </div>
  </div>
{:else if !data.folderSchema}
  <div
    class="px-6 md:px-8 flex flex-col items-center justify-center py-24 text-center"
  >
    <span class="material-symbols-outlined text-5xl text-on-surface/20 mb-4"
      >assignment</span
    >
    <p class="text-on-surface/50 text-sm">
      Select a sector and form above to browse submissions.
    </p>
  </div>
{/if}

<svelte:window on:keydown={handleKeydown} />

<!-- ── Detail Drawer ─────────────────────────────────────────── -->
{#if drawerLoading || drawerDetail || drawerError}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/30 z-40"
    role="presentation"
    on:click={closeDrawer}
  />

  <!-- Panel -->
  <aside
    class="fixed top-0 right-0 h-full w-full max-w-xl z-50 bg-[#f9f9ff] flex flex-col ambient-shadow overflow-hidden"
    role="dialog"
    aria-modal="true"
    aria-label="Submission detail"
  >
    <!-- Panel header -->
    <div
      class="flex items-start justify-between px-6 py-5 bg-white border-b border-surface-variant/20"
    >
      <div>
        {#if drawerDetail}
          <h2
            class="font-headline text-lg font-semibold text-on-surface leading-tight"
          >
            {drawerDetail.form_display_name}
          </h2>
          <p class="text-sm text-on-surface/50 mt-0.5">
            {drawerDetail.entity_name ??
              drawerDetail.entity_id.slice(0, 12) + "…"}
          </p>
        {:else}
          <h2 class="font-headline text-lg font-semibold text-on-surface">
            Loading…
          </h2>
        {/if}
      </div>
      <div class="flex items-center gap-3 ml-4 shrink-0">
        {#if drawerDetail}
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium {statusColor(
              drawerDetail.status,
            )}"
          >
            {drawerDetail.status}
          </span>
        {/if}
        <button
          on:click={closeDrawer}
          class="p-1.5 rounded-lg text-on-surface/40 hover:text-on-surface hover:bg-surface-variant/30 transition-colors"
          aria-label="Close"
        >
          <span class="material-symbols-outlined text-xl leading-none"
            >close</span
          >
        </button>
      </div>
    </div>

    <!-- Panel body -->
    <div class="flex-1 overflow-y-auto">
      {#if drawerLoading}
        <div class="flex items-center justify-center py-24">
          <span class="text-sm text-on-surface/40">Loading…</span>
        </div>
      {:else if drawerError}
        <div class="px-6 py-6">
          <div class="bg-error/10 text-error rounded-2xl px-5 py-4 text-sm">
            {drawerError}
          </div>
        </div>
      {:else if drawerDetail}
        <!-- Metadata grid -->
        <section class="px-6 py-5 bg-white">
          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt
                class="text-xs text-on-surface/40 font-medium uppercase tracking-wide mb-0.5"
              >
                Enumerator
              </dt>
              <dd class="text-on-surface">
                {drawerDetail.enumerator_display_name ??
                  drawerDetail.enumerator_email}
              </dd>
            </div>
            <div>
              <dt
                class="text-xs text-on-surface/40 font-medium uppercase tracking-wide mb-0.5"
              >
                Received
              </dt>
              <dd class="text-on-surface">
                {fmtDate(drawerDetail.server_received_at)}
              </dd>
            </div>
            <div>
              <dt
                class="text-xs text-on-surface/40 font-medium uppercase tracking-wide mb-0.5"
              >
                Start
              </dt>
              <dd class="text-on-surface">
                {fmtDate(drawerDetail.start_time)}
              </dd>
            </div>
            <div>
              <dt
                class="text-xs text-on-surface/40 font-medium uppercase tracking-wide mb-0.5"
              >
                End
              </dt>
              <dd class="text-on-surface">{fmtDate(drawerDetail.end_time)}</dd>
            </div>
            <div>
              <dt
                class="text-xs text-on-surface/40 font-medium uppercase tracking-wide mb-0.5"
              >
                Form version
              </dt>
              <dd class="text-on-surface">v{drawerDetail.form_version}</dd>
            </div>
            {#if drawerDetail.location}
              <div>
                <dt
                  class="text-xs text-on-surface/40 font-medium uppercase tracking-wide mb-0.5"
                >
                  Location
                </dt>
                <dd>
                  <a
                    href="https://www.openstreetmap.org/?mlat={drawerDetail
                      .location.lat}&mlon={drawerDetail.location.lng}&zoom=15"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline text-sm"
                  >
                    {drawerDetail.location.lat.toFixed(5)}, {drawerDetail.location.lng.toFixed(
                      5,
                    )} ↗
                  </a>
                </dd>
              </div>
            {/if}
          </dl>
        </section>

        <!-- Fields section -->
        <section class="px-6 py-5">
          {#each drawerDetail.fields as field}
            {#if field.type === "begin_group" || field.type === "begin_repeat"}
              <h3
                class="font-headline text-xs font-semibold uppercase tracking-widest text-on-surface/40 mt-5 mb-2 first:mt-0"
              >
                {field.label}
              </h3>
            {:else}
              <div
                class="flex gap-4 py-2.5 border-b border-surface-variant/15 last:border-0"
              >
                <dt class="w-2/5 shrink-0 text-sm text-on-surface/50">
                  {field.label}
                </dt>
                <dd class="flex-1 text-sm text-on-surface break-words">
                  {field.value ?? "—"}
                </dd>
              </div>
            {/if}
          {/each}
        </section>

        <!-- DQA notes -->
        {#if drawerDetail.dqa_notes}
          <section class="px-6 pb-5">
            <div class="bg-warning/10 rounded-2xl px-5 py-4">
              <p
                class="text-xs font-semibold text-warning uppercase tracking-wide mb-1"
              >
                DQA Note
              </p>
              <p class="text-sm text-on-surface">{drawerDetail.dqa_notes}</p>
            </div>
          </section>
        {/if}

        <!-- Raw JSON toggle -->
        <section class="px-6 pb-6">
          <details class="group">
            <summary
              class="cursor-pointer text-xs font-medium text-on-surface/40 hover:text-on-surface transition-colors select-none list-none flex items-center gap-1"
            >
              <span
                class="material-symbols-outlined text-base leading-none transition-transform group-open:rotate-90"
                >chevron_right</span
              >
              Raw payload
            </summary>
            <pre
              class="mt-3 p-4 bg-surface-variant/20 rounded-xl text-xs text-on-surface/70 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(
                drawerDetail.raw_payload,
                null,
                2,
              )}</pre>
          </details>
        </section>

        <!-- Entity timeline link -->
        <div class="px-6 pb-8">
          <a
            href="/dashboard/entities?entity_id={drawerDetail.entity_id}"
            class="text-sm text-primary hover:underline"
            >View entity timeline →</a
          >
        </div>
      {/if}
    </div>
  </aside>
{/if}
