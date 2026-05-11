import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AgoraRTC, { type IRemoteAudioTrack, type IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { ArrowLeft, DollarSign, Eye, Gift, Heart, MessageCircle, Share2 } from '../../components/icons';
import { useLiveStream, VIRTUAL_GIFTS } from '../../context/LiveStreamContext';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useNotifications } from '../../context/NotificationContext';
import { useEnsureWsAuth, useWs } from '../../context/WsContext';
import { compareMinor, inrRupeesToMinor } from '../../utils/money';
import { LiveGiftsTray } from '../../components/live/LiveGiftsTray';
import { TipModal } from '../../components/modals/TipModal';
import type { VirtualGift } from '../../types';
import type { LiveWithAgora } from '../../services/liveWsTypes';
import { formatINR } from '../../services/razorpay';
import { AvatarBackdrop, UserAvatarMedia } from '../../components/ui/Avatar';

function formatElapsed(startedAt: string): string {
	const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
	const h = Math.floor(diff / 3600);
	const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
	const s = (diff % 60).toString().padStart(2, '0');
	return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function isJoinEligibilityError(message: string): boolean {
	const m = message.toLowerCase();
	return m.includes('followers only') || m.includes('subscribers only');
}

export function LiveStreamRoom() {
	const { streamId } = useParams<{ streamId: string }>();
	const navigate = useNavigate();
	const ws = useWs();
	const ensureAuth = useEnsureWsAuth();
	const { getStream, joinLive, leaveLiveViewer, sendGift, ready: liveWsReady } = useLiveStream();
	const { state: authState } = useAuth();
	const { deductFunds, payViaRazorpay } = useWallet();
	const { showToast } = useNotifications();
	const [text, setText] = useState('');
	const [showChat, setShowChat] = useState(false);
	const [showGifts, setShowGifts] = useState(false);
	const [showTipModal, setShowTipModal] = useState(false);
	const [showControls, setShowControls] = useState(true);
	const [elapsed, setElapsed] = useState('00:00');
	const [likeCount, setLikeCount] = useState(0);
	const [floatingGift, setFloatingGift] = useState<{ emoji: string, name: string } | null>(null);
	const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
	const [agoraError, setAgoraError] = useState('');
	const [joinError, setJoinError] = useState('');
	const [livePayload, setLivePayload] = useState<LiveWithAgora | null>(null);
	const [joining, setJoining] = useState(true);
	const [giftLoading, setGiftLoading] = useState(false);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const endedRef = useRef(false);
	const remoteVideoRef = useRef<HTMLDivElement | null>(null);
	const remoteAudioTrackRef = useRef<IRemoteAudioTrack | null>(null);
	const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);
	const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);

	const stream = streamId ? getStream(streamId) : undefined;

	useEffect(() => {
		if (!streamId || !authState.user) {
			setJoining(false);
			return;
		}
		if (!liveWsReady) return;

		let cancelled = false;
		setJoining(true);
		setJoinError('');
		setLivePayload(null);

		void ensureAuth()
			.then(() => joinLive(streamId))
			.then(live => {
				if (cancelled) return;
				setLivePayload(live);
				const client = AgoraRTC.createClient({ codec: 'vp8', mode: 'live' });
				client.setClientRole('audience');
				clientRef.current = client;
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

				const { app_id, channel_name, uid, token } = live.agora;
				return client.join(app_id, channel_name, token || null, uid).catch(() => {
					if (cancelled) return;
					setAgoraError('Live media unavailable. Showing fallback preview.');
				});
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				const msg = err instanceof Error ? err.message : String(err);
				setJoinError(msg);
				if (isJoinEligibilityError(msg)) {
					showToast(msg, 'error');
				} else {
					showToast(msg || 'Could not join live', 'error');
				}
				void navigate(-1);
			})
			.finally(() => {
				if (!cancelled) setJoining(false);
			});

		return () => {
			cancelled = true;
			remoteAudioTrackRef.current?.stop();
			remoteAudioTrackRef.current = null;
			remoteVideoTrackRef.current?.stop();
			remoteVideoTrackRef.current = null;
			setHasRemoteVideo(false);
			void clientRef.current?.leave().catch(() => undefined);
			clientRef.current = null;
			leaveLiveViewer(streamId);
		};
	}, [streamId, authState.user?.id, liveWsReady, ensureAuth, joinLive, leaveLiveViewer, navigate, showToast]);

	useEffect(() => {
		if (!streamId) return;
		const off = ws.on('live', 'ended', data => {
			const pl = data as { live_id?: string };
			if (pl?.live_id !== streamId) return;
			if (endedRef.current) return;
			endedRef.current = true;
			showToast('Live ended', 'info');
			// `navigate(-1)` can land on an invalid state (or the same page) and crash the app.
			// Redirect fans to a safe route instead.
			void navigate('/feed', { replace: true });
		});
		return off;
	}, [ws, streamId, navigate, showToast]);

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

	if (!streamId) return null;

	if (joining && !stream && !joinError) {
		return (
			<div className="fixed inset-0 z-[150] bg-overlay flex items-center justify-center">
				<p className="text-muted text-sm">Joining live…</p>
			</div>
		);
	}

	if (joinError && !stream) return null;

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
		if (!text.trim() || !authState.user || !livePayload?.room_id) return;
		const roomId = livePayload.room_id;
		const body = text.trim();
		void ws.request('chat', 'sendmsg', [roomId, body])
			.then(() => { setText(''); })
			.catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				showToast(msg, 'error');
			});
	}

	function handleGift(gift: VirtualGift) {
		const user = authState.user;
		if (!user || giftLoading || !streamId) return;
		setGiftLoading(true);

		const giftMinor = inrRupeesToMinor(gift.value);
		const canAffordGift = compareMinor(user.walletBalanceMinor, '>=', giftMinor);

		if (canAffordGift) {
			const ok = deductFunds(gift.value, 'gift', `Gift "${gift.name}" to ${stream!.creatorName}`, stream!.creatorId, stream!.creatorName);
			if (ok) {
				sendGift(streamId, user.id, user.name, user.avatar, gift);
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
				sendGift(streamId, user.id, user.name, user.avatar, gift);
				setShowGifts(false);
				setFloatingGift({ emoji: gift.emoji, name: gift.name });
				setTimeout(() => setFloatingGift(null), 2500);
				showToast(`Sent ${gift.emoji} ${gift.name}!`);
			}
			setGiftLoading(false);
		});
	}

	const totalGiftValue = stream.totalGiftValue ?? 0;

	return (
		<div className="fixed inset-0 z-[150] bg-overlay flex flex-col" onClick={resetControlsTimer} onTouchStart={resetControlsTimer}>
			<div className="relative flex-1 overflow-hidden">
				<div ref={remoteVideoRef} className={`absolute inset-0 z-0 ${hasRemoteVideo ? 'opacity-100' : 'opacity-0'}`} />
				<AvatarBackdrop
					src={stream.creatorAvatar}
					alt={stream.creatorName}
					className={`w-full h-full object-cover scale-110 blur-sm brightness-40 ${hasRemoteVideo ? 'opacity-0' : 'opacity-100'}`}
				/>
				<div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background/80 dark:from-black/50 dark:to-black/80" />

				{agoraError && (
					<div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-rose-500/20 border border-rose-500/30 rounded-xl px-3 py-1.5">
						<p className="text-xs text-rose-300">{agoraError}</p>
					</div>
				)}

				{/* Top HUD (match creator) */}
				<div className={`absolute top-0 left-0 right-0 p-4 pt-12 flex items-center gap-3 ${showControls ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}>
					<button
						type="button"
						onClick={() => { void navigate(-1); }}
						className="w-9 h-9 rounded-xl bg-black/55 text-white backdrop-blur-sm flex items-center justify-center border border-white/10"
						aria-label="Back"
					>
						<ArrowLeft className="w-4 h-4" />
					</button>

					<div className="flex items-center gap-2 bg-rose-500 rounded-xl px-3 py-1.5 shrink-0">
						<div className="w-2 h-2 bg-white rounded-full animate-pulse" />
						<span className="text-white text-xs font-bold">LIVE</span>
					</div>

					<div className="flex items-center gap-1.5 bg-background/70 text-foreground dark:bg-black/40 dark:text-white backdrop-blur-sm rounded-xl px-3 py-1.5 shrink-0">
						<Eye className="w-3.5 h-3.5 text-muted dark:text-white/60" />
						<span className="text-foreground dark:text-white text-xs font-semibold">{stream.viewerCount.toLocaleString()}</span>
					</div>

					<div className="bg-background/70 text-foreground dark:bg-black/40 dark:text-white backdrop-blur-sm rounded-xl px-3 py-1.5 shrink-0">
						<span className="text-muted dark:text-white/50 text-xs font-mono">{elapsed}</span>
					</div>

					<div className="ml-auto flex items-center gap-2 shrink-0">
						<div className="flex items-center gap-1.5 bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 rounded-xl px-3 py-1.5">
							<Gift className="w-3.5 h-3.5 text-amber-400" />
							<span className="text-amber-400 text-xs font-semibold">{formatINR(totalGiftValue)}</span>
						</div>

						<button
							type="button"
							onClick={() => setShowTipModal(true)}
							className="h-9 px-3 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors flex items-center gap-2"
						>
							<DollarSign className="w-4 h-4" />
							<span className="text-xs font-bold">Tip</span>
						</button>

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
				</div>

				{/* Bottom fan controls (keep fan buttons; styled like creator) */}
				<div className={`absolute bottom-24 left-0 right-0 px-4 ${showControls ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}>
					<div className="flex justify-center">
						<div className="flex items-center gap-2 rounded-[28px] bg-black/60 backdrop-blur border border-white/10 px-3 py-3 shadow-2xl">
							<button
								type="button"
								onClick={() => setShowChat(v => !v)}
								className={`h-12 w-12 rounded-full ${showChat ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/15'} flex items-center justify-center`}
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

				{/* Creator-style bottom chat overlay (toggle via Chat button) */}
				{showChat && (
					<div className="absolute bottom-0 left-0 right-0">
						<div className="px-4 pb-2 max-h-44 overflow-y-auto space-y-1.5">
							{(stream.chatMessages ?? []).map(msg => (
								<div key={msg.id} className="flex items-start gap-2">
									<UserAvatarMedia src={msg.userAvatar} alt={msg.userName} className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5" />
									{msg.isGift ? (
										<div className="flex items-center gap-1.5 bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 rounded-xl px-2.5 py-1">
											<span className="text-base">{VIRTUAL_GIFTS.find(g => g.name === msg.giftName)?.emoji ?? '🎁'}</span>
											<div>
												<span className="text-amber-300 text-xs font-bold">{msg.userName}</span>
												<span className="text-muted dark:text-white/60 text-xs"> sent </span>
												<span className="text-amber-300 text-xs font-bold">{msg.giftName}</span>
											</div>
										</div>
									) : (
										<div>
											<span className="text-rose-400 text-xs font-semibold">{msg.userName} </span>
											<span className="text-foreground/80 dark:text-white/80 text-xs">{msg.text}</span>
										</div>
									)}
								</div>
							))}
							<div ref={chatEndRef} />
						</div>

						<div className="px-4 pb-4">
							<form onSubmit={handleSend} className="flex gap-2">
								<input
									value={text}
									onChange={e => setText(e.target.value)}
									placeholder="Say something…"
									className="flex-1 bg-background/70 text-foreground dark:bg-white/10 dark:text-white backdrop-blur-sm border border-border/30 dark:border-white/15 rounded-2xl px-4 py-2.5 text-sm placeholder:text-muted focus:outline-none"
								/>
								<button
									type="submit"
									disabled={!text.trim()}
									className="w-10 h-10 shrink-0 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 rounded-xl flex items-center justify-center"
								>
									<span className="text-white text-xs font-bold">Send</span>
								</button>
							</form>
						</div>
					</div>
				)}

				{floatingGift && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<div className="text-6xl animate-bounce">{floatingGift.emoji}</div>
					</div>
				)}
			</div>

			{/* Gifts modal */}
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

			<TipModal
				isOpen={showTipModal}
				onClose={() => setShowTipModal(false)}
				creatorId={stream.creatorId}
				creatorName={stream.creatorName}
				creatorAvatar={stream.creatorAvatar}
			/>
		</div>
	);
}
