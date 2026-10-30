import { Redis } from '@upstash/redis';

/**
 * The little key-value store that serverless instances share: the NJT token, the latest
 * board and the daily call count. Values are JSON; every key expires.
 */
export interface KvStore {
	get<T>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown, ttlMs: number): Promise<void>;
	/** Atomically sets `key` only if it's absent. True means the caller now holds it (a lock). */
	setIfAbsent(key: string, value: unknown, ttlMs: number): Promise<boolean>;
	/** Atomically adds 1 and returns the new value; the key expires `ttlMs` after it's created. */
	incr(key: string, ttlMs: number): Promise<number>;
	del(key: string): Promise<void>;
}

/** One instance's memory. Used when no Redis is configured (dev, tests, a single server). */
export function memoryStore(now: () => number = Date.now): KvStore {
	const entries = new Map<string, { value: string; expiresAt: number }>();
	const live = (key: string) => {
		const entry = entries.get(key);
		if (entry && entry.expiresAt <= now()) entries.delete(key);
		return entries.get(key);
	};
	const put = (key: string, value: unknown, ttlMs: number) =>
		entries.set(key, { value: JSON.stringify(value), expiresAt: now() + ttlMs });

	return {
		async get<T>(key: string) {
			const entry = live(key);
			return entry ? (JSON.parse(entry.value) as T) : undefined;
		},
		async set(key, value, ttlMs) {
			put(key, value, ttlMs);
		},
		async setIfAbsent(key, value, ttlMs) {
			if (live(key)) return false;
			put(key, value, ttlMs);
			return true;
		},
		async incr(key, ttlMs) {
			const entry = live(key);
			const next = (entry ? (JSON.parse(entry.value) as number) : 0) + 1;
			if (entry) entry.value = JSON.stringify(next);
			else put(key, next, ttlMs);
			return next;
		},
		async del(key) {
			entries.delete(key);
		}
	};
}

/** Upstash Redis over its REST API, which works from Vercel functions without a connection pool. */
export function upstashStore(url: string, token: string): KvStore {
	// We JSON-encode ourselves, so a token that looks like a number stays a string.
	const redis = new Redis({ url, token, automaticDeserialization: false, enableTelemetry: false });

	return {
		async get<T>(key: string) {
			const raw = await redis.get<string>(key);
			return raw == null ? undefined : (JSON.parse(raw) as T);
		},
		async set(key, value, ttlMs) {
			await redis.set(key, JSON.stringify(value), { px: ttlMs });
		},
		async setIfAbsent(key, value, ttlMs) {
			return (await redis.set(key, JSON.stringify(value), { nx: true, px: ttlMs })) === 'OK';
		},
		async incr(key, ttlMs) {
			const n = await redis.incr(key);
			if (n === 1) await redis.pexpire(key, ttlMs);
			return n;
		},
		async del(key) {
			await redis.del(key);
		}
	};
}
