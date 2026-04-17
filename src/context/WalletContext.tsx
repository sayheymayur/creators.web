import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { Transaction, Subscription } from '../types';
import { mockTransactions, mockSubscriptions } from '../data/transactions';
import { useAuth } from './AuthContext';
import { isPaymentCancelled, runExternalPayment, usdToInr } from '../services/payments';

interface WalletState {
	transactions: Transaction[];
	subscriptions: Subscription[];
}

type WalletAction =
	| { type: 'ADD_TRANSACTION', payload: Transaction } |
	{ type: 'ADD_SUBSCRIPTION', payload: Subscription } |
	{ type: 'CANCEL_SUBSCRIPTION', payload: string } |
	{ type: 'TOGGLE_AUTO_RENEW', payload: string };

const initialState: WalletState = {
	transactions: mockTransactions,
	subscriptions: mockSubscriptions,
};

function walletReducer(state: WalletState, action: WalletAction): WalletState {
	switch (action.type) {
		case 'ADD_TRANSACTION':
			return { ...state, transactions: [action.payload, ...state.transactions] };
		case 'ADD_SUBSCRIPTION':
			return { ...state, subscriptions: [action.payload, ...state.subscriptions] };
		case 'CANCEL_SUBSCRIPTION':
			return {
				...state,
				subscriptions: state.subscriptions.map(s =>
					s.id === action.payload ? { ...s, isActive: false, autoRenew: false } : s
				),
			};
		case 'TOGGLE_AUTO_RENEW':
			return {
				...state,
				subscriptions: state.subscriptions.map(s =>
					s.id === action.payload ? { ...s, autoRenew: !s.autoRenew } : s
				),
			};
		default:
			return state;
	}
}

interface WalletContextValue {
	state: WalletState;
	addFunds: (amount: number) => void;
	addFundsExternally: (amountUSD: number) => Promise<boolean>;
	deductFunds: (amount: number, type: Transaction['type'], description: string, recipientId?: string, recipientName?: string) => boolean;
	payExternally: (amountUSD: number, type: Transaction['type'], description: string, recipientId?: string, recipientName?: string) => Promise<{ ok: boolean, cancelled?: boolean, error?: string }>;
	cancelSubscription: (subscriptionId: string) => void;
	toggleAutoRenew: (subscriptionId: string) => void;
	addSubscription: (subscription: Subscription) => void;
	getUserTransactions: (userId: string) => Transaction[];
	getUserSubscriptions: (userId: string) => Subscription[];
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(walletReducer, initialState);
	const { state: authState, updateWallet } = useAuth();

	const addFunds = useCallback((amount: number) => {
		if (!authState.user) return;
		const newBalance = authState.user.walletBalance + amount;
		updateWallet(newBalance);
		const tx: Transaction = {
			id: `tx-${Date.now()}`,
			userId: authState.user.id,
			type: 'deposit',
			amount,
			createdAt: new Date().toISOString(),
			description: 'Wallet top-up',
			status: 'completed',
		};
		dispatch({ type: 'ADD_TRANSACTION', payload: tx });
	}, [authState.user, updateWallet]);

	const deductFunds = useCallback((
		amount: number,
		type: Transaction['type'],
		description: string,
		recipientId?: string,
		recipientName?: string
	): boolean => {
		if (!authState.user) return false;
		if (authState.user.walletBalance < amount) return false;
		const newBalance = authState.user.walletBalance - amount;
		updateWallet(newBalance);
		const tx: Transaction = {
			id: `tx-${Date.now()}`,
			userId: authState.user.id,
			type,
			amount: -amount,
			createdAt: new Date().toISOString(),
			description,
			recipientId,
			recipientName,
			status: 'completed',
		};
		dispatch({ type: 'ADD_TRANSACTION', payload: tx });
		return true;
	}, [authState.user, updateWallet]);

	const cancelSubscription = useCallback((subscriptionId: string) => {
		dispatch({ type: 'CANCEL_SUBSCRIPTION', payload: subscriptionId });
	}, []);

	const toggleAutoRenew = useCallback((subscriptionId: string) => {
		dispatch({ type: 'TOGGLE_AUTO_RENEW', payload: subscriptionId });
	}, []);

	const addSubscription = useCallback((subscription: Subscription) => {
		dispatch({ type: 'ADD_SUBSCRIPTION', payload: subscription });
	}, []);

	const addFundsExternally = useCallback((amountUSD: number): Promise<boolean> => {
		const user = authState.user;
		if (!user) return Promise.resolve(false);
		const inr = usdToInr(amountUSD);

		return runExternalPayment({
			amountINR: inr,
			description: `Add $${amountUSD.toFixed(2)} to wallet`,
			userName: user.name,
			userEmail: user.email,
			notes: { type: 'deposit', userId: user.id },
		}).then(result => {
			const newBalance = user.walletBalance + amountUSD;
			updateWallet(newBalance);
			const tx: Transaction = {
				id: `tx-${Date.now()}-${result.referenceId}`,
				userId: user.id,
				type: 'deposit',
				amount: amountUSD,
				createdAt: new Date().toISOString(),
				description: 'Wallet top-up',
				status: 'completed',
			};
			dispatch({ type: 'ADD_TRANSACTION', payload: tx });
			return true;
		}).catch(err => {
			if (!isPaymentCancelled(err)) {
				console.error('[wallet] addFundsExternally failed:', err);
			}
			return false;
		});
	}, [authState.user, updateWallet]);

	const payExternally = useCallback((
		amountUSD: number,
		type: Transaction['type'],
		description: string,
		recipientId?: string,
		recipientName?: string
	): Promise<{ ok: boolean, cancelled?: boolean, error?: string }> => {
		const user = authState.user;
		if (!user) return Promise.resolve({ ok: false, error: 'Not authenticated' });
		const inr = usdToInr(amountUSD);

		return runExternalPayment({
			amountINR: inr,
			description,
			userName: user.name,
			userEmail: user.email,
			notes: { type, userId: user.id, recipientId: recipientId ?? '' },
		}).then(result => {
			const tx: Transaction = {
				id: `tx-${Date.now()}-${result.referenceId}`,
				userId: user.id,
				type,
				amount: -amountUSD,
				createdAt: new Date().toISOString(),
				description,
				recipientId,
				recipientName,
				status: 'completed',
			};
			dispatch({ type: 'ADD_TRANSACTION', payload: tx });
			return { ok: true };
		}).catch(err => {
			if (isPaymentCancelled(err)) {
				return { ok: false, cancelled: true };
			}
			const msg = err instanceof Error ? err.message : 'Payment failed';
			console.error('[wallet] payExternally failed:', msg);
			return { ok: false, error: msg };
		});
	}, [authState.user]);

	const getUserTransactions = useCallback((userId: string) => {
		return state.transactions.filter(t => t.userId === userId);
	}, [state.transactions]);

	const getUserSubscriptions = useCallback((userId: string) => {
		return state.subscriptions.filter(s => s.userId === userId);
	}, [state.subscriptions]);

	return (
		<WalletContext.Provider value={{
			state, addFunds, addFundsExternally, deductFunds, payExternally, cancelSubscription,
			toggleAutoRenew, addSubscription, getUserTransactions, getUserSubscriptions,
		}}
		>
			{children}
		</WalletContext.Provider>
	);
}

export function useWallet() {
	const ctx = useContext(WalletContext);
	if (!ctx) throw new Error('useWallet must be used within WalletProvider');
	return ctx;
}
