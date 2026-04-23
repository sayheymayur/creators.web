import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AgoraRTC, { type IAgoraRTCClient, type ILocalAudioTrack, type ILocalVideoTrack } from 'agora-rtc-sdk-ng';
import { Radio, Eye, Gift, DollarSign, ArrowLeft, Send, X, Users } from '../../components/icons';
import { useLiveStream, VIRTUAL_GIFTS } from '../../context/LiveStreamContext';
import { useCurrentCreator } from '../../context/AuthContext';
import { buildLiveChannel, fetchAgoraRtcToken, getAgoraAppId, stringToAgoraUid } from '../../services/agoraRtc';
import type { LiveStream } from '../../types';
import { formatINR } from '../../services/razorpay';

function formatElapsed(startedAt: string): string {
	const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
	const h = Math.floor(diff / 3600);
	const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
	const s = (diff % 60).toString().padStart(2, '0');
	return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function GoLivePage() {
	const navigate = useNavigate();
	const creator = useCurrentCreator();
	const { goLive, endLive, sendChatMessage, getStream } = useLiveStream();
	const [title, setTitle] = useState('');
	const [isLive, setIsLive] = useState(false);
	const [activeStream, setActiveStream] = useState<LiveStream | null>(null);
	const [elapsed, setElapsed] = useState('00:00');
	const [text, setText] = useState('');
	const [viewerSimCount, setViewerSimCount] = useState(0);
	const [agoraError, setAgoraError] = useState('');
	const [hasLocalVideo, setHasLocalVideo] = useState(false);
	const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const viewerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const localVideoRef = useRef<HTMLDivElement | null>(null);
	const hostClientRef = useRef<IAgoraRTCClient | null>(null);
	const hostAudioTrackRef = useRef<ILocalAudioTrack | null>(null);
	const hostVideoTrackRef = useRef<ILocalVideoTrack | null>(null);

	useEffect(() => {
		return () => {
			if (elapsedRef.current) clearInterval(elapsedRef.current);
			if (viewerRef.current) clearInterval(viewerRef.current);
			hostAudioTrackRef.current?.close();
			hostVideoTrackRef.current?.close();
			hostAudioTrackRef.current = null;
			hostVideoTrackRef.current = null;
			setHasLocalVideo(false);
			void hostClientRef.current?.leave().catch(() => undefined);
			hostClientRef.current = null;
		};
	}, []);

	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [activeStream?.chatMessages.length]);

	useEffect(() => {
		if (activeStream) {
			const latest = getStream(activeStream.id);
			if (latest) setActiveStream(latest);
		}
	}, [activeStream?.id]);

	useEffect(() => {
		if (!isLive) return;
		const localTrack = hostVideoTrackRef.current;
		const localContainer = localVideoRef.current;
		if (!localTrack || !localContainer) return;
		localTrack.play(localContainer);
	}, [isLive, activeStream?.id]);

	if (!creator) {
		return (
			<div className="min-h-screen bg-background text-foreground flex items-center justify-center">
				<p className="text-muted">Creator profile not found</p>
			</div>
		);
	}
	const activeCreator = creator;

	function handleGoLive() {
		if (!title.trim()) return;
		const stream = goLive(activeCreator.id, activeCreator.name, activeCreator.avatar, title.trim());
		const channelName = buildLiveChannel(stream.id);
		const uid = stringToAgoraUid(activeCreator.id);
		const client = AgoraRTC.createClient({ codec: 'vp8', mode: 'live' });
		client.setClientRole('host');
		hostClientRef.current = client;
		setAgoraError('');

		void fetchAgoraRtcToken(channelName, uid, 'host').then(token => (
			client.join(getAgoraAppId(), channelName, token, uid).then(() => (
				AgoraRTC.createMicrophoneAudioTrack().then(audioTrack => {
					hostAudioTrackRef.current = audioTrack;
					return AgoraRTC.createCameraVideoTrack().then(videoTrack => {
						hostVideoTrackRef.current = videoTrack;
						setHasLocalVideo(true);
						if (localVideoRef.current) videoTrack.play(localVideoRef.current);
						return client.publish([audioTrack, videoTrack]);
					}).catch(() => (
						client.publish([audioTrack])
					));
				})
			))
		)).catch(() => {
			setAgoraError('Live media could not connect. Showing fallback preview.');
		}).finally(() => {
			setActiveStream(stream);
			setIsLive(true);

			elapsedRef.current = setInterval(() => {
				setElapsed(formatElapsed(stream.startedAt));
			}, 1000);

			let viewers = 0;
			viewerRef.current = setInterval(() => {
				const delta = Math.floor(Math.random() * 5) - 1;
				viewers = Math.max(0, viewers + delta + 2);
				setViewerSimCount(viewers);
			}, 3000);
		});
	}

	function handleEndLive() {
		if (!activeStream) return;
		endLive(activeStream.id);
		hostAudioTrackRef.current?.close();
		hostVideoTrackRef.current?.close();
		hostAudioTrackRef.current = null;
		hostVideoTrackRef.current = null;
		setHasLocalVideo(false);
		void hostClientRef.current?.leave().catch(() => undefined);
		hostClientRef.current = null;
		if (elapsedRef.current) clearInterval(elapsedRef.current);
		if (viewerRef.current) clearInterval(viewerRef.current);
		setIsLive(false);
		navigate('/creator-dashboard');
	}

	function handleSendChat(e: React.FormEvent) {
		e.preventDefault();
		if (!text.trim() || !activeStream) return;
		sendChatMessage(activeStream.id, creator!.id, creator!.name, creator!.avatar, text.trim());
		setText('');
		const latest = getStream(activeStream.id);
		if (latest) setActiveStream(latest);
	}

	const currentStream = activeStream ? getStream(activeStream.id) ?? activeStream : null;
	const totalGiftValue = currentStream?.totalGiftValue ?? 0;

	if (!isLive) {
		return (
			<div className="fixed inset-0 z-[100] bg-background text-foreground flex flex-col">
				<div className="border-b border-border/10 px-4 h-14 flex items-center gap-3">
					<button type="button" onClick={() => { void navigate(-1); }} className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors">
						<ArrowLeft className="w-5 h-5 text-muted" />
					</button>
					<h1 className="text-base font-bold text-foreground">Go Live</h1>
				</div>

				<div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
					<div className="relative">
						<img
							src={creator.avatar}
							alt={creator.name}
							className="w-28 h-28 rounded-3xl object-cover border-4 border-border/20"
						/>
						<div className="absolute -bottom-2 -right-2 w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center shadow-xl">
							<Radio className="w-5 h-5 text-white" />
						</div>
					</div>

					<div className="text-center">
						<h2 className="text-xl font-bold text-foreground mb-1">Start a Live Stream</h2>
						<p className="text-muted text-sm">Go live and connect with your subscribers in real-time</p>
					</div>

					<div className="w-full max-w-sm space-y-4">
						<div>
							<label className="text-xs font-semibold text-muted uppercase tracking-widest mb-2 block">Stream Title</label>
							<input
								value={title}
								onChange={e => setTitle(e.target.value)}
								placeholder="e.g. Morning workout Q&A"
								className="w-full bg-input border border-border/20 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
								maxLength={60}
							/>
						</div>

						<div className="grid grid-cols-3 gap-3">
							{[
								{ icon: Eye, label: 'Live viewers', color: 'text-sky-400' },
								{ icon: Gift, label: 'Virtual gifts', color: 'text-amber-400' },
								{ icon: Users, label: 'Live chat', color: 'text-emerald-400' },
							].map(({ icon: Icon, label, color }) => (
								<div key={label} className="bg-foreground/5 rounded-2xl p-3 flex flex-col items-center gap-2">
									<Icon className={`w-5 h-5 ${color}`} />
									<span className="text-[10px] text-muted text-center">{label}</span>
								</div>
							))}
						</div>

						<button
							onClick={handleGoLive}
							disabled={!title.trim()}
							className="w-full py-4 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all active:scale-98 shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2"
						>
							<div className="w-2 h-2 bg-white rounded-full animate-pulse" />
							Go Live Now
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 z-[100] bg-overlay flex flex-col">
			<div className="relative flex-1 overflow-hidden">
				<div ref={localVideoRef} className="absolute inset-0 z-0" />
				<img
					src={activeCreator.avatar}
					alt={activeCreator.name}
					className={`w-full h-full object-cover scale-110 blur-sm brightness-40 ${hasLocalVideo ? 'opacity-0' : 'opacity-100'}`}
				/>
				<div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background/80 dark:from-black/50 dark:to-black/80" />

				{agoraError && (
					<div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-rose-500/20 border border-rose-500/30 rounded-xl px-3 py-1.5">
						<p className="text-xs text-rose-300">{agoraError}</p>
					</div>
				)}

				<div className="absolute top-0 left-0 right-0 p-4 pt-12 flex items-center gap-3">
					<div className="flex items-center gap-2 bg-rose-500 rounded-xl px-3 py-1.5">
						<div className="w-2 h-2 bg-white rounded-full animate-pulse" />
						<span className="text-white text-xs font-bold">LIVE</span>
					</div>
					<div className="flex items-center gap-1.5 bg-background/70 text-foreground dark:bg-black/40 dark:text-white backdrop-blur-sm rounded-xl px-3 py-1.5">
						<Eye className="w-3.5 h-3.5 text-muted dark:text-white/60" />
						<span className="text-foreground dark:text-white text-xs font-semibold">{viewerSimCount}</span>
					</div>
					<div className="bg-background/70 text-foreground dark:bg-black/40 dark:text-white backdrop-blur-sm rounded-xl px-3 py-1.5">
						<span className="text-muted dark:text-white/50 text-xs font-mono">{elapsed}</span>
					</div>
					<div className="ml-auto flex items-center gap-1.5 bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 rounded-xl px-3 py-1.5">
						<DollarSign className="w-3.5 h-3.5 text-amber-400" />
						<span className="text-amber-400 text-xs font-semibold">{formatINR(totalGiftValue)}</span>
					</div>
				</div>

				<div className="absolute bottom-0 left-0 right-0">
					<div className="px-4 pb-2 max-h-44 overflow-y-auto space-y-1.5">
						{(currentStream?.chatMessages ?? []).map(msg => (
							<div key={msg.id} className="flex items-start gap-2">
								<img src={msg.userAvatar} alt={msg.userName} className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5" />
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

					<div className="px-4 pb-4 flex items-center gap-2">
						<form onSubmit={handleSendChat} className="flex-1 flex gap-2">
							<input
								value={text}
								onChange={e => setText(e.target.value)}
								placeholder="Say something to viewers..."
								className="flex-1 bg-background/70 text-foreground dark:bg-white/10 dark:text-white backdrop-blur-sm border border-border/30 dark:border-white/15 rounded-2xl px-4 py-2.5 text-sm placeholder:text-muted focus:outline-none"
							/>
							<button
								type="submit"
								disabled={!text.trim()}
								className="w-10 h-10 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 rounded-xl flex items-center justify-center"
							>
								<Send className="w-4 h-4 text-white" />
							</button>
						</form>
						<button
							onClick={handleEndLive}
							className="w-10 h-10 bg-background/70 text-foreground dark:bg-white/10 dark:text-white backdrop-blur-sm border border-border/30 dark:border-white/15 rounded-xl flex items-center justify-center text-rose-400 hover:bg-rose-500/20 transition-all"
						>
							<X className="w-5 h-5" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
