<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData, ActionData } from "./$types";
  export let data: PageData;
  export let form: ActionData;

  let uploading = false;
  let fileInput: HTMLInputElement;
  let fileName = "";
  let showUploadForm = false;

  // Group ALL forms (active + inactive) by sector — reactive so it updates after actions
  $: grouped = data.forms.reduce<Record<string, typeof data.forms>>(
    (acc, f) => {
      (acc[f.folder_schema] ??= []).push(f);
      return acc;
    },
    {},
  );

  // Sector archive state lookup map
  $: sectorArchiveMap = new Map(
    data.sectors.map((s) => [s.folder_schema, s.is_archived]),
  );

  // Folder navigation + archive visibility state
  let selectedSector: string | null = null;
  let searchQuery = "";
  let showArchived = false;

  // Derived: visible sector entries based on showArchived + search
  $: filteredSectors = Object.entries(grouped).filter(([schema]) => {
    if ((sectorArchiveMap.get(schema) ?? false) && !showArchived) return false;
    return schema
      .replace(/_/g, " ")
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
  });

  // Derived: visible forms within the selected sector based on showArchived + search
  $: filteredForms = selectedSector
    ? (grouped[selectedSector] ?? []).filter((f) => {
        if (!f.is_active && !showArchived) return false;
        return (
          f.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.form_key.toLowerCase().includes(searchQuery.toLowerCase())
        );
      })
    : [];

  function activeFormCount(forms: typeof data.forms): number {
    return forms.filter((f) => f.is_active).length;
  }

  function archivedFormCount(forms: typeof data.forms): number {
    return forms.filter((f) => !f.is_active).length;
  }

  function selectSector(schema: string) {
    selectedSector = schema;
    searchQuery = "";
  }

  function backToSectors() {
    selectedSector = null;
    searchQuery = "";
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString();
  }

  function fmtSector(schema: string) {
    return schema.replace(/_/g, " ");
  }
</script>

<svelte:head>
  <title>Forms — Athena</title>
</svelte:head>

