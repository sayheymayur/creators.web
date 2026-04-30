import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone } from '../icons';
import { useSessions } from '../../context/SessionsContext';

export function ActiveCallBanner() {
	const navigate = useNavigate();
	const { state } = useSessions();
	const active = state.active?.accepted?.kind === 'call' ? state.active : null;

	const show = useMemo(() => {
		if (!active?.accepted?.room_id) return false;
		if (state.endedRooms[active.accepted.room_id]) return false;
		return true;
	}, [active?.accepted?.room_id, state.endedRooms]);

	if (!active || !show) return null;

	const name = active.otherDisplay?.name ?? 'Call';
	const uiCallType = active.uiCallType ?? 'video';

	return (
		<div className="fixed top-14 left-0 right-0 z-[230] px-3 sm:px-4">
			<div className="max-w-2xl mx-auto bg-surface border border-border/20 rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
				<div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
					<Phone className="w-5 h-5" />
				</div>
				<div className="min-w-0">
					<p className="text-sm font-bold text-foreground truncate">{name}</p>
					<p className="text-[11px] text-muted truncate">
						Active {uiCallType === 'video' ? 'video' : 'audio'} call · Resume to continue
					</p>
				</div>
				<button
					type="button"
					onClick={() => { void navigate('/call'); }}
					className="ml-auto px-3 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors"
				>
					Resume
				</button>
			</div>
		</div>
	);
}
