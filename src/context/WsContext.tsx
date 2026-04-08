import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { WsClient } from '../services/wsClient';
import { useAuth } from './AuthContext';

type WsContextValue = {
	client: WsClient,
};

const WsContext = createContext<WsContextValue | null>(null);

export function WsProvider({ children }: { children: React.ReactNode }) {
	const { state: authState } = useAuth();

	const client = useMemo(() => new WsClient({
		getToken() {
			// This project doesn't have a backend JWT yet; keep guest sockets by default.
			// When you add JWTs, store them in memory and return here to connect with ?token=.
			return null;
		},
	}), []);

	useEffect(() => {
		client.connect();
		return () => {
			client.disconnect();
		};
	}, [client]);

	useEffect(() => {
		// If/when you have JWTs, re-authenticate on login and on reconnect.
		// For now we keep it as a guest socket; this effect remains as the wiring point.
		void authState;
	}, [authState]);

	return (
		<WsContext.Provider value={{ client }}>
			{children}
		</WsContext.Provider>
	);
}

export function useWs(): WsClient {
	const ctx = useContext(WsContext);
	if (!ctx) throw new Error('useWs must be used within WsProvider');
	return ctx.client;
}
