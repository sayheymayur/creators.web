import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from '../icons';
import { useCall } from '../../context/CallContext';
import { AvatarBackdrop, UserAvatarMedia } from '../ui/Avatar';

export function IncomingCallOverlay() {
	const { state, acceptCall, declineCall } = useCall();
	const call = state.incomingCall;
	const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		return () => { if (pulseRef.current) clearInterval(pulseRef.current); };
	}, []);

	if (!call) return null;

	const isVideo = call.type === 'video';

	return (
		<div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
			<div className="absolute inset-0 bg-background/60 dark:bg-black/60 backdrop-blur-md" />

			<div className="relative w-full sm:max-w-sm bg-surface dark:bg-[#141414] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-slide-up border border-border/20">
				<div className="absolute inset-0 overflow-hidden">
					<AvatarBackdrop
						src={call.participantAvatar}
						alt=""
						className="w-full h-full object-cover scale-110 blur-2xl opacity-20"
					/>
				</div>

				<div className="relative px-8 pt-10 pb-10 text-center">
					<div className="relative inline-block mb-5">
						<div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping scale-125" />
						<div className="absolute inset-0 rounded-full bg-rose-500/10 animate-ping scale-150 animation-delay-150" />
						<UserAvatarMedia
							src={call.participantAvatar}
							alt={call.participantName}
							className="relative w-24 h-24 rounded-full object-cover border-4 border-border/20 dark:border-white/10"
						/>
					</div>

					<p className="text-muted dark:text-white/50 text-sm mb-1 font-medium tracking-wide uppercase">
						Incoming {isVideo ? 'Video' : 'Audio'} Call
					</p>
					<h2 className="text-2xl font-bold text-foreground dark:text-white mb-1">{call.participantName}</h2>
					<p className="text-muted/80 dark:text-white/40 text-sm">is calling you…</p>

					<div className="flex items-center justify-center gap-10 mt-10">
						<div className="flex flex-col items-center gap-2">
							<button
								onClick={declineCall}
								className="w-16 h-16 bg-rose-500 hover:bg-rose-600 rounded-full flex items-center justify-center shadow-xl shadow-rose-500/30 transition-all active:scale-90"
							>
								<PhoneOff className="w-7 h-7 text-white" />
							</button>
							<span className="text-xs text-muted dark:text-white/40">Decline</span>
						</div>

						<div className="flex flex-col items-center gap-2">
							<button
								onClick={acceptCall}
								className="w-16 h-16 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/30 transition-all active:scale-90"
							>
								{isVideo ? (
									<Video className="w-7 h-7 text-white" />
								) : (
									<Phone className="w-7 h-7 text-white" />
								)}
							</button>
							<span className="text-xs text-muted dark:text-white/40">Accept</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
