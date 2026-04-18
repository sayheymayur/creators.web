/** INR paise / API minor units as non-negative integer decimal strings (e.g. "150000" = ₹1500). */

export const ZERO_MINOR = '0';

export function parseMinor(s: string | undefined | null): bigint {
	if (s == null || s === '') return 0n;
	const t = String(s).trim();
	if (!/^\d+$/.test(t)) return 0n;
	try {
		return BigInt(t);
	} catch {
		return 0n;
	}
}

export function minorToString(n: bigint): string {
	return n.toString();
}

/** Add two minor-unit strings. */
export function addMinor(a: string, b: string): string {
	return (parseMinor(a) + parseMinor(b)).toString();
}

/** Subtract b from a; clamps at zero. */
export function subtractMinor(a: string, b: string): string {
	const diff = parseMinor(a) - parseMinor(b);
	return diff > 0n ? diff.toString() : ZERO_MINOR;
}

export function compareMinor(a: string, op: '>=' | '>' | '<=' | '<', b: string): boolean {
	const A = parseMinor(a);
	const B = parseMinor(b);
	switch (op) {
		case '>=': return A >= B;
		case '>': return A > B;
		case '<=': return A <= B;
		case '<': return A < B;
		default: return false;
	}
}

/** Catalog / UI amounts are treated as INR rupees → paise string (same scale as API `amount_cents`). */
export function inrRupeesToMinor(rupees: number): string {
	const paise = Math.max(0, Math.round(rupees * 100));
	return String(paise);
}

/** Format a rupee amount (not paise) for display. */
export function formatINRRupees(rupees: number): string {
	return new Intl.NumberFormat('en-IN', {
		style: 'currency',
		currency: 'INR',
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(rupees);
}

/** Format minor units as Indian Rupees (₹). */
export function formatINRFromMinor(minor: string | undefined | null): string {
	const n = parseMinor(minor);
	const rupees = Number(n) / 100;
	return new Intl.NumberFormat('en-IN', {
		style: 'currency',
		currency: 'INR',
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(rupees);
}
