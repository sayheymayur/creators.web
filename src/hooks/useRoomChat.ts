import { useCallback, useEffect, useRef, useState } from 'react';
import { useWsConnected, useWs } from '../context/WsContext';
import { getCreatorsMultiplexSingleton } from '../services/creatorsMultiplexWs';
import {
	chatGetMessages,
	chatJoinRoom,
	chatLeaveRoom,
	chatSendMsg,
	chatTyping,
} from '../services/chatWsService';
import type { ChatMessageDTO, ChatTypingEventPayload } from '../services/chatWsTypes';
import type { Message } from '../types';
import { isUuid } from '../utils/isUuid';

function mergeChatDTOs(cache: ChatMessageDTO[], page: ChatMessageDTO[]): ChatMessageDTO[] {
	const byId: Record<string, ChatMessageDTO> = {};
	for (const x of page) byId[x.id] = x;
	for (const x of cache) byId[x.id] = x;
	return Object.values(byId).sort(
		(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
	);
}

function dtoToMessage(
	dto: ChatMessageDTO,
	resolveParticipant: (userId: string) => { name: string, avatar: string }
): Message {
	const uid = dto.user_id;
	const { name, avatar } = resolveParticipant(uid);
	return {
		id: dto.id,
		conversationId: dto.room_id,
		senderId: uid,
		senderName: name,
		senderAvatar: avatar,
		content: dto.body,
		isPaid: false,
		isUnlocked: true,
		createdAt: dto.created_at,
		isSeen: false,
	};
}

export interface UseRoomChatParams {
	roomUuid: string | undefined;
	currentUserId: string;
	postsWsStatus: 'idle' | 'connecting' | 'ready' | 'error';
	getParticipantMeta: (userId: string) => { name: string, avatar: string };
	upsertRoomMessages: (conversationId: string, messages: Message[]) => void;
	addRoomMessage: (message: Message) => void;
	onProtocolError?: (message: string) => void;
	/** If true, uses `/sendmsg` ack response to immediately add the sender's message to UI. */
	sendWithAck?: boolean;
	/**
	 * Transport selection.
	 * - `multiplex`: uses CreatorsMultiplexWs (posts socket)
	 * - `ws`: uses WsClient (primary socket, same as sessions)
	 * - `auto`: uses `ws` when `sendWithAck` is true (booking chats), else multiplex
	 */
	transport?: 'auto' | 'multiplex' | 'ws';
}

export interface UseRoomChatResult {
	/** Other participant is typing (from `chat|typing`). */
	otherTyping: boolean;
	/** True when multiplex chat is active for this room. */
	realtimeActive: boolean;
	/** Call on input change (debounced typing indicator). */
	notifyTyping: (active: boolean) => void;
	/**
	 * Send text over WS (`/sendmsg`).
	 * - When `sendWithAck` is true, returns the acknowledged `ChatMessageDTO`.
	 * - When `sendWithAck` is false, returns `undefined` (delivery via `chat|newmessage`).
	 */
	sendRealtime: (text: string) => Promise<ChatMessageDTO | undefined>;
}

const TYPING_DEBOUNCE_MS = 400;

export function useRoomChat(params: UseRoomChatParams): UseRoomChatResult {
	const {
		roomUuid,
		currentUserId,
		postsWsStatus,
		getParticipantMeta,
		upsertRoomMessages,
		addRoomMessage,
		onProtocolError,
		sendWithAck = false,
		transport = 'auto',
	} = params;

	const ws = useWs();
	const wsConnected = useWsConnected();

	const [otherTyping, setOtherTyping] = useState(false);
	const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastTypingSentRef = useRef<boolean | null>(null);
	const roomRef = useRef(roomUuid);
	roomRef.current = roomUuid;

	const effectiveTransport: 'multiplex' | 'ws' =
		transport === 'auto' ? (sendWithAck ? 'ws' : 'multiplex') : transport;

	const realtimeActive =
		!!roomUuid &&
		isUuid(roomUuid) &&
		(effectiveTransport === 'ws' ? wsConnected : postsWsStatus === 'ready');

	const upsertRef = useRef(upsertRoomMessages);
	const addRef = useRef(addRoomMessage);
	const metaRef = useRef(getParticipantMeta);
	const userRef = useRef(currentUserId);
	upsertRef.current = upsertRoomMessages;
	addRef.current = addRoomMessage;
	metaRef.current = getParticipantMeta;
	userRef.current = currentUserId;

	useEffect(() => {
		if (!realtimeActive || !roomUuid) return;

		let cancelled = false;

		if (effectiveTransport === 'ws') {
			const offEv = ws.on('chat', 'newmessage', data => {
				if (cancelled || roomRef.current !== roomUuid) return;
				const dto = data as ChatMessageDTO;
				if (dto.room_id !== roomUuid) return;
				addRef.current(dtoToMessage(dto, metaRef.current));
			});
			const offTyping = ws.on('chat', 'typing', data => {
				if (cancelled || roomRef.current !== roomUuid) return;
				const pl = data as ChatTypingEventPayload;
				if (pl.room_id !== roomUuid || pl.user_id === userRef.current) return;
				setOtherTyping(pl.active);
				if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
				if (pl.active) {
					typingClearTimerRef.current = setTimeout(() => {
						setOtherTyping(false);
					}, 3000);
				}
			});

			void ws.request('chat', 'joinroom', [roomUuid])
				.then(() => ws.request('chat', 'getmessages', [roomUuid, '30']))
				.then(body => {
					if (cancelled || body == null) return;
					const b = body as { recentCache?: ChatMessageDTO[], page?: ChatMessageDTO[] };
					const merged = mergeChatDTOs(b.recentCache ?? [], b.page ?? []);
					const messages = merged.map(d => dtoToMessage(d, metaRef.current));
					upsertRef.current(roomUuid, messages);
				})
				.catch(e => {
					if (!cancelled) onProtocolError?.(e instanceof Error ? e.message : String(e));
				});

			return () => {
				cancelled = true;
				offEv();
				offTyping();
				if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
				if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
				if (wsConnected) {
					void ws.request('chat', 'leaveroom', [roomUuid]).catch(() => {});
				}
				lastTypingSentRef.current = null;
				setOtherTyping(false);
			};
		}

		const client = getCreatorsMultiplexSingleton();
		if (!client?.isOpen()) return;

		const unsubEv = client.subscribeChatEvents((event, payload) => {
			if (cancelled || roomRef.current !== roomUuid) return;
			if (event === 'newmessage') {
				const dto = payload as ChatMessageDTO;
				if (dto.room_id !== roomUuid) return;
				addRef.current(dtoToMessage(dto, metaRef.current));
				return;
			}
			if (event === 'typing') {
				const pl = payload as ChatTypingEventPayload;
				if (pl.room_id !== roomUuid || pl.user_id === userRef.current) return;
				setOtherTyping(pl.active);
				if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
				if (pl.active) {
					typingClearTimerRef.current = setTimeout(() => {
						setOtherTyping(false);
					}, 3000);
				}
			}
		});

		const unsubErr = client.subscribeChatOrphanErrors(msg => {
			if (cancelled) return;
			onProtocolError?.(msg);
		});

		void chatJoinRoom(client, roomUuid)
			.then(() => {
				if (cancelled) return null;
				return chatGetMessages(client, roomUuid, 30);
			})
			.then(body => {
				if (cancelled || body == null) return;
				const merged = mergeChatDTOs(body.recentCache ?? [], body.page ?? []);
				const messages = merged.map(d => dtoToMessage(d, metaRef.current));
				upsertRef.current(roomUuid, messages);
			})
			.catch(e => {
				if (!cancelled) {
					onProtocolError?.(e instanceof Error ? e.message : String(e));
				}
			});

		return () => {
			cancelled = true;
			unsubEv();
			unsubErr();
			if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
			if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
			const c = getCreatorsMultiplexSingleton();
			if (c?.isOpen()) {
				void chatLeaveRoom(c, roomUuid).catch(() => {});
			}
			lastTypingSentRef.current = null;
			setOtherTyping(false);
		};
	}, [realtimeActive, roomUuid, onProtocolError, effectiveTransport, ws, wsConnected]);

	const notifyTyping = useCallback(
		(active: boolean) => {
			if (!realtimeActive || !roomUuid) return;
			if (effectiveTransport === 'ws') {
				// fire-and-forget typing
				ws.send(`> chat\n/typing ${roomUuid}${active ? '' : ' 0'}\n`);
				return;
			}
			const client = getCreatorsMultiplexSingleton();
			if (!client?.isOpen()) return;

			if (active) {
				if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
				typingDebounceRef.current = setTimeout(() => {
					if (lastTypingSentRef.current !== true) {
						chatTyping(client, roomUuid, true);
						lastTypingSentRef.current = true;
					}
				}, TYPING_DEBOUNCE_MS);
			} else {
				if (typingDebounceRef.current) {
					clearTimeout(typingDebounceRef.current);
					typingDebounceRef.current = null;
				}
				if (lastTypingSentRef.current !== false) {
					chatTyping(client, roomUuid, false);
					lastTypingSentRef.current = false;
				}
			}
		},
		[realtimeActive, roomUuid, effectiveTransport, ws]
	);

	const sendRealtime = useCallback(
		(text: string): Promise<ChatMessageDTO | undefined> => {
			if (!realtimeActive || !roomUuid) return Promise.resolve(undefined);
			notifyTyping(false);
			if (effectiveTransport === 'ws') {
				// Spec expects an ack response for sendmsg.
				return ws.request('chat', 'sendmsg', [roomUuid, text]).then(json => {
					const body = json as { ok?: boolean, message?: ChatMessageDTO };
					return body?.message;
				});
			}
			const client = getCreatorsMultiplexSingleton();
			if (!client?.isOpen()) {
				return Promise.reject(new Error('Chat connection is not ready'));
			}
			if (sendWithAck) {
				return chatSendMsg(client, roomUuid, text, true).then(res => res?.message);
			}
			return chatSendMsg(client, roomUuid, text, false).then(() => undefined);
		},
		[realtimeActive, roomUuid, notifyTyping, sendWithAck, effectiveTransport, ws]
	);

	return { otherTyping, realtimeActive, notifyTyping, sendRealtime };
}
