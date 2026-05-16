import type { CreatorsMultiplexWs } from './creatorsMultiplexWs';
import { normalizeMeUser } from './creatorsApi';
import type { UserAuthenticateResponse } from './userWsTypes';
import type { User } from '../types';

export interface UserUpdateProfileOpts {
	name?: string;
	username?: string;
	bio?: string;
	bannerUrl?: string;
	avatarUrl?: string;
	/** Per-minute rate in minor units (paise), same as HTTP `perMinuteRate`. */
	perMinuteRate?: number;
}

/** Build `user /updateprofile` KV command per Command V2 spec. */
export function buildUserUpdateProfileCommand(opts: UserUpdateProfileOpts): string {
	const parts: string[] = ['/updateprofile'];
	const pushKv = (key: string, value: string | number | undefined) => {
		if (value === undefined || value === null) return;
		const s = typeof value === 'string' ? value.trim() : String(value);
		if (!s) return;
		parts.push(`${key}=${s}`);
	};
	pushKv('name', opts.name);
	pushKv('username', opts.username);
	pushKv('bio', opts.bio);
	pushKv('banner_url', opts.bannerUrl);
	pushKv('avatar_url', opts.avatarUrl);
	if (opts.perMinuteRate != null && Number.isFinite(opts.perMinuteRate)) {
		parts.push(`per_minute_rate=${Math.round(opts.perMinuteRate)}`);
	}
	if (parts.length === 1) throw new Error('updateprofile requires at least one field');
	return parts.join(' ');
}

export function parseUserMeResponse(json: unknown): User | null {
	if (json == null || typeof json !== 'object') return null;
	const root = json as Record<string, unknown>;
	const userRaw = 'user' in root ? root.user : json;
	return normalizeMeUser(userRaw);
}

/** Bind JWT on an existing guest socket (token must be compact / no spaces). */
export function userWsAuthenticate(client: CreatorsMultiplexWs, jwt: string): Promise<UserAuthenticateResponse> {
	const t = jwt.trim();
	if (!t || t.includes(' ')) {
		return Promise.reject(new Error('Invalid JWT for WebSocket /authenticate'));
	}
	return client.send('user', `/authenticate ${t}`).then(json => json as UserAuthenticateResponse);
}

export function userWsMe(client: CreatorsMultiplexWs): Promise<User | null> {
	return client.send('user', '/me').then(json => parseUserMeResponse(json));
}

export function userWsUpdateProfile(
	client: CreatorsMultiplexWs,
	opts: UserUpdateProfileOpts
): Promise<User> {
	return client.send('user', buildUserUpdateProfileCommand(opts)).then(json => {
		const user = parseUserMeResponse(json);
		if (!user) throw new Error('updateprofile returned no user');
		return user;
	});
}

export function userWsLogout(client: CreatorsMultiplexWs): Promise<void> {
	return client.send('user', '/logout').then(() => {});
}
