import type { CreatorsMultiplexWs } from './creatorsMultiplexWs';
import type { WsClient } from './wsClient';
import type { CreatorGetResponse, CreatorListResponse, CreatorSummaryDTO, CreatorUpsertResponse } from './creatorWsTypes';

export interface CreatorFollowResponse {
	ok: true;
	creator_user_id: string;
}

export interface CreatorUnfollowResponse {
	ok: true;
	creator_user_id: string;
}

export interface CreatorListFollowingResponse {
	creators: CreatorSummaryDTO[];
	nextCursor: string | null;
}

export interface CreatorListFollowersRow {
	id: string;
	name?: string | null;
	username?: string | null;
	avatar_url?: string | null;
	[key: string]: unknown;
}

export interface CreatorListFollowersResponse {
	followers: CreatorListFollowersRow[];
	nextCursor: string | null;
}

const MAX_Q = 64;
const MAX_CATEGORY = 32;

function clamp(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max);
}

/**
 * `/list [q] [category] [limit] [beforeCursor]` — positional args per server spec.
 */
export function buildCreatorListCommand(opts: {
	q?: string,
	category?: string,
	limit?: number,
	beforeCursor?: string,
}): string {
	const lim = Math.min(50, Math.max(1, opts.limit ?? 30));
	const q = opts.q?.trim() ?? '';
	const cat = opts.category?.trim() ?? '';
	// Backend args are positional. Also, many servers split on whitespace and cannot represent empty args,
	// so `/list 50` is often interpreted as `q="50"` rather than `limit=50`.
	// For the default directory case, always send bare `/list` (server default limit = 30).
	if (!q && !cat && !opts.beforeCursor) return '/list';
	const parts: string[] = ['/list'];
	if (q && cat) {
		parts.push(clamp(q, MAX_Q), clamp(cat, MAX_CATEGORY), String(lim));
	} else if (q) {
		parts.push(clamp(q, MAX_Q), String(lim));
	} else if (cat) {
		// Best-effort positional: some servers may treat first arg as `q` unless it is empty/quoted.
		parts.push('""', clamp(cat, MAX_CATEGORY), String(lim));
	} else {
		// With a beforeCursor, prefer `/list <limit> <beforeCursor>` (2-arg form) to avoid empty-arg issues.
		// This relies on server disambiguating when a cursor is present.
		parts.push(String(lim));
	}
	if (opts.beforeCursor) parts.push(opts.beforeCursor);
	return parts.join(' ');
}

export function buildCreatorUpsertCommand(username: string, name: string, bio?: string): string {
	const u = username.trim();
	const n = name.trim();
	const b = bio?.trim() ?? '';
	if (!u || !n) throw new Error('username and name required for /upsertprofile');
	let cmd = `/upsertprofile ${u} ${n}`;
	if (b) cmd += ` ${b}`;
	return cmd;
}

export function creatorWsList(client: CreatorsMultiplexWs, opts: Parameters<typeof buildCreatorListCommand>[0]): Promise<CreatorListResponse> {
	return client.send('creator', buildCreatorListCommand(opts)).then(json => json as CreatorListResponse);
}

export function creatorWsGet(client: CreatorsMultiplexWs, creatorRowId: string): Promise<CreatorGetResponse> {
	return client.send('creator', `/get ${creatorRowId}`).then(json => json as CreatorGetResponse);
}

export function creatorWsUpsertProfile(
	client: CreatorsMultiplexWs,
	username: string,
	name: string,
	bio?: string
): Promise<CreatorUpsertResponse> {
	return client.send('creator', buildCreatorUpsertCommand(username, name, bio)).then(json => json as CreatorUpsertResponse);
}

export function creatorWsListFollowing(ws: WsClient, limit = 30, beforeCursor?: string, requestId?: string): Promise<CreatorListFollowingResponse> {
	const lim = Math.min(50, Math.max(1, Math.floor(limit)));
	const args = beforeCursor ? [String(lim), beforeCursor] : [String(lim)];
	const rid = requestId?.trim() || undefined;
	if (rid && /\s/.test(rid)) throw new Error('requestId must not contain spaces');
	return ws.request('creator', 'listfollowing', args, rid).then(json => json as CreatorListFollowingResponse);
}

export function creatorWsListFollowers(
	ws: WsClient,
	creatorUserId: string,
	limit = 30,
	beforeCursor?: string,
	requestId?: string
): Promise<CreatorListFollowersResponse> {
	const id = String(creatorUserId).trim();
	if (!id) throw new Error('creatorUserId is required');
	if (/\s/.test(id)) throw new Error('creatorUserId must not contain whitespace');
	const lim = Math.min(50, Math.max(1, Math.floor(limit)));
	const args = beforeCursor ? [id, String(lim), beforeCursor] : [id, String(lim)];
	const rid = requestId?.trim() || undefined;
	if (rid && /\s/.test(rid)) throw new Error('requestId must not contain spaces');
	return ws.request('creator', 'listfollowers', args, rid).then(json => json as CreatorListFollowersResponse);
}

/**
 * `> creator <rid>\n/follow <creatorUserId>` over the primary WsClient.
 *
 * Spec: maintains `creator_follows` rows that drive followers-only live visibility
 * (`/golive followers …` then `live|started` is targeted at follower user ids).
 */
export function creatorFollow(ws: WsClient, creatorUserId: string, requestId?: string): Promise<CreatorFollowResponse> {
	const id = String(creatorUserId).trim();
	if (!id) throw new Error('creatorUserId is required');
	if (/\s/.test(id)) throw new Error('creatorUserId must not contain whitespace');
	const rid = requestId?.trim() || undefined;
	if (rid && /\s/.test(rid)) throw new Error('requestId must not contain spaces');
	return ws.request('creator', 'follow', [id], rid).then(json => json as CreatorFollowResponse);
}

/** Best-effort unfollow (if backend supports `/unfollow`). */
export function creatorUnfollow(ws: WsClient, creatorUserId: string, requestId?: string): Promise<CreatorUnfollowResponse> {
	const id = String(creatorUserId).trim();
	if (!id) throw new Error('creatorUserId is required');
	if (/\s/.test(id)) throw new Error('creatorUserId must not contain whitespace');
	const rid = requestId?.trim() || undefined;
	if (rid && /\s/.test(rid)) throw new Error('requestId must not contain spaces');
	return ws.request('creator', 'unfollow', [id], rid).then(json => json as CreatorUnfollowResponse);
}
