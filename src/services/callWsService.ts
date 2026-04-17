import type { WsClient } from './wsClient';
import { assertUuid } from '../utils/isUuid';
import type {
	CallOkResponse,
	CallSessionSnapshot,
} from './callWsTypes';

function assertSessionId(sessionId: string): string {
	const id = String(sessionId).trim();
	if (!/^\d+$/.test(id)) {
		throw new Error('sessionId must be a numeric string');
	}
	return id;
}

type PayloadEncoding = 'json' | 'base64url';

export interface CallSignalOptions {
	/**
	 * - `json` (default): payload is sent as raw JSON starting with `{` or `[`.
	 * - `base64url`: payload is encoded as base64url(utf8(json)) for compact single-token frames.
	 */
	encoding?: PayloadEncoding;
}

function encodeBase64Url(bytes: Uint8Array): string {
	// Convert bytes to a binary string in chunks to avoid `Maximum call stack size exceeded`.
	let bin = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		const slice = bytes.subarray(i, i + chunk);
		bin += String.fromCharCode(...slice);
	}
	const b64 = btoa(bin);
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeSignalPayload(payload: unknown, opts?: CallSignalOptions): string {
	const encoding: PayloadEncoding = opts?.encoding ?? 'json';

	// Caller may provide an already-serialized string or a structured object/array.
	let jsonText: string;
	if (typeof payload === 'string') {
		jsonText = payload.trim();
	} else {
		jsonText = JSON.stringify(payload);
	}

	if (!jsonText) {
		throw new Error('Empty payload');
	}

	// If it starts with { or [, backend parses as JSON directly.
	if (encoding === 'json') {
		const first = jsonText[0];
		if (first !== '{' && first !== '[') {
			// Keep backend behavior predictable: "json" mode must be JSON text.
			throw new Error('Signal payload must be JSON text starting with { or [');
		}
		return jsonText;
	}

	// base64url of UTF-8 JSON
	const bytes = new TextEncoder().encode(jsonText);
	return encodeBase64Url(bytes);
}

/** `/start <roomUuid>` => CallSessionSnapshot */
export function callStart(ws: WsClient, roomUuid: string, requestId?: string): Promise<CallSessionSnapshot> {
	const id = assertUuid(roomUuid);
	return ws.request('call', 'start', [id], requestId).then(json => json as CallSessionSnapshot);
}

/** `/offer <sessionId> <json>` => { ok: true } */
export function callOffer(
	ws: WsClient,
	sessionId: string,
	payload: unknown,
	requestId?: string,
	opts?: CallSignalOptions
): Promise<CallOkResponse> {
	const sid = assertSessionId(sessionId);
	const encoded = encodeSignalPayload(payload, opts);
	return ws.request('call', 'offer', [sid, encoded], requestId).then(json => json as CallOkResponse);
}

/** `/answer <sessionId> <json>` => { ok: true } */
export function callAnswer(
	ws: WsClient,
	sessionId: string,
	payload: unknown,
	requestId?: string,
	opts?: CallSignalOptions
): Promise<CallOkResponse> {
	const sid = assertSessionId(sessionId);
	const encoded = encodeSignalPayload(payload, opts);
	return ws.request('call', 'answer', [sid, encoded], requestId).then(json => json as CallOkResponse);
}

/** `/ice <sessionId> <json>` => { ok: true } */
export function callIce(
	ws: WsClient,
	sessionId: string,
	payload: unknown,
	requestId?: string,
	opts?: CallSignalOptions
): Promise<CallOkResponse> {
	const sid = assertSessionId(sessionId);
	const encoded = encodeSignalPayload(payload, opts);
	return ws.request('call', 'ice', [sid, encoded], requestId).then(json => json as CallOkResponse);
}

/** `/end <sessionId>` => { ok: true } */
export function callEnd(ws: WsClient, sessionId: string, requestId?: string): Promise<CallOkResponse> {
	const sid = assertSessionId(sessionId);
	return ws.request('call', 'end', [sid], requestId).then(json => json as CallOkResponse);
}

