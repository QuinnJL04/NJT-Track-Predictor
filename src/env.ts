import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	DATA_SOURCE: {
		description: 'Where the board comes from: "mock" or "njt"',
		schema: (value) => {
			const source = value || 'mock';
			if (source !== 'mock' && source !== 'njt') {
				throw new Error('DATA_SOURCE must be "mock" or "njt"');
			}
			return source;
		}
	},
	NJT_USERNAME: { description: 'NJ Transit rail API username', schema: optional },
	NJT_PASSWORD: { description: 'NJ Transit rail API password', schema: optional },
	NJT_TOKEN: {
		description: 'Optional pre-issued RailData token, so cold starts skip getToken (5/day limit)',
		schema: optional
	}
});
