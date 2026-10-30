import { describe, expect, it } from 'vitest';
import { MockBoard, POST_LEAD_MS } from './mock.js';

const START = Date.parse('2026-10-29T21:00:00Z');
const MIN = 60_000;

describe('MockBoard', () => {
	it('opens with about 25 departures over the next 3 hours', () => {
		const { departures } = new MockBoard(START).snapshot();
		expect(departures.length).toBeGreaterThanOrEqual(18);
		expect(departures.length).toBeLessThanOrEqual(35);
		for (const d of departures) {
			expect(Date.parse(d.departsAt)).toBeGreaterThan(START);
			expect(Date.parse(d.departsAt)).toBeLessThanOrEqual(START + 3 * 60 * MIN + 12 * MIN);
		}
	});

	it('has exactly one cancellation and mostly predicted tracks', () => {
		const { departures } = new MockBoard(START).snapshot();
		expect(departures.filter((d) => d.status === 'cancelled')).toHaveLength(1);
		expect(departures.some((d) => d.status === 'delayed' && d.delayMin)).toBe(true);
		const predicted = departures.filter((d) => d.track.kind === 'predicted').length;
		expect(predicted / departures.length).toBeGreaterThan(0.6);
	});

	it('posts tracks inside the posting window and drops departed trains', () => {
		const board = new MockBoard(START);
		for (let t = START; t <= START + 90 * MIN; t += MIN) {
			board.tick(t);
			for (const d of board.snapshot().departures) {
				const leaves = Date.parse(d.departsAt) + (d.delayMin ?? 0) * MIN;
				expect(leaves).toBeGreaterThan(t);
				if (d.status !== 'cancelled' && leaves - t <= POST_LEAD_MS) {
					expect(d.track.kind).toBe('posted');
				}
			}
		}
	});

	it('sometimes posts a track other than the top prediction', () => {
		const board = new MockBoard(START);
		const predictedTop = new Map<string, string>();
		let misses = 0;
		for (let t = START; t <= START + 180 * MIN; t += MIN) {
			board.tick(t);
			for (const d of board.snapshot().departures) {
				if (d.track.kind === 'predicted') predictedTop.set(d.id, d.track.tracks[0].track);
				if (d.track.kind === 'posted' && predictedTop.has(d.id)) {
					if (predictedTop.get(d.id) !== d.track.track) misses++;
					predictedTop.delete(d.id);
				}
			}
		}
		expect(misses).toBeGreaterThan(0);
	});
});
