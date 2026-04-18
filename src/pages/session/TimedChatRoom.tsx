import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Clock, AlertTriangle, MessageCircle } from '../../components/icons';
import { useSession } from '../../context/SessionContext';
import { useAuth } from '../../context/AuthContext';
import { mockCreators } from '../../data/users';
import { Avatar } from '../../components/ui/Avatar';
import { formatINR } from '../../services/razorpay';

interface ChatMsg {
	id: string;
	senderId: string;
	senderName: string;
	senderAvatar: string;
	text: string;
	createdAt: string;
}

function formatTime(secs: number): string {
	const m = Math.floor(secs / 60).toString().padStart(2, '0');
	const s = (secs % 60).toString().padStart(2, '0');
	return `${m}:${s}`;
}

const AUTO_REPLIES = [
	'Hey! Happy we get this time together 😊',
	'That\'s a great question! Let me explain...',
	'Thank you so much for this session!',
	'I love hearing from my fans directly like this.',
	'Let\'s make the most of our time! Ask me anything.',
];
let replyIdx = 0;

export function TimedChatRoom() {
	const { creatorId } = useParams<{ creatorId: string }>();
	const navigate = useNavigate();
	const { state: sessionState, endSessionEarly } = useSession();
	const { state: authState } = useAuth();
	const [messages, setMessages] = useState<ChatMsg[]>([]);
	const [text, setText] = useState('');
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const session = sessionState.activeSession;
	const creator = mockCreators.find(c => c.id === creatorId);

	useEffect(() => {
		if (!session || session.type !== 'chat') {
			navigate(-1);
		}
	}, [session, navigate]);

	useEffect(() => {
		if (!session) return;
		const welcome: ChatMsg = {
			id: 'welcome',
			senderId: session.creatorId,
			senderName: session.creatorName,
			senderAvatar: session.creatorAvatar,
			text: `Hey! Your ${session.durationMinutes}-minute chat session has started. Let's talk!`,
			createdAt: new Date().toISOString(),
		};
		setMessages([welcome]);
	}, []);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	useEffect(() => {
		if (!session) return;
		if (sessionState.warningShown && messages.length > 0) {
			const warn: ChatMsg = {
				id: `warn-${Date.now()}`,
				senderId: 'system',
				senderName: 'System',
				senderAvatar: '',
				text: '⚠️ 1 minute remaining in your session.',
				createdAt: new Date().toISOString(),
			};
			setMessages(prev => [...prev, warn]);
		}
	}, [sessionState.warningShown]);

	useEffect(() => {
		if (!session && messages.length > 0) {
			const ended: ChatMsg = {
				id: `end-${Date.now()}`,
				senderId: 'system',
				senderName: 'System',
				senderAvatar: '',
				text: 'Session has ended. Thank you!',
				createdAt: new Date().toISOString(),
			};
			setMessages(prev => [...prev, ended]);
			setTimeout(() => { void navigate(-1); }, 2500);
		}
	}, [session]);

	function handleSend(e: React.FormEvent) {
		e.preventDefault();
		if (!text.trim() || !authState.user || !session) return;
		const msg: ChatMsg = {
			id: `msg-${Date.now()}`,
			senderId: authState.user.id,
			senderName: authState.user.name,
			senderAvatar: authState.user.avatar,
			text: text.trim(),
			createdAt: new Date().toISOString(),
		};
		setMessages(prev => [...prev, msg]);
		setText('');

		setTimeout(() => {
			if (!session) return;
			const reply: ChatMsg = {
				id: `reply-${Date.now()}`,
				senderId: session.creatorId,
				senderName: session.creatorName,
				senderAvatar: session.creatorAvatar,
				text: AUTO_REPLIES[replyIdx % AUTO_REPLIES.length],
				createdAt: new Date().toISOString(),
			};
			replyIdx++;
			setMessages(prev => [...prev, reply]);
		}, 1200);
	}

	function handleEndEarly() {
		endSessionEarly();
		void navigate(-1);
	}

	const isWarning = session && sessionState.secondsRemaining <= 60 && sessionState.secondsRemaining > 0;
	const isExpired = !session;

	return (
		<div className="fixed inset-0 z-[100] bg-background text-foreground flex flex-col">
			<div className="bg-background/95 backdrop-blur-xl border-b border-border/10 px-4 h-14 flex items-center gap-3 shrink-0">
				<button type="button" onClick={() => { void navigate(-1); }} className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors">
					<ArrowLeft className="w-5 h-5 text-muted" />
				</button>
				<Avatar src={session?.creatorAvatar ?? creator?.avatar ?? ''} alt={session?.creatorName ?? ''} size="sm" />
				<div className="flex-1">
					<p className="text-sm font-semibold text-foreground">{session?.creatorName ?? creator?.name}</p>
					<div className="flex items-center gap-1">
						<MessageCircle className="w-3 h-3 text-muted/80" />
						<span className="text-xs text-muted/80">Timed Chat</span>
					</div>
				</div>

				{session && (
					<div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm font-bold ${
						isWarning ? 'bg-rose-500/20 text-rose-500 animate-pulse' : 'bg-foreground/10 text-foreground'
					}`}
					>
						{isWarning && <AlertTriangle className="w-3.5 h-3.5" />}
						<Clock className="w-3.5 h-3.5" />
						{formatTime(sessionState.secondsRemaining)}
					</div>
				)}
			</div>

			{session && (
				<div className={`px-4 py-2 flex items-center justify-between shrink-0 ${isWarning ? 'bg-rose-500/10 border-b border-rose-500/20' : 'bg-amber-500/5 border-b border-amber-500/10'}`}>
					<p className="text-xs text-muted">
						Session: {session.durationMinutes}min · {formatINR(session.ratePerMinute)}/min · Total: {formatINR(session.totalCost)}
					</p>
					<button
						onClick={handleEndEarly}
						className="text-xs text-rose-400 hover:text-rose-300 font-semibold transition-colors"
					>
						End Early
					</button>
				</div>
			)}

			<div className="flex-1 overflow-y-auto pb-4">
				<div className="max-w-2xl mx-auto px-4 space-y-3 py-4">
					{messages.map(msg => {
						const isMe = msg.senderId === authState.user?.id;
						const isSystem = msg.senderId === 'system';
						if (isSystem) {
							return (
								<div key={msg.id} className="flex justify-center">
									<div className={`px-4 py-2 rounded-xl text-xs font-medium ${
										msg.text.includes('⚠️') ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' : 'bg-foreground/10 text-muted'
									}`}
									>
										{msg.text}
									</div>
								</div>
							);
						}
						return (
							<div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
								{!isMe && <Avatar src={msg.senderAvatar} alt={msg.senderName} size="sm" className="mt-auto mb-1" />}
								<div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
									isMe ? 'bg-rose-500 text-white rounded-tr-sm' : 'bg-surface2 text-foreground/90 rounded-tl-sm'
								}`}
								>
									{msg.text}
								</div>
							</div>
						);
					})}
					<div ref={messagesEndRef} />
				</div>
			</div>

			<div className={`border-t px-4 py-3 shrink-0 ${isExpired ? 'opacity-40 pointer-events-none' : ''} border-border/10 bg-background/95`}>
				<div className="max-w-2xl mx-auto">
					<form onSubmit={handleSend} className="flex gap-2">
						<input
							value={text}
							onChange={e => setText(e.target.value)}
							placeholder={session ? 'Type a message...' : 'Session ended'}
							className="flex-1 bg-input border border-border/20 rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
							disabled={!session}
						/>
						<button
							type="submit"
							disabled={!text.trim() || !session}
							className="w-10 h-10 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all active:scale-95"
						>
							<Send className="w-4 h-4 text-white" />
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}
