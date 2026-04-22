import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AgoraRTC, { type ILocalAudioTrack, type ILocalVideoTrack, type IRemoteAudioTrack, type IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, Phone, RotateCcw, Minimize2, Clock, AlertTriangle } from '../../components/icons';
import { useCall } from '../../context/CallContext';
import { useSession } from '../../context/SessionContext';
import { useAuth } from '../../context/AuthContext';
import { useSessions } from '../../context/SessionsContext';
import { buildCallChannel, fetchAgoraRtcToken, getAgoraAppId, stringToAgoraUid } from '../../services/agoraRtc';
import { formatINR } from '../../services/razorpay';

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
	const [showControls, setShowControls] = useState(true);
	const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const localVideoRef = useRef<HTMLDivElement | null>(null);
	const remoteVideoRef = useRef<HTMLDivElement | null>(null);
	const localAudioTrackRef = useRef<ILocalAudioTrack | null>(null);
	const localVideoTrackRef = useRef<ILocalVideoTrack | null>(null);
	const remoteAudioTrackRef = useRef<IRemoteAudioTrack | null>(null);
	const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);
	const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
	const [agoraError, setAgoraError] = useState('');

	const isTimedSession = session && (session.type === 'audio' || session.type === 'video');
	const secondsRemaining = sessionState.secondsRemaining;
	const isWarning = isTimedSession && secondsRemaining <= 60 && secondsRemaining > 0;

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
	const isMuted = call?.isMuted ?? false;
	const isCameraOff = call?.isCameraOff ?? false;
	const isSpeakerOn = call?.isSpeakerOn ?? true;

	const timerDisplay = isTimedSession ?
		formatDuration(secondsRemaining) :
		formatDuration(elapsed);
	const hideControls = !showControls && isVideo;

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
		const client = AgoraRTC.createClient({ codec: 'vp8', mode: 'rtc' });
		setAgoraError('');

		if (bookingAgora?.dummy) {
			setAgoraError('Call is in dummy mode (Agora not configured).');
			return () => {};
		}

		client.on('user-published', (user, mediaType) => {
			void client.subscribe(user, mediaType).then(() => {
				if (mediaType === 'audio' && user.audioTrack) {
					remoteAudioTrackRef.current = user.audioTrack;
					if (isSpeakerOn) user.audioTrack.play();
				}
				if (mediaType === 'video' && user.videoTrack) {
					remoteVideoTrackRef.current = user.videoTrack;
					setHasRemoteVideo(true);
					if (remoteVideoRef.current) {
						user.videoTrack.play(remoteVideoRef.current);
					}
				}
			}).catch(() => {
				setAgoraError('Failed to subscribe remote media.');
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

		void fetchAgoraRtcToken(channelName, uid, 'host').then(token => (
			client.join(appId, channelName, bookingAgora?.token ?? token, uid).then(() => (
				AgoraRTC.createMicrophoneAudioTrack().then(audioTrack => {
					localAudioTrackRef.current = audioTrack;
					const audioOnly = (call?.type ?? callType) !== 'video';
					if (audioOnly) {
						return client.publish([audioTrack]);
					}
					return AgoraRTC.createCameraVideoTrack().then(videoTrack => {
						localVideoTrackRef.current = videoTrack;
						if (localVideoRef.current) videoTrack.play(localVideoRef.current);
						return client.publish([audioTrack, videoTrack]);
					});
				})
			))
		)).catch(() => {
			setAgoraError('Unable to connect media. Showing call preview.');
		});

		return () => {
			remoteAudioTrackRef.current?.stop();
			remoteAudioTrackRef.current = null;
			remoteVideoTrackRef.current?.stop();
			remoteVideoTrackRef.current = null;
			setHasRemoteVideo(false);

			const localAudioTrack = localAudioTrackRef.current;
			const localVideoTrack = localVideoTrackRef.current;
			localAudioTrackRef.current = null;
			localVideoTrackRef.current = null;

			const leavePromise = client.leave().catch(() => undefined);
			if (localAudioTrack) localAudioTrack.close();
			if (localVideoTrack) localVideoTrack.close();
			void leavePromise;
		};
	}, [authState.user, call?.id, call?.participantId, call?.type, session?.creatorId, sessionsBooking?.accepted.request_id]);

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
			{isVideo && hasRemoteVideo ? (
				<div ref={remoteVideoRef} className="absolute inset-0" />
			) : null}

			{isVideo && !hasRemoteVideo ? (
				<div className="absolute inset-0">
					<img
						src={participantAvatar}
						alt={participantName}
						className="w-full h-full object-cover scale-105"
					/>
					<div className="absolute inset-0 bg-background/30 dark:bg-black/30" />
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
							{isTimedSession && (
								<div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
									isWarning ? 'bg-rose-500/30 text-rose-300 animate-pulse' : 'bg-background/70 text-foreground/80 dark:bg-white/10 dark:text-white/70'
								}`}
								>
									{isWarning && <AlertTriangle className="w-3 h-3" />}
									<Clock className="w-3 h-3" />
									{timerDisplay} left
								</div>
							)}
							{!isTimedSession && (
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

				{isWarning && (
					<div className={`mx-6 bg-rose-500/20 border border-rose-500/30 rounded-2xl px-4 py-3 flex items-center gap-2 transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
						<AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
						<p className="text-sm text-rose-300 font-medium">1 minute remaining in your session</p>
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
						<ControlBtn active={!isMuted} onPress={toggleMute} icon={isMuted ? MicOff : Mic} label={isMuted ? 'Unmute' : 'Mute'} />
						{isVideo && (
							<ControlBtn active={!isCameraOff} onPress={toggleCamera} icon={isCameraOff ? VideoOff : Video} label={isCameraOff ? 'Camera off' : 'Camera'} />
						)}
						<ControlBtn active={isSpeakerOn} onPress={toggleSpeaker} icon={isSpeakerOn ? Volume2 : VolumeX} label="Speaker" />
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
