import type { BoardSnapshot } from '#lib/types.js';
import type { KvStore } from './kv.js';
import type { BoardSource } from './source.js';

// Coordination between serverless instances through a KvStore, so that cold starts and
// scale-out don't multiply NJT calls or spend the 5-a-day token quota.

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Clock = { now?: () => number };
type Waiting = {
	/** How long a lock lives. A failed holder keeps it, so this is also the retry cooldown. */
	lockTtlMs?: number;
	/** How long to wait for another instance's result when there's nothing to serve yet. */
	waitMs?: number;
	pollMs?: number;
};

/**
 * Shares one upstream fetch per `ttlMs` across every instance using `store`. A stored board
 * younger than `ttlMs` (by its `fetchedAt`) is served as is. Otherwise the instance that wins
 * the lock fetches, and the rest serve the stored board meanwhile. If the fetch fails, the
 * last good board is served and the lock is left to expire, so nobody retries straight away.
 */
export function sharedCached(
	source: BoardSource,
	store: KvStore,
	{
		ttlMs,
		key = 'board',
		lockTtlMs = 30_000,
		waitMs = 15_000,
		pollMs = 250,
		now = Date.now
	}: { ttlMs: number; key?: string } & Waiting & Clock
): BoardSource {
	const lockKey = `${key}:lock`;
	const age = (b: BoardSnapshot) => now() - Date.parse(b.fetchedAt);
	const isFresh = (b: BoardSnapshot | undefined): b is BoardSnapshot => !!b && age(b) < ttlMs;
	const newest = (a: BoardSnapshot | undefined, b: BoardSnapshot | undefined) =>
		a && b ? (age(a) <= age(b) ? a : b) : (a ?? b);

	// A per-instance copy, so callers between refreshes (SSE checks every 5 s) cost nothing.
	let local: BoardSnapshot | undefined;
	let inflight: Promise<BoardSnapshot> | undefined;

	async function waitForBoard(): Promise<BoardSnapshot> {
		const deadline = Date.now() + waitMs;
		while (Date.now() < deadline) {
			await sleep(pollMs);
			const board = await store.get<BoardSnapshot>(key);
			if (board) return board;
		}
		throw new Error('Timed out waiting for another instance to fetch the board');
	}

	async function refresh(): Promise<BoardSnapshot> {
		const stored = newest(local, await store.get<BoardSnapshot>(key));
		if (isFresh(stored)) return stored;

		if (!(await store.setIfAbsent(lockKey, now(), lockTtlMs))) {
			// Another instance is fetching (or cooling down after a failure).
			return stored ?? waitForBoard();
		}
		let board: BoardSnapshot;
		try {
			board = await source.getBoard();
		} catch (err) {
			// Serve the last good board rather than failing every client at once.
			if (stored) {
				console.error('board fetch failed; serving the last good board', err);
				return stored;
			}
			throw err;
		}
		// Kept well past ttlMs so it can stand in when NJT is down or the budget is spent.
		await store.set(key, board, DAY_MS);
		await store.del(lockKey);
		return board;
	}

	return {
		getBoard() {
			if (isFresh(local)) return Promise.resolve(local);
			inflight ??= refresh()
				.then((board) => (local = newest(local, board)) as BoardSnapshot)
				.catch((err) => {
					if (local) return local;
					throw err;
				})
				.finally(() => (inflight = undefined));
			return inflight;
		}
	};
}

/**
 * The NJT token, shared by every instance. `seed` (NJT_TOKEN) is used until the store has
 * one. Only the instance holding the lock calls `issue`; the others wait and re-read.
 */
export function sharedToken(
	store: KvStore,
	{
		issue,
		seed,
		key = 'njt:token',
		ttlMs = 30 * DAY_MS,
		lockTtlMs = 30_000,
		waitMs = 20_000,
		pollMs = 250
	}: { issue: () => Promise<string>; seed?: string; key?: string; ttlMs?: number } & Waiting
) {
	const lockKey = `${key}:lock`;
	const current = async () => (await store.get<string>(key)) ?? seed;

	return {
		current,
		/** A token other than `rejected`, issuing a new one only if no instance already has. */
		async refresh(rejected?: string): Promise<string> {
			const deadline = Date.now() + waitMs;
			for (;;) {
				const token = await current();
				if (token && token !== rejected) return token;

				if (await store.setIfAbsent(lockKey, Date.now(), lockTtlMs)) {
					const again = await store.get<string>(key);
					if (again && again !== rejected) {
						await store.del(lockKey);
						return again;
					}
					// On failure the lock stays until it expires: at most one getToken per lockTtlMs.
					const fresh = await issue();
					await store.set(key, fresh, ttlMs);
					await store.del(lockKey);
					return fresh;
				}
				if (Date.now() >= deadline) {
					throw new Error('Timed out waiting for another instance to get an NJT token');
				}
				await sleep(pollMs);
			}
		}
	};
}

export class BudgetExhaustedError extends Error {}

/** Today's date in New York as YYYY-MM-DD; NJT's daily limits follow its own calendar day. */
export function newYorkDay(ms: number): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(ms);
}

/**
 * Counts upstream calls per New York calendar day across instances. Warns at `warnAt` and
 * refuses calls past `stopAt` (NJT's agreement caps use at 100,000 requests a day).
 * Refused attempts are counted too, so the day's count can exceed `stopAt`.
 */
export function dailyBudget(
	store: KvStore,
	{
		warnAt = 80_000,
		stopAt = 95_000,
		key = 'njt:calls',
		now = Date.now
	}: { warnAt?: number; stopAt?: number; key?: string } & Clock = {}
) {
	return {
		async take(): Promise<void> {
			const day = newYorkDay(now());
			const n = await store.incr(`${key}:${day}`, 2 * DAY_MS);
			if (n > stopAt) {
				if (n === stopAt + 1) {
					console.error(`NJT: ${stopAt} calls on ${day}; serving cached boards until midnight`);
				}
				throw new BudgetExhaustedError(`NJT daily call budget (${stopAt}) used up for ${day}`);
			}
			if (n === warnAt) console.warn(`NJT: ${warnAt} calls on ${day} (stopping at ${stopAt})`);
		}
	};
}
