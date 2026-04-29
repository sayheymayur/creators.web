const STORAGE_KEY = 'creatorsweb.jwt';
let memoryToken: string | null = null;

export function getSessionToken(): string | null {
	try {
		const token = globalThis.localStorage?.getItem(STORAGE_KEY);
		const trimmed = token?.trim();
		if (trimmed) return trimmed;
	} catch {
	}

	// Some environments block localStorage (e.g. tracking prevention). Fall back.
	try {
		const token = globalThis.sessionStorage?.getItem(STORAGE_KEY);
		const trimmed = token?.trim();
		if (trimmed) return trimmed;
	} catch {
		// ignore
	}

	return memoryToken;
}

export function setSessionToken(token: string): void {
	memoryToken = token;
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, token);
	} catch {
		// ignore (storage blocked)
	}

	try {
		globalThis.sessionStorage?.setItem(STORAGE_KEY, token);
	} catch {
		// ignore
	}
}

export function clearSessionToken(): void {
	memoryToken = null;
	try {
		globalThis.localStorage?.removeItem(STORAGE_KEY);
	} catch {
		// ignore (storage blocked)
	}

	try {
		globalThis.sessionStorage?.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
