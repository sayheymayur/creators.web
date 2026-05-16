import type { CreatorDashboard, User } from '../types';
import { ZERO_MINOR } from '../utils/money';
import { getSessionToken, setSessionToken } from './sessionToken';

export type PreferredRole = 'fan' | 'creator';
export type UploadKind = 'post_image' | 'post_video' | 'avatar' | 'banner' | 'kyc_doc';
export type CreatorProfileResponse = User & {
	role: 'creator',
	bio?: string,
	banner?: string,
	category?: string,
};

function normalizeCreatorProfileResponse(json: unknown): CreatorProfileResponse {
	const root = json as Record<string, unknown> | null;
	const maybeWrapped = root && typeof root === 'object' && 'creator' in root ? root.creator : root;
	const obj = (maybeWrapped ?? {}) as Record<string, unknown>;

	const asString = (v: unknown): string => (
		typeof v === 'string' ? v :
		typeof v === 'number' ? String(v) :
		''
	);

	const avatar =
		(typeof obj.avatar === 'string' && obj.avatar) ||
		(typeof obj.avatar_url === 'string' && obj.avatar_url) ||
		'';
	const banner =
		(typeof obj.banner === 'string' && obj.banner) ||
		(typeof obj.banner_url === 'string' && obj.banner_url) ||
		undefined;

	return {
		...(obj as unknown as User),
		id: asString(obj.id ?? obj.user_id),
		email: asString(obj.email),
		name: asString(obj.name),
		username: asString(obj.username),
		avatar,
		role: 'creator',
		bio: typeof obj.bio === 'string' ? obj.bio : undefined,
		banner,
		category: typeof obj.category === 'string' ? obj.category : undefined,
	};
}

function asString(v: unknown): string {
	return typeof v === 'string' ? v :
		typeof v === 'number' ? String(v) :
		'';
}

/** Normalize HTTP or WS `user /me` and profile responses to app `User`. */
export function normalizeMeUser(raw: unknown): User | null {
	if (raw == null) return null;
	const root = raw as Record<string, unknown>;
	const maybeUser = root.user !== undefined ? root.user : raw;
	if (maybeUser == null || typeof maybeUser !== 'object') return null;
	const obj = maybeUser as Record<string, unknown>;

	const id = asString(obj.id ?? obj.user_id);
	if (!id) return null;

	let minor =
		typeof obj.walletBalanceMinor === 'string' ? obj.walletBalanceMinor :
		typeof obj.walletBalanceMinor === 'number' ? String(obj.walletBalanceMinor) :
		'';
	if (!minor && obj.walletBalance != null) {
		if (typeof obj.walletBalance === 'number') {
			minor = String(Math.max(0, Math.round(obj.walletBalance)));
		} else if (typeof obj.walletBalance === 'string' && /^\d+$/.test(obj.walletBalance.trim())) {
			minor = obj.walletBalance.trim();
		}
	}
	if (!minor) minor = ZERO_MINOR;

	const avatar =
		(typeof obj.avatar === 'string' && obj.avatar) ||
		(typeof obj.avatar_url === 'string' && obj.avatar_url) ||
		'';
	const banner =
		(typeof obj.banner === 'string' && obj.banner) ||
		(typeof obj.banner_url === 'string' && obj.banner_url) ||
		undefined;

	const perMinuteRaw = obj.perMinuteRate ?? obj.per_minute_rate;
	const perMinuteRate =
		typeof perMinuteRaw === 'number' ? perMinuteRaw :
		typeof perMinuteRaw === 'string' && perMinuteRaw.trim() !== '' && !Number.isNaN(Number(perMinuteRaw)) ?
			Number(perMinuteRaw) :
		null;

	const dash = obj.creatorDashboard ?? obj.creator_dashboard;
	const creatorDashboard =
		dash && typeof dash === 'object' ? dash as CreatorDashboard : undefined;

	const base = obj as unknown as User;
	return {
		...base,
		id,
		email: asString(obj.email) || base.email,
		name: asString(obj.name ?? obj.display_name) || base.name,
		username: asString(obj.username) || base.username,
		avatar,
		banner,
		bio: typeof obj.bio === 'string' ? obj.bio : base.bio,
		category: typeof obj.category === 'string' ? obj.category : base.category,
		role: (obj.role === 'fan' || obj.role === 'creator' || obj.role === 'admin') ? obj.role : base.role,
		createdAt: asString(obj.createdAt ?? obj.created_at) || base.createdAt,
		isAgeVerified: typeof obj.isAgeVerified === 'boolean' ? obj.isAgeVerified : base.isAgeVerified,
		status: (obj.status === 'active' || obj.status === 'suspended' || obj.status === 'banned') ?
			obj.status :
			base.status,
		walletBalanceMinor: /^\d+$/.test(minor) ? minor : ZERO_MINOR,
		perMinuteRate,
		creatorDashboard,
	};
}

