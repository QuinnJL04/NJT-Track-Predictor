import 'server-only';

// Every environment variable the server reads, checked in one place. Next.js loads `.env`
// into process.env in dev; on Vercel they come from the project settings. Nothing here is
// prefixed NEXT_PUBLIC_, so none of it can reach the browser, and `server-only` makes the
// build fail if a client component ever imports this file.

const optional = (name: string) => process.env[name] || undefined;

function dataSource(): 'mock' | 'njt' {
	const source = process.env.DATA_SOURCE || 'mock';
	if (source !== 'mock' && source !== 'njt') {
		throw new Error('DATA_SOURCE must be "mock" or "njt"');
	}
	return source;
}

/** Where the board comes from: "mock" (default) or "njt". */
export const DATA_SOURCE = dataSource();

/** NJ Transit rail API credentials. */
export const NJT_USERNAME = optional('NJT_USERNAME');
export const NJT_PASSWORD = optional('NJT_PASSWORD');
/** Optional pre-issued RailData token, seeding the shared token store. */
export const NJT_TOKEN = optional('NJT_TOKEN');

// Upstash Redis shares the NJT token, board and daily call count across serverless
// instances. Unset, each instance keeps its own in memory (fine for dev). The Vercel
// integration may name them KV_REST_API_* instead.
export const UPSTASH_REDIS_REST_URL = optional('UPSTASH_REDIS_REST_URL');
export const UPSTASH_REDIS_REST_TOKEN = optional('UPSTASH_REDIS_REST_TOKEN');
export const KV_REST_API_URL = optional('KV_REST_API_URL');
export const KV_REST_API_TOKEN = optional('KV_REST_API_TOKEN');

/** Postgres (Neon) connection string for training data; logging is off when unset. */
export const DATABASE_URL = optional('DATABASE_URL');
/** Bearer token required by /api/cron/log (Vercel Cron sends it automatically). */
export const CRON_SECRET = optional('CRON_SECRET');
