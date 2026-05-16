import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import AgoraRTC, {
	type IAgoraRTCClient,
	type ILocalAudioTrack,
	type ILocalVideoTrack,
	type IRemoteAudioTrack,
	type IRemoteVideoTrack,
} from 'agora-rtc-sdk-ng';
import { useAuth } from './AuthContext';
import { useCall } from './CallContext';
import { useSession } from './SessionContext';
import { useSessions } from './SessionsContext';
import { AGORA_TOKEN_ENDPOINT } from '../config/agora';
import { buildCallChannel, fetchAgoraRtcToken, getAgoraAppId, stringToAgoraUid } from '../services/agoraRtc';
import { ensureMediaPermissions, isDeviceInUseError } from '../services/mediaPermissions';
import type { CallStatus, TimedSession } from '../types';

function formatDuration(secs: number): string {
	const m = Math.floor(secs / 60).toString().padStart(2, '0');
	const s = (secs % 60).toString().padStart(2, '0');
	return `${m}:${s}`;
}

/** Benign SDK noise when `leave()` runs during HMR, Strict Mode, or route cleanup — not user-actionable. */
function shouldSuppressAgoraUiError(raw: string): boolean {
	const s = raw.toLowerCase();
	if (s.includes('ws_abort')) return true;
	if (s.includes('operation_aborted')) return true;
	return false;
}

/**
 * `subscribe()` can reject transiently (duplicate subscribe, DOM/route switch) while tracks stay valid
 * and `play()` succeeds — especially PiP ↔ full screen. Don't surface those as fatal UI errors.
 */
function shouldSuppressRemoteSubscribeError(err: unknown): boolean {
	const raw = err instanceof Error ? err.message : String(err);
	const s = raw.toLowerCase().trim();
	if (!s) return true;
	if (s.includes('ws_abort')) return true;
	if (s.includes('operation_aborted')) return true;
	if (s.includes('already')) return true;
	if (s.includes('duplicate')) return true;
	if (s.includes('invalid state')) return true;
	if (s.includes('subscribe aborted')) return true;
	return false;
}

function formatAgoraJoinError(raw: string, hadBookingToken: boolean): string {
	const lower = raw.toLowerCase();
	if (lower.includes('can_not_get_gateway_server') || lower.includes('dynamic use static key')) {
		if (!hadBookingToken && !AGORA_TOKEN_ENDPOINT) {
			return 'Video needs an RTC token. Set VITE_AGORA_TOKEN_ENDPOINT or pass agora.token from your server (projects with App Certificate require tokens).';
		}
		return 'Could not reach Agora. Confirm VITE_AGORA_APP_ID matches the project used to mint the token.';
	}
	return raw;
}

export function formatCallDuration(secs: number): string {
	return formatDuration(secs);
}

export type CallSessionCallType = 'audio' | 'video';

export type CallSessionSnapshot = {
	isActive: boolean,
	isMinimized: boolean,
	participantName: string,
	participantAvatar: string,
	callType: CallSessionCallType,
	callStatus: CallStatus | undefined,
	isVideo: boolean,
	isConnecting: boolean,
	isBookedCall: boolean,
	isTimedSession: boolean,
	secondsRemaining: number,
	activeSession: TimedSession | null,
	isMuted: boolean,
	isCameraOff: boolean,
	isSpeakerOn: boolean,
	hasRemoteVideo: boolean,
	agoraError: string,
	elapsed: number,
	bookedRemainingSec: number | null,
	isWarning: boolean,
	isBookedWarning: boolean,
	timerDisplay: string,
	ratePerMinute: number,
	totalCost: number,
};

type CallSessionContextValue = CallSessionSnapshot & {
	minimize: () => void,
	maximize: () => void,
	completeEndCall: () => void,
	toggleMute: () => void,
	toggleCamera: () => void,
	toggleSpeaker: () => void,
	attachLocalVideo: (el: HTMLDivElement | null) => void,
	attachRemoteVideo: (el: HTMLDivElement | null) => void,
};

const CallSessionContext = createContext<CallSessionContextValue | null>(null);

const delay = (ms: number) => new Promise<void>(resolve => { window.setTimeout(resolve, ms); });

