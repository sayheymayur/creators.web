import { useMemo, useState } from 'react';
import { MessageCircle, Phone, PhoneOff, Video } from '../icons';
import { useSessions } from '../../context/SessionsContext';
import { formatINRFromMinor } from '../../utils/money';
import { useNotifications } from '../../context/NotificationContext';
import { ensureMediaPermissions, isDeviceInUseError } from '../../services/mediaPermissions';

function centsToMinorString(cents: string): string {
	const trimmed = (cents ?? '').trim();
	return /^\d+$/.test(trimmed) ? trimmed : '0';
}

export function IncomingSessionRequestOverlay() {
	const { state, acceptSession, rejectSession } = useSessions();
	const { showToast } = useNotifications();
	const [busy, setBusy] = useState(false);
	const [callType, setCallType] = useState<'audio' | 'video'>('video');

	const incoming = state.incoming[0]?.request;
	const priceMinor = useMemo(() => centsToMinorString(incoming?.price_cents ?? '0'), [incoming?.price_cents]);

	if (!incoming) return null;

	const isChat = incoming.kind === 'chat';
	const isCall = incoming.kind === 'call';

	function handleAccept() {
		if (busy) return;
		setBusy(true);
		const preflight = isCall ?
			ensureMediaPermissions({ audio: true, video: callType === 'video' }).catch(e => {
				if (isDeviceInUseError(e)) {
					showToast('Camera/mic is busy in another tab. Joining will be receive-only on this tab.', 'error');
					return;
				}
				throw e;
			}) :
			Promise.resolve();
		void preflight
			.then(() => acceptSession(incoming.request_id, isCall ? { uiCallType: callType } : undefined))
			.then(() => {
				showToast('Accepted session request');
			})
			.catch(e => {
				showToast(e instanceof Error ? e.message : 'Failed to accept', 'error');
			})
			.finally(() => {
				setBusy(false);
			});
	}

	function handleReject() {
		if (busy) return;
		setBusy(true);
		rejectSession(incoming.request_id, 'Creator is busy')
			.then(() => {
				showToast('Rejected session request');
			})
			.catch(e => {
				showToast(e instanceof Error ? e.message : 'Failed to reject', 'error');
			})
			.finally(() => {
				setBusy(false);
			});
	}

	return (
		<div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center">
			<div className="absolute inset-0 bg-background/60 dark:bg-black/60 backdrop-blur-md" />

			<div className="relative w-full sm:max-w-sm bg-surface dark:bg-[#141414] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-slide-up border border-border/20">
				<div className="relative px-8 pt-10 pb-10 text-center">
					<div className="relative inline-block mb-5">
						<div className="absolute inset-0 rounded-full bg-rose-500/15 animate-ping scale-125" />
						<div className="w-20 h-20 rounded-full bg-background/70 dark:bg-white/10 flex items-center justify-center border-4 border-border/20 dark:border-white/10">
							{isChat ? (
								<MessageCircle className="w-9 h-9 text-emerald-300" />
							) : (
								<Video className="w-9 h-9 text-sky-300" />
							)}
						</div>
					</div>

					<p className="text-muted dark:text-white/50 text-sm mb-1 font-medium tracking-wide uppercase">
						Incoming {isChat ? 'Chat' : 'Call'} Session
					</p>
					<h2 className="text-2xl font-bold text-foreground dark:text-white mb-1">{incoming.fan_display}</h2>
					<p className="text-muted/80 dark:text-white/40 text-sm">
						Price: {formatINRFromMinor(priceMinor)}
					</p>

					{isCall && (
						<div className="flex items-center justify-center gap-2 mt-6">
							<button
								type="button"
								onClick={() => setCallType('audio')}
								disabled={busy}
								className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
									callType === 'audio' ?
										'bg-sky-500/15 border-sky-500/30 text-sky-300' :
										'bg-foreground/5 border-border/20 text-muted hover:bg-foreground/10'
								}`}
							>
								Audio
							</button>
							<button
								type="button"
								onClick={() => setCallType('video')}
								disabled={busy}
								className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
									callType === 'video' ?
										'bg-rose-500/15 border-rose-500/30 text-rose-300' :
										'bg-foreground/5 border-border/20 text-muted hover:bg-foreground/10'
								}`}
							>
								Video
							</button>
						</div>
					)}

					<div className="flex items-center justify-center gap-10 mt-10">
						<div className="flex flex-col items-center gap-2">
							<button
								onClick={handleReject}
								disabled={busy}
								className="w-16 h-16 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 rounded-full flex items-center justify-center shadow-xl shadow-rose-500/30 transition-all active:scale-90"
							>
								<PhoneOff className="w-7 h-7 text-white" />
							</button>
							<span className="text-xs text-muted dark:text-white/40">Reject</span>
						</div>

						<div className="flex flex-col items-center gap-2">
							<button
								onClick={handleAccept}
								disabled={busy}
								className="w-16 h-16 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/30 transition-all active:scale-90"
							>
								{isChat ? (
									<MessageCircle className="w-7 h-7 text-white" />
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
