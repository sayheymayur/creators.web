import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { useWs, useWsAuthReady, useWsConnected } from './WsContext';
import { useAuth } from './AuthContext';
import { mockCreators } from '../data/users';
import { liveEndLive, liveGoLive, liveJoinLive, liveListLive } from '../services/liveWsService';
import type {
	LiveEndLiveResponse,
	LiveEndedEvent,
	LivePublic,
	LiveStartedEvent,
	LiveVisibility,
	LiveWithAgora,
} from '../services/liveWsTypes';
import type { ChatMessageDTO } from '../services/chatWsTypes';
import type { LiveChatMessage, LiveStream, VirtualGift } from '../types';

const AVA = {
	jamie: 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
	alice: 'https://images.pexels.com/photos/1382731/pexels-photo-1382731.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
	bob: 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
} as const;

export const VIRTUAL_GIFTS: VirtualGift[] = [
	{ id: 'gift-1', name: 'Rose', emoji: '🌹', value: 0.99 },
	{ id: 'gift-2', name: 'Fire', emoji: '🔥', value: 1.99 },
	{ id: 'gift-3', name: 'Star', emoji: '⭐', value: 4.99 },
	{ id: 'gift-4', name: 'Diamond', emoji: '💎', value: 9.99 },
	{ id: 'gift-5', name: 'Crown', emoji: '👑', value: 19.99 },
	{ id: 'gift-6', name: 'Rocket', emoji: '🚀', value: 49.99 },
];

/** Mock fixtures shown ONLY when the WebSocket isn't connected/authed (offline fallback). */
const MOCK_LIVE_STREAMS: LiveStream[] = [
	{
		id: 'live-mock-1',
		creatorId: 'creator-1',
		creatorName: 'Luna Rose',
		creatorAvatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
		title: 'Morning workout session (live)',
		viewerCount: 342,
		peakViewers: 420,
		startedAt: new Date(Date.now() - 1800000).toISOString(),
		status: 'live',
		giftsReceived: 28,
		totalGiftValue: 124.50,
		chatMessages: [
			{
				id: 'lc-1',
				userId: 'fan-1',
				userName: 'Jamie Hart',
				userAvatar: AVA.jamie,
				text: 'Love this stream!',
				createdAt: new Date(Date.now() - 120000).toISOString(),
			},
			{
				id: 'lc-2',
				userId: 'fan-2',
				userName: 'Alice Johnson',
				userAvatar: AVA.alice,
				text: 'You look amazing Luna!',
				createdAt: new Date(Date.now() - 90000).toISOString(),
			},
			{
				id: 'lc-3',
				userId: 'fan-1',
				userName: 'Jamie Hart',
				userAvatar: AVA.jamie,
				text: '',
				isGift: true,
				giftName: 'Diamond',
				giftValue: 9.99,
				createdAt: new Date(Date.now() - 60000).toISOString(),
			},
			{
				id: 'lc-4',
				userId: 'fan-3',
				userName: 'Bob Martinez',
				userAvatar: AVA.bob,
				text: 'How many reps per set?',
				createdAt: new Date(Date.now() - 30000).toISOString(),
			},
		],
	},
	{
		id: 'live-mock-2',
		creatorId: 'creator-5',
		creatorName: 'Alex Kim',
		creatorAvatar: 'https://images.pexels.com/photos/2269872/pexels-photo-2269872.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
		title: 'Late night studio session',
		viewerCount: 891,
		peakViewers: 1200,
		startedAt: new Date(Date.now() - 3600000).toISOString(),
		status: 'live',
		giftsReceived: 76,
		totalGiftValue: 589.20,
		chatMessages: [
			{
				id: 'lc-5',
				userId: 'fan-1',
				userName: 'Jamie Hart',
				userAvatar: AVA.jamie,
				text: 'This beat is fire!!',
				createdAt: new Date(Date.now() - 200000).toISOString(),
			},
			{
				id: 'lc-6',
				userId: 'fan-2',
				userName: 'Alice Johnson',
				userAvatar: AVA.alice,
				text: 'drop the album already!!',
				createdAt: new Date(Date.now() - 150000).toISOString(),
			},
		],
	},
];

interface OverlayState {
	chatMessages: LiveChatMessage[];
	giftsReceived: number;
	totalGiftValue: number;
	viewerCount: number;
}

