import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Image as ImageIcon, Zap, Lock, Unlock, Phone, Video } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useContent } from '../../context/ContentContext';
import { useWallet } from '../../context/WalletContext';
import { useNotifications } from '../../context/NotificationContext';
import { useCall } from '../../context/CallContext';
import { useSessions } from '../../context/SessionsContext';
import { Avatar } from '../../components/ui/Avatar';
import { TipModal } from '../../components/modals/TipModal';
import { formatDistanceToNow } from '../../utils/date';
import type { Message } from '../../types';
import { ToastContainer } from '../../components/ui/Toast';
import { Navbar } from '../../components/layout/Navbar';
import { useRoomChat } from '../../hooks/useRoomChat';
import { formatINR } from '../../services/razorpay';
import { SessionFeedbackModal } from '../../components/session/SessionFeedbackModal';
import { ReportTargetModal } from '../../components/modals/ReportTargetModal';
import { isUuid } from '../../utils/isUuid';

function formatRemaining(sec: number): string {
	if (!Number.isFinite(sec)) return '—';
	const s = Math.max(0, Math.floor(sec));
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${String(r).padStart(2, '0')}`;
}

function WhatsAppSingleTick({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M3 8.5l2.2 2.2L13 3.8"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function WhatsAppDoubleTick({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 18 16"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M1.2 8.6l2.1 2.1L10.1 3.9"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
				opacity="0.85"
			/>
			<path
				d="M7.3 10.7l2-2L16.8 1.2"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function ChatRoom() {
	const { id: convId } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { state: authState } = useAuth();
	const {
		state: chatState,
		sendMessage,
		markRead,
		markSeenUpTo,
		setActive,
		unlockMessage,
		upsertRoomMessages,
		addRoomMessage,
		replaceMessage,
		updateMessage,
	} = useChat();
	const { state: contentState } = useContent();
	const { deductFunds } = useWallet();
	const { showToast } = useNotifications();
	const { startCall } = useCall();
	const { state: sessionsState, completeSession: completeBookedSession } = useSessions();
	const [text, setText] = useState('');
	const [showTipModal, setShowTipModal] = useState(false);
	const [reportMessageId, setReportMessageId] = useState<string | null>(null);
	const [realtimeSending, setRealtimeSending] = useState(false);
	const [otherInRoom, setOtherInRoom] = useState(false);
	const [nowMs, setNowMs] = useState(() => Date.now());
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const replyIdxRef = useRef(0);
	const lastSendRef = useRef<{ at: number, roomId: string, text: string } | null>(null);

	const conv = chatState.conversations.find(c => c.id === convId);
	const messages = convId ? (chatState.messages[convId] ?? []) : [];
	const userId = authState.user?.id ?? '';

	const getParticipantMeta = useCallback(
		(uid: string) => {
			if (!conv) return { name: 'User', avatar: '' };
			const idx = conv.participantIds.indexOf(uid);
			if (idx === -1) return { name: 'User', avatar: '' };
			return {
				name: conv.participantNames[idx] ?? 'User',
				avatar: conv.participantAvatars[idx] ?? '',
			};
		},
		[conv]
	);

	const onProtocolError = useCallback(
		(msg: string) => {
			showToast(msg, 'error');
		},
		[showToast]
	);

	const onPresenceEvent = useCallback(
		(ev: { type: 'join' | 'leave', user_id?: string }) => {
			// De-spam join/leave toasts (some backends emit on reconnect; StrictMode dev can also re-run effects).
			const key = `${ev.type}:${ev.user_id ?? ''}`;
			const now = Date.now();
			const last = (globalThis as unknown as { __cw_presence_toast?: { key: string, at: number } })?.__cw_presence_toast;
			if (last?.key === key && now - (last.at ?? 0) < 1500) return;
			(globalThis as unknown as { __cw_presence_toast?: { key: string, at: number } }).__cw_presence_toast = { key, at: now };

			// Track other participant presence for WhatsApp-style delivery ticks.
			const otherIdxLocal = conv?.participantIds?.indexOf(userId) === 0 ? 1 : 0;
			const otherIdLocal = conv?.participantIds?.[otherIdxLocal] ?? '';
			if (otherIdLocal && ev.user_id === otherIdLocal) {
				setOtherInRoom(ev.type === 'join');
			}
			if (ev.type === 'join') showToast('User joined the session');
			if (ev.type === 'leave') showToast('User left the session');
		},
		[showToast, conv, userId]
	);

	const roomId = convId ?? '';

	const onSeenEvent = useCallback(
		(payload: { last_message_id: string }) => {
			// When the other user reports they saw up to X, mark my sent messages as seen up to that id.
			markSeenUpTo(roomId, payload.last_message_id);
		},
		[markSeenUpTo, roomId]
	);
	const activeChatBooking =
		sessionsState.active?.accepted.kind === 'chat' && sessionsState.active.accepted.room_id === roomId ?
			sessionsState.active.accepted :
			null;
	const endedChatBooking =
		sessionsState.ended?.room_id === roomId ?
			sessionsState.ended :
			(sessionsState.endedRooms?.[roomId] ?? null);
	const timerForRoom =
		sessionsState.timer?.room_id === roomId ?
			sessionsState.timer :
			null;
	const activeCallBookingSameRoom =
		sessionsState.active?.accepted.kind === 'call' && sessionsState.active.accepted.room_id === roomId;
	// If we have a timer tick for this room, it implies an accepted active booking even if `/state`
	// didn't hydrate `active` yet (common right after reload). Timers also run for call bookings;
	// do not treat timer alone as "booked chat" when this room is the active call.
	const isBookedActive =
		(!!activeChatBooking || (!!timerForRoom && !activeCallBookingSameRoom)) && !endedChatBooking;
	const activeRequestId = activeChatBooking?.request_id ?? timerForRoom?.request_id ?? null;
	const isBookedChatRoom = isBookedActive || !!endedChatBooking;
	const canSendBookedChat = !isBookedChatRoom || isBookedActive;

	useEffect(() => {
		if (!isBookedActive) return;
		const t = window.setInterval(() => setNowMs(Date.now()), 1000);
		return () => window.clearInterval(t);
	}, [isBookedActive]);

	const { otherTyping, realtimeActive, notifyTyping, sendRealtime, sendSeen } = useRoomChat({
		// For booked chats, the route param is the sessions room_id. After reload the conversation
		// may not be hydrated yet; still join the room using the UUID route param.
		roomUuid: convId && isUuid(convId) ? convId : undefined,
		currentUserId: userId,
		postsWsStatus: contentState.postsWsStatus,
		getParticipantMeta,
		upsertRoomMessages,
		addRoomMessage,
		onPresenceEvent,
		onSeenEvent,
		onProtocolError,
		sendWithAck: isBookedActive,
		transport: isBookedActive ? 'ws' : 'multiplex',
	});

	useEffect(() => {
		if (convId) markRead(convId);
	}, [convId, markRead]);

	useEffect(() => {
		if (!convId) return;
		setActive(convId);
		return () => {
			setActive(null);
		};
	}, [convId, setActive]);

	const lastSeenSentAtRef = useRef(0);
	const lastSeenMsgIdRef = useRef<string | null>(null);

	useEffect(() => {
		// Auto-send seen for the latest message from the other user (throttled).
		if (!realtimeActive || !convId) return;
		const otherIdxLocal = conv?.participantIds?.indexOf(userId) === 0 ? 1 : 0;
		const otherIdLocal = conv?.participantIds?.[otherIdxLocal] ?? '';
		if (!otherIdLocal) return;
		const latestFromOther = [...messages].reverse().find(m => m.senderId === otherIdLocal && /^\d+$/.test(m.id));
		const mid = latestFromOther?.id;
		if (!mid) return;
		const now = Date.now();
		if (lastSeenMsgIdRef.current === mid) return;
		if (now - lastSeenSentAtRef.current < 1200) return;
		lastSeenSentAtRef.current = now;
		lastSeenMsgIdRef.current = mid;
		sendSeen(mid);
	}, [realtimeActive, convId, conv, messages, userId, sendSeen]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	if (!convId) {
		return (
			<div className="min-h-screen bg-background text-foreground flex items-center justify-center">
				<p className="text-muted">Conversation not found</p>
			</div>
		);
	}

	// Booking-derived chat rooms: disable sending after `sessions|ended`.
	// `roomId` and booking state are computed above so the hook call remains unconditional.

	const otherIdx = conv?.participantIds?.indexOf(userId) === 0 ? 1 : 0;
	const otherName = conv?.participantNames?.[otherIdx] ?? sessionsState.active?.otherDisplay?.name ?? 'User';
	const otherAvatar = conv?.participantAvatars?.[otherIdx] ?? sessionsState.active?.otherDisplay?.avatar ?? '';
	const otherId = conv?.participantIds?.[otherIdx] ?? '';
	const otherIsOnline = conv?.isOnline ?? false;

	const replies = [
		'Thank you for the message.',
		'I appreciate the feedback. New content is planned.',
		'Thanks for the support. Let me know if you have any requests.',
		'I appreciate you being here.',
		'That took some time to prepare, glad you noticed.',
	];
	function getAutoReply() {
		const reply = replies[replyIdxRef.current % replies.length];
		replyIdxRef.current++;
		return reply;
	}

	function handleSend(e: React.FormEvent) {
		e.preventDefault();
		if (!text.trim() || !authState.user) return;
		const trimmed = text.trim();

		if (isBookedChatRoom && !isBookedActive) {
			showToast('Session ended. You can’t send more messages.', 'error');
			return;
		}

		if (realtimeActive) {
			// Guard against accidental double-submit (e.g. mobile enter+tap, focus glitches).
			const now = Date.now();
			const last = lastSendRef.current;
			const isDuplicate =
				last?.roomId === roomId &&
				last.text === trimmed &&
				now - last.at < 800;
			if (realtimeSending || isDuplicate) {
				return;
			}
			lastSendRef.current = { at: now, roomId, text: trimmed };
			setRealtimeSending(true);

			const localId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
			const optimistic: Message = {
				id: localId,
				conversationId: roomId,
				senderId: userId,
				senderName: authState.user.name,
				senderAvatar: authState.user.avatar,
				content: trimmed,
				isPaid: false,
				isUnlocked: true,
				createdAt: new Date().toISOString(),
				isSeen: false,
				sendStatus: 'sending',
			};
			sendMessage(optimistic);
			setText('');

			void sendRealtime(trimmed)
				.then(dto => {
					if (!dto) {
						// fire-and-forget mode; delivery is via `chat|c`
						updateMessage(roomId, localId, { sendStatus: 'sent' });
						return;
					}
					const serverMsg: Message = {
						id: dto.id,
						conversationId: dto.room_id,
						senderId: dto.user_id,
						senderName: authState.user?.name ?? 'You',
						senderAvatar: authState.user?.avatar ?? '',
						content: dto.body,
						isPaid: false,
						isUnlocked: true,
						createdAt: dto.created_at,
						isSeen: false,
						sendStatus: 'sent',
					};
					replaceMessage(roomId, localId, serverMsg);
				})
				.catch(err => {
					updateMessage(roomId, localId, { sendStatus: 'failed' });
					showToast(err instanceof Error ? err.message : 'Send failed', 'error');
				})
				.finally(() => {
					setRealtimeSending(false);
				});
			return;
		}

		const msg: Message = {
			id: `msg-${Date.now()}`,
			conversationId: roomId,
			senderId: userId,
			senderName: authState.user.name,
			senderAvatar: authState.user.avatar,
			content: trimmed,
			isPaid: false,
			isUnlocked: true,
			createdAt: new Date().toISOString(),
			isSeen: false,
		};
		sendMessage(msg);
		setText('');

		setTimeout(() => {
			const reply: Message = {
				id: `msg-${Date.now()}-reply`,
				conversationId: roomId,
				senderId: otherId,
				senderName: otherName,
				senderAvatar: otherAvatar,
				content: getAutoReply(),
				isPaid: false,
				isUnlocked: true,
				createdAt: new Date().toISOString(),
				isSeen: false,
			};
			sendMessage(reply);
		}, 1500);
	}

	function handleUnlockMessage(msg: Message) {
		if (!msg.price) return;
		const ok = deductFunds(msg.price, 'ppv', `Unlock message from ${otherName}`, otherId, otherName);
		if (ok) {
			unlockMessage(msg.id, roomId);
			showToast('Message unlocked!');
		} else {
			showToast('Insufficient balance', 'error');
		}
	}

	const statusLine =
		otherTyping ?
			'typing…' :
			(otherInRoom ? 'Active now' : (otherIsOnline ? 'Online now' : 'Offline'));

	const remainingLabel =
		isBookedActive ?
			(() => {
				const endsAt = timerForRoom?.ends_at;
				if (endsAt) {
					const endsAtMs = new Date(endsAt).getTime();
					if (Number.isFinite(endsAtMs)) {
						const rem = Math.max(0, Math.floor((endsAtMs - nowMs) / 1000));
						return formatRemaining(rem);
					}
				}
				return formatRemaining(timerForRoom?.remaining_sec ?? Number.NaN);
			})() :
			null;

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col">
			<Navbar />
			<ToastContainer />

			<div className="fixed top-14 left-0 right-0 z-30 bg-background/90 backdrop-blur-xl border-b border-border/10">
				<div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
					<button
						type="button"
						onClick={() => {
							void navigate(-1);
						}}
						className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors"
					>
						<ArrowLeft className="w-5 h-5 text-muted" />
					</button>
					<Avatar src={otherAvatar} alt={otherName} size="md" isOnline={otherIsOnline} />
					<div>
						<p className="text-sm font-semibold text-foreground">{otherName}</p>
						<p className="text-xs text-muted">{statusLine}</p>
					</div>
					<div className="ml-auto flex items-center gap-2">
						{remainingLabel && (
							<div className="px-2.5 py-1 rounded-xl border border-border/20 bg-foreground/5 text-xs font-semibold text-foreground/80 tabular-nums">
								{remainingLabel}
							</div>
						)}
						{activeRequestId && isBookedActive && !endedChatBooking && (
							<button
								type="button"
								onClick={() => {
									void completeBookedSession(activeRequestId)
										.then(() => showToast('Ending session…'))
										.catch(err => showToast(err instanceof Error ? err.message : 'Failed to end session', 'error'));
								}}
								className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15 transition-colors"
							>
								End session
							</button>
						)}
						<button
							type="button"
							onClick={() => { if (!otherId) return; startCall(otherId, otherName, otherAvatar, 'audio'); void navigate('/call'); }}
							disabled={!otherId}
							className="w-8 h-8 rounded-xl bg-foreground/10 hover:bg-emerald-500/20 hover:text-emerald-400 text-muted flex items-center justify-center transition-all"
						>
							<Phone className="w-4 h-4" />
						</button>
						<button
							type="button"
							onClick={() => { if (!otherId) return; startCall(otherId, otherName, otherAvatar, 'video'); void navigate('/call'); }}
							disabled={!otherId}
							className="w-8 h-8 rounded-xl bg-foreground/10 hover:bg-sky-500/20 hover:text-sky-400 text-muted flex items-center justify-center transition-all"
						>
							<Video className="w-4 h-4" />
						</button>
						{authState.user?.role === 'fan' ? (
							<button
								onClick={() => setShowTipModal(true)}
								className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
							>
								<Zap className="w-3.5 h-3.5 fill-amber-400" />
								Tip
							</button>
						) : null}
					</div>
				</div>
			</div>

			<div className="flex-1 pt-28 pb-20 overflow-y-auto">
				<div className="max-w-2xl mx-auto px-4 space-y-3 py-4">
					{messages.map(msg => {
						const isMe = msg.senderId === userId;
						return (
							<div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
								{!isMe && <Avatar src={msg.senderAvatar} alt={msg.senderName} size="sm" className="mt-auto mb-1" />}
								<div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
									{!msg.isUnlocked && msg.isPaid ? (
										<div className={`rounded-2xl overflow-hidden border ${isMe ? 'border-border/20 bg-foreground/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
											<div className="px-4 py-3 flex items-center gap-2">
												<Lock className="w-4 h-4 text-rose-400 shrink-0" />
												<div className="flex-1">
													<p className="text-xs text-foreground/70">Paid message ({formatINR(msg.price ?? 0)})</p>
													<p className="text-[10px] text-muted/80">Select to unlock and view this message.</p>
												</div>
												{!isMe && (
													<button
														onClick={() => handleUnlockMessage(msg)}
														className="flex items-center gap-1 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
													>
														<Unlock className="w-3 h-3" />
														Unlock
													</button>
												)}
											</div>
										</div>
									) : (
										<div className={`px-4 py-2.5 rounded-2xl text-sm ${
											isMe ?
												'bg-rose-500 text-white rounded-tr-sm' :
												'bg-surface2 text-foreground/90 rounded-tl-sm'
										}`}
										>
											{msg.isUnlocked && msg.isPaid && (
												<div className="flex items-center gap-1 text-xs mb-1 opacity-60">
													<Unlock className="w-3 h-3" /> Unlocked content
												</div>
											)}
											{msg.content}
										</div>
									)}
									<div className={`flex items-center gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
										<p className="text-[10px] text-muted/70">{formatDistanceToNow(msg.createdAt)}</p>
										{!isMe && authState.user && (
											<button
												type="button"
												onClick={() => setReportMessageId(msg.id)}
												className="text-[10px] font-semibold text-muted/80 hover:text-amber-500"
											>
												Report
											</button>
										)}
										{isMe && (
											msg.sendStatus === 'failed' ?
												<span className="text-[10px] text-rose-300">Failed</span> :
												msg.sendStatus === 'sending' ?
													<span className="text-[10px] text-muted/70">Sending…</span> :
													(() => {
														// Presence (`chat|j`) is not reliable after reload; use server ack as "delivered".
														const isServerAcked = /^\d+$/.test(msg.id) || msg.sendStatus === 'sent';
														if (msg.isSeen) return <WhatsAppDoubleTick className="w-4 h-4 text-rose-400" />;
														if (isServerAcked) return <WhatsAppDoubleTick className="w-4 h-4 text-muted/70" />;
														if (otherInRoom) return <WhatsAppDoubleTick className="w-4 h-4 text-muted/70" />;
														return <WhatsAppSingleTick className="w-3.5 h-3.5 text-muted/70" />;
													})()
										)}
									</div>
								</div>
							</div>
						);
					})}
					<div ref={messagesEndRef} />
				</div>
			</div>

			<div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/10">
				<div className="max-w-2xl mx-auto px-4 py-3">
					{endedChatBooking && (
						<div className="mb-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5">
							<p className="text-xs font-semibold text-rose-200">
								{endedChatBooking.reason === 'timeout' ? 'Time over — session ended' : 'Session disconnected'}
							</p>
							<p className="text-[11px] text-rose-200/80 mt-0.5">
								You can’t send messages after the session ends.
							</p>
						</div>
					)}
					<form onSubmit={handleSend} className="flex gap-2">
						<button type="button" className="p-2.5 rounded-xl hover:bg-foreground/10 transition-colors text-muted hover:text-foreground">
							<ImageIcon className="w-5 h-5" />
						</button>
						<input
							value={text}
							onChange={e => {
								const v = e.target.value;
								setText(v);
								if (realtimeActive && canSendBookedChat && v.trim()) notifyTyping(true);
							}}
							onBlur={() => {
								if (realtimeActive) notifyTyping(false);
							}}
							disabled={!canSendBookedChat}
							placeholder={!canSendBookedChat ? 'Session ended' : 'Type a message...'}
							className="flex-1 bg-input border border-border/20 rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						/>
						<button
							type="submit"
							disabled={!text.trim() || !canSendBookedChat || (realtimeActive && realtimeSending)}
							className="w-10 h-10 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all active:scale-95"
						>
							<Send className="w-4 h-4 text-white" />
						</button>
					</form>
				</div>
			</div>

			<TipModal
				isOpen={showTipModal}
				onClose={() => setShowTipModal(false)}
				creatorId={otherId}
				creatorName={otherName}
				creatorAvatar={otherAvatar}
			/>
			<ReportTargetModal
				isOpen={reportMessageId != null}
				onClose={() => setReportMessageId(null)}
				targetType="message"
				targetId={reportMessageId ?? ''}
				title="Report message"
				onToast={(msg, t) => showToast(msg, t ?? 'success')}
			/>
			<SessionFeedbackModal />
		</div>
	);
}
