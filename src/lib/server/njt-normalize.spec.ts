import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalize, parseNjtDate, type NjtStationInfo } from './njt-normalize.js';

const FIXTURES = join(import.meta.dirname, '../../../tests/fixtures');
const load = (name: string) =>
	JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as NjtStationInfo;

describe('parseNjtDate', () => {
	it('reads New York wall time in daylight and standard time', () => {
		expect(new Date(parseNjtDate('29-Oct-2026 07:42:00 PM')).toISOString()).toBe(
			'2026-10-29T23:42:00.000Z'
		);
		expect(new Date(parseNjtDate('05-Jan-2027 12:05:00 AM')).toISOString()).toBe(
			'2027-01-05T05:05:00.000Z'
		);
	});
});

// Hand-written to the documented response shape. Replace or add real captures
// (npm run njt:capture) alongside it; every fixture runs through the shape checks below.
describe('normalize (synthetic fixture)', () => {
	const fetchedAt = Date.parse('2026-10-29T23:40:00Z');
	const snapshot = normalize(load('njt-ny-synthetic.json'), fetchedAt);
	const { departures } = snapshot;
	const byTrain = Object.fromEntries(departures.map((d) => [d.trainNumber, d]));

	it('stamps the fetch time', () => {
		expect(snapshot.fetchedAt).toBe('2026-10-29T23:40:00.000Z');
	});

	it("passes NJT's text through unmodified apart from decoding entities", () => {
		expect(byTrain['3843'].destination).toBe('Trenton ✈');
		expect(byTrain['3843'].line).toBe('Northeast Corrdr');
		expect(byTrain['3277'].destination).toBe('Long Branch -SEC');
		expect(byTrain['3277'].line).toBe('No Jersey Coast');
	});

	it('drops Amtrak and keeps NJ Transit trains in time order', () => {
		expect(departures.map((d) => d.trainNumber)).toEqual(['3843', '3277', '6655', '6231']);
	});

	it('maps a present track to posted', () => {
		expect(byTrain['3843'].track).toEqual({ kind: 'posted', track: '7' });
		expect(byTrain['3843'].status).toBe('boarding');
		expect(byTrain['3843'].id).toBe('3843-20261029');
	});

	it('predicts when the track is missing or blank', () => {
		expect(byTrain['3277'].track.kind).toBe('predicted');
		expect(byTrain['6231'].track.kind).toBe('predicted');
	});

	it('maps lateness and cancellations', () => {
		expect(byTrain['3277']).toMatchObject({ status: 'delayed', delayMin: 8 });
		expect(byTrain['6655']).toMatchObject({ status: 'cancelled', track: { kind: 'unknown' } });
	});

	it('falls back to the line color when NJT sends none', () => {
		expect(byTrain['6231'].lineColor).toBe('#C26ED1');
		expect(byTrain['3277'].lineColor).toBe('#00A4E4');
	});
});

describe('normalize (every fixture)', () => {
	for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.json'))) {
		it(`produces valid departures from ${file}`, () => {
			const { station, departures } = normalize(load(file));
			expect(station).toBe('NY');
			for (const d of departures) {
				expect(d.trainNumber).not.toBe('');
				expect(d.destination).not.toBe('');
				expect(Number.isNaN(Date.parse(d.departsAt))).toBe(false);
				expect(d.lineColor).toMatch(/^#[0-9a-f]{6}$/i);
			}
		});
	}
});
