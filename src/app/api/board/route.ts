import { connection } from 'next/server';
import { getBoard } from '@/lib/server/source';

export async function GET() {
	// Always build this at request time, never at build time: the board is live data.
	await connection();
	try {
		const snapshot = await getBoard();
		return Response.json(snapshot, {
			headers: {
				// Let Vercel's CDN share one response across all pollers and server instances.
				'cache-control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=5'
			}
		});
	} catch (err) {
		console.error('board fetch failed', err);
		return Response.json({ error: 'Board unavailable' }, { status: 503 });
	}
}
