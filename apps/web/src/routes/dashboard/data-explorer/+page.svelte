<script lang="ts">
  import type { PageData } from "./$types";
  import type { FlatField } from "$lib/types";
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
</script>

<div class="px-6 py-6 md:px-8">
  <h1 class="font-headline text-2xl font-semibold text-on-surface">
    Data Explorer
  </h1>
  <p class="text-sm text-on-surface/50 mt-0.5">
    View full submission data as a tabular dataset
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
                    {col.label}
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
