import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useReducer,
	useRef,
} from 'react';
import type { Post, Comment } from '../types';
import { isPostLiked, setPostLiked } from '../services/likedPosts';
import { setPostCommented } from '../services/commentedPosts';
import { useEnsureWsAuth, useWs, useWsAuthReady, useWsConnected } from './WsContext';
import { isPostsMockMode } from '../services/postsMode';
import {
	buildCreatorListCommand,
} from '../services/creatorWsService';
import type { CreatorGetResponse, CreatorListResponse } from '../services/creatorWsTypes';
import type {
	CommentDTO,
	CommentHeartUpdatePayload,
	DeletedPostEventPayload,
	LikeUpdateEventPayload,
	ListCommentsResponse,
	ListPostsResponse,
	PostDTO,
	ReportPostResponse,
} from '../services/postsTypes';
import {
	type CreatorDisplay,
	commentDtoToComment,
	mergePostDtoIntoPost,
	postDtoToPost,
} from '../services/postDtoMap';
import { useAuth } from './AuthContext';

export type PostsWsStatus = 'idle' | 'connecting' | 'ready' | 'error';

export interface CreatePostInput {
	visibility: 'public' | 'subscribers' | 'ppv';
	text: string;
	assetIds?: string[];
	ppvUsdCents?: number;
}

interface ContentState {
	posts: Post[];
	subscribedCreatorUserIds: string[];
	postsWsStatus: PostsWsStatus;
	postsWsError: string | null;
	feedNextCursor: string | null;
	exploreNextCursor: string | null;
	/** Ordered post ids from `/list explore` for the Explore screen. */
	explorePostIds: string[];
	/** Per-post next cursor for `/comments` pagination; key missing until first fetch; `null` = no more pages. */
	commentPagination: Record<string, string | null>;
	creatorCursors: Record<string, string | null>;
	creatorProfiles: Record<string, CreatorDisplay>;
	/** Post ids the current user has saved (from `/listsaved` bootstrap + toggles). */
	savedPostIds: Record<string, true>;
	/** Ordered posts for the `/saved` screen (from `/listsaved`). */
	savedFeedPosts: Post[];
	savedFeedNextCursor: string | null;
}

type ContentAction =
	| { type: 'TOGGLE_LIKE', payload: { postId: string, userId: string } } |
	{ type: 'SET_LIKE_SERVER', payload: { postId: string, like_count: number, likedByMe: boolean, userId: string } } |
	{ type: 'PATCH_POST_LIKES', payload: { postId: string, like_count: number } } |
	{ type: 'ADD_COMMENT', payload: { postId: string, comment: Comment } } |
	{ type: 'PATCH_COMMENT_HEART', payload: { postId: string, commentId: string, heart_count: number } } |
	{ type: 'UNLOCK_POST', payload: { postId: string, userId: string } } |
	{ type: 'ADD_POST', payload: Post } |
	{ type: 'UPSERT_POST', payload: Post } |
	{ type: 'DELETE_POST', payload: string } |
	{ type: 'SUBSCRIBE', payload: string } |
	{ type: 'UNSUBSCRIBE', payload: string } |
	{ type: 'UPDATE_POST', payload: Partial<Post> & { id: string } } |
	{ type: 'MERGE_POSTS_LIST', payload: { posts: Post[], nextCursor: string | null, listKind: 'feed' | 'explore' | 'creator', creatorId?: string, replaceExploreOrder?: boolean } } |
	{ type: 'SET_POST_COMMENTS', payload: { postId: string, comments: Comment[], nextCursor: string | null, mode: 'replace' | 'append' } } |
	{ type: 'SET_WS', payload: { status: PostsWsStatus, error?: string | null } } |
	{ type: 'SET_CREATOR_PROFILES', payload: Record<string, CreatorDisplay> } |
	{ type: 'HYDRATE_SAVED_FROM_LIST', payload: { posts: Post[] } } |
	{ type: 'SET_SAVED_PAGE_FEED', payload: { posts: Post[], nextCursor: string | null, mode: 'replace' | 'append' } } |
	{ type: 'PATCH_SAVED_ID', payload: { postId: string, saved: boolean } } |
	{ type: 'CLEAR_SAVED_LOCAL' };

const initialState: ContentState = {
	posts: [],
	subscribedCreatorUserIds: [],
	postsWsStatus: 'idle',
	postsWsError: null,
	feedNextCursor: null,
	exploreNextCursor: null,
	explorePostIds: [],
	commentPagination: {},
	creatorCursors: {},
	creatorProfiles: {},
	savedPostIds: {},
	savedFeedPosts: [],
	savedFeedNextCursor: null,
};

function sortPostsNewestFirst(posts: Post[]): Post[] {
	return [...posts].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);
}

function mergeIncomingPosts(prevPosts: Post[], incoming: Post[]): Post[] {
	const byId: Record<string, Post> = {};
	for (const p of prevPosts) {
		byId[p.id] = p;
	}
	for (const p of incoming) {
		const prev = byId[p.id];
		byId[p.id] = prev ?
			{
				...prev,
				...p,
				comments: prev.comments,
				commentCount: p.commentCount,
				likedBy: p.likedBy?.length ? p.likedBy : prev.likedBy,
			} :
			p;
	}
	return sortPostsNewestFirst(Object.values(byId));
}

function uniqueStrings(ids: string[]): string[] {
	const out: string[] = [];
	const seen: Record<string, boolean> = {};
	for (const id of ids) {
		if (seen[id]) continue;
		seen[id] = true;
		out.push(id);
	}
	return out;
}

function wsEscapeMultilineText(text: string): string {
	// WS request protocol is line-oriented; literal newlines would truncate the command.
	// Escape to a single line; UI will decode `\\n` back to newlines on render.
	return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\\n');
}

