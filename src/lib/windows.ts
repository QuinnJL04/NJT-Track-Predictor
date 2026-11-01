import { useSyncExternalStore } from 'react';

export const WINDOWS = [
	{ minutes: 30, label: '30 min', phrase: 'the next 30 minutes' },
	{ minutes: 60, label: '1 hr', phrase: 'the next hour' },
	{ minutes: 120, label: '2 hr', phrase: 'the next 2 hours' }
] as const;

export type WindowMinutes = (typeof WINDOWS)[number]['minutes'];

const DEFAULT: WindowMinutes = 60;
const KEY = 'penn-track:window';
const listeners = new Set<() => void>();

function read(): WindowMinutes {
	try {
		const saved = Number(localStorage.getItem(KEY));
		return WINDOWS.find((w) => w.minutes === saved)?.minutes ?? DEFAULT;
	} catch {
		return DEFAULT; // storage blocked: keep the default
	}
}

function subscribe(onChange: () => void) {
	listeners.add(onChange);
	window.addEventListener('storage', onChange); // other tabs
	return () => {
		listeners.delete(onChange);
		window.removeEventListener('storage', onChange);
	};
}

/**
 * The chosen time window, remembered per device. The server always renders the default;
 * React swaps in the saved choice right after hydration, without a mismatch.
 */
export function useWindowMinutes(): [WindowMinutes, (minutes: WindowMinutes) => void] {
	const value = useSyncExternalStore(subscribe, read, () => DEFAULT);
	const set = (minutes: WindowMinutes) => {
		try {
			localStorage.setItem(KEY, String(minutes));
		} catch {
			// ignore
		}
		listeners.forEach((notify) => notify());
	};
	return [value, set];
}