export interface RegisterRequest {
	email: string;
	password: string;
	displayName: string;
	preferredRole?: PreferredRole;
}

export interface AuthTokenResponse {
	token: string;
	userId: string;
}

export interface FirebaseExchangeRequest {
	idToken: string;
	preferredRole?: PreferredRole;
}

export interface FirebaseExchangeResponse {
	user?: User;
	userId: string;
	role: PreferredRole | 'admin';
	token: string;
}

export interface MeResponse {
	user: User | null;
}

export interface UpdateMyProfileRequest {
	name?: string;
	username?: string;
	avatarAssetId?: string;
	avatarUrl?: string;
	bio?: string;
	bannerAssetId?: string;
	bannerUrl?: string;
	category?: string;
	/** Spec: integer minor units (e.g. paise/cents). */
	subscriptionPriceMinor?: number;
	/** Spec: integer minor units per minute for timed sessions. */
	perMinuteRate?: number;
}

export interface UpdateMyProfileResponse {
	user: User;
}

export interface NotificationSettings {
	messages: boolean;
	subscriptions: boolean;
	tips: boolean;
	likes: boolean;
	system: boolean;
}

export interface GetNotificationSettingsResponse {
	settings: NotificationSettings;
}

export interface UpdateNotificationSettingsRequest {
	settings: Partial<NotificationSettings>;
}

export interface UpdateNotificationSettingsResponse {
	settings: NotificationSettings;
}

export interface CreateReportRequest {
	targetType: 'post' | 'user' | 'message';
	targetId: string;
	reason: string;
	description?: string;
}

export interface CreateReportResponse {
	ok: true;
}

export interface PaymentGatewayResponse {
	provider: 'razorpay' | 'stripe';
	useMock?: boolean;
}

export interface StripeCreatePaymentIntentRequest {
	amountMinor: number;
	currency?: string;
	metadata?: Record<string, unknown>;
}

export interface StripeCreatePaymentIntentResponse {
	clientSecret: string;
}

export interface StripeCreateCheckoutSessionRequest {
	amountMinor: number;
	currency?: string;
	successUrl: string;
	cancelUrl: string;
	metadata?: Record<string, unknown>;
}

export interface StripeCreateCheckoutSessionResponse {
	url: string;
}

export interface RazorpayCreateOrderRequest {
	amountMinor: number;
	currency?: 'INR';
	receipt?: string;
	notes?: Record<string, unknown>;
}

export interface RazorpayCreateOrderResponse {
	orderId: string;
	amountMinor: number;
	currency: string;
	/** Public Razorpay key for Checkout; null when unset (local dev). */
	keyId: string | null;
}

export interface RazorpayConfirmRequest {
	razorpayOrderId: string;
	razorpayPaymentId: string;
	razorpaySignature: string;
}

export interface RazorpayConfirmResponse {
	ok: true;
	balance_after_cents: string;
	alreadyConfirmed?: true;
}

export interface PaymentsTipRequest {
	creatorUserId: string;
	amountCents: string;
	postId?: string;
	currency?: string;
}

export interface PaymentsTipResponse {
	tip: {
		id: string,
		fan_user_id: string,
		creator_user_id: string,
		post_id: string | null,
		amount_cents: string,
		currency: string,
		created_at: string,
	};
	from_balance_after: string;
}

export interface MediaCreateUploadRequest {
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	kind: UploadKind;
}

export interface MediaCreateUploadResponse {
	assetId: string;
	uploadUrl: string;
	fileUrl: string;
	headers?: Record<string, string>;
	expiresAt: string;
}

export interface MediaCompleteRequest {
	assetId: string;
	metadata?: Record<string, unknown>;
}

export interface MediaCompleteResponse {
	asset: unknown;
}

export class ApiError extends Error {
	status: number;
	body: unknown;
	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.body = body;
	}
}

