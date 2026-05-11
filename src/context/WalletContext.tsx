import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo, useState } from 'react';
import type { Transaction, Subscription, User } from '../types';
import { mockSubscriptions } from '../data/transactions';
import { useAuth } from './AuthContext';
import { useWs, useWsConnected } from './WsContext';
import { openRazorpayCheckout, isPaymentCancelled } from '../services/razorpay';
import { createPaymentWs, type LedgerTransactionRow, type RazorpayOrderRow } from '../services/paymentWs';
import { creatorsApi } from '../services/creatorsApi';
import { compareMinor, subtractMinor, addMinor, inrRupeesToMinor, parseMinor } from '../utils/money';
import { getSessionToken } from '../services/sessionToken';

interface WalletState {
	/** Local-only rows (e.g. wallet pay / demo top-up before server ledger reflects). */
	transactions: Transaction[];
	subscriptions: Subscription[];
	ledgerRows: LedgerTransactionRow[];
	razorpayOrders: RazorpayOrderRow[];
	historyNextCursor: string | null;
	walletError: string | null;
}

type WalletAction =
	{ type: 'ADD_TRANSACTION', payload: Transaction } |
	{ type: 'ADD_SUBSCRIPTION', payload: Subscription } |
	{ type: 'CANCEL_SUBSCRIPTION', payload: string } |
	{ type: 'TOGGLE_AUTO_RENEW', payload: string } |
	{ type: 'SET_LEDGER', payload: { rows: LedgerTransactionRow[], nextCursor: string | null } } |
	{ type: 'APPEND_LEDGER', payload: { rows: LedgerTransactionRow[], nextCursor: string | null } } |
	{ type: 'SET_ORDERS', payload: RazorpayOrderRow[] } |
	{ type: 'SET_WALLET_ERROR', payload: string | null };

const initialState: WalletState = {
	transactions: [],
	subscriptions: mockSubscriptions,
	ledgerRows: [],
	razorpayOrders: [],
	historyNextCursor: null,
	walletError: null,
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
		case 'SET_LEDGER':
			return {
				...state,
				ledgerRows: action.payload.rows,
				historyNextCursor: action.payload.nextCursor,
			};
		case 'APPEND_LEDGER': {
			const existingIds = new globalThis.Set(state.ledgerRows.map(r => r.id));
			const appended = action.payload.rows.filter(r => !existingIds.has(r.id));
			return {
				...state,
				ledgerRows: [...state.ledgerRows, ...appended],
				historyNextCursor: action.payload.nextCursor,
			};
		}
		case 'SET_ORDERS':
			return { ...state, razorpayOrders: action.payload };
		case 'SET_WALLET_ERROR':
			return { ...state, walletError: action.payload };
		default:
			return state;
	}
}

function ledgerRowToTransaction(row: LedgerTransactionRow, userId: string): Transaction {
	const minor = parseMinor(row.amount_cents);
	const rupees = Number(minor) / 100;
	const isCredit = row.type === 'credit';
	const ref = row.reference_type.toLowerCase();
	let t: Transaction['type'] = isCredit ? 'deposit' : 'withdrawal';
	if (ref.includes('subscription')) t = 'subscription';
	else if (ref.includes('tip')) t = 'tip';
	else if (ref.includes('ppv') || ref.includes('unlock')) t = 'ppv';
	else if (ref.includes('gift')) t = 'gift';
	else if (ref.includes('session')) t = 'session';
	return {
		id: row.id,
		userId,
		type: t,
		amount: isCredit ? rupees : -rupees,
		createdAt: row.created_at,
		description: `${row.reference_type}${row.reference_id ? ` · ${row.reference_id}` : ''}`,
		status: 'completed',
	};
}