function contentReducer(state: ContentState, action: ContentAction): ContentState {
	switch (action.type) {
		case 'TOGGLE_LIKE': {
			return {
				...state,
				posts: state.posts.map(p => {
					if (p.id !== action.payload.postId) return p;
					const liked = p.likedBy.includes(action.payload.userId);
					return {
						...p,
						likes: liked ? p.likes - 1 : p.likes + 1,
						likedBy: liked ?
							p.likedBy.filter(id => id !== action.payload.userId) :
							[...p.likedBy, action.payload.userId],
					};
				}),
			};
		}
		case 'SET_LIKE_SERVER': {
			const { postId, like_count, likedByMe, userId } = action.payload;
			return {
				...state,
				posts: state.posts.map(p => {
					if (p.id !== postId) return p;
					return {
						...p,
						likes: like_count,
						likedBy: likedByMe ? [userId] : [],
					};
				}),
			};
		}
		case 'PATCH_POST_LIKES': {
			return {
				...state,
				posts: state.posts.map(p =>
					p.id === action.payload.postId ? { ...p, likes: action.payload.like_count } : p
				),
			};
		}
		case 'ADD_COMMENT': {
			const { postId, comment } = action.payload;
			return {
				...state,
				posts: state.posts.map(p => {
					if (p.id !== postId) return p;
					if (p.comments.some(c => c.id === comment.id)) return p;
					return {
						...p,
						comments: [...p.comments, comment],
						commentCount: p.commentCount + 1,
					};
				}),
			};
		}
		case 'PATCH_COMMENT_HEART': {
			const { postId, commentId, heart_count } = action.payload;
			return {
				...state,
				posts: state.posts.map(p => {
					if (p.id !== postId) return p;
					return {
						...p,
						comments: p.comments.map(c =>
							c.id === commentId ? { ...c, heartCount: heart_count } : c
						),
					};
				}),
			};
		}
		case 'UNLOCK_POST': {
			return {
				...state,
				posts: state.posts.map(p =>
					p.id === action.payload.postId ?
						{ ...p, unlockedBy: [...p.unlockedBy, action.payload.userId] } :
						p
				),
			};
		}
		case 'ADD_POST': {
			const incoming = action.payload;
			if (state.posts.some(p => p.id === incoming.id)) return state;
			return { ...state, posts: [incoming, ...state.posts] };
		}
		case 'UPSERT_POST': {
			const incoming = action.payload;
			const idx = state.posts.findIndex(p => p.id === incoming.id);
			if (idx === -1) {
				return { ...state, posts: sortPostsNewestFirst([incoming, ...state.posts]) };
			}
			const merged = { ...state.posts[idx], ...incoming, comments: state.posts[idx].comments };
			const next = [...state.posts];
			next[idx] = merged;
			return { ...state, posts: sortPostsNewestFirst(next) };
		}
		case 'DELETE_POST': {
			const pid = action.payload;
			const { [pid]: _rm, ...restPagination } = state.commentPagination;
			const nextSavedIds = { ...state.savedPostIds };
			delete nextSavedIds[pid];
			return {
				...state,
				posts: state.posts.filter(p => p.id !== pid),
				explorePostIds: state.explorePostIds.filter(id => id !== pid),
				commentPagination: restPagination,
				savedPostIds: nextSavedIds,
				savedFeedPosts: state.savedFeedPosts.filter(p => p.id !== pid),
			};
		}
		case 'SUBSCRIBE': {
			if (state.subscribedCreatorUserIds.includes(action.payload)) return state;
			return { ...state, subscribedCreatorUserIds: [...state.subscribedCreatorUserIds, action.payload] };
		}
		case 'UNSUBSCRIBE': {
			return {
				...state,
				subscribedCreatorUserIds: state.subscribedCreatorUserIds.filter(id => id !== action.payload),
			};
		}
		case 'UPDATE_POST': {
			return {
				...state,
				posts: state.posts.map(p =>
					p.id === action.payload.id ? { ...p, ...action.payload } : p
				),
			};
		}
		case 'MERGE_POSTS_LIST': {
			const { posts: incoming, nextCursor, listKind, creatorId, replaceExploreOrder } = action.payload;
			const byId: Record<string, Post> = {};
			for (const p of state.posts) {
				byId[p.id] = p;
			}
			for (const p of incoming) {
				const prev = byId[p.id];
				byId[p.id] = prev ?
					{
						...prev,
						...p,
						comments: prev.comments,
						commentCount: p.commentCount,
						likedBy: p.likedBy?.length ? p.likedBy : prev.likedBy,
					} :
					p;
			}
			const mergedList: Post[] = [];
			Object.keys(byId).forEach(k => {
				mergedList.push(byId[k]);
			});
			const incomingIds = incoming.map(p => p.id);
			const explorePostIds = listKind === 'explore' ?
				(replaceExploreOrder ?
					incomingIds :
					[...state.explorePostIds, ...incomingIds.filter(id => !state.explorePostIds.includes(id))]) :
				state.explorePostIds;
			return {
				...state,
				posts: sortPostsNewestFirst(mergedList),
				feedNextCursor: listKind === 'feed' ? nextCursor : state.feedNextCursor,
				exploreNextCursor: listKind === 'explore' ? nextCursor : state.exploreNextCursor,
				explorePostIds,
				creatorCursors: creatorId ?
					{ ...state.creatorCursors, [creatorId]: nextCursor } :
					state.creatorCursors,
			};
		}
		case 'SET_POST_COMMENTS': {
			const { postId, comments: incoming, nextCursor, mode } = action.payload;
			return {
				...state,
				posts: state.posts.map(p => {
					if (p.id !== postId) return p;
					const base = mode === 'replace' ? [] : p.comments;
					const byId: Record<string, Comment> = {};
					for (const c of [...base, ...incoming]) {
						byId[c.id] = c;
					}
					const merged = Object.values(byId).sort(
						(a, b) =>
							(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) ||
							a.id.localeCompare(b.id)
					);
					return { ...p, comments: merged };
				}),
				commentPagination: {
					...state.commentPagination,
					[postId]: nextCursor,
				},
			};
		}
		case 'SET_WS': {
			return {
				...state,
				postsWsStatus: action.payload.status,
				postsWsError: action.payload.error ?? null,
			};
		}
		case 'SET_CREATOR_PROFILES': {
			const patch = action.payload;
			const patchKeys = Object.keys(patch);
			return {
				...state,
				creatorProfiles: { ...state.creatorProfiles, ...patch },
				posts: patchKeys.length === 0 ? state.posts : state.posts.map(p => {
					const prof = patch[p.creatorId];
					if (!prof) return p;
					return {
						...p,
						creatorName: prof.name ?? p.creatorName,
						creatorUsername: prof.username ?? p.creatorUsername,
						creatorAvatar: prof.avatar ?? p.creatorAvatar,
					};
				}),
			};
		}
		case 'HYDRATE_SAVED_FROM_LIST': {
			const { posts } = action.payload;
			const ids = { ...state.savedPostIds };
			for (const p of posts) ids[p.id] = true;
			return {
				...state,
				savedPostIds: ids,
				posts: mergeIncomingPosts(state.posts, posts),
			};
		}
		case 'SET_SAVED_PAGE_FEED': {
			const { posts, nextCursor, mode } = action.payload;
			const nextFeed = mode === 'replace' ? posts : [...state.savedFeedPosts, ...posts];
			const ids = { ...state.savedPostIds };
			for (const p of posts) ids[p.id] = true;
			return {
				...state,
				savedFeedPosts: nextFeed,
				savedFeedNextCursor: nextCursor,
				savedPostIds: ids,
				posts: mergeIncomingPosts(state.posts, posts),
			};
		}
		case 'PATCH_SAVED_ID': {
			const { postId, saved } = action.payload;
			const ids = { ...state.savedPostIds };
			if (saved) ids[postId] = true;
			else delete ids[postId];
			let savedFeedPosts = state.savedFeedPosts;
			if (saved) {
				const p = state.posts.find(x => x.id === postId);
				if (p && !savedFeedPosts.some(x => x.id === postId)) {
					savedFeedPosts = [p, ...savedFeedPosts];
				}
			} else {
				savedFeedPosts = savedFeedPosts.filter(p => p.id !== postId);
			}
			return { ...state, savedPostIds: ids, savedFeedPosts };
		}
		case 'CLEAR_SAVED_LOCAL': {
			return {
				...state,
				savedPostIds: {},
				savedFeedPosts: [],
				savedFeedNextCursor: null,
			};
		}
		default:
			return state;
	}
}

