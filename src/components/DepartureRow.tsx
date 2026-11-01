import type { Departure } from '@/lib/types';
import { clockTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { TrackBadge } from './TrackBadge';
import styles from './DepartureRow.module.css';

export function DepartureRow({
	departure: d,
	fresh = false
}: {
	departure: Departure;
	fresh?: boolean;
}) {
	const when = clockTime(d.departsAt);
	const cancelled = d.status === 'cancelled';

	return (
		<li className={cx(styles.row, cancelled && styles.cancelled)}>
			<div className={styles.time}>
				<span className={styles.hm}>{when.time}</span>
				<span className={styles.period}>{when.period}</span>
			</div>

			<div className={styles.trip}>
				<div className={styles.dest}>
					<span className={styles.dot} style={{ background: d.lineColor }} title={d.line} />
					<span className={styles.name}>{d.destination}</span>
				</div>
				<div className={styles.meta}>
					<StatusPill departure={d} />
					<span className={styles.train}>
						<span className="visually-hidden">{d.line} train </span>#{d.trainNumber}
					</span>
				</div>
			</div>

			<TrackBadge track={d.track} fresh={fresh} />
		</li>
	);
}

/** Only shown when it matters: on-time trains get nothing. */
function StatusPill({ departure: d }: { departure: Departure }) {
	if (d.status === 'delayed' && d.delayMin) {
		return <span className={cx(styles.pill, styles.delayed)}>Delayed {d.delayMin} min</span>;
	}
	if (d.status === 'cancelled') {
		return <span className={cx(styles.pill, styles.cancelledPill)}>Cancelled</span>;
	}
	if (d.status === 'boarding') {
		return <span className={cx(styles.pill, styles.boarding)}>Boarding</span>;
	}
	return null;
}
