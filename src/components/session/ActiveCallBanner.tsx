import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone } from '../icons';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useContent } from '../../context/ContentContext';
import { useSessions } from '../../context/SessionsContext';
import { useCallSession } from '../../context/CallSessionContext';
import { formatMmSsFromSeconds } from '../../utils/date';

/** Top bar when a booked call is active and the user is not on `/call` and has not chosen PiP minimize. */
export function ActiveCallBanner() {
	const navigate = useNavigate();
	const { state, endSession } = useSessions();
	const { state: chatState } = useChat();
	const { state: authState } = useAuth();
	const { state: contentState } = useContent();
	const { isMinimized } = useCallSession();
	const active = state.active?.accepted?.kind === 'call' ? state.active : null;
	const [bookedRemainingSec, setBookedRemainingSec] = useState<number | null>(null);
	const [ending, setEnding] = useState(false);

	const show = useMemo(() => {
		if (isMinimized) return false;
		if (!active?.accepted?.room_id) return false;
		if (state.endedRooms[active.accepted.room_id]) return false;
		return true;
	}, [active?.accepted?.room_id, state.endedRooms, isMinimized]);

	const bookedEndsAt = useMemo(() => {
		if (!active?.accepted?.request_id) return null;
		const reqId = active.accepted.request_id;
		if (state.timer?.request_id === reqId) return state.timer.ends_at;
		return active.accepted.ends_at ?? null;
	}, [active?.accepted?.request_id, active?.accepted?.ends_at, state.timer?.request_id, state.timer?.ends_at]);

	useEffect(() => {
		if (!active?.accepted?.request_id || !bookedEndsAt) {
			setBookedRemainingSec(null);
			return;
		}
		const endsAtMs = new Date(bookedEndsAt).getTime();
		if (!Number.isFinite(endsAtMs)) {
			setBookedRemainingSec(null);
			return;
		}
		const tick = () => {
			const rem = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000));
			setBookedRemainingSec(rem);
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => { clearInterval(id); };
	}, [active?.accepted?.request_id, bookedEndsAt]);

	const displayName = useMemo(() => {
		if (!active?.accepted?.room_id) return 'Call';
		const fromDisplay = active.otherDisplay?.name;
		if (fromDisplay) return fromDisplay;
		const conv = chatState.conversations.find(c => c.id === active.accepted.room_id);
		const userId = authState.user?.id ?? '';
		const otherIdx = conv?.participantIds?.indexOf(userId) === 0 ? 1 : 0;
		const fromConv = conv?.participantNames?.[otherIdx];
		if (fromConv) return fromConv;
		const me = authState.user;
		const peer = active.peerIds;
		if (me?.role === 'fan' && peer?.creator_user_id) {
			const cd = contentState.creatorProfiles[peer.creator_user_id];
			if (cd?.name) return cd.name;
		}
		return 'Call';
	}, [active, chatState.conversations, authState.user, contentState.creatorProfiles]);

	if (!active || !show) return null;

	const booking = active;
	const uiCallType = booking.uiCallType ?? 'video';

	function handleEndCall() {
		if (!booking.accepted.request_id || ending) return;
		setEnding(true);
		void endSession(booking.accepted.request_id)
			.catch(() => {})
			.finally(() => { setEnding(false); });
	}

	return (
		<div className="fixed top-14 left-0 right-0 z-[230] px-3 sm:px-4">
			<div className="max-w-2xl mx-auto bg-surface border border-border/20 rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
				<div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
					<Phone className="w-5 h-5" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-bold text-foreground truncate">{displayName}</p>
					<p className="text-[11px] text-muted truncate">
						Active {uiCallType === 'video' ? 'video' : 'audio'} call
						{typeof bookedRemainingSec === 'number' && (
							<span className="tabular-nums"> · {formatMmSsFromSeconds(bookedRemainingSec)} left</span>
						)}
					</p>
				</div>
				<div className="shrink-0 flex items-center gap-2 ml-auto">
					<button
						type="button"
						disabled={ending}
						onClick={handleEndCall}
						className="px-3 py-2 rounded-xl text-xs font-bold border border-border/40 bg-background hover:bg-foreground/5 text-foreground transition-colors disabled:opacity-50"
					>
						End call
					</button>
					<button
						type="button"
						disabled={ending}
						onClick={() => { void navigate('/call'); }}
						className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
					>
						Continue
					</button>
				</div>
			</div>
		</div>
	);
}
