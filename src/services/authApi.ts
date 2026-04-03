import type { User } from '../types';

interface ExchangeResponse {
	user?: User;
}

export function exchangeFirebaseToken(
	idToken: string,
	role: 'fan' | 'creator'
): Promise<User | null> {
	const exchangeUrl = import.meta.env.VITE_AUTH_EXCHANGE_URL?.trim() ?? '';
	if (!exchangeUrl) return Promise.resolve(null);

	return globalThis.fetch(exchangeUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			idToken,
			role,
		}),
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
