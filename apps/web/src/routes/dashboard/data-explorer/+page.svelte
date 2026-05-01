<script lang="ts">
  import type { PageData } from "./$types";
  import type { FlatField, InsightField } from "$lib/types";
  import InsightFieldButton from "$lib/components/insights/InsightFieldButton.svelte";
  import InsightBuilder from "$lib/components/insights/InsightBuilder.svelte";

  export let data: PageData;

  // Group forms by folder_schema for the selector
  const grouped: Record<string, typeof data.forms> = {};
  for (const f of data.forms) {
    (grouped[f.folder_schema] ??= []).push(f);
  }

  // Derive ordered column list from first row's fields, excluding group dividers
  function getColumns(fields: FlatField[]): FlatField[] {
    return fields.filter(
      (f) => f.type !== "begin_group" && f.type !== "begin_repeat",
    );
  }

  // ── Insight Builder wiring ──────────────────────────────
  // Look up the InsightField descriptor by payload key so the column
  // header buttons can render the correct enabled/disabled state and
  // pass a fully-typed field into the side panel.
  $: insightFieldMap = new Map<string, InsightField>(
    ((data.insightFields ?? []) as InsightField[]).map((f) => [f.name, f]),
  );

  // Resolve the active form's UUID from the loaded forms list. Required
  // by the Pin button — the API uses form_id (not folder_schema/form_key)
  // as the canonical identifier for newly persisted insights.
  $: activeFormId =
    data.folderSchema && data.formKey
      ? (data.forms.find(
          (f) =>
            f.folder_schema === data.folderSchema &&
            f.form_key === data.formKey,
        )?.id ?? null)
      : null;

  let panelOpen = false;
  let selectedField: InsightField | null = null;

  function openInsight(field: InsightField): void {
    selectedField = field;
    panelOpen = true;
  }
</script>

<svelte:head>
  <title>Data Explorer — Athena</title>
</svelte:head>

<div class="px-6 py-6 md:px-8">
  <h1 class="font-headline text-2xl font-semibold text-on-surface">
    Data Explorer
  </h1>
  <p class="text-sm text-on-surface/50 mt-0.5">
    View full submission data as a tabular dataset
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
        <!-- Table frame -->
        <rect
          x="15"
          y="30"
          width="190"
          height="155"
          rx="8"
          stroke="white"
          stroke-width="1.5"
        />
        <!-- Header row fill -->
        <rect
          x="15"
          y="30"
          width="190"
          height="32"
          rx="8"
          fill="white"
          fill-opacity="0.3"
        />
        <!-- Clip the bottom corners of the header fill -->
        <rect
          x="15"
          y="50"
          width="190"
          height="12"
          fill="white"
          fill-opacity="0.3"
        />
        <!-- Column dividers -->
        <line
          x1="78"
          y1="30"
          x2="78"
          y2="185"
          stroke="white"
          stroke-width="1"
          stroke-opacity="0.5"
        />
        <line
          x1="141"
          y1="30"
          x2="141"
          y2="185"
          stroke="white"
          stroke-width="1"
          stroke-opacity="0.5"
        />
        <!-- Row dividers -->
        <line
          x1="15"
          y1="62"
          x2="205"
          y2="62"
          stroke="white"
          stroke-width="1"
          stroke-opacity="0.4"
        />
        <line
          x1="15"
          y1="92"
          x2="205"
          y2="92"
          stroke="white"
          stroke-width="1"
          stroke-opacity="0.4"
        />
        <line
          x1="15"
          y1="122"
          x2="205"
          y2="122"
          stroke="white"
          stroke-width="1"
          stroke-opacity="0.4"
        />
        <line
          x1="15"
          y1="152"
          x2="205"
          y2="152"
          stroke="white"
          stroke-width="1"
          stroke-opacity="0.4"
        />
        <!-- Header labels -->
        <rect x="25" y="40" width="38" height="6" rx="3" fill="white" />
        <rect x="88" y="40" width="34" height="6" rx="3" fill="white" />
        <rect x="151" y="40" width="34" height="6" rx="3" fill="white" />
        <!-- Row 1 -->
        <rect
          x="25"
          y="72"
          width="30"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <rect
          x="88"
          y="72"
          width="44"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <rect
          x="151"
          y="72"
          width="24"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <!-- Row 2 -->
        <rect
          x="25"
          y="102"
          width="42"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <rect
          x="88"
          y="102"
          width="28"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <rect
          x="151"
          y="102"
          width="38"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <!-- Row 3 -->
        <rect
          x="25"
          y="132"
          width="24"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <rect
          x="88"
          y="132"
          width="46"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <rect
          x="151"
          y="132"
          width="30"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <!-- Row 4 -->
        <rect
          x="25"
          y="162"
          width="36"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <rect
          x="88"
          y="162"
          width="24"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
        <rect
          x="151"
          y="162"
          width="40"
          height="5"
          rx="2"
          fill="white"
          fill-opacity="0.7"
        />
      </svg>
    </div>

    <!-- Content -->
    <div class="relative z-10 px-8 py-10">
      <h2
        class="font-headline text-3xl font-bold text-white leading-tight mb-2"
      >
        Explore your data
      </h2>
      <p class="text-white/70 text-sm max-w-xs mb-0">
        Browse full submission datasets by sector and form. Click any column
        header to visualise and pin charts to your reporting dashboards.
      </p>
    </div>
  </div>
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

