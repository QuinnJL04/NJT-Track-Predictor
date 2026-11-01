import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BoardSnapshot, Departure, TrackInfo } from '#lib/types.js';
import { logSnapshot, toRow, upsertQuery, type Db } from './observations.js';

const MIGRATION = readFileSync(
	join(import.meta.dirname, '../../../migrations/001_track_observations.sql'),
	'utf8'
);

const PREDICTED: TrackInfo = {
	kind: 'predicted',
	tracks: [
		{ track: '3', p: 0.6 },
		{ track: '1', p: 0.25 }
	]
};

function departure(overrides: Partial<Departure> = {}): Departure {
	return {
		id: '3847-20261030',
		trainNumber: '3847',
		line: 'Northeast Corridor',
		lineColor: '#EF3E33',
		destination: 'Trenton &#9992',
		departsAt: '2026-10-30T23:42:00.000Z',
		status: 'on_time',
		track: PREDICTED,
		...overrides
	};
}

const board = (fetchedAt: string, ...departures: Departure[]): BoardSnapshot => ({
	station: 'NY',
	fetchedAt,
	departures
});

describe('toRow', () => {
	it('keeps the prediction on a first sighting without a posted track', () => {
		expect(toRow(departure(), '2026-10-30T23:20:00.000Z')).toEqual({
			train_number: '3847',
			service_date: '2026-10-30',
			line: 'Northeast Corridor',
			line_color: '#EF3E33',
			destination: 'Trenton &#9992',
			scheduled_departure: '2026-10-30T23:42:00.000Z',
			first_seen_at: '2026-10-30T23:20:00.000Z',
			last_seen_at: '2026-10-30T23:20:00.000Z',
			first_prediction: PREDICTED.tracks,
			prediction_model: 'stub',
			first_posted_track: null,
			track_posted_at: null,
			posted_track: null,
			last_status: 'on_time',
			last_delay_min: null
		});
	});

	it('records a posted track and when it was seen, with no prediction', () => {
		const row = toRow(
			departure({ track: { kind: 'posted', track: '7' }, status: 'delayed', delayMin: 4 }),
			'2026-10-30T23:30:00.000Z'
		);
		expect(row).toMatchObject({
			first_prediction: null,
			prediction_model: null,
			first_posted_track: '7',
			posted_track: '7',
			track_posted_at: '2026-10-30T23:30:00.000Z',
			last_status: 'delayed',
			last_delay_min: 4
		});
	});

	it('records neither for a cancelled train', () => {
		const row = toRow(departure({ status: 'cancelled', track: { kind: 'unknown' } }), 'x');
		expect(row).toMatchObject({
			first_prediction: null,
			posted_track: null,
			last_status: 'cancelled'
		});
	});

	it('uses the New York date of the scheduled departure as the service date', () => {
		// 10:30 PM on Oct 30 in New York is already Oct 31 in UTC.
		expect(toRow(departure({ departsAt: '2026-10-31T02:30:00.000Z' }), 'x').service_date).toBe(
			'2026-10-30'
		);
	});
});

describe('upsertQuery', () => {
	it('writes one tuple per train even if the board lists one twice', () => {
		const { text, params } = upsertQuery(
			board(
				'2026-10-30T23:20:00.000Z',
				departure(),
				departure({ destination: 'Trenton' }),
				departure({ trainNumber: '3851', destination: 'Long Branch' })
			)
		);
		expect(text.match(/\(\$\d+::/g)).toHaveLength(2);
		expect(params).toHaveLength(2 * 15);
		expect(params).toContain('Trenton');
		expect(params).not.toContain('Trenton &#9992');
	});
});

describe('logSnapshot (in-memory Postgres)', () => {
	let pg: PGlite;
	let db: Db;
	let queries: number;

	beforeEach(async () => {
		pg = new PGlite();
		await pg.exec(MIGRATION);
		queries = 0;
		db = {
			async query(text, params) {
				queries++;
				return (await pg.query(text, params)).rows;
			}
		};
	});

	const rows = async () =>
		(
			await pg.query<Record<string, unknown>>(
				`SELECT train_number, service_date::text, destination,
					first_seen_at, last_seen_at, first_prediction, prediction_model,
					first_posted_track, track_posted_at, posted_track, last_status, last_delay_min
				FROM track_observations ORDER BY train_number, service_date`
			)
		).rows;
	const at = (iso: string) => new Date(iso);

	it('does nothing for an empty board', async () => {
		expect(await logSnapshot(db, board('2026-10-30T23:20:00.000Z'))).toBe(0);
		expect(queries).toBe(0);
	});

	it('follows one train from first sight to a posted track in a single row', async () => {
		const t1 = '2026-10-30T23:20:00.000Z';
		const t2 = '2026-10-30T23:22:00.000Z';
		const t3 = '2026-10-30T23:30:00.000Z';
		const t4 = '2026-10-30T23:34:00.000Z';

		expect(await logSnapshot(db, board(t1, departure()))).toBe(1);
		await logSnapshot(db, board(t2, departure({ status: 'delayed', delayMin: 3 })));
		await logSnapshot(db, board(t3, departure({ track: { kind: 'posted', track: '5' } })));
		await logSnapshot(
			db,
			board(t4, departure({ track: { kind: 'posted', track: '6' }, status: 'boarding' }))
		);

		expect(await rows()).toEqual([
			{
				train_number: '3847',
				service_date: '2026-10-30',
				destination: 'Trenton &#9992',
				first_seen_at: at(t1),
				last_seen_at: at(t4),
				first_prediction: PREDICTED.tracks,
				prediction_model: 'stub',
				first_posted_track: '5',
				track_posted_at: at(t3),
				posted_track: '6',
				last_status: 'boarding',
				last_delay_min: null
			}
		]);
	});

	it('keeps the first prediction even if the predictor changes its mind', async () => {
		await logSnapshot(db, board('2026-10-30T23:20:00.000Z', departure()));
		await logSnapshot(
			db,
			board(
				'2026-10-30T23:22:00.000Z',
				departure({ track: { kind: 'predicted', tracks: [{ track: '9', p: 0.9 }] } })
			)
		);
		expect((await rows())[0].first_prediction).toEqual(PREDICTED.tracks);
	});

	it('does not regress when an older or repeated snapshot is logged', async () => {
		const posted = departure({ track: { kind: 'posted', track: '5' }, status: 'boarding' });
		await logSnapshot(db, board('2026-10-30T23:30:00.000Z', posted));
		const before = await rows();

		await logSnapshot(db, board('2026-10-30T23:30:00.000Z', posted));
		await logSnapshot(db, board('2026-10-30T23:20:00.000Z', departure()));
		expect(await rows()).toEqual(before);
	});

	it('keeps the same train number on different service days apart', async () => {
		await logSnapshot(
			db,
			board(
				'2026-10-30T23:20:00.000Z',
				departure(),
				departure({ trainNumber: '3851', departsAt: '2026-10-30T23:50:00.000Z' })
			)
		);
		await logSnapshot(
			db,
			board('2026-10-31T23:20:00.000Z', departure({ departsAt: '2026-10-31T23:42:00.000Z' }))
		);
		expect((await rows()).map((r) => `${r.train_number} ${r.service_date}`)).toEqual([
			'3847 2026-10-30',
			'3847 2026-10-31',
			'3851 2026-10-30'
		]);
	});
});