interface WalletContextValue {
	state: WalletState;
	ledgerRows: LedgerTransactionRow[];
	razorpayOrders: RazorpayOrderRow[];
	historyNextCursor: string | null;
	/** True after we have fetched balance from the payment source at least once. */
	hasSyncedBalance: boolean;
	refreshBalance: () => Promise<void>;
	refreshLedger: () => Promise<void>;
	loadMoreLedger: () => Promise<void>;
	refreshOrders: () => Promise<void>;
	refreshWalletData: () => Promise<void>;
	addFunds: (amount: number) => void;
	addFundsViaRazorpay: (amountInr: number) => Promise<boolean>;
	deductFunds: (amount: number, type: Transaction['type'], description: string, recipientId?: string, recipientName?: string) => boolean;
	payViaRazorpay: (amountRupees: number, type: Transaction['type'], description: string, recipientId?: string, recipientName?: string) => Promise<{ ok: boolean, cancelled?: boolean, error?: string }>;
	/** Backwards-compatible name used by older modals. */
	payExternally: (amountRupees: number, type: Transaction['type'], description: string, recipientId?: string, recipientName?: string) => Promise<{ ok: boolean, cancelled?: boolean, error?: string }>;
	cancelSubscription: (subscriptionId: string) => void;
	toggleAutoRenew: (subscriptionId: string) => void;
	addSubscription: (subscription: Subscription) => void;
	getUserTransactions: (userId: string) => Transaction[];
	getUserSubscriptions: (userId: string) => Subscription[];
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(walletReducer, initialState);
	const { state: authState, updateWalletMinor } = useAuth();
	const ws = useWs();
	const wsConnected = useWsConnected();
	const payment = useMemo(() => createPaymentWs(ws), [ws]);
	const [hasSyncedBalance, setHasSyncedBalance] = useState(false);

	const refreshBalance = useCallback(() => {
		const user = authState.user;
		if (!user || !wsConnected) return Promise.resolve();
		const token = getSessionToken();
		const authStep = token ? ws.authenticate(token).catch(e => {
			if (import.meta.env.DEV) console.error('[wallet] ws authenticate failed before balance', e);
		}) : Promise.resolve();

		return authStep
			.then(() => payment.balance())
			.then(b => {
				updateWalletMinor(b.balance_cents);
				setHasSyncedBalance(true);
			})
			.catch(e => {
				if (import.meta.env.DEV) console.error('[wallet] refreshBalance failed', e);
				dispatch({ type: 'SET_WALLET_ERROR', payload: e instanceof Error ? e.message : 'Failed to load balance' });
			});
	}, [authState.user, wsConnected, ws, payment, updateWalletMinor]);

	const refreshLedger = useCallback(() => {
		if (!authState.user || !wsConnected) return Promise.resolve();
		return payment.history(50)
			.then(data => {
				dispatch({ type: 'SET_LEDGER', payload: { rows: data.transactions, nextCursor: data.nextCursor } });
			})
			.catch(e => {
				dispatch({ type: 'SET_WALLET_ERROR', payload: e instanceof Error ? e.message : 'Failed to load history' });
			});
	}, [authState.user, wsConnected, payment]);

	const loadMoreLedger = useCallback(() => {
		if (!authState.user || !wsConnected || !state.historyNextCursor) return Promise.resolve();
		return payment.history(50, state.historyNextCursor)
			.then(data => {
				dispatch({ type: 'APPEND_LEDGER', payload: { rows: data.transactions, nextCursor: data.nextCursor } });
			})
			.catch(e => {
				dispatch({ type: 'SET_WALLET_ERROR', payload: e instanceof Error ? e.message : 'Failed to load more' });
			});
	}, [authState.user, wsConnected, payment, state.historyNextCursor]);

	const refreshOrders = useCallback(() => {
		if (!authState.user || !wsConnected) return Promise.resolve();
		return payment.orders(50)
			.then(data => {
				dispatch({ type: 'SET_ORDERS', payload: data.orders });
			})
			.catch(() => undefined);
	}, [authState.user, wsConnected, payment]);

	const refreshWalletData = useCallback(() => {
		dispatch({ type: 'SET_WALLET_ERROR', payload: null });
		return refreshBalance()
			.then(() => Promise.all([refreshLedger(), refreshOrders()]))
			.then(() => undefined);
	}, [refreshBalance, refreshLedger, refreshOrders]);

	useEffect(() => {
		setHasSyncedBalance(false);
		if (!authState.user || !wsConnected) return;
		let cancelled = false;
		dispatch({ type: 'SET_WALLET_ERROR', payload: null });
		const token = getSessionToken();
		const authStep = token ? ws.authenticate(token).catch(e => {
			if (import.meta.env.DEV) console.error('[wallet] ws authenticate failed during bootstrap', e);
		}) : Promise.resolve();

		void authStep
			.then(() => payment.balance())
			.then(b => {
				if (!cancelled) {
					updateWalletMinor(b.balance_cents);
					setHasSyncedBalance(true);
				}
			})
			.catch(e => {
				if (import.meta.env.DEV) console.error('[wallet] initial balance failed', e);
			})
			.then(() => Promise.all([payment.history(50), payment.orders(50)]))
			.then(([h, o]) => {
				if (!cancelled) {
					dispatch({ type: 'SET_LEDGER', payload: { rows: h.transactions, nextCursor: h.nextCursor } });
					dispatch({ type: 'SET_ORDERS', payload: o.orders });
				}
			})
			.catch(e => {
				if (import.meta.env.DEV) console.error('[wallet] initial wallet data failed', e);
			});
		return () => { cancelled = true; };
	}, [authState.user?.id, wsConnected, ws, payment, updateWalletMinor]);