<!-- Results -->
{#if data.submissionsError}
  <div class="px-6 md:px-8 pb-10">
    <div class="bg-error/10 text-error rounded-2xl px-5 py-4 text-sm">
      {data.submissionsError}
    </div>
  </div>
{:else if data.submissions}
  {@const { data: rows, pagination } = data.submissions}
  {@const columns = rows.length > 0 ? getColumns(rows[0].fields ?? []) : []}
  <div class="px-6 md:px-8 pb-10">
    <div class="bg-white rounded-2xl ambient-shadow overflow-hidden">
      <div
        class="px-5 py-3 border-b border-surface-variant/20 text-sm text-on-surface/50"
      >
        {pagination.total.toLocaleString()} submissions &nbsp;·&nbsp; page {pagination.page}
        of {pagination.pages} &nbsp;·&nbsp; {columns.length} fields
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
                {#each columns as col}
                  <th
                    class="px-5 py-3 font-medium whitespace-nowrap max-w-[200px]"
                    title={col.name}
                  >
                    <span class="inline-flex items-center">
                      <span>{col.label}</span>
                      {#if data.insightsEnabled}
                        {@const insight = insightFieldMap.get(col.name)}
                        {#if insight}
                          <InsightFieldButton
                            field={insight}
                            on:open={(e) => openInsight(e.detail)}
                          />
                        {/if}
                      {/if}
                    </span>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-variant/15">
              {#each rows as row}
                {@const fieldMap = Object.fromEntries(
                  (row.fields ?? []).map((f) => [f.name, f.value]),
                )}
                <tr class="hover:bg-surface-variant/10 transition-colors">
                  {#each columns as col}
                    <td
                      class="px-5 py-3 text-on-surface/70 max-w-[200px] truncate whitespace-nowrap"
                      title={fieldMap[col.name] ?? ""}
                    >
                      {fieldMap[col.name] ?? "—"}
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
              class="text-sm text-primary hover:underline {data.page <= 1
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
      >table</span
    >
    <p class="text-on-surface/50 text-sm">
      Select a sector and form above to load the dataset.
    </p>
  </div>
{/if}

{#if data.insightsEnabled}
  <InsightBuilder
    bind:open={panelOpen}
    field={selectedField}
    formId={activeFormId}
    folderSchema={data.folderSchema}
    formKey={data.formKey}
  />
{/if}
