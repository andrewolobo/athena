<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData, ActionData } from "./$types";
  export let data: PageData;
  export let form: ActionData;

  let uploading = false;
  let fileInput: HTMLInputElement;
  let fileName = "";

  // Group forms by sector
  const grouped: Record<string, typeof data.forms> = {};
  for (const f of data.forms) {
    (grouped[f.folder_schema] ??= []).push(f);
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString();
  }
</script>

<div class="px-6 py-6 md:px-8 flex items-start justify-between gap-4 flex-wrap">
  <div>
    <h1 class="font-headline text-2xl font-semibold text-on-surface">Forms</h1>
    <p class="text-sm text-on-surface/50 mt-0.5">
      {data.forms.length} forms registered
    </p>
  </div>

  <div class="flex items-center gap-2">
    <!-- Visual builder -->
    <a
      href="/dashboard/forms/new"
      class="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium
             rounded-xl hover:bg-primary-dim transition-colors shadow-sm"
    >
      <span class="material-symbols-outlined text-[18px]">edit_square</span>
      Build Form
    </a>

    <!-- Upload XLSForm -->
    <label
      class="cursor-pointer flex items-center gap-2 px-4 py-2 border border-surface-variant/60
             text-on-surface/70 text-sm font-medium rounded-xl hover:bg-surface-container
             transition-colors"
    >
      <span class="material-symbols-outlined text-[18px]">upload_file</span>
      Upload XLSForm
      <input
        bind:this={fileInput}
        type="file"
        name="xlsform"
        accept=".xlsx,.xls"
        class="hidden"
        on:change={() => {
          fileName = fileInput?.files?.[0]?.name ?? "";
        }}
      />
    </label>
  </div>
</div>

