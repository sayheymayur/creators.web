import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { WsClient } from '../services/wsClient';
import { useAuth } from './AuthContext';
import { getSessionToken } from '../services/sessionToken';
import { parseFrame } from '../services/wsProtocol';
import { registerCreatorsWsTeardown } from '../services/wsLogoutRegistry';

type WsContextValue = {
	client: WsClient,
	isConnected: boolean,
	ensureAuth: () => Promise<void>,
	authReady: boolean,
};

const WsContext = createContext<WsContextValue | null>(null);

export function WsProvider({ children }: { children: React.ReactNode }) {
	const { state: authState } = useAuth();
	const [isConnected, setIsConnected] = useState(false);
	const [authReady, setAuthReady] = useState(false);
	const authPromiseRef = useRef<Promise<void>>(Promise.resolve());
	const lastAuthTokenRef = useRef<string | null>(null);

	const client = useMemo(() => new WsClient({
		getToken() {
			return getSessionToken();
		},
	}), []);

	useEffect(() => {
		// React.StrictMode (dev) runs effect setup+cleanup+setup.
		// Since we intentionally don't disconnect during the dev-only test-unmount,
		// guard against double-connect to avoid duplicate sockets + duplicate requests.
		if (!client.isConnected) client.connect();
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
		// Spec: clients may connect with ?token=… or authenticate later via `user /authenticate`.
		// For production-grade behavior we wait for an auth ACK whenever the token changes.
		const token = getSessionToken();
		if (!isConnected) {
			setAuthReady(false);
			return;
		}
		if (!token) {
			lastAuthTokenRef.current = null;
			setAuthReady(true);
			authPromiseRef.current = Promise.resolve();
			return;
		}
		if (lastAuthTokenRef.current === token && authReady) return;

		lastAuthTokenRef.current = token;
		setAuthReady(false);
		authPromiseRef.current = client
			.authenticate(token)
			.then(() => { setAuthReady(true); })
			.catch(e => {
				setAuthReady(false);
				throw e;
			});
	}, [authState.isAuthenticated, authState.user?.id, isConnected, client, authReady]);

	const ensureAuth = useMemo(() => {
		return () => authPromiseRef.current;
	}, []);

	useEffect(() => {
		registerCreatorsWsTeardown(() => {
			client.resetAuthTracking();
			if (!client.isConnected) return Promise.resolve();
			return client.userLogout()
				.catch(() => {
					/* ignore — still force a fresh socket */
				})
				.then(() => {
					client.reconnectSocket();
				});
		});
		return () => registerCreatorsWsTeardown(null);
	}, [client]);

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
		<WsContext.Provider value={{ client, isConnected, ensureAuth, authReady }}>
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

export function useEnsureWsAuth(): () => Promise<void> {
	const ctx = useContext(WsContext);
	if (!ctx) throw new Error('useEnsureWsAuth must be used within WsProvider');
	return ctx.ensureAuth;
}

export function useWsAuthReady(): boolean {
	const ctx = useContext(WsContext);
	if (!ctx) throw new Error('useWsAuthReady must be used within WsProvider');
	return ctx.authReady;
}
