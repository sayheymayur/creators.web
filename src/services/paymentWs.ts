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
	/** Present when `purpose=subscription` flow is confirmed. */
	subscription?: Record<string, unknown>;
}

export interface TipDTO {
	id: string;
	fan_user_id: string;
	creator_user_id: string;
	post_id: string | null;
	amount_cents: string;
	currency: string;
	created_at: string;
}

export interface PaymentTipResponse {
	tip: TipDTO;
	from_balance_after: string;
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
		createOrder(
			amountMinor: string,
			currency?: string,
			extraArgs?: Record<string, string | number | boolean | null | undefined>
		): Promise<PaymentCreateOrderResponse> {
			const args: string[] = currency ? [amountMinor, currency] : [amountMinor];
			if (extraArgs) {
				for (const [k, v] of Object.entries(extraArgs)) {
					if (v === undefined) continue;
					if (v === null) args.push(`${k}=`);
					else args.push(`${k}=${String(v)}`);
				}
			}
			return client.request(SVC, 'createorder', args) as Promise<PaymentCreateOrderResponse>;
		},
		confirm(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string): Promise<PaymentConfirmResponse> {
			return client.request(SVC, 'confirm', [razorpayOrderId, razorpayPaymentId, razorpaySignature]) as Promise<PaymentConfirmResponse>;
		},
		orders(limit?: number): Promise<PaymentOrdersResponse> {
			const args = limit != null ? [String(limit)] : [];
			return client.request(SVC, 'orders', args) as Promise<PaymentOrdersResponse>;
		},
		tip(creatorUserId: string, amountCents: string, postId?: string): Promise<PaymentTipResponse> {
			const creator = String(creatorUserId ?? '').trim();
			const amount = String(amountCents ?? '').trim();
			if (!/^\d+$/.test(creator)) throw new Error('creatorUserId must be digits only');
			if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new Error('amountCents must be a positive integer string');
			const args: string[] = [creator, amount];
			const pid = String(postId ?? '').trim();
			if (pid) args.push(pid);
			return client.request(SVC, 'tip', args) as Promise<PaymentTipResponse>;
		},
	};
}

export type PaymentWs = ReturnType<typeof createPaymentWs>;