export function CallSessionProvider({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate();
	const { state: callState, endCall: endCallCtx, toggleMute: toggleMuteCtx, toggleCamera: toggleCameraCtx, toggleSpeaker: toggleSpeakerCtx } = useCall();
	const { state: sessionState, endSessionEarly } = useSession();
	const { state: sessionsState, endSession: endBookedSession } = useSessions();
	const { state: authState } = useAuth();

	const call = callState.activeCall;
	const session = sessionState.activeSession;
	const sessionsBooking = sessionsState.active?.accepted?.kind === 'call' ? sessionsState.active : null;

	const [isMinimized, setIsMinimized] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [bookedRemainingSec, setBookedRemainingSec] = useState<number | null>(null);
	const [bookedMuted, setBookedMuted] = useState(false);
	const [bookedCameraOff, setBookedCameraOff] = useState(false);
	const [bookedSpeakerOn, setBookedSpeakerOn] = useState(true);
	const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
	const [agoraError, setAgoraError] = useState('');

	const localVideoContainerRef = useRef<HTMLDivElement | null>(null);
	const remoteVideoContainerRef = useRef<HTMLDivElement | null>(null);
	const localAudioTrackRef = useRef<ILocalAudioTrack | null>(null);
	const localVideoTrackRef = useRef<ILocalVideoTrack | null>(null);
	const remoteAudioTrackRef = useRef<IRemoteAudioTrack | null>(null);
	const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);
	const didPlayRemoteVideoRef = useRef(false);
	const speakerOnRef = useRef(true);
	const didAutoEndBookedRef = useRef<string | null>(null);
	const clientRef = useRef<IAgoraRTCClient | null>(null);
	const leaveSerialRef = useRef<Promise<void>>(Promise.resolve());
	const connectOpRef = useRef(0);
	const bookedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const isTimedSession = Boolean(session && (session.type === 'audio' || session.type === 'video'));
	const secondsRemaining = sessionState.secondsRemaining;

	const isActive = Boolean(call || session || sessionsBooking);

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
	const bookingCallType = sessionsBooking?.callModality ?? sessionsBooking?.uiCallType ?? 'video';
	const callType: CallSessionCallType = (call?.type ?? session?.type ?? bookingCallType) as CallSessionCallType;
	const callStatus = call?.status;
	const isVideo = callType === 'video';
	const isConnecting = callStatus === 'ringing' || callStatus === 'connecting';
	const isBookedCall = Boolean(sessionsBooking?.accepted?.request_id);
	const isMuted = call ? (call.isMuted ?? false) : bookedMuted;
	const isCameraOff = call ? (call.isCameraOff ?? false) : bookedCameraOff;
	const isSpeakerOn = call ? (call.isSpeakerOn ?? true) : bookedSpeakerOn;

	const isWarning = isTimedSession && secondsRemaining <= 60 && secondsRemaining > 0;
	const isBookedWarning = isBookedCall && (bookedRemainingSec ?? 0) <= 60 && (bookedRemainingSec ?? 0) > 0;

	const timerDisplay =
		isBookedCall && typeof bookedRemainingSec === 'number' ?
			formatDuration(bookedRemainingSec) :
			isTimedSession ?
				formatDuration(secondsRemaining) :
				formatDuration(elapsed);

	const bookedEndsAt =
		sessionsBooking?.accepted?.request_id && sessionsState.timer?.request_id === sessionsBooking.accepted.request_id ?
			sessionsState.timer.ends_at :
			(sessionsBooking?.accepted?.ends_at ?? null);

	const teardownAgora = useCallback((reason: 'end' | 'cleanup') => {
		remoteAudioTrackRef.current?.stop();
		remoteAudioTrackRef.current = null;
		remoteVideoTrackRef.current?.stop();
		remoteVideoTrackRef.current = null;
		setHasRemoteVideo(false);
		didPlayRemoteVideoRef.current = false;

		const localAudioTrack = localAudioTrackRef.current;
		const localVideoTrack = localVideoTrackRef.current;
		localAudioTrackRef.current = null;
		localVideoTrackRef.current = null;
		try { localAudioTrack?.close(); } catch { /* noop */ }
		try { localVideoTrack?.close(); } catch { /* noop */ }

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

	useEffect(() => {
		if (!isActive) {
			setIsMinimized(false);
			setElapsed(0);
			setBookedRemainingSec(null);
			setBookedMuted(false);
			setBookedCameraOff(false);
			setBookedSpeakerOn(true);
		}
	}, [isActive]);

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

	useEffect(() => {
		const roomId = sessionsBooking?.accepted?.room_id ?? '';
		if (!roomId) return;
		if (!sessionsState.endedRooms[roomId]) return;
		teardownAgora('end');
	}, [sessionsBooking?.accepted?.room_id, sessionsState.endedRooms, teardownAgora]);

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
			endCallCtx();
			navigate(-1);
		}
	}, [session, isTimedSession, endCallCtx, navigate]);

	useEffect(() => {
		speakerOnRef.current = isSpeakerOn;
	}, [isSpeakerOn]);

	const attachLocalVideo = useCallback((el: HTMLDivElement | null) => {
		localVideoContainerRef.current = el;
		const track = localVideoTrackRef.current;
		if (el && track) {
			try {
				track.play(el);
			} catch {
				// ignore
			}
		}
	}, []);

	const attachRemoteVideo = useCallback((el: HTMLDivElement | null) => {
		remoteVideoContainerRef.current = el;
		didPlayRemoteVideoRef.current = false;
		const track = remoteVideoTrackRef.current;
		if (el && track) {
			try {
				track.play(el);
				didPlayRemoteVideoRef.current = true;
				setAgoraError('');
			} catch {
				// ignore
			}
		}
	}, []);

	useEffect(() => {
		if ((!call && !sessionsBooking) || !authState.user) return;

		const me = authState.user;
		const participantId =
			call?.participantId ||
			session?.creatorId ||
			(sessionsBooking?.accepted ? 'other' : 'unknown');

		const bookingAgora = sessionsBooking?.accepted?.agora ?? null;
		const channelName =
			bookingAgora?.channel_name ||
			(sessionsBooking?.accepted?.room_id ?? '') ||
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

		const run = () => {
			let receiveOnly = false;

			const cancelledNow = () => cancelled || opId !== connectOpRef.current;

			const getToken = () => {
				if (bookingAgora?.token) return Promise.resolve(bookingAgora.token);
				return fetchAgoraRtcToken(channelName, uid, 'host').then(t => t ?? null);
			};

			const joinWithRetry = (token: string | null, attempt: number): Promise<void> => {
				const c = client;
				if (!c) return Promise.resolve();
				if (cancelledNow()) return Promise.resolve();
				return c.join(appId, channelName, token, uid)
					.then(() => undefined)
					.catch(e => {
						const msg = e instanceof Error ? e.message : String(e);
						if (/UID_CONFLICT/i.test(msg) && attempt < 3) {
							return delay(1200).then(() => joinWithRetry(token, attempt + 1));
						}
						throw e;
					});
			};

			const publishTracks = () => {
				const c = client;
				if (!c) return Promise.resolve();
				if (cancelledNow()) return Promise.resolve();
				if (receiveOnly) return Promise.resolve();

				return AgoraRTC.createMicrophoneAudioTrack().then(audioTrack => {
					localAudioTrackRef.current = audioTrack;
					if (audioOnly) return c.publish([audioTrack]);
					return AgoraRTC.createCameraVideoTrack().then(videoTrack => {
						localVideoTrackRef.current = videoTrack;
						const el = localVideoContainerRef.current;
						if (el) {
							try {
								videoTrack.play(el);
							} catch {
								// Avoid rejecting join pipeline on benign play errors during teardown
							}
						}
						return c.publish([audioTrack, videoTrack]);
					});
				}).then(() => undefined);
			};

			return leaveSerialRef.current
				.then(() => {
					if (cancelledNow()) return;
					return ensureMediaPermissions({ audio: true, video: !audioOnly }).catch(e => {
						if (!isDeviceInUseError(e)) throw e;
						receiveOnly = true;
						setBookedMuted(true);
						setBookedCameraOff(true);
						setAgoraError('Device is in use. Joined in receive-only mode.');
					});
				})
				.then(() => {
					if (cancelledNow()) return;

					client = AgoraRTC.createClient({ codec: 'vp8', mode: 'rtc' });
					clientRef.current = client;

					client.on('user-published', (user, mediaType) => {
						void client?.subscribe(user, mediaType).then(() => {
							setAgoraError('');
							if (mediaType === 'audio' && user.audioTrack) {
								remoteAudioTrackRef.current = user.audioTrack;
								if (speakerOnRef.current) user.audioTrack.play();
							}
							if (mediaType === 'video' && user.videoTrack) {
								remoteVideoTrackRef.current = user.videoTrack;
								setHasRemoteVideo(true);
								didPlayRemoteVideoRef.current = false;
							}
						}).catch(err => {
							if (shouldSuppressRemoteSubscribeError(err)) return;
							const msg = err instanceof Error ? err.message : String(err);
							if (shouldSuppressAgoraUiError(msg)) return;
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
				})
				.then(() => {
					if (cancelledNow()) return null;
					return getToken();
				})
				.then(token => {
					if (cancelledNow()) return;
					if (token === null && cancelledNow()) return;
					return joinWithRetry(token ?? null, 0);
				})
				.then(() => publishTracks());
		};

		void run().catch(e => {
			const raw = e instanceof Error ? e.message : String(e);
			if (shouldSuppressAgoraUiError(raw)) return;
			setAgoraError(formatAgoraJoinError(raw, Boolean(bookingAgora?.token)));
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
	}, [authState.user, call?.id, call?.participantId, call?.type, session?.creatorId, sessionsBooking?.accepted?.request_id, callType, teardownAgora]);

	useEffect(() => {
		if (!isVideo) return;
		if (!hasRemoteVideo) return;
		if (didPlayRemoteVideoRef.current) return;
		const el = remoteVideoContainerRef.current;
		const track = remoteVideoTrackRef.current;
		if (!el || !track) return;
		try {
			track.play(el);
			didPlayRemoteVideoRef.current = true;
		} catch {
			// ignore
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

	useEffect(() => {
		if (!isVideo) return;
		if (isCameraOff) return;
		const localVideoTrack = localVideoTrackRef.current;
		const el = localVideoContainerRef.current;
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

	const minimize = useCallback(() => {
		setIsMinimized(true);
	}, []);

	const maximize = useCallback(() => {
		setIsMinimized(false);
	}, []);

	const completeEndCall = useCallback(() => {
		teardownAgora('end');
		if (sessionsBooking?.accepted) {
			void endBookedSession(sessionsBooking.accepted.request_id).catch(() => {});
		}
		if (isTimedSession) {
			endSessionEarly();
		}
		endCallCtx();
		setIsMinimized(false);
		navigate(-1);
	}, [teardownAgora, sessionsBooking?.accepted, isTimedSession, endSessionEarly, endCallCtx, navigate]);

	const toggleMute = useCallback(() => {
		if (call) toggleMuteCtx();
		else setBookedMuted(v => !v);
	}, [call, toggleMuteCtx]);

	const toggleCamera = useCallback(() => {
		if (call) toggleCameraCtx();
		else setBookedCameraOff(v => !v);
	}, [call, toggleCameraCtx]);

	const toggleSpeaker = useCallback(() => {
		if (call) toggleSpeakerCtx();
		else setBookedSpeakerOn(v => !v);
	}, [call, toggleSpeakerCtx]);

	const snapshot = useMemo<CallSessionSnapshot>(() => ({
		isActive,
		isMinimized,
		participantName,
		participantAvatar,
		callType,
		callStatus,
		isVideo,
		isConnecting,
		isBookedCall,
		isTimedSession,
		secondsRemaining,
		activeSession: session,
		isMuted,
		isCameraOff,
		isSpeakerOn,
		hasRemoteVideo,
		agoraError,
		elapsed,
		bookedRemainingSec,
		isWarning,
		isBookedWarning,
		timerDisplay,
		ratePerMinute: session?.ratePerMinute ?? 0,
		totalCost: session?.totalCost ?? 0,
	}), [
		isActive,
		isMinimized,
		participantName,
		participantAvatar,
		callType,
		callStatus,
		isVideo,
		isConnecting,
		isBookedCall,
		isTimedSession,
		secondsRemaining,
		session,
		isMuted,
		isCameraOff,
		isSpeakerOn,
		hasRemoteVideo,
		agoraError,
		elapsed,
		bookedRemainingSec,
		isWarning,
		isBookedWarning,
		timerDisplay,
	]);

	const value = useMemo<CallSessionContextValue>(() => ({
		...snapshot,
		minimize,
		maximize,
		completeEndCall,
		toggleMute,
		toggleCamera,
		toggleSpeaker,
		attachLocalVideo,
		attachRemoteVideo,
	}), [snapshot, minimize, maximize, completeEndCall, toggleMute, toggleCamera, toggleSpeaker, attachLocalVideo, attachRemoteVideo]);

	return (
		<CallSessionContext.Provider value={value}>
			{children}
		</CallSessionContext.Provider>
	);
}

export function useCallSession(): CallSessionContextValue {
	const ctx = useContext(CallSessionContext);
	if (!ctx) throw new Error('useCallSession must be used within CallSessionProvider');
	return ctx;
}
