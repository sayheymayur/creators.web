import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Notification } from '../types';
import { useAuth } from './AuthContext';
import { useWs, useWsConnected } from './WsContext';
import {
	notificationList,
	notificationRead,
	notificationReadAll,
	notificationUnread,
	notificationUnreadCount,
	type NotificationListResponse,
	type InAppNotificationRow,
} from '../services/notificationWsService';

interface ToastItem {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info' | 'warning';
}

interface NotificationState {
	notifications: Notification[];
	toasts: ToastItem[];
	unreadCount: number;
	nextCursor: string | null;
	status: 'idle' | 'loading' | 'ready' | 'error';
	error?: string;
}

type NotificationAction =
	| { type: 'UPSERT_TOP', payload: Notification }
	| { type: 'SET_PAGE', payload: { notifications: Notification[], nextCursor: string | null, replace: boolean } }
	| { type: 'SET_UNREAD_COUNT', payload: number }
	| { type: 'MARK_READ_LOCAL', payload: { id: string, readAt: string } }
	| { type: 'MARK_UNREAD_LOCAL', payload: { id: string } }
	| { type: 'MARK_ALL_READ_LOCAL', payload: { readAt: string } }
	| { type: 'SET_STATUS', payload: { status: NotificationState['status'], error?: string } }
	{ type: 'ADD_TOAST', payload: ToastItem } |
	{ type: 'REMOVE_TOAST', payload: string };

const initialState: NotificationState = {
	notifications: [],
	toasts: [],
	unreadCount: 0,
	nextCursor: null,
	status: 'idle',
};

function isUnread(n: Notification): boolean {
	return n.read_at == null;
}

function normalizeRow(row: InAppNotificationRow): Notification {
	return {
		id: String(row.id),
		title: String(row.title ?? ''),
		body: row.body == null ? null : String(row.body),
		data: (row.data ?? {}) as Record<string, unknown>,
		created_at: String(row.created_at),
		read_at: row.read_at == null ? null : String(row.read_at),
	};
}

function mergeUnique(existing: Notification[], incoming: Notification[]): Notification[] {
	const next = [...existing];
	const seen = new Set(existing.map(n => n.id));
	for (const n of incoming) {
		if (!seen.has(n.id)) {
			seen.add(n.id);
			next.push(n);
		}
	}
	return next;
}

function notificationReducer(state: NotificationState, action: NotificationAction): NotificationState {
	switch (action.type) {
		case 'UPSERT_TOP': {
			const incoming = action.payload;
			const existingIdx = state.notifications.findIndex(n => n.id === incoming.id);
			const existing = existingIdx === -1 ? undefined : state.notifications[existingIdx];
			const nextList = existingIdx === -1 ?
				[incoming, ...state.notifications] :
				[
					incoming,
					...state.notifications.slice(0, existingIdx),
					...state.notifications.slice(existingIdx + 1),
				];
			let unreadCount = state.unreadCount;
			if (!existing && isUnread(incoming)) unreadCount += 1;
			if (existing && isUnread(existing) && !isUnread(incoming)) unreadCount = Math.max(0, unreadCount - 1);
			if (existing && !isUnread(existing) && isUnread(incoming)) unreadCount += 1;
			return { ...state, notifications: nextList, unreadCount };
		}
		case 'SET_PAGE': {
			const nextList = action.payload.replace ?
				action.payload.notifications :
				mergeUnique(state.notifications, action.payload.notifications);
			// Keep unread count authoritative from server (unreadcount), but best-effort fallback.
			const fallbackUnread = nextList.reduce((acc, n) => acc + (isUnread(n) ? 1 : 0), 0);
			return {
				...state,
				notifications: nextList,
				nextCursor: action.payload.nextCursor,
				unreadCount: state.unreadCount || fallbackUnread,
			};
		}
		case 'SET_UNREAD_COUNT':
			return { ...state, unreadCount: Math.max(0, Math.floor(action.payload)) };
		case 'MARK_READ_LOCAL': {
			const { id, readAt } = action.payload;
			let unreadCount = state.unreadCount;
			const nextList = state.notifications.map(n => {
				if (n.id !== id) return n;
				if (isUnread(n)) unreadCount = Math.max(0, unreadCount - 1);
				return { ...n, read_at: readAt };
			});
			return { ...state, notifications: nextList, unreadCount };
		}
		case 'MARK_UNREAD_LOCAL': {
			const { id } = action.payload;
			let unreadCount = state.unreadCount;
			const nextList = state.notifications.map(n => {
				if (n.id !== id) return n;
				if (!isUnread(n)) unreadCount += 1;
				return { ...n, read_at: null };
			});
			return { ...state, notifications: nextList, unreadCount };
		}
		case 'MARK_ALL_READ_LOCAL': {
			const { readAt } = action.payload;
			return {
				...state,
				notifications: state.notifications.map(n => (isUnread(n) ? { ...n, read_at: readAt } : n)),
				unreadCount: 0,
			};
		}
		case 'SET_STATUS':
			return { ...state, status: action.payload.status, error: action.payload.error };
		case 'ADD_TOAST':
			return { ...state, toasts: [...state.toasts, action.payload] };
		case 'REMOVE_TOAST':
			return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
		default:
			return state;
	}
}