<div class="px-6 py-6 md:px-8">
  <h1 class="font-headline text-2xl font-semibold text-on-surface">Forms</h1>
  <p class="text-sm text-on-surface/50 mt-0.5">
    {data.forms.filter((f) => f.is_active).length} forms registered
  </p>
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

    {#if !showUploadForm}
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
          <!-- Document shadow -->
          <rect
            x="52"
            y="28"
            width="112"
            height="148"
            rx="10"
            fill="white"
            fill-opacity="0.08"
          />
          <!-- Document outline -->
          <rect
            x="44"
            y="20"
            width="112"
            height="148"
            rx="10"
            stroke="white"
            stroke-width="1.5"
          />
          <!-- Folded corner -->
          <path d="M126,20 L156,50 L126,50 Z" fill="white" fill-opacity="0.2" />
          <path
            d="M126,20 L126,50 L156,50"
            stroke="white"
            stroke-width="1.5"
            fill="none"
          />
          <!-- Field label + input row 1 -->
          <rect
            x="60"
            y="65"
            width="36"
            height="5"
            rx="2"
            fill="white"
            fill-opacity="0.55"
          />
          <rect
            x="60"
            y="75"
            width="82"
            height="9"
            rx="4"
            fill="white"
            fill-opacity="0.18"
            stroke="white"
            stroke-width="0.75"
            stroke-opacity="0.4"
          />
          <!-- Field label + input row 2 -->
          <rect
            x="60"
            y="96"
            width="28"
            height="5"
            rx="2"
            fill="white"
            fill-opacity="0.55"
          />
          <rect
            x="60"
            y="106"
            width="82"
            height="9"
            rx="4"
            fill="white"
            fill-opacity="0.18"
            stroke="white"
            stroke-width="0.75"
            stroke-opacity="0.4"
          />
          <!-- Field label + input row 3 -->
          <rect
            x="60"
            y="127"
            width="44"
            height="5"
            rx="2"
            fill="white"
            fill-opacity="0.55"
          />
          <rect
            x="60"
            y="137"
            width="82"
            height="9"
            rx="4"
            fill="white"
            fill-opacity="0.18"
            stroke="white"
            stroke-width="0.75"
            stroke-opacity="0.4"
          />
          <!-- Submit button mockup -->
          <rect
            x="60"
            y="156"
            width="46"
            height="12"
            rx="6"
            fill="white"
            fill-opacity="0.35"
          />
        </svg>
      </div>

      <!-- Default content -->
      <div class="relative z-10 px-8 py-10">
        <h2
          class="font-headline text-3xl font-bold text-white leading-tight mb-2"
        >
          Forms
        </h2>
        <p class="text-white/70 text-sm max-w-xs mb-6">
          Build surveys with the visual form designer, or import an existing
          XLSForm definition to register it and begin collecting data.
        </p>
        <div class="flex items-center gap-3 flex-wrap">
          <a
            href="/dashboard/forms/new"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-600 font-semibold text-sm rounded-xl shadow hover:bg-blue-50 transition-colors"
          >
            <span class="material-symbols-outlined text-[18px]"
              >edit_square</span
            >
            Build Form
          </a>
          <button
            type="button"
            on:click={() => (showUploadForm = true)}
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-white/15 text-white font-semibold text-sm rounded-xl hover:bg-white/25 transition-colors border border-white/20"
          >
            <span class="material-symbols-outlined text-[18px]"
              >upload_file</span
            >
            Upload XLSForm
          </button>
        </div>
      </div>
    {:else}
      <!-- Upload form content -->
      <div class="relative z-10 px-8 py-10 w-full">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-headline text-2xl font-bold text-white leading-tight">
            Upload XLSForm
          </h2>
          <button
            type="button"
            on:click={() => {
              showUploadForm = false;
              fileName = "";
            }}
            class="flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium transition-colors"
          >
            <span class="material-symbols-outlined text-[18px]">arrow_back</span
            >
            Cancel
          </button>
        </div>

        <form
          method="POST"
          action="?/upload"
          enctype="multipart/form-data"
          use:enhance={() => {
            uploading = true;
            return async ({ update }) => {
              uploading = false;
              showUploadForm = false;
              fileName = "";
              await update();
            };
          }}
          class="flex flex-col gap-5"
        >
          <!-- Metadata row -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="flex flex-col gap-1.5">
              <label
                class="text-xs font-semibold text-white/70 uppercase tracking-wider"
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
                class="px-3 py-2.5 text-sm rounded-xl border border-white/20 bg-white/15 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label
                class="text-xs font-semibold text-white/70 uppercase tracking-wider"
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
                class="px-3 py-2.5 text-sm rounded-xl border border-white/20 bg-white/15 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label
                class="text-xs font-semibold text-white/70 uppercase tracking-wider"
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
                class="px-3 py-2.5 text-sm rounded-xl border border-white/20 bg-white/15 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm font-mono"
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
                  class="material-symbols-outlined text-3xl text-white/50 mb-1"
                  >cloud_upload</span
                >
                <span class="text-sm text-white/60">
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
              class="shrink-0 px-7 py-3 bg-white text-blue-600 text-sm font-bold rounded-2xl hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg"
            >
              {#if uploading}
                <svg
                  class="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
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
    {/if}
  </div>
</div>

<!-- Forms folder navigator -->
<div class="px-6 md:px-8 pb-10">
  {#if data.forms.length === 0}
    <!-- Global empty state -->
    <div class="flex flex-col items-center justify-center py-24 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface/20 mb-4"
        >description</span
      >
      <p class="text-on-surface/50 text-sm">
        No forms yet. Upload your first XLSForm above.
      </p>
    </div>
  {:else}
    <!-- Search + breadcrumb bar -->
    <div class="flex items-center gap-3 mb-5 flex-wrap">
      <!-- Breadcrumb -->
      <nav class="flex items-center gap-1 text-sm text-on-surface/50 shrink-0">
        {#if selectedSector}
          <button
            on:click={backToSectors}
            class="hover:text-primary transition-colors font-medium"
          >
            Forms
          </button>
          <span class="text-on-surface/30">/</span>
          <span class="text-on-surface font-medium capitalize"
            >{fmtSector(selectedSector)}</span
          >
        {:else}
          <span class="text-on-surface font-medium">Forms</span>
        {/if}
      </nav>

      <!-- Show archived toggle -->
      <button
        on:click={() => (showArchived = !showArchived)}
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors
               {showArchived
          ? 'bg-surface-variant/40 border-surface-variant text-on-surface/70'
          : 'border-surface-variant/40 text-on-surface/40 hover:bg-surface-container hover:text-on-surface/60'}"
      >
        <span class="material-symbols-outlined text-[14px]">inventory_2</span>
        {showArchived ? "Hide archived" : "Show archived"}
      </button>

      <!-- Search input -->
      <div class="relative flex-1 max-w-sm ml-auto">
        <span
          class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface/30 pointer-events-none"
          >search</span
        >
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={selectedSector ? "Search forms…" : "Search sectors…"}
          class="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-surface-variant/60
                 bg-white text-on-surface placeholder-on-surface/30 focus:outline-none
                 focus:ring-2 focus:ring-primary/30 transition-shadow"
        />
      </div>
    </div>

    <!-- SECTOR GRID VIEW -->
    {#if !selectedSector}
      {#if filteredSectors.length === 0}
        <div
          class="flex flex-col items-center justify-center py-20 text-center"
        >
          <span
            class="material-symbols-outlined text-4xl text-on-surface/20 mb-3"
            >search_off</span
          >
          <p class="text-on-surface/40 text-sm">
            No sectors match your search.
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {#each filteredSectors as [schema, forms]}
            {@const sectorArchived = sectorArchiveMap.get(schema) ?? false}
            <div
              class="group bg-white rounded-2xl ambient-shadow flex flex-col overflow-hidden
                     border transition-all hover:shadow-lg
                     {sectorArchived
                ? 'border-surface-variant/40 opacity-70'
                : 'border-transparent hover:border-primary/30'}"
            >
              <!-- Clickable navigation area -->
              <button
                on:click={() => selectSector(schema)}
                class="w-full p-5 flex flex-col items-start gap-3 text-left cursor-pointer"
              >
                <!-- Folder icon -->
                <div
                  class="w-12 h-12 rounded-xl flex items-center justify-center transition-colors
                         {sectorArchived
                    ? 'bg-surface-variant/30'
                    : 'bg-primary/8 group-hover:bg-primary/15'}"
                >
                  <span
                    class="material-symbols-outlined text-[28px] {sectorArchived
                      ? 'text-on-surface/30'
                      : 'text-primary'}"
                    style="font-variation-settings: 'FILL' 1"
                    >{sectorArchived ? "folder_off" : "folder"}</span
                  >
                </div>

                <!-- Sector name + counts -->
                <div class="flex-1 min-w-0 w-full">
                  <p
                    class="text-sm font-semibold capitalize truncate leading-snug
                           {sectorArchived
                      ? 'text-on-surface/40'
                      : 'text-on-surface'}"
                  >
                    {fmtSector(schema)}
                  </p>
                  <p class="text-xs text-on-surface/40 mt-0.5">
                    {activeFormCount(forms)}
                    {activeFormCount(forms) === 1 ? "form" : "forms"}
                    {#if archivedFormCount(forms) > 0}
                      <span class="text-on-surface/25"
                        >· {archivedFormCount(forms)} archived</span
                      >
                    {/if}
                  </p>
                </div>
              </button>

              <!-- Action footer -->
              <div
                class="px-5 pb-4 flex items-center {sectorArchived
                  ? 'justify-between'
                  : 'justify-end'}"
              >
                {#if sectorArchived}
                  <span
                    class="flex items-center gap-1 text-xs text-on-surface/35 font-medium"
                  >
                    <span class="material-symbols-outlined text-[13px]"
                      >inventory_2</span
                    >
                    Archived
                  </span>
                  <form method="POST" action="?/unarchiveSector" use:enhance>
                    <input type="hidden" name="folder_schema" value={schema} />
                    <button
                      type="submit"
                      class="flex items-center gap-1 text-xs text-secondary font-medium
                             hover:bg-secondary/10 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <span class="material-symbols-outlined text-[13px]"
                        >unarchive</span
                      >
                      Restore
                    </button>
                  </form>
                {:else}
                  <form method="POST" action="?/archiveSector" use:enhance>
                    <input type="hidden" name="folder_schema" value={schema} />
                    <button
                      type="submit"
                      class="flex items-center gap-1 text-xs text-on-surface/35 font-medium
                             hover:bg-surface-variant/30 hover:text-on-surface/60
                             px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <span class="material-symbols-outlined text-[13px]"
                        >inventory_2</span
                      >
                      Archive
                    </button>
                  </form>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- FORM CARD GRID VIEW -->
    {:else if filteredForms.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <span class="material-symbols-outlined text-4xl text-on-surface/20 mb-3"
          >search_off</span
        >
        <p class="text-on-surface/40 text-sm">
          No forms match your search in
          <span class="capitalize">{fmtSector(selectedSector)}</span>.
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each filteredForms as f}
          <div
            class="rounded-2xl ambient-shadow flex flex-col overflow-hidden border transition-colors
                   {f.is_active
              ? 'bg-white border-transparent hover:border-surface-variant/40'
              : 'bg-surface-container-low border-surface-variant/30 opacity-70'}"
          >
            <!-- Card body -->
            <div class="p-5 flex flex-col gap-3 flex-1">
              <!-- Name + status -->
              <div class="flex items-start justify-between gap-2">
                <p
                  class="font-semibold text-sm leading-snug line-clamp-2
                         {f.is_active
                    ? 'text-on-surface'
                    : 'text-on-surface/50'}"
                  title={f.display_name}
                >
                  {f.display_name}
                </p>
                <span
                  class="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium {f.is_active
                    ? 'bg-secondary/10 text-secondary'
                    : 'bg-surface-variant/50 text-on-surface/40'}"
                >
                  {f.is_active ? "active" : "archived"}
                </span>
              </div>

              <!-- Meta chips -->
              <div class="flex flex-wrap gap-2">
                <span
                  class="inline-flex items-center gap-1 text-xs font-mono bg-surface-container-low
                           text-on-surface/60 px-2 py-0.5 rounded-lg"
                  title="Form key"
                >
                  {f.form_key}
                </span>
                <span
                  class="inline-flex items-center gap-1 text-xs bg-primary/8 text-primary
                           px-2 py-0.5 rounded-lg"
                >
                  v{f.current_version}
                </span>
              </div>

              <!-- Created date -->
              <p
                class="text-xs text-on-surface/40 mt-auto flex items-center gap-1"
              >
                <span class="material-symbols-outlined text-[14px]"
                  >calendar_today</span
                >
                Created {fmtDate(f.created_at)}
              </p>
            </div>

            <!-- Card footer / actions -->
            <div
              class="px-5 py-3 border-t border-surface-variant/15 flex items-center justify-between gap-1"
            >
              <!-- Archive / Restore action -->
              <div>
                {#if f.is_active}
                  <form method="POST" action="?/archiveForm" use:enhance>
                    <input type="hidden" name="id" value={f.id} />
                    <button
                      type="submit"
                      class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-on-surface/40
                               hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                      title="Archive form"
                    >
                      <span class="material-symbols-outlined text-[15px]"
                        >inventory_2</span
                      >
                      Archive
                    </button>
                  </form>
                {:else}
                  <form method="POST" action="?/unarchiveForm" use:enhance>
                    <input type="hidden" name="id" value={f.id} />
                    <button
                      type="submit"
                      class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-secondary font-medium
                               hover:bg-secondary/10 rounded-lg transition-colors"
                      title="Restore form"
                    >
                      <span class="material-symbols-outlined text-[15px]"
                        >unarchive</span
                      >
                      Restore
                    </button>
                  </form>
                {/if}
              </div>

              <!-- Export + Edit (active forms only) -->
              <div class="flex items-center gap-1">
                {#if f.is_active}
                  <a
                    href="/api/forms/{f.id}/export"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-on-surface/50
                             hover:text-secondary hover:bg-secondary/10 rounded-lg transition-colors"
                    title="Download XLSForm (.xlsx)"
                  >
                    <span class="material-symbols-outlined text-[15px]"
                      >download</span
                    >
                    Export
                  </a>
                  <a
                    href="/dashboard/forms/{f.id}"
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white
                             bg-primary hover:bg-primary-dim rounded-lg transition-colors"
                    title="Edit form"
                  >
                    <span class="material-symbols-outlined text-[15px]"
                      >edit</span
                    >
                    Edit
                  </a>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
