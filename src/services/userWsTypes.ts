import type { User } from '../types';

export type UserWsRole = 'fan' | 'creator' | 'admin';

export interface UserAuthenticateResponse {
	ok: true;
	user_id: string;
}

/** Full session user from `user` service `/me` (same shape as HTTP GET /me). */
export interface UserMeWsResponse {
	user: User | null;
}

export interface UserUpdateProfileResponse {
	user: User;
}
