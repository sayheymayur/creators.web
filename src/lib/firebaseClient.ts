import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirebaseConfig } from '../config/firebase';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

export function getFirebaseApp(): FirebaseApp {
	if (firebaseApp) return firebaseApp;
	firebaseApp = getApps()[0] ?? initializeApp(getFirebaseConfig());
	return firebaseApp;
}

export function getFirebaseAuth(): Auth {
	if (firebaseAuth) return firebaseAuth;
	firebaseAuth = getAuth(getFirebaseApp());
	return firebaseAuth;
}

export function getGoogleProvider(): GoogleAuthProvider {
	if (googleProvider) return googleProvider;
	googleProvider = new GoogleAuthProvider();
	googleProvider.setCustomParameters({ prompt: 'select_account' });
	return googleProvider;
}
