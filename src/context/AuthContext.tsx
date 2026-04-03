import React, { createContext, useCallback, useContext, useReducer } from 'react';
import { signInWithPopup, signOut, signOut as firebaseSignOut, type User as FirebaseUser } from 'firebase/auth';
import type { User, Creator } from '../types';
import { mockCreators, mockFanUser, mockAdminUser, DEMO_ACCOUNTS } from '../data/users';
import { delayMs } from '../utils/delay';
import { isFirebaseConfigured, firebaseMissingConfigKeys } from '../config/firebase';
import { getFirebaseAuth, getGoogleProvider } from '../lib/firebaseClient';
import { exchangeFirebaseToken } from '../services/authApi';

interface AuthState {
	user: User | null;
	isAuthenticated: boolean;
	isAgeVerified: boolean;
	pendingEmail: string;
	loginError: string;
	creatorProfiles: Record<string, Creator>;
}

type AuthAction =
	| { type: 'LOGIN', payload: User } |
	{ type: 'LOGOUT' } |
	{ type: 'SET_AGE_VERIFIED' } |
	{ type: 'SET_PENDING_EMAIL', payload: string } |
	{ type: 'SET_ERROR', payload: string } |
	{ type: 'CLEAR_ERROR' } |
	{ type: 'UPDATE_USER', payload: Partial<User> } |
	{ type: 'UPDATE_WALLET', payload: number } |
	{ type: 'UPDATE_CREATOR_PROFILE', payload: Partial<Creator> };

const initialState: AuthState = {
	user: null,
	isAuthenticated: false,
	isAgeVerified: false,
	pendingEmail: '',
	loginError: '',
	creatorProfiles: {},
};

function createCreatorProfileFromUser(user: User): Creator {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		username: user.username,
		avatar: user.avatar,
		role: 'creator',
		createdAt: user.createdAt,
		isAgeVerified: user.isAgeVerified,
		status: user.status,
		walletBalance: user.walletBalance,
		bio: 'Tell fans about your content and what they can expect.',
		banner: 'https://images.pexels.com/photos/3756766/pexels-photo-3756766.jpeg?auto=compress&cs=tinysrgb&w=1200&h=400&fit=crop',
		subscriptionPrice: 9.99,
		totalEarnings: 0,
		monthlyEarnings: 0,
		tipsReceived: 0,
		subscriberCount: 0,
		kycStatus: 'not_submitted',
		isKYCVerified: false,
		category: 'Lifestyle',
		isOnline: false,
		postCount: 0,
		likeCount: 0,
		monthlyStats: [],
		perMinuteRate: 2.99,
		liveStreamEnabled: false,
	};
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
	switch (action.type) {
		case 'LOGIN':
			return { ...state, user: action.payload, isAuthenticated: true, loginError: '' };
		case 'LOGOUT':
			return { ...initialState };
		case 'SET_AGE_VERIFIED':
			return { ...state, isAgeVerified: true };
		case 'SET_PENDING_EMAIL':
			return { ...state, pendingEmail: action.payload };
		case 'SET_ERROR':
			return { ...state, loginError: action.payload };
		case 'CLEAR_ERROR':
			return { ...state, loginError: '' };
		case 'UPDATE_USER':
			if (!state.user) return state;
			return {
				...state,
				user: { ...state.user, ...action.payload },
				creatorProfiles: state.user.role === 'creator' && state.creatorProfiles[state.user.id] ?
					{
						...state.creatorProfiles,
						[state.user.id]: {
							...state.creatorProfiles[state.user.id],
							...action.payload,
						},
					} :
					state.creatorProfiles,
			};
		case 'UPDATE_WALLET':
			return {
				...state,
				user: state.user ? { ...state.user, walletBalance: action.payload } : null,
				creatorProfiles: state.user?.role === 'creator' && state.creatorProfiles[state.user.id] ?
					{
						...state.creatorProfiles,
						[state.user.id]: {
							...state.creatorProfiles[state.user.id],
							walletBalance: action.payload,
						},
					} :
					state.creatorProfiles,
			};
		case 'UPDATE_CREATOR_PROFILE':
			if (!state.user || state.user.role !== 'creator') return state;
			return {
				...state,
				creatorProfiles: {
					...state.creatorProfiles,
					[state.user.id]: {
						...(state.creatorProfiles[state.user.id] ?? createCreatorProfileFromUser(state.user)),
						...action.payload,
						id: state.user.id,
					},
				},
			};
		default:
			return state;
	}
}