interface NotificationContextValue {
	state: NotificationState;
	addNotification: (notification: Notification) => void;
	markRead: (id: string) => void;
	markUnread: (id: string) => void;
	markAllRead: () => void;
	refresh: (opts?: { unreadOnly?: boolean }) => Promise<void>;
	loadMore: () => Promise<void>;
	showToast: (message: string, type?: ToastItem['type']) => void;
	getUserNotifications: (userId: string) => Notification[];
	getUnreadCount: (userId: string) => number;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(notificationReducer, initialState);
	const { state: authState } = useAuth();
	const ws = useWs();
	const wsConnected = useWsConnected();
	const userId = authState.user?.id ?? null;
	const fetchSeqRef = useRef(0);

	const addNotification = useCallback((notification: Notification) => {
		dispatch({ type: 'UPSERT_TOP', payload: notification });
	}, []);

	const markRead = useCallback((id: string) => {
		const now = new Date().toISOString();
		dispatch({ type: 'MARK_READ_LOCAL', payload: { id, readAt: now } });
		void notificationRead(ws, { notificationId: id }).then(
			() => {
				void notificationUnreadCount(ws).then(r => dispatch({ type: 'SET_UNREAD_COUNT', payload: r.unread_count })).catch(() => {});
			},
			() => {
				// If backend rejects, fall back to reloading the unread count.
				void notificationUnreadCount(ws).then(r => dispatch({ type: 'SET_UNREAD_COUNT', payload: r.unread_count })).catch(() => {});
			}
		);
	}, [ws]);

	const markUnread = useCallback((id: string) => {
		dispatch({ type: 'MARK_UNREAD_LOCAL', payload: { id } });
		void notificationUnread(ws, { notificationId: id }).then(
			() => {
				void notificationUnreadCount(ws).then(r => dispatch({ type: 'SET_UNREAD_COUNT', payload: r.unread_count })).catch(() => {});
			},
			() => {
				void notificationUnreadCount(ws).then(r => dispatch({ type: 'SET_UNREAD_COUNT', payload: r.unread_count })).catch(() => {});
			}
		);
	}, [ws]);

	const markAllRead = useCallback(() => {
		const now = new Date().toISOString();
		dispatch({ type: 'MARK_ALL_READ_LOCAL', payload: { readAt: now } });
		void notificationReadAll(ws).then(
			() => dispatch({ type: 'SET_UNREAD_COUNT', payload: 0 }),
			() => {
				void notificationUnreadCount(ws).then(r => dispatch({ type: 'SET_UNREAD_COUNT', payload: r.unread_count })).catch(() => {});
			}
		);
	}, [ws]);

