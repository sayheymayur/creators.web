const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

if (!RAZORPAY_KEY_ID) {
	console.error('[razorpay] VITE_RAZORPAY_KEY_ID is not set in .env');
}

// ─── Razorpay type declarations ──────────────────────────────

declare global {
	interface Window {
		Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
	}
}

interface RazorpayOptions {
	key: string;
	amount: number;
	currency: string;
	name: string;
	description: string;
	image?: string;
	order_id?: string;
	prefill?: { name?: string, email?: string, contact?: string };
	notes?: Record<string, string>;
	theme?: { color?: string, backdrop_color?: string };
	handler: (response: RazorpaySuccessResponse) => void;
	modal?: { ondismiss?: () => void, escape?: boolean, confirm_close?: boolean };
	retry?: { enabled: boolean, max_count?: number };
}

interface RazorpayInstance {
	open: () => void;
	close: () => void;
	on: (event: string, callback: (response: RazorpayFailureResponse) => void) => void;
}

export interface RazorpaySuccessResponse {
	razorpay_payment_id: string;
	razorpay_order_id?: string;
	razorpay_signature?: string;
}

export interface RazorpayFailureResponse {
	error: {
		code: string,
		description: string,
		source: string,
		step: string,
		reason: string,
		metadata?: { payment_id?: string, order_id?: string },
	};
}

// ─── Script loader with retry ────────────────────────────────

let scriptStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
let scriptPromise: Promise<void> | null = null;

export function clearRazorpaySdkCache(): void {
	scriptStatus = 'idle';
	scriptPromise = null;

	try {
		const scripts = document.querySelectorAll('script[src*="razorpay"]');
		scripts.forEach(s => s.remove());
	} catch {
		// ignore
	}

	try {
		// The SDK attaches itself to window; removing it forces a clean reload next time.
		delete (window as unknown as { Razorpay?: unknown }).Razorpay;
	} catch {
		// ignore
	}
}

function loadScript(): Promise<void> {
	if (scriptStatus === 'loaded' || window.Razorpay) {
		scriptStatus = 'loaded';
		return Promise.resolve();
	}

	if (scriptStatus === 'loading' && scriptPromise) {
		return scriptPromise;
	}

	scriptStatus = 'loading';
	scriptPromise = new Promise((resolve, reject) => {
		const existing = document.querySelector('script[src*="razorpay"]');
		if (existing) {
			existing.remove();
		}

		const script = document.createElement('script');
		script.src = 'https://checkout.razorpay.com/v1/checkout.js';
		script.async = true;

		script.onload = () => {
			scriptStatus = 'loaded';
			resolve();
		};

		script.onerror = () => {
			scriptStatus = 'error';
			scriptPromise = null;
			reject(new Error('Failed to load Razorpay SDK. Check your internet connection.'));
		};

		document.head.appendChild(script);
	});

	return scriptPromise;
}

// ─── Public API ──────────────────────────────────────────────

export interface PaymentRequest {
	amountINR: number;
	description: string;
	userName?: string;
	userEmail?: string;
	userPhone?: string;
	orderId?: string;
	notes?: Record<string, string>;
	receiptId?: string;
	/** Server order amount in paise; overrides `amountINR` when set (must match Razorpay order). */
	amountPaise?: number;
	/** Public key from `POST /payments/razorpay/orders` (`keyId`); falls back to `VITE_RAZORPAY_KEY_ID`. */
	keyId?: string | null;
}

export function openRazorpayCheckout(req: PaymentRequest): Promise<RazorpaySuccessResponse> {
	const key = (req.keyId ?? RAZORPAY_KEY_ID) || '';
	if (!key) {
		throw new Error('Razorpay key not configured. Pass keyId from the create-order response or set VITE_RAZORPAY_KEY_ID in .env');
	}

	if (req.amountINR <= 0 && (req.amountPaise == null || req.amountPaise <= 0)) {
		throw new Error('Payment amount must be greater than zero');
	}

	return loadScript().then(() => new Promise<RazorpaySuccessResponse>((resolve, reject) => {
		const amountPaise = req.amountPaise ?? Math.round(req.amountINR * 100);

		const options: RazorpayOptions = {
			key,
			amount: amountPaise,
			currency: 'INR',
			name: 'Creators Platform',
			description: req.description.slice(0, 255),
			order_id: req.orderId,
			prefill: {
				name: req.userName ?? '',
				email: req.userEmail ?? '',
				contact: req.userPhone ?? '',
			},
			notes: {
				...req.notes,
				receipt_id: req.receiptId ?? `rcpt_${Date.now()}`,
			},
			theme: {
				color: '#f43f5e',
			},
			retry: {
				enabled: true,
				max_count: 3,
			},
			modal: {
				confirm_close: true,
				escape: true,
				ondismiss() {
					reject(new Error('PAYMENT_CANCELLED'));
				},
			},
			handler(response: RazorpaySuccessResponse) {
				resolve(response);
			},
		};

		try {
			const rzp = new window.Razorpay(options);

			rzp.on('payment.failed', (resp: RazorpayFailureResponse) => {
				const msg = resp.error?.description || 'Payment failed';
				const err: Error & { code?: string } = new Error(msg);
				err.code = resp.error?.code;
				reject(err);
			});

			rzp.open();
		} catch (err) {
			reject(err instanceof Error ? err : new Error('Failed to open Razorpay checkout'));
		}
	}));
}

/**
 * Check if a payment error was user-initiated cancellation (not a real failure).
 */
export function isPaymentCancelled(err: unknown): boolean {
	return err instanceof Error && err.message === 'PAYMENT_CANCELLED';
}

// ─── Currency helpers (amounts are INR rupees in UI/catalog) ─────────────────

export { formatINRRupees as formatINR } from '../utils/money';
