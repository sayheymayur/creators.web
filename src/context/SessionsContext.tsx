import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWs, useWsConnected } from './WsContext';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
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
	{
		type: 'RESTORE_FROM_STATE',
		payload: {
			outgoing: SessionsRequestResponse | null,
			incoming: SessionsRequestEvent[],
			active: ActiveBookingState | null,
		},
	};

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
		case 'RESTORE_FROM_STATE': {
			const outgoing =
				action.payload.outgoing ?
					{ state: 'pending', request: action.payload.outgoing } as OutgoingRequestState :
					{ state: 'idle' } as OutgoingRequestState;
			return {
				...state,
				outgoing,
				incoming: action.payload.incoming.map(r => ({ request: r })),
				active: action.payload.active,
				timer: null,
				ended: null,
				feedbackPrompt: null,
				feedbackReceived: null,
			};
		}
		default:
			return state;
	}
}

type SessionsStateRow = {
	id: string,
	fan_user_id: string,
	creator_user_id: string,
	kind: SessionKind,
	status: 'pending' | 'accepted' | 'completed',
	price_cents: string,
	duration_minutes: number,
	room_id: string | null,
	call_session_id: string | null,
	started_at: string | null,
	ends_at: string | null,
	completed_at: string | null,
	created_at: string,
	updated_at: string,
};

type SessionsStateResponse = {
	outgoing: SessionsStateRow[],
	incoming: SessionsStateRow[],
	active: SessionsStateRow[],
};

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
	const [state, dispatch] = useReducer(sessionsReducer, initialState);
	const uiCallTypeByRequestIdRef = useRef<Record<string, SessionsUiCallType>>({});
	const creatorMetaByRequestIdRef = useRef<Record<string, { userId: string, name: string, avatar: string }>>({});
	const fanMetaByRequestIdRef = useRef<Record<string, { userId: string, name: string }>>({});
	const roomIdByRequestIdRef = useRef<Record<string, string>>({});
	const joinedBookedRoomRef = useRef<string | null>(null);

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
				const fan = fanMetaByRequestIdRef.current[res.request_id];
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
		[ws]
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

	// Reconnect/login restore: pull current outgoing/incoming/active in one roundtrip.
	useEffect(() => {
		const me = authState.user;
		if (!me?.id) return;
		if (!wsConnected) return;

		void ws.request('sessions', 'state', [])
			.then(body => {
				const res = body as SessionsStateResponse;
				// Restore completed/ended rooms so reload can't turn booked chats into free chats.
				const endedFromState: EndedRoomsMap = {};
				const allRows = [
					...(res.outgoing ?? []),
					...(res.incoming ?? []),
					...(res.active ?? []),
				];
				for (const r of allRows) {
					if (!r?.room_id) continue;
					if (r.status !== 'completed') continue;
					endedFromState[r.room_id] = {
						request_id: r.id,
						room_id: r.room_id,
						reason: 'manual',
					};
				}
				if (Object.keys(endedFromState).length) {
					dispatch({ type: 'ENDED_ROOMS_MERGE', payload: endedFromState });
				}

				const outgoingRow = (res.outgoing ?? []).find(r => r.status === 'pending') ?? null;
				const incomingRows = (res.incoming ?? []).filter(r => r.status === 'pending');
				// Be tolerant: backend may vary status strings; for UI re-attach we only need a
				// non-completed booking with a room_id.
				const activeRow =
					(res.active ?? []).find(r => r.room_id && r.status !== 'completed') ??
					null;

				const outgoing: SessionsRequestResponse | null =
					outgoingRow ?
						{
							request_id: outgoingRow.id,
							status: 'pending',
							price_cents: outgoingRow.price_cents,
							kind: outgoingRow.kind,
						} :
						null;

				const incoming: SessionsRequestEvent[] = incomingRows.map(r => ({
					request_id: r.id,
					fan_user_id: r.fan_user_id,
					fan_display: 'Fan',
					kind: r.kind,
					price_cents: r.price_cents,
					created_at: r.created_at,
				}));

				const activeAccepted: SessionsAcceptedPayload | null =
					activeRow?.room_id ?
						{
							request_id: activeRow.id,
							room_id: activeRow.room_id,
							kind: activeRow.kind,
							call_session_id: activeRow.call_session_id ?? null,
							session: null,
							agora: null,
						} :
						null;

				if (activeAccepted?.room_id) {
					roomIdByRequestIdRef.current[activeAccepted.request_id] = activeAccepted.room_id;
				}
				for (const r of incomingRows) {
					fanMetaByRequestIdRef.current[r.id] = { userId: r.fan_user_id, name: 'Fan' };
				}

				const active: ActiveBookingState | null =
					activeAccepted ?
						{
							accepted: activeAccepted,
							uiCallType: uiCallTypeByRequestIdRef.current[activeAccepted.request_id],
						} :
						null;

				dispatch({ type: 'RESTORE_FROM_STATE', payload: { outgoing, incoming, active } });

				// If a user hard-refreshes while in an active chat session, the Messages/Chat contexts
				// may not have the room conversation hydrated yet. Create a minimal conversation so
				// the ChatRoom can re-attach and re-join the WS room.
				if (activeRow?.room_id && activeRow.kind === 'chat') {
					const otherId = me.role === 'creator' ? activeRow.fan_user_id : activeRow.creator_user_id;
					const otherName = me.role === 'creator' ? 'Fan' : 'Creator';
					addConversation({
						id: activeRow.room_id,
						participantIds: [me.id, otherId],
						participantNames: [me.name, otherName],
						participantAvatars: [me.avatar, ''],
						lastMessage: '',
						lastMessageTime: new Date().toISOString(),
						unreadCount: 0,
						isOnline: true,
					});
				}
			})
			.catch(() => {
				// Non-fatal: live push events still update state.
			});
	}, [authState.user?.id, ws, wsConnected]);

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
		} catch {
			// ignore
		}
	}, [state.endedRooms]);

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

	// Route side-effects when a booking becomes active.
	useEffect(() => {
		const active = state.active?.accepted;
		if (!active) return;
		if (!authState.user) return;

		if (active.kind === 'chat') {
			const roomId = active.room_id;
			const me = authState.user;
			const creatorMeta = creatorMetaByRequestIdRef.current[active.request_id];
			const fanMeta = fanMetaByRequestIdRef.current[active.request_id];

			// Ensure ChatRoom can render by pre-creating a conversation for this room_id.
			// (ChatRoom is room-based; for sessions we treat the room_id as the conversation id.)
			const other =
				me.role === 'creator' ?
					(fanMeta ? { id: fanMeta.userId, name: fanMeta.name, avatar: '' } : { id: 'fan', name: 'Fan', avatar: '' }) :
					(creatorMeta ? { id: creatorMeta.userId, name: creatorMeta.name, avatar: creatorMeta.avatar } : { id: 'creator', name: 'Creator', avatar: '' });

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

			// Reuse existing chat page; it expects a conversation id. For sessions we use the booking room_id.
			void navigate(`/messages/${roomId}`);
			return;
		}
		if (active.kind === 'call') {
			void navigate('/call');
		}
	}, [state.active?.accepted?.request_id, state.active?.accepted?.kind, authState.user, navigate, addConversation]);

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
