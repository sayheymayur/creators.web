import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MessageCircle, Plus } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useSessions } from '../../context/SessionsContext';
import { useWs, useWsConnected } from '../../context/WsContext';
import { formatDistanceToNow } from '../../utils/date';
import { mockCreators } from '../../data/users';
import { useContent } from '../../context/ContentContext';
import { isUuid, randomUuid } from '../../utils/isUuid';

export function MessagesList() {
	const { state: authState } = useAuth();
	const { state: chatState, addConversation } = useChat();
	const { state: sessionsState } = useSessions();
	const { isSubscribed } = useContent();
	const ws = useWs();
	const wsConnected = useWsConnected();
	const navigate = useNavigate();
	const [search, setSearch] = useState('');
	const [showNewChat, setShowNewChat] = useState(false);

	const userId = authState.user?.id ?? '';

	// If there's an active booked chat session, show a pinned "Resume session" row
	// even if subscription state resets on reload.
	const activeChatRoomId =
		sessionsState.active?.accepted.kind === 'chat' ?
			sessionsState.active.accepted.room_id :
			(sessionsState.timer?.room_id ?? null);
	const hasChatRowAlready =
		!!activeChatRoomId &&
		chatState.conversations.some(c => c.id === activeChatRoomId && c.participantIds.includes(userId));

	function resumeActiveSession() {
		if (!activeChatRoomId) return;
		navigate(`/messages/${activeChatRoomId}`);
	}

	const conversations = chatState.conversations.filter(c => {
		if (!c.participantIds.includes(userId)) return false;
		if (!search) return true;
		return c.participantNames.some(n => n.toLowerCase().includes(search.toLowerCase()));
	});

	// WhatsApp-like behavior: keep rooms joined in background so `chat|c` arrives
	// and unread badge can update while user stays on the Messages list.
	const joinedRoomsRef = useRef<Record<string, true>>({});
	useEffect(() => {
		if (!wsConnected) return;
		const rooms = conversations.map(c => c.id).filter(id => isUuid(id));
		for (const rid of rooms) {
			if (sessionsState.endedRooms?.[rid]) continue;
			if (joinedRoomsRef.current[rid]) continue;
			joinedRoomsRef.current[rid] = true;
			void ws.request('chat', 'joinroom', [rid]).catch(() => {});
		}
	}, [conversations, sessionsState.endedRooms, ws, wsConnected]);

	function getOtherParticipant(conv: typeof conversations[0]) {
		const idx = conv.participantIds.indexOf(userId);
		const otherIdx = idx === 0 ? 1 : 0;
		return {
			name: conv.participantNames[otherIdx],
			avatar: conv.participantAvatars[otherIdx],
			id: conv.participantIds[otherIdx],
		};
	}

	function startNewChat(creatorId: string, creatorName: string, creatorAvatar: string, isOnline: boolean) {
		const existing = chatState.conversations.find(c =>
			c.participantIds.includes(userId) && c.participantIds.includes(creatorId)
		);
		if (existing) {
			navigate(`/messages/${existing.id}`);
			return;
		}
		const convId = randomUuid();
		addConversation({
			id: convId,
			participantIds: [userId, creatorId],
			participantNames: [authState.user?.name ?? 'You', creatorName],
			participantAvatars: [authState.user?.avatar ?? '', creatorAvatar],
			lastMessage: '',
			lastMessageTime: new Date().toISOString(),
			unreadCount: 0,
			isOnline,
		});
		navigate(`/messages/${convId}`);
		setShowNewChat(false);
	}

	const messagableCreators = mockCreators.filter(c =>
		isSubscribed(c.id) && c.isKYCVerified
	);

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<div className="flex items-center justify-between mb-5">
					<h1 className="text-xl font-bold text-foreground">Messages</h1>
					<button
						onClick={() => setShowNewChat(v => !v)}
						className="w-9 h-9 bg-rose-500 hover:bg-rose-600 rounded-xl flex items-center justify-center transition-colors"
					>
						<Plus className="w-5 h-5 text-white" />
					</button>
				</div>

				{showNewChat && (
					<div className="bg-surface border border-border/20 rounded-2xl p-4 mb-4">
						<p className="text-xs text-muted font-medium mb-3 uppercase tracking-wider">Start a new conversation</p>
						{messagableCreators.length === 0 ? (
							<p className="text-muted text-sm">Subscribe to creators to message them</p>
						) : (
							<div className="space-y-2">
								{messagableCreators.map(creator => (
									<button
										key={creator.id}
										onClick={() => startNewChat(creator.id, creator.name, creator.avatar, creator.isOnline)}
										className="w-full flex items-center gap-3 hover:bg-foreground/5 rounded-xl p-2 transition-colors"
									>
										<Avatar src={creator.avatar} alt={creator.name} size="md" isOnline={creator.isOnline} />
										<div className="text-left">
											<p className="text-sm font-medium text-foreground">{creator.name}</p>
											<p className="text-xs text-muted">{creator.category}</p>
										</div>
									</button>
								))}
							</div>
						)}
					</div>
				)}

				<div className="relative mb-4">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
					<input
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder="Search conversations..."
						className="w-full bg-input border border-border/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
					/>
				</div>

				{activeChatRoomId && !hasChatRowAlready && sessionsState.ended?.room_id !== activeChatRoomId && (
					<button
						type="button"
						onClick={() => resumeActiveSession()}
						className="w-full mb-3 flex items-center gap-3 p-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/15 transition-colors text-left"
					>
						<div className="w-11 h-11 rounded-2xl bg-rose-500/20 flex items-center justify-center shrink-0">
							<MessageCircle className="w-5 h-5 text-rose-300" />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-semibold text-foreground truncate">Resume chat session</p>
							<p className="text-xs text-muted/80 truncate">
								Your booked session is active. Tap to re-join the room.
							</p>
						</div>
						<span className="text-xs font-semibold text-rose-300 shrink-0">Open</span>
					</button>
				)}

				{conversations.length === 0 ? (
					<div className="text-center py-16">
						<div className="w-14 h-14 bg-foreground/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
							<MessageCircle className="w-6 h-6 text-muted/60" />
						</div>
						<p className="text-muted font-medium mb-1">No conversations yet</p>
						<p className="text-sm text-muted/80">Subscribe to creators to start chatting</p>
					</div>
				) : (
					<div className="space-y-1">
						{conversations.map(conv => {
							const other = getOtherParticipant(conv);
							return (
								<button
									key={conv.id}
									onClick={() => { void navigate(`/messages/${conv.id}`); }}
									className="w-full flex items-center gap-3 p-3 hover:bg-foreground/5 rounded-2xl transition-colors text-left"
								>
									<Avatar src={other.avatar} alt={other.name} size="lg" isOnline={conv.isOnline} />
									<div className="flex-1 min-w-0">
										<div className="flex items-center justify-between mb-0.5">
											<p className={`text-sm font-semibold truncate ${conv.unreadCount > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
												{other.name}
											</p>
											<p className="text-xs text-muted/80 shrink-0 ml-2">
												{formatDistanceToNow(conv.lastMessageTime)}
											</p>
										</div>
										<div className="flex items-center justify-between">
											<p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-foreground/70' : 'text-muted/80'}`}>
												{conv.lastMessage || 'Start a conversation'}
											</p>
											{conv.unreadCount > 0 && (
												<span className="bg-rose-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 ml-2">
													{conv.unreadCount}
												</span>
											)}
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</Layout>
	);
}
