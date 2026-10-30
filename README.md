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
npm test        # unit tests (mock board, stub, NJT normalize, training log)
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
| `src/lib/server/observations.ts`         | Board snapshot → training rows, one upsert per snapshot        |
| `src/routes/api/cron/log/+server.ts`     | Cron target: logs the current board (needs `CRON_SECRET`)      |

## Training data

The track model needs history: which train got which track. `/api/cron/log` reads the
board through the same cache as `/api/board` and upserts it into Postgres, one row per
train per service day (`migrations/001_track_observations.sql`). It records the board
fields as received, the first and latest time the train was seen, the stub's prediction
at first sight (to compare against the model later), the first posted track and when it
posted, the latest posted track, and the latest status and delay. Repeat polls update
the row; an older or repeated snapshot changes nothing.

Logging is off until `DATABASE_URL` is set; the route then answers `{ logged: 0 }`.

### Setup

1. **Database.** In the Vercel project, add Neon from the Marketplace (Storage → Neon).
   It sets `DATABASE_URL`. (Vercel Postgres no longer exists; it moved to Neon.) Then
   create the table, with the Neon SQL editor or:
   ```bash
   psql "$DATABASE_URL" -f migrations/001_track_observations.sql
   ```
2. **Secret.** Set `CRON_SECRET` in Vercel to a random string (`openssl rand -hex 32`).
   Requests without `Authorization: Bearer $CRON_SECRET` get a 401, and so does every
   request while it's unset.
3. **Trigger.** Vercel Cron on Hobby runs at most once a day (±59 min), so `vercel.json`
   has only a daily heartbeat. Pick one:
   - **GitHub Actions** (`.github/workflows/training-logger.yml`): set repo variable
     `LOGGER_URL` to `https://<your-app>/api/cron/log` and secret `CRON_SECRET`.
     GitHub schedules run at most every 5 minutes and can be late, so each run calls the
     route 5 times, a minute apart.
   - **An external cron** such as cron-job.org, calling the URL every minute with the
     `Authorization` header. More punctual than GitHub.
   - **Vercel Pro**: change the schedule in `vercel.json` to `* * * * *`; Vercel sends the
     bearer token itself.

At one call a minute that's about 1,440 logger requests a day, each costing at most one
`getTrainSchedule` call (fewer when the 20 s cache is already warm from users), far under
NJT's 100,000 a day. Tracks post roughly 10–15 minutes before departure, so a 1-minute
cadence catches each posting within a minute.

### Export

```bash
npm run logger:export              # → data/track_observations.csv (gitignored)
npm run logger:export -- out.csv
```

Timestamps are UTC ISO 8601; `first_prediction` is JSON (`[{"track":"3","p":0.6}, ...]`).
`last_status` is the app's normalized status (`on_time`, `delayed`, `boarding`,
`cancelled`), not NJT's raw `STATUS` text.

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
- **Requests: 100,000 per day across all NJT feeds** (data agreement; exceeding it needs
  NJT's written consent and prompt notice to passcomm@njtransit.com). The server fetches
  `getTrainSchedule` at most once per 20 s per instance, about 4,320 calls a day per warm
  instance. `/api/board` is CDN-cached, so pollers don't add upstream calls. The caches
  are per instance, though, so watch the count if Vercel scales out widely. (Some
  RailData methods, such as `getStationSchedule`, have their own 5–10 calls a day limit.)

### Data agreement obligations

What the NJT data access agreement requires, and where the app handles it:

- **Serve from our server, never NJT's.** Browsers only call `/api/board` and
  `/api/board/stream`; only `src/lib/server/` talks to `raildata.njtransit.com`.
- **Say when data may not be real time** (latency over 1 minute). Each snapshot carries
  `fetchedAt`, and the board shows "Information may not be real time" when it's older
  than 60 s. In normal operation the oldest board is about 50 s old (20 s server cache +
  15 s CDN + 15 s poll).
- **Don't modify the data.** `normalize()` passes `DESTINATION`, `LINE`, `BACKCOLOR`,
  `TRACK` and train numbers through as sent, only decoding HTML entities. Values are
  added only where NJT gives none: predicted tracks (shown as "likely", never as posted)
  and a fallback line color. Using a subset (dropping Amtrak, not showing most fields) is
  allowed.
- **Don't imply an NJT license or accuracy.** The footer says the site isn't affiliated
  with NJ Transit, that the data is redistributed from this site's server and may be
  inaccurate, incomplete or delayed, and that "likely" tracks are our estimates.

### Unverified until there is an account

The endpoint names, multipart POST format, `NY` station code, date format
(`30-Oct-2026 07:42:00 PM`, New York time) and field names come from the open-source
[`jtarrio/raildata`](https://github.com/jtarrio/raildata) client, since NJT's own API docs
need a login. Confirm against the portal's Swagger. In particular, check whether
`getTrainSchedule` covers 2 hours of Penn departures or only the next 19 trains, and the
exact `STATUS` strings.
