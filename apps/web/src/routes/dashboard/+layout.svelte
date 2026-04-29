<script lang="ts">
  import { page } from "$app/stores";
  import type { LayoutData } from "./$types";

  export let data: LayoutData;

  // Main navigation — visible to all authenticated roles
  const mainNav = [
    { href: "/dashboard", label: "Overview", icon: "dashboard" },
    { href: "/dashboard/forms", label: "Forms", icon: "description" },
    // {
    //   href: "/dashboard/submissions",
    //   label: "Submissions",
    //   icon: "assignment",
    // },
    {
      href: "/dashboard/data-explorer",
      label: "Data Explorer",
      icon: "table",
    },
    { href: "/dashboard/indicators", label: "Indicators", icon: "analytics" },
    { href: "/dashboard/reporting", label: "Reporting", icon: "bar_chart" },
  ] as const;

  // Administration section — admin only
  const adminNav = [
    { href: "/dashboard/users", label: "Users", icon: "people" },
    { href: "/dashboard/devices", label: "Devices", icon: "phone_android" },
    { href: "/dashboard/programs", label: "Programs", icon: "work" },
  ] as const;

  $: isAdmin = data.user.role === "admin";

  $: isActive = (href: string) => {
    if (href === "/dashboard") return $page.url.pathname === "/dashboard";
    return $page.url.pathname.startsWith(href);
  };

  let sidebarOpen = false;
</script>

<div class="flex h-screen overflow-hidden bg-surface">
  <!-- --- Desktop Sidebar ---------------------------- -->
  <aside
    class="hidden md:flex flex-col w-60 shrink-0 bg-white border-r border-surface-variant/30"
  >
    <!-- Brand -->
    <a
      href="/dashboard"
      class="flex items-center gap-2.5 px-6 py-5 select-none"
    >
      <img src="/athena-logo.png" alt="Athena" class="h-8 w-auto" />
      <span
        class="font-headline font-semibold text-lg text-primary tracking-tight"
        >Athena</span
      >
    </a>

    <!-- Nav -->
    <nav class="flex-1 px-3 py-2 overflow-y-auto space-y-0.5">
      {#each mainNav as item}
        <a
          href={item.href}
          class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
            {isActive(item.href)
            ? 'bg-primary/10 text-primary'
            : 'text-on-surface/70 hover:bg-surface-variant/40 hover:text-on-surface'}"
        >
          <span class="material-symbols-outlined text-[20px] leading-none"
            >{item.icon}</span
          >
          {item.label}
        </a>
      {/each}

      <!-- Administration section (admin only) -->
      {#if isAdmin}
        <div class="pt-4 pb-1 px-3">
          <span
            class="text-[10px] font-semibold uppercase tracking-widest text-on-surface/35"
            >Administration</span
          >
        </div>
        {#each adminNav as item}
          <a
            href={item.href}
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
              {isActive(item.href)
              ? 'bg-primary/10 text-primary'
              : 'text-on-surface/70 hover:bg-surface-variant/40 hover:text-on-surface'}"
          >
            <span class="material-symbols-outlined text-[20px] leading-none"
              >{item.icon}</span
            >
            {item.label}
          </a>
        {/each}
      {/if}
    </nav>

    <!-- User + sign-out -->
    <div class="px-4 py-4 border-t border-surface-variant/30">
      <div class="text-xs text-on-surface/50 truncate mb-3 px-1">
        {data.user.email}
      </div>
      <form method="POST" action="/logout">
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-sm text-on-surface/60 hover:text-error hover:bg-error/8 rounded-xl transition-colors"
        >
          <span class="material-symbols-outlined text-[18px]">logout</span>
          Sign out
        </button>
      </form>
    </div>
  </aside>

  <!-- --- Main area ---------------------------------- -->
  <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
    <!-- Mobile header -->
    <header
      class="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-surface-variant/30 shrink-0"
    >
      <a href="/dashboard" class="flex items-center gap-2">
        <img src="/athena-logo.png" alt="Athena" class="h-8 w-auto" />
        <span class="font-headline font-semibold text-primary">Athena</span>
      </a>
      <button
        on:click={() => (sidebarOpen = !sidebarOpen)}
        class="p-2 rounded-lg text-on-surface/60 hover:bg-surface-variant/40 transition-colors"
        aria-label="Toggle menu"
      >
        <span class="material-symbols-outlined"
          >{sidebarOpen ? "close" : "menu"}</span
        >
      </button>
    </header>

    <!-- Mobile drawer -->
    {#if sidebarOpen}
      <div
        class="md:hidden fixed inset-0 z-40 bg-black/30"
        on:click={() => (sidebarOpen = false)}
        on:keydown={(e) => e.key === "Escape" && (sidebarOpen = false)}
        role="button"
        tabindex="-1"
      ></div>
      <aside
        class="md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white flex flex-col shadow-2xl"
      >
        <div class="flex items-center justify-between px-6 py-5">
          <span class="font-headline font-semibold text-lg text-primary"
            >Athena</span
          >
          <button
            on:click={() => (sidebarOpen = false)}
            class="text-on-surface/50"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <nav class="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {#each mainNav as item}
            <a
              href={item.href}
              on:click={() => (sidebarOpen = false)}
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                {isActive(item.href)
                ? 'bg-primary/10 text-primary'
                : 'text-on-surface/70 hover:bg-surface-variant/40'}"
            >
              <span class="material-symbols-outlined text-[20px]"
                >{item.icon}</span
              >
              {item.label}
            </a>
          {/each}
          {#if isAdmin}
            <div class="pt-4 pb-1 px-3">
              <span
                class="text-[10px] font-semibold uppercase tracking-widest text-on-surface/35"
                >Administration</span
              >
            </div>
            {#each adminNav as item}
              <a
                href={item.href}
                on:click={() => (sidebarOpen = false)}
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                  {isActive(item.href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-on-surface/70 hover:bg-surface-variant/40'}"
              >
                <span class="material-symbols-outlined text-[20px]"
                  >{item.icon}</span
                >
                {item.label}
              </a>
            {/each}
          {/if}
        </nav>
        <div class="px-4 py-4 border-t border-surface-variant/30">
          <form method="POST" action="/logout">
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-on-surface/60 hover:text-error rounded-xl"
            >
              <span class="material-symbols-outlined text-[18px]">logout</span>
              Sign out
            </button>
          </form>
        </div>
      </aside>
    {/if}

    <!-- Page content -->
    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</div>
