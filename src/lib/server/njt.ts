import { NJT_PASSWORD, NJT_TOKEN, NJT_USERNAME } from '$app/env/private';
import type { BoardSource } from './source.js';
import type { KvStore } from './kv.js';
import { dailyBudget, sharedToken } from './shared.js';
import { normalize, type NjtStationInfo } from './njt-normalize.js';

// NJ Transit RailData API. Every call is a multipart/form-data POST.
// NJT allows only 5 new tokens per day per account, so the token lives in the shared
// store and is reused for as long as NJT accepts it. NJT_TOKEN seeds the store.
const BASE = 'https://raildata.njtransit.com/api/TrainData';
const STATION = 'NY'; // New York Penn Station

class InvalidTokenError extends Error {}

export function njtSource(store: KvStore): BoardSource {
	const budget = dailyBudget(store);

	async function post(method: string, fields: Record<string, string>): Promise<unknown> {
		// Every request counts toward NJT's 100,000-a-day cap, getToken included.
		await budget.take();

		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.append(k, v);

		const res = await fetch(`${BASE}/${method}`, {
			method: 'POST',
			body,
			signal: AbortSignal.timeout(10_000)
		});
		const text = await res.text();
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch {
			throw new Error(`NJT ${method}: HTTP ${res.status}, non-JSON response`);
		}

		const message = (data as { errorMessage?: string } | null)?.errorMessage;
		if (message === 'Invalid token.') throw new InvalidTokenError(message);
		if (!res.ok || message) throw new Error(`NJT ${method}: HTTP ${res.status} ${message ?? ''}`);
		return data;
	}

	const tokens = sharedToken(store, {
		seed: NJT_TOKEN,
		async issue() {
			if (!NJT_USERNAME || !NJT_PASSWORD) {
				throw new Error('NJT_USERNAME and NJT_PASSWORD are required when DATA_SOURCE=njt');
			}
			// Spends one of the account's 5 daily tokens.
			console.warn('NJT: requesting a new API token');
			const res = (await post('getToken', {
				username: NJT_USERNAME,
				password: NJT_PASSWORD
			})) as { Authenticated?: string; UserToken?: string };
			if (res.Authenticated !== 'True' || !res.UserToken) {
				throw new Error('NJT getToken: credentials rejected');
			}
			return res.UserToken;
		}
	});

	async function trainSchedule(): Promise<NjtStationInfo> {
		const call = async (t: string) =>
			(await post('getTrainSchedule', { token: t, station: STATION })) as NjtStationInfo;
		const token = (await tokens.current()) ?? (await tokens.refresh());
		try {
			return await call(token);
		} catch (err) {
			if (!(err instanceof InvalidTokenError)) throw err;
			return call(await tokens.refresh(token));
		}
	}

	return {
		async getBoard() {
			return normalize(await trainSchedule());
		}
	};
}
