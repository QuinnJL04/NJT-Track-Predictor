import type { Config } from '@sveltejs/adapter-vercel';
import { getBoard } from '#lib/server/source.js';
import type { RequestHandler } from './$types';

export const config: Config = { maxDuration: 60 };

const CHECK_MS = 5_000; // the source cache decides how often upstream is actually hit
const HEARTBEAT_MS = 20_000;
// End the stream ourselves before Vercel's limit; EventSource reconnects on its own.
const LIFETIME_MS = 55_000;

export const GET: RequestHandler = ({ request }) => {
	const encoder = new TextEncoder();
	let cleanup = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let last = '';
			let lastWrite = Date.now();
			let closed = false;

			const write = (chunk: string) => {
				if (closed) return;
				controller.enqueue(encoder.encode(chunk));
				lastWrite = Date.now();
			};

			const push = async () => {
				try {
					const body = JSON.stringify(await getBoard());
					if (body !== last) {
						last = body;
						write(`data: ${body}\n\n`);
					} else if (Date.now() - lastWrite > HEARTBEAT_MS) {
						write(': keep-alive\n\n');
					}
				} catch (err) {
					console.error('board stream fetch failed', err);
				}
			};

			const close = () => {
				if (closed) return;
				closed = true;
				clearInterval(timer);
				clearTimeout(end);
				request.signal.removeEventListener('abort', close);
				try {
					controller.close();
				} catch {
					// already closed by the client
				}
			};
			cleanup = close;

			write('retry: 2000\n\n');
			push();
			const timer = setInterval(push, CHECK_MS);
			const end = setTimeout(close, LIFETIME_MS);
			request.signal.addEventListener('abort', close);
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
