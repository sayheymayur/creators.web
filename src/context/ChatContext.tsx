import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import type { Conversation, Message } from '../types';
import { getStoredUser } from '../services/sessionUser';

interface ChatState {
	conversations: Conversation[];
	messages: Record<string, Message[]>;
	activeConversationId: string | null;
}

type ChatAction =
	| { type: 'SEND_MESSAGE', payload: Message } |
	{ type: 'UNLOCK_MESSAGE', payload: { messageId: string, conversationId: string } } |
	{ type: 'MARK_READ', payload: string } |
	{ type: 'MARK_SEEN_UP_TO', payload: { conversationId: string, lastMessageId: string } } |
	{ type: 'SET_ACTIVE', payload: string | null } |
	{ type: 'ADD_CONVERSATION', payload: Conversation } |
	{ type: 'UPSERT_ROOM_MESSAGES', payload: { conversationId: string, messages: Message[] } } |
	{ type: 'ADD_ROOM_MESSAGE', payload: { message: Message, selfUserId: string } } |
	{ type: 'REPLACE_MESSAGE', payload: { conversationId: string, localId: string, message: Message } } |
	{ type: 'UPDATE_MESSAGE', payload: { conversationId: string, id: string, patch: Partial<Message> } } |
	{ type: 'HYDRATE', payload: ChatState };

const STORAGE_KEY = 'cw.chat.v1';

