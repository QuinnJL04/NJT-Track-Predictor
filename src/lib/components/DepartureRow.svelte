<script lang="ts">
	import type { Departure } from '#lib/types.js';
	import { clockTime } from '#lib/format.js';
	import TrackBadge from './TrackBadge.svelte';

	let { departure: d, fresh = false }: { departure: Departure; fresh?: boolean } = $props();

	const when = $derived(clockTime(d.departsAt));
	const cancelled = $derived(d.status === 'cancelled');
</script>

<li class="row" class:cancelled>
	<div class="time">
		<span class="hm">{when.time}</span>
		<span class="period">{when.period}</span>
	</div>

	<div class="trip">
		<div class="dest">
			<span class="dot" style:background={d.lineColor} title={d.line}></span>
			<span class="name">{d.destination}</span>
		</div>
		<div class="meta">
			{#if d.status === 'delayed' && d.delayMin}
				<span class="pill delayed">Delayed {d.delayMin} min</span>
			{:else if d.status === 'cancelled'}
				<span class="pill cancelled">Cancelled</span>
			{:else if d.status === 'boarding'}
				<span class="pill boarding">Boarding</span>
			{/if}
			<span class="train"><span class="visually-hidden">{d.line} train </span>#{d.trainNumber}</span
			>
		</div>
	</div>

	<TrackBadge track={d.track} {fresh} />
</li>

<style>
	.row {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		min-height: 4.5rem;
		padding: 0.625rem var(--gutter);
		border-bottom: 1px solid var(--rule);
	}

	.time {
		display: flex;
		align-items: baseline;
		gap: 0.1875rem;
		font-variant-numeric: tabular-nums;
	}

	.hm {
		font-size: 1.375rem;
		font-weight: 750;
		letter-spacing: -0.02em;
	}

	.period {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--muted);
	}

	.trip {
		min-width: 0;
	}

	.dest {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.dot {
		flex: none;
		width: 0.625rem;
		height: 0.625rem;
		border-radius: 50%;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 1.1875rem;
		font-weight: 650;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.25rem;
		padding-left: 1.125rem;
	}

	.train {
		font-size: 0.75rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.pill {
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		font-size: 0.8125rem;
		font-weight: 700;
		white-space: nowrap;
	}

	.pill.delayed {
		background: var(--delay-bg);
		color: var(--delay-ink);
	}

	.pill.cancelled {
		background: var(--cancel-bg);
		color: var(--cancel-ink);
	}

	.pill.boarding {
		background: var(--boarding-bg);
		color: var(--boarding-ink);
	}

	.cancelled .hm,
	.cancelled .name {
		color: var(--muted);
		text-decoration: line-through;
		text-decoration-thickness: 2px;
	}
</style>