	const showToast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
		const id = `toast-${Date.now()}`;
		dispatch({ type: 'ADD_TOAST', payload: { id, message, type } });
		setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 4000);
	}, []);

	const getUserNotifications = useCallback((userId: string) => {
		// Notifications are scoped server-side to the authenticated socket user.
		// Keep the param to avoid refactors across the UI.
		void userId;
		return state.notifications;
	}, [state.notifications]);

	const getUnreadCount = useCallback((userId: string) => {
		void userId;
		return state.unreadCount;
	}, [state.unreadCount]);

	const applyListResponse = useCallback((res: NotificationListResponse, replace: boolean) => {
		const page = (res.notifications ?? []).map(normalizeRow);
		dispatch({ type: 'SET_PAGE', payload: { notifications: page, nextCursor: res.next_cursor ?? null, replace } });
	}, []);

	const refresh = useCallback(async (opts?: { unreadOnly?: boolean }) => {
		if (!wsConnected || !userId) return;
		fetchSeqRef.current += 1;
		const seq = fetchSeqRef.current;
		dispatch({ type: 'SET_STATUS', payload: { status: 'loading' } });
		try {
			const [countRes, listRes] = await Promise.all([
				notificationUnreadCount(ws),
				notificationList(ws, { unreadOnly: opts?.unreadOnly, limit: 30 }),
			]);
			if (seq !== fetchSeqRef.current) return;
			dispatch({ type: 'SET_UNREAD_COUNT', payload: countRes.unread_count });
			applyListResponse(listRes, true);
			dispatch({ type: 'SET_STATUS', payload: { status: 'ready' } });
		} catch (e) {
			if (seq !== fetchSeqRef.current) return;
			const msg = e instanceof Error ? e.message : 'Failed to load notifications';
			dispatch({ type: 'SET_STATUS', payload: { status: 'error', error: msg } });
		}
	}, [applyListResponse, userId, ws, wsConnected]);

	const loadMore = useCallback(async () => {
		if (!wsConnected || !userId) return;
		const cursor = state.nextCursor;
		if (!cursor) return;
		try {
			const res = await notificationList(ws, { limit: 30, beforeCursor: cursor });
			applyListResponse(res, false);
		} catch {
			// ignore pagination failures
		}
	}, [applyListResponse, state.nextCursor, userId, ws, wsConnected]);

	// Initial load + reload on login / reconnect.
	useEffect(() => {
		if (!userId || !wsConnected) return;
		void refresh({ unreadOnly: true });
	}, [refresh, userId, wsConnected]);

	// Push events: |notification|new|{...}
	useEffect(() => {
		if (!userId) return;
		const off = ws.on('notification', 'new', data => {
			const row = data as Partial<InAppNotificationRow>;
			if (!row || row.id == null) return;
			const normalized = normalizeRow({
				id: String(row.id),
				title: String(row.title ?? ''),
				body: row.body == null ? null : String(row.body),
				data: (row.data ?? {}) as Record<string, unknown>,
				created_at: String(row.created_at ?? new Date().toISOString()),
				read_at: row.read_at == null ? null : String(row.read_at),
			});
			dispatch({ type: 'UPSERT_TOP', payload: normalized });
		});
		return off;
	}, [userId, ws]);

	const value = useMemo<NotificationContextValue>(() => ({
		state,
		addNotification,
		markRead,
		markUnread,
		markAllRead,
		refresh,
		loadMore,
		showToast,
		getUserNotifications,
		getUnreadCount,
	}), [
		state,
		addNotification,
		markRead,
		markUnread,
		markAllRead,
		refresh,
		loadMore,
		showToast,
		getUserNotifications,
		getUnreadCount,
	]);

	return (
		<NotificationContext.Provider value={value}>
			{children}
		</NotificationContext.Provider>
	);
}

export function useNotifications() {
	const ctx = useContext(NotificationContext);
	if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
	return ctx;
}
