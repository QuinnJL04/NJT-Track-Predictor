import type { BoardSnapshot, Departure } from '#lib/types.js';
import { mulberry32, predictTrack } from '#lib/predict/stub.js';

const MIN = 60_000;
const HORIZON_MS = 3 * 60 * MIN;
export const POST_LEAD_MS = 12 * MIN; // tracks post about 12 minutes out
const BOARDING_LEAD_MS = 10 * MIN;

type Line = { name: string; color: string; firstTrain: number; destinations: string[] };

const LINES: Line[] = [
	{
		name: 'Northeast Corridor',
		color: '#EF3E33',
		firstTrain: 3801,
		destinations: ['Trenton', 'Trenton', 'New Brunswick', 'Jersey Avenue']
	},
	{
		name: 'North Jersey Coast',
		color: '#00A4E4',
		firstTrain: 3201,
		destinations: ['Long Branch', 'Long Branch', 'Bay Head', 'South Amboy']
	},
	{
		name: 'Morris & Essex',
		color: '#00A94F',
		firstTrain: 6601,
		destinations: ['Dover', 'Summit', 'Morristown', 'Hackettstown']
	},
	{
		name: 'Montclair-Boonton',
		color: '#C26ED1',
		firstTrain: 6201,
		destinations: ['Montclair State U', 'Bay Street', 'Dover']
	},
	{
		name: 'Gladstone Branch',
		color: '#A1D883',
		firstTrain: 6401,
		destinations: ['Gladstone', 'Bernardsville']
	}
];

// Rough share of Penn departures per line: NEC and NJCL dominate.
const LINE_WEIGHTS = [5, 3, 3, 1.5, 1];

type MockTrain = Omit<Departure, 'track'> & { finalTrack: string; posted: boolean };

const serviceDate = (t: number) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(t).replaceAll('-', '');

export class MockBoard {
	#rng: () => number;
	#trains: MockTrain[] = [];
	#now = 0;
	#counters = LINES.map((l) => l.firstTrain);

	constructor(now = Date.now(), seed = 7) {
		this.#rng = mulberry32(seed);
		this.#fill(now);
		// Exactly one cancellation on the opening board, somewhere past the posting window.
		const candidates = this.#trains.filter((t) => Date.parse(t.departsAt) - now > 30 * MIN);
		const victim = candidates[Math.floor(this.#rng() * candidates.length)];
		if (victim) {
			victim.status = 'cancelled';
			delete victim.delayMin;
		}
		// And at least one delay within the first hour, so the pill is always on screen.
		const soon = (t: MockTrain) => Date.parse(t.departsAt) - now < 60 * MIN;
		if (!this.#trains.some((t) => soon(t) && t.delayMin)) {
			const late = this.#trains.find(
				(t) => soon(t) && t.status !== 'cancelled' && Date.parse(t.departsAt) - now > 20 * MIN
			);
			if (late) late.delayMin = 6 + Math.floor(this.#rng() * 8);
		}
		this.tick(now);
	}

	/** Advance the board to `now`: post tracks, drop departed trains, add new ones. */
	tick(now = Date.now()) {
		this.#now = now;
		this.#trains = this.#trains.filter((t) => {
			const leaves = Date.parse(t.departsAt) + (t.delayMin ?? 0) * MIN;
			return leaves > now;
		});

		for (const t of this.#trains) {
			if (t.status === 'cancelled') continue;
			const untilDeparture = Date.parse(t.departsAt) + (t.delayMin ?? 0) * MIN - now;
			if (untilDeparture <= POST_LEAD_MS) t.posted = true;
			if (t.delayMin) t.status = 'delayed';
			else t.status = t.posted && untilDeparture <= BOARDING_LEAD_MS ? 'boarding' : 'on_time';
		}

		this.#fill(now);
	}

	snapshot(): BoardSnapshot {
		return {
			station: 'NY',
			fetchedAt: new Date(this.#now).toISOString(),
			departures: this.#trains.map(({ finalTrack, posted, ...d }) => ({
				...d,
				track:
					d.status === 'cancelled'
						? { kind: 'unknown' }
						: posted
							? { kind: 'posted', track: finalTrack }
							: predictTrack(d)
			}))
		};
	}

	#fill(now: number) {
		const last = this.#trains.at(-1);
		let t = last ? Date.parse(last.departsAt) : now + this.#between(2, 6);
		if (!last) this.#trains.push(this.#make(t));
		while (t < now + HORIZON_MS) {
			t += this.#between(3, 12);
			this.#trains.push(this.#make(t));
		}
	}

	#between(minMinutes: number, maxMinutes: number) {
		return Math.round(minMinutes + this.#rng() * (maxMinutes - minMinutes)) * MIN;
	}

	#make(at: number): MockTrain {
		const departsAt = Math.floor(at / MIN) * MIN;
		const li = this.#pickLine();
		const line = LINES[li];
		const trainNumber = String(this.#counters[li]);
		this.#counters[li] += 2;
		const base: Omit<Departure, 'track'> = {
			id: `${trainNumber}-${serviceDate(departsAt)}`,
			trainNumber,
			line: line.name,
			lineColor: line.color,
			destination: line.destinations[Math.floor(this.#rng() * line.destinations.length)],
			departsAt: new Date(departsAt).toISOString(),
			status: 'on_time'
		};

		const roll = this.#rng();
		if (roll < 0.1) {
			base.status = 'delayed';
			base.delayMin = 3 + Math.floor(this.#rng() * 13);
		} else if (roll < 0.12 && this.#trains.length > 25) {
			base.status = 'cancelled'; // rare, only on trains added later
		}

		// Usually the stub's top pick; sometimes not, so a "wrong" prediction is visible.
		const predicted = predictTrack(base);
		const top = predicted.kind === 'predicted' ? predicted.tracks[0].track : '1';
		const finalTrack =
			this.#rng() < 0.7 ? top : String(1 + ((Number(top) + Math.floor(this.#rng() * 6)) % 12));

		return { ...base, finalTrack, posted: false };
	}

	#pickLine() {
		const total = LINE_WEIGHTS.reduce((a, b) => a + b, 0);
		let r = this.#rng() * total;
		const i = LINE_WEIGHTS.findIndex((w) => (r -= w) < 0);
		return i === -1 ? 0 : i;
	}
}
