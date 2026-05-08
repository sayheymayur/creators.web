import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useEnsureWsAuth, useWs, useWsAuthReady, useWsConnected } from './WsContext';
import { createPaymentWs } from '../services/paymentWs';
import { createSubscriptionWs, type SubscriptionDTO, type SubscriptionListMineResponse } from '../services/subscriptionWs';
import { openRazorpayCheckout, isPaymentCancelled } from '../services/razorpay';
import { inrRupeesToMinor } from '../utils/money';

type SubscriptionByCreator = Record<string, SubscriptionDTO>;

function guessCreatorUserId(dto: SubscriptionDTO): string | null {
	const cand =
		dto.creatorUserId ??
		dto.creator_user_id ??
		dto.creator_userId ??
		dto.creator_id ??
		dto.creatorId;
	if (typeof cand === 'string') return cand;
	if (typeof cand === 'number') return String(cand);
	return null;
}

function guessSubscriptionId(dto: SubscriptionDTO): string | null {
	const cand = dto.id ?? dto.subscription_id ?? dto.subscriptionId;
	if (typeof cand === 'string') return cand;
	if (typeof cand === 'number') return String(cand);
	return null;
}

function isProbablyActive(dto: SubscriptionDTO): boolean {
	if (typeof dto.is_active === 'boolean') return dto.is_active;
	if (typeof dto.isActive === 'boolean') return dto.isActive;
	const status = typeof dto.status === 'string' ? dto.status.toLowerCase() : '';
	if (!status) return true;
	return status !== 'cancelled' && status !== 'canceled' && status !== 'ended' && status !== 'expired';
}

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
	activeByCreatorUserId: SubscriptionByCreator;
	listMine: () => Promise<void>;
	isSubscribed: (creatorUserId: string) => boolean;
	subscribeWallet: (creatorUserId: string, autoRenew: boolean) => Promise<SubscriptionDTO>;
	subscribeViaCheckout: (creatorUserId: string, amountInrRupees: number) => Promise<CheckoutResult>;
	cancel: (subscriptionId: string) => Promise<void>;
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
	const [activeByCreatorUserId, setActiveByCreatorUserId] = useState<SubscriptionByCreator>({});
	const [ready, setReady] = useState(false);

	const lastHydratedUserRef = useRef<string | null>(null);

	const applyListMine = useCallback((resp: SubscriptionListMineResponse) => {
		const next: SubscriptionByCreator = {};
		for (const dto of resp.subscriptions ?? []) {
			if (!dto || typeof dto !== 'object') continue;
			if (!isProbablyActive(dto)) continue;
			const creatorUserId = guessCreatorUserId(dto);
			if (!creatorUserId) continue;
			next[creatorUserId] = dto;
		}
		setActiveByCreatorUserId(next);
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
			setActiveByCreatorUserId({});
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
			const creatorUserId = guessCreatorUserId(dto);
			if (!creatorUserId) return;
			if (!isProbablyActive(dto)) return;
			setActiveByCreatorUserId(prev => ({ ...prev, [creatorUserId]: dto }));
		}));

		const offCancelled = cancelledServices.map(svc => ws.on(svc, 'cancelled', data => {
			const dto = (data && typeof data === 'object' ? data : null) as SubscriptionDTO | null;
			const creatorUserId = dto ? guessCreatorUserId(dto) : null;
			if (!creatorUserId) return;
			setActiveByCreatorUserId(prev => {
				const { [creatorUserId]: _rm, ...rest } = prev;
				return rest;
			});
		}));

		return () => {
			offCreated.forEach(fn => fn());
			offCancelled.forEach(fn => fn());
		};
	}, [ws, wsConnected]);

	const isSubscribed = useCallback((creatorUserId: string) => {
		const id = String(creatorUserId ?? '').trim();
		if (!id) return false;
		return Boolean(activeByCreatorUserId[id]);
	}, [activeByCreatorUserId]);

	const subscribeWallet = useCallback((creatorUserId: string, autoRenew: boolean) => {
		return ensureWsAuth()
			.then(() => subscription.subscribe(creatorUserId, autoRenew))
			.then(resp => {
				if (resp.balance_after_cents) updateWalletMinor(resp.balance_after_cents);
				const dto = resp.subscription;
				const id = guessCreatorUserId(dto);
				if (id) setActiveByCreatorUserId(prev => ({ ...prev, [id]: dto }));
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
								const id = guessCreatorUserId(sub);
								if (id) setActiveByCreatorUserId(prev => ({ ...prev, [id]: sub }));
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
							const id = guessCreatorUserId(sub);
							if (id) setActiveByCreatorUserId(prev => ({ ...prev, [id]: sub }));
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

	const cancel = useCallback((subscriptionId: string) => {
		return ensureWsAuth()
			.then(() => subscription.cancel(subscriptionId))
			.then(resp => {
				const dto = resp.subscription;
				const creatorUserId = guessCreatorUserId(dto);
				if (!creatorUserId) return;
				setActiveByCreatorUserId(prev => {
					const { [creatorUserId]: _rm, ...rest } = prev;
					return rest;
				});
			});
	}, [ensureWsAuth, subscription]);

	const value = useMemo<SubscriptionContextValue>(() => ({
		ready,
		loading,
		error,
		activeByCreatorUserId,
		listMine,
		isSubscribed,
		subscribeWallet,
		subscribeViaCheckout,
		cancel,
	}), [ready, loading, error, activeByCreatorUserId, listMine, isSubscribed, subscribeWallet, subscribeViaCheckout, cancel]);

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
	return guessSubscriptionId(dto);
}
