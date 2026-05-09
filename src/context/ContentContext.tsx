import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useReducer,
	useRef,
} from 'react';
import type { Post, Comment, Creator } from '../types';
import { isPostLiked, setPostLiked } from '../services/likedPosts';
import { setPostCommented } from '../services/commentedPosts';
import { useEnsureWsAuth, useWs, useWsAuthReady, useWsConnected } from './WsContext';
import { isPostsMockMode } from '../services/postsMode';
import {
	buildCreatorListCommand,
	creatorWsListFollowing,
} from '../services/creatorWsService';
import type { CreatorGetResponse, CreatorListResponse } from '../services/creatorWsTypes';
import type {
	CommentDTO,
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
import { useSubscriptions } from './SubscriptionContext';
import { creatorSummaryToCardCreator } from '../services/creatorWsMap';
import { mockCreators } from '../data/users';

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
	/** Ordered post ids from `/list feed` for the Feed screen. */
	feedPostIds: string[];
	/** Ordered post ids from `/list explore` for the Explore screen. */
	explorePostIds: string[];
	/** Per-post next cursor for `/comments` pagination; key missing until first fetch; `null` = no more pages. */
	commentPagination: Record<string, string | null>;
	/** Loading state for the first comments page fetch per post. */
	commentLoadingByPostId: Record<string, boolean>;
	creatorCursors: Record<string, string | null>;
	creatorProfiles: Record<string, CreatorDisplay>;
	followingCreators: Creator[];
}

type ContentAction =
	| { type: 'TOGGLE_LIKE', payload: { postId: string, userId: string } } |
	{ type: 'SET_LIKE_SERVER', payload: { postId: string, like_count: number, likedByMe: boolean, userId: string } } |
	{ type: 'PATCH_POST_LIKES', payload: { postId: string, like_count: number } } |
	{ type: 'ADD_COMMENT', payload: { postId: string, comment: Comment } } |
	{ type: 'UNLOCK_POST', payload: { postId: string, userId: string } } |
	{ type: 'ADD_POST', payload: Post } |
	{ type: 'UPSERT_POST', payload: Post } |
	{ type: 'DELETE_POST', payload: string } |
	{ type: 'PREPEND_POST_ID', payload: { listKind: 'feed' | 'explore', postId: string } } |
	{ type: 'SUBSCRIBE', payload: string } |
	{ type: 'UNSUBSCRIBE', payload: string } |
	{ type: 'UPDATE_POST', payload: Partial<Post> & { id: string } } |
	{ type: 'MERGE_POSTS_LIST', payload: { posts: Post[], nextCursor: string | null, listKind: 'feed' | 'explore' | 'creator', creatorId?: string, replaceExploreOrder?: boolean, replaceFeedOrder?: boolean } } |
	{ type: 'SET_POST_COMMENTS', payload: { postId: string, comments: Comment[], nextCursor: string | null, mode: 'replace' | 'append' } } |
	{ type: 'SET_POST_COMMENTS_LOADING', payload: { postId: string, loading: boolean } } |
	{ type: 'SET_WS', payload: { status: PostsWsStatus, error?: string | null } } |
	{ type: 'SET_CREATOR_PROFILES', payload: Record<string, CreatorDisplay> } |
	{ type: 'SET_FOLLOWING_CREATORS', payload: Creator[] };

const initialState: ContentState = {
	posts: [],
	subscribedCreatorUserIds: [],
	postsWsStatus: 'idle',
	postsWsError: null,
	feedNextCursor: null,
	exploreNextCursor: null,
	feedPostIds: [],
	explorePostIds: [],
	commentPagination: {},
	commentLoadingByPostId: {},
	creatorCursors: {},
	creatorProfiles: {},
	followingCreators: [],
};