<!-- Upload panel (hidden checkbox trick — pure CSS toggle replaced by Svelte state) -->
{#if form?.error}
  <div
    class="mx-6 md:mx-8 mb-4 px-4 py-3 bg-error/10 text-error rounded-xl text-sm flex items-center gap-2"
  >
    <span class="material-symbols-outlined text-[18px]">error</span>
    {form.error}
  </div>
{/if}

{#if form?.success}
  <div
    class="mx-6 md:mx-8 mb-4 px-4 py-3 bg-secondary/10 text-secondary rounded-xl text-sm flex items-center gap-2"
  >
    <span class="material-symbols-outlined text-[18px]">check_circle</span>
    Form uploaded successfully. The page will refresh shortly.
  </div>
{/if}

<!-- Upload banner -->
<div class="px-6 md:px-8 mb-6" id="upload-section">
  <div
    class="relative overflow-hidden rounded-[28px] bg-gradient-primary p-9 md:p-12 shadow-2xl"
  >
    <!-- Decorative blobs -->
    <div
      class="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none"
    ></div>
    <div
      class="absolute bottom-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -ml-36 -mb-36 pointer-events-none"
    ></div>

    <div class="relative z-10">
      <p
        class="text-on-primary/70 text-sm font-semibold uppercase tracking-widest mb-2"
      >
        Form Registry
      </p>
      <h2
        class="font-headline text-3xl md:text-4xl font-extrabold text-on-primary leading-tight mb-2"
      >
        Upload new XLSForm
      </h2>
      <p class="text-on-primary/70 text-base mb-8 max-w-xl">
        Import an existing XLSForm definition to register it in the system and
        begin collecting data.
      </p>

      <form
        method="POST"
        action="?/upload"
        enctype="multipart/form-data"
        use:enhance={() => {
          uploading = true;
          return async ({ update }) => {
            uploading = false;
            await update();
          };
        }}
        class="flex flex-col gap-5"
      >
        <!-- Metadata row -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-semibold text-on-primary/70 uppercase tracking-wider"
              for="display_name"
            >
              Form title
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              required
              placeholder="e.g. Household Survey 2026"
              class="px-3 py-2.5 text-sm rounded-xl border border-white/20 bg-white/15 text-on-primary placeholder-on-primary/40 focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-semibold text-on-primary/70 uppercase tracking-wider"
              for="folder_schema"
            >
              Sector
            </label>
            <input
              id="folder_schema"
              name="folder_schema"
              type="text"
              required
              placeholder="e.g. health"
              class="px-3 py-2.5 text-sm rounded-xl border border-white/20 bg-white/15 text-on-primary placeholder-on-primary/40 focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-semibold text-on-primary/70 uppercase tracking-wider"
              for="form_key"
            >
              Form key
            </label>
            <input
              id="form_key"
              name="form_key"
              type="text"
              required
              pattern="[a-z0-9_]+"
              placeholder="e.g. household_survey"
              class="px-3 py-2.5 text-sm rounded-xl border border-white/20 bg-white/15 text-on-primary placeholder-on-primary/40 focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm font-mono"
            />
          </div>
        </div>

        <!-- File + submit row -->
        <div class="flex flex-col sm:flex-row gap-4 items-end">
          <div class="flex-1">
            <label
              class="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/30 rounded-xl cursor-pointer hover:border-white/60 hover:bg-white/10 transition-colors"
            >
              <span
                class="material-symbols-outlined text-3xl text-on-primary/50 mb-1"
                >cloud_upload</span
              >
              <span class="text-sm text-on-primary/60">
                {fileName || "Click to select .xlsx / .xls file"}
              </span>
              <input
                bind:this={fileInput}
                type="file"
                name="file"
                accept=".xlsx,.xls"
                class="hidden"
                required
                on:change={() => {
                  fileName = fileInput?.files?.[0]?.name ?? "";
                }}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={uploading}
            class="shrink-0 px-7 py-3 bg-surface text-primary text-sm font-bold rounded-2xl hover:bg-surface-container transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg"
          >
            {#if uploading}
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            {:else}
              <span class="material-symbols-outlined text-[18px]"
                >upload_file</span
              >
            {/if}
            Upload
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- Forms grouped by sector -->
<div class="px-6 md:px-8 pb-10 space-y-6">
  {#if data.forms.length === 0}
    <div class="flex flex-col items-center justify-center py-24 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface/20 mb-4"
        >description</span
      >
      <p class="text-on-surface/50 text-sm">
        No forms yet. Upload your first XLSForm above.
      </p>
    </div>
  {:else}
    {#each Object.entries(grouped) as [schema, forms]}
      <div class="bg-white rounded-2xl ambient-shadow overflow-hidden">
        <div
          class="px-5 py-3 border-b border-surface-variant/20 flex items-center gap-2"
        >
          <span class="material-symbols-outlined text-[16px] text-primary"
            >folder</span
          >
          <span class="text-sm font-medium text-on-surface capitalize"
            >{schema.replace(/_/g, " ")}</span
          >
          <span class="ml-auto text-xs text-on-surface/40"
            >{forms.length} form{forms.length !== 1 ? "s" : ""}</span
          >
        </div>
        <div class="overflow-x-auto">
          <table class="w-full table-fixed text-sm">
            <thead>
              <tr
                class="text-left text-xs text-on-surface/40 uppercase tracking-wider border-b border-surface-variant/10"
              >
                <th class="px-5 py-3 font-medium w-2/5">Name</th>
                <th class="px-5 py-3 font-medium w-1/5">Key</th>
                <th class="px-5 py-3 font-medium w-16">Version</th>
                <th class="px-5 py-3 font-medium w-20">Status</th>
                <th class="px-5 py-3 font-medium w-24">Created</th>
                <th class="px-5 py-3 font-medium w-20">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-variant/10">
              {#each forms as f}
                <tr class="hover:bg-surface-variant/10 transition-colors">
                  <td
                    class="px-5 py-3 font-medium text-on-surface truncate"
                    title={f.display_name}>{f.display_name}</td
                  >
                  <td
                    class="px-5 py-3 font-mono text-xs text-on-surface/60 truncate"
                    title={f.form_key}>{f.form_key}</td
                  >
                  <td class="px-5 py-3 text-on-surface/60 whitespace-nowrap"
                    >v{f.current_version}</td
                  >
                  <td class="px-5 py-3 whitespace-nowrap">
                    <span
                      class="text-xs px-2 py-0.5 rounded-full font-medium {f.is_active
                        ? 'bg-secondary/10 text-secondary'
                        : 'bg-surface-variant/40 text-on-surface/50'}"
                    >
                      {f.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-on-surface/50 whitespace-nowrap"
                    >{fmtDate(f.created_at)}</td
                  >
                  <td class="px-5 py-3">
                    <div class="flex items-center gap-1">
                      <a
                        href="/dashboard/forms/{f.id}"
                        class="p-1.5 rounded-lg text-on-surface/40 hover:text-primary hover:bg-primary/10
                               transition-colors"
                        title="Edit form"
                      >
                        <span class="material-symbols-outlined text-[16px]"
                          >edit</span
                        >
                      </a>
                      <a
                        href="/api/forms/{f.id}/export"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="p-1.5 rounded-lg text-on-surface/40 hover:text-secondary hover:bg-secondary/10
                               transition-colors"
                        title="Download XLSForm (.xlsx)"
                      >
                        <span class="material-symbols-outlined text-[16px]"
                          >download</span
                        >
                      </a>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/each}
  {/if}
</div>
