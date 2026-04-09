import type { User } from '../types';
import { clearSessionToken, getSessionToken, setSessionToken } from './sessionToken';

export type PreferredRole = 'fan' | 'creator';
export type UploadKind = 'post_image' | 'post_video' | 'avatar' | 'banner' | 'kyc_doc';
export type CreatorProfileResponse = User & {
	role: 'creator';
	bio?: string;
	banner?: string;
	category?: string;
};

export interface RegisterRequest {
	email: string;
	password: string;
	displayName: string;
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
}

export interface UpdateMyProfileResponse {
	user: User;
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
}

export interface RazorpayConfirmRequest {
	razorpayOrderId: string;
	razorpayPaymentId: string;
	razorpaySignature: string;
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

function apiBaseUrl(): string {
	if (import.meta.env.DEV) {
		return '/creators-api';
	}
	return (import.meta.env.VITE_CREATORS_API_URL?.trim() || 'https://creatorsapi.pnine.me/').replace(/\/+$/, '');
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
			return requestJson<MeResponse>('/me', { method: 'GET', auth: true, signal });
		},
		logout(): Promise<{ ok: true }> {
			return requestJson<{ ok: true }>('/logout', { method: 'POST', auth: true })
				.finally(() => {
					clearSessionToken();
				});
		},
	},
	me: {
		updateProfile(body: UpdateMyProfileRequest): Promise<UpdateMyProfileResponse> {
			return requestJson<UpdateMyProfileResponse>('/me/profile', { method: 'POST', body, auth: true });
		},
	},
	payments: {
		razorpayCreateOrder(body: RazorpayCreateOrderRequest): Promise<RazorpayCreateOrderResponse> {
			return requestJson<RazorpayCreateOrderResponse>('/payments/razorpay/orders', { method: 'POST', body, auth: true });
		},
		razorpayConfirm(body: RazorpayConfirmRequest): Promise<{ ok: true }> {
			return requestJson<{ ok: true }>('/payments/razorpay/confirm', { method: 'POST', body, auth: true });
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
		// Note: backend route assumed as /creators/:id. If your API uses a different path,
		// adjust here and the UI will follow.
		getById(id: string, signal?: AbortSignal): Promise<CreatorProfileResponse> {
			return requestJson<CreatorProfileResponse>(`/creators/${encodeURIComponent(id)}`, { method: 'GET', signal });
		},
	},
};
