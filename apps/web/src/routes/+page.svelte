<script lang="ts">
  let mobileMenuOpen = false;
</script>

<svelte:head>
  <title>Athena | Precision Monitoring &amp; Evaluation</title>
  <meta
    name="description"
    content="Athena empowers global organizations to track, measure, and scale social impact with surgical accuracy."
  />
</svelte:head>

<!-- Top App Bar -->
<nav
  class="fixed top-0 w-full z-50 bg-[#f9f9ff]/80 dark:bg-[#0a0c14]/80 backdrop-blur-xl shadow-[0_12px_40px_rgba(20,49,97,0.06)]"
>
  <div class="flex justify-between items-center max-w-7xl mx-auto px-8 h-20">
    <!-- Brand -->
    <div class="flex items-center gap-3">
      <img
        src="/athena-logo.png"
        alt="Athena"
        class="h-8 w-auto mix-blend-multiply dark:mix-blend-screen"
      />
      <span
        class="text-2xl font-extrabold font-headline text-[#0056D2] dark:text-[#4d8fff] tracking-tighter"
        >Athena</span
      >
    </div>

    <!-- Desktop nav -->
    <div class="hidden md:flex items-center gap-8">
      <a
        href="/"
        class="text-[#0056D2] dark:text-[#4d8fff] border-b-2 border-[#0056D2] pb-1 font-headline font-semibold tracking-tight transition-all duration-300"
        >Home</a
      >
      <a
        href="#features"
        class="text-[#143161] dark:text-[#99b2e9] font-medium hover:text-[#0056D2] dark:hover:text-[#4d8fff] transition-all duration-300"
        >Solutions</a
      >
      <a
        href="#social-proof"
        class="text-[#143161] dark:text-[#99b2e9] font-medium hover:text-[#0056D2] dark:hover:text-[#4d8fff] transition-all duration-300"
        >Case Studies</a
      >
      <a
        href="/login"
        class="bg-gradient-primary text-on-primary px-6 py-2.5 rounded-xl font-semibold active:scale-95 transition-transform cursor-pointer"
        >Sign In</a
      >
    </div>

    <!-- Mobile menu toggle -->
    <button
      class="md:hidden material-symbols-outlined text-on-surface"
      aria-label="Toggle navigation menu"
      aria-expanded={mobileMenuOpen}
      on:click={() => (mobileMenuOpen = !mobileMenuOpen)}
    >
      {mobileMenuOpen ? "close" : "menu"}
    </button>
  </div>

  <!-- Mobile menu dropdown -->
  {#if mobileMenuOpen}
    <div
      class="md:hidden bg-[#f9f9ff]/95 backdrop-blur-xl border-t border-outline-variant/20 px-8 py-6 flex flex-col gap-6"
    >
      <a
        href="/"
        class="text-[#0056D2] font-headline font-semibold tracking-tight"
        on:click={() => (mobileMenuOpen = false)}>Home</a
      >
      <a
        href="#features"
        class="text-[#143161] font-medium hover:text-[#0056D2] transition-colors"
        on:click={() => (mobileMenuOpen = false)}>Solutions</a
      >
      <a
        href="#social-proof"
        class="text-[#143161] font-medium hover:text-[#0056D2] transition-colors"
        on:click={() => (mobileMenuOpen = false)}>Case Studies</a
      >
      <a
        href="/login"
        class="bg-gradient-primary text-on-primary px-6 py-3 rounded-xl font-semibold text-center active:scale-95 transition-transform"
        on:click={() => (mobileMenuOpen = false)}>Sign In</a
      >
    </div>
  {/if}
</nav>

<main class="pt-20">
  <!-- Hero Section -->
  <section class="relative overflow-hidden pt-16 pb-24 md:pt-32 md:pb-40">
    <div class="max-w-7xl mx-auto px-8 grid md:grid-cols-2 gap-16 items-center">
      <!-- Hero copy -->
      <div class="z-10">
        <div
          class="inline-flex items-center gap-2 px-3 py-1 bg-primary-container text-on-primary-container rounded-full text-xs font-bold tracking-widest uppercase mb-6"
        >
          <span
            class="material-symbols-outlined text-sm"
            style="font-variation-settings: 'FILL' 1;">verified</span
          >
          The New Standard in M&amp;E
        </div>

        <h1
          class="text-5xl md:text-7xl font-extrabold font-headline leading-[1.1] text-on-surface tracking-tighter mb-8"
        >
          Precision Data for <span class="text-primary">Impactful</span> Decisions
        </h1>

        <p
          class="text-lg md:text-xl text-on-surface-variant max-w-lg mb-10 leading-relaxed"
        >
          Transform complex metrics into clear narratives. Athena empowers
          global organizations to track, measure, and scale social impact with
          surgical accuracy.
        </p>

        <div class="flex flex-wrap gap-4">
          <a
            href="/login"
            class="bg-gradient-primary text-on-primary px-8 py-4 rounded-xl font-bold text-lg ambient-shadow active:scale-95 transition-transform inline-block"
            >Get Started</a
          >
          <a
            href="#features"
            class="px-8 py-4 rounded-xl border border-outline-variant text-on-surface font-bold text-lg hover:bg-surface-container-low transition-colors inline-block"
            >View Platform</a
          >
        </div>
      </div>

      <!-- Hero visual -->
      <div class="relative">
        <div
          class="absolute -inset-4 bg-primary-container/20 blur-3xl rounded-full"
        ></div>
        <div
          class="relative rounded-[32px] overflow-hidden ambient-shadow border border-white/50"
        >
          <img
            src="/dashboard-analytics-preview.jpg"
            alt="Athena M&E platform dashboard showing analytics and data visualizations"
            class="w-full h-full object-cover"
          />
          <div
            class="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent pointer-events-none"
          ></div>
        </div>

        <!-- Floating data card -->
        <div
          class="absolute -bottom-6 -left-6 glass-panel p-6 rounded-2xl ambient-shadow hidden md:block border border-white/20"
        >
          <div class="flex items-center gap-4 mb-4">
            <div class="p-3 bg-primary/10 rounded-xl">
              <span
                class="material-symbols-outlined text-primary"
                style="font-variation-settings: 'FILL' 1;">trending_up</span
              >
            </div>
            <div>
              <p
                class="text-xs font-bold text-on-surface-variant uppercase tracking-wider"
              >
                Data Accuracy
              </p>
              <p class="text-2xl font-black text-on-surface">99.9%</p>
            </div>
          </div>
          <div
            class="w-full bg-surface-container h-1.5 rounded-full overflow-hidden"
          >
            <div class="bg-primary h-full w-[99%]"></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Features Bento Grid -->
  <section id="features" class="py-24 bg-surface-container-low">
    <div class="max-w-7xl mx-auto px-8">
      <div class="text-center mb-20">
        <h2
          class="text-4xl md:text-5xl font-black font-headline tracking-tighter mb-4"
        >
          Built for Scale, Designed for Humans
        </h2>
        <p class="text-on-surface-variant text-lg max-w-2xl mx-auto">
          Precision tools that bridge the gap between field collection and
          board-room decisions.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
        <!-- Form Builder Card -->
        <div
          class="md:col-span-8 bg-surface-container-lowest p-10 rounded-[32px] ambient-shadow flex flex-col justify-between group overflow-hidden relative"
        >
          <div class="relative z-10">
            <div
              class="inline-flex p-4 bg-tertiary-container rounded-2xl mb-8 group-hover:scale-110 transition-transform duration-500"
            >
              <span
                class="material-symbols-outlined text-on-tertiary-container text-3xl"
                >dynamic_form</span
              >
            </div>
            <h3 class="text-3xl font-bold font-headline mb-4">
              XLSForm Builder
            </h3>
            <p class="text-on-surface-variant text-lg max-w-md">
              Upload and manage XLSForms with full validation. Support for
              nested repeats, skip logic, and multi-version publishing —
              distributed directly to field devices.
            </p>
          </div>
          <div class="mt-12 flex justify-end">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCnvqAipUtACCOfo5wwXAvHZSYZFlqDu2_34Yd4vM0_3kSYUIhzZu5p9wUsQpcMBBXcyiGv2eOqkI6wv6artjXqQF3H6jIggIGCrY9PTVZDxsp99ZXUWseT1oCwNb_w-3z1E8RZSzhYrOCv65a6U4ukRR7yFV7VP7yqcSvAdxft1BWeoWtz_HgozYYLQ6ewwbELke5853ArQTyGKIY8_cDDN40KX1AR_guaP82mkYU22QcoBI6Q6iRkoC1xMHVUXfQkYHfFIZELLbls"
              alt="XLSForm management interface"
              class="w-2/3 h-48 object-cover rounded-tl-3xl opacity-80"
            />
          </div>
        </div>

        <!-- Field Collection Card -->
        <div
          class="md:col-span-4 bg-surface-container-lowest p-10 rounded-[32px] ambient-shadow group"
        >
          <div
            class="inline-flex p-4 bg-primary-container rounded-2xl mb-8 group-hover:rotate-12 transition-transform duration-500"
          >
            <span
              class="material-symbols-outlined text-on-primary-container text-3xl"
              >offline_pin</span
            >
          </div>
          <h3 class="text-2xl font-bold font-headline mb-4">
            Offline Field Collection
          </h3>
          <p class="text-on-surface-variant leading-relaxed">
            Reliable offline-first Android data entry. Auto-syncs via the
            OpenRosa protocol when back in range — no data point is ever lost.
          </p>
          <div
            class="mt-8 rounded-2xl overflow-hidden grayscale group-hover:grayscale-0 transition-all duration-700"
          >
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDdx6DbUhboSSqoq9i_Ydb1oQeUqLnFn2-8VQ6H0wdwzT_9HejI4jzeYgnk0nWNFH4Reu7CxRV69VxHzbhEiWpwvFncKMFb1W79KReXHfbYAZy_jACzPAmNvFfoVZmi0yELuUIdtDqXIaOseWSK0kanY7u1CYGXnYlPy7E5dthDbh8JBe7-2LLmI-Nv8DJbm-qowj_auo3mYMEx-rJRIIRvHluVvN-VEeWczS-O8ozVv0b44YitJCNe2bARXYLZxZ5_DOpgp7o9zjhf"
              alt="Hand holding a smartphone for field data entry"
              class="w-full h-40 object-cover"
            />
          </div>
        </div>

        <!-- Analytics & DQA Card -->
        <div
          class="md:col-span-12 bg-on-surface p-10 rounded-[32px] ambient-shadow flex flex-col md:flex-row items-center gap-12 overflow-hidden relative"
        >
          <div class="flex-1 text-surface">
            <div
              class="inline-flex p-4 bg-primary/20 rounded-2xl mb-8 border border-primary/30"
            >
              <span class="material-symbols-outlined text-primary-dim text-3xl"
                >analytics</span
              >
            </div>
            <h3 class="text-3xl font-bold font-headline mb-4">
              Data Quality &amp; Reporting
            </h3>
            <p class="text-surface/70 text-lg mb-8">
              Automated 5-step DQA pipeline catches freshness violations,
              duplicates, and conflicts before they corrupt your results
              framework. Real-time indicators, geospatial maps, and ITT
              reporting — all in one place.
            </p>
            <a
              href="/login"
              class="text-primary-dim font-bold flex items-center gap-2 hover:gap-4 transition-all"
            >
              Explore the Platform <span class="material-symbols-outlined"
                >arrow_forward</span
              >
            </a>
          </div>
          <div class="flex-1 w-full">
            <div
              class="bg-surface/5 rounded-2xl p-6 backdrop-blur-md border border-surface/10"
            >
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDb9u2Ucoqg03_Qh8U-l9QPkaBbHWStxz2WDxXPcYdDmyeN4XJAL1hNH-8CJ8hKMH0n4h9Djmjg7ek3nFtZdTepJgX07Di9LYSlBY7CDv2lpfzealm47E8fDmsz13PUJGldB-D3D0hIORbxfpDmxEmZEwvpmwPYZXzwTMhaPje4gP8Ms9lty5fGYmBS9cKb7SRI5sBUes9lLmM0lrHsdcK-GJC30FqkB7FfiyinAyXi26IIBBJtOKgibUETsar80DuuPQTQF88YeW2f"
                alt="Athena data quality and reporting analytics dashboard"
                class="w-full rounded-xl"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Social Proof -->
  <section id="social-proof" class="py-24 bg-surface">
    <div class="max-w-7xl mx-auto px-8">
      <div class="text-center mb-16">
        <p
          class="text-primary font-bold tracking-widest uppercase text-sm mb-4"
        >
          Trusted Authority
        </p>
        <h2
          class="text-3xl md:text-4xl font-black font-headline text-on-surface"
        >
          Trusted by global NGOs and development agencies
        </h2>
      </div>
      <div
        class="flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-50 grayscale hover:grayscale-0 transition-all duration-500"
      >
        <div class="h-8 md:h-12 w-32 bg-on-surface/20 rounded-md"></div>
        <div class="h-8 md:h-12 w-32 bg-on-surface/20 rounded-md"></div>
        <div class="h-8 md:h-12 w-32 bg-on-surface/20 rounded-md"></div>
        <div class="h-8 md:h-12 w-32 bg-on-surface/20 rounded-md"></div>
        <div class="h-8 md:h-12 w-32 bg-on-surface/20 rounded-md"></div>
      </div>
    </div>
  </section>

  <!-- Final CTA -->
  <section class="py-24 px-8">
    <div
      class="max-w-5xl mx-auto rounded-[40px] bg-gradient-primary p-12 md:p-24 text-center relative overflow-hidden shadow-2xl"
    >
      <div
        class="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"
      ></div>
      <div
        class="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -ml-32 -mb-32"
      ></div>
      <h2
        class="text-4xl md:text-6xl font-black font-headline text-on-primary mb-8 relative z-10 leading-tight"
      >
        Start Measuring What Matters
      </h2>
      <p
        class="text-on-primary/80 text-xl max-w-2xl mx-auto mb-12 relative z-10"
      >
        Empower your mission with data that tells the whole story. Sign in and
        launch your first monitoring cycle today.
      </p>
      <div class="flex flex-col md:flex-row justify-center gap-6 relative z-10">
        <a
          href="/login"
          class="bg-surface text-primary px-10 py-5 rounded-2xl font-black text-xl hover:bg-surface-container transition-colors"
          >Sign In</a
        >
        <a
          href="mailto:contact@athena-me.org"
          class="bg-transparent text-on-primary border border-on-primary/30 px-10 py-5 rounded-2xl font-black text-xl hover:bg-white/10 transition-colors"
          >Contact Us</a
        >
      </div>
    </div>
  </section>
</main>

<!-- Footer -->
<footer class="w-full rounded-t-[32px] bg-[#f1f3ff] dark:bg-[#0d121f]">
  <div
    class="max-w-7xl mx-auto px-8 py-16 flex flex-col md:flex-row justify-between items-center gap-8"
  >
    <!-- Brand -->
    <div class="flex flex-col items-center md:items-start gap-4">
      <div class="flex items-center gap-2">
        <img
          src="/athena-logo.png"
          alt="Athena"
          class="h-8 w-auto mix-blend-multiply dark:mix-blend-screen"
        />
        <span
          class="font-headline font-bold text-[#143161] dark:text-[#f9f9ff] text-xl"
          >Athena</span
        >
      </div>
      <p class="font-body text-sm text-[#143161]/70 dark:text-[#99b2e9]/70">
        &copy; 2026 Athena. Precision in every metric.
      </p>
    </div>

    <!-- Links -->
    <div class="flex flex-wrap justify-center gap-8">
      <a
        href="#features"
        class="text-[#143161] dark:text-[#99b2e9] font-medium hover:text-[#0056D2] underline decoration-2 underline-offset-4"
        >XLSForm Builder</a
      >
      <a
        href="#features"
        class="text-[#143161] dark:text-[#99b2e9] font-medium hover:text-[#0056D2] underline decoration-2 underline-offset-4"
        >Field Collection</a
      >
      <a
        href="#features"
        class="text-[#143161] dark:text-[#99b2e9] font-medium hover:text-[#0056D2] underline decoration-2 underline-offset-4"
        >Analytics</a
      >
      <a
        href="/login"
        class="text-[#143161] dark:text-[#99b2e9] font-medium hover:text-[#0056D2] underline decoration-2 underline-offset-4"
        >Sign In</a
      >
    </div>

    <!-- Social icons -->
    <div class="flex gap-4">
      <span
        class="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors"
        >public</span
      >
      <span
        class="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors"
        >share</span
      >
    </div>
  </div>
</footer>
