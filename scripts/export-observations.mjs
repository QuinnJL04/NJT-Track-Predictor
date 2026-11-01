// Dumps track_observations to CSV for model work.
// Usage: npm run logger:export [-- out.csv]   (default: data/track_observations.csv)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set (put it in .env or the environment)');
	process.exit(1);
}
const out = process.argv[2] ?? 'data/track_observations.csv';

// Everything as text, so dates and JSON come out exactly as Postgres renders them
// rather than through the driver's Date parsing. Timestamps are UTC ISO 8601.
const iso = (col) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ${col}`;
const sql = neon(url);
const rows = await sql.query(
	`SELECT train_number, service_date::text AS service_date, line, line_color, destination,
		${iso('scheduled_departure')}, ${iso('first_seen_at')}, ${iso('last_seen_at')},
		first_prediction::text AS first_prediction, prediction_model,
		first_posted_track, ${iso('track_posted_at')}, posted_track,
		last_status, last_delay_min::text AS last_delay_min
	FROM track_observations
	ORDER BY service_date, scheduled_departure, train_number`,
	[],
	{ arrayMode: true, fullResults: true }
);

const cell = (v) => {
	if (v === null || v === undefined) return '';
	const s = String(v);
	return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const lines = [rows.fields.map((f) => f.name), ...rows.rows].map((r) => r.map(cell).join(','));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n') + '\n');
console.error(`Wrote ${rows.rows.length} rows to ${out}`);
