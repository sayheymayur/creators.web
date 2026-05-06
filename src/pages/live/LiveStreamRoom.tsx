import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AgoraRTC, { type IRemoteAudioTrack, type IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { ArrowLeft, Eye, Gift, Heart, MessageCircle, Share2 } from '../../components/icons';
import { useLiveStream, VIRTUAL_GIFTS } from '../../context/LiveStreamContext';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useNotifications } from '../../context/NotificationContext';
import { buildLiveChannel, fetchAgoraRtcToken, getAgoraAppId, stringToAgoraUid } from '../../services/agoraRtc';
import { compareMinor, inrRupeesToMinor } from '../../utils/money';
import type { VirtualGift } from '../../types';
import { LiveGiftsTray } from '../../components/live/LiveGiftsTray';

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
	const { deductFunds, payViaRazorpay } = useWallet();
	const { showToast } = useNotifications();
	const [text, setText] = useState('');
	const [showChat, setShowChat] = useState(false);
	const [showGifts, setShowGifts] = useState(false);
	const [elapsed, setElapsed] = useState('00:00');
	const [likeCount, setLikeCount] = useState(0);
	const [floatingGift, setFloatingGift] = useState<{ emoji: string, name: string } | null>(null);
	const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
	const [agoraError, setAgoraError] = useState('');
	const [showControls, setShowControls] = useState(true);
	const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const remoteVideoRef = useRef<HTMLDivElement | null>(null);
	const remoteAudioTrackRef = useRef<IRemoteAudioTrack | null>(null);
	const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);

	const stream = getStream(streamId ?? '');

	useEffect(() => {
		if (stream?.status !== 'live') {
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

	function resetControlsTimer() {
		setShowControls(true);
		if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
		controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
	}

	useEffect(() => {
		resetControlsTimer();
		return () => {
			if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
		};
	}, [stream.id]);

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

		const giftMinor = inrRupeesToMinor(gift.value);
		const canAffordGift = compareMinor(user.walletBalanceMinor, '>=', giftMinor);

		if (canAffordGift) {
			const ok = deductFunds(gift.value, 'gift', `Gift "${gift.name}" to ${stream!.creatorName}`, stream!.creatorId, stream!.creatorName);
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

		void payViaRazorpay(gift.value, 'gift', `Gift "${gift.name}" to ${stream!.creatorName}`, stream!.creatorId, stream!.creatorName).then(result => {
			if (!result.ok && !result.cancelled) {
				showToast(result.error || 'Payment failed', 'error');
				setGiftLoading(false);
				return;
			}

			if (result.ok) {
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
		<div
			className="fixed inset-0 z-[150] bg-overlay text-foreground flex flex-col md:flex-row"
			onClick={resetControlsTimer}
			onTouchStart={resetControlsTimer}
		>
			<div className="relative flex-1 overflow-hidden">
				<div ref={remoteVideoRef} className={`absolute inset-0 z-0 ${hasRemoteVideo ? 'opacity-100' : 'opacity-0'}`} />
				<img
					src={stream.creatorAvatar}
					alt={stream.creatorName}
					className={`w-full h-full object-cover scale-110 blur-sm brightness-50 ${hasRemoteVideo ? 'opacity-0' : 'opacity-100'}`}
				/>
				<div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background/90 dark:from-black/50 dark:to-black/90" />

				{agoraError && (
					<div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-rose-500/20 border border-rose-500/30 rounded-xl px-3 py-1.5">
						<p className="text-xs text-rose-300">{agoraError}</p>
					</div>
				)}

				{/* Top HUD */}
				<div className={`absolute top-0 left-0 right-0 p-4 pt-12 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
					<div className="flex items-center gap-3">
						<button
							onClick={() => { void navigate(-1); }}
							className="w-9 h-9 rounded-xl bg-black/55 text-white backdrop-blur-sm flex items-center justify-center border border-white/10"
							aria-label="Back"
						>
							<ArrowLeft className="w-4 h-4" />
						</button>

						<div className="flex items-center gap-2 rounded-2xl bg-black/55 text-white backdrop-blur-sm border border-white/10 px-3 py-2 flex-1 min-w-0">
							<img src={stream.creatorAvatar} alt={stream.creatorName} className="w-8 h-8 rounded-xl object-cover" />
							<div className="flex-1 min-w-0">
								<p className="text-sm font-semibold truncate">{stream.creatorName}</p>
								<p className="text-[11px] text-white/60 truncate">{stream.title}</p>
							</div>
							<div className="flex items-center gap-1 bg-rose-500 rounded-lg px-2 py-0.5 shrink-0">
								<div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
								<span className="text-white text-[10px] font-bold">LIVE</span>
							</div>
						</div>

						<button
							type="button"
							onClick={() => {
								const url = `${window.location.origin}/live/${stream.id}`;
								void navigator.clipboard?.writeText(url);
								showToast('Link copied');
							}}
							className="w-9 h-9 rounded-xl bg-black/55 text-white backdrop-blur-sm flex items-center justify-center border border-white/10"
							aria-label="Copy share link"
						>
							<Share2 className="w-4 h-4" />
						</button>
					</div>

					<div className="mt-3 flex items-center justify-end gap-2">
						<div className="flex items-center gap-1 rounded-xl bg-black/55 text-white backdrop-blur-sm border border-white/10 px-2.5 py-1.5">
							<Eye className="w-3.5 h-3.5 text-white/70" />
							<span className="text-xs font-semibold tabular-nums">{stream.viewerCount.toLocaleString()}</span>
						</div>
						<div className="rounded-xl bg-black/55 text-white backdrop-blur-sm border border-white/10 px-2.5 py-1.5">
							<span className="text-xs font-mono text-white/70 tabular-nums">{elapsed}</span>
						</div>
					</div>
				</div>

				{/* Bottom control bar (Meet-like) */}
				<div className={`absolute bottom-6 left-0 right-0 px-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
					<div className="flex justify-center">
						<div className="flex items-center gap-2 rounded-[28px] bg-black/60 backdrop-blur border border-white/10 px-3 py-3 shadow-2xl">
							<button
								type="button"
								onClick={() => setShowChat(v => !v)}
								className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
								aria-label="Chat"
							>
								<MessageCircle className="h-5 w-5" />
							</button>

							<button
								type="button"
								onClick={() => setLikeCount(c => c + 1)}
								className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center relative"
								aria-label="Like"
							>
								<Heart className="h-5 w-5 text-rose-300 fill-rose-300" />
								{likeCount > 0 && (
									<span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
										{likeCount > 99 ? '99+' : likeCount}
									</span>
								)}
							</button>

							<button
								type="button"
								onClick={() => setShowGifts(true)}
								className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
								aria-label="Gifts"
							>
								<Gift className="h-5 w-5 text-amber-300" />
							</button>
						</div>
					</div>
				</div>

				{floatingGift && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<div className="text-6xl animate-bounce">{floatingGift.emoji}</div>
					</div>
				)}
			</div>

			{/* Desktop chat dock */}
			<aside className="hidden md:flex w-[380px] max-w-[34vw] border-l border-border/10 bg-background/95 backdrop-blur-xl flex-col">
				<div className="px-4 py-3 border-b border-border/10 flex items-center justify-between gap-3">
					<p className="text-sm font-bold text-foreground">Live chat</p>
					<button
						type="button"
						onClick={() => setShowGifts(true)}
						className="h-9 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/20 border border-amber-500/25 text-sm font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400"
					>
						<Gift className="w-4 h-4" />
						Gift
					</button>
				</div>

				<div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
					{stream.chatMessages.map(msg => (
						<div key={msg.id} className="flex items-start gap-2">
							<img src={msg.userAvatar} alt={msg.userName} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
							<div className="min-w-0">
								<p className="text-xs text-muted">
									<span className="font-semibold text-foreground">{msg.userName}</span>
								</p>
								{msg.isGift ? (
									<p className="text-sm text-amber-500 font-semibold">
										sent {msg.giftName} {VIRTUAL_GIFTS.find(g => g.name === msg.giftName)?.emoji ?? ''}
									</p>
								) : (
									<p className="text-sm text-foreground break-words">{msg.text}</p>
								)}
							</div>
						</div>
					))}
					<div ref={chatEndRef} />
				</div>

				<form onSubmit={handleSend} className="p-4 border-t border-border/10 flex items-center gap-2">
					<input
						value={text}
						onChange={e => setText(e.target.value)}
						placeholder="Say something…"
						className="flex-1 bg-input border border-border/20 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none"
					/>
					<button
						type="submit"
						disabled={!text.trim()}
						className="h-10 px-4 rounded-xl bg-rose-500 text-white font-semibold disabled:opacity-40"
					>
						Send
					</button>
				</form>
			</aside>

			{/* Mobile chat sheet */}
			{showChat && (
				<div className="fixed inset-0 z-[170] flex items-end md:hidden">
					<button
						type="button"
						className="absolute inset-0 bg-background/60 dark:bg-black/60 backdrop-blur-md"
						onClick={() => setShowChat(false)}
						aria-label="Close chat"
					/>
					<div className="relative w-full bg-background/95 backdrop-blur-xl border-t border-border/10 rounded-t-3xl overflow-hidden">
						<div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
							<p className="text-sm font-bold text-foreground">Live chat</p>
							<button onClick={() => setShowChat(false)} className="text-muted text-xs hover:text-foreground">Close</button>
						</div>
						<div className="px-4 py-3 max-h-[45vh] overflow-y-auto space-y-2">
							{stream.chatMessages.map(msg => (
								<div key={msg.id} className="flex items-start gap-2">
									<img src={msg.userAvatar} alt={msg.userName} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
									<div className="min-w-0">
										<p className="text-xs text-muted">
											<span className="font-semibold text-foreground">{msg.userName}</span>
										</p>
										{msg.isGift ? (
											<p className="text-sm text-amber-500 font-semibold">
												sent {msg.giftName} {VIRTUAL_GIFTS.find(g => g.name === msg.giftName)?.emoji ?? ''}
											</p>
										) : (
											<p className="text-sm text-foreground break-words">{msg.text}</p>
										)}
									</div>
								</div>
							))}
							<div ref={chatEndRef} />
						</div>
						<form onSubmit={handleSend} className="p-4 border-t border-border/10 flex items-center gap-2">
							<input
								value={text}
								onChange={e => setText(e.target.value)}
								placeholder="Say something…"
								className="flex-1 bg-input border border-border/20 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none"
							/>
							<button
								type="submit"
								disabled={!text.trim()}
								className="h-10 px-4 rounded-xl bg-rose-500 text-white font-semibold disabled:opacity-40"
							>
								Send
							</button>
						</form>
					</div>
				</div>
			)}

			{/* Gifts modal (shared) */}
			{showGifts && (
				<div className="fixed inset-0 z-[180] flex items-end md:items-center justify-center">
					<button
						type="button"
						className="absolute inset-0 bg-background/60 dark:bg-black/60 backdrop-blur-md"
						onClick={() => setShowGifts(false)}
						aria-label="Close gifts"
					/>
					<div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-4 animate-slide-up">
						<LiveGiftsTray
							gifts={VIRTUAL_GIFTS}
							loading={giftLoading}
							onGift={handleGift}
							onClose={() => setShowGifts(false)}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
