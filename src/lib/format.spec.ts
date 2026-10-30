import { describe, expect, it } from 'vitest';
import { clockTime, predictedLabel } from './format.js';

describe('predictedLabel', () => {
	it('shows the top track when confident', () => {
		expect(predictedLabel([{ track: '7', p: 0.72 }])).toBe('7');
	});

	it('hedges between nearby tracks as a range', () => {
		expect(
			predictedLabel([
				{ track: '3', p: 0.45 },
				{ track: '1', p: 0.3 }
			])
		).toBe('1–3');
	});

	it('hedges between distant tracks with a slash', () => {
		expect(
			predictedLabel([
				{ track: '2', p: 0.41 },
				{ track: '11', p: 0.3 }
			])
		).toBe('2/11');
	});
});

describe('clockTime', () => {
	it('formats in New York time without seconds', () => {
		expect(clockTime('2026-10-29T23:42:31Z')).toEqual({ time: '7:42', period: 'PM' });
	});
});
