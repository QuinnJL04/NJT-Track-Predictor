import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
	title: 'Penn Track',
	description: 'NJ Transit departures and tracks from New York Penn Station.'
};

export const viewport: Viewport = {
	themeColor: [
		{ media: '(prefers-color-scheme: light)', color: '#f6f5f2' },
		{ media: '(prefers-color-scheme: dark)', color: '#0e0f11' }
	]
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