const EMPTY_OVERLAY: OverlayState = {
	chatMessages: [],
	giftsReceived: 0,
	totalGiftValue: 0,
	viewerCount: 0,
};

interface LiveStreamState {
	myLive: LiveWithAgora | null;
	joinedLive: LiveWithAgora | null;
	discovery: LivePublic[];
	overlay: Record<string, OverlayState>;
}

const initialState: LiveStreamState = {
	myLive: null,
	joinedLive: null,
	discovery: [],
	overlay: {},
};

type Action =
	| { type: 'SET_MY_LIVE', payload: LiveWithAgora | null } |
	{ type: 'SET_JOINED_LIVE', payload: LiveWithAgora | null } |
	{ type: 'SET_DISCOVERY', payload: LivePublic[] } |
	{ type: 'UPSERT_DISCOVERY', payload: LivePublic } |
	{ type: 'REMOVE_DISCOVERY', payload: { live_id: string } } |
	{ type: 'APPEND_CHAT', payload: { liveId: string, message: LiveChatMessage } } |
	{ type: 'APPEND_GIFT', payload: { liveId: string, message: LiveChatMessage, value: number } } |
	{ type: 'SET_VIEWER_COUNT', payload: { liveId: string, count: number } } |
	{ type: 'CLEAR_OVERLAY', payload: { liveId: string } };

function ensureOverlay(state: LiveStreamState, liveId: string): OverlayState {
	return state.overlay[liveId] ?? EMPTY_OVERLAY;
}

function liveReducer(state: LiveStreamState, action: Action): LiveStreamState {
	switch (action.type) {
		case 'SET_MY_LIVE':
			return { ...state, myLive: action.payload };
		case 'SET_JOINED_LIVE':
			return { ...state, joinedLive: action.payload };
		case 'SET_DISCOVERY':
			return { ...state, discovery: action.payload };
		case 'UPSERT_DISCOVERY': {
			const idx = state.discovery.findIndex(l => l.live_id === action.payload.live_id);
			if (idx === -1) return { ...state, discovery: [action.payload, ...state.discovery] };
			const next = state.discovery.slice();
			next[idx] = action.payload;
			return { ...state, discovery: next };
		}
		case 'REMOVE_DISCOVERY':
			return {
				...state,
				discovery: state.discovery.filter(l => l.live_id !== action.payload.live_id),
			};
		case 'APPEND_CHAT': {
			const cur = ensureOverlay(state, action.payload.liveId);
			// De-dupe by id if the same message arrives twice (e.g. send-ack + chat|c).
			if (cur.chatMessages.some(m => m.id === action.payload.message.id)) return state;
			return {
				...state,
				overlay: {
					...state.overlay,
					[action.payload.liveId]: {
						...cur,
						chatMessages: [...cur.chatMessages, action.payload.message],
					},
				},
			};
		}
		case 'APPEND_GIFT': {
			const cur = ensureOverlay(state, action.payload.liveId);
			if (cur.chatMessages.some(m => m.id === action.payload.message.id)) return state;
			return {
				...state,
				overlay: {
					...state.overlay,
					[action.payload.liveId]: {
						...cur,
						chatMessages: [...cur.chatMessages, action.payload.message],
						giftsReceived: cur.giftsReceived + 1,
						totalGiftValue: cur.totalGiftValue + action.payload.value,
					},
				},
			};
		}
		case 'SET_VIEWER_COUNT': {
			const cur = ensureOverlay(state, action.payload.liveId);
			return {
				...state,
				overlay: {
					...state.overlay,
					[action.payload.liveId]: { ...cur, viewerCount: Math.max(0, action.payload.count) },
				},
			};
		}
		case 'CLEAR_OVERLAY': {
			if (!state.overlay[action.payload.liveId]) return state;
			const next = { ...state.overlay };
			delete next[action.payload.liveId];
			return { ...state, overlay: next };
		}
		default:
			return state;
	}
}

