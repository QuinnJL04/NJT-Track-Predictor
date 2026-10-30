// Saves one real getTrainSchedule response for New York Penn to tests/fixtures/.
// Usage: npm run njt:capture   (reads NJT_USERNAME / NJT_PASSWORD / NJT_TOKEN from .env)
// Without NJT_TOKEN this spends one of the account's 5 daily tokens; store the
// token it reports in NJT_TOKEN to avoid that next time.
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://raildata.njtransit.com/api/TrainData';

async function post(method, fields) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.append(k, v);
	const res = await fetch(`${BASE}/${method}`, { method: 'POST', body });
	const data = await res.json();
	if (!res.ok || data?.errorMessage) {
		throw new Error(`${method}: HTTP ${res.status} ${data?.errorMessage ?? ''}`);
	}
	return data;
}

let token = process.env.NJT_TOKEN;
if (!token) {
	const { NJT_USERNAME: username, NJT_PASSWORD: password } = process.env;
	if (!username || !password) throw new Error('Set NJT_USERNAME and NJT_PASSWORD in .env');
	const res = await post('getToken', { username, password });
	if (res.Authenticated !== 'True') throw new Error('getToken: credentials rejected');
	token = res.UserToken;
	console.log('New token issued. Put it in .env as NJT_TOKEN to reuse it.');
}

const schedule = await post('getTrainSchedule', { token, station: 'NY' });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const file = `tests/fixtures/njt-ny-${stamp}.json`;
mkdirSync('tests/fixtures', { recursive: true });
writeFileSync(file, JSON.stringify(schedule, null, '\t') + '\n');
console.log(`Saved ${schedule.ITEMS?.length ?? 0} trains to ${file}`);
