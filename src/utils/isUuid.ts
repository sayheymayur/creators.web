/** UUID string shape check (8-4-4-4-12 hex), aligned with typical gateway validation. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
	return UUID_RE.test(value.trim());
}

export function assertUuid(value: string, label = 'room id'): string {
	const v = value.trim();
	if (!isUuid(v)) {
		throw new Error(`${label} must be a UUID`);
	}
	return v;
}

/** New conversation / room id for routes (RFC 4122 v4). */
export function randomUuid(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') {
		return globalThis.crypto.randomUUID();
	}
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}