interface ContentContextValue {
	state: ContentState;
	/** Multiplex WebSocket status (feed + chat share this connection when not in posts mock mode). */
	postsWsStatus: PostsWsStatus;
	toggleLike: (postId: string, userId: string) => Promise<void>;
	addComment: (postId: string, text: string) => Promise<void>;
	addReply: (postId: string, parentCommentId: string, text: string) => Promise<void>;
	heartComment: (commentId: string) => Promise<void>;
	unlockPost: (postId: string, userId: string) => void;
	addPost: (post: Post) => void;
	createPost: (input: CreatePostInput) => Promise<void>;
	editPost: (postId: string, text: string) => Promise<void>;
	deletePost: (postId: string) => Promise<void>;
	reportPost: (postId: string, reason: string) => Promise<ReportPostResponse>;
	subscribe: (creatorUserId: string) => void;
	unsubscribe: (creatorUserId: string) => void;
	isSubscribed: (creatorUserId: string) => boolean;
	updatePost: (post: Partial<Post> & { id: string }) => Promise<void>;
	loadMoreFeed: () => Promise<void>;
	refreshFeed: () => Promise<void>;
	loadMoreExplore: () => Promise<void>;
	refreshExplore: () => Promise<void>;
	loadCreatorPosts: (creatorUserId: string, reset?: boolean) => Promise<void>;
	loadPostComments: (postId: string) => Promise<void>;
	loadMorePostComments: (postId: string) => Promise<void>;
	creatorWsSearch: (opts: {
		q?: string,
		category?: string,
		limit?: number,
		beforeCursor?: string,
	}) => Promise<CreatorListResponse>;
	creatorWsGetByPk: (creatorRowId: string) => Promise<CreatorGetResponse>;
	/** Resolve creator profile by author user id (user_id from posts). */
	creatorWsGetByUserId: (creatorUserId: string) => Promise<CreatorGetResponse>;
	creatorWsUpsert: (username: string, name: string, bio?: string) => Promise<void>;
	isPostSaved: (postId: string) => boolean;
	savePost: (postId: string) => Promise<void>;
	unsavePost: (postId: string) => Promise<void>;
	/** Load `/listsaved` into `state.savedFeedPosts` (fan saved screen). */
	loadSavedFeed: (reset: boolean) => Promise<void>;
}

const ContentContext = createContext<ContentContextValue | null>(null);

