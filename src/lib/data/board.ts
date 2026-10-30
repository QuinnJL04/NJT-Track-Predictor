import { readable, type Readable } from 'svelte/store';
import type { BoardSnapshot } from '#lib/types.js';

export type Connection = 'connecting' | 'live' | 'polling' | 'offline';

export type BoardState = {
	snapshot: BoardSnapshot | null;
	connection: Connection;
};

const STREAM_URL = '/api/board/stream';
const POLL_URL = '/api/board';
const POLL_MS = 15_000;
const MAX_BACKOFF_MS = 30_000;
const SSE_FAILURES_BEFORE_POLLING = 3;
const RETRY_SSE_MS = 2 * 60_000; // while polling, try the stream again now and then

/**
 * The board, kept live. Prefers SSE, falls back to polling, pauses while the tab is
 * hidden. The UI only ever sees snapshots and a coarse connection state.
 */
export function createBoard(initial: BoardSnapshot | null = null): Readable<BoardState> {
	let state: BoardState = { snapshot: initial, connection: 'connecting' };

	return readable(state, (set) => {
		if (typeof document === 'undefined') return; // SSR: render the initial snapshot only

		const update = (patch: Partial<BoardState>) => set((state = { ...state, ...patch }));

		let es: EventSource | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let sseFailures = 0;
		let mode: 'sse' | 'poll' = typeof EventSource === 'undefined' ? 'poll' : 'sse';
		let pollingSince = 0;

		const stop = () => {
			es?.close();
			es = undefined;
			clearTimeout(timer);
			timer = undefined;
		};

		const receive = (snapshot: BoardSnapshot, connection: Connection) =>
			update({ snapshot, connection });

		const openStream = () => {
			stop();
			es = new EventSource(STREAM_URL);
			es.onmessage = (e) => {
				sseFailures = 0;
				try {
					receive(JSON.parse(e.data), 'live');
				} catch {
					// ignore a malformed frame; the next one replaces it
				}
			};
			es.onerror = () => {
				// Take over reconnection so we control the backoff.
				stop();
				sseFailures++;
				if (sseFailures >= SSE_FAILURES_BEFORE_POLLING) {
					mode = 'poll';
					pollingSince = Date.now();
					poll();
					return;
				}
				if (sseFailures > 1) update({ connection: 'offline' });
				const backoff = Math.min(1000 * 2 ** (sseFailures - 1), MAX_BACKOFF_MS);
				timer = setTimeout(openStream, backoff * (0.75 + Math.random() * 0.5));
			};
		};

		const poll = async () => {
			stop();
			if (typeof EventSource !== 'undefined' && Date.now() - pollingSince > RETRY_SSE_MS) {
				mode = 'sse';
				sseFailures = SSE_FAILURES_BEFORE_POLLING - 1; // one strike and we're back to polling
				openStream();
				return;
			}
			try {
				const res = await fetch(POLL_URL, { cache: 'no-store' });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				receive(await res.json(), 'polling');
			} catch {
				update({ connection: 'offline' });
			}
			if (mode === 'poll' && !document.hidden) timer = setTimeout(poll, POLL_MS);
		};

		const resume = () => {
			if (document.hidden) return;
			if (mode === 'sse') openStream();
			else poll();
		};

		const onVisibility = () => (document.hidden ? stop() : resume());
		const onOnline = () => {
			sseFailures = 0;
			mode = typeof EventSource === 'undefined' ? 'poll' : 'sse';
			resume();
		};

		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('online', onOnline);
		resume();

		return () => {
			stop();
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('online', onOnline);
		};
	});
}
