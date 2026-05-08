import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useEnsureWsAuth, useWs, useWsAuthReady, useWsConnected } from './WsContext';
import { createPaymentWs } from '../services/paymentWs';
import { createSubscriptionWs, type SubscriptionListMineResponse } from '../services/subscriptionWs';
import { openRazorpayCheckout, isPaymentCancelled } from '../services/razorpay';
import { inrRupeesToMinor } from '../utils/money';
import {
	type SubscriptionDTO,
	subscriptionCreatorUserId,
	subscriptionId,
	subscriptionUiStatus,
} from '../services/subscriptionUi';

type SubscriptionByCreator = Record<string, SubscriptionDTO>;

export interface CheckoutResult {
	ok: boolean;
	cancelled?: boolean;
	error?: string;
	subscription?: SubscriptionDTO;
	balance_after_cents?: string;
}

interface SubscriptionContextValue {
	ready: boolean;
	loading: boolean;
	error: string | null;
	/** Latest subscription DTO per creator user id (may be active or cancelled). */
	byCreatorUserId: SubscriptionByCreator;
	/** Convenience: active-only view derived from `byCreatorUserId`. */
	activeByCreatorUserId: SubscriptionByCreator;
	listMine: () => Promise<void>;
	isSubscribed: (creatorUserId: string) => boolean;
	subscribeWallet: (creatorUserId: string, autoRenew: boolean) => Promise<SubscriptionDTO>;
	subscribeViaCheckout: (creatorUserId: string, amountInrRupees: number) => Promise<CheckoutResult>;
	cancel: (subscriptionId: string) => Promise<void>;
	getSubscriptionForCreator: (creatorUserId: string) => SubscriptionDTO | null;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
	const { state: authState, updateWalletMinor } = useAuth();
	const ws = useWs();
	const wsConnected = useWsConnected();
	const wsAuthReady = useWsAuthReady();
	const ensureWsAuth = useEnsureWsAuth();

	const payment = useMemo(() => createPaymentWs(ws), [ws]);
	const subscription = useMemo(() => createSubscriptionWs(ws), [ws]);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [byCreatorUserId, setByCreatorUserId] = useState<SubscriptionByCreator>({});
	const [ready, setReady] = useState(false);

	const lastHydratedUserRef = useRef<string | null>(null);

	const applyListMine = useCallback((resp: SubscriptionListMineResponse) => {
		const next: SubscriptionByCreator = {};
		for (const dto of resp.subscriptions ?? []) {
			if (!dto || typeof dto !== 'object') continue;
			const creatorUserId = subscriptionCreatorUserId(dto);
			if (!creatorUserId) continue;
			next[creatorUserId] = dto;
		}
		setByCreatorUserId(next);
	}, []);

	const listMine = useCallback(() => {
		if (!authState.user || !wsConnected || !wsAuthReady) return Promise.resolve();
		setLoading(true);
		setError(null);
		return ensureWsAuth()
			.then(() => subscription.listMine(30))
			.then(resp => {
				applyListMine(resp);
				setReady(true);
			})
			.catch(e => {
				setError(e instanceof Error ? e.message : 'Failed to load subscriptions');
			})
			.finally(() => setLoading(false));
	}, [authState.user, wsConnected, wsAuthReady, ensureWsAuth, subscription, applyListMine]);

	useEffect(() => {
		const u = authState.user;
		const key = u ? `${u.role}:${u.id}` : 'guest';
		if (!u || !wsConnected || !wsAuthReady) {
			setReady(false);
			lastHydratedUserRef.current = null;
			setByCreatorUserId({});
			return;
		}
		if (lastHydratedUserRef.current === key) return;
		lastHydratedUserRef.current = key;
		void listMine();
	}, [authState.user?.id, authState.user?.role, wsConnected, wsAuthReady, listMine]);

	useEffect(() => {
		if (!wsConnected) return;

		const createdServices = ['subscription', 'subscriptions'];
		const cancelledServices = ['subscription', 'subscriptions'];

		const offCreated = createdServices.map(svc => ws.on(svc, 'created', data => {
			const dto = (data && typeof data === 'object' ? data : null) as SubscriptionDTO | null;
			if (!dto) return;
			const creatorUserId = subscriptionCreatorUserId(dto);
			if (!creatorUserId) return;
			setByCreatorUserId(prev => ({ ...prev, [creatorUserId]: dto }));
		}));

		const offCancelled = cancelledServices.map(svc => ws.on(svc, 'cancelled', data => {
			const dto = (data && typeof data === 'object' ? data : null) as SubscriptionDTO | null;
			const creatorUserId = dto ? subscriptionCreatorUserId(dto) : null;
			if (!creatorUserId) return;
			setByCreatorUserId(prev => {
				const cur = prev[creatorUserId];
				if (dto) return { ...prev, [creatorUserId]: dto };
				// If server didn't send DTO, mark existing as cancelled best-effort.
				if (!cur) return prev;
				return { ...prev, [creatorUserId]: { ...cur, status: 'cancelled', is_active: false } };
			});
		}));

		return () => {
			offCreated.forEach(fn => fn());
			offCancelled.forEach(fn => fn());
		};
	}, [ws, wsConnected]);

	const activeByCreatorUserId = useMemo(() => {
		const out: SubscriptionByCreator = {};
		for (const [k, dto] of Object.entries(byCreatorUserId)) {
			if (dto && subscriptionUiStatus(dto) === 'active') out[k] = dto;
		}
		return out;
	}, [byCreatorUserId]);

