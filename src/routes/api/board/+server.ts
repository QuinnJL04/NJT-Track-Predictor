import { getBoard } from '#lib/server/source.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const snapshot = await getBoard();
		return Response.json(snapshot, {
			headers: {
				// Let Vercel's CDN share one response across all pollers and server instances.
				'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=15'
			}
		});
	} catch (err) {
		console.error('board fetch failed', err);
		return Response.json({ error: 'Board unavailable' }, { status: 503 });
	}
};
