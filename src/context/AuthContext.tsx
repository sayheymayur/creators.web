import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signInWithPopup, signOut, signOut as firebaseSignOut } from 'firebase/auth';
import type { User, Creator } from '../types';
import { mockCreators } from '../data/users';
import { delayMs } from '../utils/delay';
import { isFirebaseConfigured, firebaseMissingConfigKeys } from '../config/firebase';
import { getFirebaseAuth, getGoogleProvider } from '../lib/firebaseClient';
import { creatorsApi, ApiError } from '../services/creatorsApi';
import { clearSessionToken, getSessionToken } from '../services/sessionToken';
import { clearStoredUser, setStoredUser } from '../services/sessionUser';
import { clearPaymentGatewayCache } from '../services/payments';
import { runCreatorsWsTeardown } from '../services/wsLogoutRegistry';
import { ZERO_MINOR } from '../utils/money';

interface AuthState {
	user: User | null;
	isAuthenticated: boolean;
	isAgeVerified: boolean;
	pendingEmail: string;
	loginError: string;
	creatorProfiles: Record<string, Creator>;
}

export type AuthStatus = 'unknown' | 'guest' | 'authenticated';

type AuthAction =
	| { type: 'LOGIN', payload: User } |
	{ type: 'LOGOUT' } |
	{ type: 'SET_AGE_VERIFIED' } |
	{ type: 'SET_PENDING_EMAIL', payload: string } |
	{ type: 'SET_ERROR', payload: string } |
	{ type: 'CLEAR_ERROR' } |
	{ type: 'UPDATE_USER', payload: Partial<User> } |
	{ type: 'UPDATE_WALLET_MINOR', payload: string } |
	{ type: 'UPDATE_CREATOR_PROFILE', payload: Partial<Creator> };

const initialState: AuthState = {
	user: null,
	isAuthenticated: false,
	isAgeVerified: false,
	pendingEmail: '',
	loginError: '',
	creatorProfiles: {},
};

