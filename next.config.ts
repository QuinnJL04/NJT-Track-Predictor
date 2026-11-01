import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	// Prerender everything that doesn't need a request (the header, skeleton and footer) into
	// a static shell, and stream per-request data into <Suspense> slots.
	cacheComponents: true,
	partialPrefetching: true
};

export default nextConfig;
