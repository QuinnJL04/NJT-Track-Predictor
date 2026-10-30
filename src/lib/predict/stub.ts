import type { Departure, TrackInfo } from '#lib/types.js';

// Placeholder until the real model exists. Deterministic per train number,
// biased toward tracks 1–4. Keep the signature stable: the model drops in here.

const TRACKS: { track: string; weight: number }[] = [
	...['1', '2', '3', '4'].map((track) => ({ track, weight: 4 })),
	...['5', '6', '7', '8', '9', '10', '11', '12'].map((track) => ({ track, weight: 1 })),
	{ track: '13', weight: 0.5 }
];

export function hash(s: string): number {
	// FNV-1a, 32-bit
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const floor2 = (n: number) => Math.floor(n * 100) / 100;

export function predictTrack(d: Omit<Departure, 'track'>): TrackInfo {
	const next = mulberry32(hash(d.trainNumber));
	const pool = [...TRACKS];
	const picks: string[] = [];
	while (picks.length < 3) {
		const total = pool.reduce((sum, t) => sum + t.weight, 0);
		let r = next() * total;
		const i = pool.findIndex((t) => (r -= t.weight) < 0);
		picks.push(pool.splice(i === -1 ? pool.length - 1 : i, 1)[0].track);
	}

	const top = 0.35 + next() * 0.5; // 0.35–0.85, so some trains fall below the 0.6 "sure" line
	const second = (1 - top) * (0.45 + next() * 0.3);
	const third = (1 - top - second) * (0.3 + next() * 0.4);
	const ps = [top, second, third].sort((a, b) => b - a);

	return {
		kind: 'predicted',
		tracks: picks.map((track, i) => ({ track, p: floor2(ps[i]) }))
	};
}
