import type { CreatorsMultiplexWs } from './creatorsMultiplexWs';
import type { CreatorGetResponse, CreatorListResponse, CreatorUpsertResponse } from './creatorWsTypes';

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
	// The backend treats a single arg after `/list` as `q` (search), not `limit`.
	// So for the default directory case we must send bare `/list` (server default limit = 30).
	if (!q && !cat && !opts.beforeCursor && lim === 30) return '/list';
	const parts: string[] = ['/list'];
	if (q && cat) {
		parts.push(clamp(q, MAX_Q), clamp(cat, MAX_CATEGORY), String(lim));
	} else if (q) {
		parts.push(clamp(q, MAX_Q), String(lim));
	} else if (cat) {
		parts.push('', clamp(cat, MAX_CATEGORY), String(lim));
	} else {
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
