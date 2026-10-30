import { describe, expect, it } from 'vitest';
import { predictTrack } from './stub.js';

const base = {
	id: 'x',
	line: 'Northeast Corridor',
	lineColor: '#EF3E33',
	destination: 'Trenton',
	departsAt: '2026-10-29T21:00:00Z',
	status: 'on_time' as const
};

describe('predictTrack', () => {
	it('is deterministic per train number', () => {
		expect(predictTrack({ ...base, trainNumber: '3843' })).toEqual(
			predictTrack({ ...base, trainNumber: '3843' })
		);
	});

	it('returns three distinct tracks with probabilities summing to at most 1', () => {
		for (let n = 3000; n < 3200; n++) {
			const info = predictTrack({ ...base, trainNumber: String(n) });
			if (info.kind !== 'predicted') throw new Error('expected a prediction');
			expect(new Set(info.tracks.map((t) => t.track)).size).toBe(3);
			expect(info.tracks.reduce((s, t) => s + t.p, 0)).toBeLessThanOrEqual(1);
			expect(info.tracks[0].p).toBeGreaterThanOrEqual(info.tracks[1].p);
		}
	});

	it('leans toward tracks 1–4', () => {
		let low = 0;
		const n = 500;
		for (let i = 0; i < n; i++) {
			const info = predictTrack({ ...base, trainNumber: String(5000 + i) });
			if (info.kind === 'predicted' && Number(info.tracks[0].track) <= 4) low++;
		}
		expect(low / n).toBeGreaterThan(0.45);
	});
});
