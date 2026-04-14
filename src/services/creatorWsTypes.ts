export interface CreatorSummaryDTO {
	id: string;
	user_id: string;
	username: string;
	name: string;
	avatar_url: string | null;
	categories: string[];
}

export interface CreatorProfileDTO extends CreatorSummaryDTO {
	bio: string | null;
	banner_url: string | null;
	socials: Record<string, unknown> | null;
	created_at: string;
}

export interface CreatorListResponse {
	creators: CreatorSummaryDTO[];
	nextCursor: string | null;
}

export interface CreatorGetResponse {
	creator: CreatorProfileDTO | null;
}

export interface CreatorUpsertResponse {
	creator: CreatorProfileDTO;
}