function safeParseJson<T>(raw: string | null): T | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function loadInitialChatState(): ChatState {
	if (typeof window === 'undefined') {
		return { conversations: [], messages: {}, activeConversationId: null };
	}
	const stored = safeParseJson<ChatState>(window.localStorage.getItem(STORAGE_KEY));
	if (!stored || !Array.isArray(stored.conversations) || typeof stored.messages !== 'object') {
		return { conversations: [], messages: {}, activeConversationId: null };
	}
	// Dedupe conversations by id to avoid repeated "Resume session" inserts across reloads.
	const byId: Record<string, Conversation> = {};
	for (const c of stored.conversations) {
		if (!c?.id) continue;
		byId[c.id] = c;
	}
	const conversations = Object.values(byId).sort(
		(a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
	);
	return {
		conversations,
		messages: stored.messages,
		activeConversationId: stored.activeConversationId ?? null,
	};
}

const initialState: ChatState = loadInitialChatState();

function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case 'HYDRATE':
			return action.payload;
		case 'SEND_MESSAGE': {
			const convId = action.payload.conversationId;
			const existing = state.messages[convId] ?? [];
			return {
				...state,
				messages: { ...state.messages, [convId]: [...existing, action.payload] },
				conversations: state.conversations.map(c =>
					c.id === convId ?
						{ ...c, lastMessage: action.payload.content, lastMessageTime: action.payload.createdAt } :
						c
				),
			};
		}
		case 'UNLOCK_MESSAGE': {
			const { messageId, conversationId } = action.payload;
			return {
				...state,
				messages: {
					...state.messages,
					[conversationId]: (state.messages[conversationId] ?? []).map(m =>
						m.id === messageId ? { ...m, isUnlocked: true } : m
					),
				},
			};
		}
		case 'MARK_READ': {
			return {
				...state,
				conversations: state.conversations.map(c =>
					c.id === action.payload ? { ...c, unreadCount: 0 } : c
				),
			};
		}
		case 'MARK_SEEN_UP_TO': {
			const { conversationId, lastMessageId } = action.payload;
			const existing = state.messages[conversationId] ?? [];
			const isNumeric = (v: string) => /^\d+$/.test(v);
			const next =
				isNumeric(lastMessageId) ?
					(() => {
						const cutoff = Number(lastMessageId);
						return existing.map(m => {
							if (!isNumeric(m.id)) return m;
							return Number(m.id) <= cutoff ? { ...m, isSeen: true } : m;
						});
					})() :
					(() => {
						const idx = existing.findIndex(m => m.id === lastMessageId);
						if (idx === -1) return existing;
						return existing.map((m, i) => (i <= idx ? { ...m, isSeen: true } : m));
					})();
			return { ...state, messages: { ...state.messages, [conversationId]: next } };
		}
		case 'SET_ACTIVE':
			return { ...state, activeConversationId: action.payload };
		case 'ADD_CONVERSATION':
			// Upsert by id (avoid duplicates on reconnect / restore).
			if (state.conversations.some(c => c.id === action.payload.id)) {
				return {
					...state,
					conversations: state.conversations.map(c => (c.id === action.payload.id ? { ...c, ...action.payload } : c)),
				};
			}
			return {
				...state,
				conversations: [action.payload, ...state.conversations],
				messages: { ...state.messages, [action.payload.id]: state.messages[action.payload.id] ?? [] },
			};
		case 'UPSERT_ROOM_MESSAGES': {
			const { conversationId, messages: incoming } = action.payload;
			const existing = state.messages[conversationId] ?? [];
			const byId: Record<string, Message> = {};
			for (const m of existing) byId[m.id] = m;
			for (const m of incoming) {
				const prev = byId[m.id];
				byId[m.id] = prev ? { ...m, isSeen: prev.isSeen } : m;
			}
			const merged = Object.values(byId).sort(
				(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
			);
			return {
				...state,
				messages: { ...state.messages, [conversationId]: merged },
			};
		}
		case 'ADD_ROOM_MESSAGE': {
			const m = action.payload.message;
			const convId = m.conversationId;
			const existing = state.messages[convId] ?? [];
			if (existing.some(x => x.id === m.id)) return state;
			const shouldIncrementUnread =
				state.activeConversationId !== convId &&
				m.senderId !== action.payload.selfUserId;
			return {
				...state,
				messages: { ...state.messages, [convId]: [...existing, m] },
				conversations: state.conversations.map(c =>
					c.id === convId ?
						{
							...c,
							lastMessage: m.content,
							lastMessageTime: m.createdAt,
							unreadCount: shouldIncrementUnread ? (c.unreadCount ?? 0) + 1 : c.unreadCount,
						} :
						c
				),
			};
		}
		case 'REPLACE_MESSAGE': {
			const { conversationId, localId, message } = action.payload;
			const existing = state.messages[conversationId] ?? [];
			const next = existing.map(m => (m.id === localId ? message : m));
			const hasLocal = existing.some(m => m.id === localId);
			const finalList = hasLocal ? next : [...existing, message];
			// If a realtime broadcast already inserted the server message id before the ack,
			// de-duplicate by id after replacement.
			const dedupById: Record<string, Message> = {};
			for (const m of finalList) dedupById[m.id] = m;
			const merged = Object.values(dedupById).sort(
				(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
			);
			return {
				...state,
				messages: { ...state.messages, [conversationId]: merged },
				conversations: state.conversations.map(c =>
					c.id === conversationId ?
						{ ...c, lastMessage: message.content, lastMessageTime: message.createdAt } :
						c
				),
			};
		}
		case 'UPDATE_MESSAGE': {
			const { conversationId, id, patch } = action.payload;
			const existing = state.messages[conversationId] ?? [];
			if (!existing.some(m => m.id === id)) return state;
			const next = existing.map(m => (m.id === id ? { ...m, ...patch } : m));
			return { ...state, messages: { ...state.messages, [conversationId]: next } };
		}
		default:
			return state;
	}
}

interface ChatContextValue {
	state: ChatState;
	sendMessage: (message: Message) => void;
	unlockMessage: (messageId: string, conversationId: string) => void;
	markRead: (conversationId: string) => void;
	markSeenUpTo: (conversationId: string, lastMessageId: string) => void;
	setActive: (conversationId: string | null) => void;
	addConversation: (conv: Conversation) => void;
	/** Merge/replace messages by id (e.g. WebSocket `/getmessages`). */
	upsertRoomMessages: (conversationId: string, messages: Message[]) => void;
	/** Append one message if id is new (e.g. `chat|c`). */
	addRoomMessage: (message: Message) => void;
	/** Replace a local optimistic message with the server-acknowledged message. */
	replaceMessage: (conversationId: string, localId: string, message: Message) => void;
	/** Patch message properties (e.g. mark `sendStatus: 'failed'`). */
	updateMessage: (conversationId: string, id: string, patch: Partial<Message>) => void;
	getConversationForUser: (userId: string) => Conversation | null;
	totalUnread: number;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(chatReducer, initialState);

	// Persist chat state across reloads (keeps recent chats + messages).
	useEffect(() => {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} catch {
			// ignore storage failures (quota/private mode)
		}
	}, [state]);

	const sendMessage = useCallback((message: Message) => {
		dispatch({ type: 'SEND_MESSAGE', payload: message });
	}, []);

	const unlockMessage = useCallback((messageId: string, conversationId: string) => {
		dispatch({ type: 'UNLOCK_MESSAGE', payload: { messageId, conversationId } });
	}, []);

	const markRead = useCallback((conversationId: string) => {
		dispatch({ type: 'MARK_READ', payload: conversationId });
	}, []);

	const markSeenUpTo = useCallback((conversationId: string, lastMessageId: string) => {
		dispatch({ type: 'MARK_SEEN_UP_TO', payload: { conversationId, lastMessageId } });
	}, []);

	const setActive = useCallback((conversationId: string | null) => {
		dispatch({ type: 'SET_ACTIVE', payload: conversationId });
	}, []);

	const addConversation = useCallback((conv: Conversation) => {
		dispatch({ type: 'ADD_CONVERSATION', payload: conv });
	}, []);

	const upsertRoomMessages = useCallback((conversationId: string, messages: Message[]) => {
		dispatch({ type: 'UPSERT_ROOM_MESSAGES', payload: { conversationId, messages } });
	}, []);

	const addRoomMessage = useCallback((message: Message) => {
		const selfUserId = getStoredUser()?.id ?? '';
		dispatch({ type: 'ADD_ROOM_MESSAGE', payload: { message, selfUserId } });
	}, []);

	const replaceMessage = useCallback((conversationId: string, localId: string, message: Message) => {
		dispatch({ type: 'REPLACE_MESSAGE', payload: { conversationId, localId, message } });
	}, []);

	const updateMessage = useCallback((conversationId: string, id: string, patch: Partial<Message>) => {
		dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId, id, patch } });
	}, []);

	const getConversationForUser = useCallback((userId: string) => {
		return state.conversations.find(c => c.participantIds.includes(userId)) ?? null;
	}, [state.conversations]);

	const totalUnread = state.conversations.reduce((sum, c) => sum + c.unreadCount, 0);

	const value = useMemo(() => ({
		state, sendMessage, unlockMessage, markRead,
		markSeenUpTo, setActive, addConversation, upsertRoomMessages, addRoomMessage,
		replaceMessage, updateMessage, getConversationForUser, totalUnread,
	}), [
		state,
		sendMessage,
		unlockMessage,
		markRead,
		markSeenUpTo,
		setActive,
		addConversation,
		upsertRoomMessages,
		addRoomMessage,
		replaceMessage,
		updateMessage,
		getConversationForUser,
		totalUnread,
	]);

	return (
		<ChatContext.Provider value={value}>
			{children}
		</ChatContext.Provider>
	);
}

export function useChat() {
	const ctx = useContext(ChatContext);
	if (!ctx) throw new Error('useChat must be used within ChatProvider');
	return ctx;
}
