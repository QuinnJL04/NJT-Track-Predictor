import type { BoardSnapshot, Departure } from '#lib/types.js';
import { predictTrack } from '#lib/predict/stub.js';

// Pure mapping from the RailData getTrainSchedule response to our contract.
// Kept apart from njt.ts so it can be tested without env vars or network.
// NJT's terms forbid modifying the data: text fields pass through as sent (only HTML
// entities are decoded for display), and we add values only where NJT gives none.

/** The subset of a getTrainSchedule ITEMS entry we read. Every value arrives as a string. */
export type NjtItem = {
	SCHED_DEP_DATE: string; // "30-Oct-2026 07:42:00 PM", New York time
	DESTINATION: string;
	TRACK?: string;
	LINE?: string;
	LINECODE?: string;
	LINEABBREVIATION?: string;
	TRAIN_ID: string;
	STATUS?: string;
	SEC_LATE?: string;
	BACKCOLOR?: string;
};

export type NjtStationInfo = {
	STATION_2CHAR?: string;
	STATIONNAME?: string;
	ITEMS?: NjtItem[] | null;
};

// Used only when NJT sends no usable BACKCOLOR.
const FALLBACK_COLORS: Record<string, string> = {
	NE: '#EF3E33',
	NC: '#00A4E4',
	ME: '#00A94F',
	MC: '#C26ED1',
	GS: '#A1D883'
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const nyParts = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/New_York',
	hourCycle: 'h23',
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: 'numeric',
	minute: 'numeric',
	second: 'numeric'
});

/** Milliseconds New York is ahead of UTC at `utcMs` (negative: -4 h or -5 h). */
function nyOffset(utcMs: number): number {
	const p = Object.fromEntries(nyParts.formatToParts(utcMs).map((x) => [x.type, x.value]));
	const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
	return asUtc - (utcMs - (utcMs % 1000));
}

/** "30-Oct-2026 07:42:00 PM" in New York time → epoch ms. */
export function parseNjtDate(s: string): number {
	const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) ([AP]M)$/.exec(s.trim());
	if (!m) throw new Error(`Unrecognized NJT date: ${s}`);
	const [, dd, mon, yyyy, hh, mi, ss, ap] = m;
	const month = MONTHS.indexOf(mon[0].toUpperCase() + mon.slice(1).toLowerCase());
	if (month < 0) throw new Error(`Unrecognized NJT month: ${mon}`);
	const hour = (+hh % 12) + (ap === 'PM' ? 12 : 0);
	const wall = Date.UTC(+yyyy, month, +dd, hour, +mi, +ss);
	// Two passes settle the offset across DST changes.
	let utc = wall - nyOffset(wall);
	utc = wall - nyOffset(utc);
	return utc;
}

const serviceDate = (t: number) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(t).replaceAll('-', '');

/** Renders HTML entities (NJT sends e.g. "&#9992" for ✈). Content is otherwise untouched. */
function decodeEntities(s: string): string {
	return s
		.replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(+n))
		.replace(/&amp;/g, '&')
		.trim();
}

function status(item: NjtItem): Pick<Departure, 'status' | 'delayMin'> {
	const text = (item.STATUS ?? '').toLowerCase();
	if (text.includes('cancel')) return { status: 'cancelled' };
	const late = Math.round(Number(item.SEC_LATE ?? 0) / 60);
	if (late >= 2 || text.includes('delay')) {
		return late >= 1 ? { status: 'delayed', delayMin: late } : { status: 'delayed' };
	}
	if (text.includes('board') || text.includes('all aboard')) return { status: 'boarding' };
	return { status: 'on_time' };
}

const isHex = (s: string | undefined): s is string => !!s && /^#[0-9a-f]{6}$/i.test(s.trim());

const isNjTransit = (item: NjtItem) => {
	const line = `${item.LINE ?? ''} ${item.LINEABBREVIATION ?? ''} ${item.LINECODE ?? ''}`;
	return !/amtrak|amtk|^\s*AM\s*$/i.test(line);
};

export function normalize(info: NjtStationInfo, fetchedAt = Date.now()): BoardSnapshot {
	const departures: Departure[] = [];
	for (const item of info.ITEMS ?? []) {
		if (!item?.TRAIN_ID || !item.SCHED_DEP_DATE || !isNjTransit(item)) continue;

		const departsAtMs = parseNjtDate(item.SCHED_DEP_DATE);
		const fallbackColor = FALLBACK_COLORS[(item.LINECODE ?? '').trim().toUpperCase()];
		const trainNumber = item.TRAIN_ID.trim();

		const base: Omit<Departure, 'track'> = {
			id: `${trainNumber}-${serviceDate(departsAtMs)}`,
			trainNumber,
			line: decodeEntities(item.LINE ?? ''),
			lineColor: isHex(item.BACKCOLOR) ? item.BACKCOLOR.trim() : (fallbackColor ?? '#8C9097'),
			destination: decodeEntities(item.DESTINATION ?? ''),
			departsAt: new Date(departsAtMs).toISOString(),
			...status(item)
		};

		const track = item.TRACK?.trim();
		departures.push({
			...base,
			track:
				base.status === 'cancelled'
					? { kind: 'unknown' }
					: track
						? { kind: 'posted', track }
						: predictTrack(base)
		});
	}

	departures.sort((a, b) => Date.parse(a.departsAt) - Date.parse(b.departsAt));
	return { station: 'NY', fetchedAt: new Date(fetchedAt).toISOString(), departures };
}
