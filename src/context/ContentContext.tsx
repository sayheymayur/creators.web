import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useReducer,
	useRef,
} from 'react';
import type { Post, Comment } from '../types';
import { mockPosts } from '../data/posts';
import { creatorsApi } from '../services/creatorsApi';
import { isPostsMockMode } from '../services/postsMode';
import {
	CreatorsMultiplexWs,
	setCreatorsMultiplexSingleton,
} from '../services/creatorsMultiplexWs';
import { creatorsWsUrl } from '../services/wsUrl';
import {
	creatorWsGet,
	creatorWsList,
	creatorWsUpsertProfile,
} from '../services/creatorWsService';
import type { CreatorGetResponse, CreatorListResponse } from '../services/creatorWsTypes';
import type {
	CommentDTO,
	DeletedPostEventPayload,
	LikeUpdateEventPayload,
	ListCommentsResponse,
	ListPostsResponse,
	PostDTO,
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
	subscribedCreatorIds: string[];
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
	{ type: 'SUBSCRIBE', payload: string } |
	{ type: 'UNSUBSCRIBE', payload: string } |
	{ type: 'UPDATE_POST', payload: Partial<Post> & { id: string } } |
	{ type: 'MERGE_POSTS_LIST', payload: { posts: Post[], nextCursor: string | null, listKind: 'feed' | 'explore' | 'creator', creatorId?: string, replaceExploreOrder?: boolean } } |
	{ type: 'SET_POST_COMMENTS', payload: { postId: string, comments: Comment[], nextCursor: string | null, mode: 'replace' | 'append' } } |
	{ type: 'SET_WS', payload: { status: PostsWsStatus, error?: string | null } } |
	{ type: 'SET_CREATOR_PROFILES', payload: Record<string, CreatorDisplay> };

const mockMode = isPostsMockMode();

const initialState: ContentState = {
	posts: mockMode ? mockPosts : [],
	subscribedCreatorIds: ['creator-1', 'creator-2'],
	postsWsStatus: mockMode ? 'idle' : 'idle',
	postsWsError: null,
	feedNextCursor: null,
	exploreNextCursor: null,
	explorePostIds: [],
	commentPagination: {},
	creatorCursors: {},
	creatorProfiles: {},
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
			return { ...state, posts: [action.payload, ...state.posts] };
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
				explorePostIds: state.explorePostIds.filter(id => id !== pid),
				commentPagination: restPagination,
			};
		}
		case 'SUBSCRIBE': {
			if (state.subscribedCreatorIds.includes(action.payload)) return state;
			return { ...state, subscribedCreatorIds: [...state.subscribedCreatorIds, action.payload] };
		}
		case 'UNSUBSCRIBE': {
			return {
				...state,
				subscribedCreatorIds: state.subscribedCreatorIds.filter(id => id !== action.payload),
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
						(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
			return {
				...state,
				creatorProfiles: { ...state.creatorProfiles, ...action.payload },
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
	unlockPost: (postId: string, userId: string) => void;
	addPost: (post: Post) => void;
	createPost: (input: CreatePostInput) => Promise<void>;
	deletePost: (postId: string) => Promise<void>;
	subscribe: (creatorId: string) => void;
	unsubscribe: (creatorId: string) => void;
	isSubscribed: (creatorId: string) => boolean;
	updatePost: (post: Partial<Post> & { id: string }) => Promise<void>;
	loadMoreFeed: () => Promise<void>;
	refreshFeed: () => Promise<void>;
	loadMoreExplore: () => Promise<void>;
	refreshExplore: () => Promise<void>;
	loadCreatorPosts: (creatorId: string, reset?: boolean) => Promise<void>;
	loadPostComments: (postId: string) => Promise<void>;
	loadMorePostComments: (postId: string) => Promise<void>;
	creatorWsSearch: (opts: {
		q?: string,
		category?: string,
		limit?: number,
		beforeCursor?: string,
	}) => Promise<CreatorListResponse>;
	creatorWsGetByPk: (creatorRowId: string) => Promise<CreatorGetResponse>;
	creatorWsUpsert: (username: string, name: string, bio?: string) => Promise<void>;
}

const ContentContext = createContext<ContentContextValue | null>(null);

export function ContentProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(contentReducer, initialState);
	const { state: authState } = useAuth();
	const authUserRef = useRef(authState.user);
	authUserRef.current = authState.user;
	const clientRef = useRef<CreatorsMultiplexWs | null>(null);
	const stateRef = useRef(state);
	stateRef.current = state;
	const connectSeqRef = useRef(0);

	const resolveCreatorDisplay = useCallback(
		(userId: string, profiles: Record<string, CreatorDisplay>): CreatorDisplay | undefined => {
			const u = authUserRef.current;
			if (u && u.id === userId) {
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
				batch[id] = { name: 'Creator', avatar: '', username: 'user' };
			}

			// Resolve fast with cached + placeholders.
			const merged: Record<string, CreatorDisplay> = {};
			Object.keys(prev).forEach(k => { merged[k] = prev[k]; });
			Object.keys(batch).forEach(k => { merged[k] = batch[k]; });

			if (Object.keys(batch).length) {
				dispatch({ type: 'SET_CREATOR_PROFILES', payload: batch });
			}

			// Hydrate missing profiles in background without blocking UI.
			for (const id of missing) {
				void creatorsApi.creators.getById(id).then(
					data => {
						dispatch({
							type: 'SET_CREATOR_PROFILES',
							payload: {
								[id]: { name: data.name, avatar: data.avatar, username: data.username },
							},
						});
					},
					() => {}
				);
			}

			return Promise.resolve(merged);
		},
		[resolveCreatorDisplay]
	);

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
						false,
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

	useEffect(() => {
		if (mockMode) return;
		connectSeqRef.current += 1;
		const seq = connectSeqRef.current;

		// Always close any previous client before creating a new one.
		// This avoids duplicate live sockets when auth changes quickly or in StrictMode.
		if (clientRef.current) {
			clientRef.current.close();
			clientRef.current = null;
		}

		const client = new CreatorsMultiplexWs({
			onPostsEvent: handlePush,
			onConnectionChange: (s, err) => {
				if (seq !== connectSeqRef.current) return;
				if (s === 'connecting') dispatch({ type: 'SET_WS', payload: { status: 'connecting' } });
				if (s === 'open') dispatch({ type: 'SET_WS', payload: { status: 'ready' } });
				if (s === 'closed') {
					dispatch({
						type: 'SET_WS',
						payload: { status: 'error', error: err?.message ?? 'Connection closed' },
					});
				}
			},
		});
		clientRef.current = client;
		setCreatorsMultiplexSingleton(client);

		dispatch({ type: 'SET_WS', payload: { status: 'connecting' } });
		void client
			.connect(creatorsWsUrl())
			.then(() => {
				if (seq !== connectSeqRef.current) return Promise.reject(new Error('stale-ws'));

				// Always fetch feed.
				const feedP = client.send('posts', '/list feed 30').then(json =>
					mapList(json).then(posts => {
						if (seq !== connectSeqRef.current) return;
						const body = json as ListPostsResponse;
						dispatch({
							type: 'MERGE_POSTS_LIST',
							payload: {
								posts,
								nextCursor: body.nextCursor ?? null,
								listKind: 'feed',
							},
						});
					})
				);

				const exploreP = client.send('posts', '/list explore 30').then(json =>
					mapList(json).then(posts => {
						if (seq !== connectSeqRef.current) return;
						const body = json as ListPostsResponse;
						dispatch({
							type: 'MERGE_POSTS_LIST',
							payload: {
								posts,
								nextCursor: body.nextCursor ?? null,
								listKind: 'explore',
								replaceExploreOrder: true,
							},
						});
					})
				);

				// If logged in as creator/admin, fetch my creator posts too.
				const u = authUserRef.current;
				const myId = u?.id;
				const canHaveOwnPosts = u?.role === 'creator' || u?.role === 'admin';
				const creatorP = myId && canHaveOwnPosts ?
					client.send('posts', `/list creator ${myId} 30`).then(json =>
						mapList(json).then(posts => {
							if (seq !== connectSeqRef.current) return;
							const body = json as ListPostsResponse;
							dispatch({
								type: 'MERGE_POSTS_LIST',
								payload: {
									posts,
									nextCursor: body.nextCursor ?? null,
									listKind: 'creator',
									creatorId: myId,
								},
							});
						})
					) :
					Promise.resolve();

				return Promise.all([feedP, exploreP, creatorP]).then(() => {});
			})
			.catch(e => {
				if (e instanceof Error && e.message === 'stale-ws') return;
				if (seq !== connectSeqRef.current) return;
				dispatch({
					type: 'SET_WS',
					payload: { status: 'error', error: e instanceof Error ? e.message : String(e) },
				});
			});

		return () => {
			// Only close if this effect instance is still the latest.
			if (seq === connectSeqRef.current) {
				setCreatorsMultiplexSingleton(null);
				client.close();
				clientRef.current = null;
			}
		};
		// When auth changes, reconnect so the WebSocket uses the latest JWT query param.
	}, [handlePush, mapList, authState.isAuthenticated, authState.user?.id]);

	const runRemote = useCallback((fn: () => Promise<void>) => {
		if (mockMode) return Promise.resolve();
		if (stateRef.current.postsWsStatus !== 'ready') {
			return Promise.reject(new Error('Posts connection is not ready yet'));
		}
		if (!clientRef.current) {
			return Promise.reject(new Error('Posts connection is not ready yet'));
		}
		return fn();
	}, []);

	const runRemoteTyped = useCallback((fn: (c: CreatorsMultiplexWs) => Promise<unknown>): Promise<unknown> => {
		if (mockMode) return Promise.reject(new Error('WebSocket unavailable in mock mode'));
		if (stateRef.current.postsWsStatus !== 'ready' || !clientRef.current) {
			return Promise.reject(new Error('Posts connection is not ready yet'));
		}
		return fn(clientRef.current);
	}, []);

	const creatorWsSearch = useCallback(
		(opts: { q?: string, category?: string, limit?: number, beforeCursor?: string }) =>
			runRemoteTyped(c => creatorWsList(c, opts)) as Promise<CreatorListResponse>,
		[runRemoteTyped]
	);

	const creatorWsGetByPk = useCallback(
		(creatorRowId: string) =>
			runRemoteTyped(c => creatorWsGet(c, creatorRowId)) as Promise<CreatorGetResponse>,
		[runRemoteTyped]
	);

	const creatorWsUpsert = useCallback(
		(username: string, name: string, bio?: string) =>
			runRemoteTyped(c => creatorWsUpsertProfile(c, username, name, bio)).then(() => {}),
		[runRemoteTyped]
	);

	const refreshFeed = useCallback(() => {
		if (mockMode) return Promise.resolve();
		return runRemote(() => {
			const c = clientRef.current;
			if (!c) return Promise.resolve();
			return c.send('posts', '/list feed 30').then(json =>
				mapList(json).then(posts => {
					const body = json as ListPostsResponse;
					dispatch({
						type: 'MERGE_POSTS_LIST',
						payload: {
							posts,
							nextCursor: body.nextCursor ?? null,
							listKind: 'feed',
						},
					});
				})
			);
		}).catch(e => {
			dispatch({
				type: 'SET_WS',
				payload: { status: 'error', error: e instanceof Error ? e.message : String(e) },
			});
		});
	}, [mapList, runRemote]);

	const loadMoreFeed = useCallback(() => {
		if (mockMode) return Promise.resolve();
		const cursor = stateRef.current.feedNextCursor;
		if (!cursor) return Promise.resolve();
		return runRemote(() => {
			const c = clientRef.current;
			if (!c) return Promise.resolve();
			return c.send('posts', `/list feed 30 ${cursor}`).then(json =>
				mapList(json).then(posts => {
					const body = json as ListPostsResponse;
					dispatch({
						type: 'MERGE_POSTS_LIST',
						payload: {
							posts,
							nextCursor: body.nextCursor ?? null,
							listKind: 'feed',
						},
					});
				})
			);
		}).catch(e => {
			dispatch({
				type: 'SET_WS',
				payload: { status: 'error', error: e instanceof Error ? e.message : String(e) },
			});
		});
	}, [mapList, runRemote]);

	const refreshExplore = useCallback(() => {
		if (mockMode) return Promise.resolve();
		return runRemote(() => {
			const c = clientRef.current;
			if (!c) return Promise.resolve();
			return c.send('posts', '/list explore 30').then(json =>
				mapList(json).then(posts => {
					const body = json as ListPostsResponse;
					dispatch({
						type: 'MERGE_POSTS_LIST',
						payload: {
							posts,
							nextCursor: body.nextCursor ?? null,
							listKind: 'explore',
							replaceExploreOrder: true,
						},
					});
				})
			);
		}).catch(e => {
			dispatch({
				type: 'SET_WS',
				payload: { status: 'error', error: e instanceof Error ? e.message : String(e) },
			});
		});
	}, [mapList, runRemote]);

	const loadMoreExplore = useCallback(() => {
		if (mockMode) return Promise.resolve();
		const cursor = stateRef.current.exploreNextCursor;
		if (!cursor) return Promise.resolve();
		return runRemote(() => {
			const c = clientRef.current;
			if (!c) return Promise.resolve();
			return c.send('posts', `/list explore 30 ${cursor}`).then(json =>
				mapList(json).then(posts => {
					const body = json as ListPostsResponse;
					dispatch({
						type: 'MERGE_POSTS_LIST',
						payload: {
							posts,
							nextCursor: body.nextCursor ?? null,
							listKind: 'explore',
						},
					});
				})
			);
		}).catch(e => {
			dispatch({
				type: 'SET_WS',
				payload: { status: 'error', error: e instanceof Error ? e.message : String(e) },
			});
		});
	}, [mapList, runRemote]);

	const loadCreatorPosts = useCallback(
		(creatorId: string, reset = true) => {
			if (mockMode) return Promise.resolve();
			const cursor = reset ? undefined : stateRef.current.creatorCursors[creatorId] ?? undefined;
			if (!reset && !cursor) return Promise.resolve();
			return runRemote(() => {
				const c = clientRef.current;
				if (!c) return Promise.resolve();
				const cmd = cursor ?
					`/list creator ${creatorId} 30 ${cursor}` :
					`/list creator ${creatorId} 30`;
				return c.send('posts', cmd).then(json =>
					mapList(json).then(posts => {
						const body = json as ListPostsResponse;
						dispatch({
							type: 'MERGE_POSTS_LIST',
							payload: {
								posts,
								nextCursor: body.nextCursor ?? null,
								listKind: 'creator',
								creatorId,
							},
						});
					})
				);
			}).catch(e => {
				dispatch({
					type: 'SET_WS',
					payload: { status: 'error', error: e instanceof Error ? e.message : String(e) },
				});
			});
		},
		[mapList, runRemote]
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
			if (mockMode) return Promise.resolve();
			if (Object.hasOwn(stateRef.current.commentPagination, postId)) {
				return Promise.resolve();
			}
			return runRemote(() => {
				const c = clientRef.current;
				if (!c) return Promise.resolve();
				return c.send('posts', `/comments ${postId} 30`).then(json => {
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
				});
			}).catch(() => {});
		},
		[mapCommentList, runRemote]
	);

	const loadMorePostComments = useCallback(
		(postId: string) => {
			if (mockMode) return Promise.resolve();
			const next = stateRef.current.commentPagination[postId];
			if (typeof next !== 'string' || !next) return Promise.resolve();
			return runRemote(() => {
				const c = clientRef.current;
				if (!c) return Promise.resolve();
				return c.send('posts', `/comments ${postId} 30 ${next}`).then(json => {
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
				});
			}).catch(() => {});
		},
		[mapCommentList, runRemote]
	);

	const toggleLike = useCallback((postId: string, userId: string) => {
		if (mockMode) {
			dispatch({ type: 'TOGGLE_LIKE', payload: { postId, userId } });
			return Promise.resolve();
		}
		const post = stateRef.current.posts.find(p => p.id === postId);
		const liked = post?.likedBy.includes(userId);
		const c = clientRef.current;
		if (!c) return Promise.resolve();
		return c
			.send('posts', liked ? `/unlike ${postId}` : `/like ${postId}`)
			.then(json => {
				const body = json as { postId: string, like_count: number, likedByMe: boolean };
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
	}, []);

	const addComment = useCallback(
		(postId: string, text: string) => {
			if (mockMode) {
				const u = authUserRef.current;
				if (!u) return Promise.resolve();
				dispatch({
					type: 'ADD_COMMENT',
					payload: {
						postId,
						comment: {
							id: `c-${Date.now()}`,
							userId: u.id,
							userName: u.name,
							userAvatar: u.avatar,
							text: text.trim(),
							createdAt: new Date().toISOString(),
							likes: 0,
						},
					},
				});
				return Promise.resolve();
			}
			const c = clientRef.current;
			const u = authUserRef.current;
			if (!c || !u) return Promise.resolve();
			const trimmed = text.trim();
			if (!trimmed) return Promise.resolve();
			return c.send('posts', `/comment ${postId} ${trimmed}`).then(json => {
				const dto = (json as { comment: CommentDTO }).comment;
				return fetchProfilesForIds([dto.user_id]).then(profiles => {
					const prof = resolveCreatorDisplay(dto.user_id, profiles);
					const comment = commentDtoToComment(dto, prof);
					dispatch({ type: 'ADD_COMMENT', payload: { postId, comment } });
				});
			});
		},
		[fetchProfilesForIds, resolveCreatorDisplay]
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
			if (mockMode) {
				return Promise.reject(new Error('Use addPost in mock mode'));
			}
			const c = clientRef.current;
			if (!c) return Promise.reject(new Error('Posts connection not ready'));
			return c.send('posts', buildCreateCommand(input)).then(json => {
				const dto = (json as { post: PostDTO }).post;
				const id = String(dto.user_id);
				return fetchProfilesForIds([id]).then(profiles => {
					const prof = resolveCreatorDisplay(id, profiles);
					const post = postDtoToPost(dto, prof, false, authUserRef.current?.id);
					dispatch({ type: 'UPSERT_POST', payload: post });
				});
			});
		},
		[fetchProfilesForIds, resolveCreatorDisplay]
	);

	const deletePost = useCallback((postId: string) => {
		if (mockMode) {
			dispatch({ type: 'DELETE_POST', payload: postId });
			return Promise.resolve();
		}
		const c = clientRef.current;
		if (!c) return Promise.resolve();
		return c.send('posts', `/delete ${postId}`).then(() => {
			dispatch({ type: 'DELETE_POST', payload: postId });
		});
	}, []);

	const updatePost = useCallback((post: Partial<Post> & { id: string }) => {
		if (mockMode) {
			dispatch({ type: 'UPDATE_POST', payload: post });
			return Promise.resolve();
		}
		if (post.text === undefined) {
			dispatch({ type: 'UPDATE_POST', payload: post });
			return Promise.resolve();
		}
		const c = clientRef.current;
		if (!c) return Promise.resolve();
		const text = post.text ?? '';
		const cmd =
			text.trim() === '' ?
				`/update ${post.id}` :
				`/update ${post.id} ${text}`;
		return c.send('posts', cmd).then(() => {
			dispatch({ type: 'UPDATE_POST', payload: post });
		});
	}, []);

	const unlockPost = useCallback((postId: string, userId: string) => {
		dispatch({ type: 'UNLOCK_POST', payload: { postId, userId } });
	}, []);

	const subscribe = useCallback((creatorId: string) => {
		dispatch({ type: 'SUBSCRIBE', payload: creatorId });
	}, []);

	const unsubscribe = useCallback((creatorId: string) => {
		dispatch({ type: 'UNSUBSCRIBE', payload: creatorId });
	}, []);

	const isSubscribed = useCallback(
		(creatorId: string) => state.subscribedCreatorIds.includes(creatorId),
		[state.subscribedCreatorIds]
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
				deletePost,
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
				creatorWsUpsert,
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
