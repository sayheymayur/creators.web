import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { WsClient } from '../services/wsClient';
import { useAuth } from './AuthContext';
import { getSessionToken } from '../services/sessionToken';
import { parseFrame } from '../services/wsProtocol';

type WsContextValue = {
	client: WsClient,
	isConnected: boolean,
};

const WsContext = createContext<WsContextValue | null>(null);

export function WsProvider({ children }: { children: React.ReactNode }) {
	const { state: authState } = useAuth();
	const [isConnected, setIsConnected] = useState(false);

	const client = useMemo(() => new WsClient({
		getToken() {
			return getSessionToken();
		},
	}), []);

	useEffect(() => {
		client.connect();
		setIsConnected(client.isConnected);
		return () => {
			// React.StrictMode mounts/unmounts effects twice in dev.
			// Disconnecting during the dev-only test-unmount can close the socket
			// before the handshake completes, producing noisy browser errors.
			if (!import.meta.env.DEV) client.disconnect();
		};
	}, [client]);

	useEffect(() => {
		const t = window.setInterval(() => {
			setIsConnected(prev => {
				const next = client.isConnected;
				return prev === next ? prev : next;
			});
		}, 400);
		return () => window.clearInterval(t);
	}, [client]);

	useEffect(() => {
		// Refresh auth whenever login/logout changes the token.
		// (token is stored in localStorage by creatorsApi)
		client.refreshAuth();
	}, [authState]);

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		const g = globalThis as unknown as Record<string, unknown>;
		const existing = (g.CW as Record<string, unknown> | undefined) ?? {};
		g.CW = {
			...existing,
			ws: client,
			parseFrame,
		};
		return () => {
			const cur = (g.CW as Record<string, unknown> | undefined) ?? {};
			if (cur.ws === client) {
				const next = { ...cur };
				delete next.ws;
				g.CW = next;
			}
		};
	}, [client]);

	return (
		<WsContext.Provider value={{ client, isConnected }}>
			{children}
		</WsContext.Provider>
	);
}

export function useWs(): WsClient {
	const ctx = useContext(WsContext);
	if (!ctx) throw new Error('useWs must be used within WsProvider');
	return ctx.client;
}

export function useWsConnected(): boolean {
	const ctx = useContext(WsContext);
	if (!ctx) throw new Error('useWsConnected must be used within WsProvider');
	return ctx.isConnected;
}
