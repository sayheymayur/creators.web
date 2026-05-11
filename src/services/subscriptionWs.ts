import type { WsClient } from './wsClient';

export type SubscriptionDTO = Record<string, unknown>;

export interface SubscriptionGetResponse {
	subscription: SubscriptionDTO | null;
}

export interface SubscriptionSubscribeResponse {
	subscription: SubscriptionDTO;
	balance_after_cents: string;
}

export interface SubscriptionListMineResponse {
	subscriptions: SubscriptionDTO[];
	nextCursor: string | null;
}

export interface SubscriptionCancelResponse {
	subscription: SubscriptionDTO;
}

export interface SubscriptionSubscriberRow {
	fan: {
		id: string,
		name: string,
		username: string,
		avatar_url?: string | null,
	};
	subscription: SubscriptionDTO;
}

export interface SubscriptionListSubscribersResponse {
	subscribers: SubscriptionSubscriberRow[];
	nextCursor: string | null;
}

const DEFAULT_SVC = 'subscription';

function uniq(list: string[]): string[] {
	const out: string[] = [];
	const seen: Record<string, true> = {};
	for (const v of list) {
		const t = v.trim();
		if (!t) continue;
		if (seen[t]) continue;
		seen[t] = true;
		out.push(t);
	}
	return out;
}

function ensureNoWhitespace(label: string, value: string): string {
	const v = value.trim();
	if (!v) throw new Error(`${label} is required`);
	if (/\s/.test(v)) throw new Error(`${label} must not contain whitespace`);
	return v;
}

export function createSubscriptionWs(client: WsClient) {
	const envSvc = (import.meta.env.VITE_SUBSCRIPTION_WS_SERVICE ?? '').trim();
	// Spec service is `subscription`. If your backend uses a different service name on a given env,
	// set `VITE_SUBSCRIPTION_WS_SERVICE` to that exact value.
	const candidates = uniq([envSvc || DEFAULT_SVC]);

	function requestWithFallback<T>(command: string, args: string[]): Promise<T> {
		let firstErr: unknown = null;
		const tryOne = (i: number): Promise<T> => {
			const svc = candidates[i] ?? DEFAULT_SVC;
			return (client.request(svc, command, args) as Promise<T>).catch((e: unknown) => {
				if (!firstErr) firstErr = e;
				const msg = e instanceof Error ? e.message : String(e);
				const retryable =
					msg.toLowerCase().includes('unknown command') ||
					msg.toLowerCase().includes('unknown service') ||
					msg.toLowerCase().includes('unknown') ||
					msg.toLowerCase().includes('not found');
				if (!retryable || i >= candidates.length - 1) {
					const firstMsg =
						firstErr instanceof Error ? firstErr.message :
						firstErr == null ? msg :
						typeof firstErr === 'string' ? firstErr :
						msg;
					throw firstErr instanceof Error ? firstErr : new Error(firstMsg);
				}
				return tryOne(i + 1);
			});
		};
		return tryOne(0);
	}
	return {
		get(creatorUserId: string): Promise<SubscriptionGetResponse> {
			const id = ensureNoWhitespace('creatorUserId', creatorUserId);
			return requestWithFallback<SubscriptionGetResponse>('get', [id]);
		},
		subscribe(creatorUserId: string, autoRenew: boolean): Promise<SubscriptionSubscribeResponse> {
			const id = ensureNoWhitespace('creatorUserId', creatorUserId);
			return requestWithFallback<SubscriptionSubscribeResponse>('subscribe', [id, autoRenew ? 'true' : 'false']);
		},
		listMine(limit = 30, beforeCursor?: string): Promise<SubscriptionListMineResponse> {
			const lim = Math.min(50, Math.max(1, Number.isFinite(limit) ? limit : 30));
			const args: string[] = [String(lim)];
			const cur = beforeCursor?.trim();
			if (cur) args.push(cur);
			return requestWithFallback<SubscriptionListMineResponse>('listmine', args);
		},
		cancel(subscriptionId: string): Promise<SubscriptionCancelResponse> {
			const id = ensureNoWhitespace('subscriptionId', subscriptionId);
			return requestWithFallback<SubscriptionCancelResponse>('cancel', [id]);
		},
		listSubscribers(limit = 30, beforeCursor?: string): Promise<SubscriptionListSubscribersResponse> {
			const lim = Math.min(50, Math.max(1, Number.isFinite(limit) ? limit : 30));
			const args: string[] = [String(lim)];
			const cur = beforeCursor?.trim();
			if (cur) args.push(cur);
			return requestWithFallback<SubscriptionListSubscribersResponse>('listsubscribers', args);
		},
	};
}

export type SubscriptionWs = ReturnType<typeof createSubscriptionWs>;
