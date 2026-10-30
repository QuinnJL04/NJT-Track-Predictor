import type { BoardSource } from './source.js';

// Implemented in Phase 3.
export function njtSource(): BoardSource {
	return {
		async getBoard() {
			throw new Error('NJT source is not implemented yet');
		}
	};
}
