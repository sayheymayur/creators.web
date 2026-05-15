import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWs, useWsAuthReady, useWsConnected } from './WsContext';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import { useNotifications } from './NotificationContext';
import { mockCreators } from '../data/users';
import { ensureMediaPermissions, isDeviceInUseError } from '../services/mediaPermissions';
import {
	sessionsAccept,
	sessionsCancel,
	sessionsComplete,
	sessionsEndSession,
	sessionsFeedback,
	sessionsReject,
	sessionsRequest,
	sessionsState,
} from '../services/sessionsWsService';
import type {
	SessionKind,
	SessionsAcceptedPayload,
	SessionsCompleteResponse,
	SessionsEndSessionResponse,
	SessionsStateResponse,
	SessionsBookingRow,
	SessionsEndedEvent,
	SessionsFeedbackPromptEvent,
	SessionsFeedbackReceivedEvent,
	SessionsRejectedPayload,
	SessionsRequestEvent,
	SessionsRequestResponse,
	SessionsTimerEvent,
} from '../services/sessionsWsTypes';

export type SessionsUiCallType = 'audio' | 'video';

/** UI metadata for fan outgoing session requests (pending card, reload hydrate). */
export type OutgoingRequestMeta = {
	creatorUserId: string,
	creatorDisplay?: { name: string, avatar: string },
	uiCallType?: SessionsUiCallType,
	minutes?: number,
};

export type OutgoingRequestState =
	| { state: 'idle' } |
	({ state: 'requesting', kind: SessionKind } & OutgoingRequestMeta) |
	({ state: 'pending', request: SessionsRequestResponse } & OutgoingRequestMeta) |
	{ state: 'accepted', accepted: SessionsAcceptedPayload } |
	{ state: 'rejected', rejected: SessionsRejectedPayload };

export type IncomingRequestState = {
	request: SessionsRequestEvent & { minutes?: number },
};

export type ActiveBookingState = {
	accepted: SessionsAcceptedPayload,
	/** For chat sessions, used to drive a local countdown fallback and persist across reloads. */
	minutes?: number,
	/**
	 * For `kind === "call"`, the UI needs to know whether to show audio vs video.
	 * The server spec only distinguishes call vs chat, so we keep a local hint.
	 */
	uiCallType?: SessionsUiCallType,
	otherDisplay?: { name: string, avatar: string },
	/** From server booking row when syncing `/state`; used for name fallbacks (e.g. ContentContext). */
	peerIds?: { fan_user_id: string, creator_user_id: string },
};

export type FeedbackPromptState = {
	request_id: string,
};

type EndedRoomsMap = Record<string, SessionsEndedEvent>;

const ENDED_ROOMS_STORAGE_KEY = 'cw.sessions.endedRooms.v1';
const LOCAL_SESSIONS_STORAGE_KEY = 'cw.sessions.snapshot.v1';
const CALL_AGORA_CREDS_STORAGE_KEY = 'cw.sessions.callAgoraCredsByUser.v1';

type CallAgoraCredsMap = Record<string, NonNullable<SessionsAcceptedPayload['agora']>>;
type CallAgoraCredsByUserMap = Record<string, CallAgoraCredsMap>;

