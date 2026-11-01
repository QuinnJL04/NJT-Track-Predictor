'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { BoardSnapshot, Departure } from '@/lib/types';
import { leavesAt } from '@/lib/format';
import { useBoard } from '@/lib/data/useBoard';
import { WINDOWS, useWindowMinutes, type WindowMinutes } from '@/lib/windows';
import { DepartureRow } from './DepartureRow';
import { WindowPicker } from './WindowPicker';
import styles from './Board.module.css';

// NJT's terms: when data is more than a minute old, say it may not be real time.
const STALE_MS = 60_000;
const FRESH_MS = 10_000; // how long a newly posted track pulses

type Props = {
	/** The server-rendered board, or null if the server couldn't fetch one. */
	initial: BoardSnapshot | null;
	/** The server's clock when it rendered, so the first client render matches exactly. */
	serverNow: number;
};

/** The whole interactive screen: header, live board, banners. */
export function Board({ initial, serverNow }: Props) {
	const { snapshot, connection } = useBoard(initial);
	const [windowMin, setWindowMin] = useWindowMinutes();
	const now = useClock(serverNow);
	const fresh = useJustPosted(snapshot);

	// The banner hides when dismissed, and comes back the next time the connection drops.
	const offline = connection === 'offline';
	const [dismissed, setDismissed] = useState(false);
	const [wasOffline, setWasOffline] = useState(offline);
	if (offline !== wasOffline) {
		setWasOffline(offline);
		if (!offline) setDismissed(false);
	}

	const stale = !!snapshot && now - Date.parse(snapshot.fetchedAt) > STALE_MS;
	const visible = (snapshot?.departures ?? []).filter(
		(d) => Date.parse(d.departsAt) <= now + windowMin * 60_000 && leavesAt(d) > now
	);
	const phrase = WINDOWS.find((w) => w.minutes === windowMin)?.phrase ?? 'this window';

	return (
		<>
			<Header windowMin={windowMin} onPick={setWindowMin}>
				{offline && !dismissed && (
					<div className={styles.banner} role="status">
						<span>Connection lost. Retrying…</span>
						<button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)}>
							×
						</button>
					</div>
				)}
				{stale && (
					<p className={styles.stale} role="status">
						Information may not be real time
					</p>
				)}
			</Header>

			<main className={styles.main} aria-busy={!snapshot}>
				{!snapshot ? (
					<SkeletonRows />
				) : visible.length === 0 ? (
					<p className={styles.empty}>No departures in {phrase}</p>
				) : (
					<ul className={styles.list} aria-label="Departures">
						{visible.map((d) => (
							<DepartureRow key={d.id} departure={d} fresh={fresh.has(d.id)} />
						))}
					</ul>
				)}
			</main>
		</>
	);
}

/** What shows while the server is still fetching the first board. */
export function BoardSkeleton() {
	return (
		<>
			<Header windowMin={60} onPick={() => {}} />
			<main className={styles.main} aria-busy>
				<SkeletonRows />
			</main>
		</>
	);
}

function Header({
	windowMin,
	onPick,
	children
}: {
	windowMin: WindowMinutes;
	onPick: (minutes: WindowMinutes) => void;
	children?: ReactNode;
}) {
	return (
		<header className={styles.header}>
			<div className={styles.bar}>
				<h1 className={styles.title}>
					NY Penn <span>NJ Transit</span>
				</h1>
				<WindowPicker value={windowMin} onChange={onPick} />
			</div>
			{children}
		</header>
	);
}

function SkeletonRows() {
	return (
		<ul className={styles.list} aria-label="Loading departures">
			{Array.from({ length: 7 }, (_, i) => (
				<li key={i} className={styles.skeleton}>
					<span />
					<span />
					<span />
				</li>
			))}
		</ul>
	);
}

/** The current time, ticking every 5 s. Starts from the server's clock. */
function useClock(serverNow: number) {
	const [now, setNow] = useState(serverNow);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 5_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/** IDs of trains whose track flipped to posted while the board was open, for ~10 s. */
function useJustPosted(snapshot: BoardSnapshot | null): ReadonlySet<string> {
	const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
	const [previous, setPrevious] = useState(snapshot);

	// Compare with the previous snapshot during render (React's pattern for reacting to a
	// changed value without an extra effect pass).
	if (snapshot !== previous) {
		setPrevious(snapshot);
		const before = new Map<string, Departure['track']['kind']>(
			(previous?.departures ?? []).map((d) => [d.id, d.track.kind])
		);
		const flipped = (snapshot?.departures ?? [])
			.filter((d) => d.track.kind === 'posted' && before.has(d.id) && before.get(d.id) !== 'posted')
			.map((d) => d.id);
		if (flipped.length) setFresh((current) => new Set([...current, ...flipped]));
	}

	useEffect(() => {
		if (fresh.size === 0) return;
		const timer = setTimeout(() => setFresh(new Set()), FRESH_MS);
		return () => clearTimeout(timer);
	}, [fresh]);

	return fresh;
}
