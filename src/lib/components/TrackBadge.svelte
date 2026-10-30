<script lang="ts">
	import type { TrackInfo } from '#lib/types.js';
	import { predictedLabel, trackAriaLabel } from '#lib/format.js';

	let { track, fresh = false }: { track: TrackInfo; fresh?: boolean } = $props();
</script>

<div class="badge {track.kind}" class:fresh role="img" aria-label={trackAriaLabel(track)}>
	{#if track.kind === 'posted'}
		<span class="label">Trk</span>
		<span class="num">{track.track}</span>
	{:else if track.kind === 'predicted'}
		<span class="num">{predictedLabel(track.tracks)}</span>
		<span class="label">likely</span>
	{:else}
		<span class="num">—</span>
	{/if}
</div>

<style>
	.badge {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 5.25rem;
		height: 3.25rem;
		padding: 0 0.625rem;
		border-radius: 0.625rem;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.num {
		font-size: 1.625rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
	}

	.label {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	/* Posted: solid and loud. This is the real track. */
	.posted {
		gap: 0.375rem;
		background: var(--ink);
		color: var(--paper);
	}

	/* Predicted: dashed outline and quieter type. A guess. */
	.predicted {
		flex-direction: column;
		gap: 0.1875rem;
		border: 2px dashed var(--dash);
		color: var(--ink-2);
	}

	.predicted .num {
		font-size: 1.375rem;
		font-weight: 650;
	}

	.predicted .label {
		color: var(--muted);
		text-transform: none;
		letter-spacing: 0.02em;
		font-weight: 600;
	}

	.unknown {
		color: var(--muted);
	}

	.unknown .num {
		font-weight: 500;
	}

	.fresh {
		animation: just-posted 1.6s ease-out 6;
	}

	@keyframes just-posted {
		0% {
			box-shadow: 0 0 0 0 var(--fresh);
		}
		70% {
			box-shadow: 0 0 0 0.625rem transparent;
		}
		100% {
			box-shadow: 0 0 0 0 transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fresh {
			animation: none;
			box-shadow: 0 0 0 3px var(--fresh);
		}
	}
</style>