function sortPostsNewestFirst(posts: Post[]): Post[] {
	return [...posts].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);
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
			return {
				...state,
				posts: state.posts.filter(p => p.id !== pid),
				feedPostIds: state.feedPostIds.filter(id => id !== pid),
				explorePostIds: state.explorePostIds.filter(id => id !== pid),
				commentPagination: restPagination,
			};
		}
		case 'PREPEND_POST_ID': {
			const { listKind, postId } = action.payload;
			if (listKind === 'feed') {
				const next = [postId, ...state.feedPostIds.filter(id => id !== postId)];
				return { ...state, feedPostIds: next };
			}
			const next = [postId, ...state.explorePostIds.filter(id => id !== postId)];
			return { ...state, explorePostIds: next };
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
			const { posts: incoming, nextCursor, listKind, creatorId, replaceExploreOrder, replaceFeedOrder } = action.payload;
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
			const feedPostIds = listKind === 'feed' ?
				(replaceFeedOrder ?
					incomingIds :
					[...state.feedPostIds, ...incomingIds.filter(id => !state.feedPostIds.includes(id))]) :
				state.feedPostIds;
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
				feedPostIds,
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
						(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
					);
					return { ...p, comments: merged };
				}),
				commentPagination: {
					...state.commentPagination,
					[postId]: nextCursor,
				},
				commentLoadingByPostId: {
					...state.commentLoadingByPostId,
					[postId]: false,
				},
			};
		}
		case 'SET_POST_COMMENTS_LOADING': {
			const { postId, loading } = action.payload;
			return {
				...state,
				commentLoadingByPostId: {
					...state.commentLoadingByPostId,
					[postId]: loading,
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
		case 'SET_FOLLOWING_CREATORS': {
			return { ...state, followingCreators: action.payload };
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
	refreshFollowing: () => Promise<void>;
}

const ContentContext = createContext<ContentContextValue | null>(null);

export function ContentProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(contentReducer, initialState);
	const { state: authState } = useAuth();
	const subscriptions = useSubscriptions();
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

	const refreshFollowing = useCallback(() => {
		const u = authUserRef.current;
		if (!u) return Promise.resolve();
		// Spec: listfollowing is fan-scoped; requires authenticated socket.
		return ensureWsAuth()
			.then(() => creatorWsListFollowing(ws, 30))
			.then(resp => {
				const base = { ...mockCreators[0] } as Partial<Creator>;
				const creators = (resp.creators ?? []).map(dto => creatorSummaryToCardCreator(dto, base));
				dispatch({ type: 'SET_FOLLOWING_CREATORS', payload: creators });
			})
			.catch(() => {});
	}, [ensureWsAuth, ws]);

	const resolveCreatorDisplay = useCallback(
		(userId: string, profiles: Record<string, CreatorDisplay>): CreatorDisplay | undefined => {
			const u = authUserRef.current;
			if (u?.id === userId) {
				return { name: u.name, avatar: u.avatar, username: u.username };
			}
			return profiles[userId];
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
				batch[id] = { name: 'Creator', avatar: '', username: 'creator' };
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
					// Spec: `/list feed` and `/list explore` are public-only.
					// When a new public post is pushed, make sure it shows up immediately in both lists.
					if (event === 'new' && dto.visibility === 'public') {
						dispatch({ type: 'PREPEND_POST_ID', payload: { listKind: 'feed', postId: post.id } });
						dispatch({ type: 'PREPEND_POST_ID', payload: { listKind: 'explore', postId: post.id } });
					}
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
		return () => {
			offNew();
			offUpdated();
			offDeleted();
			offLike();
			offComment();
		};
	}, [ws, wsConnected, handlePush]);

	useEffect(() => {
		const u = authState.user;
		if (!u || !wsConnected || !wsAuthReady) {
			dispatch({ type: 'SET_FOLLOWING_CREATORS', payload: [] });
			return;
		}
		// Refresh following list once per login session.
		void refreshFollowing().then(() => {});
	}, [authState.user?.id, authState.user?.role, wsConnected, wsAuthReady, refreshFollowing]);

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
					payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'feed', replaceFeedOrder: true },
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
				dispatch({
					type: 'MERGE_POSTS_LIST',
					payload: { posts, nextCursor: body.nextCursor ?? null, listKind: 'feed', replaceFeedOrder: true },
				});
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
				.catch(e => {
					dispatch({ type: 'SET_WS', payload: { status: 'error', error: e instanceof Error ? e.message : String(e) } });
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
			dispatch({ type: 'SET_POST_COMMENTS_LOADING', payload: { postId, loading: true } });
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
				.catch(() => {})
				.finally(() => {
					dispatch({ type: 'SET_POST_COMMENTS_LOADING', payload: { postId, loading: false } });
				});
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
			return wsRequestLine('posts', `/comment ${postId} ${trimmed}`).then(json => {
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

	// Subscription source-of-truth lives in SubscriptionContext (WS-backed).
	// Keep ContentContext API stable so Feed/Messages can rely on it.
	const isSubscribed = useCallback(
		(creatorUserId: string) => subscriptions.isSubscribed(creatorUserId),
		[subscriptions]
	);

	return (
		<ContentContext.Provider
			value={{
				state,
				postsWsStatus: state.postsWsStatus,
				toggleLike,
				addComment,
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
				refreshFollowing,
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
