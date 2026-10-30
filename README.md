# Penn Track

NJ Transit departures from New York Penn Station, with the track: posted when NJT has
announced it, predicted when it hasn't. One screen, built for a phone.

SvelteKit 3 + TypeScript, deployed to Vercel. The predictor is a deterministic stub
(`src/lib/predict/stub.ts`) until the real model exists.

## Develop

Needs Node 22+.

```bash
npm install
cp .env.example .env
npm run dev
```

`DATA_SOURCE=mock` (the default) serves a simulated board that advances in real time:
tracks post about 12 minutes before departure, and some post to a track other than the
top prediction.

```bash
npm test        # unit tests (mock board, stub, NJT normalize)
npm run check   # svelte-check / TypeScript
npm run lint
```

## How it fits together

| Path                                     | What                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| `src/lib/types.ts`                       | The data contract: `Departure`, `TrackInfo`, `BoardSnapshot`   |
| `src/lib/server/source.ts`               | Picks mock or NJT by `DATA_SOURCE`, shares one cached fetch    |
| `src/lib/server/njt.ts`                  | RailData client: token reuse and refresh, `getTrainSchedule`   |
| `src/lib/server/njt-normalize.ts`        | NJT response → `Departure[]`                                   |
| `src/routes/api/board/+server.ts`        | JSON snapshot (CDN-cached 15 s)                                |
| `src/routes/api/board/stream/+server.ts` | SSE: pushes a snapshot when it changes, closes itself at 55 s  |
| `src/lib/data/board.ts`                  | Client store: SSE with backoff → polling fallback, tab-pausing |

## Real NJT data

1. Register at <https://developer.njtransit.com> and accept the data access agreement.
2. Put the rail API credentials in `.env` (and in Vercel's project env vars):
   `NJT_USERNAME`, `NJT_PASSWORD`, then `DATA_SOURCE=njt`.
3. Capture a real response as a test fixture: `npm run njt:capture`. It writes to
   `tests/fixtures/`, and `npm test` runs every fixture through `normalize()`.

### Limits

- **Tokens: 5 per account per day.** The server keeps its token for as long as NJT accepts
  it and only calls `getToken` again on `Invalid token.`. Serverless cold starts would
  each spend a token, so on Vercel set `NJT_TOKEN` to a token you already have
  (`npm run njt:capture` prints when it issues one).
- **Schedule calls:** the server fetches `getTrainSchedule` at most once per 30 s per
  instance (about 2,880 calls a day if one instance stays warm). `/api/board` is also
  CDN-cached, so pollers don't add upstream calls. NJT's daily quota for
  `getTrainSchedule` wasn't verifiable without an account; check it in the developer
  portal and record it here. (Some other RailData methods, such as `getStationSchedule`,
  are limited to 5–10 calls a day.)

### Unverified until there is an account

The endpoint names, multipart POST format, `NY` station code, date format
(`30-Oct-2026 07:42:00 PM`, New York time) and field names come from the open-source
[`jtarrio/raildata`](https://github.com/jtarrio/raildata) client, since NJT's own API docs
need a login. Confirm against the portal's Swagger. In particular, check whether
`getTrainSchedule` covers 2 hours of Penn departures or only the next 19 trains, and the
exact `STATUS` strings.
