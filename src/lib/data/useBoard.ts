import { useEffect, useState } from 'react';
import type { BoardSnapshot } from '@/lib/types';
import { connectBoard, type Connection } from './board';

/**
 * The live board for a component: starts from the server-rendered snapshot, then follows
 * SSE or polling. The UI doesn't know or care which transport is in use.
 */
export function useBoard(initial: BoardSnapshot | null) {
	const [snapshot, setSnapshot] = useState(initial);
	const [connection, setConnection] = useState<Connection>('connecting');

	useEffect(
		() =>
			// connectBoard returns its own cleanup, which React calls on unmount.
			connectBoard((update) => {
				if (update.snapshot) setSnapshot(update.snapshot);
				setConnection(update.connection);
			}),
		[]
	);

	return { snapshot, connection };
}
