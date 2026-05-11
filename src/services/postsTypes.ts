export type PostVisibility = 'public' | 'subscribers' | 'ppv';

export interface PostMediaDTO {
	type: 'image' | 'video';
	url: string;
	[key: string]: unknown;
}

export interface PostDTO {
	id: string;
	// Numeric id as string (per backend spec)
	user_id: string;
	text: string;
	visibility: PostVisibility;
	ppv_price_usd_cents: number | null;
	media: PostMediaDTO[];
	like_count: number;
	comment_count: number;
	created_at: string;
	updated_at: string;
}

export interface CommentDTO {
	id: string;
	post_id: string;
	// Numeric id as string (per backend spec)
	user_id: string;
	text: string;
	created_at: string;
	/** null = top-level comment */
	parent_comment_id?: string | null;
	heart_count?: number;
}

export interface CommentHeartUpdatePayload {
	post_id: string;
	comment_id: string;
	heart_count: number;
}

export interface ReportPostResponse {
	ok: true;
	already_reported?: true;
}

export interface ListPostsResponse {
	posts: PostDTO[];
	nextCursor: string | null;
}

export interface ListCommentsResponse {
	comments: CommentDTO[];
	nextCursor: string | null;
}

export interface CreatePostResponse {
	post: PostDTO;
}

export interface LikePostResponse {
	postId: string;
	like_count: number;
	likedByMe: boolean;
}

export interface CreateCommentResponse {
	comment: CommentDTO;
}

export interface DeletePostResponse {
	ok: true;
}

export type PostsPushEvent =
	| 'new' |
	'updated' |
	'deleted' |
	'likeupdate' |
	'newcomment' |
	'commentheartupdate';

export interface DeletedPostEventPayload {
	id: string;
	user_id: string;
}

export interface LikeUpdateEventPayload {
	post_id: string;
	like_count: number;
}
