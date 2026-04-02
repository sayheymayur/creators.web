import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { User, Creator } from '../types';
import { mockCreators, mockFanUser, mockAdminUser, DEMO_ACCOUNTS } from '../data/users';
import { delayMs } from '../utils/delay';

interface AuthState {
	user: User | null;
	isAuthenticated: boolean;
	isAgeVerified: boolean;
	pendingEmail: string;
	loginError: string;
}

type AuthAction =
	| { type: 'LOGIN', payload: User } |
	{ type: 'LOGOUT' } |
	{ type: 'SET_AGE_VERIFIED' } |
	{ type: 'SET_PENDING_EMAIL', payload: string } |
	{ type: 'SET_ERROR', payload: string } |
	{ type: 'CLEAR_ERROR' } |
	{ type: 'UPDATE_USER', payload: Partial<User> } |
	{ type: 'UPDATE_WALLET', payload: number };

const initialState: AuthState = {
	user: null,
	isAuthenticated: false,
	isAgeVerified: false,
	pendingEmail: '',
	loginError: '',
};

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
			return { ...state, user: state.user ? { ...state.user, ...action.payload } : null };
		case 'UPDATE_WALLET':
			return {
				...state,
				user: state.user ? { ...state.user, walletBalance: action.payload } : null,
			};
		default:
			return state;
	}
}

interface AuthContextValue {
	state: AuthState;
	login: (email: string, password: string) => Promise<boolean>;
	logout: () => void;
	verifyAge: () => void;
	setPendingEmail: (email: string) => void;
	updateUser: (data: Partial<User>) => void;
	updateWallet: (amount: number) => void;
	clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

	const logout = useCallback(() => {
		dispatch({ type: 'LOGOUT' });
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

	const updateWallet = useCallback((amount: number) => {
		dispatch({ type: 'UPDATE_WALLET', payload: amount });
	}, []);

	const clearError = useCallback(() => {
		dispatch({ type: 'CLEAR_ERROR' });
	}, []);

	return (
		<AuthContext.Provider value={{ state, login, logout, verifyAge, setPendingEmail, updateUser, updateWallet, clearError }}>
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
	return mockCreators.find(c => c.id === state.user!.id) ?? null;
}
