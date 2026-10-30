<script lang="ts" module>
	export const WINDOWS = [
		{ minutes: 30, label: '30 min', phrase: 'the next 30 minutes' },
		{ minutes: 60, label: '1 hr', phrase: 'the next hour' },
		{ minutes: 120, label: '2 hr', phrase: 'the next 2 hours' }
	] as const;
</script>

<script lang="ts">
	let { value = $bindable(60) }: { value?: number } = $props();

	function onkeydown(e: KeyboardEvent) {
		const i = WINDOWS.findIndex((w) => w.minutes === value);
		const step =
			e.key === 'ArrowRight' || e.key === 'ArrowDown'
				? 1
				: e.key === 'ArrowLeft' || e.key === 'ArrowUp'
					? -1
					: 0;
		if (!step) return;
		e.preventDefault();
		value = WINDOWS[(i + step + WINDOWS.length) % WINDOWS.length].minutes;
		(e.currentTarget as HTMLElement).querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
	}
</script>

<div class="seg" role="radiogroup" aria-label="Time window" tabindex="-1" {onkeydown}>
	{#each WINDOWS as w (w.minutes)}
		<button
			type="button"
			role="radio"
			aria-checked={value === w.minutes}
			tabindex={value === w.minutes ? 0 : -1}
			onclick={() => (value = w.minutes)}
		>
			{w.label}
		</button>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		padding: 3px;
		border-radius: 0.75rem;
		background: var(--rule);
	}

	button {
		min-width: 3.75rem;
		min-height: 2.5rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: 0.5625rem;
		background: transparent;
		color: var(--muted);
		font-size: 0.9375rem;
		font-weight: 650;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	button[aria-checked='true'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}

	button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}
</style>
