import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Phone, Minimize2, AlertTriangle } from '../../components/icons';
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

	const timerLabel =
		(cs.isBookedCall && typeof cs.bookedRemainingSec === 'number') || cs.isTimedSession ?
			`${cs.timerDisplay} left` :
			cs.timerDisplay;

	return (
		<div
			className="fixed inset-0 z-[300] bg-black flex flex-col"
			onTouchStart={resetControlsTimer}
			onClick={resetControlsTimer}
		>
			{cs.isVideo ? (
				<div className="absolute inset-0">
					<div
						ref={el => { cs.attachRemoteVideo(el); }}
						className="absolute inset-0 bg-black pointer-events-none [&>video]:w-full [&>video]:h-full [&>video]:object-contain"
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
				<div className={`px-5 pt-4 transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<p className="truncate text-sm font-semibold text-white/95">{cs.participantName}</p>
							</div>
							{cs.isConnecting && (
								<p className="mt-1 text-xs text-white/50 animate-pulse">
									{cs.callStatus === 'ringing' ? 'Ringing…' : 'Connecting…'}
								</p>
							)}
						</div>

						<div className="shrink-0 flex items-center gap-2">
							<div className="flex items-center gap-2 rounded-full bg-rose-500/25 border border-rose-500/25 px-3 py-1 text-[11px] font-semibold tracking-wide text-rose-100 backdrop-blur">
								<span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
								{timerLabel}
							</div>
						</div>
					</div>

					{(cs.isWarning || cs.isBookedWarning) && (
						<div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-rose-500/20 border border-rose-500/30 px-3 py-2">
							<AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
							<p className="text-xs text-rose-200 font-medium">1 minute remaining</p>
						</div>
					)}

					{isTimedSession && session && (
						<p className="mt-2 text-xs text-white/35">
							{formatINR(session.ratePerMinute)}/min · {formatINR(session.totalCost)} total
						</p>
					)}
				</div>

				{cs.isVideo && !cs.isCameraOff && (
					<div className="absolute top-16 right-5 z-20">
						<div className="relative w-56 max-w-[38vw] aspect-video rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-black/60 backdrop-blur">
							<div
								ref={el => { cs.attachLocalVideo(el); }}
								className="absolute inset-0 bg-black [&>video]:w-full [&>video]:h-full [&>video]:object-contain"
							/>
							<div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-[10px] font-semibold text-white/80 border border-white/10">
								you
							</div>
						</div>
					</div>
				)}

				{cs.agoraError && (
					<div className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-rose-500/20 border border-rose-500/30 rounded-xl px-3 py-1.5 transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
						<p className="text-xs text-rose-300">{cs.agoraError}</p>
					</div>
				)}

				<div className={`mt-auto pb-8 px-6 transition-opacity duration-300 ${hideControls ? 'opacity-0' : 'opacity-100'}`}>
					<div className="flex justify-center">
						<div className="flex items-center rounded-[28px] bg-black/60 backdrop-blur border border-white/10 px-3 py-3 shadow-2xl">
							<div className="flex items-center gap-3 pr-3">
								<button
									type="button"
									onClick={cs.toggleMute}
									className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
									aria-label={cs.isMuted ? 'Unmute' : 'Mute'}
								>
									{cs.isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
								</button>

								{cs.isVideo && (
									<button
										type="button"
										onClick={cs.toggleCamera}
										className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
										aria-label={cs.isCameraOff ? 'Start camera' : 'Stop camera'}
									>
										{cs.isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
									</button>
								)}

								<button
									type="button"
									onClick={onMinimize}
									className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center"
									aria-label="Minimize"
								>
									<Minimize2 className="h-5 w-5" />
								</button>
							</div>

							<div className="h-10 w-px bg-white/15" />

							<button
								type="button"
								onClick={() => { cs.completeEndCall(); }}
								className="ml-3 inline-flex items-center gap-2 rounded-full bg-rose-500 hover:bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-rose-500/20 transition-transform active:scale-[0.99]"
							>
								<Phone className="h-5 w-5 rotate-[135deg]" />
								Leave Session
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
