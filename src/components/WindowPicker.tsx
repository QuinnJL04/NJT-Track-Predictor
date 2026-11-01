'use client';

import { useRef, type KeyboardEvent } from 'react';
import { WINDOWS, type WindowMinutes } from '@/lib/windows';
import styles from './WindowPicker.module.css';

type Props = { value: WindowMinutes; onChange: (minutes: WindowMinutes) => void };

/** 30 min · 1 hr · 2 hr. A radio group, so arrow keys move between options. */
export function WindowPicker({ value, onChange }: Props) {
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);

	function onKeyDown(e: KeyboardEvent) {
		const step =
			e.key === 'ArrowRight' || e.key === 'ArrowDown'
				? 1
				: e.key === 'ArrowLeft' || e.key === 'ArrowUp'
					? -1
					: 0;
		if (!step) return;
		e.preventDefault();
		const i = WINDOWS.findIndex((w) => w.minutes === value);
		const next = (i + step + WINDOWS.length) % WINDOWS.length;
		onChange(WINDOWS[next].minutes);
		buttons.current[next]?.focus();
	}

	return (
		<div className={styles.seg} role="radiogroup" aria-label="Time window" onKeyDown={onKeyDown}>
			{WINDOWS.map((w, i) => (
				<button
					key={w.minutes}
					ref={(el) => {
						buttons.current[i] = el;
					}}
					type="button"
					role="radio"
					aria-checked={value === w.minutes}
					tabIndex={value === w.minutes ? 0 : -1}
					className={styles.option}
					onClick={() => onChange(w.minutes)}
				>
					{w.label}
				</button>
			))}
		</div>
	);
}
