import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, Phone, RotateCcw, Minimize2, Clock, AlertTriangle } from '../../components/icons';
import { useCallSession } from '../../context/CallSessionContext';
import { formatINR } from '../../services/razorpay';

export function ActiveCallScreen() {
	const navigate = useNavigate();
	const cs = useCallSession();
	const [showControls, setShowControls] = useState(true);
	const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!cs.isActive) {
			void navigate(-1);
			return;
		}
		cs.maximize();
	}, [cs.isActive, cs.maximize, navigate]);

	const isTimedSession = cs.isTimedSession;
	const session = cs.activeSession;
	const hideControls = !showControls && cs.isVideo;

	function resetControlsTimer() {
		setShowControls(true);
		if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
		if (cs.isVideo) {
			controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
		}
	}

	useEffect(() => {
		resetControlsTimer();
		return () => {
			if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
		};
	}, [cs.callType]);

	const onMinimize = () => {
		cs.minimize();
		void navigate(-1);
	};

	return (
		<div
			className="fixed inset-0 z-[300] bg-overlay flex flex-col"
			onTouchStart={resetControlsTimer}
			onClick={resetControlsTimer}
		>
			{cs.isVideo ? (
				<div className="absolute inset-0 pointer-events-none">
					<div
						ref={el => { cs.attachRemoteVideo(el); }}
						className="absolute inset-0 pointer-events-none [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
					/>

					{!cs.hasRemoteVideo && (
						<div className="absolute inset-0 pointer-events-none">
							<img
								src={cs.participantAvatar}
								alt={cs.participantName}
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
								src={cs.participantAvatar}
								alt={cs.participantName}
								className="relative w-28 h-28 rounded-full object-cover border-4 border-border/20"
							/>
						</div>
					</div>
				</div>
			)}

			<div className="relative z-10 flex flex-col h-full">
				<div className={`pt-14 pb-4 px-6 text-center transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
					<h1 className="text-2xl font-bold text-foreground dark:text-white drop-shadow-lg">{cs.participantName}</h1>
					{cs.isConnecting ? (
						<p className="text-muted dark:text-white/60 text-sm mt-1 animate-pulse">
							{cs.callStatus === 'ringing' ? 'Ringing…' : 'Connecting…'}
						</p>
					) : (
						<div className="flex items-center justify-center gap-2 mt-1">
							{(isTimedSession || (cs.isBookedCall && typeof cs.bookedRemainingSec === 'number')) && (
								<div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
									(cs.isWarning || cs.isBookedWarning) ? 'bg-rose-500/30 text-rose-300 animate-pulse' : 'bg-background/70 text-foreground/80 dark:bg-white/10 dark:text-white/70'
								}`}
								>
									{(cs.isWarning || cs.isBookedWarning) && <AlertTriangle className="w-3 h-3" />}
									<Clock className="w-3 h-3" />
									{cs.timerDisplay} left
								</div>
							)}
							{!isTimedSession && !(cs.isBookedCall && typeof cs.bookedRemainingSec === 'number') && (
								<p className="text-muted dark:text-white/60 text-sm tabular-nums">{cs.timerDisplay}</p>
							)}
						</div>
					)}

					{isTimedSession && session && (
						<p className="text-xs text-muted/70 dark:text-white/30 mt-1">
							{formatINR(session.ratePerMinute)}/min · {formatINR(session.totalCost)} total
						</p>
					)}
				</div>

				{(cs.isWarning || cs.isBookedWarning) && (
					<div className={`mx-6 bg-rose-500/20 border border-rose-500/30 rounded-2xl px-4 py-3 flex items-center gap-2 transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
						<AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
						<p className="text-sm text-rose-300 font-medium">1 minute remaining</p>
					</div>
				)}

				{cs.isVideo && !cs.isCameraOff && (
					<div className="absolute top-16 right-4 z-20">
						<div className="w-24 h-32 sm:w-28 sm:h-36 rounded-2xl overflow-hidden border-2 border-border/20 shadow-xl bg-surface2">
							<div
								ref={el => { cs.attachLocalVideo(el); }}
								className="w-full h-full bg-gradient-to-br from-rose-900/40 to-surface2"
							/>
						</div>
					</div>
				)}

				{cs.agoraError && (
					<div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-rose-500/20 border border-rose-500/30 rounded-xl px-3 py-1.5">
						<p className="text-xs text-rose-300">{cs.agoraError}</p>
					</div>
				)}

				<div className={`mt-auto pb-14 px-8 transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
					<div className="flex items-center justify-center gap-5 mb-8">
						<ControlBtn active={!cs.isMuted} onPress={cs.toggleMute} icon={cs.isMuted ? MicOff : Mic} label={cs.isMuted ? 'Unmute' : 'Mute'} />
						{cs.isVideo && (
							<ControlBtn active={!cs.isCameraOff} onPress={cs.toggleCamera} icon={cs.isCameraOff ? VideoOff : Video} label={cs.isCameraOff ? 'Camera off' : 'Camera'} />
						)}
						<ControlBtn active={cs.isSpeakerOn} onPress={cs.toggleSpeaker} icon={cs.isSpeakerOn ? Volume2 : VolumeX} label="Speaker" />
						{cs.isVideo && (
							<ControlBtn active={false} onPress={() => {}} icon={RotateCcw} label="Flip" />
						)}
					</div>

					<div className="flex justify-center">
						<button
							onClick={() => { cs.completeEndCall(); }}
							className="w-16 h-16 bg-rose-500 hover:bg-rose-600 rounded-full flex items-center justify-center shadow-xl shadow-rose-500/40 transition-all active:scale-90"
						>
							<Phone className="w-7 h-7 text-white rotate-[135deg]" />
						</button>
					</div>

					<div className="flex justify-center mt-6">
						<button
							type="button"
							onClick={onMinimize}
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
