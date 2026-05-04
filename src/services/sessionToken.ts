const STORAGE_KEY = 'creatorsweb.jwt';
let memoryToken: string | null = null;

export function getSessionToken(): string | null {
	try {
		const token = globalThis.sessionStorage?.getItem(STORAGE_KEY);
		const trimmed = token?.trim();
		if (trimmed) return trimmed;
	} catch {
	}

	return memoryToken;
}

export function setSessionToken(token: string): void {
	memoryToken = token;
	try {
		globalThis.sessionStorage?.setItem(STORAGE_KEY, token);
	} catch {
		// ignore (storage blocked)
	}

	// Ensure we don't share JWT across tabs (localStorage is shared).
	try {
		globalThis.localStorage?.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

export function clearSessionToken(): void {
	memoryToken = null;
	try {
		globalThis.sessionStorage?.removeItem(STORAGE_KEY);
	} catch {
		// ignore (storage blocked)
	}

	try {
		globalThis.localStorage?.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