	/** Local demo: add INR to balance without gateway (UI-only until server sync). */
	const addFunds = useCallback((amountInr: number) => {
		if (!authState.user || amountInr <= 0) return;
		const creditMinor = String(Math.round(amountInr * 100));
		updateWalletMinor(addMinor(authState.user.walletBalanceMinor, creditMinor));
		const tx: Transaction = {
			id: `tx-${Date.now()}`,
			userId: authState.user.id,
			type: 'deposit',
			amount: amountInr,
			createdAt: new Date().toISOString(),
			description: 'Wallet top-up',
			status: 'completed',
		};
		dispatch({ type: 'ADD_TRANSACTION', payload: tx });
	}, [authState.user, updateWalletMinor]);

	const deductFunds = useCallback((
		amountRupees: number,
		type: Transaction['type'],
		description: string,
		recipientId?: string,
		recipientName?: string
	): boolean => {
		if (!authState.user) return false;
		const debitMinor = inrRupeesToMinor(amountRupees);
		if (!compareMinor(authState.user.walletBalanceMinor, '>=', debitMinor)) return false;
		updateWalletMinor(subtractMinor(authState.user.walletBalanceMinor, debitMinor));
		const rupees = Number(parseMinor(debitMinor)) / 100;
		const tx: Transaction = {
			id: `tx-${Date.now()}`,
			userId: authState.user.id,
			type,
			amount: -rupees,
			createdAt: new Date().toISOString(),
			description,
			recipientId,
			recipientName,
			status: 'completed',
		};
		dispatch({ type: 'ADD_TRANSACTION', payload: tx });
		return true;
	}, [authState.user, updateWalletMinor]);

	const cancelSubscription = useCallback((subscriptionId: string) => {
		dispatch({ type: 'CANCEL_SUBSCRIPTION', payload: subscriptionId });
	}, []);

	const toggleAutoRenew = useCallback((subscriptionId: string) => {
		dispatch({ type: 'TOGGLE_AUTO_RENEW', payload: subscriptionId });
	}, []);

	const addSubscription = useCallback((subscription: Subscription) => {
		dispatch({ type: 'ADD_SUBSCRIPTION', payload: subscription });
	}, []);

	/**
	 * Create server order → Razorpay Checkout (or local dev confirm) → POST confirm.
	 * Updates wallet + ledger from API (no synthetic local-only transactions).
	 */
	const settleRazorpayWithServer = useCallback((
		amountInr: number,
		checkoutDescription: string,
		user: User,
		apiOrderNotes: Record<string, unknown>
	): Promise<void> => {
		const amountMinor = Math.round(amountInr * 100);
		if (amountMinor <= 0) {
			return Promise.reject(new Error('Amount must be greater than zero'));
		}

		const formatNoteValue = (val: unknown): string => {
			if (val == null) return '';
			if (typeof val === 'string') return val;
			if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') return String(val);
			if (val instanceof Date) return val.toISOString();
			try {
				return JSON.stringify(val);
			} catch {
				return '';
			}
		};

		const checkoutNotes: Record<string, string> = {};
		for (const [k, v] of Object.entries(apiOrderNotes)) {
			if (v === undefined) continue;
			checkoutNotes[k] = formatNoteValue(v);
		}

		const createOrder = wsConnected ?
			payment.createOrder(String(amountMinor), 'INR') :
			creatorsApi.payments.razorpayCreateOrder({
				amountMinor,
				currency: 'INR',
				notes: Object.keys(apiOrderNotes).length > 0 ? apiOrderNotes : undefined,
			});

		return createOrder.then(order => {
			const isLocal = order.keyId == null || order.orderId.startsWith('local_');
			if (isLocal) {
				const confirmLocal = wsConnected ?
					payment.confirm(order.orderId, 'pay_local_dev', 'sig_local_dev') :
					creatorsApi.payments.razorpayConfirm({
						razorpayOrderId: order.orderId,
						razorpayPaymentId: 'pay_local_dev',
						razorpaySignature: 'sig_local_dev',
					});

				return confirmLocal.then(conf => {
					updateWalletMinor(conf.balance_after_cents);
					void refreshLedger();
					void refreshOrders();
				});
			}

			return openRazorpayCheckout({
				amountINR: amountInr,
				amountPaise: order.amountMinor,
				keyId: order.keyId,
				orderId: order.orderId,
				description: checkoutDescription,
				userName: user.name,
				userEmail: user.email,
				notes: checkoutNotes,
			}).then(resp => {
				const paymentId = resp.razorpay_payment_id?.trim();
				const signature = resp.razorpay_signature?.trim();
				if (!paymentId || !signature) {
					throw new Error('Razorpay did not return payment id or signature. Try again.');
				}
				const confirmOrderId = resp.razorpay_order_id ?? order.orderId;
				const confirmPaid = wsConnected ?
					payment.confirm(confirmOrderId, paymentId, signature) :
					creatorsApi.payments.razorpayConfirm({
						razorpayOrderId: confirmOrderId,
						razorpayPaymentId: paymentId,
						razorpaySignature: signature,
					});

				return confirmPaid.then(conf => {
					updateWalletMinor(conf.balance_after_cents);
					void refreshLedger();
					void refreshOrders();
				});
			});
		});
	}, [wsConnected, payment, updateWalletMinor, refreshLedger, refreshOrders]);

