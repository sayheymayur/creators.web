import type { User } from '../types';

const AUTH_EXCHANGE_URL = import.meta.env.VITE_AUTH_EXCHANGE_URL as string | undefined;

type SignupRole = 'fan' | 'creator';

interface ExchangeResponse {
	user: User;
}

function isValidUser(value: unknown): value is User {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.id === 'string' &&
		typeof candidate.email === 'string' &&
		typeof candidate.role === 'string' &&
		typeof candidate.name === 'string';
}

export async function exchangeFirebaseToken(
	idToken: string,
	preferredRole?: SignupRole
): Promise<User | null> {
	if (!AUTH_EXCHANGE_URL) return null;

	return globalThis.fetch(AUTH_EXCHANGE_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ idToken, preferredRole }),
		credentials: 'include',
	}).then(response => {
		if (!response.ok) {
			throw new Error('Unable to complete secure sign-in.');
		}
		return response.json() as Promise<ExchangeResponse>;
	}).then(payload => {
		if (!isValidUser(payload.user)) {
			throw new Error('Received invalid user payload from auth server.');
		}
		return payload.user;
	});
}
