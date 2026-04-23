/** User-facing label: no Razorpay/Stripe choice — backend decides provider. */
export function getExternalPayShortLabel(): string {
	return 'Checkout';
}

export function getExternalPaySecureHint(): string {
	return 'Secure checkout. The payment provider is configured by the platform.';
}
