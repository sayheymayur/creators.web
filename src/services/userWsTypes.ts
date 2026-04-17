export type UserWsRole = 'fan' | 'creator' | 'admin';

export interface UserAuthenticateResponse {
	ok: true;
	user_id: string;
}

/** Minimal user row from `user` service `/me`. */
export interface UserMeWsResponse {
	id: string;
	email: string;
	display_name: string;
	role: UserWsRole;
	created_at: string;
}
