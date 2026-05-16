import type { CreatorsMultiplexWs } from './creatorsMultiplexWs';
import type { WsClient } from './wsClient';
import type {
	CreatorGetResponse,
	CreatorListResponse,
	CreatorSummaryDTO,
	CreatorTopDTO,
	CreatorTopResponse,
	CreatorUpsertResponse,
} from './creatorWsTypes';

export interface CreatorFollowResponse {
	ok: true;
	creator_user_id: string;
}

export interface CreatorUnfollowResponse {
	ok: true;
	creator_user_id: string;
}

const MAX_Q = 64;
const MAX_CATEGORY = 32;

function clamp(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max);
}

function asString(v: unknown): string {
	return typeof v === 'string' ? v :
		typeof v === 'number' ? String(v) :
		'';
}

function normalizeSummaryRow(raw: unknown): CreatorSummaryDTO | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const id = asString(o.id);
	const userId = asString(o.user_id ?? o.userId);
	if (!id && !userId) return null;
	return {
		id: id || userId,
		user_id: userId || id,
		username: asString(o.username),
		name: asString(o.name),
		avatar_url: typeof o.avatar_url === 'string' ? o.avatar_url : null,
		categories: Array.isArray(o.categories) ? o.categories.map(String) : [],
		is_nsfw: o.is_nsfw === true,
	};
}

function normalizeTopRow(raw: unknown): CreatorTopDTO | null {
	const base = normalizeSummaryRow(raw);
	if (!base) return null;
	const o = raw as Record<string, unknown>;
	return {
		...base,
		rank: typeof o.rank === 'number' ? o.rank : Number(o.rank) || 0,
		score: asString(o.score),
		score_follower_term: asString(o.score_follower_term),
		score_tips_minor_capped: asString(o.score_tips_minor_capped),
		follower_count: typeof o.follower_count === 'number' ? o.follower_count : Number(o.follower_count) || 0,
		tips_minor_last_30d: asString(o.tips_minor_last_30d),
	};
}

/** Normalize WS or HTTP list/top JSON to `CreatorListResponse`. */
export function normalizeCreatorListResponse(json: unknown): CreatorListResponse {
	const root = json && typeof json === 'object' ? json as Record<string, unknown> : {};
	const rows = Array.isArray(root.creators) ? root.creators : [];
	const creators = rows.map(normalizeSummaryRow).filter((c): c is CreatorSummaryDTO => c != null);
	const nextCursor =
		typeof root.nextCursor === 'string' ? root.nextCursor :
		typeof root.next_cursor === 'string' ? root.next_cursor :
		null;
	return { creators, nextCursor };
}

/** Normalize WS or HTTP top JSON to `CreatorTopResponse`. */
export function normalizeCreatorTopResponse(json: unknown): CreatorTopResponse {
	const root = json && typeof json === 'object' ? json as Record<string, unknown> : {};
	const rows = Array.isArray(root.creators) ? root.creators : [];
	const creators = rows.map(normalizeTopRow).filter((c): c is CreatorTopDTO => c != null);
	const nextCursor =
		typeof root.nextCursor === 'string' ? root.nextCursor :
		typeof root.next_cursor === 'string' ? root.next_cursor :
		null;
	return { creators, nextCursor };
}

export interface CreatorListCommandOpts {
	q?: string;
	category?: string;
	limit?: number;
	/** Pagination cursor from prior `nextCursor`. */
	cursor?: string;
	/** @deprecated Use `cursor`. */
	beforeCursor?: string;
}

/**
 * B1: `/list` with KV args `q=`, `category=`, `limit=`, `cursor=`.
 * Bare `/list` when no filters (server default limit 30).
 */
export function buildCreatorListCommand(opts: CreatorListCommandOpts = {}): string {
	const lim = Math.min(50, Math.max(1, opts.limit ?? 30));
	const q = opts.q?.trim() ?? '';
	const cat = opts.category?.trim() ?? '';
	const cursor = (opts.cursor ?? opts.beforeCursor)?.trim() ?? '';

	if (!q && !cat && !cursor) return '/list';

	const parts: string[] = ['/list'];
	if (q) parts.push(`q=${clamp(q, MAX_Q)}`);
	if (cat) parts.push(`category=${clamp(cat, MAX_CATEGORY)}`);
	parts.push(`limit=${lim}`);
	if (cursor) parts.push(`cursor=${cursor}`);
	return parts.join(' ');
}

export interface CreatorTopCommandOpts {
	limit?: number;
	cursor?: string;
}

/** B4: `/top [limit] [cursor]` as KV tokens per spec. */
export function buildCreatorTopCommand(opts: CreatorTopCommandOpts = {}): string {
	const lim = Math.min(50, Math.max(1, opts.limit ?? 30));
	const cursor = opts.cursor?.trim() ?? '';
	if (!cursor && opts.limit === undefined) return '/top';
	const parts: string[] = ['/top', `limit=${lim}`];
	if (cursor) parts.push(`cursor=${cursor}`);
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

export function creatorWsList(
	client: CreatorsMultiplexWs,
	opts: CreatorListCommandOpts
): Promise<CreatorListResponse> {
	return client.send('creator', buildCreatorListCommand(opts)).then(json => normalizeCreatorListResponse(json));
}

export function creatorWsTop(
	client: CreatorsMultiplexWs,
	opts: CreatorTopCommandOpts = {}
): Promise<CreatorTopResponse> {
	return client.send('creator', buildCreatorTopCommand(opts)).then(json => normalizeCreatorTopResponse(json));
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

/**
 * `> creator <rid>\n/follow <creatorUserId>` over the primary WsClient.
 */
export function creatorFollow(ws: WsClient, creatorUserId: string, requestId?: string): Promise<CreatorFollowResponse> {
	const id = String(creatorUserId).trim();
	if (!id) throw new Error('creatorUserId is required');
	if (/\s/.test(id)) throw new Error('creatorUserId must not contain whitespace');
	const rid = requestId?.trim() || undefined;
	if (rid && /\s/.test(rid)) throw new Error('requestId must not contain spaces');
	return ws.request('creator', 'follow', [id], rid).then(json => json as CreatorFollowResponse);
}

export function creatorUnfollow(ws: WsClient, creatorUserId: string, requestId?: string): Promise<CreatorUnfollowResponse> {
	const id = String(creatorUserId).trim();
	if (!id) throw new Error('creatorUserId is required');
	if (/\s/.test(id)) throw new Error('creatorUserId must not contain whitespace');
	const rid = requestId?.trim() || undefined;
	if (rid && /\s/.test(rid)) throw new Error('requestId must not contain spaces');
	return ws.request('creator', 'unfollow', [id], rid).then(json => json as CreatorUnfollowResponse);
}