	const isSubscribed = useCallback((creatorUserId: string) => {
		const id = String(creatorUserId ?? '').trim();
		if (!id) return false;
		return Boolean(activeByCreatorUserId[id]);
	}, [activeByCreatorUserId]);

	const getSubscriptionForCreator = useCallback((creatorUserId: string) => {
		const id = String(creatorUserId ?? '').trim();
		if (!id) return null;
		return byCreatorUserId[id] ?? null;
	}, [byCreatorUserId]);

	const subscribeWallet = useCallback((creatorUserId: string, autoRenew: boolean) => {
		return ensureWsAuth()
			.then(() => subscription.subscribe(creatorUserId, autoRenew))
			.then(resp => {
				if (resp.balance_after_cents) updateWalletMinor(resp.balance_after_cents);
				const dto = resp.subscription;
				const id = subscriptionCreatorUserId(dto);
				if (id) setByCreatorUserId(prev => ({ ...prev, [id]: dto }));
				return dto;
			});
	}, [ensureWsAuth, subscription, updateWalletMinor]);

	const subscribeViaCheckout = useCallback((creatorUserId: string, amountInrRupees: number): Promise<CheckoutResult> => {
		const user = authState.user;
		if (!user) return Promise.resolve({ ok: false, error: 'Not authenticated' });

		const amountMinor = inrRupeesToMinor(amountInrRupees);
		if (!/^\d+$/.test(amountMinor) || Number(amountMinor) <= 0) {
			return Promise.resolve({ ok: false, error: 'Invalid amount' });
		}

		return ensureWsAuth()
			.then(() => payment.createOrder(amountMinor, 'INR', { purpose: 'subscription', creatorUserId }))
			.then(order => {
				const isLocal = order.keyId == null || order.orderId.startsWith('local_');
				if (isLocal) {
					return payment.confirm(order.orderId, 'pay_dummy', 'sig_dummy')
						.then(conf => {
							if (conf.balance_after_cents) updateWalletMinor(conf.balance_after_cents);
							const sub = conf.subscription;
							if (sub) {
								const id = subscriptionCreatorUserId(sub);
								if (id) setByCreatorUserId(prev => ({ ...prev, [id]: sub }));
							}
							return { ok: true, subscription: sub, balance_after_cents: conf.balance_after_cents } satisfies CheckoutResult;
						});
				}

				return openRazorpayCheckout({
					amountINR: amountInrRupees,
					amountPaise: order.amountMinor,
					keyId: order.keyId,
					orderId: order.orderId,
					description: 'Subscription',
					userName: user.name,
					userEmail: user.email,
					notes: { purpose: 'subscription', creatorUserId: String(creatorUserId) },
				})
					.then(resp => {
						const paymentId = resp.razorpay_payment_id?.trim();
						const signature = resp.razorpay_signature?.trim();
						if (!paymentId || !signature) throw new Error('Razorpay did not return payment id or signature.');
						const confirmOrderId = resp.razorpay_order_id ?? order.orderId;
						return payment.confirm(confirmOrderId, paymentId, signature);
					})
					.then(conf => {
						if (conf.balance_after_cents) updateWalletMinor(conf.balance_after_cents);
						const sub = conf.subscription;
						if (sub) {
							const id = subscriptionCreatorUserId(sub);
							if (id) setByCreatorUserId(prev => ({ ...prev, [id]: sub }));
						}
						return { ok: true, subscription: sub, balance_after_cents: conf.balance_after_cents } satisfies CheckoutResult;
					});
			})
			.catch(e => {
				if (isPaymentCancelled(e)) return { ok: false, cancelled: true } satisfies CheckoutResult;
				const msg = e instanceof Error ? e.message : 'Payment failed';
				return { ok: false, error: msg } satisfies CheckoutResult;
			});
	}, [authState.user, ensureWsAuth, payment, updateWalletMinor]);

	const cancel = useCallback((subId: string) => {
		return ensureWsAuth()
			.then(() => subscription.cancel(subId))
			.then(resp => {
				const dto = resp.subscription;
				const creatorUserId = subscriptionCreatorUserId(dto);
				if (!creatorUserId) return;
				setByCreatorUserId(prev => ({ ...prev, [creatorUserId]: dto }));
			});
	}, [ensureWsAuth, subscription]);

	const value = useMemo<SubscriptionContextValue>(() => ({
		ready,
		loading,
		error,
		byCreatorUserId,
		activeByCreatorUserId,
		listMine,
		isSubscribed,
		subscribeWallet,
		subscribeViaCheckout,
		cancel,
		getSubscriptionForCreator,
	}), [ready, loading, error, byCreatorUserId, activeByCreatorUserId, listMine, isSubscribed, subscribeWallet, subscribeViaCheckout, cancel, getSubscriptionForCreator]);

	return (
		<SubscriptionContext.Provider value={value}>
			{children}
		</SubscriptionContext.Provider>
	);
}

export function useSubscriptions() {
	const ctx = useContext(SubscriptionContext);
	if (!ctx) throw new Error('useSubscriptions must be used within SubscriptionProvider');
	return ctx;
}

export function useSubscriptionIdForCreator(creatorUserId: string): string | null {
	const { activeByCreatorUserId } = useSubscriptions();
	const dto = activeByCreatorUserId[String(creatorUserId ?? '').trim()];
	if (!dto) return null;
	return subscriptionId(dto);
}
