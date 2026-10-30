<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '../app.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#f6f5f2" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#0e0f11" media="(prefers-color-scheme: dark)" />
	<meta name="description" content="NJ Transit departures and tracks from New York Penn Station." />
</svelte:head>

{@render children()}
