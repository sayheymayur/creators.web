import type { WsClient } from './wsClient';

export interface PaymentBalanceResponse {
	walletId: string;
	/** Minor units (INR paise) as string; same scale as ledger amount_cents. */
	balance_cents: string;
}

export interface LedgerTransactionRow {
	id: string;
	type: 'credit' | 'debit';
	amount_cents: string;
	balance_after_cents: string;
	reference_type: string;
	reference_id: string;
	meta: Record<string, unknown>;
	created_at: string;
}

export interface PaymentHistoryResponse {
	transactions: LedgerTransactionRow[];
	nextCursor: string | null;
}

export interface RazorpayOrderRow {
	id: string;
	razorpay_order_id: string;
	currency: string;
	amount_minor: string;
	status: string;
	created_at: string;
}

export interface PaymentOrdersResponse {
	orders: RazorpayOrderRow[];
}

export interface PaymentCreateOrderResponse {
	orderId: string;
	amountMinor: number;
	currency: string;
	keyId: string | null;
}

export interface PaymentConfirmResponse {
	ok: true;
	balance_after_cents: string;
	alreadyConfirmed?: true;
}

const SVC = 'payment';

export function createPaymentWs(client: WsClient) {
	return {
		balance(): Promise<PaymentBalanceResponse> {
			return client.request(SVC, 'balance', []) as Promise<PaymentBalanceResponse>;
		},
		history(limit?: number, beforeCursor?: string): Promise<PaymentHistoryResponse> {
			const args: string[] = [];
			if (limit != null) args.push(String(limit));
			if (beforeCursor != null) args.push(beforeCursor);
			return client.request(SVC, 'history', args) as Promise<PaymentHistoryResponse>;
		},
		transactions(limit?: number, beforeCursor?: string): Promise<PaymentHistoryResponse> {
			const args: string[] = [];
			if (limit != null) args.push(String(limit));
			if (beforeCursor != null) args.push(beforeCursor);
			return client.request(SVC, 'transactions', args) as Promise<PaymentHistoryResponse>;
		},
		createOrder(amountMinor: string, currency?: string): Promise<PaymentCreateOrderResponse> {
			const args = currency ? [amountMinor, currency] : [amountMinor];
			return client.request(SVC, 'createorder', args) as Promise<PaymentCreateOrderResponse>;
		},
		confirm(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string): Promise<PaymentConfirmResponse> {
			return client.request(SVC, 'confirm', [razorpayOrderId, razorpayPaymentId, razorpaySignature]) as Promise<PaymentConfirmResponse>;
		},
		orders(limit?: number): Promise<PaymentOrdersResponse> {
			const args = limit != null ? [String(limit)] : [];
			return client.request(SVC, 'orders', args) as Promise<PaymentOrdersResponse>;
		},
	};
}

export type PaymentWs = ReturnType<typeof createPaymentWs>;
