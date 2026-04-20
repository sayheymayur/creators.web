export function isPaymentCancelled(err: unknown): boolean {
	return err instanceof Error && err.message === 'PAYMENT_CANCELLED';
}
