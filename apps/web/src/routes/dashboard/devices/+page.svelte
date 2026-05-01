<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  export let data: PageData;
  export let form: ActionData;

  let searchQuery = '';

  $: filtered = data.devices.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.device_id.toLowerCase().includes(q) ||
      d.user_email.toLowerCase().includes(q) ||
      (d.user_display_name ?? '').toLowerCase().includes(q) ||
      (d.phone_number ?? '').includes(q)
    );
  });

  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  function fmtShortDate(iso: string) {
    return new Date(iso).toLocaleDateString();
  }

  function lastSeenLabel(iso: string | null): { text: string; cls: string } {
    if (!iso) return { text: 'Never', cls: 'text-on-surface/30' };
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return { text: 'Today', cls: 'text-secondary' };
    if (days <= 7)  return { text: `${days}d ago`, cls: 'text-on-surface/60' };
    return { text: fmtDate(iso), cls: 'text-on-surface/40' };
  }
</script>

<svelte:head>
  <title>Device Management — Athena</title>
</svelte:head>

<!-- Header -->
<div class="px-6 py-6 md:px-8 flex items-start justify-between gap-4 flex-wrap">
  <div>
    <h1 class="font-headline text-2xl font-semibold text-on-surface">Device Management</h1>
    <p class="text-sm text-on-surface/50 mt-0.5">{data.devices.length} registered device{data.devices.length !== 1 ? 's' : ''}</p>
  </div>
  <!-- Search -->
  <div class="relative">
    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface/40 pointer-events-none">search</span>
    <input
      type="search"
      placeholder="Search devices…"
      bind:value={searchQuery}
      class="pl-9 pr-4 py-2 rounded-xl border-0 bg-surface-variant/20 text-sm focus:ring-2 focus:ring-primary w-52"
    />
  </div>
</div>

<!-- Info banner -->
<div class="mx-6 md:mx-8 mb-4 px-4 py-3 bg-primary/5 rounded-xl flex items-start gap-3">
  <span class="material-symbols-outlined text-primary text-[18px] mt-0.5 shrink-0">info</span>
  <p class="text-xs text-on-surface/60">
    Devices are registered automatically when enumerators sign in on the Android app.
    Removing a device does not deactivate the user — it only clears the device record.
  </p>
</div>

<!-- Error feedback -->
{#if form?.removeError}
  <div class="mx-6 md:mx-8 mb-4 px-4 py-3 bg-error/10 text-error rounded-xl text-sm flex items-center gap-2">
    <span class="material-symbols-outlined text-[18px]">error</span>
    {form.removeError}
  </div>
{/if}

<!-- Devices table -->
<div class="px-6 md:px-8 pb-10">
  <div class="bg-white rounded-2xl ambient-shadow overflow-hidden">
    {#if data.devices.length === 0}
      <div class="flex flex-col items-center justify-center py-24 text-center">
        <span class="material-symbols-outlined text-5xl text-on-surface/20 mb-4">phone_android</span>
        <p class="font-medium text-on-surface/50 text-sm">No devices registered yet.</p>
        <p class="text-xs text-on-surface/35 mt-1">Devices appear here once enumerators log in on the Android app.</p>
      </div>
    {:else if filtered.length === 0}
      <p class="text-center text-sm text-on-surface/40 py-12">No devices match your search.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-on-surface/40 uppercase tracking-wider border-b border-surface-variant/20">
              <th class="px-5 py-3 font-medium">Device ID</th>
              <th class="px-5 py-3 font-medium">Assigned user</th>
              <th class="px-5 py-3 font-medium">Phone</th>
              <th class="px-5 py-3 font-medium">SIM serial</th>
              <th class="px-5 py-3 font-medium">Last seen</th>
              <th class="px-5 py-3 font-medium">Registered</th>
              <th class="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-variant/15">
            {#each filtered as d (d.id)}
              {@const ls = lastSeenLabel(d.last_seen_at)}
              <tr class="hover:bg-surface-variant/10 transition-colors">
                <td class="px-5 py-3 font-mono text-xs text-on-surface/70 max-w-[180px]">
                  <div class="truncate" title={d.device_id}>{d.device_id}</div>
                </td>
                <td class="px-5 py-3">
                  <div class="font-medium text-on-surface">{d.user_display_name ?? d.user_email}</div>
                  {#if d.user_display_name}
                    <div class="text-xs text-on-surface/40">{d.user_email}</div>
                  {/if}
                </td>
                <td class="px-5 py-3 text-on-surface/60">{d.phone_number ?? '—'}</td>
                <td class="px-5 py-3 font-mono text-xs text-on-surface/50">{d.sim_serial ?? '—'}</td>
                <td class="px-5 py-3 text-xs {ls.cls}">{ls.text}</td>
                <td class="px-5 py-3 text-on-surface/50">{fmtShortDate(d.registered_at)}</td>
                <td class="px-5 py-3">
                  <form method="POST" action="?/remove" use:enhance>
                    <input type="hidden" name="id" value={d.id} />
                    <button
                      type="submit"
                      class="text-xs text-error hover:underline"
                      on:click={(e) => { if (!confirm(`Remove device ${d.device_id}?`)) e.preventDefault(); }}
                    >
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
