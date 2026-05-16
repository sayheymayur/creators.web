export interface CreatorSummaryDTO {
	id: string;
	user_id: string;
	username: string;
	name: string;
	avatar_url: string | null;
	categories: string[];
	/** B1: present when creator profile is marked NSFW. */
	is_nsfw?: boolean;
}

export interface CreatorTopDTO extends CreatorSummaryDTO {
	rank: number;
	score: string;
	score_follower_term: string;
	score_tips_minor_capped: string;
	follower_count: number;
	tips_minor_last_30d: string;
}

export interface CreatorProfileDTO extends CreatorSummaryDTO {
	bio: string | null;
	banner_url: string | null;
	socials: Record<string, unknown> | null;
	created_at: string;
	/** Spec: creator /get includes subscription price in minor units as integer string. */
	subscription_price_minor?: string | null;
	/** Spec: creator /get includes profile like stats for the viewer. */
	profile_like_count?: number;
	is_profile_liked?: boolean;
	/** Optional extra fields present on some backends (used for follow UI). */
	follower_count?: number | string | null;
	/** If present, prefer over client-side post counts for profile header. */
	post_count?: number | string | null;
	is_followed?: boolean | null;
}

export interface CreatorListResponse {
	creators: CreatorSummaryDTO[];
	nextCursor: string | null;
}

export interface CreatorTopResponse {
	creators: CreatorTopDTO[];
	nextCursor: string | null;
}

export interface CreatorGetResponse {
	creator: CreatorProfileDTO | null;
}

export interface CreatorUpsertResponse {
	creator: CreatorProfileDTO;
}
