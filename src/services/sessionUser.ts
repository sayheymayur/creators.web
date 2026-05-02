import type { User } from '../types';

const STORAGE_KEY = 'creatorsweb.user';

export function getStoredUser(): User | null {
	try {
		const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed as User;
	} catch {
		return null;
	}
}

export function setStoredUser(user: User): void {
	try {
		globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(user));
	} catch {
		// ignore (storage blocked)
	}

	// Avoid cross-tab user snapshot bleed.
	try {
		globalThis.localStorage?.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

export function clearStoredUser(): void {
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
