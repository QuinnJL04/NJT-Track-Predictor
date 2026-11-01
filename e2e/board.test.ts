import { expect, test, type Page } from '@playwright/test';

const rows = (page: Page) => page.getByRole('list', { name: 'Departures' }).getByRole('listitem');

/**
 * Load the board and wait for the client to take over. The board store only opens its
 * stream once the page has hydrated, so that request is the signal the UI is live.
 */
async function openBoard(page: Page) {
	const hydrated = page.waitForRequest(
		(req) => new URL(req.url()).pathname === '/api/board/stream'
	);
	await page.goto('/');
	await hydrated;
}

test('renders departures without horizontal scroll', async ({ page }) => {
	await openBoard(page);
	await expect(rows(page).first()).toBeVisible();
	expect(await rows(page).count()).toBeGreaterThan(1);

	const { scrollWidth, clientWidth } = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth
	}));
	expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test('time window filters rows and survives a reload', async ({ page }) => {
	await openBoard(page);
	const picker = page.getByRole('radiogroup', { name: 'Time window' });

	const counts: Record<string, number> = {};
	for (const label of ['30 min', '2 hr', '1 hr']) {
		const option = picker.getByRole('radio', { name: label });
		await option.click();
		await expect(option).toHaveAttribute('aria-checked', 'true');
		counts[label] = await rows(page).count();
	}
	expect(counts['30 min']).toBeLessThan(counts['2 hr']);
	expect(counts['30 min']).toBeLessThanOrEqual(counts['1 hr']);
	expect(counts['1 hr']).toBeLessThanOrEqual(counts['2 hr']);

	await picker.getByRole('radio', { name: '2 hr' }).click();
	expect(await page.evaluate(() => localStorage.getItem('penn-track:window'))).toBe('120');

	await openBoard(page);
	await expect(picker.getByRole('radio', { name: '2 hr' })).toHaveAttribute('aria-checked', 'true');
	await expect(rows(page)).toHaveCount(counts['2 hr']);
});

test('posted and predicted tracks look different', async ({ page }) => {
	await openBoard(page);
	// The 2 hr window always holds both: tracks post about 12 minutes out.
	await page.getByRole('radio', { name: '2 hr' }).click();

	const posted = page.locator('.badge.posted');
	const predicted = page.locator('.badge.predicted');
	await expect(posted.first()).toBeVisible();
	await expect(predicted.first()).toBeVisible();

	for (const badge of await posted.all()) await expect(badge).toContainText('Trk');
	for (const badge of await predicted.all()) {
		await expect(badge).toContainText('likely');
		await expect(badge).not.toContainText('Trk');
		await expect(badge).toHaveCSS('border-top-style', 'dashed');
	}
});

test('falls back to polling when the stream is blocked', async ({ page }) => {
	await page.route('**/api/board/stream', (route) => route.abort());
	const polled = page.waitForRequest((req) => new URL(req.url()).pathname === '/api/board', {
		timeout: 15_000
	});
	await page.goto('/');
	const res = await (await polled).response();
	expect(res?.ok()).toBe(true);
	await expect(page.locator('.banner')).toBeHidden();
});

test('shows a dismissible banner when the board is unreachable', async ({ page }) => {
	await page.route('**/api/board**', (route) => route.abort());
	await page.goto('/');

	const banner = page.locator('.banner');
	await expect(banner).toBeVisible({ timeout: 10_000 });
	await expect(banner).toContainText('Connection lost');
	await banner.getByRole('button', { name: 'Dismiss' }).click();
	await expect(banner).toBeHidden();
});

test('says when the data may not be real time', async ({ page }) => {
	await page.clock.install();
	// Only the server-rendered snapshot ever arrives, so it can only get older.
	await page.route('**/api/board**', (route) => route.abort());
	await openBoard(page);
	const stale = page.locator('.stale');
	await expect(rows(page).first()).toBeVisible();
	await expect(stale).toBeHidden();

	await page.clock.fastForward('01:10');
	await expect(stale).toHaveText('Information may not be real time');
});

test('shows the disclaimer footer', async ({ page }) => {
	await page.goto('/');
	const footer = page.locator('footer');
	await expect(footer).toContainText('Not affiliated with NJ Transit');
	await expect(footer).toContainText('may be inaccurate, incomplete or delayed');
});
