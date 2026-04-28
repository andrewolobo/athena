<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	export let form: ActionData;

	let showPassword = false;
	let loading = false;
</script>

<svelte:head>
	<title>Sign In — Athena</title>
</svelte:head>

<div class="bg-background text-on-background min-h-screen flex flex-col">
	<!-- Minimal header — no nav links on transactional pages -->
	<header class="w-full sticky top-0 z-50 bg-surface">
		<div class="flex justify-between items-center px-6 py-4 max-w-screen-2xl mx-auto">
			<a href="/" class="flex items-center gap-2">
				<img src="/athena-logo.png" alt="Athena" class="h-8 w-auto" />
				<span class="text-[#0056D2] font-headline font-extrabold text-xl tracking-tighter"
					>Athena</span
				>
			</a>
			<span class="hidden md:block text-xs font-label uppercase tracking-widest text-on-surface-variant opacity-60"
				>Authentication Secure</span
			>
		</div>
	</header>

	<!-- Login canvas -->
	<main class="flex-grow flex items-center justify-center px-4 py-12 md:py-24">
		<div class="w-full max-w-[440px]">
			<!-- Progress ribbon -->
			<div class="h-1 w-24 bg-gradient-to-r from-primary to-primary-dim rounded-full mb-8"></div>

			<div class="bg-surface-container-lowest ambient-shadow rounded-xl p-8 md:p-10">
				<div class="mb-10">
					<h1 class="font-headline font-bold text-3xl text-on-surface tracking-tight mb-2">
						Welcome Back
					</h1>
					<p class="text-on-surface-variant font-body text-sm leading-relaxed">
						Enter your credentials to access the platform.
					</p>
				</div>

				<!-- Error banner -->
				{#if form?.error}
					<div
						class="flex items-start gap-3 mb-6 px-4 py-3 rounded-lg bg-error/10 text-error"
						role="alert"
					>
						<span class="material-symbols-outlined text-lg mt-px flex-shrink-0">error</span>
						<p class="text-sm font-medium">{form.error}</p>
					</div>
				{/if}

				<form
					method="POST"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="space-y-6"
					novalidate
				>
					<!-- Email -->
					<div class="space-y-2">
						<label
							for="email"
							class="block font-label text-xs font-semibold text-on-surface uppercase tracking-wider"
						>
							Email address
						</label>
						<input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							placeholder="name@organisation.org"
							class="w-full px-4 py-3.5 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary text-on-surface placeholder:text-outline-variant/60 transition-all duration-200"
						/>
					</div>

					<!-- Password -->
					<div class="space-y-2">
						<div class="flex justify-between items-center">
							<label
								for="password"
								class="block font-label text-xs font-semibold text-on-surface uppercase tracking-wider"
							>
								Password
							</label>
						</div>
						<div class="relative group">
							<input
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								autocomplete="current-password"
								required
								placeholder="••••••••"
								class="w-full px-4 py-3.5 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary text-on-surface placeholder:text-outline-variant/60 transition-all duration-200 pr-20"
							/>
							<button
								type="button"
								on:click={() => (showPassword = !showPassword)}
								class="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-on-surface-variant transition-colors flex items-center gap-1"
								aria-label={showPassword ? 'Hide password' : 'Show password'}
							>
								<span class="text-[10px] font-bold uppercase tracking-tighter">
									{showPassword ? 'Hide' : 'Show'}
								</span>
								<span class="material-symbols-outlined text-sm">
									{showPassword ? 'visibility_off' : 'visibility'}
								</span>
							</button>
						</div>
					</div>

					<!-- Submit -->
					<button
						type="submit"
						disabled={loading}
						class="w-full py-4 bg-gradient-to-br from-primary to-primary-dim text-white font-headline font-bold rounded-lg shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center gap-2"
					>
						{#if loading}
							<span
								class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
							></span>
							Signing in…
						{:else}
							Sign In
						{/if}
					</button>
				</form>
			</div>

			<!-- Security trust marks -->
			<div
				class="mt-8 flex justify-center items-center gap-6 opacity-40 grayscale hover:grayscale-0 transition-all duration-500"
			>
				<span class="material-symbols-outlined text-xl text-on-surface-variant">verified_user</span>
				<span class="material-symbols-outlined text-xl text-on-surface-variant">lock</span>
				<span class="material-symbols-outlined text-xl text-on-surface-variant">shield</span>
			</div>
		</div>
	</main>

	<!-- Footer -->
	<footer class="bg-transparent">
		<div
			class="flex flex-col md:flex-row justify-between items-center px-8 py-6 w-full max-w-7xl mx-auto gap-4"
		>
			<p class="font-body text-xs tracking-wide text-secondary">
				&copy; 2026 Athena. Precision in every metric.
			</p>
			<div class="flex gap-6">
				<a
					href="#"
					class="text-secondary hover:text-primary transition-colors text-xs font-medium">Security</a
				>
				<a
					href="#"
					class="text-secondary hover:text-primary transition-colors text-xs font-medium"
					>Privacy Policy</a
				>
				<a
					href="#"
					class="text-secondary hover:text-primary transition-colors text-xs font-medium"
					>Terms of Service</a
				>
			</div>
		</div>
	</footer>
</div>