export function ContentProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(contentReducer, initialState);
	const { state: authState } = useAuth();
	const ws = useWs();
	const wsConnected = useWsConnected();
	const wsAuthReady = useWsAuthReady();
	const ensureWsAuth = useEnsureWsAuth();
	const authUserRef = useRef(authState.user);
	authUserRef.current = authState.user;
	const mockMode = isPostsMockMode();
	const stateRef = useRef(state);
	stateRef.current = state;
	const creatorUserInflightRef = useRef<Partial<Record<string, Promise<void>>>>({});
	const creatorBootstrapRef = useRef<{ userId: string, username: string } | null>(null);
	const initialWsPostsLoadedKeyRef = useRef<string | null>(null);
	const savedListBootstrapKeyRef = useRef<string | null>(null);

	const creatorWsDebugEnabled = useCallback((): boolean => {
		if (!import.meta.env.DEV) return false;
		if (import.meta.env.VITE_DEBUG_CREATOR_WS === 'true') return true;
		try {
			return globalThis.localStorage?.getItem('cw.debug.creatorWs') === '1';
		} catch {
			return false;
		}
	}, []);

	const creatorWsDebug = useCallback((msg: string, data?: unknown) => {
		if (!creatorWsDebugEnabled()) return;
		if (data === undefined) console.debug(msg);
		else console.debug(msg, data);
	}, [creatorWsDebugEnabled]);

	/**
	 * Dev-only in-flight dedupe for React 18 StrictMode double-mount:
	 * When the app mounts twice in development, identical WS requests can be fired twice.
	 * We keep a short-lived per-command promise cache so the second call reuses the first.
	 */
	const wsInflightDedupe = useRef<Record<string, Promise<unknown>>>({});

	const wsRequestLine = useCallback(
		(service: string, line: string): Promise<unknown> => {
			const trimmed = line.trim();
			if (!trimmed.startsWith('/')) {
				return Promise.reject(new Error(`Invalid WS command line: ${trimmed}`));
			}

			const key = `${service} ${trimmed}`;
			if (import.meta.env.DEV) {
				const existing = wsInflightDedupe.current[key];
				if (existing !== undefined) return existing;
			}

			const parts = trimmed.split(' ');
			const command = parts[0].slice(1);
			const args = parts.slice(1);
			const p = ensureWsAuth().then(() => ws.request(service, command, args));
			if (import.meta.env.DEV) {
				wsInflightDedupe.current[key] = p;
				p.finally(() => {
					// Only clear if the same promise is still stored.
					if (wsInflightDedupe.current[key] === p) delete wsInflightDedupe.current[key];
				});
			}
			return p;
		},
		[ws, ensureWsAuth]
	);

	const resolveCreatorDisplay = useCallback(
		(userId: string, profiles: Record<string, CreatorDisplay>): CreatorDisplay | undefined => {
			const u = authUserRef.current;
			if (u?.id === userId) {
				return { name: u.name, avatar: u.avatar, username: u.username };
			}
			const row = profiles[userId];
			// Legacy bug: unknown users were cached as post-author-looking "Creator"; treat as unresolved.
			if (row && row.name === 'Creator' && row.username === 'creator') {
				return undefined;
			}
			return row;
		},
		[]
	);

	const fetchProfilesForIds = useCallback(
		(ids: string[]): Promise<Record<string, CreatorDisplay>> => {
			const unique = uniqueStrings(ids);
			const prev = stateRef.current.creatorProfiles;
			const batch: Record<string, CreatorDisplay> = {};
			const missing: string[] = [];

			for (const id of unique) {
				const cached = resolveCreatorDisplay(id, prev);
				if (cached) continue;
				missing.push(id);
				const tail = id.replace(/-/g, '').slice(-6) || id.slice(0, 8);
				batch[id] = { name: `User ·${tail}`, avatar: '', username: 'user' };
			}

			// Resolve fast with cached + placeholders.
			const merged: Record<string, CreatorDisplay> = {};
			Object.keys(prev).forEach(k => { merged[k] = prev[k]; });
			Object.keys(batch).forEach(k => { merged[k] = batch[k]; });

			if (Object.keys(batch).length) {
				dispatch({ type: 'SET_CREATOR_PROFILES', payload: batch });
			}

			// If socket isn't ready yet, don't attempt background hydration; it will fail and never retry.
			if (stateRef.current.postsWsStatus !== 'ready') {
				return Promise.resolve(merged);
			}

			// Hydrate missing profiles in background without blocking UI.
			for (const id of missing) {
				if (creatorUserInflightRef.current[id]) continue;
				const p = creatorWsGetByUserId(id)
					.then(r => {
						if (!r.creator) return;
						dispatch({
							type: 'SET_CREATOR_PROFILES',
							payload: {
								[id]: {
									name: r.creator.name,
									username: r.creator.username,
									avatar: r.creator.avatar_url ?? '',
								},
							},
						});
					})
					.catch(() => {})
					.finally(() => {
						delete creatorUserInflightRef.current[id];
					});
				creatorUserInflightRef.current[id] = p;
			}

			return Promise.resolve(merged);
		},
		[resolveCreatorDisplay]
	);

	useEffect(() => {
		// When the socket becomes ready, retry hydration for any creator placeholders already in cache.
		if (state.postsWsStatus !== 'ready') return;
		const prev = stateRef.current.creatorProfiles;
		const ids = Object.keys(prev).filter(id => {
			const p = prev[id];
			if (!p) return false;
			return p.username === 'creator' || p.name === 'Creator';
		});
		if (ids.length === 0) return;
		void fetchProfilesForIds(ids).then(() => {});
	}, [mockMode, state.postsWsStatus, fetchProfilesForIds]);

	const mapList = useCallback(
		(json: unknown): Promise<Post[]> => {
			const currentUserId = authUserRef.current?.id;
			const body = json as ListPostsResponse;
			const dtos = body.posts ?? [];
			if (dtos.length === 0) return Promise.resolve([]);
			const userIds = dtos.map(d => String(d.user_id));
			return fetchProfilesForIds(userIds).then(profiles =>
				dtos.map(d =>
					postDtoToPost(
						d,
						resolveCreatorDisplay(String(d.user_id), profiles),
						currentUserId ? isPostLiked(currentUserId, d.id) : false,
						currentUserId
					)
				)
			);
		},
		[fetchProfilesForIds, resolveCreatorDisplay]
	);

	const handlePush = useCallback(
		(event: string, payload: unknown) => {
			const uid = authUserRef.current?.id;
			if (event === 'deleted') {
				const pl = payload as DeletedPostEventPayload;
				dispatch({ type: 'DELETE_POST', payload: pl.id });
				return;
			}
			if (event === 'likeupdate') {
				const pl = payload as LikeUpdateEventPayload;
				dispatch({ type: 'PATCH_POST_LIKES', payload: { postId: pl.post_id, like_count: pl.like_count } });
				return;
			}
			if (event === 'new' || event === 'updated') {
				const dto = payload as PostDTO;
				const id = String(dto.user_id);
				void fetchProfilesForIds([id]).then(profiles => {
					const prof = resolveCreatorDisplay(id, profiles);
					const existing = stateRef.current.posts.find(p => p.id === dto.id);
					const likedByMe = uid ? existing?.likedBy.includes(uid) ?? false : false;
					const post = existing ?
						mergePostDtoIntoPost(existing, dto, prof, uid) :
						postDtoToPost(dto, prof, likedByMe, uid);
					dispatch({ type: 'UPSERT_POST', payload: post });
				});
				return;
			}
			if (event === 'newcomment') {
				const dto = payload as CommentDTO;
				const id = String(dto.user_id);
				void fetchProfilesForIds([id]).then(profiles => {
					const prof = resolveCreatorDisplay(id, profiles);
					const comment = commentDtoToComment(dto, prof);
					dispatch({ type: 'ADD_COMMENT', payload: { postId: dto.post_id, comment } });
				});
			}
		},
		[fetchProfilesForIds, resolveCreatorDisplay]
	);

	// Posts push events (spec): |posts|new|{...}, |posts|updated|{...}, etc.
	useEffect(() => {
		if (!wsConnected) return;
		const offNew = ws.on('posts', 'new', data => handlePush('new', data));
		const offUpdated = ws.on('posts', 'updated', data => handlePush('updated', data));
		const offDeleted = ws.on('posts', 'deleted', data => handlePush('deleted', data));
		const offLike = ws.on('posts', 'likeupdate', data => handlePush('likeupdate', data));
		const offComment = ws.on('posts', 'newcomment', data => handlePush('newcomment', data));
		const offCommentHeart = ws.on('posts', 'commentheartupdate', (data: unknown) => {
			const pl = data as CommentHeartUpdatePayload;
			if (!pl?.post_id || !pl?.comment_id) return;
			dispatch({
				type: 'PATCH_COMMENT_HEART',
				payload: {
					postId: String(pl.post_id),
					commentId: String(pl.comment_id),
					heart_count: Number(pl.heart_count) || 0,
				},
			});
		});
		return () => {
			offNew();
			offUpdated();
			offDeleted();
			offLike();
			offComment();
			offCommentHeart();
		};
	}, [ws, wsConnected, handlePush]);

	// Spec-based bootstrapping for feed/explore (and my creator posts).
	useEffect(() => {
		const key = authState.user ? `${authState.user.role}:${authState.user.id}` : 'guest';
		if (!wsConnected) {
			dispatch({ type: 'SET_WS', payload: { status: 'connecting' } });
			return;
		}
		if (!wsAuthReady) return;
		if (initialWsPostsLoadedKeyRef.current === key) return;
		initialWsPostsLoadedKeyRef.current = key;

		dispatch({ type: 'SET_WS', payload: { status: 'ready', error: null } });

		const feedP = wsRequestLine('posts', '/list feed 30')
			.then(json => mapList(json).then(posts => {
				const body = json as ListPostsResponse;
				dispatch({
					type: 'MERGE_POSTS_LIST',
					payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'feed' },
				});
			}));

		const exploreP = wsRequestLine('posts', '/list explore 30')
			.then(json => mapList(json).then(posts => {
				const body = json as ListPostsResponse;
				dispatch({
					type: 'MERGE_POSTS_LIST',
					payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'explore', replaceExploreOrder: true },
				});
			}));

		const u = authUserRef.current;
		const myId = u?.id;
		const canHaveOwnPosts = u?.role === 'creator' || u?.role === 'admin';
		const creatorP = myId && canHaveOwnPosts ?
			wsRequestLine('posts', `/list creator ${myId} 30`)
				.then(json => mapList(json).then(posts => {
					const body = json as ListPostsResponse;
					dispatch({
						type: 'MERGE_POSTS_LIST',
						payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'creator', creatorId: myId },
					});
				})) :
			Promise.resolve();

		void Promise.all([feedP, exploreP, creatorP]).catch(e => {
			dispatch({ type: 'SET_WS', payload: { status: 'error', error: e instanceof Error ? e.message : String(e) } });
		});
	}, [wsConnected, wsAuthReady, wsRequestLine, mapList, authState.user]);

	// Clear saved state when logging out.
	useEffect(() => {
		if (authState.user?.id) return;
		savedListBootstrapKeyRef.current = null;
		dispatch({ type: 'CLEAR_SAVED_LOCAL' });
	}, [authState.user?.id]);

	// Hydrate saved-post ids for bookmark state (requires login).
	useEffect(() => {
		if (!wsConnected || !wsAuthReady) return;
		const u = authUserRef.current;
		if (!u) return;
		const key = `saved-bootstrap:${u.id}`;
		if (savedListBootstrapKeyRef.current === key) return;
		savedListBootstrapKeyRef.current = key;
		void wsRequestLine('posts', '/listsaved 30')
			.then(json => mapList(json).then(posts => {
				dispatch({ type: 'HYDRATE_SAVED_FROM_LIST', payload: { posts } });
			}))
			.catch(() => {
				savedListBootstrapKeyRef.current = null;
			});
	}, [wsConnected, wsAuthReady, wsRequestLine, mapList, authState.user?.id]);

	const creatorWsSearch = useCallback(
		(opts: { q?: string, category?: string, limit?: number, beforeCursor?: string }) => {
			const cmd = buildCreatorListCommand(opts);
			creatorWsDebug('[creator-ws] -> /list', { cmd, opts });
			return wsRequestLine('creator', cmd).then(json => json as CreatorListResponse);
		},
		[wsRequestLine, creatorWsDebug]
	);

	const creatorWsGetByPk = useCallback(
		(creatorRowId: string) => wsRequestLine('creator', `/get ${creatorRowId}`).then(json => json as CreatorGetResponse),
		[wsRequestLine]
	);

	const creatorWsGetByUserId = useCallback(
		(creatorUserId: string) => {
			// Backend behavior (observed): `creator /get <id>` expects creatorUserId (users.id),
			// not the creators table row PK. Calling `/get <creatorRowId>` returns the wrong profile.
			const uid = String(creatorUserId).trim();
			return wsRequestLine('creator', `/get ${uid}`).then(json => json as CreatorGetResponse);
		},
		[wsRequestLine]
	);

	const creatorWsUpsert = useCallback(
		(username: string, name: string, bio?: string) =>
			wsRequestLine('creator', (() => {
				const parts: string[] = ['/upsertprofile', username.trim(), name.trim()];
				const b = bio?.trim();
				if (b) parts.push(b);
				return parts.join(' ');
			})()).then(() => {}),
		[wsRequestLine]
	);

	const savePost = useCallback(
		(postId: string) =>
			wsRequestLine('posts', `/save ${postId}`).then(() => {
				dispatch({ type: 'PATCH_SAVED_ID', payload: { postId, saved: true } });
			}),
		[wsRequestLine]
	);

	const unsavePost = useCallback(
		(postId: string) =>
			wsRequestLine('posts', `/unsave ${postId}`).then(() => {
				dispatch({ type: 'PATCH_SAVED_ID', payload: { postId, saved: false } });
			}),
		[wsRequestLine]
	);

	const isPostSaved = useCallback(
		(postId: string) => Boolean(state.savedPostIds[postId]),
		[state.savedPostIds]
	);

	const loadSavedFeed = useCallback(
		(reset: boolean) => {
			const cursor = reset ? undefined : stateRef.current.savedFeedNextCursor;
			if (!reset && (cursor == null || cursor === '')) return Promise.resolve();
			const cmd = cursor ? `/listsaved 30 ${cursor}` : '/listsaved 30';
			return wsRequestLine('posts', cmd)
				.then(json => mapList(json).then(posts => {
					const body = json as ListPostsResponse;
					dispatch({
						type: 'SET_SAVED_PAGE_FEED',
						payload: {
							posts,
							nextCursor: body.nextCursor ?? null,
							mode: reset ? 'replace' : 'append',
						},
					});
				}))
				.catch(e => {
					dispatch({ type: 'SET_WS', payload: { status: 'error', error: e instanceof Error ? e.message : String(e) } });
				});
		},
		[mapList, wsRequestLine]
	);

	useEffect(() => {
		// Spec: creators must `creator /upsertprofile` to appear in creator directory.
		// Ensure this happens automatically on creator login/signup (idempotent).
		if (state.postsWsStatus !== 'ready') return;
		const u = authUserRef.current;
		if (u?.role !== 'creator') return;
		const username = (u.username ?? '').trim();
		const name = (u.name ?? '').trim();
		if (!username || !name) return;

		const prev = creatorBootstrapRef.current;
		if (prev?.userId === u.id && prev.username === username) return;
		creatorBootstrapRef.current = { userId: u.id, username };

		const bio = (u as unknown as { bio?: string }).bio;
		void creatorWsUpsert(username, name, typeof bio === 'string' && bio.trim() ? bio.trim() : undefined)
			.then(() => creatorWsSearch({}))
			.then(r => {
				const patch: Record<string, CreatorDisplay> = {};
				for (const c of r.creators) {
					patch[String(c.user_id)] = {
						name: c.name,
						username: c.username,
						avatar: c.avatar_url ?? '',
					};
				}
				if (Object.keys(patch).length) {
					dispatch({ type: 'SET_CREATOR_PROFILES', payload: patch });
				}
			})
			.catch(e => {
				if (import.meta.env.DEV) console.error('[creator] bootstrap upsert failed', e);
			});
	}, [mockMode, state.postsWsStatus, creatorWsUpsert, creatorWsSearch]);

	useEffect(() => {
		// Hydrate creator directory cache to populate avatars/usernames for post authors
		// without relying on undocumented HTTP endpoints.
		if (state.postsWsStatus !== 'ready') return;
		void creatorWsSearch({})
			.then(r => {
				const patch: Record<string, CreatorDisplay> = {};
				for (const c of r.creators) {
					patch[String(c.user_id)] = {
						name: c.name,
						username: c.username,
						avatar: c.avatar_url ?? '',
					};
				}
				if (Object.keys(patch).length) {
					dispatch({ type: 'SET_CREATOR_PROFILES', payload: patch });
				}
			})
			.catch(e => {
				if (import.meta.env.DEV) console.error('[creator] directory hydrate failed', e);
			});
	}, [mockMode, state.postsWsStatus, creatorWsSearch]);

	const refreshFeed = useCallback(() => {
		return wsRequestLine('posts', '/list feed 30')
			.then(json => mapList(json).then(posts => {
				const body = json as ListPostsResponse;
				dispatch({ type: 'MERGE_POSTS_LIST', payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'feed' } });
			}))
			.catch(e => {
				dispatch({ type: 'SET_WS', payload: { status: 'error', error: e instanceof Error ? e.message : String(e) } });
			});
	}, [mapList, wsRequestLine]);

	const loadMoreFeed = useCallback(() => {
		const cursor = stateRef.current.feedNextCursor;
		if (!cursor) return Promise.resolve();
		return wsRequestLine('posts', `/list feed 30 ${cursor}`)
			.then(json => mapList(json).then(posts => {
				const body = json as ListPostsResponse;
				dispatch({ type: 'MERGE_POSTS_LIST', payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'feed' } });
			}))
			.catch(e => {
				dispatch({ type: 'SET_WS', payload: { status: 'error', error: e instanceof Error ? e.message : String(e) } });
			});
	}, [mapList, wsRequestLine]);

	const refreshExplore = useCallback(() => {
		return wsRequestLine('posts', '/list explore 30')
			.then(json => mapList(json).then(posts => {
				const body = json as ListPostsResponse;
				dispatch({
					type: 'MERGE_POSTS_LIST',
					payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'explore', replaceExploreOrder: true },
				});
			}))
			.catch(e => {
				dispatch({ type: 'SET_WS', payload: { status: 'error', error: e instanceof Error ? e.message : String(e) } });
			});
	}, [mapList, wsRequestLine]);

	const loadMoreExplore = useCallback(() => {
		const cursor = stateRef.current.exploreNextCursor;
		if (!cursor) return Promise.resolve();
		return wsRequestLine('posts', `/list explore 30 ${cursor}`)
			.then(json => mapList(json).then(posts => {
				const body = json as ListPostsResponse;
				dispatch({ type: 'MERGE_POSTS_LIST', payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'explore' } });
			}))
			.catch(e => {
				dispatch({ type: 'SET_WS', payload: { status: 'error', error: e instanceof Error ? e.message : String(e) } });
			});
	}, [mapList, wsRequestLine]);

	const loadCreatorPosts = useCallback(
		(creatorId: string, reset = true) => {
			const cursor = reset ? undefined : stateRef.current.creatorCursors[creatorId] ?? undefined;
			if (!reset && !cursor) return Promise.resolve();
			const cmd = cursor ?
				`/list creator ${creatorId} 30 ${cursor}` :
				`/list creator ${creatorId} 30`;
			return wsRequestLine('posts', cmd)
				.then(json => mapList(json).then(posts => {
					const body = json as ListPostsResponse;
					dispatch({
						type: 'MERGE_POSTS_LIST',
						payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'creator', creatorId },
					});
				}))
				.catch(() => {
					/* Saved feed errors are non-fatal; avoid clobbering global posts WS status. */
				});
		},
		[mapList, wsRequestLine]
	);

	const mapCommentList = useCallback(
		(json: unknown): Promise<Comment[]> => {
			const body = json as ListCommentsResponse;
			const dtos = body.comments ?? [];
			if (dtos.length === 0) return Promise.resolve([]);
			const userIds = uniqueStrings(dtos.map(d => String(d.user_id)));
			return fetchProfilesForIds(userIds).then(profiles =>
				dtos.map(d =>
					commentDtoToComment(d, resolveCreatorDisplay(String(d.user_id), profiles))
				)
			);
		},
		[fetchProfilesForIds, resolveCreatorDisplay]
	);

	const loadPostComments = useCallback(
		(postId: string) => {
			// eslint-disable-next-line prefer-object-has-own -- TS lib target doesn't include Object.hasOwn yet.
			if (Object.prototype.hasOwnProperty.call(stateRef.current.commentPagination, postId)) {
				return Promise.resolve();
			}
			return wsRequestLine('posts', `/comments ${postId} 30`)
				.then(json => {
					const body = json as ListCommentsResponse;
					return mapCommentList(json).then(comments => {
						dispatch({
							type: 'SET_POST_COMMENTS',
							payload: {
								postId,
								comments,
								nextCursor: body.nextCursor ?? null,
								mode: 'replace',
							},
						});
					});
				})
				.catch(() => {});
		},
		[mapCommentList, wsRequestLine]
	);

	const loadMorePostComments = useCallback(
		(postId: string) => {
			const next = stateRef.current.commentPagination[postId];
			if (typeof next !== 'string' || !next) return Promise.resolve();
			return wsRequestLine('posts', `/comments ${postId} 30 ${next}`)
				.then(json => {
					const body = json as ListCommentsResponse;
					return mapCommentList(json).then(comments => {
						dispatch({
							type: 'SET_POST_COMMENTS',
							payload: {
								postId,
								comments,
								nextCursor: body.nextCursor ?? null,
								mode: 'append',
							},
						});
					});
				})
				.catch(() => {});
		},
		[mapCommentList, wsRequestLine]
	);

	const toggleLike = useCallback((postId: string, userId: string) => {
		const post = stateRef.current.posts.find(p => p.id === postId);
		const liked = post?.likedBy.includes(userId);
		return wsRequestLine('posts', liked ? `/unlike ${postId}` : `/like ${postId}`)
			.then(json => {
				const body = json as { postId: string, like_count: number, likedByMe: boolean };
				setPostLiked(userId, body.postId, body.likedByMe);
				dispatch({
					type: 'SET_LIKE_SERVER',
					payload: {
						postId: body.postId,
						like_count: body.like_count,
						likedByMe: body.likedByMe,
						userId,
					},
				});
			})
			.catch(() => {});
	}, [wsRequestLine]);

	const addComment = useCallback(
		(postId: string, text: string) => {
			const u = authUserRef.current;
			if (!u) return Promise.resolve();
			const trimmed = text.trim();
			if (!trimmed) return Promise.resolve();
			const safe = wsEscapeMultilineText(trimmed);
			return wsRequestLine('posts', `/comment ${postId} ${safe}`).then(json => {
				const dto = (json as { comment: CommentDTO }).comment;
				setPostCommented(u.id, postId, true);
				return fetchProfilesForIds([dto.user_id]).then(profiles => {
					const prof = resolveCreatorDisplay(dto.user_id, profiles);
					const comment = commentDtoToComment(dto, prof);
					dispatch({ type: 'ADD_COMMENT', payload: { postId, comment } });
				});
			});
		},
		[fetchProfilesForIds, resolveCreatorDisplay, wsRequestLine]
	);

	const addReply = useCallback(
		(postId: string, parentCommentId: string, text: string) => {
			const u = authUserRef.current;
			if (!u) return Promise.resolve();
			const trimmed = text.trim();
			if (!trimmed) return Promise.resolve();
			const pid = parentCommentId.trim();
			if (!pid) return Promise.resolve();
			const safe = wsEscapeMultilineText(trimmed);
			return wsRequestLine('posts', `/reply ${postId} ${pid} ${safe}`).then(json => {
				const dto = (json as { comment: CommentDTO }).comment;
				setPostCommented(u.id, postId, true);
				return fetchProfilesForIds([dto.user_id]).then(profiles => {
					const prof = resolveCreatorDisplay(dto.user_id, profiles);
					const comment = commentDtoToComment(dto, prof);
					dispatch({ type: 'ADD_COMMENT', payload: { postId, comment } });
				});
			});
		},
		[fetchProfilesForIds, resolveCreatorDisplay, wsRequestLine]
	);

	const heartComment = useCallback(
		(commentId: string) =>
			wsRequestLine('posts', `/heartcomment ${commentId}`).then(json => {
				const body = json as { comment_id?: string, post_id?: string, heart_count?: number };
				const postId = String(body.post_id ?? '');
				const cid = String(body.comment_id ?? '');
				if (postId && cid) {
					dispatch({
						type: 'PATCH_COMMENT_HEART',
						payload: {
							postId,
							commentId: cid,
							heart_count: Number(body.heart_count) || 0,
						},
					});
				}
			}),
		[wsRequestLine]
	);

	const addPost = useCallback((post: Post) => {
		dispatch({ type: 'ADD_POST', payload: post });
	}, []);

	const buildCreateCommand = (input: CreatePostInput): string => {
		const parts: string[] = ['/create', input.visibility];
		if (input.visibility === 'ppv' && input.ppvUsdCents != null) {
			parts.push(String(input.ppvUsdCents));
		}
		if (input.assetIds?.length) {
			parts.push(`assets=${input.assetIds.join(',')}`);
		}
		let t = input.text.trim();
		// Backend spec: for public/subscribers, a bare integer as the 2nd token is reserved for PPV price.
		// If the post text starts with digits and there are no assets, inject a zero-width space so the
		// first text token is not a bare integer, while rendering the same to users.
		if (
			t &&
			input.visibility !== 'ppv' &&
			!input.assetIds?.length &&
			/^\d/.test(t)
		) {
			t = `\u200B${t}`;
		}
		if (t) parts.push(t);
		return parts.join(' ');
	};

	const createPost = useCallback(
		(input: CreatePostInput) => {
			return wsRequestLine('posts', buildCreateCommand(input)).then(json => {
				const dto = (json as { post: PostDTO }).post;
				const id = String(dto.user_id);
				return fetchProfilesForIds([id]).then(profiles => {
					const prof = resolveCreatorDisplay(id, profiles);
					const post = postDtoToPost(dto, prof, false, authUserRef.current?.id);
					dispatch({ type: 'UPSERT_POST', payload: post });
				});
			});
		},
		[fetchProfilesForIds, resolveCreatorDisplay, wsRequestLine]
	);

	const editPost = useCallback((postId: string, text: string) => {
		const t = text ?? '';
		const cmd =
			t.trim() === '' ?
				`/edit ${postId}` :
				`/edit ${postId} ${t}`;
		return wsRequestLine('posts', cmd).then(() => {
			dispatch({ type: 'UPDATE_POST', payload: { id: postId, text } });
		});
	}, [wsRequestLine]);

	const deletePost = useCallback((postId: string) => {
		return wsRequestLine('posts', `/delete ${postId}`).then(() => {
			dispatch({ type: 'DELETE_POST', payload: postId });
		});
	}, [wsRequestLine]);

	const reportPost = useCallback(
		(postId: string, reason: string): Promise<ReportPostResponse> => {
			const trimmed = reason.trim();
			const cmd = trimmed ? `/report ${postId} ${trimmed}` : `/report ${postId}`;
			return wsRequestLine('posts', cmd).then(json => json as ReportPostResponse);
		},
		[wsRequestLine]
	);

	const updatePost = useCallback((post: Partial<Post> & { id: string }) => {
		if (post.text === undefined) {
			dispatch({ type: 'UPDATE_POST', payload: post });
			return Promise.resolve();
		}
		const text = post.text ?? '';
		const cmd =
			text.trim() === '' ?
				`/update ${post.id}` :
				`/update ${post.id} ${text}`;
		return wsRequestLine('posts', cmd).then(() => {
			dispatch({ type: 'UPDATE_POST', payload: post });
		});
	}, [wsRequestLine]);

	const unlockPost = useCallback((postId: string, userId: string) => {
		dispatch({ type: 'UNLOCK_POST', payload: { postId, userId } });
	}, []);

	const subscribe = useCallback((creatorUserId: string) => {
		dispatch({ type: 'SUBSCRIBE', payload: creatorUserId });
	}, []);

	const unsubscribe = useCallback((creatorUserId: string) => {
		dispatch({ type: 'UNSUBSCRIBE', payload: creatorUserId });
	}, []);

	const isSubscribed = useCallback(
		(creatorUserId: string) => state.subscribedCreatorUserIds.includes(creatorUserId),
		[state.subscribedCreatorUserIds]
	);

	return (
		<ContentContext.Provider
			value={{
				state,
				postsWsStatus: state.postsWsStatus,
				toggleLike,
				addComment,
				addReply,
				heartComment,
				unlockPost,
				addPost,
				createPost,
				editPost,
				deletePost,
				reportPost,
				subscribe,
				unsubscribe,
				isSubscribed,
				updatePost,
				loadMoreFeed,
				refreshFeed,
				loadMoreExplore,
				refreshExplore,
				loadCreatorPosts,
				loadPostComments,
				loadMorePostComments,
				creatorWsSearch,
				creatorWsGetByPk,
				creatorWsGetByUserId,
				creatorWsUpsert,
				isPostSaved,
				savePost,
				unsavePost,
				loadSavedFeed,
			}}
		>
			{children}
		</ContentContext.Provider>
	);
}

export function useContent() {
	const ctx = useContext(ContentContext);
	if (!ctx) throw new Error('useContent must be used within ContentProvider');
	return ctx;
}