/** Reads `{ error: string }` from API error bodies when present. */
export function apiErrorMessage(err: unknown, fallback: string): string {
	if (err instanceof ApiError) {
		const b = err.body;
		if (b && typeof b === 'object' && 'error' in b) {
			const msg = (b as Record<string, unknown>).error;
			if (typeof msg === 'string') return msg;
		}
		return err.message;
	}
	if (err instanceof Error) return err.message;
	return fallback;
}

function apiBaseUrl(): string {
	return (import.meta.env.VITE_CREATORS_API_URL?.trim() || 'https://creatorsapi.pnine.me').replace(/\/+$/, '');
}

function readJsonSafe(res: Response): Promise<unknown> {
	return res.text()
		.catch(() => '')
		.then(text => {
			if (!text) return null;
			try { return JSON.parse(text) as unknown; } catch { return text; }
		});
}

function requestJson<T>(
	path: string,
	init: Omit<RequestInit, 'body'> & { body?: unknown, auth?: boolean } = {}
): Promise<T> {
	const url = `${apiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
	const headers = new Headers(init.headers);
	headers.set('Accept', 'application/json');

	const auth = init.auth ?? false;
	if (auth) {
		const token = getSessionToken();
		if (token) headers.set('Authorization', `Bearer ${token}`);
	}

	let body: BodyInit | null | undefined = init.body as BodyInit | null | undefined;
	if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof URLSearchParams)) {
		headers.set('Content-Type', 'application/json');
		body = JSON.stringify(body);
	}

	return globalThis.fetch(url, { ...(init as RequestInit), headers, body })
		.then(res => {
			if (res.ok) return readJsonSafe(res).then(v => v as T);
			return readJsonSafe(res).then(errorBody => {
				throw new ApiError(`HTTP ${res.status} for ${path}`, res.status, errorBody);
			});
		});
}

function requestJsonAllow201<T>(
	path: string,
	init: Omit<RequestInit, 'body'> & { body?: unknown, auth?: boolean } = {}
): Promise<T> {
	const url = `${apiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
	const headers = new Headers(init.headers);
	headers.set('Accept', 'application/json');

	const auth = init.auth ?? false;
	if (auth) {
		const token = getSessionToken();
		if (token) headers.set('Authorization', `Bearer ${token}`);
	}

	let body: BodyInit | null | undefined = init.body as BodyInit | null | undefined;
	if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof URLSearchParams)) {
		headers.set('Content-Type', 'application/json');
		body = JSON.stringify(body);
	}

	return globalThis.fetch(url, { ...(init as RequestInit), headers, body })
		.then(res => {
			if (res.status >= 200 && res.status < 300) return readJsonSafe(res).then(v => v as T);
			return readJsonSafe(res).then(errorBody => {
				throw new ApiError(`HTTP ${res.status} for ${path}`, res.status, errorBody);
			});
		});
}