function loadCallAgoraCredsByUser(): CallAgoraCredsByUserMap {
	try {
		// Migrate away from older unscoped key(s) and avoid localStorage (shared across tabs).
		try { globalThis.localStorage?.removeItem('cw.sessions.callAgoraCreds.v1'); } catch { /* ignore */ }
		try { globalThis.localStorage?.removeItem('cw.sessions.callAgoraCredsByUser.v1'); } catch { /* ignore */ }

		const raw = globalThis.sessionStorage?.getItem(CALL_AGORA_CREDS_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return {};
		return parsed as CallAgoraCredsByUserMap;
	} catch {
		return {};
	}
}

function saveCallAgoraCredsByUser(next: CallAgoraCredsByUserMap) {
	try {
		globalThis.sessionStorage?.setItem(CALL_AGORA_CREDS_STORAGE_KEY, JSON.stringify(next));
	} catch {
		// ignore
	}
}

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

/** Fields merged from `sessions /state` only; never overwrites push-driven feedback state. */
type SessionsRemoteHydratePayload = Pick<
	LocalSessionsSnapshot,
	'outgoing' | 'incoming' | 'active' | 'timer' | 'ended' | 'endedRooms'
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

function isBrowserReloadNavigation(): boolean {
	const nav = globalThis.performance?.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
	return nav?.type === 'reload';
}

function parseSessionsRequestId(data: unknown): string | null {
	if (!data || typeof data !== 'object') return null;
	const raw = data as Record<string, unknown>;
	for (const c of [raw.request_id, raw.requestId, raw.id]) {
		if (typeof c === 'string' && /^\d+$/.test(c.trim())) return c.trim();
		if (typeof c === 'number' && Number.isFinite(c)) return String(Math.trunc(c));
	}
	return null;
}

function resolveCreatorDisplayForFan(
	creatorUserId: string,
	authProfiles: Record<string, { name?: string, avatar?: string | null } | undefined>
): { name: string, avatar: string } | undefined {
	const authProf = authProfiles[creatorUserId];
	if (authProf?.name) {
		return { name: authProf.name, avatar: authProf.avatar ?? '' };
	}
	const mock = mockCreators.find(c => c.id === creatorUserId);
	if (mock) {
		return { name: mock.name, avatar: mock.avatar };
	}
	return undefined;
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

type OutgoingMetaActionPayload = { kind: SessionKind } & OutgoingRequestMeta;

type Action =
	| { type: 'OUTGOING_REQUESTING', payload: OutgoingMetaActionPayload } |
	{ type: 'OUTGOING_PENDING', payload: { request: SessionsRequestResponse } & OutgoingRequestMeta } |
	{ type: 'OUTGOING_ACCEPTED', payload: SessionsAcceptedPayload } |
	{ type: 'OUTGOING_REJECTED', payload: SessionsRejectedPayload } |
	{ type: 'OUTGOING_CLEAR' } |
	{ type: 'INCOMING_ADD', payload: SessionsRequestEvent & { minutes?: number } } |
	{ type: 'INCOMING_REMOVE', payload: { request_id: string } } |
	{ type: 'BOOKING_CANCELLED', payload: { request_id: string } } |
	{ type: 'ACTIVE_SET', payload: ActiveBookingState } |
	{ type: 'ACTIVE_CLEAR' } |
	{ type: 'TIMER_UPDATE', payload: SessionsTimerEvent } |
	{ type: 'ENDED_SET', payload: SessionsEndedEvent } |
	{ type: 'ENDED_CLEAR' } |
	{ type: 'ENDED_ROOMS_MERGE', payload: EndedRoomsMap } |
	{ type: 'FEEDBACK_PROMPT', payload: SessionsFeedbackPromptEvent } |
	{ type: 'FEEDBACK_RECEIVED', payload: SessionsFeedbackReceivedEvent } |
	{ type: 'FEEDBACK_CLEAR' } |
	{ type: 'HYDRATE_LOCAL', payload: LocalSessionsSnapshot } |
	{ type: 'HYDRATE_REMOTE', payload: SessionsRemoteHydratePayload };

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
			return { ...state, outgoing: { state: 'pending', ...action.payload } };
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
		case 'BOOKING_CANCELLED': {
			const { request_id } = action.payload;
			const nextIncoming = state.incoming.filter(r => r.request.request_id !== request_id);
			let nextOutgoing = state.outgoing;
			if (state.outgoing.state === 'pending' && state.outgoing.request.request_id === request_id) {
				nextOutgoing = { state: 'idle' };
			}
			return { ...state, incoming: nextIncoming, outgoing: nextOutgoing };
		}
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
		case 'HYDRATE_REMOTE': {
			// Server `/state` is source-of-truth; keep locally persisted ended markers.
			// Do not touch `feedbackPrompt` / `feedbackReceived` (push-driven; avoids stale /state races).
			const p = action.payload;
			let activeOut = p.active;
			if (
				p.active?.accepted?.request_id &&
				state.active?.accepted?.request_id === p.active.accepted.request_id
			) {
				activeOut = {
					...p.active,
					otherDisplay: p.active.otherDisplay?.name ? p.active.otherDisplay : state.active.otherDisplay,
					peerIds: p.active.peerIds ?? state.active.peerIds,
					uiCallType: p.active.uiCallType ?? state.active.uiCallType,
					minutes: p.active.minutes ?? state.active.minutes,
				};
			}
			return {
				...state,
				outgoing: p.outgoing,
				incoming: p.incoming,
				active: activeOut ?? p.active,
				timer: p.timer,
				ended: p.ended,
				endedRooms: { ...state.endedRooms, ...(p.endedRooms ?? {}) },
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
	acceptSession: (requestId: string, opts?: { uiCallType?: SessionsUiCallType }) => Promise<SessionsAcceptedPayload>,
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
	const wsAuthReady = useWsAuthReady();
	const navigate = useNavigate();
	const location = useLocation();
	const { state: authState } = useAuth();
	const { state: chatState, addConversation, addRoomMessage } = useChat();
	const { showToast } = useNotifications();
	const [state, dispatch] = useReducer(sessionsReducer, initialState);
	const callAgoraCredsByUserRef = useRef<CallAgoraCredsByUserMap>(loadCallAgoraCredsByUser());
	const callAgoraCredsByRequestIdRef = useRef<CallAgoraCredsMap>({});
	const uiCallTypeByRequestIdRef = useRef<Record<string, SessionsUiCallType>>({});
	const minutesByRequestIdRef = useRef<Record<string, number>>({});
	const creatorMetaByRequestIdRef = useRef<Record<string, { userId: string, name: string, avatar: string }>>({});
	const fanMetaByRequestIdRef = useRef<Record<string, { userId: string, name: string }>>({});
	const roomIdByRequestIdRef = useRef<Record<string, string>>({});
	/** When a fan requests a session, remember intent so hydrate-only accept can still auto-open once. */
	const lastOutgoingIntentRef = useRef<{ requestId: string, atMs: number, kind: SessionKind } | null>(null);
	const joinedBookedRoomRef = useRef<string | null>(null);
	const didPromptActiveRequestIdRef = useRef<string | null>(null);
	const didHydrateLocalRef = useRef(false);
	/** Set when `sessions|accepted` (or `acceptSession` ack) is for a live chat accept — triggers one auto-open to the thread. */
	const pendingOpenBookedChatRequestIdRef = useRef<string | null>(null);
	/** Same as chat, for booked calls — avoids auto `/call` on reconnect when `sessions|accepted` replays. */
	const pendingOpenBookedCallRequestIdRef = useRef<string | null>(null);
	const localTimerRef = useRef<{ requestId: string, roomId: string, endsAtMs: number, t: number | null } | null>(null);
	const stateSyncRef = useRef<{ atMs: number, reason: string } | null>(null);

	const clearLocalTimer = useCallback(() => {
		const cur = localTimerRef.current;
		if (!cur) return;
		if (cur.t != null) window.clearInterval(cur.t);
		localTimerRef.current = null;
	}, []);

	const startLocalTimer = useCallback((opts: { requestId: string, roomId: string, minutes: number }) => {
		clearLocalTimer();
		const endsAtMs = Date.now() + Math.max(1, Math.floor(opts.minutes)) * 60_000;
		const tick = () => {
			const rem = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000));
			dispatch({
				type: 'TIMER_UPDATE',
				payload: {
					request_id: opts.requestId,
					room_id: opts.roomId,
					ends_at: new Date(endsAtMs).toISOString(),
					remaining_sec: rem,
				},
			});
			if (rem <= 0) clearLocalTimer();
		};
		tick();
		const t = window.setInterval(tick, 1000);
		localTimerRef.current = { requestId: opts.requestId, roomId: opts.roomId, endsAtMs, t };
	}, [clearLocalTimer]);

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
			const meta: OutgoingRequestMeta = {
				creatorUserId: opts.creatorUserId,
				...(opts.creatorDisplay ? { creatorDisplay: opts.creatorDisplay } : {}),
				...(opts.uiCallType ? { uiCallType: opts.uiCallType } : {}),
				minutes: opts.minutes,
			};
			dispatch({ type: 'OUTGOING_REQUESTING', payload: { kind: opts.kind, ...meta } });
			return sessionsRequest(ws, { creatorUserId: opts.creatorUserId, kind: opts.kind, minutes: opts.minutes })
				.then(res => {
					minutesByRequestIdRef.current[res.request_id] = opts.minutes;
					lastOutgoingIntentRef.current = { requestId: res.request_id, atMs: Date.now(), kind: opts.kind };
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
					dispatch({ type: 'OUTGOING_PENDING', payload: { request: res, ...meta } });
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
		(requestId: string, opts?: { uiCallType?: SessionsUiCallType }) => {
			if (opts?.uiCallType) {
				uiCallTypeByRequestIdRef.current[requestId] = opts.uiCallType;
			}
			return sessionsAccept(ws, { requestId }).then(res => {
				dispatch({ type: 'INCOMING_REMOVE', payload: { request_id: requestId } });
				const fan =
					fanMetaByRequestIdRef.current[res.request_id] ??
					(() => {
						// After reload, meta refs can be empty; rely on restored incoming request payload.
						const row = state.incoming.find(r => r.request.request_id === res.request_id)?.request;
						return row ? { userId: row.fan_user_id, name: row.fan_display } : undefined;
					})();
				const me = authState.user;
				dispatch({
					type: 'ACTIVE_SET',
					payload: {
						accepted: res,
						uiCallType: uiCallTypeByRequestIdRef.current[res.request_id],
						otherDisplay: fan ? { name: fan.name, avatar: '' } : undefined,
						peerIds: fan && me?.role === 'creator' ? { fan_user_id: fan.userId, creator_user_id: me.id } : undefined,
					},
				});
				if (res.kind === 'chat') pendingOpenBookedChatRequestIdRef.current = res.request_id;
				if (res.kind === 'call') pendingOpenBookedCallRequestIdRef.current = res.request_id;
				return res;
			});
		},
		[ws, state.incoming, authState.user]
	);

	const rejectSession = useCallback(
		(requestId: string, message?: string) =>
			sessionsReject(ws, { requestId, message }).then(res => {
				dispatch({ type: 'INCOMING_REMOVE', payload: { request_id: requestId } });
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
	const lastFanOutgoingNotifyKeyRef = useRef<string>('');

	// Fan: global toasts for accept/reject (not tied to CreatorProfile page).
	useEffect(() => {
		if (authState.user?.role !== 'fan') return;
		const out = state.outgoing;
		if (out.state === 'accepted') {
			const key = `accepted:${out.accepted.request_id}`;
			if (lastFanOutgoingNotifyKeyRef.current !== key) {
				lastFanOutgoingNotifyKeyRef.current = key;
				showToast('Session accepted!');
				clearOutgoing();
			}
			return;
		}
		if (out.state === 'rejected') {
			const key = `rejected:${out.rejected.request_id}`;
			if (lastFanOutgoingNotifyKeyRef.current !== key) {
				lastFanOutgoingNotifyKeyRef.current = key;
				showToast(out.rejected.message || 'Session rejected', 'error');
				clearOutgoing();
			}
			return;
		}
		if (out.state === 'idle') {
			lastFanOutgoingNotifyKeyRef.current = '';
		}
	}, [authState.user?.role, state.outgoing, showToast, clearOutgoing]);

	// Local restore for offline continuity (but the source of truth is `sessions /state`).
	useEffect(() => {
		if (didHydrateLocalRef.current) return;
		didHydrateLocalRef.current = true;

		const snap = loadLocalSessionsSnapshot();
		if (!snap) return;
		dispatch({ type: 'HYDRATE_LOCAL', payload: snap });

		// Notify user on reopen if there is a live chat session or a pending request.
		const me = authState.user;
		if (!me) return;
		if (Array.isArray(snap.incoming) && snap.incoming.length) {
			showToast('You have a pending session request.');
		}
	}, [authState.user, showToast]);

	const bookingRowToAccepted = (row: SessionsBookingRow): SessionsAcceptedPayload => {
		const storedAgora = callAgoraCredsByRequestIdRef.current[row.id];
		return {
			request_id: row.id,
			room_id: row.room_id ?? '',
			kind: row.kind,
			call_session_id: row.call_session_id,
			session: null,
			agora: storedAgora ?? null,
			started_at: row.started_at,
			ends_at: row.ends_at,
			duration_minutes: row.duration_minutes,
			price_cents: row.price_cents,
		};
	};

	// Scope persisted Agora creds by user id (prevents fan/creator overwriting each other on the same origin).
	useEffect(() => {
		const uid = authState.user?.id ?? '';
		if (!uid) {
			callAgoraCredsByRequestIdRef.current = {};
			return;
		}
		callAgoraCredsByRequestIdRef.current = callAgoraCredsByUserRef.current[uid] ?? {};
	}, [authState.user?.id]);

	const deriveTimerFromEndsAt = (opts: { requestId: string, roomId: string, endsAt: string | null | undefined }) => {
		const ends = opts.endsAt ?? '';
		if (!ends) return null;
		const endsAtMs = new Date(ends).getTime();
		if (!Number.isFinite(endsAtMs)) return null;
		const rem = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000));
		const payload: SessionsTimerEvent = {
			request_id: opts.requestId,
			room_id: opts.roomId,
			ends_at: new Date(endsAtMs).toISOString(),
			remaining_sec: rem,
		};
		return payload;
	};

	const applyRemoteState = useCallback((remote: SessionsStateResponse) => {
		const outgoing = (remote.outgoing ?? []);
		const incomingRows = (remote.incoming ?? []);
		const activeRows = (remote.active ?? []);

		const pendingOutgoing = outgoing.find(r => r.status === 'pending' || r.status === 'accepted') ?? null;
		let nextOutgoing: OutgoingRequestState = { state: 'idle' };
		if (pendingOutgoing) {
			const creatorUserId = pendingOutgoing.creator_user_id;
			const prevOutgoing = state.outgoing;
			const prevMeta =
				prevOutgoing.state === 'pending' || prevOutgoing.state === 'requesting' ?
					{
						creatorDisplay: prevOutgoing.creatorDisplay,
						uiCallType: prevOutgoing.uiCallType,
						minutes: prevOutgoing.minutes,
					} :
					{};
			nextOutgoing = {
				state: 'pending',
				request: {
					request_id: pendingOutgoing.id,
					status: 'pending',
					price_cents: pendingOutgoing.price_cents,
					kind: pendingOutgoing.kind,
				},
				creatorUserId,
				creatorDisplay:
					prevMeta.creatorDisplay ??
					resolveCreatorDisplayForFan(creatorUserId, authState.creatorProfiles),
				...(prevMeta.uiCallType ?? uiCallTypeByRequestIdRef.current[pendingOutgoing.id] ?
					{ uiCallType: prevMeta.uiCallType ?? uiCallTypeByRequestIdRef.current[pendingOutgoing.id] } :
					{}),
				minutes: prevMeta.minutes ?? pendingOutgoing.duration_minutes,
			};
		}

		const nextIncoming: IncomingRequestState[] = incomingRows
			.filter(r => r.status === 'pending')
			.map(r => ({
				request: {
					request_id: r.id,
					fan_user_id: r.fan_user_id,
					fan_display: `User ${r.fan_user_id}`,
					kind: r.kind,
					price_cents: r.price_cents,
					created_at: r.created_at,
					minutes: r.duration_minutes,
				},
			}));

		const activeAccepted = activeRows.find(r => r.status === 'accepted' && !!r.room_id) ?? null;
		let nextActive: ActiveBookingState | null = null;
		if (activeAccepted) {
			const rid = activeAccepted.id;
			const prevSame =
				state.active?.accepted?.request_id === rid ?
					state.active.otherDisplay :
					undefined;
			let otherDisplay: { name: string, avatar: string } | undefined;
			if (prevSame?.name) {
				otherDisplay = prevSame;
			} else {
				const me = authState.user;
				const creatorMeta = creatorMetaByRequestIdRef.current[rid];
				const fanMeta = fanMetaByRequestIdRef.current[rid];
				if (me?.role === 'creator') {
					otherDisplay = fanMeta?.name ?
						{ name: fanMeta.name, avatar: '' } :
						{ name: 'Fan', avatar: '' };
				} else if (me) {
					if (creatorMeta?.name) {
						otherDisplay = { name: creatorMeta.name, avatar: creatorMeta.avatar };
					} else {
						const authProf = authState.creatorProfiles[activeAccepted.creator_user_id];
						if (authProf?.name) {
							otherDisplay = { name: authProf.name, avatar: authProf.avatar ?? '' };
						} else {
							const mock = mockCreators.find(c => c.id === activeAccepted.creator_user_id);
							otherDisplay = mock ?
								{ name: mock.name, avatar: mock.avatar } :
								{ name: 'Creator', avatar: '' };
						}
					}
				}
			}
			nextActive = {
				accepted: bookingRowToAccepted(activeAccepted),
				minutes: activeAccepted.duration_minutes,
				uiCallType:
					(state.active?.accepted?.request_id === activeAccepted.id ? state.active.uiCallType : undefined) ??
					uiCallTypeByRequestIdRef.current[activeAccepted.id],
				otherDisplay,
				peerIds: {
					fan_user_id: activeAccepted.fan_user_id,
					creator_user_id: activeAccepted.creator_user_id,
				},
			};

			// If the fan missed the `|accepted` push and only /state shows the active booking,
			// auto-open once only when it matches the user's outgoing request intent.
			// Guard against reload auto-open (banners should handle restore UX).
			if (
				authState.user?.role === 'fan' &&
				!isBrowserReloadNavigation()
			) {
				const intent = lastOutgoingIntentRef.current;
				// Accept can happen much later than request; keep a generous window to cover normal usage.
				const isIntentMatch =
					!!intent &&
					intent.requestId === activeAccepted.id &&
					(Date.now() - intent.atMs) < 12 * 60 * 60_000;
				const isOutgoingMatch =
					state.outgoing.state === 'pending' &&
					state.outgoing.request.request_id === activeAccepted.id;
				if (isIntentMatch || isOutgoingMatch) {
					if (activeAccepted.kind === 'chat') pendingOpenBookedChatRequestIdRef.current = activeAccepted.id;
					if (activeAccepted.kind === 'call') pendingOpenBookedCallRequestIdRef.current = activeAccepted.id;
					// Avoid re-triggering if /state polls again.
					lastOutgoingIntentRef.current = null;
				}
			}
		}

		const nextTimer =
			activeAccepted ?
				deriveTimerFromEndsAt({ requestId: activeAccepted.id, roomId: activeAccepted.room_id ?? '', endsAt: activeAccepted.ends_at }) :
				null;

		dispatch({
			type: 'HYDRATE_REMOTE',
			payload: {
				outgoing: nextOutgoing,
				incoming: nextIncoming,
				active: nextActive,
				timer: nextTimer,
				ended: state.ended,
				endedRooms: state.endedRooms,
			},
		});
	}, [authState.user, authState.creatorProfiles, deriveTimerFromEndsAt, state.active, state.ended, state.endedRooms, state.outgoing]);

	const syncState = useCallback((reason: string) => {
		if (!wsConnected || !wsAuthReady) return;
		if (!authState.user) return;
		const now = Date.now();
		const prev = stateSyncRef.current;
		if (prev && now - prev.atMs < 1500) return;
		stateSyncRef.current = { atMs: now, reason };
		void sessionsState(ws, `rs-${reason}`)
			.then((remote: SessionsStateResponse) => {
				applyRemoteState(remote);
			})
			.catch(() => {});
	}, [ws, wsConnected, wsAuthReady, authState.user, applyRemoteState]);

	const cancelSession = useCallback(
		(requestId: string) =>
			sessionsCancel(ws, requestId).then(res => {
				dispatch({ type: 'BOOKING_CANCELLED', payload: { request_id: requestId } });
				syncState('cancel');
				return res;
			}),
		[ws, syncState]
	);

	// Spec: no guaranteed `sessions|cancelled` push to creator — poll `/state` while ringing.
	useEffect(() => {
		if (authState.user?.role !== 'creator') return;
		if (state.incoming.length === 0) return;
		if (!wsConnected || !wsAuthReady) return;
		const id = window.setInterval(() => { syncState('incoming-poll'); }, 6000);
		return () => { window.clearInterval(id); };
	}, [authState.user?.role, state.incoming.length, wsConnected, wsAuthReady, syncState]);

	// Spec: after reconnect/login, pull `/state` to restore outgoing/incoming/active bookings.
	useEffect(() => {
		syncState('state');
	}, [ws, wsConnected, wsAuthReady, authState.user?.id, syncState]);

	// Spec: if timer expires, server should push `sessions|ended` + `sessions|feedbackprompt`.
	// If a user reloads at the boundary and misses push frames, resync `/state` at ends_at and retry.
	useEffect(() => {
		if (!wsConnected) return;
		const active = state.active?.accepted;
		if (!active) return;
		if (active.kind !== 'chat') return;
		const roomId = active.room_id;
		if (!roomId) return;
		if (state.endedRooms[roomId]) return;

		const endsAt = state.timer?.room_id === roomId ? state.timer.ends_at : (active.ends_at ?? null);
		if (!endsAt) return;
		const endsAtMs = new Date(endsAt).getTime();
		if (!Number.isFinite(endsAtMs)) return;

		const msLeft = endsAtMs - Date.now();
		const t = window.setTimeout(() => {
			let tries = 0;
			syncState('ends');
			const interval = window.setInterval(() => {
				tries += 1;
				if (state.endedRooms[roomId]) {
					window.clearInterval(interval);
					return;
				}
				syncState('ends');
				if (tries >= 6) window.clearInterval(interval);
			}, 5000);
		}, Math.min(Math.max(0, msLeft + 1200), 2_147_000_000));
		return () => window.clearTimeout(t);
	}, [wsConnected, state.active?.accepted?.request_id, state.timer?.ends_at, state.timer?.room_id, state.endedRooms, syncState]);

	// Subscribe to sessions push events
	useEffect(() => {
		let offAny: (() => void) | null = null;
		if (import.meta.env.DEV) {
			offAny = ws.onAny(frame => {
				const f = frame;
				if (f.type !== 'event') return;
				if (f.service !== 'sessions' && f.service !== 'session') return;
				const g = globalThis as unknown as Record<string, unknown>;
				const prev = (g.CW_SESSIONS_FRAMES as unknown[] | undefined) ?? [];
				g.CW_SESSIONS_FRAMES = [...prev.slice(-24), f];
			});
		}

		const offReq = ws.on('sessions', 'request', data => {
			const payloadBase = data as SessionsRequestEvent;
			// Some backends include requested minutes; capture it if present so we can render a local timer.
			const raw = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};
			const minutesRaw =
				typeof raw.minutes === 'number' ? raw.minutes :
				typeof raw.duration_minutes === 'number' ? raw.duration_minutes :
				typeof raw.durationMinutes === 'number' ? raw.durationMinutes :
				(typeof raw.minutes === 'string' && /^\d+$/.test(raw.minutes.trim()) ? Number(raw.minutes) : null);
			const minutes =
				typeof minutesRaw === 'number' && Number.isFinite(minutesRaw) && minutesRaw > 0 ?
					Math.floor(minutesRaw) :
					undefined;
			if (minutes) minutesByRequestIdRef.current[payloadBase.request_id] = minutes;
			const payload: SessionsRequestEvent & { minutes?: number } = { ...payloadBase, minutes };

			fanMetaByRequestIdRef.current[payloadBase.request_id] = {
				userId: payloadBase.fan_user_id,
				name: payloadBase.fan_display,
			};
			dispatch({ type: 'INCOMING_ADD', payload });
		});
		const onAccepted = (data: unknown) => {
			const payload = data as SessionsAcceptedPayload;
			roomIdByRequestIdRef.current[payload.request_id] = payload.room_id;

			// Persist per-user Agora creds so a reload can re-attach and resume the call booking.
			if (payload.kind === 'call' && payload.agora) {
				const uid = authState.user?.id ?? '';
				if (uid) {
					const prevForUser = callAgoraCredsByUserRef.current[uid] ?? {};
					const nextForUser = { ...prevForUser, [payload.request_id]: payload.agora };
					callAgoraCredsByUserRef.current = { ...callAgoraCredsByUserRef.current, [uid]: nextForUser };
					callAgoraCredsByRequestIdRef.current = nextForUser;
					saveCallAgoraCredsByUser(callAgoraCredsByUserRef.current);
				}
			}

			const me = authState.user;
			const creatorMeta = creatorMetaByRequestIdRef.current[payload.request_id];
			const fanMeta = fanMetaByRequestIdRef.current[payload.request_id];
			const otherDisplay =
				me?.role === 'creator' ?
					(fanMeta ? { name: fanMeta.name, avatar: '' } : undefined) :
					(creatorMeta ? { name: creatorMeta.name, avatar: creatorMeta.avatar } : undefined);
			const peerIds =
				me?.role === 'creator' && fanMeta && me ?
					{ fan_user_id: fanMeta.userId, creator_user_id: me.id } :
					me?.role === 'fan' && creatorMeta && me ?
						{ fan_user_id: me.id, creator_user_id: creatorMeta.userId } :
						undefined;
			dispatch({ type: 'OUTGOING_ACCEPTED', payload });
			dispatch({
				type: 'ACTIVE_SET',
				payload: {
					accepted: payload,
					minutes: minutesByRequestIdRef.current[payload.request_id],
					uiCallType: uiCallTypeByRequestIdRef.current[payload.request_id],
					otherDisplay,
					peerIds,
				},
			});
			if (payload.kind === 'call') {
				pendingOpenBookedCallRequestIdRef.current = payload.request_id;
			}
			// If the server isn't pushing `sessions|timer` reliably, we can still show a timer from the known minutes.
			// This covers the fan role (minutes known from request) and any backend that includes minutes in the request event.
			if (payload.kind === 'chat') {
				pendingOpenBookedChatRequestIdRef.current = payload.request_id;
				const mins = minutesByRequestIdRef.current[payload.request_id];
				if (typeof mins === 'number' && Number.isFinite(mins) && mins > 0) {
					startLocalTimer({ requestId: payload.request_id, roomId: payload.room_id, minutes: mins });
				}
			}
		};
		const offAccepted = ws.on('sessions', 'accepted', onAccepted);
		const offAccepted2 = ws.on('session', 'accepted', onAccepted);
		const offRejected = ws.on('sessions', 'rejected', data => {
			const payload = data as SessionsRejectedPayload;
			dispatch({ type: 'OUTGOING_REJECTED', payload });
		});
		const onBookingCancelled = (data: unknown) => {
			const requestId = parseSessionsRequestId(data);
			if (!requestId) return;
			dispatch({ type: 'BOOKING_CANCELLED', payload: { request_id: requestId } });
		};
		const offCancelled = ws.on('sessions', 'cancelled', onBookingCancelled);
		const offCanceled = ws.on('sessions', 'canceled', onBookingCancelled);
		const offCancelled2 = ws.on('session', 'cancelled', onBookingCancelled);
		const offCanceled2 = ws.on('session', 'canceled', onBookingCancelled);
		const onFeedbackPrompt = (data: unknown) => {
			const payload = data as SessionsFeedbackPromptEvent;
			// Spec: prompt is driven by backend; we don't infer end here.
			dispatch({ type: 'FEEDBACK_PROMPT', payload });
		};
		const offPrompt = ws.on('sessions', 'feedbackprompt', onFeedbackPrompt);
		const offPrompt2 = ws.on('session', 'feedbackprompt', onFeedbackPrompt);
		const offReceived = ws.on('sessions', 'feedbackreceived', data => {
			const payload = data as SessionsFeedbackReceivedEvent;
			dispatch({ type: 'FEEDBACK_RECEIVED', payload });
		});
		// Spec: server may push `sessions|sync` on connect with the same payload as `/state`.
		const offSync = ws.on('sessions', 'sync', data => {
			const payload = data as SessionsStateResponse;
			applyRemoteState(payload);
		});
		const onTimerLike = (data: unknown) => {
			const str = (v: unknown): string => {
				if (typeof v === 'string') return v;
				if (typeof v === 'number' && Number.isFinite(v)) return String(v);
				return '';
			};
			// Backend variants seen across environments:
			// - { room_id, request_id, ends_at, remaining_sec }
			// - { roomId, requestId, endsAt, remainingSec }
			const raw = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};
			const payload: SessionsTimerEvent = {
				request_id: str(raw.request_id ?? raw.requestId),
				room_id: str(raw.room_id ?? raw.roomId),
				started_at: typeof raw.started_at === 'string' ? raw.started_at : (typeof raw.startedAt === 'string' ? raw.startedAt : undefined),
				ends_at: str(raw.ends_at ?? raw.endsAt),
				remaining_sec: Number(raw.remaining_sec ?? raw.remainingSec ?? 0),
			};
			if (!payload.request_id || !payload.room_id) return;
			// If backend didn't send `ends_at`, approximate it from remaining seconds so the UI can tick.
			if (!payload.ends_at && Number.isFinite(payload.remaining_sec) && payload.remaining_sec > 0) {
				payload.ends_at = new Date(Date.now() + payload.remaining_sec * 1000).toISOString();
			}
			dispatch({ type: 'TIMER_UPDATE', payload });
			const activeAccepted = state.active?.accepted;
			if (activeAccepted?.kind === 'chat' && activeAccepted.room_id === payload.room_id) {
				ensureBookedRoomJoined(payload.room_id);
			}
		};

		const offTimer = ws.on('sessions', 'timer', onTimerLike);
		const offTick = ws.on('sessions', 'tick', onTimerLike);
		const offTimerUpdate = ws.on('sessions', 'timerupdate', onTimerLike);
		const offTimerUpdateSnake = ws.on('sessions', 'timer_update', onTimerLike);
		// Some environments use `session` (singular) as the service name.
		const offTimer2 = ws.on('session', 'timer', onTimerLike);
		const offTick2 = ws.on('session', 'tick', onTimerLike);
		const offTimerUpdate2 = ws.on('session', 'timerupdate', onTimerLike);
		const offTimerUpdateSnake2 = ws.on('session', 'timer_update', onTimerLike);
		const onEnded = (data: unknown) => {
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
			clearLocalTimer();

		};
		const offEnded = ws.on('sessions', 'ended', onEnded);
		const offEnded2 = ws.on('session', 'ended', onEnded);

		return () => {
			offAny?.();
			offReq();
			offAccepted();
			offAccepted2();
			offRejected();
			offCancelled();
			offCanceled();
			offCancelled2();
			offCanceled2();
			offPrompt();
			offPrompt2();
			offReceived();
			offSync();
			offTimer();
			offTick();
			offTimerUpdate();
			offTimerUpdateSnake();
			offTimer2();
			offTick2();
			offTimerUpdate2();
			offTimerUpdateSnake2();
			offEnded();
			offEnded2();
			clearLocalTimer();
		};
	}, [ws, authState.user, state.active?.accepted?.request_id, state.active?.accepted?.kind, state.active?.accepted?.room_id, navigate, showToast]);

	// After reload, the backend may not re-push timer ticks. Use persisted minutes as a fallback.
	useEffect(() => {
		if (!wsConnected) return;
		const active = state.active?.accepted;
		if (!active) return;
		if (active.kind !== 'chat') return;
		const roomId = active.room_id;
		if (!roomId) return;
		if (state.endedRooms[roomId]) return;
		const mins = state.active?.minutes;
		if (!mins) return;
		// If we already have a timer for this room, don't override it.
		if (state.timer?.room_id === roomId && typeof state.timer.remaining_sec === 'number') return;
		startLocalTimer({ requestId: active.request_id, roomId, minutes: mins });
	}, [wsConnected, state.active?.accepted?.request_id, state.active?.minutes, state.timer?.room_id, state.endedRooms, startLocalTimer]);

	// Ensure a Messages row exists before join / global `chat|c` listener (unread needs a conversation row).
	useEffect(() => {
		const active = state.active?.accepted;
		if (active?.kind !== 'chat') return;
		const roomId = active.room_id;
		if (!roomId || state.endedRooms[roomId]) return;
		const me = authState.user;
		if (!me) return;

		// Do not overwrite an existing conversation row, otherwise unread/lastMessage can reset on sync/reconnect.
		if (chatState.conversations.some(c => c.id === roomId)) return;

		const creatorMeta = creatorMetaByRequestIdRef.current[active.request_id];
		const fanMeta = fanMetaByRequestIdRef.current[active.request_id];
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
	}, [
		state.active?.accepted?.request_id,
		state.active?.accepted?.kind,
		state.active?.accepted?.room_id,
		state.active?.otherDisplay,
		state.endedRooms,
		authState.user,
		chatState.conversations,
		addConversation,
	]);

	// When an accepted chat booking is active, keep the room joined so messages arrive
	// even if the user is on the Messages list (WhatsApp-like unread behavior).
	useEffect(() => {
		if (!wsConnected) return;
		const active = state.active?.accepted;
		if (active?.kind !== 'chat') return;
		ensureBookedRoomJoined(active.room_id);
	}, [wsConnected, state.active?.accepted?.request_id]);

	// Global chat listener for any joined room.
	// `chat|c` is only delivered for rooms that are currently joined; we join:
	// - active booked room via `ensureBookedRoomJoined`
	// - list rooms from `MessagesList`
	// This ensures WhatsApp-like unread + last message updates even when the thread is not open.
	useEffect(() => {
		if (!wsConnected) return;
		const off = ws.on('chat', 'c', data => {
			const dto = data as { id: string, room_id: string, user_id: string, body: string, created_at: string };
			const roomId = dto?.room_id ?? '';
			if (!roomId) return;
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

	// Live `sessions|accepted` (or acceptSession ack) can auto-open the thread; restore from `/state` never does.
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
			if (!roomId) return;

			const onThread = location.pathname === `/messages/${roomId}`;
			const pending = pendingOpenBookedChatRequestIdRef.current === active.request_id;
			if (pending) {
				pendingOpenBookedChatRequestIdRef.current = null;
				void navigate(`/messages/${roomId}`);
				return;
			}
			if (!onThread) {
				showToast('Chat session is still active. Open Messages to resume.');
			}
			return;
		}
		if (active.kind === 'call') {
			const pending = pendingOpenBookedCallRequestIdRef.current === active.request_id;
			if (pending) {
				pendingOpenBookedCallRequestIdRef.current = null;
				const uiCallType = state.active?.uiCallType ?? uiCallTypeByRequestIdRef.current[active.request_id] ?? 'video';
				void ensureMediaPermissions({ audio: true, video: uiCallType === 'video' })
					.catch(e => {
						if (isDeviceInUseError(e)) return;
						throw e;
					})
					.then(() => {
						void navigate('/call');
					})
					.catch(e => {
						showToast(e instanceof Error ? e.message : 'Unable to access microphone/camera', 'error');
					});

			}
			// Restore: `ActiveCallBanner` offers Continue / End; do not auto-open `/call`.

		}
	}, [
		state.active?.accepted?.request_id,
		state.active?.accepted?.kind,
		state.active?.uiCallType,
		authState.user,
		showToast,
		navigate,
		location.pathname,
	]);

	const initialPathRef = useRef<string>(location.pathname);
	const initialWasReloadRef = useRef<boolean>(isBrowserReloadNavigation());
	const didHandleInitialReloadBounceRef = useRef(false);
	useEffect(() => {
		// Only handle the reload-bounce once, and only based on the initial path at page load.
		// This prevents overriding fresh navigations (e.g. auto-open after `sessions|accepted`).
		if (!initialWasReloadRef.current) return;
		if (didHandleInitialReloadBounceRef.current) return;
		const act = state.active?.accepted;
		if (!act) {
			return;
		}
		const me = authState.user;
		if (!me) return;

		const reqId = act.request_id;
		if (pendingOpenBookedChatRequestIdRef.current === reqId || pendingOpenBookedCallRequestIdRef.current === reqId) {
			return;
		}

		const path = initialPathRef.current;
		const isDeepCall = act.kind === 'call' && path === '/call';
		const isDeepChat = act.kind === 'chat' && !!act.room_id && path === `/messages/${act.room_id}`;
		if (!isDeepCall && !isDeepChat) return;

		didHandleInitialReloadBounceRef.current = true;
		const home =
			me.role === 'admin' ? '/admin' :
			me.role === 'creator' ? '/creator-dashboard' :
			'/feed';
		void navigate(home, { replace: true });
	}, [
		state.active?.accepted?.request_id,
		state.active?.accepted?.kind,
		state.active?.accepted?.room_id,
		authState.user,
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