	const addFundsViaRazorpay = useCallback((amountInr: number): Promise<boolean> => {
		const user = authState.user;
		if (!user) return Promise.resolve(false);
		if (amountInr <= 0) return Promise.resolve(false);

		return settleRazorpayWithServer(amountInr, 'Wallet top-up', user, {
			type: 'deposit',
			userId: user.id,
		})
			.then(() => true)
			.catch(err => {
				if (!isPaymentCancelled(err)) {
					console.error('[wallet] addFundsViaRazorpay failed:', err);
					dispatch({ type: 'SET_WALLET_ERROR', payload: err instanceof Error ? err.message : 'Payment failed' });
				}
				return false;
			});
	}, [authState.user, settleRazorpayWithServer]);

	const payViaRazorpay = useCallback((
		amountRupees: number,
		type: Transaction['type'],
		description: string,
		recipientId?: string,
		recipientName?: string
	): Promise<{ ok: boolean, cancelled?: boolean, error?: string }> => {
		const user = authState.user;
		if (!user) return Promise.resolve({ ok: false, error: 'Not authenticated' });
		const inr = Math.max(0, amountRupees);
		if (inr <= 0) return Promise.resolve({ ok: false, error: 'Invalid amount' });

		return settleRazorpayWithServer(inr, description, user, {
			type,
			userId: user.id,
			recipientId: recipientId ?? '',
			recipientName: recipientName ?? '',
		})
			.then(() => ({ ok: true }))
			.catch(err => {
				if (isPaymentCancelled(err)) {
					return { ok: false, cancelled: true };
				}
				const msg = err instanceof Error ? err.message : 'Payment failed';
				console.error('[wallet] payViaRazorpay failed:', msg);
				dispatch({ type: 'SET_WALLET_ERROR', payload: msg });
				return { ok: false, error: msg };
			});
	}, [authState.user, settleRazorpayWithServer]);

	const getUserTransactions = useCallback((userId: string) => {
		const fromLedger = state.ledgerRows.map(r => ledgerRowToTransaction(r, userId));
		// Production behavior: once we have backend ledger rows, render them as the source of truth
		// (avoid mixing in local-only demo transactions that will diverge from backend).
		if (fromLedger.length > 0) {
			const sorted = [...fromLedger];
			sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
			return sorted;
		}
		const local = state.transactions.filter(t => t.userId === userId);
		const ledgerIds: Record<string, true> = {};
		for (const t of fromLedger) ledgerIds[t.id] = true;
		const merged = [...fromLedger, ...local.filter(t => !ledgerIds[t.id])];
		merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		return merged;
	}, [state.ledgerRows, state.transactions]);

	const getUserSubscriptions = useCallback((userId: string) => {
		return state.subscriptions.filter(s => s.userId === userId);
	}, [state.subscriptions]);

	return (
		<WalletContext.Provider value={{
			state,
			ledgerRows: state.ledgerRows,
			razorpayOrders: state.razorpayOrders,
			historyNextCursor: state.historyNextCursor,
			hasSyncedBalance,
			refreshBalance,
			refreshLedger,
			loadMoreLedger,
			refreshOrders,
			refreshWalletData,
			addFunds,
			addFundsViaRazorpay,
			deductFunds,
			payViaRazorpay,
			payExternally: payViaRazorpay,
			cancelSubscription,
			toggleAutoRenew,
			addSubscription,
			getUserTransactions,
			getUserSubscriptions,
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
