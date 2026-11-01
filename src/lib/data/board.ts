import type { BoardSnapshot } from '@/lib/types';

// Keeps the board live in the browser. Plain TypeScript with no framework in it:
// `useBoard` (useBoard.ts) is the thin React wrapper the UI actually uses.

export type Connection = 'connecting' | 'live' | 'polling' | 'offline';

export type BoardUpdate = { snapshot?: BoardSnapshot; connection: Connection };

const STREAM_URL = '/api/board/stream';
const POLL_URL = '/api/board';
const POLL_MS = 15_000;
const MAX_BACKOFF_MS = 30_000;
const SSE_FAILURES_BEFORE_POLLING = 3;
const RETRY_SSE_MS = 2 * 60_000; // while polling, try the stream again now and then

/**
 * Starts listening for boards and calls `onUpdate` with each new snapshot and every change
 * of connection state. Prefers SSE, falls back to polling, pauses while the tab is hidden.
 * Returns a function that stops everything.
 */
export function connectBoard(onUpdate: (update: BoardUpdate) => void): () => void {
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

	const openStream = () => {
		stop();
		es = new EventSource(STREAM_URL);
		es.onmessage = (e) => {
			sseFailures = 0;
			try {
				onUpdate({ snapshot: JSON.parse(e.data), connection: 'live' });
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
			if (sseFailures > 1) onUpdate({ connection: 'offline' });
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
			onUpdate({ snapshot: await res.json(), connection: 'polling' });
		} catch {
			onUpdate({ connection: 'offline' });
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
}
