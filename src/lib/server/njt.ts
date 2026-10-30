import { NJT_PASSWORD, NJT_TOKEN, NJT_USERNAME } from '$app/env/private';
import type { BoardSource } from './source.js';
import { normalize, type NjtStationInfo } from './njt-normalize.js';

// NJ Transit RailData API. Every call is a multipart/form-data POST.
// NJT allows only 5 new tokens per day per account, so a token is reused for as long
// as NJT accepts it, and NJT_TOKEN can supply one so cold starts don't spend the quota.
const BASE = 'https://raildata.njtransit.com/api/TrainData';
const STATION = 'NY'; // New York Penn Station

class InvalidTokenError extends Error {}

async function post(method: string, fields: Record<string, string>): Promise<unknown> {
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

let token: string | undefined = NJT_TOKEN;
let tokenRequest: Promise<string> | undefined;

function freshToken(): Promise<string> {
	tokenRequest ??= (async () => {
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
		token = res.UserToken;
		return token;
	})().finally(() => (tokenRequest = undefined));
	return tokenRequest;
}

async function trainSchedule(): Promise<NjtStationInfo> {
	const call = async (t: string) =>
		(await post('getTrainSchedule', { token: t, station: STATION })) as NjtStationInfo;
	try {
		return await call(token ?? (await freshToken()));
	} catch (err) {
		if (!(err instanceof InvalidTokenError)) throw err;
		return call(await freshToken());
	}
}

export function njtSource(): BoardSource {
	return {
		async getBoard() {
			return normalize(await trainSchedule());
		}
	};
}
