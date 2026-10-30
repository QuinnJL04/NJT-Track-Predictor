import { DATA_SOURCE } from '$app/env/private';
import type { BoardSnapshot } from '#lib/types.js';
import { MockBoard } from '#lib/data/mock.js';

export interface BoardSource {
	getBoard(): Promise<BoardSnapshot>;
}

/**
 * Shares one upstream fetch per `ttlMs` across every caller in this server instance,
 * and collapses concurrent misses into a single in-flight request.
 */
export function cached(source: BoardSource, ttlMs: number): BoardSource {
	let value: BoardSnapshot | undefined;
	let fetchedAt = 0;
	let inflight: Promise<BoardSnapshot> | undefined;

	return {
		getBoard() {
			if (value && Date.now() - fetchedAt < ttlMs) return Promise.resolve(value);
			inflight ??= source
				.getBoard()
				.then((v) => {
					value = v;
					fetchedAt = Date.now();
					return v;
				})
				.catch((err) => {
					// Serve the last good board rather than failing every client at once.
					if (value) return value;
					throw err;
				})
				.finally(() => (inflight = undefined));
			return inflight;
		}
	};
}

function mockSource(): BoardSource {
	const board = new MockBoard();
	return {
		async getBoard() {
			board.tick();
			return board.snapshot();
		}
	};
}

async function createSource(): Promise<BoardSource> {
	if (DATA_SOURCE === 'njt') {
		const { njtSource } = await import('./njt.js');
		// 20 s here + 15 s at the CDN + a 15 s poll keeps the oldest board on screen
		// under NJT's 1-minute "may not be real time" line in normal operation.
		return cached(njtSource(), 20_000);
	}
	return cached(mockSource(), 15_000);
}

let source: Promise<BoardSource> | undefined;

export async function getBoard(): Promise<BoardSnapshot> {
	source ??= createSource();
	return (await source).getBoard();
}
