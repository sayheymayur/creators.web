import type { FirebaseOptions } from 'firebase/app';

type FirebaseEnvKey =
	| 'VITE_FIREBASE_API_KEY' |
	'VITE_FIREBASE_AUTH_DOMAIN' |
	'VITE_FIREBASE_PROJECT_ID' |
	'VITE_FIREBASE_STORAGE_BUCKET' |
	'VITE_FIREBASE_MESSAGING_SENDER_ID' |
	'VITE_FIREBASE_APP_ID';

const REQUIRED_FIREBASE_KEYS: FirebaseEnvKey[] = [
	'VITE_FIREBASE_API_KEY',
	'VITE_FIREBASE_AUTH_DOMAIN',
	'VITE_FIREBASE_PROJECT_ID',
	'VITE_FIREBASE_STORAGE_BUCKET',
	'VITE_FIREBASE_MESSAGING_SENDER_ID',
	'VITE_FIREBASE_APP_ID',
];

const missingFirebaseKeys = REQUIRED_FIREBASE_KEYS.filter(key => !import.meta.env[key]?.trim());

export const isFirebaseConfigured = missingFirebaseKeys.length === 0;
export const firebaseMissingConfigKeys = missingFirebaseKeys;

export function getFirebaseConfig(): FirebaseOptions {
	if (!isFirebaseConfigured) {
		throw new Error(`Firebase config missing: ${missingFirebaseKeys.join(', ')}`);
	}

	return {
		apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
		authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
		projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
		storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
		messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
		appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
		measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
	};
}
