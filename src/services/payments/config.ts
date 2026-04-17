export type PaymentProviderId = 'razorpay' | 'stripe';

export function getMockDelayMs(): number {
	const delayRaw = Number(import.meta.env.VITE_PAYMENTS_MOCK_DELAY_MS);
	return Number.isFinite(delayRaw) && delayRaw >= 0 ? delayRaw : 600;
}