interface AuthContextValue {
	state: AuthState;
	login: (email: string, password: string) => Promise<boolean>;
	loginWithGoogle: (role: 'fan' | 'creator') => Promise<User | null>;
	logout: () => void;
	verifyAge: () => void;
	setPendingEmail: (email: string) => void;
	updateUser: (data: Partial<User>) => void;
	updateCreatorProfile: (data: Partial<Creator>) => void;
	updateWallet: (amount: number) => void;
	clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeUsername(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')
		.slice(0, 20) || 'user';
}

function createFallbackGoogleUser(firebaseUser: FirebaseUser, preferredRole: 'fan' | 'creator'): User {
	const email = firebaseUser.email ?? '';
	const displayName = firebaseUser.displayName?.trim() || email.split('@')[0] || 'New User';

	return {
		id: `google-${firebaseUser.uid}`,
		email,
		name: displayName,
		username: normalizeUsername(displayName || email),
		avatar: firebaseUser.photoURL ?? 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
		role: preferredRole,
		createdAt: new Date().toISOString(),
		isAgeVerified: true,
		status: 'active',
		walletBalance: 0,
	};
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(authReducer, initialState);

	const login = useCallback((email: string, password: string): Promise<boolean> => {
		dispatch({ type: 'CLEAR_ERROR' });
		return delayMs(800).then(() => {
			const emailLower = email.toLowerCase().trim();

			if (emailLower === DEMO_ACCOUNTS.fan.email && password === DEMO_ACCOUNTS.fan.password) {
				dispatch({ type: 'LOGIN', payload: mockFanUser });
				return true;
			}

			if (emailLower === DEMO_ACCOUNTS.creator.email && password === DEMO_ACCOUNTS.creator.password) {
				const creatorUser = mockCreators[0];
				dispatch({ type: 'LOGIN', payload: creatorUser });
				return true;
			}

			if (emailLower === DEMO_ACCOUNTS.admin.email && password === DEMO_ACCOUNTS.admin.password) {
				dispatch({ type: 'LOGIN', payload: mockAdminUser });
				return true;
			}

			dispatch({ type: 'SET_ERROR', payload: 'Invalid email or password. Try the demo accounts!' });
			return false;
		});
	}, []);

	const loginWithGoogle = useCallback((role: 'fan' | 'creator'): Promise<User | null> => {
		dispatch({ type: 'CLEAR_ERROR' });
		if (!isFirebaseConfigured) {
			dispatch({
				type: 'SET_ERROR',
				payload: `Firebase is not configured. Missing: ${firebaseMissingConfigKeys.join(', ')}`,
			});
			return Promise.resolve(null);
		}

		return signInWithPopup(getFirebaseAuth(), getGoogleProvider())
			.then(result => result.user.getIdToken().then(idToken => ({ firebaseUser: result.user, idToken })))
			.then(({ firebaseUser, idToken }) =>
				exchangeFirebaseToken(idToken, role).then(apiUser => ({ firebaseUser, apiUser }))
			)
			.then(({ firebaseUser, apiUser }) => {
				const fallbackUser: User = {
					id: firebaseUser.uid,
					email: firebaseUser.email ?? '',
					name: firebaseUser.displayName ?? 'New user',
					username: (firebaseUser.email ?? `user_${firebaseUser.uid.slice(0, 6)}`).split('@')[0],
					avatar: firebaseUser.photoURL ?? 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg',
					role,
					createdAt: new Date().toISOString(),
					isAgeVerified: true,
					status: 'active',
					walletBalance: 0,
				};

				const user = apiUser ?? fallbackUser;
				dispatch({ type: 'LOGIN', payload: user });
				return user;
			})
			.catch(error => {
				const errorMessage = error instanceof Error ? error.message : 'Google sign-in failed';
				dispatch({ type: 'SET_ERROR', payload: errorMessage });
				return null;
			});
	}, []);

	const logout = useCallback(() => {
		if (isFirebaseConfigured) {
			void signOut(getFirebaseAuth()).finally(() => {
				dispatch({ type: 'LOGOUT' });
			});
			return;
		}
		dispatch({ type: 'LOGOUT' });

		if (!isFirebaseConfigured) return;
		void firebaseSignOut(getFirebaseAuth()).catch(() => {
			// Keep logout resilient even if Firebase session clear fails.
		});
	}, []);

	const verifyAge = useCallback(() => {
		dispatch({ type: 'SET_AGE_VERIFIED' });
	}, []);

	const setPendingEmail = useCallback((email: string) => {
		dispatch({ type: 'SET_PENDING_EMAIL', payload: email });
	}, []);

	const updateUser = useCallback((data: Partial<User>) => {
		dispatch({ type: 'UPDATE_USER', payload: data });
	}, []);

	const updateCreatorProfile = useCallback((data: Partial<Creator>) => {
		dispatch({ type: 'UPDATE_CREATOR_PROFILE', payload: data });
	}, []);

	const updateWallet = useCallback((amount: number) => {
		dispatch({ type: 'UPDATE_WALLET', payload: amount });
	}, []);

	const clearError = useCallback(() => {
		dispatch({ type: 'CLEAR_ERROR' });
	}, []);

	return (
		<AuthContext.Provider value={{
			state,
			login,
			loginWithGoogle,
			logout,
			verifyAge,
			setPendingEmail,
			updateUser,
			updateWallet,
			clearError,
		}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth must be used within AuthProvider');
	return ctx;
}

export function useCurrentCreator(): Creator | null {
	const { state } = useAuth();
	if (!state.user || state.user.role !== 'creator') return null;
	const currentUser = state.user;
	const creatorMatch = mockCreators.find(c => c.id === currentUser.id);
	if (creatorMatch) return creatorMatch;

	return {
		...mockCreators[0],
		id: currentUser.id,
		name: currentUser.name,
		email: currentUser.email,
		username: currentUser.username,
		avatar: currentUser.avatar,
		createdAt: currentUser.createdAt,
		status: currentUser.status,
		walletBalance: currentUser.walletBalance,
	};
}
