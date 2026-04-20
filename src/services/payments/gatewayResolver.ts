import { creatorsApi, type PaymentGatewayResponse } from '../creatorsApi';
import type { PaymentProviderId } from './config';

let cache: PaymentGatewayResponse | null = null;
let inflight: Promise<PaymentGatewayResponse> | null = null;

function normalizeProvider(p: string | undefined): PaymentProviderId {
	return p?.trim().toLowerCase() === 'stripe' ? 'stripe' : 'razorpay';
}

function envFallback(): PaymentGatewayResponse {
	return {
		provider: normalizeProvider(import.meta.env.VITE_PAYMENTS_PROVIDER),
		useMock: import.meta.env.VITE_PAYMENTS_MOCK === 'true',
	};
}

/** Call on logout or when auth session changes so the next payment refetches gateway. */
export function clearPaymentGatewayCache(): void {
	cache = null;
	inflight = null;
}

/**
 * Resolves which payment provider to use. Prefers GET /payments/gateway; on failure uses .env fallback (local dev).
 */
export function resolvePaymentGateway(): Promise<PaymentGatewayResponse> {
	if (cache) return Promise.resolve(cache);
	if (inflight) return inflight;

	inflight = creatorsApi.payments
		.getGateway()
		.then(body => {
			const normalized: PaymentGatewayResponse = {
				provider: normalizeProvider(body.provider),
				useMock: body.useMock === true,
			};
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
