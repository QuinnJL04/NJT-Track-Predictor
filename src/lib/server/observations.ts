import type { BoardSnapshot, Departure } from '#lib/types.js';

// Turns board snapshots into training rows (migrations/001_track_observations.sql).
// Pure apart from the injected Db, so it can be tested against an in-memory Postgres.

/** The one database call we need. Neon's `sql.query` and PGlite both fit behind it. */
export interface Db {
	query(text: string, params: unknown[]): Promise<unknown[]>;
}

/** Recorded with each prediction so later models can be told apart from the stub. */
export const PREDICTION_MODEL = 'stub';

export type ObservationRow = {
	train_number: string;
	service_date: string; // YYYY-MM-DD
	line: string;
	line_color: string;
	destination: string;
	scheduled_departure: string;
	first_seen_at: string;
	last_seen_at: string;
	first_prediction: { track: string; p: number }[] | null;
	prediction_model: string | null;
	first_posted_track: string | null;
	track_posted_at: string | null;
	posted_track: string | null;
	last_status: Departure['status'];
	last_delay_min: number | null;
};

// Matches the service date in Departure.id (see njt-normalize.ts).
const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

/** The row this departure would produce if it were the first sighting. */
export function toRow(d: Departure, fetchedAt: string): ObservationRow {
	const posted = d.track.kind === 'posted' ? d.track.track : null;
	const prediction = d.track.kind === 'predicted' ? d.track.tracks : null;
	return {
		train_number: d.trainNumber,
		service_date: nyDate.format(Date.parse(d.departsAt)),
		line: d.line,
		line_color: d.lineColor,
		destination: d.destination,
		scheduled_departure: d.departsAt,
		first_seen_at: fetchedAt,
		last_seen_at: fetchedAt,
		first_prediction: prediction,
		prediction_model: prediction ? PREDICTION_MODEL : null,
		first_posted_track: posted,
		track_posted_at: posted ? fetchedAt : null,
		posted_track: posted,
		last_status: d.status,
		last_delay_min: d.delayMin ?? null
	};
}

const COLUMNS = [
	['train_number', 'text'],
	['service_date', 'date'],
	['line', 'text'],
	['line_color', 'text'],
	['destination', 'text'],
	['scheduled_departure', 'timestamptz'],
	['first_seen_at', 'timestamptz'],
	['last_seen_at', 'timestamptz'],
	['first_prediction', 'jsonb'],
	['prediction_model', 'text'],
	['first_posted_track', 'text'],
	['track_posted_at', 'timestamptz'],
	['posted_track', 'text'],
	['last_status', 'text'],
	['last_delay_min', 'integer']
] as const satisfies readonly (readonly [keyof ObservationRow, string])[];

// A repeat sighting refreshes the board fields and status, fills in the first posted track
// once, and never touches first_seen_at or first_prediction. The WHERE skips snapshots
// older than what is stored, so re-logging a cached board is a no-op.
const ON_CONFLICT = `
ON CONFLICT (train_number, service_date) DO UPDATE SET
	line = EXCLUDED.line,
	line_color = EXCLUDED.line_color,
	destination = EXCLUDED.destination,
	scheduled_departure = EXCLUDED.scheduled_departure,
	last_seen_at = EXCLUDED.last_seen_at,
	first_posted_track = COALESCE(o.first_posted_track, EXCLUDED.first_posted_track),
	track_posted_at = COALESCE(o.track_posted_at, EXCLUDED.track_posted_at),
	posted_track = COALESCE(EXCLUDED.posted_track, o.posted_track),
	last_status = EXCLUDED.last_status,
	last_delay_min = EXCLUDED.last_delay_min
WHERE EXCLUDED.last_seen_at >= o.last_seen_at`;

/** Builds one multi-row upsert for the snapshot. Exported for tests. */
export function upsertQuery(snapshot: BoardSnapshot): { text: string; params: unknown[] } {
	// Postgres rejects an upsert that hits the same key twice, so keep the last listing.
	const rows = new Map<string, ObservationRow>();
	for (const d of snapshot.departures) {
		const row = toRow(d, snapshot.fetchedAt);
		rows.set(`${row.train_number}|${row.service_date}`, row);
	}

	const params: unknown[] = [];
	const tuples = [...rows.values()].map((row) => {
		const slots = COLUMNS.map(([name, type]) => {
			const value = row[name];
			params.push(name === 'first_prediction' && value ? JSON.stringify(value) : value);
			return `$${params.length}::${type}`;
		});
		return `(${slots.join(', ')})`;
	});

	const text =
		`INSERT INTO track_observations AS o (${COLUMNS.map(([name]) => name).join(', ')})\n` +
		`VALUES\n\t${tuples.join(',\n\t')}${ON_CONFLICT}`;
	return { text, params };
}

/** Upserts every departure on the board. Returns how many trains it wrote. */
export async function logSnapshot(db: Db, snapshot: BoardSnapshot): Promise<number> {
	if (snapshot.departures.length === 0) return 0;
	const { text, params } = upsertQuery(snapshot);
	await db.query(text, params);
	return params.length / COLUMNS.length;
}
