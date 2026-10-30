export type TrackInfo =
	| { kind: 'posted'; track: string } // official, announced
	| { kind: 'predicted'; tracks: { track: string; p: number }[] } // top 1–3, p sums ≤ 1
	| { kind: 'unknown' };

export type Departure = {
	id: string; // stable key: train number + service date
	trainNumber: string;
	line: string; // e.g. "Northeast Corridor"
	lineColor: string; // hex, for a small color dot
	destination: string; // e.g. "Trenton"
	departsAt: string; // ISO timestamp (scheduled)
	status: 'on_time' | 'delayed' | 'boarding' | 'cancelled';
	delayMin?: number;
	track: TrackInfo;
};

export type BoardSnapshot = {
	station: 'NY';
	departures: Departure[];
};
