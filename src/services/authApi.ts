import type { User } from '../types';
import { creatorsApi } from './creatorsApi';

interface ExchangeResponse {
	user?: User;
}

export function exchangeFirebaseToken(
	idToken: string,
	role: 'fan' | 'creator'
): Promise<User | null> {
	// Prefer the canonical API endpoint; keep compatibility with older env-based exchange URL.
	const exchangeUrl = import.meta.env.VITE_AUTH_EXCHANGE_URL?.trim() ?? '';
	if (!exchangeUrl) {
		return creatorsApi.auth.firebaseExchange({ idToken, preferredRole: role })
			.then(res => res.user ?? null)
			.catch(() => null);
	}

	return globalThis.fetch(exchangeUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ idToken, role }),
	})
		.then(response => {
			if (!response.ok) return null;
			return response.json().then(raw => {
				const data = raw as ExchangeResponse;
				return data.user ?? null;
			});
		})
		.catch(() => null);
}
