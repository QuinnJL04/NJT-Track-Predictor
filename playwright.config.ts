import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'phone',
			use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } }
		},
		{
			name: 'desktop',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
		}
	],
	webServer: {
		command: `npm run dev -- --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		env: { DATA_SOURCE: 'mock' },
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
