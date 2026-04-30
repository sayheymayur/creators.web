import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AgoraRTC, { type IAgoraRTCClient, type ILocalAudioTrack, type ILocalVideoTrack, type IRemoteAudioTrack, type IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, Phone, RotateCcw, Minimize2, Clock, AlertTriangle } from '../../components/icons';
import { useCall } from '../../context/CallContext';
import { useSession } from '../../context/SessionContext';
import { useAuth } from '../../context/AuthContext';
import { useSessions } from '../../context/SessionsContext';
import { buildCallChannel, fetchAgoraRtcToken, getAgoraAppId, stringToAgoraUid } from '../../services/agoraRtc';
import { formatINR } from '../../services/razorpay';
import { ensureMediaPermissions, isDeviceInUseError } from '../../services/mediaPermissions';

function formatDuration(secs: number): string {
	const m = Math.floor(secs / 60).toString().padStart(2, '0');
	const s = (secs % 60).toString().padStart(2, '0');
	return `${m}:${s}`;
}

export function ActiveCallScreen() {
	const navigate = useNavigate();
	const { state: callState, endCall, toggleMute, toggleCamera, toggleSpeaker } = useCall();
	const { state: sessionState, endSessionEarly } = useSession();
	const { state: sessionsState, endSession: endBookedSession } = useSessions();
	const { state: authState } = useAuth();
	const call = callState.activeCall;
	const session = sessionState.activeSession;
	const sessionsBooking = sessionsState.active?.accepted?.kind === 'call' ? sessionsState.active : null;
	const [elapsed, setElapsed] = useState(0);
	const [bookedRemainingSec, setBookedRemainingSec] = useState<number | null>(null);
	const [showControls, setShowControls] = useState(true);
	const [bookedMuted, setBookedMuted] = useState(false);
	const [bookedCameraOff, setBookedCameraOff] = useState(false);
	const [bookedSpeakerOn, setBookedSpeakerOn] = useState(true);
	const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const bookedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const localVideoRef = useRef<HTMLDivElement | null>(null);
	const remoteVideoRef = useRef<HTMLDivElement | null>(null);
	const localAudioTrackRef = useRef<ILocalAudioTrack | null>(null);
	const localVideoTrackRef = useRef<ILocalVideoTrack | null>(null);
	const remoteAudioTrackRef = useRef<IRemoteAudioTrack | null>(null);
	const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);
	const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
	const [agoraError, setAgoraError] = useState('');
	const didPlayRemoteVideoRef = useRef(false);
	const speakerOnRef = useRef(true);
	const didAutoEndBookedRef = useRef<string | null>(null);
	const clientRef = useRef<IAgoraRTCClient | null>(null);
	const leaveSerialRef = useRef<Promise<void>>(Promise.resolve());
	const connectOpRef = useRef(0);

	const delay = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

	const isTimedSession = session && (session.type === 'audio' || session.type === 'video');
	const secondsRemaining = sessionState.secondsRemaining;
	const isWarning = isTimedSession && secondsRemaining <= 60 && secondsRemaining > 0;

	const bookedEndsAt =
		sessionsBooking?.accepted?.request_id && sessionsState.timer?.request_id === sessionsBooking.accepted.request_id ?
			sessionsState.timer.ends_at :
			(sessionsBooking?.accepted?.ends_at ?? null);

	useEffect(() => {
		if (!sessionsBooking?.accepted?.request_id) {
			setBookedRemainingSec(null);
			if (bookedTimerRef.current) clearInterval(bookedTimerRef.current);
			bookedTimerRef.current = null;
			didAutoEndBookedRef.current = null;
			return;
		}
		if (!bookedEndsAt) {
			setBookedRemainingSec(null);
			if (bookedTimerRef.current) clearInterval(bookedTimerRef.current);
			bookedTimerRef.current = null;
			return;
		}
		const endsAtMs = new Date(bookedEndsAt).getTime();
		if (!Number.isFinite(endsAtMs)) return;
		const tick = () => {
			const rem = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000));
			setBookedRemainingSec(rem);
		};
		tick();
		if (bookedTimerRef.current) clearInterval(bookedTimerRef.current);
		bookedTimerRef.current = setInterval(tick, 1000);
		return () => {
			if (bookedTimerRef.current) clearInterval(bookedTimerRef.current);
			bookedTimerRef.current = null;
		};
	}, [sessionsBooking?.accepted?.request_id, bookedEndsAt]);

	const teardownAgora = useCallback((reason: 'end' | 'cleanup') => {
		// Stop remote playback immediately
		remoteAudioTrackRef.current?.stop();
		remoteAudioTrackRef.current = null;
		remoteVideoTrackRef.current?.stop();
		remoteVideoTrackRef.current = null;
		setHasRemoteVideo(false);
		didPlayRemoteVideoRef.current = false;

		// Close local devices (turn off camera/mic lights)
		const localAudioTrack = localAudioTrackRef.current;
		const localVideoTrack = localVideoTrackRef.current;
		localAudioTrackRef.current = null;
		localVideoTrackRef.current = null;
		try { localAudioTrack?.close(); } catch { /* noop */ }
		try { localVideoTrack?.close(); } catch { /* noop */ }

		// Leave Agora channel; serialize leave to prevent UID_CONFLICT on fast reload/rejoin
		const client = clientRef.current;
		clientRef.current = null;
		if (client) {
			leaveSerialRef.current = leaveSerialRef.current
				.then(() => client.leave())
				.then(() => undefined)
				.catch(() => undefined);
		}

		if (reason === 'end') setAgoraError('');
	}, []);

	// Best-effort cleanup on reload/navigation so Agora releases UID faster.
	useEffect(() => {
		const onPageHide = () => {
			teardownAgora('cleanup');
		};
		window.addEventListener('pagehide', onPageHide);
		window.addEventListener('beforeunload', onPageHide);
		return () => {
			window.removeEventListener('pagehide', onPageHide);
			window.removeEventListener('beforeunload', onPageHide);
		};
	}, [teardownAgora]);

	// Auto-end booked calls when timer reaches 0 (covers cases where worker:sessions isn't running).
	useEffect(() => {
		const booking = sessionsBooking?.accepted;
		if (!booking) return;
		const roomId = booking.room_id;
		if (roomId && sessionsState.endedRooms[roomId]) return;
		if (typeof bookedRemainingSec !== 'number') return;
		if (bookedRemainingSec > 0) return;
		if (didAutoEndBookedRef.current === booking.request_id) return;
		didAutoEndBookedRef.current = booking.request_id;
		teardownAgora('end');
		void endBookedSession(booking.request_id).catch(() => {});
	}, [sessionsBooking?.accepted?.request_id, sessionsBooking?.accepted?.room_id, bookedRemainingSec, sessionsState.endedRooms, endBookedSession, teardownAgora]);

	// When a booking ends (manual/timeout), force-teardown media so devices switch off immediately.
	useEffect(() => {
		const roomId = sessionsBooking?.accepted?.room_id ?? '';
		if (!roomId) return;
		if (!sessionsState.endedRooms[roomId]) return;
		teardownAgora('end');
	}, [sessionsBooking?.accepted?.room_id, sessionsState.endedRooms, teardownAgora]);

	useEffect(() => {
		if (!call && !session && !sessionsBooking) {
			navigate(-1);
		}
	}, [call, session, sessionsBooking, navigate]);

	useEffect(() => {
		if (!isTimedSession && call?.status === 'active') {
			elapsedTimerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
		}
		return () => {
			if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
		};
	}, [call?.status, isTimedSession]);

	useEffect(() => {
		if (isTimedSession && !session) {
			endCall();
			navigate(-1);
		}
	}, [session, isTimedSession]);

	function resetControlsTimer() {
		setShowControls(true);
		if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
		const isVideo = call?.type === 'video' || session?.type === 'video';
		if (isVideo) {
			controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
		}
	}

	useEffect(() => {
		resetControlsTimer();
		return () => {
			if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
		};
	}, [call?.type, session?.type]);

	function handleEndCall() {
		teardownAgora('end');
		if (sessionsBooking?.accepted) {
			void endBookedSession(sessionsBooking.accepted.request_id).catch(() => {});
		}
		if (isTimedSession) {
			endSessionEarly();
		}
		endCall();
		navigate(-1);
	}

	const participantName =
		call?.participantName ??
		session?.creatorName ??
		sessionsBooking?.otherDisplay?.name ??
		'';
	const participantAvatar =
		call?.participantAvatar ??
		session?.creatorAvatar ??
		sessionsBooking?.otherDisplay?.avatar ??
		'';
	const bookingCallType = sessionsBooking?.uiCallType ?? 'video';
	const callType = call?.type ?? session?.type ?? bookingCallType;
	const callStatus = call?.status;
	const isVideo = callType === 'video';
	const isConnecting = callStatus === 'ringing' || callStatus === 'connecting';
	const isBookedCall = !!sessionsBooking?.accepted?.request_id;
	const isMuted = call ? (call.isMuted ?? false) : bookedMuted;
	const isCameraOff = call ? (call.isCameraOff ?? false) : bookedCameraOff;
	const isSpeakerOn = call ? (call.isSpeakerOn ?? true) : bookedSpeakerOn;

	const isBookedWarning = isBookedCall && (bookedRemainingSec ?? 0) <= 60 && (bookedRemainingSec ?? 0) > 0;

	const timerDisplay =
		isBookedCall && typeof bookedRemainingSec === 'number' ?
			formatDuration(bookedRemainingSec) :
			isTimedSession ?
				formatDuration(secondsRemaining) :
				formatDuration(elapsed);
	const hideControls = !showControls && isVideo;

	const onToggleMute = () => {
		if (call) toggleMute();
		else setBookedMuted(v => !v);
	};
	const onToggleCamera = () => {
		if (call) toggleCamera();
		else setBookedCameraOff(v => !v);
	};
	const onToggleSpeaker = () => {
		if (call) toggleSpeaker();
		else setBookedSpeakerOn(v => !v);
	};

	useEffect(() => {
		speakerOnRef.current = isSpeakerOn;
	}, [isSpeakerOn]);

	useEffect(() => {
		if ((!call && !sessionsBooking) || !authState.user) return;

		const me = authState.user;
		const participantId =
			call?.participantId ||
			session?.creatorId ||
			(sessionsBooking?.accepted ? (sessionsBooking.otherDisplay ? 'other' : 'other') : 'unknown');

		const bookingAgora = sessionsBooking?.accepted.agora ?? null;
		const channelName =
			bookingAgora?.channel_name ||
			(sessionsBooking?.accepted.room_id ?? '') ||
			buildCallChannel(me.id, participantId);
		const uid = bookingAgora?.uid ?? stringToAgoraUid(me.id);
		const appId = bookingAgora?.app_id ?? getAgoraAppId();

		if (bookingAgora?.dummy) {
			setAgoraError('Call is in dummy mode (Agora not configured).');
			return () => {};
		}

		const audioOnly = (call?.type ?? callType) !== 'video';
		const opId = (connectOpRef.current += 1);
		let cancelled = false;
		let client: IAgoraRTCClient | null = null;

		setAgoraError('');

		const run = async () => {
			// Ensure any previous client has fully left before we create a new one.
			await leaveSerialRef.current;
			if (cancelled || opId !== connectOpRef.current) return;

			let receiveOnly = false;
			try {
				await ensureMediaPermissions({ audio: true, video: !audioOnly });
			} catch (e) {
				if (!isDeviceInUseError(e)) throw e;
				// Continue in receive-only mode (join but don't publish).
				receiveOnly = true;
				setBookedMuted(true);
				setBookedCameraOff(true);
				setAgoraError('Device is in use. Joined in receive-only mode.');
			}
			if (cancelled || opId !== connectOpRef.current) return;

			client = AgoraRTC.createClient({ codec: 'vp8', mode: 'rtc' });
			clientRef.current = client;

			client.on('user-published', (user, mediaType) => {
				void client?.subscribe(user, mediaType).then(() => {
					if (mediaType === 'audio' && user.audioTrack) {
						remoteAudioTrackRef.current = user.audioTrack;
						if (speakerOnRef.current) user.audioTrack.play();
					}
					if (mediaType === 'video' && user.videoTrack) {
						remoteVideoTrackRef.current = user.videoTrack;
						setHasRemoteVideo(true);
						didPlayRemoteVideoRef.current = false;
					}
				}).catch(() => {
					setAgoraError('Failed to subscribe remote media.');
				});
			});

			client.on('user-unpublished', (_user, mediaType) => {
				if (mediaType === 'video') {
					setHasRemoteVideo(false);
					remoteVideoTrackRef.current?.stop();
					remoteVideoTrackRef.current = null;
					didPlayRemoteVideoRef.current = false;
				}
				if (mediaType === 'audio') {
					remoteAudioTrackRef.current?.stop();
					remoteAudioTrackRef.current = null;
				}
			});

			const token = bookingAgora?.token ?? await fetchAgoraRtcToken(channelName, uid, 'host') ?? null;

			// Retry join on UID_CONFLICT: old connection may still be releasing after reload.
			for (let attempt = 0; attempt < 4; attempt += 1) {
				if (cancelled || opId !== connectOpRef.current) return;
				try {
					await client.join(appId, channelName, token, uid);
					break;
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					if (/UID_CONFLICT/i.test(msg) && attempt < 3) {
						await delay(1200);
						continue;
					}
					throw e;
				}
			}

			if (cancelled || opId !== connectOpRef.current) return;

			// If device is in use, don't try to publish tracks; remain receive-only.
			if (!receiveOnly) {
				const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
				localAudioTrackRef.current = audioTrack;
				if (audioOnly) {
					await client.publish([audioTrack]);
					return;
				}
				const videoTrack = await AgoraRTC.createCameraVideoTrack();
				localVideoTrackRef.current = videoTrack;
				if (localVideoRef.current) videoTrack.play(localVideoRef.current);
				await client.publish([audioTrack, videoTrack]);
			}
		};

		void run().catch(e => {
			const msg = e instanceof Error ? e.message : 'Unable to connect media. Showing call preview.';
			setAgoraError(msg);
		});

		return () => {
			cancelled = true;
			if (client && clientRef.current === client) clientRef.current = null;
			if (client) {
				leaveSerialRef.current = leaveSerialRef.current
					.then(() => client?.leave())
					.then(() => undefined)
					.catch(() => undefined);
			}
			teardownAgora('cleanup');
		};
	}, [authState.user, call?.id, call?.participantId, call?.type, session?.creatorId, sessionsBooking?.accepted.request_id, callType, teardownAgora]);

	// Ensure remote video attaches even if it was published before the DOM ref existed.
	useEffect(() => {
		if (!isVideo) return;
		if (!hasRemoteVideo) return;
		if (didPlayRemoteVideoRef.current) return;
		const el = remoteVideoRef.current;
		const track = remoteVideoTrackRef.current;
		if (!el || !track) return;
		try {
			track.play(el);
			didPlayRemoteVideoRef.current = true;
		} catch {
			// ignore; next render/tick may succeed
		}
	}, [isVideo, hasRemoteVideo]);

	useEffect(() => {
		const localAudioTrack = localAudioTrackRef.current;
		if (!localAudioTrack) return;
		void localAudioTrack.setEnabled(!isMuted);
	}, [isMuted]);

	useEffect(() => {
		const localVideoTrack = localVideoTrackRef.current;
		if (!localVideoTrack) return;
		void localVideoTrack.setEnabled(!isCameraOff);
	}, [isCameraOff]);

	// When we hide the local preview (camera off), the DOM element unmounts.
	// On re-enable we must re-attach the existing track to the new element.
	useEffect(() => {
		if (!isVideo) return;
		if (isCameraOff) return;
		const localVideoTrack = localVideoTrackRef.current;
		const el = localVideoRef.current;
		if (!localVideoTrack || !el) return;
		try {
			localVideoTrack.play(el);
		} catch {
			// ignore
		}
	}, [isVideo, isCameraOff]);

	useEffect(() => {
		const remoteAudioTrack = remoteAudioTrackRef.current;
		if (!remoteAudioTrack) return;
		if (isSpeakerOn) remoteAudioTrack.play();
		else remoteAudioTrack.stop();
	}, [isSpeakerOn]);

	return (
		<div
			className="fixed inset-0 z-[300] bg-overlay flex flex-col"
			onTouchStart={resetControlsTimer}
			onClick={resetControlsTimer}
		>
			{isVideo ? (
				<div className="absolute inset-0 pointer-events-none">
					{/* Always mount the remote container so Agora can attach reliably */}
					<div
						ref={remoteVideoRef}
						className="absolute inset-0 pointer-events-none [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
					/>

					{/* Fallback when remote video isn't published */}
					{!hasRemoteVideo && (
						<div className="absolute inset-0 pointer-events-none">
							<img
								src={participantAvatar}
								alt={participantName}
								className="w-full h-full object-cover scale-105"
							/>
							<div className="absolute inset-0 bg-background/30 dark:bg-black/30" />
						</div>
					)}
				</div>
			) : (
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="absolute inset-0 bg-gradient-to-b from-surface2 to-overlay" />
					<div className="relative flex flex-col items-center gap-5">
						<div className="relative">
							<div className="absolute inset-0 rounded-full bg-rose-500/10 animate-ping scale-150" />
							<img
								src={participantAvatar}
								alt={participantName}
								className="relative w-28 h-28 rounded-full object-cover border-4 border-border/20"
							/>
						</div>
					</div>
				</div>
			)}

			<div className="relative z-10 flex flex-col h-full">
				<div className={`pt-14 pb-4 px-6 text-center transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
					<h1 className="text-2xl font-bold text-foreground dark:text-white drop-shadow-lg">{participantName}</h1>
					{isConnecting ? (
						<p className="text-muted dark:text-white/60 text-sm mt-1 animate-pulse">
							{callStatus === 'ringing' ? 'Ringing…' : 'Connecting…'}
						</p>
					) : (
						<div className="flex items-center justify-center gap-2 mt-1">
							{(isTimedSession || (isBookedCall && typeof bookedRemainingSec === 'number')) && (
								<div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
									(isWarning || isBookedWarning) ? 'bg-rose-500/30 text-rose-300 animate-pulse' : 'bg-background/70 text-foreground/80 dark:bg-white/10 dark:text-white/70'
								}`}
								>
									{(isWarning || isBookedWarning) && <AlertTriangle className="w-3 h-3" />}
									<Clock className="w-3 h-3" />
									{timerDisplay} left
								</div>
							)}
							{!isTimedSession && !(isBookedCall && typeof bookedRemainingSec === 'number') && (
								<p className="text-muted dark:text-white/60 text-sm tabular-nums">{timerDisplay}</p>
							)}
						</div>
					)}

					{isTimedSession && (
						<p className="text-xs text-muted/70 dark:text-white/30 mt-1">
							{formatINR(session.ratePerMinute)}/min · {formatINR(session.totalCost)} total
						</p>
					)}
				</div>

				{(isWarning || isBookedWarning) && (
					<div className={`mx-6 bg-rose-500/20 border border-rose-500/30 rounded-2xl px-4 py-3 flex items-center gap-2 transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
						<AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
						<p className="text-sm text-rose-300 font-medium">1 minute remaining</p>
					</div>
				)}

				{isVideo && !isCameraOff && (
					<div className="absolute top-16 right-4 z-20">
						<div className="w-24 h-32 sm:w-28 sm:h-36 rounded-2xl overflow-hidden border-2 border-border/20 shadow-xl bg-surface2">
							<div ref={localVideoRef} className="w-full h-full bg-gradient-to-br from-rose-900/40 to-surface2" />
						</div>
					</div>
				)}

				{agoraError && (
					<div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-rose-500/20 border border-rose-500/30 rounded-xl px-3 py-1.5">
						<p className="text-xs text-rose-300">{agoraError}</p>
					</div>
				)}

				<div className={`mt-auto pb-14 px-8 transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
					<div className="flex items-center justify-center gap-5 mb-8">
						<ControlBtn active={!isMuted} onPress={onToggleMute} icon={isMuted ? MicOff : Mic} label={isMuted ? 'Unmute' : 'Mute'} />
						{isVideo && (
							<ControlBtn active={!isCameraOff} onPress={onToggleCamera} icon={isCameraOff ? VideoOff : Video} label={isCameraOff ? 'Camera off' : 'Camera'} />
						)}
						<ControlBtn active={isSpeakerOn} onPress={onToggleSpeaker} icon={isSpeakerOn ? Volume2 : VolumeX} label="Speaker" />
						{isVideo && (
							<ControlBtn active={false} onPress={() => {}} icon={RotateCcw} label="Flip" />
						)}
					</div>

					<div className="flex justify-center">
						<button
							onClick={handleEndCall}
							className="w-16 h-16 bg-rose-500 hover:bg-rose-600 rounded-full flex items-center justify-center shadow-xl shadow-rose-500/40 transition-all active:scale-90"
						>
							<Phone className="w-7 h-7 text-white rotate-[135deg]" />
						</button>
					</div>

					<div className="flex justify-center mt-6">
						<button
							onClick={() => { void navigate(-1); }}
							className="flex items-center gap-1.5 text-muted dark:text-white/40 hover:text-foreground dark:hover:text-white/70 text-xs transition-colors"
						>
							<Minimize2 className="w-3.5 h-3.5" />
							Minimize
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function ControlBtn({
	active,
	onPress,
	icon: Icon,
	label,
}: {
	active: boolean,
	onPress: () => void,
	icon: React.ElementType,
	label: string,
}) {
	return (
		<div className="flex flex-col items-center gap-2">
			<button
				onClick={onPress}
				className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
					active ?
						'bg-background/70 hover:bg-background/90 text-foreground dark:bg-white/15 dark:hover:bg-white/20 dark:text-white' :
						'bg-background/50 hover:bg-background/70 text-foreground/70 dark:bg-white/8 dark:hover:bg-white/12 dark:text-white opacity-60'
				}`}
			>
				<Icon className="w-6 h-6 text-foreground dark:text-white" />
			</button>
			<span className="text-[10px] text-muted dark:text-white/40">{label}</span>
		</div>
	);
}
