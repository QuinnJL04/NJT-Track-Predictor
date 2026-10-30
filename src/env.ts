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
		description: 'Optional pre-issued RailData token, seeding the shared token store',
		schema: optional
	},
	// Upstash Redis shares the NJT token, board and daily call count across serverless
	// instances. Unset, each instance keeps its own in memory (fine for dev).
	UPSTASH_REDIS_REST_URL: { description: 'Upstash Redis REST URL', schema: optional },
	UPSTASH_REDIS_REST_TOKEN: { description: 'Upstash Redis REST token', schema: optional },
	KV_REST_API_URL: {
		description: 'Upstash Redis REST URL, as named by the Vercel integration',
		schema: optional
	},
	KV_REST_API_TOKEN: {
		description: 'Upstash Redis REST token, as named by the Vercel integration',
		schema: optional
	}
});
