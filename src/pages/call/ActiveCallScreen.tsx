import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, Phone, RotateCcw, Minimize2, Clock, AlertTriangle } from '../../components/icons';
import { useCall } from '../../context/CallContext';
import { useSession } from '../../context/SessionContext';

function formatDuration(secs: number): string {
	const m = Math.floor(secs / 60).toString().padStart(2, '0');
	const s = (secs % 60).toString().padStart(2, '0');
	return `${m}:${s}`;
}

export function ActiveCallScreen() {
	const navigate = useNavigate();
	const { state: callState, endCall, toggleMute, toggleCamera, toggleSpeaker } = useCall();
	const { state: sessionState, endSessionEarly } = useSession();
	const call = callState.activeCall;
	const session = sessionState.activeSession;
	const [elapsed, setElapsed] = useState(0);
	const [showControls, setShowControls] = useState(true);
	const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const isTimedSession = session && (session.type === 'audio' || session.type === 'video');
	const secondsRemaining = sessionState.secondsRemaining;
	const isWarning = isTimedSession && secondsRemaining <= 60 && secondsRemaining > 0;

	useEffect(() => {
		if (!call && !session) {
			navigate(-1);
		}
	}, [call, session, navigate]);

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
		if (isTimedSession) {
			endSessionEarly();
		}
		endCall();
		navigate(-1);
	}

	const participantName = call?.participantName ?? session?.creatorName ?? '';
	const participantAvatar = call?.participantAvatar ?? session?.creatorAvatar ?? '';
	const callType = call?.type ?? session?.type;
	const callStatus = call?.status;
	const isVideo = callType === 'video';
	const isConnecting = callStatus === 'ringing' || callStatus === 'connecting';
	const isMuted = call?.isMuted ?? false;
	const isCameraOff = call?.isCameraOff ?? false;
	const isSpeakerOn = call?.isSpeakerOn ?? true;

	const timerDisplay = isTimedSession ?
		formatDuration(secondsRemaining) :
		formatDuration(elapsed);

	return (
		<div
			className="fixed inset-0 z-[300] bg-[#0a0a0a] flex flex-col"
			onTouchStart={resetControlsTimer}
			onClick={resetControlsTimer}
		>
			{isVideo ? (
				<div className="absolute inset-0">
					<img
						src={participantAvatar}
						alt={participantName}
						className="w-full h-full object-cover scale-105"
					/>
					<div className="absolute inset-0 bg-black/30" />
				</div>
			) : (
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="absolute inset-0 bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a]" />
					<div className="relative flex flex-col items-center gap-5">
						<div className="relative">
							<div className="absolute inset-0 rounded-full bg-rose-500/10 animate-ping scale-150" />
							<img
								src={participantAvatar}
								alt={participantName}
								className="relative w-28 h-28 rounded-full object-cover border-4 border-white/10"
							/>
						</div>
					</div>
				</div>
			)}

			<div className={`relative z-10 flex flex-col h-full transition-opacity duration-300 ${!showControls && isVideo ? 'opacity-0' : 'opacity-100'}`}>
				<div className="pt-14 pb-4 px-6 text-center">
					<h1 className="text-2xl font-bold text-white drop-shadow-lg">{participantName}</h1>
					{isConnecting ? (
						<p className="text-white/60 text-sm mt-1 animate-pulse">
							{callStatus === 'ringing' ? 'Ringing…' : 'Connecting…'}
						</p>
					) : (
						<div className="flex items-center justify-center gap-2 mt-1">
							{isTimedSession && (
								<div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
									isWarning ? 'bg-rose-500/30 text-rose-300 animate-pulse' : 'bg-white/10 text-white/70'
								}`}
								>
									{isWarning && <AlertTriangle className="w-3 h-3" />}
									<Clock className="w-3 h-3" />
									{timerDisplay} left
								</div>
							)}
							{!isTimedSession && (
								<p className="text-white/60 text-sm tabular-nums">{timerDisplay}</p>
							)}
						</div>
					)}

					{isTimedSession && (
						<p className="text-xs text-white/30 mt-1">
							${session.ratePerMinute.toFixed(2)}/min · ${session.totalCost.toFixed(2)} total
						</p>
					)}
				</div>

				{isWarning && (
					<div className="mx-6 bg-rose-500/20 border border-rose-500/30 rounded-2xl px-4 py-3 flex items-center gap-2">
						<AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
						<p className="text-sm text-rose-300 font-medium">1 minute remaining in your session</p>
					</div>
				)}

				{isVideo && !isCameraOff && (
					<div className="absolute top-16 right-4 z-20">
						<div className="w-24 h-32 sm:w-28 sm:h-36 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl bg-[#1a1a1a]">
							<div className="w-full h-full bg-gradient-to-br from-rose-900/40 to-[#1a1a1a] flex items-center justify-center">
								<div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
									<Video className="w-5 h-5 text-white/40" />
								</div>
							</div>
						</div>
					</div>
				)}

				<div className="mt-auto pb-14 px-8">
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
							className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs transition-colors"
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
					active ? 'bg-white/15 hover:bg-white/20' : 'bg-white/8 hover:bg-white/12 opacity-60'
				}`}
			>
				<Icon className="w-6 h-6 text-white" />
			</button>
			<span className="text-[10px] text-white/40">{label}</span>
		</div>
	);
}
