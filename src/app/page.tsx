import { Suspense } from 'react';
import { connection } from 'next/server';
import { getBoard } from '@/lib/server/source';
import type { BoardSnapshot } from '@/lib/types';
import { Board, BoardSkeleton } from '@/components/Board';
import styles from './page.module.css';

// This file is a Server Component: it runs on the server only, so it can call getBoard()
// directly. The header, skeleton and footer are built ahead of time into a static shell
// that loads instantly; the live board streams into the <Suspense> slot per request.
export default function Page() {
	return (
		<>
			<Suspense fallback={<BoardSkeleton />}>
				<LiveBoard />
			</Suspense>
			<footer className={styles.footer}>
				Not affiliated with NJ Transit. Departures come from NJ Transit data, served from this
				site&apos;s server, and may be inaccurate, incomplete or delayed. &ldquo;Likely&rdquo;
				tracks are this site&apos;s estimates.
			</footer>
		</>
	);
}

async function LiveBoard() {
	const { snapshot, serverNow } = await loadBoard();
	return <Board initial={snapshot} serverNow={serverNow} />;
}

/** The board plus the server's clock, read once per request (never at build time). */
async function loadBoard(): Promise<{ snapshot: BoardSnapshot | null; serverNow: number }> {
	await connection();
	try {
		return { snapshot: await getBoard(), serverNow: Date.now() };
	} catch (err) {
		// Render the shell anyway; the client fills the board in once it connects.
		console.error('board load failed', err);
		return { snapshot: null, serverNow: Date.now() };
	}
}
