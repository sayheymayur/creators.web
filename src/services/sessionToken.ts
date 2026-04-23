const STORAGE_KEY = 'creatorsweb.jwt';

export function getSessionToken(): string | null {
	try {
		const token = globalThis.localStorage?.getItem(STORAGE_KEY);
		const trimmed = token?.trim();
		return trimmed ? trimmed : null;
	} catch {
		return null;
	}
}

export function setSessionToken(token: string): void {
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, token);
	} catch {
		// ignore (storage blocked)
	}
}

export function clearSessionToken(): void {
	try {
		globalThis.localStorage?.removeItem(STORAGE_KEY);
	} catch {
		// ignore (storage blocked)
	}
}
