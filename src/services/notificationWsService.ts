import type { WsClient } from './wsClient';

export interface InAppNotificationRow {
	id: string;
	title: string;
	body: string | null;
	data: Record<string, unknown>;
	created_at: string;
	read_at: string | null;
}

export interface NotificationSendResponse {
	id: string;
}

export interface NotificationNotifyUserResponse {
	id: string;
	user_id: string;
}

export interface NotificationListResponse {
	notifications: InAppNotificationRow[];
	next_cursor: string | null;
}

export interface NotificationUnreadCountResponse {
	unread_count: number;
}

export interface NotificationOkResponse {
	ok: true;
}

export interface NotificationReadAllResponse {
	ok: true;
	updated: number;
}

function assertRequestIdTag(tag?: string): string | undefined {
	if (tag === undefined) return undefined;
	const t = tag.trim();
	if (!t) return undefined;
	if (/\s/.test(t)) throw new Error('requestId must not contain spaces');
	return t;
}

function assertDigitsOnly(name: string, value: string): string {
	const v = String(value).trim();
	if (!/^\d+$/.test(v)) throw new Error(`${name} must be digits only`);
	return v;
}

function assertLimit(limit?: number): number | undefined {
	if (limit == null) return undefined;
	if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be 1–100');
	return limit;
}

function clampText(name: string, value: string, maxLen: number, minLen = 0): string {
	const v = (value ?? '').trim();
	if (v.length < minLen) throw new Error(`${name} must be at least ${minLen} chars`);
	if (v.length > maxLen) throw new Error(`${name} must be at most ${maxLen} chars`);
	return v;
}

/**
 * Encode a single WS argument token that may contain spaces.
 * We use JSON-string style quoting so the whole value remains one token.
 */
function wsQuotedArg(text: string): string {
	return JSON.stringify(String(text));
}

const SVC = 'notification';

export function notificationSend(
	ws: WsClient,
	opts: { title: string, body?: string, requestIdTag?: string }
): Promise<NotificationSendResponse> {
	const rid = assertRequestIdTag(opts.requestIdTag);
	const title = clampText('title', opts.title, 255, 1);
	const body = opts.body == null ? '' : clampText('body', opts.body, 4096, 0);
	const args = body ? [wsQuotedArg(title), wsQuotedArg(body)] : [wsQuotedArg(title)];
	return ws.request(SVC, 'send', args, rid).then(r => r as NotificationSendResponse);
}

export function notificationNotifyUser(
	ws: WsClient,
	opts: { userId: string, title: string, body?: string, requestIdTag?: string }
): Promise<NotificationNotifyUserResponse> {
	const rid = assertRequestIdTag(opts.requestIdTag);
	const userId = assertDigitsOnly('userId', opts.userId);
	const title = clampText('title', opts.title, 255, 1);
	const body = opts.body == null ? '' : clampText('body', opts.body, 4096, 0);
	const args = body ?
		[userId, wsQuotedArg(title), wsQuotedArg(body)] :
		[userId, wsQuotedArg(title)];
	return ws.request(SVC, 'notifyuser', args, rid).then(r => r as NotificationNotifyUserResponse);
}

export function notificationList(
	ws: WsClient,
	opts?: { unreadOnly?: boolean, limit?: number, beforeCursor?: string, requestIdTag?: string }
): Promise<NotificationListResponse> {
	const rid = assertRequestIdTag(opts?.requestIdTag);
	const limit = assertLimit(opts?.limit);
	const beforeCursor = (opts?.beforeCursor ?? '').trim() || undefined;
	if (beforeCursor && /\s/.test(beforeCursor)) throw new Error('beforeCursor must not contain spaces');

	const args: string[] = [];
	if (opts?.unreadOnly) args.push('unread');
	if (limit != null) args.push(String(limit));
	if (beforeCursor) args.push(beforeCursor);
	return ws.request(SVC, 'list', args, rid).then(r => r as NotificationListResponse);
}

export function notificationUnreadCount(ws: WsClient, requestIdTag?: string): Promise<NotificationUnreadCountResponse> {
	const rid = assertRequestIdTag(requestIdTag);
	return ws.request(SVC, 'unreadcount', [], rid).then(r => r as NotificationUnreadCountResponse);
}

export function notificationRead(
	ws: WsClient,
	opts: { notificationId: string, requestIdTag?: string }
): Promise<NotificationOkResponse> {
	const rid = assertRequestIdTag(opts.requestIdTag);
	const id = assertDigitsOnly('notificationId', opts.notificationId);
	return ws.request(SVC, 'read', [id], rid).then(r => r as NotificationOkResponse);
}

export function notificationUnread(
	ws: WsClient,
	opts: { notificationId: string, requestIdTag?: string }
): Promise<NotificationOkResponse> {
	const rid = assertRequestIdTag(opts.requestIdTag);
	const id = assertDigitsOnly('notificationId', opts.notificationId);
	return ws.request(SVC, 'unread', [id], rid).then(r => r as NotificationOkResponse);
}

export function notificationReadAll(ws: WsClient, requestIdTag?: string): Promise<NotificationReadAllResponse> {
	const rid = assertRequestIdTag(requestIdTag);
	return ws.request(SVC, 'readall', [], rid).then(r => r as NotificationReadAllResponse);
}

