import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirebaseConfig } from '../config/firebase';

function getFirebaseApp() {
	if (getApps().length > 0) {
		return getApp();
	}
	return initializeApp(getFirebaseConfig());
}

export function getFirebaseAuth() {
	return getAuth(getFirebaseApp());
}

export function getGoogleProvider() {
	const provider = new GoogleAuthProvider();
	provider.setCustomParameters({ prompt: 'select_account' });
	return provider;
}
