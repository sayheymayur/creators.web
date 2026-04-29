import type { WsClient } from './wsClient';
import type {
	SessionKind,
	SessionsAcceptedPayload,
	SessionsStateResponse,
	SessionsCancelResponse,
	SessionsCompleteResponse,
	SessionsEndSessionResponse,
	SessionsFeedbackResponse,
	SessionsRejectedPayload,
	SessionsRequestResponse,
} from './sessionsWsTypes';

function assertDigitsOnly(name: string, value: string): string {
	const v = value.trim();
	if (!/^\d+$/.test(v)) throw new Error(`${name} must be digits only`);
	return v;
}

function assertRequestIdTag(tag?: string): string | undefined {
	if (tag === undefined) return undefined;
	const t = tag.trim();
	if (!t) return undefined;
	if (/\s/.test(t)) throw new Error('requestId must not contain spaces');
	return t;
}

function assertKind(kind: string): SessionKind {
	if (kind !== 'call' && kind !== 'chat') throw new Error('kind must be call or chat');
	return kind;
}

function assertMinutes(minutes: number): number {
	if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) {
		throw new Error('minutes must be an integer 1–1440');
	}
	return minutes;
}

function assertRating(rating: number): number {
	if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
		throw new Error('rating must be an integer 1–5');
	}
	return rating;
}

export function sessionsRequest(
	ws: WsClient,
	opts: { creatorUserId: string, kind: SessionKind, minutes: number, requestId?: string }
): Promise<SessionsRequestResponse> {
	const creatorUserId = assertDigitsOnly('creatorUserId', opts.creatorUserId);
	const kind = assertKind(opts.kind);
	const minutes = assertMinutes(opts.minutes);
	const rid = assertRequestIdTag(opts.requestId);
	return ws.request('sessions', 'request', [creatorUserId, kind, String(minutes)], rid).then(r => r as SessionsRequestResponse);
}

export function sessionsState(ws: WsClient, requestIdTag?: string): Promise<SessionsStateResponse> {
	const rid = assertRequestIdTag(requestIdTag);
	return ws.request('sessions', 'state', [], rid).then(r => r as SessionsStateResponse);
}

export function sessionsAccept(
	ws: WsClient,
	opts: { requestId: string, requestIdTag?: string }
): Promise<SessionsAcceptedPayload> {
	const requestId = assertDigitsOnly('requestId', opts.requestId);
	const rid = assertRequestIdTag(opts.requestIdTag);
	return ws.request('sessions', 'accept', [requestId], rid).then(r => r as SessionsAcceptedPayload);
}

export function sessionsReject(
	ws: WsClient,
	opts: { requestId: string, message?: string, requestIdTag?: string }
): Promise<SessionsRejectedPayload> {
	const requestId = assertDigitsOnly('requestId', opts.requestId);
	const rid = assertRequestIdTag(opts.requestIdTag);
	const msg = (opts.message ?? '').trim();
	const args = msg ? [requestId, msg] : [requestId];
	return ws.request('sessions', 'reject', args, rid).then(r => r as SessionsRejectedPayload);
}

export function sessionsCancel(ws: WsClient, requestId: string, requestIdTag?: string): Promise<SessionsCancelResponse> {
	const id = assertDigitsOnly('requestId', requestId);
	const rid = assertRequestIdTag(requestIdTag);
	return ws.request('sessions', 'cancel', [id], rid).then(r => r as SessionsCancelResponse);
}

export function sessionsComplete(ws: WsClient, requestId: string, requestIdTag?: string): Promise<SessionsCompleteResponse> {
	const id = assertDigitsOnly('requestId', requestId);
	const rid = assertRequestIdTag(requestIdTag);
	return ws.request('sessions', 'complete', [id], rid).then(r => r as SessionsCompleteResponse);
}

export function sessionsEndSession(ws: WsClient, requestId: string, requestIdTag?: string): Promise<SessionsEndSessionResponse> {
	const id = assertDigitsOnly('requestId', requestId);
	const rid = assertRequestIdTag(requestIdTag);
	return ws.request('sessions', 'endsession', [id], rid).then(r => r as SessionsEndSessionResponse);
}

export function sessionsFeedback(
	ws: WsClient,
	opts: { requestId: string, rating: number, comment?: string, requestIdTag?: string }
): Promise<SessionsFeedbackResponse> {
	const requestId = assertDigitsOnly('requestId', opts.requestId);
	const rating = assertRating(opts.rating);
	const rid = assertRequestIdTag(opts.requestIdTag);
	const comment = (opts.comment ?? '').trim();
	const args = comment ? [requestId, String(rating), comment] : [requestId, String(rating)];
	return ws.request('sessions', 'feedback', args, rid).then(r => r as SessionsFeedbackResponse);
}