interface LiveStreamContextValue {
	state: LiveStreamState;
	/** WS + chat readiness — UI can disable buttons until true. */
	ready: boolean;
	/** Creator path: `/golive <visibility> [title]`; resolves with backend Agora creds. */
	goLive: (visibility: LiveVisibility, title: string) => Promise<LiveWithAgora>;
	/** Fan path: `/joinlive <liveId>`; resolves with backend Agora creds (audience). */
	joinLive: (liveId: string) => Promise<LiveWithAgora>;
	/**
	 * Viewer cleanup: `/leaveroom` for this `liveId`+`room_id` and clear `joinedLive`
	 * only if it still matches (safe when unmounting after navigation to another live).
	 */
	leaveLiveViewer: (liveId: string) => void;
	/** Creator path: `/endlive`. */
	endLive: () => Promise<LiveEndLiveResponse>;
	/** Pull `/listlive` again (Explore refresh). */
	refreshLives: () => Promise<void>;
	/** Discovery list mapped to legacy `LiveStream` for the existing Explore UI. */
	getLiveStreams: () => LiveStream[];
	/** Look up a stream by id (`live_id` for backend rows, mock id for fallback). */
	getStream: (streamId: string) => LiveStream | undefined;
	/** Local-only helpers (UI sugar; not in spec). */
	appendLocalChat: (liveId: string, msg: LiveChatMessage) => void;
	appendLocalGift: (liveId: string, userId: string, userName: string, userAvatar: string, gift: VirtualGift) => void;
	/** Local-only gift line in chat overlay (not part of live WS spec). */
	sendGift: (liveId: string, userId: string, userName: string, userAvatar: string, gift: VirtualGift) => void;
	setLocalViewerCount: (liveId: string, count: number) => void;
}

const LiveStreamContext = createContext<LiveStreamContextValue | null>(null);

function pickCreatorDisplay(
	creatorUserId: string,
	creatorProfiles: Record<string, { name: string, avatar: string }>
): { name: string, avatar: string } {
	const profile = creatorProfiles[creatorUserId];
	if (profile?.name) return { name: profile.name, avatar: profile.avatar };
	const mock = mockCreators.find(c => c.id === creatorUserId);
	if (mock) return { name: mock.name, avatar: mock.avatar };
	return { name: 'Creator', avatar: '' };
}

function publicToLegacyStream(
	row: LivePublic,
	overlay: OverlayState | undefined,
	display: { name: string, avatar: string }
): LiveStream {
	const ovl = overlay ?? EMPTY_OVERLAY;
	const status: 'live' | 'ended' | 'offline' =
		row.status === 'ended' ? 'ended' : 'live';
	return {
		id: row.live_id,
		creatorId: row.creator_user_id,
		creatorName: display.name,
		creatorAvatar: display.avatar,
		title: row.title,
		viewerCount: ovl.viewerCount,
		peakViewers: ovl.viewerCount,
		startedAt: row.started_at,
		endedAt: row.ended_at ?? undefined,
		status,
		giftsReceived: ovl.giftsReceived,
		totalGiftValue: ovl.totalGiftValue,
		chatMessages: ovl.chatMessages,
	};
}

