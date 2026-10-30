import { getBoard } from '#lib/server/source.js';
import type { BoardSnapshot } from '#lib/types.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	let snapshot: BoardSnapshot | null = null;
	try {
		snapshot = await getBoard();
	} catch (err) {
		// Render the shell anyway; the client fills the board in once it connects.
		console.error('board load failed', err);
	}
	return { snapshot, now: Date.now() };
};
