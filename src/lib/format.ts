import type { Departure, TrackInfo } from '#lib/types.js';

const timeParts = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/New_York',
	hour: 'numeric',
	minute: '2-digit',
	hour12: true
});

/** "7:42" and "PM", always in New York time so server and client render the same. */
export function clockTime(iso: string): { time: string; period: string } {
	const parts = timeParts.formatToParts(new Date(iso));
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return { time: `${get('hour')}:${get('minute')}`, period: get('dayPeriod') };
}

/** Below this, the board hedges between the top two tracks. */
export const CONFIDENT_P = 0.6;

/** What the predicted badge says: "7", "1–3" or "4/9". Never a percentage. */
export function predictedLabel(tracks: { track: string; p: number }[]): string {
	const [top, second] = tracks;
	if (!top) return '—';
	if (top.p >= CONFIDENT_P || !second) return top.track;
	const a = Number(top.track);
	const b = Number(second.track);
	if (Number.isInteger(a) && Number.isInteger(b) && Math.abs(a - b) <= 3) {
		return `${Math.min(a, b)}–${Math.max(a, b)}`;
	}
	return `${top.track}/${second.track}`;
}

export function trackAriaLabel(track: TrackInfo): string {
	switch (track.kind) {
		case 'posted':
			return `Track ${track.track}, posted`;
		case 'predicted':
			return `Likely track ${predictedLabel(track.tracks).replace('–', ' to ').replace('/', ' or ')}, not yet posted`;
		case 'unknown':
			return 'Track not known';
	}
}

/** When the train actually leaves, including any delay. */
export const leavesAt = (d: Departure) => Date.parse(d.departsAt) + (d.delayMin ?? 0) * 60_000;