export function LiveStreamProvider({ children }: { children: React.ReactNode }) {
	const ws = useWs();
	const wsConnected = useWsConnected();
	const wsAuthReady = useWsAuthReady();
	const { state: authState } = useAuth();
	const [state, dispatch] = useReducer(liveReducer, initialState);

	// Refs so event handlers always see the latest value without re-binding.
	const myLiveRef = useRef<LiveWithAgora | null>(null);
	const joinedLiveRef = useRef<LiveWithAgora | null>(null);
	myLiveRef.current = state.myLive;
	joinedLiveRef.current = state.joinedLive;

	const ready = wsConnected && wsAuthReady;

	const refreshLives = useCallback((): Promise<void> => {
		if (!ws.isConnected) return Promise.resolve();
		return liveListLive(ws)
			.then(res => {
				dispatch({ type: 'SET_DISCOVERY', payload: res.lives ?? [] });
			})
			.catch(() => {
				// Soft fail — Explore will continue showing the current discovery list (or fallback).
			});
	}, [ws]);

	const goLive = useCallback(
		(visibility: LiveVisibility, title: string): Promise<LiveWithAgora> => {
			return liveGoLive(ws, { visibility, title }).then(res => {
				dispatch({ type: 'SET_MY_LIVE', payload: res });
				dispatch({ type: 'UPSERT_DISCOVERY', payload: stripAgora(res) });
				// Creator joins the chat room so they receive `chat|c` for viewer messages.
				if (res.room_id) {
					void ws.request('chat', 'joinroom', [res.room_id]).catch(() => {});
				}
				return res;
			});
		},
		[ws]
	);

	const joinLive = useCallback(
		(liveId: string): Promise<LiveWithAgora> => {
			return liveJoinLive(ws, liveId).then(res => {
				dispatch({ type: 'SET_JOINED_LIVE', payload: res });
				dispatch({ type: 'UPSERT_DISCOVERY', payload: stripAgora(res) });
				if (res.room_id) {
					void ws.request('chat', 'joinroom', [res.room_id]).catch(() => {});
				}
				return res;
			});
		},
		[ws]
	);

	const leaveLiveViewer = useCallback((liveId: string) => {
		const j = joinedLiveRef.current;
		if (j?.live_id !== liveId) return;
		if (j.room_id) void ws.request('chat', 'leaveroom', [j.room_id]).catch(() => {});
		dispatch({ type: 'SET_JOINED_LIVE', payload: null });
	}, [ws]);

	const endLive = useCallback((): Promise<LiveEndLiveResponse> => {
		return liveEndLive(ws).then(res => {
			const liveId = res.live?.live_id ?? myLiveRef.current?.live_id ?? '';
			const roomId = res.live?.room_id ?? myLiveRef.current?.room_id ?? '';
			if (roomId) void ws.request('chat', 'leaveroom', [roomId]).catch(() => {});
			dispatch({ type: 'SET_MY_LIVE', payload: null });
			if (liveId) {
				dispatch({ type: 'REMOVE_DISCOVERY', payload: { live_id: liveId } });
				dispatch({ type: 'CLEAR_OVERLAY', payload: { liveId } });
			}
			return res;
		});
	}, [ws]);

	const appendLocalChat = useCallback((liveId: string, msg: LiveChatMessage) => {
		dispatch({ type: 'APPEND_CHAT', payload: { liveId, message: msg } });
	}, []);

	const appendLocalGift = useCallback(
		(liveId: string, userId: string, userName: string, userAvatar: string, gift: VirtualGift) => {
			const message: LiveChatMessage = {
				id: `lc-gift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				userId,
				userName,
				userAvatar,
				text: '',
				isGift: true,
				giftName: gift.name,
				giftValue: gift.value,
				createdAt: new Date().toISOString(),
			};
			dispatch({ type: 'APPEND_GIFT', payload: { liveId, message, value: gift.value } });
		},
		[]
	);

	const setLocalViewerCount = useCallback((liveId: string, count: number) => {
		dispatch({ type: 'SET_VIEWER_COUNT', payload: { liveId, count } });
	}, []);

	// Subscribe to push events. `ws.on(...)` returns an unsubscribe.
	useEffect(() => {
		const offStarted = ws.on('live', 'started', data => {
			const payload = data as LiveStartedEvent;
			if (!payload?.live_id) return;
			dispatch({ type: 'UPSERT_DISCOVERY', payload });
		});
		const offEnded = ws.on('live', 'ended', data => {
			const payload = data as LiveEndedEvent;
			if (!payload?.live_id) return;
			const joinedRoom = joinedLiveRef.current?.room_id;
			if (joinedLiveRef.current?.live_id === payload.live_id && joinedRoom) {
				void ws.request('chat', 'leaveroom', [joinedRoom]).catch(() => {});
			}
			dispatch({ type: 'REMOVE_DISCOVERY', payload: { live_id: payload.live_id } });
			dispatch({ type: 'CLEAR_OVERLAY', payload: { liveId: payload.live_id } });
			if (myLiveRef.current?.live_id === payload.live_id) {
				dispatch({ type: 'SET_MY_LIVE', payload: null });
			}
			if (joinedLiveRef.current?.live_id === payload.live_id) {
				dispatch({ type: 'SET_JOINED_LIVE', payload: null });
			}
		});
		const offChat = ws.on('chat', 'c', data => {
			const dto = data as ChatMessageDTO;
			if (!dto?.room_id || !dto.id) return;
			const my = myLiveRef.current;
			const joined = joinedLiveRef.current;
			let target: LiveWithAgora | null = null;
			if (my?.room_id === dto.room_id) target = my;
			else if (joined?.room_id === dto.room_id) target = joined;
			if (!target) return;
			const message: LiveChatMessage = {
				id: dto.id,
				userId: dto.user_id,
				userName: resolveChatUserName(dto.user_id, authState),
				userAvatar: resolveChatUserAvatar(dto.user_id, authState),
				text: dto.body,
				createdAt: dto.created_at,
			};
			dispatch({ type: 'APPEND_CHAT', payload: { liveId: target.live_id, message } });
		});
		return () => {
			offStarted();
			offEnded();
			offChat();
		};
	}, [ws, authState]);

	// Fetch initial discovery once auth is ready, and again on auth/connect changes.
	useEffect(() => {
		if (!ready) return;
		void refreshLives();
	}, [ready, refreshLives]);

	const getLiveStreams = useCallback((): LiveStream[] => {
		// Spec is the source of truth when the socket is auth-ready; otherwise show fallbacks.
		if (!ready) return MOCK_LIVE_STREAMS;
		const profileMap: Record<string, { name: string, avatar: string }> = {};
		for (const [id, p] of Object.entries(authState.creatorProfiles)) {
			profileMap[id] = { name: p.name, avatar: p.avatar };
		}
		return state.discovery
			.filter(l => l.status !== 'ended')
			.map(row => publicToLegacyStream(
				row,
				state.overlay[row.live_id],
				pickCreatorDisplay(row.creator_user_id, profileMap)
			));
	}, [ready, state.discovery, state.overlay, authState.creatorProfiles]);

	const getStream = useCallback((streamId: string): LiveStream | undefined => {
		if (!streamId) return undefined;
		const profileMap: Record<string, { name: string, avatar: string }> = {};
		for (const [id, p] of Object.entries(authState.creatorProfiles)) {
			profileMap[id] = { name: p.name, avatar: p.avatar };
		}
		const row = state.discovery.find(l => l.live_id === streamId);
		if (row) {
			return publicToLegacyStream(
				row,
				state.overlay[row.live_id],
				pickCreatorDisplay(row.creator_user_id, profileMap)
			);
		}
		// myLive / joinedLive may not yet be in discovery (race); fall back to those.
		const local = state.myLive?.live_id === streamId ? state.myLive :
			state.joinedLive?.live_id === streamId ? state.joinedLive : null;
		if (local) {
			return publicToLegacyStream(
				local,
				state.overlay[local.live_id],
				pickCreatorDisplay(local.creator_user_id, profileMap)
			);
		}
		// Offline fallback: look it up in mocks (used by Explore card click while WS is down).
		return MOCK_LIVE_STREAMS.find(s => s.id === streamId);
	}, [state.discovery, state.overlay, state.myLive, state.joinedLive, authState.creatorProfiles]);

	const value = useMemo<LiveStreamContextValue>(() => ({
		state,
		ready,
		goLive,
		joinLive,
		leaveLiveViewer,
		endLive,
		refreshLives,
		getLiveStreams,
		getStream,
		appendLocalChat,
		appendLocalGift,
		sendGift: appendLocalGift,
		setLocalViewerCount,
	}), [
		state, ready,
		goLive, joinLive, leaveLiveViewer, endLive, refreshLives,
		getLiveStreams, getStream,
		appendLocalChat, appendLocalGift, setLocalViewerCount,
	]);

	return (
		<LiveStreamContext.Provider value={value}>
			{children}
		</LiveStreamContext.Provider>
	);
}

export function useLiveStream(): LiveStreamContextValue {
	const ctx = useContext(LiveStreamContext);
	if (!ctx) throw new Error('useLiveStream must be used within LiveStreamProvider');
	return ctx;
}

function stripAgora(row: LiveWithAgora): LivePublic {
	const { agora: _agora, ...rest } = row;
	void _agora;
	return rest;
}

function resolveChatUserName(
	userId: string,
	authState: { user: { id: string, name: string } | null, creatorProfiles: Record<string, { name: string }> }
): string {
	if (!userId) return 'User';
	if (authState.user?.id === userId) return authState.user.name;
	const profile = authState.creatorProfiles[userId];
	if (profile?.name) return profile.name;
	const mock = mockCreators.find(c => c.id === userId);
	if (mock) return mock.name;
	return `User ${userId}`;
}

function resolveChatUserAvatar(
	userId: string,
	authState: { user: { id: string, avatar: string } | null, creatorProfiles: Record<string, { avatar: string }> }
): string {
	if (!userId) return '';
	if (authState.user?.id === userId) return authState.user.avatar;
	const profile = authState.creatorProfiles[userId];
	if (profile?.avatar) return profile.avatar;
	const mock = mockCreators.find(c => c.id === userId);
	if (mock) return mock.avatar;
	return '';
}

// Re-exposed so tooling/UI tests have stable knobs while spec doesn't define them.
export { MOCK_LIVE_STREAMS };
