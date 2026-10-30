<script lang="ts">
	import { onMount } from 'svelte';
	import type { Departure } from '#lib/types.js';
	import { leavesAt } from '#lib/format.js';
	import { createBoard } from '#lib/data/board.js';
	import DepartureRow from '#lib/components/DepartureRow.svelte';
	import WindowPicker, { WINDOWS } from '#lib/components/WindowPicker.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const WINDOW_KEY = 'penn-track:window';

	// Seeded with the server-rendered snapshot, then kept live over SSE or polling.
	// The server's clock is the starting `now` so the first render hydrates cleanly.
	// svelte-ignore state_referenced_locally
	const board = createBoard(data.snapshot);
	// svelte-ignore state_referenced_locally
	let now = $state(data.now);
	let windowMin = $state(60);
	const snapshot = $derived($board.snapshot);

	let bannerDismissed = $state(false);
	const offline = $derived($board.connection === 'offline');
	$effect(() => {
		if (!offline) bannerDismissed = false;
	});

	const visible = $derived(
		(snapshot?.departures ?? []).filter(
			(d) => Date.parse(d.departsAt) <= now + windowMin * 60_000 && leavesAt(d) > now
		)
	);
	const phrase = $derived(WINDOWS.find((w) => w.minutes === windowMin)?.phrase ?? 'this window');

	// Pulse a track badge for ~10 s when it flips to posted while the board is open.
	// Plain object on purpose: this is bookkeeping, not something to render.
	let lastKind: Record<string, Departure['track']['kind']> = {};
	let fresh = $state<Record<string, true>>({});
	$effect(() => {
		const next: typeof lastKind = {};
		for (const d of snapshot?.departures ?? []) {
			next[d.id] = d.track.kind;
			const before = lastKind[d.id];
			if (d.track.kind === 'posted' && before && before !== 'posted') {
				fresh[d.id] = true;
				setTimeout(() => delete fresh[d.id], 10_000);
			}
		}
		lastKind = next;
	});

	onMount(() => {
		try {
			const saved = Number(localStorage.getItem(WINDOW_KEY));
			if (WINDOWS.some((w) => w.minutes === saved)) windowMin = saved;
		} catch {
			// storage unavailable: keep the default
		}
		now = Date.now();
		const clock = setInterval(() => (now = Date.now()), 15_000);
		return () => clearInterval(clock);
	});

	function pick(minutes: number) {
		windowMin = minutes;
		try {
			localStorage.setItem(WINDOW_KEY, String(minutes));
		} catch {
			// ignore
		}
	}
</script>

<svelte:head>
	<title>Penn Track</title>
</svelte:head>

<header>
	<div class="bar">
		<h1>NY Penn <span>NJ Transit</span></h1>
		<WindowPicker bind:value={() => windowMin, pick} />
	</div>
	{#if offline && !bannerDismissed}
		<div class="banner" role="status">
			<span>Connection lost. Retrying…</span>
			<button type="button" aria-label="Dismiss" onclick={() => (bannerDismissed = true)}>×</button>
		</div>
	{/if}
</header>

<main aria-busy={!snapshot}>
	{#if !snapshot}
		<ul class="board" aria-label="Loading departures">
			{#each { length: 7 }, i (i)}
				<li class="skeleton"><span></span><span></span><span></span></li>
			{/each}
		</ul>
	{:else if visible.length === 0}
		<p class="empty">No departures in {phrase}</p>
	{:else}
		<ul class="board" aria-label="Departures">
			{#each visible as d (d.id)}
				<DepartureRow departure={d} fresh={!!fresh[d.id]} />
			{/each}
		</ul>
	{/if}
</main>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--paper);
		border-bottom: 1px solid var(--rule);
	}

	.bar,
	main {
		max-width: var(--col);
		margin: 0 auto;
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem var(--gutter);
		padding-top: max(0.75rem, env(safe-area-inset-top));
	}

	h1 {
		margin: 0;
		font-size: 1.375rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		white-space: nowrap;
	}

	h1 span {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0;
		color: var(--muted);
	}

	main {
		padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
	}

	.banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		max-width: var(--col);
		margin: 0 auto;
		padding: 0 0.25rem 0 var(--gutter);
		background: var(--delay-bg);
		color: var(--delay-ink);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.banner button {
		width: 2.75rem;
		height: 2.75rem;
		border: 0;
		background: transparent;
		color: inherit;
		font-size: 1.25rem;
		cursor: pointer;
	}

	.board {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.empty {
		margin: 0;
		padding: 4rem var(--gutter);
		text-align: center;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--muted);
	}

	.skeleton {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr) 5.25rem;
		align-items: center;
		gap: 0.75rem;
		min-height: 4.5rem;
		padding: 0.625rem var(--gutter);
		border-bottom: 1px solid var(--rule);
	}

	.skeleton span {
		height: 1.25rem;
		border-radius: 0.375rem;
		background: var(--skeleton);
		animation: breathe 1.4s ease-in-out infinite;
	}

	.skeleton span:nth-child(2) {
		width: 70%;
	}

	.skeleton span:nth-child(3) {
		height: 3.25rem;
		border-radius: 0.625rem;
	}

	@keyframes breathe {
		50% {
			opacity: 0.55;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton span {
			animation: none;
		}
	}
</style>
