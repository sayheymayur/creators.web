import { creatorsApi } from '../creatorsApi';
import { clearRazorpaySdkCache } from '../razorpay';
import type { PaymentProviderId } from './config';

export type ResolvedPaymentGateway = {
	provider: PaymentProviderId,
	useMock: boolean,
};

let cache: ResolvedPaymentGateway | null = null;
let inflight: Promise<ResolvedPaymentGateway> | null = null;

function normalizeProvider(p: string | undefined): PaymentProviderId {
	return p?.trim().toLowerCase() === 'stripe' ? 'stripe' : 'razorpay';
}

function envFallback(): ResolvedPaymentGateway {
	return {
		provider: normalizeProvider(import.meta.env.VITE_PAYMENTS_PROVIDER),
		useMock: import.meta.env.VITE_PAYMENTS_MOCK === 'true',
	};
}

/** Call on logout or when auth session changes so the next payment refetches gateway. */
export function clearPaymentGatewayCache(): void {
	cache = null;
	inflight = null;
	try {
		clearRazorpaySdkCache();
	} catch {
		// ignore
	}
}

/**
 * Resolves which payment provider to use. Prefers GET /payments/gateway; on failure uses .env fallback (local dev).
 */
export function resolvePaymentGateway(): Promise<ResolvedPaymentGateway> {
	if (cache) return Promise.resolve(cache);
	if (inflight) return inflight;

	inflight = creatorsApi.payments
		.getGateway()
		.then(body => {
			const maybeProvider = (body as { provider?: string }).provider;
			const maybeUseMock = (body as { useMock?: boolean }).useMock;
			const normalized: ResolvedPaymentGateway = { provider: normalizeProvider(maybeProvider), useMock: maybeUseMock === true };
			cache = normalized;
			return normalized;
		})
		.catch(() => {
			const fallback = envFallback();
			cache = fallback;
			return fallback;
		})
		.finally(() => {
			inflight = null;
		});

	return inflight;
}
