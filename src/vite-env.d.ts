/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_RAZORPAY_KEY_ID: string;
	readonly VITE_FIREBASE_API_KEY?: string;
	readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
	readonly VITE_FIREBASE_PROJECT_ID?: string;
	readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
	readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
	readonly VITE_FIREBASE_APP_ID?: string;
	readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
	readonly VITE_AUTH_EXCHANGE_URL?: string;
	readonly VITE_CREATORS_API_URL?: string;
	readonly VITE_WS_URL?: string;
	readonly VITE_AGORA_APP_ID?: string;
	readonly VITE_AGORA_TOKEN_ENDPOINT?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
