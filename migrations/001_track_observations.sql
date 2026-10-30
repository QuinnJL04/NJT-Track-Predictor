-- Training data for the track model: one row per train per service day.
-- Text fields are stored as the board delivered them (NJT's terms forbid modifying the data).
CREATE TABLE IF NOT EXISTS track_observations (
	train_number        text        NOT NULL,
	service_date        date        NOT NULL, -- New York date of the scheduled departure
	line                text        NOT NULL,
	line_color          text        NOT NULL,
	destination         text        NOT NULL,
	scheduled_departure timestamptz NOT NULL,

	first_seen_at       timestamptz NOT NULL, -- fetchedAt of the first board that listed the train
	last_seen_at        timestamptz NOT NULL, -- fetchedAt of the latest board that listed it

	-- What the predictor said on the first board that listed the train. NULL when the
	-- track was already posted (or the train cancelled) at first sight.
	first_prediction    jsonb,                -- [{ "track": "3", "p": 0.62 }, ...]
	prediction_model    text,                 -- which predictor produced it, e.g. "stub"

	first_posted_track  text,                 -- the first track NJT posted
	track_posted_at     timestamptz,          -- fetchedAt of the first board showing a posted track
	posted_track        text,                 -- the latest posted track (NJT sometimes reassigns)

	last_status         text        NOT NULL, -- on_time | delayed | boarding | cancelled
	last_delay_min      integer,

	PRIMARY KEY (train_number, service_date)
);

CREATE INDEX IF NOT EXISTS track_observations_departure_idx
	ON track_observations (scheduled_departure);
