import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardSnapshot } from '#lib/types.js';
import { memoryStore, type KvStore } from './kv.js';
import {
	BudgetExhaustedError,
	dailyBudget,
	newYorkDay,
	sharedCached,
	sharedToken
} from './shared.js';

// Each "instance" is its own sharedCached/sharedToken wrapper (own local memory) over one
// shared in-memory store, which stands in for Redis.

let t: number;
const now = () => t;
const advance = (ms: number) => (t += ms);

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
}

/** A fake NJT with a call counter. `gate` holds calls until resolved; `fail` makes them throw. */
function fakeUpstream() {
	const upstream = {
		calls: 0,
		fail: false,
		gate: undefined as Promise<void> | undefined,
		async getBoard(): Promise<BoardSnapshot> {
			upstream.calls++;
			const fetchedAt = new Date(t).toISOString();
			await upstream.gate;
			if (upstream.fail) throw new Error('NJT is down');
			return { station: 'NY', departures: [], fetchedAt };
		}
	};
	return upstream;
}

const fast = { pollMs: 1, waitMs: 200 };

beforeEach(() => {
	t = Date.parse('2026-10-30T16:00:00Z');
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('sharedCached', () => {
	let store: KvStore;
	let upstream: ReturnType<typeof fakeUpstream>;
	const instance = () => sharedCached(upstream, store, { ttlMs: 20_000, now, ...fast });

	beforeEach(() => {
		store = memoryStore(now);
		upstream = fakeUpstream();
	});

	it('shares one fetch per 20 s across instances', async () => {
		const a = instance();
		const b = instance();

		const first = await a.getBoard();
		expect(await b.getBoard()).toEqual(first);
		advance(19_000);
		expect(await b.getBoard()).toEqual(first);
		expect(upstream.calls).toBe(1);

		advance(2_000);
		const second = await b.getBoard();
		expect(second.fetchedAt).not.toBe(first.fetchedAt);
		expect(await a.getBoard()).toEqual(second);
		expect(upstream.calls).toBe(2);
	});

	it('makes one call when many instances cold-start at once', async () => {
		const gate = deferred();
		upstream.gate = gate.promise;
		const pending = Array.from({ length: 5 }, () => instance().getBoard());
		gate.resolve();

		const boards = await Promise.all(pending);
		expect(upstream.calls).toBe(1);
		expect(new Set(boards.map((b) => b.fetchedAt)).size).toBe(1);
	});

	it('serves the stale board while another instance holds the lock', async () => {
		const first = await instance().getBoard();
		advance(21_000);
		await store.setIfAbsent('board:lock', 'elsewhere', 30_000);

		expect(await instance().getBoard()).toEqual(first);
		expect(upstream.calls).toBe(1);
	});

	it('serves the last good board when NJT fails, and holds off retries for the lock TTL', async () => {
		const a = instance();
		const first = await a.getBoard();
		advance(21_000);
		upstream.fail = true;

		expect(await a.getBoard()).toEqual(first);
		expect(await instance().getBoard()).toEqual(first);
		expect(upstream.calls).toBe(2);

		advance(30_000);
		upstream.fail = false;
		const recovered = await instance().getBoard();
		expect(recovered.fetchedAt).not.toBe(first.fetchedAt);
		expect(upstream.calls).toBe(3);
	});

	it('fails when NJT fails and there is no board to fall back on', async () => {
		upstream.fail = true;
		await expect(instance().getBoard()).rejects.toThrow('NJT is down');
	});

	it('serves the cached board once the daily budget is spent', async () => {
		const budget = dailyBudget(store, { warnAt: 1, stopAt: 1, now });
		const counted = {
			async getBoard() {
				await budget.take();
				return upstream.getBoard();
			}
		};
		const a = sharedCached(counted, store, { ttlMs: 20_000, now, ...fast });

		const first = await a.getBoard();
		advance(60_000);
		expect(await a.getBoard()).toEqual(first);
		expect(upstream.calls).toBe(1);
	});
});

describe('dailyBudget', () => {
	it('warns at warnAt and refuses calls past stopAt', async () => {
		const budget = dailyBudget(memoryStore(now), { warnAt: 3, stopAt: 5, now });

		for (let i = 0; i < 5; i++) await budget.take();
		expect(console.warn).toHaveBeenCalledTimes(1);
		await expect(budget.take()).rejects.toBeInstanceOf(BudgetExhaustedError);
		await expect(budget.take()).rejects.toBeInstanceOf(BudgetExhaustedError);
		expect(console.error).toHaveBeenCalledTimes(1);
	});

	it('resets at midnight New York time, not UTC', async () => {
		const store = memoryStore(now);
		const budget = dailyBudget(store, { stopAt: 1, now });

		t = Date.parse('2026-10-30T23:30:00Z'); // 7:30 PM Oct 30 in New York
		await budget.take();
		t = Date.parse('2026-10-31T03:59:00Z'); // still Oct 30 in New York
		await expect(budget.take()).rejects.toBeInstanceOf(BudgetExhaustedError);
		t = Date.parse('2026-10-31T04:00:00Z'); // midnight EDT
		await expect(budget.take()).resolves.toBeUndefined();
	});

	it('names the day by New York date across the DST change', () => {
		expect(newYorkDay(Date.parse('2026-10-31T03:59:00Z'))).toBe('2026-10-30');
		expect(newYorkDay(Date.parse('2026-11-02T04:30:00Z'))).toBe('2026-11-01'); // EST
		expect(newYorkDay(Date.parse('2026-11-02T05:00:00Z'))).toBe('2026-11-02');
	});
});

describe('sharedToken', () => {
	let store: KvStore;
	let issued: number;
	let gate: Promise<void> | undefined;
	let failIssue: boolean;
	const instance = (seed?: string) =>
		sharedToken(store, {
			seed,
			async issue() {
				issued++;
				await gate;
				if (failIssue) throw new Error('credentials rejected');
				return `token-${issued}`;
			},
			...fast
		});

	beforeEach(() => {
		store = memoryStore(now);
		issued = 0;
		gate = undefined;
		failIssue = false;
	});

	it('uses the NJT_TOKEN seed until the store has one', async () => {
		expect(await instance('seed').current()).toBe('seed');
		expect(await instance().current()).toBeUndefined();
		expect(issued).toBe(0);
	});

	it('lets one instance issue a token while the others wait and re-read', async () => {
		const g = deferred();
		gate = g.promise;
		const pending = Array.from({ length: 4 }, () => instance('seed').refresh('seed'));
		g.resolve();

		expect(await Promise.all(pending)).toEqual(Array(4).fill('token-1'));
		expect(issued).toBe(1);
		expect(await instance('seed').current()).toBe('token-1');
	});

	it('reuses a token another instance already refreshed', async () => {
		await instance().refresh();
		expect(await instance().refresh('stale-token')).toBe('token-1');
		expect(issued).toBe(1);

		expect(await instance().refresh('token-1')).toBe('token-2');
		expect(issued).toBe(2);
	});

	it('holds off further getToken calls after one fails', async () => {
		failIssue = true;
		await expect(instance().refresh()).rejects.toThrow('credentials rejected');
		await expect(instance().refresh()).rejects.toThrow('Timed out');
		expect(issued).toBe(1);
	});
});
