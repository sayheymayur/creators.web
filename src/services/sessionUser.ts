import type { User } from '../types';

const STORAGE_KEY = 'creatorsweb.user';

export function getStoredUser(): User | null {
	try {
		const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
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
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(user));
	} catch {
		// ignore (storage blocked)
	}
}

export function clearStoredUser(): void {
	try {
		globalThis.localStorage?.removeItem(STORAGE_KEY);
	} catch {
		// ignore (storage blocked)
	}
}
