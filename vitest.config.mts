import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
			// `server-only` throws outside Next's server bundle; tests run plain Node.
			'server-only': fileURLToPath(new URL('./src/test/empty.ts', import.meta.url))
		}
	},
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,tsx}']
	}
});
