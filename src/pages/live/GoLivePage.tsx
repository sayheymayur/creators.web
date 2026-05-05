import { useState, useEffect, useRef, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import AgoraRTC, { type IAgoraRTCClient, type ILocalAudioTrack, type ILocalVideoTrack } from 'agora-rtc-sdk-ng';
import {
	Eye,
	DollarSign,
	Send,
	Users,
	X,
	Mic,
	MicOff,
	Camera,
	VideoOff,
	Settings,
	MessageCircle,
	Sparkles,
	Zap,
	Lock,
} from '../../components/icons';
import { useLiveStream, useMyActiveLive, VIRTUAL_GIFTS } from '../../context/LiveStreamContext';
import { useCurrentCreator } from '../../context/AuthContext';
import { useEnsureWsAuth, useWs } from '../../context/WsContext';
import type { LiveVisibility, LiveWithAgora } from '../../services/liveWsTypes';
import { formatINR } from '../../services/razorpay';

function formatElapsed(startedAt: string): string {
	const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
	const h = Math.floor(diff / 3600);
	const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
	const s = (diff % 60).toString().padStart(2, '0');
	return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const VIS_OPTIONS: { value: LiveVisibility, label: string, Icon: typeof Eye }[] = [
	{ value: 'everyone', label: 'Everyone', Icon: Eye },
	{ value: 'followers', label: 'Followers', Icon: Users },
	{ value: 'subscribers', label: 'Subscribers', Icon: Lock },
];

function FeatureToggleRow(props: {
	Icon: ComponentType<{ className?: string }>,
	title: string,
	description: string,
	on: boolean,
	setOn: (v: boolean) => void,
}) {
	const { Icon: RowIcon, title, description, on, setOn } = props;
	return (
		<div className="flex items-center gap-3 py-3.5 border-b border-zinc-800/90 last:border-b-0">
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800/80">
				<RowIcon className="h-5 w-5 text-zinc-300" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-semibold text-zinc-100">{title}</p>
				<p className="text-xs text-zinc-500">{description}</p>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={on}
				onClick={() => { setOn(!on); }}
				className={
					'relative h-7 w-12 shrink-0 rounded-full transition-colors ' +
					(on ? 'bg-rose-500' : 'bg-zinc-700')
				}
			>
				<span
					className={
						'absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ' +
						(on ? 'translate-x-5' : 'translate-x-0')
					}
				/>
			</button>
		</div>
	);
}

export function GoLivePage() {
	const navigate = useNavigate();
	const creator = useCurrentCreator();
	const ws = useWs();
	const ensureAuth = useEnsureWsAuth();
	const { goLive, endLive, getStream, state: lsState, ready: liveWsReady } = useLiveStream();
	const myActiveLive = useMyActiveLive();
	const [visibility, setVisibility] = useState<LiveVisibility>('everyone');
	const [title, setTitle] = useState('');
	const [isLive, setIsLive] = useState(false);
	const [activeLiveId, setActiveLiveId] = useState<string | null>(null);
	const [elapsed, setElapsed] = useState('00:00');
	const [text, setText] = useState('');
	const [viewerSimCount, setViewerSimCount] = useState(0);
	const [agoraError, setAgoraError] = useState('');
	const [hasLocalVideo, setHasLocalVideo] = useState(false);
	const [goLiveError, setGoLiveError] = useState('');
	const [showEndConfirm, setShowEndConfirm] = useState(false);
	const [previewError, setPreviewError] = useState('');
	const [previewResolution, setPreviewResolution] = useState('—');
	const [micEnabled, setMicEnabled] = useState(true);
	const [camEnabled, setCamEnabled] = useState(true);
	const [interactiveChat, setInteractiveChat] = useState(true);
	const [directTips, setDirectTips] = useState(true);
	const [autoCaptions, setAutoCaptions] = useState(false);
	/** True once mic/camera preview acquisition has settled (needed before host attach to avoid publishing audio-only). */
	const [localTracksPrimed, setLocalTracksPrimed] = useState(false);
	const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const viewerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const localVideoRef = useRef<HTMLDivElement | null>(null);
	const previewContainerRef = useRef<HTMLDivElement | null>(null);
	const hostClientRef = useRef<IAgoraRTCClient | null>(null);
	const hostAudioTrackRef = useRef<ILocalAudioTrack | null>(null);
	const hostVideoTrackRef = useRef<ILocalVideoTrack | null>(null);
	const userEndedRef = useRef(false);
	/** Bumps when a new host attach starts; stale async handlers must not set React state. */
	const hostAttachGenRef = useRef(0);
	/** Mirrors `isLive` for the host-attach effect without listing `isLive` in deps (that caused cleanup → leave() right after publish). */
	const isLiveRef = useRef(false);
	isLiveRef.current = isLive;

	// Local preview on setup screen: acquire mic/cam once; reuse tracks in attachHostAgora when going live.
	useEffect(() => {
		if (isLive) return;
		let cancelled = false;
		setPreviewError('');
		setLocalTracksPrimed(false);
		void AgoraRTC.createMicrophoneAudioTrack()
			.then(audio => {
				if (cancelled) {
					audio.close();
					return Promise.resolve();
				}
				hostAudioTrackRef.current = audio;
				setMicEnabled(audio.enabled ?? true);
				return AgoraRTC.createCameraVideoTrack()
					.then(video => {
						if (cancelled) {
							audio.close();
							video.close();
							return undefined;
						}
						hostVideoTrackRef.current = video;
						setCamEnabled(video.enabled ?? true);
						const s = video.getMediaStreamTrack().getSettings();
						const h = s.height ?? 0;
						setPreviewResolution(h > 0 ? `${h}p` : '—');
						setHasLocalVideo(true);
					})
					.catch(() => {
						setPreviewError(prev => (prev ? prev : 'Camera unavailable — audio only'));
						hostVideoTrackRef.current = null;
						setHasLocalVideo(false);
					});
			})
			.catch(() => {
				setPreviewError('Camera/mic permission denied');
			})
			.finally(() => {
				if (!cancelled) setLocalTracksPrimed(true);
			});
		return () => {
			cancelled = true;
			if (!isLiveRef.current) {
				hostAudioTrackRef.current?.close();
				hostVideoTrackRef.current?.close();
				hostAudioTrackRef.current = null;
				hostVideoTrackRef.current = null;
				setHasLocalVideo(false);
				setPreviewResolution('—');
			}
		};
	}, [isLive]);

	// Attach preview video to container when ref or track appears after async init.
	useEffect(() => {
		if (isLive) return;
		const video = hostVideoTrackRef.current;
		const el = previewContainerRef.current;
		if (video && el) {
			video.play(el);
		}
	}, [isLive, hasLocalVideo]);

	function isJoinAbortedError(err: unknown): boolean {
		if (typeof err !== 'object' || err === null) return false;
		const o = err as { code?: string, message?: string };
		return o.code === 'OPERATION_ABORTED' || (typeof o.message === 'string' && o.message.includes('OPERATION_ABORTED'));
	}

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
		const id = activeLiveId;
		if (!id) return;
		const latest = getStream(id);
		const n = latest?.viewerCount ?? 0;
		setViewerSimCount(n);
	}, [activeLiveId, getStream]);

	useEffect(() => {
		const id = activeLiveId;
		if (!id) return;
		chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
		const s = getStream(id);
		if (s) setElapsed(formatElapsed(s.startedAt));
	}, [activeLiveId, getStream]);

	useEffect(() => {
		if (!isLive) return;
		const localTrack = hostVideoTrackRef.current;
		const localContainer = localVideoRef.current;
		if (!localTrack || !localContainer) return;
		localTrack.play(localContainer);
	}, [isLive, activeLiveId]);

	// If the host row is cleared remotely (`live|ended` from another device), tear down Agora.
	useEffect(() => {
		if (!isLive || userEndedRef.current) return;
		if (lsState.myLive !== null) return;
		if (elapsedRef.current) clearInterval(elapsedRef.current);
		if (viewerRef.current) clearInterval(viewerRef.current);
		hostAudioTrackRef.current?.close();
		hostVideoTrackRef.current?.close();
		hostAudioTrackRef.current = null;
		hostVideoTrackRef.current = null;
		setHasLocalVideo(false);
		void hostClientRef.current?.leave().catch(() => undefined);
		hostClientRef.current = null;
		setIsLive(false);
		setActiveLiveId(null);
		void navigate('/creator-dashboard');
	}, [isLive, lsState.myLive, navigate]);

	// Single place for host Agora: when `myLive` is set (fresh goLive, hydrated creds, or
	// Continue stream) and we are not yet `isLive`, attach once. `handleGoLive` must not
	// call attachHostAgora too — goLive() dispatches myLive while isLive is still false,
	// which would duplicate attach and bump hostAttachGenRef so the winning client leaves.
	// Cleanup must cancel in-flight join (React Strict Mode remount leaves the channel and
	// aborts join); a second mount retries.
	// Do not depend on `isLive`: when publish succeeds we set `isLive` true and a dep on it
	// would run this cleanup and call leave() while the host must stay in the channel.
	// Gate on `localTracksPrimed` so join/publish sees preview tracks (reload + Continue).
	useEffect(() => {
		if (isLiveRef.current) return;
		if (!localTracksPrimed) return;
		const live = myActiveLive.live;
		if (!live) return;
		if (myActiveLive.expired) {
			setAgoraError('Host token expired. Please end this stream and start a new one.');
			return;
		}
		const cancelledRef = { current: false };
		void attachHostAgora(live, { getCancelled: () => cancelledRef.current });
		return () => {
			cancelledRef.current = true;
			void hostClientRef.current?.leave().catch(() => undefined);
		};
	}, [myActiveLive.live?.live_id, myActiveLive.expired, localTracksPrimed]);

	if (!creator) {
		return (
			<div className="min-h-screen bg-background text-foreground flex items-center justify-center">
				<p className="text-muted">Creator profile not found</p>
			</div>
		);
	}
	const activeCreator = creator;

	function cleanupHostMedia() {
		hostAudioTrackRef.current?.close();
		hostVideoTrackRef.current?.close();
		hostAudioTrackRef.current = null;
		hostVideoTrackRef.current = null;
		setHasLocalVideo(false);
		void hostClientRef.current?.leave().catch(() => undefined);
		hostClientRef.current = null;
	}

	function startTickers(live: LiveWithAgora) {
		const s = getStream(live.live_id);
		const startedAt = s?.startedAt ?? live.started_at;
		setElapsed(formatElapsed(startedAt));
		elapsedRef.current = setInterval(() => {
			setElapsed(formatElapsed(startedAt));
		}, 1000);
		let viewers = s?.viewerCount ?? 0;
		setViewerSimCount(viewers);
		viewerRef.current = setInterval(() => {
			const delta = Math.floor(Math.random() * 5) - 1;
			viewers = Math.max(0, viewers + delta + 2);
			setViewerSimCount(viewers);
		}, 3000);
	}

	type AttachOpts = { getCancelled?: () => boolean };

	function attachHostAgora(live: LiveWithAgora, opts?: AttachOpts) {
		const getCancelled = opts?.getCancelled ?? (() => false);
		hostAttachGenRef.current += 1;
		const gen = hostAttachGenRef.current;
		const stillCurrent = () => gen === hostAttachGenRef.current;

		const client = AgoraRTC.createClient({ codec: 'vp8', mode: 'live' });
		client.setClientRole('host');
		hostClientRef.current = client;
		setAgoraError('');
		const { app_id, channel_name, uid, token } = live.agora;
		// Token TTL is server-controlled (AGORA_LIVE_TOKEN_TTL_SEC). The spec has no refresh
		// command, so on join failure we surface a clear error and let the creator end & restart.
		const waitDeferredVideoMs = (): Promise<void> => {
			const step = 80;
			const maxAccum = 1200;
			const stepAccum = (accum: number): Promise<void> => {
				if (hostVideoTrackRef.current) return Promise.resolve();
				if (accum >= maxAccum || getCancelled() || !stillCurrent()) return Promise.resolve();
				return new Promise<void>(resolve => {
					globalThis.setTimeout(resolve, step);
				}).then(() => stepAccum(accum + step));
			};
			if (!hostAudioTrackRef.current || hostVideoTrackRef.current) return Promise.resolve();
			return stepAccum(0);
		};

		return client.join(app_id, channel_name, token || null, uid).then(() => {
			if (!stillCurrent()) return client.leave().catch(() => undefined);
			if (getCancelled()) return client.leave().then(() => undefined);

			return waitDeferredVideoMs().then(() => {
				const reuseAudio = hostAudioTrackRef.current;
				const reuseVideo = hostVideoTrackRef.current;

				const publishTracks = (): Promise<void> => {
					if (reuseAudio && reuseVideo) {
						setHasLocalVideo(true);
						return client.publish([reuseAudio, reuseVideo]).then(() => undefined);
					}
					if (reuseAudio && !reuseVideo) {
						setHasLocalVideo(false);
						return client.publish([reuseAudio]).then(() => undefined);
					}
					return AgoraRTC.createMicrophoneAudioTrack().then(audioTrack => {
						if (!stillCurrent()) {
							audioTrack.close();
							return client.leave().catch(() => undefined);
						}
						hostAudioTrackRef.current = audioTrack;
						return AgoraRTC.createCameraVideoTrack().then(videoTrack => {
							if (!stillCurrent()) {
								audioTrack.close();
								videoTrack.close();
								return client.leave().catch(() => undefined);
							}
							hostVideoTrackRef.current = videoTrack;
							setHasLocalVideo(true);
							if (localVideoRef.current) videoTrack.play(localVideoRef.current);
							return client.publish([audioTrack, videoTrack]);
						}).catch(() => {
							if (!stillCurrent()) {
								audioTrack.close();
								return client.leave().catch(() => undefined);
							}
							return client.publish([audioTrack]);
						});
					}).then(() => undefined);
				};

				return publishTracks();
			}).then(() => {
				if (hostClientRef.current !== client || !stillCurrent()) return undefined;
				if (getCancelled()) {
					hostAudioTrackRef.current?.close();
					hostVideoTrackRef.current?.close();
					hostAudioTrackRef.current = null;
					hostVideoTrackRef.current = null;
					setHasLocalVideo(false);
					return client.leave().catch(() => undefined).then(() => {
						if (hostClientRef.current === client) hostClientRef.current = null;
					});
				}
				setAgoraError('');
				setActiveLiveId(live.live_id);
				setIsLive(true);
				startTickers(live);
				return undefined;
			});
		}).catch((err: unknown) => {
			if (!stillCurrent()) return;
			if (getCancelled() || isJoinAbortedError(err)) return;
			const expired =
				live.agora?.expires_at && new Date(live.agora.expires_at).getTime() <= Date.now();
			if (expired) {
				setAgoraError('Host token expired. Please end this stream and start a new one.');
			} else {
				setAgoraError('Live media could not connect. Showing fallback preview.');
			}
			console.warn('[golive] Agora join failed', err);
			setActiveLiveId(live.live_id);
			setIsLive(true);
			startTickers(live);
		});
	}

	function handleGoLive() {
		if (!title.trim()) return;
		if (!liveWsReady) {
			setGoLiveError('Connect and sign in before going live.');
			return;
		}
		setGoLiveError('');
		void ensureAuth()
			.then(() => goLive(visibility, title.trim()))
			.catch((e: unknown) => {
				setGoLiveError(e instanceof Error ? e.message : 'Could not go live');
			});
	}

	function handleEndLive() {
		userEndedRef.current = true;
		if (elapsedRef.current) clearInterval(elapsedRef.current);
		if (viewerRef.current) clearInterval(viewerRef.current);
		cleanupHostMedia();
		setIsLive(false);
		setActiveLiveId(null);
		void endLive()
			.catch(() => {})
			.finally(() => {
				userEndedRef.current = false;
				void navigate('/creator-dashboard');
			});
	}

	function handleSendChat(e: React.FormEvent) {
		e.preventDefault();
		if (!text.trim() || !activeLiveId || !ws.isConnected) return;
		const roomId = lsState.myLive?.room_id;
		if (!roomId) return;
		const body = text.trim();
		void ws.request('chat', 'sendmsg', [roomId, body])
			.then(() => { setText(''); })
			.catch((err: unknown) => {
				setGoLiveError(err instanceof Error ? err.message : 'Could not send message');
			});
	}

	const currentStream = activeLiveId ? getStream(activeLiveId) ?? null : null;
	const totalGiftValue = currentStream?.totalGiftValue ?? 0;

	if (!isLive) {
		const resNum = parseInt(previewResolution.replace(/[^\d]/g, ''), 10) || 0;
		const qualityBadge = resNum >= 2160 ? '4K ULTRA HD' : resNum >= 1080 ? 'FULL HD' : resNum > 0 ? previewResolution.toUpperCase() : 'HD';

		function toggleMic() {
			const t = hostAudioTrackRef.current;
			if (!t) return;
			const next = !t.enabled;
			t.setEnabled(next);
			setMicEnabled(next);
		}

		function toggleCam() {
			const t = hostVideoTrackRef.current;
			if (!t) return;
			const next = !t.enabled;
			t.setEnabled(next);
			setCamEnabled(next);
		}

		return (
			<div className="fixed inset-0 z-[100] flex flex-col bg-[#0d0d0d] text-zinc-100">
				{/* Top bar */}
				<header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-900 px-4">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => { void navigate(-1); }}
							className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
							aria-label="Close"
						>
							<X className="h-5 w-5" />
						</button>
						<span className="text-sm font-semibold tracking-tight">Setup Stream</span>
					</div>
					<span className="rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
						Draft
					</span>
				</header>

				<div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
					{/* Left: preview + stats */}
					<div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 p-4 lg:min-w-0 lg:flex-1 lg:overflow-y-auto lg:p-6">
						<div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-800/80 lg:max-w-[min(100%,calc((100vh-260px)*16/9))]">
							<div className="relative aspect-video w-full bg-black">
								<div ref={previewContainerRef} className="absolute inset-0 z-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
								{!hasLocalVideo && (
									<div className="absolute inset-0 z-[1] flex items-center justify-center bg-zinc-950">
										<img
											src={creator.avatar}
											alt={creator.name}
											className="h-24 w-24 rounded-2xl object-cover opacity-50"
										/>
									</div>
								)}

								<div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
									<span className="flex items-center gap-1.5 rounded-md bg-rose-500/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
										<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
										<span>Preview</span>
									</span>
									<span className="flex items-center gap-1 rounded-md border border-zinc-600/80 bg-black/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200 backdrop-blur-sm">
										<Camera className="h-3 w-3" />
										{' '}
										{qualityBadge}
									</span>
								</div>

								<div className="absolute bottom-3 left-3 z-10 flex gap-2">
									<button
										type="button"
										onClick={() => { toggleMic(); }}
										className={
											'flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-colors ' +
											(micEnabled ? 'bg-zinc-900/90 text-zinc-100 ring-1 ring-zinc-600 hover:bg-zinc-800' : 'bg-rose-500 text-white')
										}
										aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
									>
										{micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
									</button>
									<button
										type="button"
										onClick={() => { toggleCam(); }}
										className={
											'flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-colors ' +
											(camEnabled ? 'bg-zinc-900/90 text-zinc-100 ring-1 ring-zinc-600 hover:bg-zinc-800' : 'bg-rose-500 text-white')
										}
										aria-label={camEnabled ? 'Turn camera off' : 'Turn camera on'}
									>
										{camEnabled ? <Camera className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
									</button>
								</div>

								<div className="absolute bottom-3 right-3 z-10">
									<button
										type="button"
										className="flex items-center gap-2 rounded-lg border border-zinc-600/80 bg-black/55 px-3 py-2 text-xs font-semibold text-zinc-100 backdrop-blur-sm transition-colors hover:bg-black/70"
										aria-label="Camera settings"
									>
										<Settings className="h-4 w-4" />
										Camera settings
									</button>
								</div>
							</div>
						</div>

						{previewError && (
							<p className="text-xs text-amber-400/95">{previewError}</p>
						)}

						<div className="rounded-xl border border-zinc-800/90 bg-zinc-900/40 px-4 py-4">
							<p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
								Stream statistics
							</p>
							<div className="grid grid-cols-3 gap-4 text-center">
								<div>
									<p className="text-lg font-semibold text-zinc-200">—</p>
									<p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Bitrate</p>
								</div>
								<div>
									<p className="text-lg font-semibold text-zinc-200">—</p>
									<p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Latency</p>
								</div>
								<div>
									<p className="text-lg font-semibold text-zinc-200">{previewResolution}</p>
									<p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Resolution</p>
								</div>
							</div>
						</div>
					</div>

					{/* Right: configuration */}
					<aside className="flex w-full shrink-0 flex-col border-t border-zinc-900 bg-[#0d0d0d] lg:max-w-md lg:border-l lg:border-t-0">
						<div className="scrollbar-hide flex min-h-0 flex-1 flex-col p-4 lg:overflow-y-auto lg:p-6">
							<div className="mb-6 flex items-start justify-between gap-3">
								<div>
									<p className="text-sm font-semibold text-rose-500">LiveStudio</p>
									<h2 className="mt-1 text-2xl font-bold tracking-tight text-zinc-50">Setup Stream</h2>
									<p className="mt-1 text-sm text-zinc-500">
										Configure your studio environment before going live.
									</p>
								</div>
								<button
									type="button"
									onClick={() => { void navigate(-1); }}
									className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
									aria-label="Close"
								>
									<X className="h-5 w-5" />
								</button>
							</div>

							<div className="space-y-6">
								<div>
									<label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
										Stream title
									</label>
									<input
										value={title}
										onChange={e => setTitle(e.target.value)}
										placeholder="Morning Level-up Session: High Stakes Grinding."
										className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-rose-500/50 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
										maxLength={60}
									/>
								</div>

								<div>
									<p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
										Who can watch
									</p>
									<div className="grid grid-cols-3 gap-2">
										{VIS_OPTIONS.map(opt => {
											const selected = visibility === opt.value;
											const IconComp = opt.Icon;
											return (
												<button
													key={opt.value}
													type="button"
													onClick={() => { setVisibility(opt.value); }}
													className={
														'flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-all ' +
														(selected ?
															'border-rose-500 bg-rose-500/10 text-rose-400' :
															'border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700 hover:bg-zinc-900')
													}
												>
													<IconComp className={`h-5 w-5 ${selected ? 'text-rose-400' : 'text-zinc-500'}`} />
													<span className="text-[11px] font-semibold leading-tight">{opt.label}</span>
												</button>
											);
										})}
									</div>
								</div>

								<div>
									<p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
										Stream features
									</p>
									<div className="rounded-xl border border-zinc-800/90 bg-zinc-900/30 px-3">
										<FeatureToggleRow
											Icon={MessageCircle}
											title="Interactive Chat"
											description="Allow viewers to message"
											on={interactiveChat}
											setOn={setInteractiveChat}
										/>
										<FeatureToggleRow
											Icon={DollarSign}
											title="Direct Tips"
											description="Enable monetization"
											on={directTips}
											setOn={setDirectTips}
										/>
										<FeatureToggleRow
											Icon={Sparkles}
											title="Auto-Captions"
											description="AI real-time transcription"
											on={autoCaptions}
											setOn={setAutoCaptions}
										/>
									</div>
								</div>

								{goLiveError && (
									<p className="text-xs text-rose-400">{goLiveError}</p>
								)}
								{!liveWsReady && (
									<p className="text-xs text-zinc-500">Waiting for WebSocket…</p>
								)}

								<div className="pt-2">
									<button
										type="button"
										onClick={() => { handleGoLive(); }}
										disabled={!title.trim() || !liveWsReady}
										className={
											'flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 py-4 ' +
											'text-sm font-bold text-white shadow-lg shadow-rose-500/25 transition-all ' +
											'hover:bg-rose-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40'
										}
									>
										<Zap className="h-5 w-5" />
										Go Live Now
									</button>
									<p className="mt-3 text-center text-xs text-zinc-500">
										By going live, you agree to the{' '}
										<a href="#" className="text-rose-500 hover:underline">Streaming Guidelines</a>.
									</p>
								</div>
							</div>
						</div>
					</aside>
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
					<div className="flex items-center gap-2 bg-rose-500 rounded-xl px-3 py-1.5 shrink-0">
						<div className="w-2 h-2 bg-white rounded-full animate-pulse" />
						<span className="text-white text-xs font-bold">LIVE</span>
					</div>
					<div className="flex items-center gap-1.5 bg-background/70 text-foreground dark:bg-black/40 dark:text-white backdrop-blur-sm rounded-xl px-3 py-1.5 shrink-0">
						<Eye className="w-3.5 h-3.5 text-muted dark:text-white/60" />
						<span className="text-foreground dark:text-white text-xs font-semibold">{viewerSimCount}</span>
					</div>
					<div className="bg-background/70 text-foreground dark:bg-black/40 dark:text-white backdrop-blur-sm rounded-xl px-3 py-1.5 shrink-0">
						<span className="text-muted dark:text-white/50 text-xs font-mono">{elapsed}</span>
					</div>
					<div className="ml-auto flex items-center gap-2 shrink-0">
						<div className="flex items-center gap-1.5 bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 rounded-xl px-3 py-1.5">
							<DollarSign className="w-3.5 h-3.5 text-amber-400" />
							<span className="text-amber-400 text-xs font-semibold">{formatINR(totalGiftValue)}</span>
						</div>
						<button
							type="button"
							onClick={() => { setShowEndConfirm(true); }}
							className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/90 text-white border border-rose-400/40 hover:bg-rose-600 active:scale-[0.98] transition-all"
						>
							End
						</button>
					</div>
				</div>

				{showEndConfirm && (
					<div
						className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-black/55 backdrop-blur-sm"
						role="presentation"
						onClick={() => { setShowEndConfirm(false); }}
					>
						<div
							role="dialog"
							aria-modal="true"
							aria-labelledby="end-live-title"
							className="w-full max-w-sm rounded-2xl border border-border/20 bg-background text-foreground shadow-xl p-5 space-y-4"
							onClick={e => { e.stopPropagation(); }}
						>
							<h2 id="end-live-title" className="text-base font-bold text-foreground">End live stream?</h2>
							<p className="text-sm text-muted">Viewers will be disconnected and this broadcast will stop.</p>
							<div className="flex gap-2 justify-end pt-1">
								<button
									type="button"
									onClick={() => { setShowEndConfirm(false); }}
									className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-foreground/10 text-foreground hover:bg-foreground/15 transition-colors"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={() => {
										setShowEndConfirm(false);
										handleEndLive();
									}}
									className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-rose-500 text-white hover:bg-rose-600 transition-colors"
								>
									End stream
								</button>
							</div>
						</div>
					</div>
				)}

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

					<div className="px-4 pb-4">
						<form onSubmit={handleSendChat} className="flex gap-2">
							<input
								value={text}
								onChange={e => setText(e.target.value)}
								placeholder="Say something to viewers..."
								className="flex-1 bg-background/70 text-foreground dark:bg-white/10 dark:text-white backdrop-blur-sm border border-border/30 dark:border-white/15 rounded-2xl px-4 py-2.5 text-sm placeholder:text-muted focus:outline-none"
							/>
							<button
								type="submit"
								disabled={!text.trim()}
								className="w-10 h-10 shrink-0 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 rounded-xl flex items-center justify-center"
							>
								<Send className="w-4 h-4 text-white" />
							</button>
						</form>
					</div>
				</div>
			</div>
		</div>
	);
}
