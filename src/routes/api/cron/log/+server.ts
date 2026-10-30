import { timingSafeEqual } from 'node:crypto';
import { CRON_SECRET } from '$app/env/private';
import { getDb } from '#lib/server/db.js';
import { logSnapshot } from '#lib/server/observations.js';
import { getBoard } from '#lib/server/source.js';
import type { RequestHandler } from './$types';

// Records the current board for training data. Called by Vercel Cron or an external
// scheduler with `Authorization: Bearer $CRON_SECRET`. Goes through the shared board
// cache, so it costs at most one upstream call per cache window.

function authorized(header: string | null): boolean {
	if (!CRON_SECRET || !header) return false;
	const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
	const actual = Buffer.from(header);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const GET: RequestHandler = async ({ request }) => {
	if (!authorized(request.headers.get('authorization'))) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const db = getDb();
	if (!db) return Response.json({ logged: 0, skipped: 'DATABASE_URL is not set' });

	try {
		const snapshot = await getBoard();
		const logged = await logSnapshot(db, snapshot);
		return Response.json(
			{ logged, fetchedAt: snapshot.fetchedAt },
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (err) {
		console.error('training log failed', err);
		return Response.json({ error: 'Logging failed' }, { status: 500 });
	}
};