export const creatorsApi = {
	auth: {
		register(body: RegisterRequest): Promise<AuthTokenResponse> {
			return requestJson<AuthTokenResponse>('/auth/register', { method: 'POST', body })
				.then(data => {
					if (data.token) setSessionToken(data.token);
					return data;
				});
		},
		login(body: { email: string, password: string }): Promise<AuthTokenResponse> {
			return requestJson<AuthTokenResponse>('/auth/login', { method: 'POST', body })
				.then(data => {
					if (data.token) setSessionToken(data.token);
					return data;
				});
		},
		firebaseExchange(body: FirebaseExchangeRequest): Promise<FirebaseExchangeResponse> {
			return requestJson<FirebaseExchangeResponse>('/auth/firebase/exchange', { method: 'POST', body })
				.then(data => {
					if (data.token) setSessionToken(data.token);
					return data;
				});
		},
		me(signal?: AbortSignal): Promise<MeResponse> {
			return requestJson<MeResponse>('/me', { method: 'GET', auth: true, signal })
				.then(res => ({ user: res.user != null ? normalizeMeUser(res.user) : null }));
		},
		/** Caller must clear local session after this resolves (see AuthContext.logout). */
		logout(): Promise<{ ok: true }> {
			return requestJson<{ ok: true }>('/logout', { method: 'POST', auth: true });
		},
	},
	me: {
		updateProfile(body: UpdateMyProfileRequest): Promise<UpdateMyProfileResponse> {
			return requestJson<UpdateMyProfileResponse>('/me/profile', { method: 'POST', body, auth: true })
				.then(res => {
					const user = normalizeMeUser(res.user);
					if (!user) throw new Error('POST /me/profile returned no user');
					return { user };
				});
		},
		/** Spec: POST /me/password — Bearer; body { currentPassword, newPassword } (min 8). */
		changePassword(body: { currentPassword: string, newPassword: string }): Promise<{ ok: true }> {
			return requestJson<{ ok: true }>('/me/password', { method: 'POST', body, auth: true });
		},
		notificationSettings: {
			get(): Promise<GetNotificationSettingsResponse> {
				return requestJson<GetNotificationSettingsResponse>('/me/notification-settings', { method: 'GET', auth: true });
			},
			update(body: UpdateNotificationSettingsRequest): Promise<UpdateNotificationSettingsResponse> {
				return requestJson<UpdateNotificationSettingsResponse>('/me/notification-settings', { method: 'PUT', body, auth: true });
			},
		},
	},
	payments: {
		/** GET /payments/gateway — source of truth for which provider the app uses. */
		getGateway(signal?: AbortSignal): Promise<PaymentGatewayResponse> {
			// Local-dev mock: simulate backend deciding active provider without hitting network.
			// Useful when backend endpoint is not yet available.
			if (import.meta.env.VITE_PAYMENTS_GATEWAY_MOCK === 'true') {
				const raw = (import.meta.env.VITE_PAYMENTS_GATEWAY_PROVIDER || '').trim().toLowerCase();
				const provider: PaymentGatewayResponse['provider'] = raw === 'stripe' ? 'stripe' : 'razorpay';
				const useMock = import.meta.env.VITE_PAYMENTS_GATEWAY_USE_MOCK === 'true';
				return Promise.resolve({ provider, useMock });
			}
			return requestJson<PaymentGatewayResponse>('/payments/gateway', { method: 'GET', auth: true, signal });
		},
		razorpayCreateOrder(body: RazorpayCreateOrderRequest): Promise<RazorpayCreateOrderResponse> {
			return requestJson<RazorpayCreateOrderResponse>('/payments/razorpay/orders', { method: 'POST', body, auth: true });
		},
		razorpayConfirm(body: RazorpayConfirmRequest): Promise<RazorpayConfirmResponse> {
			return requestJson<RazorpayConfirmResponse>('/payments/razorpay/confirm', { method: 'POST', body, auth: true });
		},
		tip(body: PaymentsTipRequest): Promise<PaymentsTipResponse> {
			return requestJsonAllow201<PaymentsTipResponse>('/payments/tip', { method: 'POST', body, auth: true });
		},
		/** When backend is ready: implement POST /payments/stripe/create-payment-intent */
		stripeCreatePaymentIntent(body: StripeCreatePaymentIntentRequest): Promise<StripeCreatePaymentIntentResponse> {
			return requestJson<StripeCreatePaymentIntentResponse>('/payments/stripe/create-payment-intent', {
				method: 'POST',
				body,
				auth: true,
			});
		},
		/** When backend is ready: implement POST /payments/stripe/create-checkout-session */
		stripeCreateCheckoutSession(body: StripeCreateCheckoutSessionRequest): Promise<StripeCreateCheckoutSessionResponse> {
			return requestJson<StripeCreateCheckoutSessionResponse>('/payments/stripe/create-checkout-session', {
				method: 'POST',
				body,
				auth: true,
			});
		},
	},
	media: {
		createUpload(body: MediaCreateUploadRequest): Promise<MediaCreateUploadResponse> {
			return requestJson<MediaCreateUploadResponse>('/media/uploads', { method: 'POST', body, auth: true });
		},
		complete(body: MediaCompleteRequest): Promise<MediaCompleteResponse> {
			return requestJson<MediaCompleteResponse>('/media/complete', { method: 'POST', body, auth: true });
		},
	},
	creators: {
		// Public creator profile for display (not in the core HTTP doc; must exist on your API).
		getById(id: string, signal?: AbortSignal): Promise<CreatorProfileResponse> {
			return requestJson<unknown>(`/creators/${encodeURIComponent(id)}`, { method: 'GET', signal })
				.then(normalizeCreatorProfileResponse);
		},
	},
	reports: {
		create(body: CreateReportRequest): Promise<CreateReportResponse> {
			return requestJson<CreateReportResponse>('/reports', { method: 'POST', body, auth: true });
		},
	},
};
