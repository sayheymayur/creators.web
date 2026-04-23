const REQUIRED_FIREBASE_KEYS = [
	'VITE_FIREBASE_API_KEY',
	'VITE_FIREBASE_AUTH_DOMAIN',
	'VITE_FIREBASE_PROJECT_ID',
	'VITE_FIREBASE_STORAGE_BUCKET',
	'VITE_FIREBASE_MESSAGING_SENDER_ID',
	'VITE_FIREBASE_APP_ID',
] as const;

type RequiredFirebaseKey = (typeof REQUIRED_FIREBASE_KEYS)[number];

function readEnvValue(key: RequiredFirebaseKey): string {
	return import.meta.env[key]?.trim() ?? '';
}

export const firebaseMissingConfigKeys = REQUIRED_FIREBASE_KEYS.filter(key => !readEnvValue(key));

export const isFirebaseConfigured = firebaseMissingConfigKeys.length === 0;

export function getFirebaseConfig() {
	return {
		apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
		authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
		projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
		storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
		messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
		appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
		measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
	};
}
