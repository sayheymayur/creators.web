import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWs, useWsConnected } from './WsContext';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import { useNotifications } from './NotificationContext';
import {
	sessionsAccept,
	sessionsCancel,
	sessionsComplete,
	sessionsEndSession,
	sessionsFeedback,
	sessionsReject,
	sessionsRequest,
} from '../services/sessionsWsService';
import type {
	SessionKind,
	SessionsAcceptedPayload,
	SessionsCompleteResponse,
	SessionsEndSessionResponse,
	SessionsEndedEvent,
	SessionsFeedbackPromptEvent,
	SessionsFeedbackReceivedEvent,
	SessionsRejectedPayload,
	SessionsRequestEvent,
	SessionsRequestResponse,
	SessionsTimerEvent,
} from '../services/sessionsWsTypes';

export type SessionsUiCallType = 'audio' | 'video';

export type OutgoingRequestState =
	| { state: 'idle' } |
	{ state: 'requesting', kind: SessionKind, creatorUserId: string } |
	{ state: 'pending', request: SessionsRequestResponse } |
	{ state: 'accepted', accepted: SessionsAcceptedPayload } |
	{ state: 'rejected', rejected: SessionsRejectedPayload };

export type IncomingRequestState = {
	request: SessionsRequestEvent,
};

export type ActiveBookingState = {
	accepted: SessionsAcceptedPayload,
	/**
	 * For `kind === "call"`, the UI needs to know whether to show audio vs video.
	 * The server spec only distinguishes call vs chat, so we keep a local hint.
	 */
	uiCallType?: SessionsUiCallType,
	otherDisplay?: { name: string, avatar: string },
};

export type FeedbackPromptState = {
	request_id: string,
};

type EndedRoomsMap = Record<string, SessionsEndedEvent>;

const ENDED_ROOMS_STORAGE_KEY = 'cw.sessions.endedRooms.v1';
const LOCAL_SESSIONS_STORAGE_KEY = 'cw.sessions.snapshot.v1';

