import type { TrackInfo } from '@/lib/types';
import { predictedLabel, trackAriaLabel } from '@/lib/format';
import { cx } from '@/lib/cx';
import styles from './TrackBadge.module.css';

export function TrackBadge({ track, fresh = false }: { track: TrackInfo; fresh?: boolean }) {
	return (
		<div
			className={cx(styles.badge, styles[track.kind], fresh && styles.fresh)}
			data-track={track.kind}
			role="img"
			aria-label={trackAriaLabel(track)}
		>
			{track.kind === 'posted' && (
				<>
					<span className={styles.label}>Trk</span>
					<span className={styles.num}>{track.track}</span>
				</>
			)}
			{track.kind === 'predicted' && (
				<>
					<span className={styles.num}>{predictedLabel(track.tracks)}</span>
					<span className={styles.label}>likely</span>
				</>
			)}
			{track.kind === 'unknown' && <span className={styles.num}>—</span>}
		</div>
	);
}
