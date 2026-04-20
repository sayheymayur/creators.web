import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AgoraRTC, { type IRemoteAudioTrack, type IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { ArrowLeft, Eye, Heart, Share2, Gift } from '../../components/icons';
import { useLiveStream, VIRTUAL_GIFTS } from '../../context/LiveStreamContext';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useNotifications } from '../../context/NotificationContext';
import { buildLiveChannel, fetchAgoraRtcToken, getAgoraAppId, stringToAgoraUid } from '../../services/agoraRtc';
import { usdToInr, formatINR } from '../../services/payments';
import type { VirtualGift } from '../../types';

function formatElapsed(startedAt: string): string {
	const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
	const h = Math.floor(diff / 3600);
	const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
	const s = (diff % 60).toString().padStart(2, '0');
	return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function LiveStreamRoom() {
	const { streamId } = useParams<{ streamId: string }>();
	const navigate = useNavigate();
	const { getStream, sendChatMessage, sendGift } = useLiveStream();
	const { state: authState } = useAuth();
	const { deductFunds, payExternally } = useWallet();
	const { showToast } = useNotifications();
	const [text, setText] = useState('');
	const [showGifts, setShowGifts] = useState(false);
	const [elapsed, setElapsed] = useState('00:00');
	const [likeCount, setLikeCount] = useState(0);
	const [floatingGift, setFloatingGift] = useState<{ emoji: string, name: string } | null>(null);
	const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
	const [agoraError, setAgoraError] = useState('');
	const chatEndRef = useRef<HTMLDivElement>(null);
	const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const remoteVideoRef = useRef<HTMLDivElement | null>(null);
	const remoteAudioTrackRef = useRef<IRemoteAudioTrack | null>(null);
	const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);

	const stream = getStream(streamId ?? '');

	useEffect(() => {
		if (!stream || stream.status !== 'live') {
			navigate(-1);
		}
	}, [stream, navigate]);

	useEffect(() => {
		if (!stream || !authState.user) return;

		const client = AgoraRTC.createClient({ codec: 'vp8', mode: 'live' });
		client.setClientRole('audience');
		setAgoraError('');
		setHasRemoteVideo(false);

		client.on('user-published', (user, mediaType) => {
			void client.subscribe(user, mediaType).then(() => {
				if (mediaType === 'video' && user.videoTrack) {
					remoteVideoTrackRef.current = user.videoTrack;
					setHasRemoteVideo(true);
					if (remoteVideoRef.current) user.videoTrack.play(remoteVideoRef.current);
				}
				if (mediaType === 'audio' && user.audioTrack) {
					remoteAudioTrackRef.current = user.audioTrack;
					user.audioTrack.play();
				}
			}).catch(() => {
				setAgoraError('Could not subscribe to live media.');
			});
		});

		client.on('user-unpublished', (_user, mediaType) => {
			if (mediaType === 'video') {
				setHasRemoteVideo(false);
				remoteVideoTrackRef.current = null;
			}
			if (mediaType === 'audio') {
				remoteAudioTrackRef.current?.stop();
				remoteAudioTrackRef.current = null;
			}
		});

		const uid = stringToAgoraUid(authState.user.id);
		const channelName = buildLiveChannel(stream.id);

		void fetchAgoraRtcToken(channelName, uid, 'audience').then(token => (
			client.join(getAgoraAppId(), channelName, token, uid)
		)).catch(() => {
			setAgoraError('Live media unavailable. Showing fallback preview.');
		});

		return () => {
			remoteAudioTrackRef.current?.stop();
			remoteAudioTrackRef.current = null;
			remoteVideoTrackRef.current?.stop();
			remoteVideoTrackRef.current = null;
			setHasRemoteVideo(false);
			void client.leave().catch(() => undefined);
		};
	}, [authState.user, stream?.id, stream?.status]);

	useEffect(() => {
		if (!stream) return;
		elapsedRef.current = setInterval(() => {
			setElapsed(formatElapsed(stream.startedAt));
		}, 1000);
		return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
	}, [stream?.startedAt]);

	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [stream?.chatMessages.length]);

	if (!stream) return null;

	function handleSend(e: React.FormEvent) {
		e.preventDefault();
		if (!text.trim() || !authState.user) return;
		sendChatMessage(stream!.id, authState.user.id, authState.user.name, authState.user.avatar, text.trim());
		setText('');
	}

	const [giftLoading, setGiftLoading] = useState(false);

	function handleGift(gift: VirtualGift) {
		const user = authState.user;
		if (!user || giftLoading) return;
		setGiftLoading(true);

		const balance = user.walletBalance ?? 0;
		let ok = false;

		if (balance >= gift.value) {
			ok = deductFunds(gift.value, 'gift', `Gift "${gift.name}" to ${stream!.creatorName}`, stream!.creatorId, stream!.creatorName);
			if (ok) {
				sendGift(stream!.id, user.id, user.name, user.avatar, gift);
				setShowGifts(false);
				setFloatingGift({ emoji: gift.emoji, name: gift.name });
				setTimeout(() => setFloatingGift(null), 2500);
				showToast(`Sent ${gift.emoji} ${gift.name}!`);
			}
			setGiftLoading(false);
			return;
		}

		void payExternally(gift.value, 'gift', `Gift "${gift.name}" to ${stream!.creatorName}`, stream!.creatorId, stream!.creatorName).then(result => {
			ok = result.ok;
			if (!ok && !result.cancelled) {
				showToast(result.error || 'Payment failed', 'error');
				setGiftLoading(false);
				return;
			}

			if (ok) {
				sendGift(stream!.id, user.id, user.name, user.avatar, gift);
				setShowGifts(false);
				setFloatingGift({ emoji: gift.emoji, name: gift.name });
				setTimeout(() => setFloatingGift(null), 2500);
				showToast(`Sent ${gift.emoji} ${gift.name}!`);
			}
			setGiftLoading(false);
		});
	}

	return (
		<div className="fixed inset-0 z-[150] bg-overlay flex flex-col">
			<div className="relative flex-1 overflow-hidden">
				<div ref={remoteVideoRef} className={`absolute inset-0 z-0 ${hasRemoteVideo ? 'opacity-100' : 'opacity-0'}`} />
				<img
					src={stream.creatorAvatar}
					alt={stream.creatorName}
					className={`w-full h-full object-cover scale-110 blur-sm brightness-50 ${hasRemoteVideo ? 'opacity-0' : 'opacity-100'}`}
				/>
				<div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

				{agoraError && (
					<div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-rose-500/20 border border-rose-500/30 rounded-xl px-3 py-1.5">
						<p className="text-xs text-rose-300">{agoraError}</p>
					</div>
				)}

				<div className="absolute top-0 left-0 right-0 flex items-center gap-3 p-4 pt-12">
					<button
						onClick={() => { void navigate(-1); }}
						className="w-8 h-8 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
					>
						<ArrowLeft className="w-4 h-4" />
					</button>

					<div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-2xl px-3 py-2 flex-1">
						<img src={stream.creatorAvatar} alt={stream.creatorName} className="w-7 h-7 rounded-full object-cover" />
						<div className="flex-1 min-w-0">
							<p className="text-white text-xs font-bold truncate">{stream.creatorName}</p>
							<p className="text-white/50 text-[10px] truncate">{stream.title}</p>
						</div>
						<div className="flex items-center gap-1 bg-rose-500 rounded-lg px-2 py-0.5">
							<div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
							<span className="text-white text-[10px] font-bold">LIVE</span>
						</div>
					</div>

					<button className="w-8 h-8 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center text-white">
						<Share2 className="w-4 h-4" />
					</button>
				</div>

				<div className="absolute top-24 right-4 flex flex-col items-end gap-2">
					<div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-xl px-2.5 py-1.5">
						<Eye className="w-3.5 h-3.5 text-white/70" />
						<span className="text-white text-xs font-semibold">{stream.viewerCount.toLocaleString()}</span>
					</div>
					<div className="bg-black/40 backdrop-blur-sm rounded-xl px-2.5 py-1.5">
						<span className="text-white/50 text-xs font-mono">{elapsed}</span>
					</div>
				</div>

				<div className="absolute bottom-0 left-0 right-0 flex flex-col">
					<div className="flex-1 px-4 pb-2 overflow-y-auto max-h-48 space-y-1.5">
						{stream.chatMessages.map(msg => (
							<div key={msg.id} className="flex items-start gap-2">
								<img src={msg.userAvatar} alt={msg.userName} className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5" />
								{msg.isGift ? (
									<div className="flex items-center gap-1.5 bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 rounded-xl px-2.5 py-1">
										<span className="text-base">{VIRTUAL_GIFTS.find(g => g.name === msg.giftName)?.emoji ?? '🎁'}</span>
										<div>
											<span className="text-amber-300 text-xs font-bold">{msg.userName}</span>
											<span className="text-white/60 text-xs"> sent </span>
											<span className="text-amber-300 text-xs font-bold">{msg.giftName}</span>
										</div>
									</div>
								) : (
									<div>
										<span className="text-rose-400 text-xs font-semibold">{msg.userName} </span>
										<span className="text-white/80 text-xs">{msg.text}</span>
									</div>
								)}
							</div>
						))}
						<div ref={chatEndRef} />
					</div>

					<div className="px-4 py-3 flex items-center gap-2">
						<form onSubmit={handleSend} className="flex-1 flex gap-2">
							<input
								value={text}
								onChange={e => setText(e.target.value)}
								placeholder="Say something..."
								className="flex-1 bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-rose-500/40"
							/>
						</form>
						<button
							onClick={() => setLikeCount(c => c + 1)}
							className="w-10 h-10 bg-rose-500/20 backdrop-blur-sm border border-rose-500/30 rounded-xl flex items-center justify-center relative"
						>
							<Heart className="w-5 h-5 text-rose-400 fill-rose-400" />
							{likeCount > 0 && (
								<span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
									{likeCount > 99 ? '99+' : likeCount}
								</span>
							)}
						</button>
						<button
							onClick={() => setShowGifts(g => !g)}
							className="w-10 h-10 bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 rounded-xl flex items-center justify-center"
						>
							<Gift className="w-5 h-5 text-amber-400" />
						</button>
					</div>
				</div>

				{floatingGift && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<div className="text-6xl animate-bounce">{floatingGift.emoji}</div>
					</div>
				)}
			</div>

			{showGifts && (
				<div className="bg-surface border-t border-border/20 p-4 animate-slide-up">
					<div className="flex items-center justify-between mb-4">
						<p className="text-sm font-bold text-foreground">Send a Gift</p>
						<button onClick={() => setShowGifts(false)} className="text-muted text-xs hover:text-foreground">Close</button>
					</div>
					<div className="grid grid-cols-3 gap-2">
						{VIRTUAL_GIFTS.map(gift => (
							<button
								key={gift.id}
								onClick={() => handleGift(gift)}
								disabled={giftLoading}
								className="flex flex-col items-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 border border-border/20 rounded-2xl p-3 transition-all active:scale-95 disabled:opacity-50"
							>
								<span className="text-2xl">{gift.emoji}</span>
								<span className="text-xs text-foreground font-medium">{gift.name}</span>
								<span className="text-[10px] text-amber-400 font-semibold">{formatINR(usdToInr(gift.value))}</span>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
