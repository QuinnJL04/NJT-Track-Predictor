import { DATABASE_URL } from '$app/env/private';
import { neon } from '@neondatabase/serverless';
import type { Db } from './observations.js';

let db: Db | undefined;

/** Neon over HTTP (one round trip per query, no pool to keep warm). Undefined when unset. */
export function getDb(): Db | undefined {
	if (!DATABASE_URL) return undefined;
	if (!db) {
		const sql = neon(DATABASE_URL);
		db = { query: (text, params) => sql.query(text, params) };
	}
	return db;
}