function loadEndedRooms(): EndedRoomsMap {
	try {
		const raw = globalThis.localStorage?.getItem(ENDED_ROOMS_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return {};
		return parsed as EndedRoomsMap;
	} catch {
		return {};
	}
}

type LocalSessionsSnapshot = Pick<
	SessionsState,
	'outgoing' | 'incoming' | 'active' | 'timer' | 'ended' | 'endedRooms' | 'feedbackPrompt' | 'feedbackReceived'
>;

function loadLocalSessionsSnapshot(): LocalSessionsSnapshot | null {
	try {
		const raw = globalThis.localStorage?.getItem(LOCAL_SESSIONS_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed as LocalSessionsSnapshot;
	} catch {
		return null;
	}
}

type SessionsState = {
	outgoing: OutgoingRequestState,
	incoming: IncomingRequestState[],
	active: ActiveBookingState | null,
	timer: SessionsTimerEvent | null,
	ended: SessionsEndedEvent | null,
	endedRooms: EndedRoomsMap,
	feedbackPrompt: FeedbackPromptState | null,
	feedbackReceived: SessionsFeedbackReceivedEvent | null,
};

type Action =
	| { type: 'OUTGOING_REQUESTING', payload: { creatorUserId: string, kind: SessionKind } } |
	{ type: 'OUTGOING_PENDING', payload: SessionsRequestResponse } |
	{ type: 'OUTGOING_ACCEPTED', payload: SessionsAcceptedPayload } |
	{ type: 'OUTGOING_REJECTED', payload: SessionsRejectedPayload } |
	{ type: 'OUTGOING_CLEAR' } |
	{ type: 'INCOMING_ADD', payload: SessionsRequestEvent } |
	{ type: 'INCOMING_REMOVE', payload: { request_id: string } } |
	{ type: 'ACTIVE_SET', payload: ActiveBookingState } |
	{ type: 'ACTIVE_CLEAR' } |
	{ type: 'TIMER_UPDATE', payload: SessionsTimerEvent } |
	{ type: 'ENDED_SET', payload: SessionsEndedEvent } |
	{ type: 'ENDED_CLEAR' } |
	{ type: 'ENDED_ROOMS_MERGE', payload: EndedRoomsMap } |
	{ type: 'FEEDBACK_PROMPT', payload: SessionsFeedbackPromptEvent } |
	{ type: 'FEEDBACK_RECEIVED', payload: SessionsFeedbackReceivedEvent } |
	{ type: 'FEEDBACK_CLEAR' } |
	{ type: 'HYDRATE_LOCAL', payload: LocalSessionsSnapshot };

const initialState: SessionsState = {
	outgoing: { state: 'idle' },
	incoming: [],
	active: null,
	timer: null,
	ended: null,
	endedRooms: loadEndedRooms(),
	feedbackPrompt: null,
	feedbackReceived: null,
};

function sessionsReducer(state: SessionsState, action: Action): SessionsState {
	switch (action.type) {
		case 'OUTGOING_REQUESTING':
			return { ...state, outgoing: { state: 'requesting', ...action.payload } };
		case 'OUTGOING_PENDING':
			return { ...state, outgoing: { state: 'pending', request: action.payload } };
		case 'OUTGOING_ACCEPTED':
			return { ...state, outgoing: { state: 'accepted', accepted: action.payload } };
		case 'OUTGOING_REJECTED':
			return { ...state, outgoing: { state: 'rejected', rejected: action.payload } };
		case 'OUTGOING_CLEAR':
			return { ...state, outgoing: { state: 'idle' } };
		case 'INCOMING_ADD': {
			const exists = state.incoming.some(r => r.request.request_id === action.payload.request_id);
			if (exists) return state;
			return { ...state, incoming: [{ request: action.payload }, ...state.incoming] };
		}
		case 'INCOMING_REMOVE':
			return { ...state, incoming: state.incoming.filter(r => r.request.request_id !== action.payload.request_id) };
		case 'ACTIVE_SET':
			return {
				...state,
				active: action.payload,
				ended: null,
				endedRooms: action.payload.accepted.room_id ?
					(() => {
						const next = { ...state.endedRooms };
						delete next[action.payload.accepted.room_id];
						return next;
					})() :
					state.endedRooms,
			};
		case 'ACTIVE_CLEAR':
			return { ...state, active: null, timer: null };
		case 'TIMER_UPDATE':
			return { ...state, timer: action.payload };
		case 'ENDED_SET':
			return {
				...state,
				ended: action.payload,
				endedRooms: action.payload.room_id ? { ...state.endedRooms, [action.payload.room_id]: action.payload } : state.endedRooms,
			};
		case 'ENDED_CLEAR':
			return { ...state, ended: null };
		case 'ENDED_ROOMS_MERGE': {
			const next = { ...state.endedRooms, ...action.payload };
			return { ...state, endedRooms: next };
		}
		case 'FEEDBACK_PROMPT':
			return { ...state, feedbackPrompt: { request_id: action.payload.request_id } };
		case 'FEEDBACK_RECEIVED':
			return { ...state, feedbackReceived: action.payload };
		case 'FEEDBACK_CLEAR':
			return { ...state, feedbackPrompt: null, feedbackReceived: null };
		case 'HYDRATE_LOCAL': {
			return {
				...state,
				...action.payload,
				// Ensure `endedRooms` never regresses to empty if storage is missing.
				endedRooms: { ...state.endedRooms, ...(action.payload.endedRooms ?? {}) },
			};
		}
		default:
			return state;
	}
}

type SessionsContextValue = {
	state: SessionsState,
	requestSession: (opts: {
		creatorUserId: string,
		kind: SessionKind,
		minutes: number,
		uiCallType?: SessionsUiCallType,
		creatorDisplay?: { name: string, avatar: string },
	}) => Promise<SessionsRequestResponse>,
	acceptSession: (requestId: string) => Promise<SessionsAcceptedPayload>,
	rejectSession: (requestId: string, message?: string) => Promise<SessionsRejectedPayload>,
	cancelSession: (requestId: string) => Promise<{ ok: true }>,
	completeSession: (requestId: string) => Promise<SessionsCompleteResponse>,
	endSession: (requestId: string) => Promise<SessionsEndSessionResponse>,
	submitFeedback: (opts: { requestId: string, rating: number, comment?: string }) => Promise<void>,
	clearOutgoing: () => void,
	clearFeedback: () => void,
};

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: React.ReactNode }) {
	const ws = useWs();
	const wsConnected = useWsConnected();
	const navigate = useNavigate();
	const { state: authState } = useAuth();
	const { addConversation, addRoomMessage } = useChat();
	const { showToast } = useNotifications();
	const [state, dispatch] = useReducer(sessionsReducer, initialState);
	const uiCallTypeByRequestIdRef = useRef<Record<string, SessionsUiCallType>>({});
	const creatorMetaByRequestIdRef = useRef<Record<string, { userId: string, name: string, avatar: string }>>({});
	const fanMetaByRequestIdRef = useRef<Record<string, { userId: string, name: string }>>({});
	const roomIdByRequestIdRef = useRef<Record<string, string>>({});
	const joinedBookedRoomRef = useRef<string | null>(null);
	const didPromptActiveRequestIdRef = useRef<string | null>(null);
	const didHydrateLocalRef = useRef(false);
	const hydratedLocalAtMsRef = useRef<number | null>(null);

	function ensureBookedRoomJoined(roomId: string) {
		if (!wsConnected) return;
		if (!roomId) return;
		if (state.endedRooms[roomId]) return;
		if (joinedBookedRoomRef.current === roomId) return;
		joinedBookedRoomRef.current = roomId;
		void ws.request('chat', 'joinroom', [roomId]).catch(() => {});
	}

	const requestSession = useCallback(
		(opts: {
			creatorUserId: string,
			kind: SessionKind,
			minutes: number,
			uiCallType?: SessionsUiCallType,
			creatorDisplay?: { name: string, avatar: string },
		}) => {
			dispatch({ type: 'OUTGOING_REQUESTING', payload: { creatorUserId: opts.creatorUserId, kind: opts.kind } });
			return sessionsRequest(ws, { creatorUserId: opts.creatorUserId, kind: opts.kind, minutes: opts.minutes })
				.then(res => {
					if (opts.kind === 'call' && opts.uiCallType) {
						uiCallTypeByRequestIdRef.current[res.request_id] = opts.uiCallType;
					}
					if (opts.creatorDisplay) {
						creatorMetaByRequestIdRef.current[res.request_id] = {
							userId: opts.creatorUserId,
							name: opts.creatorDisplay.name,
							avatar: opts.creatorDisplay.avatar,
						};
					}
					dispatch({ type: 'OUTGOING_PENDING', payload: res });
					return res;
				})
				.catch(err => {
					dispatch({ type: 'OUTGOING_CLEAR' });
					throw err;
				});
		},
		[ws]
	);

	const acceptSession = useCallback(
		(requestId: string) =>
			sessionsAccept(ws, { requestId }).then(res => {
				dispatch({ type: 'INCOMING_REMOVE', payload: { request_id: requestId } });
				const fan =
					fanMetaByRequestIdRef.current[res.request_id] ??
					(() => {
						// After reload, meta refs can be empty; rely on restored incoming request payload.
						const row = state.incoming.find(r => r.request.request_id === res.request_id)?.request;
						return row ? { userId: row.fan_user_id, name: row.fan_display } : undefined;
					})();
				dispatch({
					type: 'ACTIVE_SET',
					payload: {
						accepted: res,
						uiCallType: uiCallTypeByRequestIdRef.current[res.request_id],
						otherDisplay: fan ? { name: fan.name, avatar: '' } : undefined,
					},
				});
				return res;
			}),
		[ws, state.incoming]
	);

	const rejectSession = useCallback(
		(requestId: string, message?: string) =>
			sessionsReject(ws, { requestId, message }).then(res => {
				dispatch({ type: 'INCOMING_REMOVE', payload: { request_id: requestId } });
				return res;
			}),
		[ws]
	);

	const cancelSession = useCallback(
		(requestId: string) =>
			sessionsCancel(ws, requestId).then(res => {
				dispatch({ type: 'OUTGOING_CLEAR' });
				return res;
			}),
		[ws]
	);

	const completeSession = useCallback(
		(requestId: string) =>
			sessionsComplete(ws, requestId).then(res => {
				const active = state.active?.accepted;
				if (active?.request_id === requestId) {
					// Optimistically reflect end immediately; backend will also push `sessions|ended`.
					dispatch({
						type: 'ENDED_SET',
						payload: { request_id: requestId, room_id: active.room_id, reason: 'manual' },
					});
					dispatch({ type: 'ACTIVE_CLEAR' });
				}
				return res;
			}),
		[ws, state.active?.accepted]
	);

	const endSession = useCallback(
		(requestId: string) =>
			sessionsEndSession(ws, requestId),
		[ws]
	);

	const submitFeedback = useCallback(
		(opts: { requestId: string, rating: number, comment?: string }) =>
			sessionsFeedback(ws, { requestId: opts.requestId, rating: opts.rating, comment: opts.comment }).then(() => {}),
		[ws]
	);

	const clearOutgoing = useCallback(() => dispatch({ type: 'OUTGOING_CLEAR' }), []);
	const clearFeedback = useCallback(() => dispatch({ type: 'FEEDBACK_CLEAR' }), []);

	// Backend does not support `sessions /state`. We rely on push events + local persistence.
	useEffect(() => {
		if (didHydrateLocalRef.current) return;
		didHydrateLocalRef.current = true;

		const snap = loadLocalSessionsSnapshot();
		if (!snap) return;
		hydratedLocalAtMsRef.current = Date.now();
		dispatch({ type: 'HYDRATE_LOCAL', payload: snap });

		// Notify user on reopen if there is a live chat session or a pending request.
		const me = authState.user;
		if (!me) return;
		if (snap.active?.accepted?.kind === 'chat' && snap.active.accepted.room_id && !snap.endedRooms?.[snap.active.accepted.room_id]) {
			showToast('Chat session is still active. Open Messages to resume.');
		} else if (snap.outgoing?.state === 'pending') {
			showToast('Your session request is still pending.');
		} else if (Array.isArray(snap.incoming) && snap.incoming.length) {
			showToast('You have a pending session request.');
		}
	}, [authState.user, showToast]);

	// Subscribe to sessions push events
	useEffect(() => {
		const offReq = ws.on('sessions', 'request', data => {
			const payload = data as SessionsRequestEvent;
			fanMetaByRequestIdRef.current[payload.request_id] = {
				userId: payload.fan_user_id,
				name: payload.fan_display,
			};
			dispatch({ type: 'INCOMING_ADD', payload });
		});
		const offAccepted = ws.on('sessions', 'accepted', data => {
			const payload = data as SessionsAcceptedPayload;
			roomIdByRequestIdRef.current[payload.request_id] = payload.room_id;
			const me = authState.user;
			const creatorMeta = creatorMetaByRequestIdRef.current[payload.request_id];
			const fanMeta = fanMetaByRequestIdRef.current[payload.request_id];
			const otherDisplay =
				me?.role === 'creator' ?
					(fanMeta ? { name: fanMeta.name, avatar: '' } : undefined) :
					(creatorMeta ? { name: creatorMeta.name, avatar: creatorMeta.avatar } : undefined);
			dispatch({ type: 'OUTGOING_ACCEPTED', payload });
			dispatch({
				type: 'ACTIVE_SET',
				payload: {
					accepted: payload,
					uiCallType: uiCallTypeByRequestIdRef.current[payload.request_id],
					otherDisplay,
				},
			});
		});
		const offRejected = ws.on('sessions', 'rejected', data => {
			const payload = data as SessionsRejectedPayload;
			dispatch({ type: 'OUTGOING_REJECTED', payload });
		});
		const offPrompt = ws.on('sessions', 'feedbackprompt', data => {
			const payload = data as SessionsFeedbackPromptEvent;
			// Ensure "session ended" UI is visible on both sides even if `sessions|ended`
			// arrives late or was missed; the feedback prompt implies completion.
			const active = state.active?.accepted;
			const roomId =
				active?.request_id === payload.request_id ?
					active.room_id :
					roomIdByRequestIdRef.current[payload.request_id];
			if (roomId) {
				dispatch({
					type: 'ENDED_SET',
					payload: { request_id: payload.request_id, room_id: roomId, reason: 'manual' },
				});
				if (active?.room_id === roomId) {
					dispatch({ type: 'ACTIVE_CLEAR' });
				}
			}
			dispatch({ type: 'FEEDBACK_PROMPT', payload });
		});
		const offReceived = ws.on('sessions', 'feedbackreceived', data => {
			const payload = data as SessionsFeedbackReceivedEvent;
			dispatch({ type: 'FEEDBACK_RECEIVED', payload });
		});
		const offTimer = ws.on('sessions', 'timer', data => {
			const payload = data as SessionsTimerEvent;
			// Timer ticks are a reliable way to learn the active room after reload/reconnect,
			// even if local `active` wasn't restored yet.
			dispatch({ type: 'TIMER_UPDATE', payload });
			ensureBookedRoomJoined(payload.room_id);
		});
		const offEnded = ws.on('sessions', 'ended', data => {
			const payload = data as SessionsEndedEvent;
			const active = state.active?.accepted;
			// Always record the ended booking so chat UI can reflect it by `room_id`,
			// even if the local `active` booking is different or already cleared.
			dispatch({ type: 'ENDED_SET', payload });
			// Stop treating this room as joinable/realtime after end.
			if (joinedBookedRoomRef.current === payload.room_id) {
				joinedBookedRoomRef.current = null;
			}
			void ws.request('chat', 'leaveroom', [payload.room_id]).catch(() => {});
			if (active?.room_id === payload.room_id) {
				dispatch({ type: 'ACTIVE_CLEAR' });
			}
		});

		return () => {
			offReq();
			offAccepted();
			offRejected();
			offPrompt();
			offReceived();
			offTimer();
			offEnded();
		};
	}, [ws, authState.user, state.active?.accepted?.request_id]);

	// When an accepted chat booking is active, keep the room joined so messages arrive
	// even if the user is on the Messages list (WhatsApp-like unread behavior).
	useEffect(() => {
		if (!wsConnected) return;
		const active = state.active?.accepted;
		if (active?.kind !== 'chat') return;
		ensureBookedRoomJoined(active.room_id);
	}, [wsConnected, state.active?.accepted?.request_id]);

	// Global chat listener for the joined booked room (so Messages list gets live updates).
	useEffect(() => {
		if (!wsConnected) return;
		const off = ws.on('chat', 'c', data => {
			const dto = data as { id: string, room_id: string, user_id: string, body: string, created_at: string };
			const roomId = dto?.room_id ?? '';
			if (!roomId) return;
			if (joinedBookedRoomRef.current !== roomId) return;
			addRoomMessage({
				id: dto.id,
				conversationId: roomId,
				senderId: dto.user_id,
				senderName: 'User',
				senderAvatar: '',
				content: dto.body,
				isPaid: false,
				isUnlocked: true,
				createdAt: dto.created_at,
				isSeen: false,
			});
		});
		return off;
	}, [addRoomMessage, ws, wsConnected]);

	// Persist ended room markers so reload can't "unlock" ended sessions.
	useEffect(() => {
		try {
			globalThis.localStorage?.setItem(ENDED_ROOMS_STORAGE_KEY, JSON.stringify(state.endedRooms));
			const snapshot: LocalSessionsSnapshot = {
				outgoing: state.outgoing,
				incoming: state.incoming,
				active: state.active,
				timer: state.timer,
				ended: state.ended,
				endedRooms: state.endedRooms,
				feedbackPrompt: state.feedbackPrompt,
				feedbackReceived: state.feedbackReceived,
			};
			globalThis.localStorage?.setItem(LOCAL_SESSIONS_STORAGE_KEY, JSON.stringify(snapshot));
		} catch {
			// ignore
		}
	}, [state]);

	// Cross-service: `/endsession` on `sessions` may also emit `|call|ended|{...}`.
	useEffect(() => {
		const offEnded = ws.on('call', 'ended', data => {
			const payload = data as { session_id?: string };
			const active = state.active?.accepted;
			if (active?.kind !== 'call') return;
			if (!payload?.session_id) return;
			if (active.call_session_id && active.call_session_id !== payload.session_id) return;
			dispatch({ type: 'ACTIVE_CLEAR' });
		});
		return offEnded;
	}, [ws, state.active?.accepted?.kind, state.active?.accepted?.call_session_id]);

	// Auto-navigate to chat on accept (but don't force-redirect immediately after local restore).
	useEffect(() => {
		const active = state.active?.accepted;
		if (!active) {
			didPromptActiveRequestIdRef.current = null;
			return;
		}
		if (!authState.user) return;
		if (didPromptActiveRequestIdRef.current === active.request_id) return;
		didPromptActiveRequestIdRef.current = active.request_id;

		if (active.kind === 'chat') {
			const roomId = active.room_id;
			const me = authState.user;
			const creatorMeta = creatorMetaByRequestIdRef.current[active.request_id];
			const fanMeta = fanMetaByRequestIdRef.current[active.request_id];

			// Ensure ChatRoom can render by pre-creating a conversation for this room_id.
			// (ChatRoom is room-based; for sessions we treat the room_id as the conversation id.)
			const otherFromState = state.active?.otherDisplay;
			const other =
				me.role === 'creator' ?
					{
						id: fanMeta?.userId ?? 'fan',
						name: fanMeta?.name ?? otherFromState?.name ?? 'Fan',
						avatar: otherFromState?.avatar ?? '',
					} :
					{
						id: creatorMeta?.userId ?? 'creator',
						name: creatorMeta?.name ?? otherFromState?.name ?? 'Creator',
						avatar: creatorMeta?.avatar ?? otherFromState?.avatar ?? '',
					};

			addConversation({
				id: roomId,
				participantIds: [me.id, other.id],
				participantNames: [me.name, other.name],
				participantAvatars: [me.avatar, other.avatar],
				lastMessage: '',
				lastMessageTime: new Date().toISOString(),
				unreadCount: 0,
				isOnline: true,
			});

			const hydratedAt = hydratedLocalAtMsRef.current;
			const isLikelyLocalRestore = hydratedAt ? Date.now() - hydratedAt < 1500 : false;
			if (isLikelyLocalRestore) {
				showToast('Chat session is still active. Open Messages to resume.');
			} else {
				void navigate(`/messages/${roomId}`);
			}
		}
		// No prompt for call sessions (chat-only prompt requested).
	}, [
		state.active?.accepted?.request_id,
		state.active?.accepted?.kind,
		authState.user,
		addConversation,
		showToast,
		state.active?.otherDisplay,
		navigate,
	]);

	const value = useMemo<SessionsContextValue>(() => ({
		state,
		requestSession,
		acceptSession,
		rejectSession,
		cancelSession,
		completeSession,
		endSession,
		submitFeedback,
		clearOutgoing,
		clearFeedback,
	}), [
		state,
		requestSession,
		acceptSession,
		rejectSession,
		cancelSession,
		completeSession,
		endSession,
		submitFeedback,
		clearOutgoing,
		clearFeedback,
	]);

	return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions(): SessionsContextValue {
	const ctx = useContext(SessionsContext);
	if (!ctx) throw new Error('useSessions must be used within SessionsProvider');
	return ctx;
}
