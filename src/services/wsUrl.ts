/**
 * WebSocket URL for the creators API — derived from the same base as HTTP (`VITE_CREATORS_API_URL`).
 */
import { getSessionToken } from './sessionToken';

const DEFAULT_API_ORIGIN = 'https://creatorsapi.pnine.me';

function withWsAuth(url: string): string {
	const token = getSessionToken();
	if (!token) return url;
	try {
		const u = new URL(url);
		const param = import.meta.env.VITE_CREATORS_WS_TOKEN_PARAM?.trim() || 'token';
		u.searchParams.set(param, token);
		return u.toString();
	} catch {
		return url;
	}
}

export function creatorsWsUrl(): string {
	const explicit = import.meta.env.VITE_CREATORS_WS_URL?.trim();
	if (explicit) return withWsAuth(explicit);

	const api = import.meta.env.VITE_CREATORS_API_URL?.trim() || DEFAULT_API_ORIGIN;
	const u = new URL(api);
	u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
	const path = import.meta.env.VITE_CREATORS_WS_PATH?.trim() || '/ws';
	u.pathname = path.startsWith('/') ? path : `/${path}`;
	u.search = '';
	u.hash = '';
	return withWsAuth(u.toString());
}
