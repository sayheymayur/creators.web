import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWs } from './WsContext';
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
	SessionsFeedbackPromptEvent,
	SessionsFeedbackReceivedEvent,
	SessionsRejectedPayload,
	SessionsRequestEvent,
	SessionsRequestResponse,
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

type SessionsState = {
	outgoing: OutgoingRequestState,
	incoming: IncomingRequestState[],
	active: ActiveBookingState | null,
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
	{ type: 'FEEDBACK_PROMPT', payload: SessionsFeedbackPromptEvent } |
	{ type: 'FEEDBACK_RECEIVED', payload: SessionsFeedbackReceivedEvent } |
	{ type: 'FEEDBACK_CLEAR' };

const initialState: SessionsState = {
	outgoing: { state: 'idle' },
	incoming: [],
	active: null,
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
			return { ...state, active: action.payload };
		case 'ACTIVE_CLEAR':
			return { ...state, active: null };
		case 'FEEDBACK_PROMPT':
			return { ...state, feedbackPrompt: { request_id: action.payload.request_id } };
		case 'FEEDBACK_RECEIVED':
			return { ...state, feedbackReceived: action.payload };
		case 'FEEDBACK_CLEAR':
			return { ...state, feedbackPrompt: null, feedbackReceived: null };
		default:
			return state;
	}
}

type SessionsContextValue = {
	state: SessionsState,
	requestSession: (opts: {
		creatorUserId: string,
		kind: SessionKind,
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
	const navigate = useNavigate();
	const { state: authState } = useAuth();
	const { addConversation } = useChat();
	const [state, dispatch] = useReducer(sessionsReducer, initialState);
	const uiCallTypeByRequestIdRef = useRef<Record<string, SessionsUiCallType>>({});
	const creatorMetaByRequestIdRef = useRef<Record<string, { userId: string, name: string, avatar: string }>>({});
	const fanMetaByRequestIdRef = useRef<Record<string, { userId: string, name: string }>>({});

	const requestSession = useCallback(
		(opts: {
			creatorUserId: string,
			kind: SessionKind,
			uiCallType?: SessionsUiCallType,
			creatorDisplay?: { name: string, avatar: string },
		}) => {
			dispatch({ type: 'OUTGOING_REQUESTING', payload: { creatorUserId: opts.creatorUserId, kind: opts.kind } });
			return sessionsRequest(ws, { creatorUserId: opts.creatorUserId, kind: opts.kind })
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
			sessionsComplete(ws, requestId),
		[ws]
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
			dispatch({ type: 'FEEDBACK_PROMPT', payload });
		});
		const offReceived = ws.on('sessions', 'feedbackreceived', data => {
			const payload = data as SessionsFeedbackReceivedEvent;
			dispatch({ type: 'FEEDBACK_RECEIVED', payload });
		});

		return () => {
			offReq();
			offAccepted();
			offRejected();
			offPrompt();
			offReceived();
		};
	}, [ws, authState.user]);

	// Cross-service: `/endsession` on `sessions` may also emit `|call|ended|{...}`.
	useEffect(() => {
		const offEnded = ws.on('call', 'ended', data => {
			const payload = data as { session_id?: string };
			const active = state.active?.accepted;
			if (!active || active.kind !== 'call') return;
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