/** Ensure `walletBalanceMinor` and string `id` for API / mock user payloads. */
function normalizeUserFromApi(payload: User): User {
	const raw = payload as unknown as Record<string, unknown>;
	const id =
		typeof raw.id === 'string' ? raw.id :
		typeof raw.id === 'number' ? String(raw.id) :
		'';

	let minor =
		typeof raw.walletBalanceMinor === 'string' ? raw.walletBalanceMinor :
		typeof raw.walletBalanceMinor === 'number' ? String(raw.walletBalanceMinor) :
		'';
	if (!minor && raw.walletBalance != null) {
		// Backend spec: `walletBalance` on GET /me user payload.
		// Treat numeric as INR rupees and convert to paise; accept stringified minor as-is.
		if (typeof raw.walletBalance === 'number') {
			minor = String(Math.max(0, Math.round(raw.walletBalance * 100)));
		} else if (typeof raw.walletBalance === 'string' && /^\d+$/.test(raw.walletBalance.trim())) {
			minor = raw.walletBalance.trim();
		}
	}
	if (!minor) minor = ZERO_MINOR;
	return {
		...payload,
		id,
		walletBalanceMinor: /^\d+$/.test(minor) ? minor : ZERO_MINOR,
	};
}

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
		walletBalanceMinor: user.walletBalanceMinor,
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
			return {
				...state,
				user: normalizeUserFromApi(action.payload),
				isAuthenticated: true,
				loginError: '',
			};
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
		case 'UPDATE_WALLET_MINOR':
			return {
				...state,
				user: state.user ? { ...state.user, walletBalanceMinor: action.payload } : null,
				creatorProfiles: state.user?.role === 'creator' && state.creatorProfiles[state.user.id] ?
					{
						...state.creatorProfiles,
						[state.user.id]: {
							...state.creatorProfiles[state.user.id],
							walletBalanceMinor: action.payload,
						},
					} :
					state.creatorProfiles,
			};
		case 'UPDATE_CREATOR_PROFILE':
			if (state.user?.role !== 'creator') return state;
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
	authStatus: AuthStatus;
	sessionRestoreError: string | null;
	retrySessionRestore: () => void;
	/** Force-refresh the current session user via GET /me (updates creatorDashboard). */
	refreshMe: () => Promise<void>;
	login: (email: string, password: string) => Promise<boolean>;
	register: (email: string, password: string, displayName: string, role: 'fan' | 'creator') => Promise<boolean>;
	loginWithGoogle: (role: 'fan' | 'creator') => Promise<User | null>;
	logout: () => void;
	verifyAge: () => void;
	setPendingEmail: (email: string) => void;
	updateUser: (data: Partial<User>) => void;
	updateCreatorProfile: (data: Partial<Creator>) => void;
	updateWalletMinor: (balanceMinor: string) => void;
	clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(authReducer, initialState);
	const userRef = useRef<User | null>(null);
	userRef.current = state.user;
	const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (getSessionToken() ? 'unknown' : 'guest'));
	const [sessionRestoreError, setSessionRestoreError] = useState<string | null>(null);

	const restoreSession = useCallback((signal?: AbortSignal) => {
		const token = getSessionToken();
		if (!token) {
			clearStoredUser();
			setAuthStatus('guest');
			setSessionRestoreError(null);
			return Promise.resolve();
		}

		// Production-style bootstrapping:
		// - never show an authenticated UI until /me succeeds
		// - enforce a minimum loader duration to avoid flicker
		setAuthStatus('unknown');
		setSessionRestoreError(null);

		const minDelay = delayMs(3000);
		const restoreTimeoutMs = 10_000;

		const ac = new AbortController();
		let timedOut = false;
		const timeoutId = window.setTimeout(() => {
			timedOut = true;
			ac.abort();
		}, restoreTimeoutMs);

		if (signal) {
			if (signal.aborted) ac.abort();
			else signal.addEventListener('abort', () => ac.abort(), { once: true });
		}

		return Promise.all([creatorsApi.auth.me(ac.signal), minDelay])
			.then(([{ user }]) => {
				window.clearTimeout(timeoutId);
				if (signal?.aborted) return;
				if (!user) {
					clearSessionToken();
					clearStoredUser();
					setAuthStatus('guest');
					return;
				}
				dispatch({ type: 'LOGIN', payload: user });
				setStoredUser(user);
				setAuthStatus('authenticated');
			})
			.catch(err => {
				// Ensure the minimum loader duration applies on errors too.
				return minDelay.then(() => {
					window.clearTimeout(timeoutId);
					if (signal?.aborted) return;

					// If backend explicitly rejects the token, drop it and proceed as guest.
					if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
						clearSessionToken();
						clearStoredUser();
						setAuthStatus('guest');
						setSessionRestoreError(null);
						return;
					}

					// For transient failures (network/CORS/5xx), block behind the boot screen.
					// Clear any stored user snapshot so we never display stale authenticated UI.
					clearStoredUser();
					const msg = timedOut ?
						'Session restore timed out. Please retry.' :
						err instanceof ApiError ?
							`Session restore failed (HTTP ${err.status}).` :
							'Session restore failed.';
					setSessionRestoreError(msg);
					setAuthStatus('unknown');
				});
			});
	}, []);

	const retrySessionRestore = useCallback(() => {
		void restoreSession();
	}, [restoreSession]);

	useEffect(() => {
		// In React.StrictMode (dev), effects run setup+cleanup+setup to surface unsafe patterns.
		// We keep this effect idempotent: abort the in-flight request on cleanup and rerun on the next setup.
		const ac = new AbortController();
		void restoreSession(ac.signal);
		return () => ac.abort();
	}, []);

	const login = useCallback((email: string, password: string): Promise<boolean> => {
		dispatch({ type: 'CLEAR_ERROR' });
		return delayMs(250).then(() => {
			return creatorsApi.auth.login({ email, password })
				.then(() => creatorsApi.auth.me())
				.then(({ user }) => {
					if (!user) {
						dispatch({ type: 'SET_ERROR', payload: 'Login succeeded but user profile was missing.' });
						setAuthStatus('guest');
						return false;
					}
					dispatch({ type: 'LOGIN', payload: user });
					setStoredUser(user);
					setAuthStatus('authenticated');
					return true;
				})
				.catch(err => {
					if (err instanceof ApiError && err.status === 401) {
						dispatch({ type: 'SET_ERROR', payload: 'Invalid email or password.' });
						setAuthStatus('guest');
						return false;
					}
					dispatch({ type: 'SET_ERROR', payload: 'Login failed. Please try again.' });
					setAuthStatus('guest');
					return false;
				});
		});
	}, []);

	const register = useCallback((email: string, password: string, displayName: string, role: 'fan' | 'creator'): Promise<boolean> => {
		dispatch({ type: 'CLEAR_ERROR' });
		return creatorsApi.auth.register({ email, password, displayName, preferredRole: role })
			.then(() => creatorsApi.auth.me())
			.then(({ user }) => {
				if (!user) {
					dispatch({ type: 'SET_ERROR', payload: 'Registration succeeded but user profile was missing.' });
					setAuthStatus('guest');
					return false;
				}
				dispatch({ type: 'LOGIN', payload: user });
				setStoredUser(user);
				setAuthStatus('authenticated');
				return true;
			})
			.catch(err => {
				const msg = err instanceof ApiError && err.status >= 400 && err.status < 500 ?
					'Registration failed. Please check your details.' :
					'Registration failed. Please try again.';
				dispatch({ type: 'SET_ERROR', payload: msg });
				setAuthStatus('guest');
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
				creatorsApi.auth.firebaseExchange({ idToken, preferredRole: role })
					.then(() => ({ firebaseUser }))
			)
			.then(({ firebaseUser }) => {
				// Backend exchange is responsible for issuing our app JWT.
				// If it didn't mint/store a JWT, treat the session as unauthenticated.
				const token = getSessionToken();
				if (!token) {
					throw new Error('Google sign-in succeeded, but backend session token was missing.');
				}
				return creatorsApi.auth.me()
					.then(({ user }) => {
						if (!user) {
							throw new Error('Google sign-in succeeded, but user profile was missing.');
						}
						return user;
					})
					.catch(err => {
						// If backend rejects the token, clear local auth and surface a friendly error.
						if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
							throw new Error('Account not found. Please sign up first.');
						}
						throw err;
					})
					.finally(() => {
						// If backend exchange failed but Firebase session exists, we handle cleanup in catch below.
						void firebaseUser; // keep param used for potential debugging; no-op
					});
			})
			.then(user => {
				dispatch({ type: 'LOGIN', payload: user });
				setStoredUser(user);
				setAuthStatus('authenticated');
				return user;
			})
			.catch(error => {
				clearSessionToken();
				clearStoredUser();
				// Keep Firebase auth session aligned with backend auth.
				try {
					void signOut(getFirebaseAuth());
				} catch {
					// ignore
				}
				const errorMessage = error instanceof Error ? error.message : 'Google sign-in failed';
				dispatch({ type: 'SET_ERROR', payload: errorMessage });
				setAuthStatus('guest');
				return null;
			});
	}, []);

	const logout = useCallback(() => {
		void creatorsApi.auth.logout()
			.catch(() => {})
			.then(() => {
				clearPaymentGatewayCache();
				clearSessionToken();
				clearStoredUser();
				setAuthStatus('guest');
				setSessionRestoreError(null);
				return runCreatorsWsTeardown();
			})
			.then(() => {
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
			});
	}, []);

	const verifyAge = useCallback(() => {
		dispatch({ type: 'SET_AGE_VERIFIED' });
	}, []);

	const setPendingEmail = useCallback((email: string) => {
		dispatch({ type: 'SET_PENDING_EMAIL', payload: email });
	}, []);

	const updateUser = useCallback((data: Partial<User>) => {
		// Keep the session snapshot aligned so refresh doesn't show stale values (e.g. wallet balance).
		const u = userRef.current;
		if (u) setStoredUser({ ...u, ...data });
		dispatch({ type: 'UPDATE_USER', payload: data });
	}, []);

	const refreshMe = useCallback((): Promise<void> => {
		// Spec Phase 4: dashboard data is delivered via GET /me; refresh this after server-ledger events.
		const token = getSessionToken();
		if (!token) return Promise.resolve();
		return creatorsApi.auth.me()
			.then(({ user }) => {
				if (!user) return;
				updateUser(user);
				setStoredUser(user);
			})
			.catch(() => {
				// Keep refresh best-effort; session restore logic handles hard failures.
			});
	}, [updateUser]);

	const updateCreatorProfile = useCallback((data: Partial<Creator>) => {
		dispatch({ type: 'UPDATE_CREATOR_PROFILE', payload: data });
	}, []);

	const updateWalletMinor = useCallback((balanceMinor: string) => {
		const u = userRef.current;
		if (u) setStoredUser({ ...u, walletBalanceMinor: balanceMinor });
		dispatch({ type: 'UPDATE_WALLET_MINOR', payload: balanceMinor });
	}, []);

	const clearError = useCallback(() => {
		dispatch({ type: 'CLEAR_ERROR' });
	}, []);

	const contextValue = useMemo(
		() => ({
			state,
			authStatus: state.isAuthenticated ? 'authenticated' : authStatus,
			sessionRestoreError,
			retrySessionRestore,
			refreshMe,
			login,
			register,
			loginWithGoogle,
			logout,
			verifyAge,
			setPendingEmail,
			updateUser,
			updateCreatorProfile,
			updateWalletMinor,
			clearError,
		}),
		[
			state,
			authStatus,
			sessionRestoreError,
			retrySessionRestore,
			refreshMe,
			login,
			register,
			loginWithGoogle,
			logout,
			verifyAge,
			setPendingEmail,
			updateUser,
			updateCreatorProfile,
			updateWalletMinor,
			clearError,
		]
	);

	return (
		<AuthContext.Provider value={contextValue}>
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
	if (state.user?.role !== 'creator') return null;
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
		bio: currentUser.bio ?? mockCreators[0].bio,
		banner: currentUser.banner ?? mockCreators[0].banner,
		category: currentUser.category ?? mockCreators[0].category,
		createdAt: currentUser.createdAt,
		status: currentUser.status,
		walletBalanceMinor: currentUser.walletBalanceMinor,
	};
}
