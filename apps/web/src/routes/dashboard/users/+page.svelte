<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  export let data: PageData;
  export let form: ActionData;

  let inviting = false;
  let showInvite = false;
  let searchQuery = '';

  // Track which user row has the password form open
  let passwordOpenId: string | null = null;
  let resettingPassword = false;

  const ROLES = ['enumerator', 'supervisor', 'admin'] as const;

  function roleLabel(r: string) {
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  function roleBadge(r: string) {
    if (r === 'admin')      return 'bg-primary/10 text-primary';
    if (r === 'supervisor') return 'bg-secondary/10 text-secondary';
    return 'bg-surface-variant/40 text-on-surface/60';
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString();
  }

  // Client-side filter: active users first, then inactive; match by email or display_name
  $: filtered = data.users
    .filter((u) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return u.email.toLowerCase().includes(q) || (u.display_name ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => Number(b.is_active) - Number(a.is_active));

  // Typed helper for password form errors (avoids union narrowing issues)
  $: pwdForm = form as { passwordError?: string; passwordUserId?: string } | null;

  // Close password form after a successful reset
  $: if (form?.passwordSuccess) passwordOpenId = null;
</script>

<div class="px-6 py-6 md:px-8 flex items-start justify-between gap-4 flex-wrap">
  <div>
    <h1 class="font-headline text-2xl font-semibold text-on-surface">User Management</h1>
    <p class="text-sm text-on-surface/50 mt-0.5">{data.users.length} organisation members</p>
  </div>
  <div class="flex items-center gap-3 flex-wrap">
    <!-- Search -->
    <div class="relative">
      <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface/40 pointer-events-none">search</span>
      <input
        type="search"
        placeholder="Search users…"
        bind:value={searchQuery}
        class="pl-9 pr-4 py-2 rounded-xl border-0 bg-surface-variant/20 text-sm focus:ring-2 focus:ring-primary w-48"
      />
    </div>
    <button
      on:click={() => (showInvite = !showInvite)}
      class="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-dark transition-colors shadow-sm"
    >
      <span class="material-symbols-outlined text-[18px]">{showInvite ? 'close' : 'person_add'}</span>
      {showInvite ? 'Cancel' : 'Invite user'}
    </button>
  </div>
</div>

<!-- Invite form -->
{#if showInvite}
  <div class="px-6 md:px-8 mb-6">
    <div class="bg-white rounded-2xl ambient-shadow p-6">
      <h2 class="font-headline font-semibold text-base text-on-surface mb-4">Invite new user</h2>

      {#if form?.inviteError}
        <div class="mb-4 px-4 py-3 bg-error/10 text-error rounded-xl text-sm">{form.inviteError}</div>
      {/if}

      <form
        method="POST"
        action="?/invite"
        use:enhance={() => {
          inviting = true;
          return async ({ update }) => {
            inviting = false;
            showInvite = false;
            await update();
          };
        }}
        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <div>
          <label for="email" class="block text-xs font-medium text-on-surface/60 mb-1">Email *</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="user@example.com"
            class="w-full rounded-xl border-0 bg-surface-variant/20 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label for="display_name" class="block text-xs font-medium text-on-surface/60 mb-1">Display name</label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            placeholder="Full name"
            class="w-full rounded-xl border-0 bg-surface-variant/20 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label for="role" class="block text-xs font-medium text-on-surface/60 mb-1">Role</label>
          <select
            id="role"
            name="role"
            class="w-full rounded-xl border-0 bg-surface-variant/20 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary"
          >
            {#each ROLES as r}
              <option value={r}>{roleLabel(r)}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="password" class="block text-xs font-medium text-on-surface/60 mb-1">Password (optional)</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Leave blank to send invite link"
            class="w-full rounded-xl border-0 bg-surface-variant/20 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary"
          />
        </div>
        <div class="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={inviting}
            class="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {#if inviting}
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            {/if}
            Create user
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Action feedback -->
{#if form?.roleError}
  <div class="mx-6 md:mx-8 mb-4 px-4 py-3 bg-error/10 text-error rounded-xl text-sm">{form.roleError}</div>
{/if}
{#if form?.deactivateError}
  <div class="mx-6 md:mx-8 mb-4 px-4 py-3 bg-error/10 text-error rounded-xl text-sm">{form.deactivateError}</div>
{/if}
{#if form?.passwordSuccess}
  <div class="mx-6 md:mx-8 mb-4 px-4 py-3 bg-secondary/10 text-secondary rounded-xl text-sm flex items-center gap-2">
    <span class="material-symbols-outlined text-[18px]">check_circle</span>
    Password updated successfully.
  </div>
{/if}

<!-- Users table -->
<div class="px-6 md:px-8 pb-10">
  <div class="bg-white rounded-2xl ambient-shadow overflow-hidden">
    {#if filtered.length === 0}
      <p class="text-center text-sm text-on-surface/40 py-12">
        {searchQuery ? 'No users match your search.' : 'No users found.'}
      </p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-on-surface/40 uppercase tracking-wider border-b border-surface-variant/20">
              <th class="px-5 py-3 font-medium">User</th>
              <th class="px-5 py-3 font-medium">Role</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium">Joined</th>
              <th class="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-variant/15">
            {#each filtered as u (u.id)}
              <tr class="hover:bg-surface-variant/10 transition-colors {u.is_active ? '' : 'opacity-60'}">
                <td class="px-5 py-3">
                  <div class="font-medium text-on-surface">{u.display_name ?? u.email}</div>
                  {#if u.display_name}
                    <div class="text-xs text-on-surface/40">{u.email}</div>
                  {/if}
                </td>
                <td class="px-5 py-3">
                  <form method="POST" action="?/changeRole" use:enhance>
                    <input type="hidden" name="id" value={u.id} />
                    <select
                      name="role"
                      on:change={(e) => e.currentTarget.form?.requestSubmit()}
                      disabled={!u.is_active}
                      class="text-xs rounded-lg border-0 px-2 py-1 font-medium {roleBadge(u.role)} focus:ring-1 focus:ring-primary cursor-pointer disabled:cursor-default"
                    >
                      {#each ROLES as r}
                        <option value={r} selected={u.role === r}>{roleLabel(r)}</option>
                      {/each}
                    </select>
                  </form>
                </td>
                <td class="px-5 py-3">
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium {u.is_active ? 'bg-secondary/10 text-secondary' : 'bg-surface-variant/30 text-on-surface/40'}">
                    {u.is_active ? 'active' : 'inactive'}
                  </span>
                </td>
                <td class="px-5 py-3 text-on-surface/50">{fmtDate(u.created_at)}</td>
                <td class="px-5 py-3">
                  <div class="flex items-center gap-3">
                    <!-- Reset password toggle -->
                    {#if u.is_active}
                      <button
                        type="button"
                        on:click={() => { passwordOpenId = passwordOpenId === u.id ? null : u.id; }}
                        class="text-xs text-primary hover:underline"
                      >
                        {passwordOpenId === u.id ? 'Cancel' : 'Reset pwd'}
                      </button>
                    {/if}
                    <!-- Deactivate -->
                    {#if u.is_active}
                      <form method="POST" action="?/deactivate" use:enhance>
                        <input type="hidden" name="id" value={u.id} />
                        <button
                          type="submit"
                          class="text-xs text-error hover:underline"
                          on:click={(e) => { if (!confirm(`Deactivate ${u.email}?`)) e.preventDefault(); }}
                        >
                          Deactivate
                        </button>
                      </form>
                    {:else}
                      <span class="text-xs text-on-surface/30">inactive</span>
                    {/if}
                  </div>
                </td>
              </tr>

              <!-- Inline password reset row -->
              {#if passwordOpenId === u.id}
                <tr class="bg-primary/3">
                  <td colspan="5" class="px-5 py-4">
                    {#if pwdForm?.passwordError && pwdForm?.passwordUserId === u.id}
                      <p class="text-xs text-error mb-2">{pwdForm.passwordError}</p>
                    {/if}
                    <form
                      method="POST"
                      action="?/setPassword"
                      use:enhance={() => {
                        resettingPassword = true;
                        return async ({ update }) => {
                          resettingPassword = false;
                          await update();
                        };
                      }}
                      class="flex items-end gap-3 flex-wrap"
                    >
                      <input type="hidden" name="id" value={u.id} />
                      <div>
                        <label class="block text-xs font-medium text-on-surface/60 mb-1" for="pwd-{u.id}">
                          New password <span class="font-normal text-on-surface/40">(min. 12 characters)</span>
                        </label>
                        <input
                          id="pwd-{u.id}"
                          name="new_password"
                          type="password"
                          minlength="12"
                          required
                          placeholder="••••••••••••"
                          class="rounded-xl border-0 bg-white shadow-sm px-4 py-2 text-sm focus:ring-2 focus:ring-primary w-64"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={resettingPassword}
                        class="px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {#if resettingPassword}
                          <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                          </svg>
                        {/if}
                        Set password
                      </button>
                    </form>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
