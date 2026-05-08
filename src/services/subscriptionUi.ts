export type SubscriptionDTO = Record<string, unknown>;

export type SubscriptionUiStatus = 'active' | 'cancelled' | 'expired';

function toStringId(v: unknown): string | null {
	if (typeof v === 'string') return v.trim() ? v.trim() : null;
	if (typeof v === 'number') return String(v);
	return null;
}

export function subscriptionCreatorUserId(dto: SubscriptionDTO): string | null {
	return toStringId(
		dto.creatorUserId ??
		dto.creator_user_id ??
		dto.creator_userId ??
		dto.creator_id ??
		dto.creatorId
	);
}

export function subscriptionId(dto: SubscriptionDTO): string | null {
	return toStringId(dto.id ?? dto.subscription_id ?? dto.subscriptionId);
}

export function subscriptionUiStatus(dto: SubscriptionDTO): SubscriptionUiStatus {
	const isActive =
		typeof dto.is_active === 'boolean' ? dto.is_active :
		typeof dto.isActive === 'boolean' ? dto.isActive :
		undefined;
	if (typeof isActive === 'boolean') return isActive ? 'active' : 'cancelled';

	const status = typeof dto.status === 'string' ? dto.status.toLowerCase() : '';
	if (!status) return 'active';
	if (status === 'cancelled' || status === 'canceled') return 'cancelled';
	if (status === 'expired' || status === 'ended') return 'expired';
	return 'active';
}

export function subscriptionAmountMinor(dto: SubscriptionDTO): string | null {
	const v =
		typeof dto.amount_cents === 'string' ? dto.amount_cents :
		typeof dto.amount_minor === 'string' ? dto.amount_minor :
		typeof dto.amountMinor === 'number' ? String(dto.amountMinor) :
		null;
	if (!v) return null;
	const t = v.trim();
	return /^\d+$/.test(t) ? t : null;
}
