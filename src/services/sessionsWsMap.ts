import type { CallModality, SessionKind, SessionsSettlement } from './sessionsWsTypes';

/** Parse v4 `call_modality`; default `video` for call kind when omitted. */
export function normalizeCallModality(
	raw: unknown,
	kind?: SessionKind
): CallModality | undefined {
	if (raw === 'audio' || raw === 'video') return raw;
	if (kind === 'call') return 'video';
	return undefined;
}

export function normalizeSessionsSettlement(raw: unknown): SessionsSettlement | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const o = raw as Record<string, unknown>;
	const escrow = typeof o.escrow_cents === 'string' ? o.escrow_cents : '';
	const settled = typeof o.settled_cents === 'string' ? o.settled_cents : '';
	const refund = typeof o.refund_cents === 'string' ? o.refund_cents : '';
	if (!escrow && !settled && !refund) return undefined;
	const rate =
		o.per_minute_rate_minor === null ? null :
		typeof o.per_minute_rate_minor === 'string' ? o.per_minute_rate_minor :
		undefined;
	return {
		escrow_cents: escrow,
		settled_cents: settled,
		refund_cents: refund,
		per_minute_rate_minor: rate ?? null,
	};
}
