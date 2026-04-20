import { loadStripe } from '@stripe/stripe-js';
import { openRazorpayCheckout, type PaymentRequest, type RazorpaySuccessResponse } from '../razorpay';
import { delayMs } from '../../utils/delay';
import { getMockDelayMs, type PaymentProviderId } from './config';
import { resolvePaymentGateway } from './gatewayResolver';

export interface UnifiedPayResult {
	provider: PaymentProviderId;
	referenceId: string;
	razorpay?: RazorpaySuccessResponse;
}

/**
 * External checkout: provider comes from GET /payments/gateway (or .env fallback if API unavailable).
 */
export function runExternalPayment(req: PaymentRequest): Promise<UnifiedPayResult> {
	return resolvePaymentGateway().then(gw => {
		const mock = gw.useMock === true;
		if (mock) {
			return delayMs(getMockDelayMs()).then(() => ({
				provider: gw.provider,
				referenceId:
					gw.provider === 'stripe' ?
						`pi_mock_${Date.now()}` :
						`rzp_mock_${Date.now()}`,
			}));
		}

		if (gw.provider === 'razorpay') {
			return openRazorpayCheckout(req).then(r => ({
				provider: 'razorpay',
				referenceId: r.razorpay_payment_id,
				razorpay: r,
			}));
		}

		const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();
		if (!key) {
			return Promise.reject(
				new Error('Stripe publishable key not configured. Set VITE_STRIPE_PUBLISHABLE_KEY in .env')
			);
		}

		return loadStripe(key).then(stripe => {
			if (!stripe) {
				return Promise.reject(new Error('Stripe.js failed to initialize'));
			}
			return new Promise<UnifiedPayResult>((resolve, reject) => {
				const msg =
					`Complete checkout?\n\n${req.description}\n\n` +
					'Demo: Stripe.js is loaded. Wire creatorsApi.payments.stripeCreatePaymentIntent ' +
					'and confirmPayment when your backend is ready.';
				const ok = window.confirm(msg);
				if (!ok) {
					reject(new Error('PAYMENT_CANCELLED'));
					return;
				}
				resolve({
					provider: 'stripe',
					referenceId: `pi_demo_${Date.now()}`,
				});
			});
		});
	});
}
