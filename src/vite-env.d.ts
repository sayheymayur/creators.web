/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_RAZORPAY_KEY_ID: string;
	/** razorpay | stripe */
	readonly VITE_PAYMENTS_PROVIDER?: string;
	/** true = simulated checkout, no gateway */
	readonly VITE_PAYMENTS_MOCK?: string;
	readonly VITE_PAYMENTS_MOCK_DELAY_MS?: string;
	/** true = simulate GET /payments/gateway locally (backend-decides behavior without network) */
	readonly VITE_PAYMENTS_GATEWAY_MOCK?: string;
	/** razorpay | stripe (used only when VITE_PAYMENTS_GATEWAY_MOCK=true) */
	readonly VITE_PAYMENTS_GATEWAY_PROVIDER?: string;
	/** true = backend forces simulated checkout via gateway response */
	readonly VITE_PAYMENTS_GATEWAY_USE_MOCK?: string;
	readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
	readonly VITE_FIREBASE_API_KEY?: string;
	readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
	readonly VITE_FIREBASE_PROJECT_ID?: string;
	readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
	readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
	readonly VITE_FIREBASE_APP_ID?: string;
	readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
	readonly VITE_AUTH_EXCHANGE_URL?: string;
	readonly VITE_CREATORS_API_URL?: string;
	readonly VITE_CREATORS_WS_URL?: string;
	readonly VITE_CREATORS_WS_PATH?: string;
	readonly VITE_CREATORS_WS_TOKEN_PARAM?: string;
	readonly VITE_AGORA_APP_ID?: string;
	readonly VITE_AGORA_TOKEN_ENDPOINT?: string;
	/** true = log creator WS commands/responses in dev */
	readonly VITE_DEBUG_CREATOR_WS?: string;
	/** true = show full creator dashboard without KYC gate (non-dev builds, e.g. preview) */
	readonly VITE_SKIP_CREATOR_KYC?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
