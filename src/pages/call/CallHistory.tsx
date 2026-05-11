import { useNavigate } from 'react-router-dom';
import { Phone, Video, PhoneIncoming, PhoneMissed, PhoneOutgoing, PhoneCall } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { useCall } from '../../context/CallContext';
import { mockCreators, mockFanUser } from '../../data/users';
import { useAuth } from '../../context/AuthContext';
import type { CallRecord } from '../../types';

function formatDuration(secs: number): string {
	if (!secs) return '';
	const m = Math.floor(secs / 60);
	const s = secs % 60;
	if (m === 0) return `${s}s`;
	return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffDays = Math.floor(diffMs / 86400000);
	if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	if (diffDays === 1) return 'Yesterday';
	if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
	return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function CallHistory() {
	const navigate = useNavigate();
	const { state, startCall } = useCall();
	const { state: authState } = useAuth();
	const userId = authState.user?.id ?? '';

	function getParticipantAvatar(record: CallRecord): string {
		const creator = mockCreators.find(c => c.id === record.participantId);
		if (creator) return creator.avatar;
		if (mockFanUser.id === record.participantId) return mockFanUser.avatar;
		return record.participantAvatar;
	}

	function handleCallback(record: CallRecord) {
		startCall(record.participantId, record.participantName, getParticipantAvatar(record), record.type);
		navigate('/call');
	}

	const grouped: { label: string, items: CallRecord[] }[] = [];
	const today: CallRecord[] = [];
	const yesterday: CallRecord[] = [];
	const older: CallRecord[] = [];
	const now = new Date();

	state.callHistory.forEach(r => {
		const d = new Date(r.startedAt);
		const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
		if (diffDays === 0) today.push(r);
		else if (diffDays === 1) yesterday.push(r);
		else older.push(r);
	});

	if (today.length) grouped.push({ label: 'Today', items: today });
	if (yesterday.length) grouped.push({ label: 'Yesterday', items: yesterday });
	if (older.length) grouped.push({ label: 'Earlier', items: older });

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<h1 className="text-xl font-bold text-foreground mb-6">Call History</h1>

				{state.callHistory.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-20 text-center">
						<div className="w-16 h-16 bg-foreground/5 rounded-2xl flex items-center justify-center mb-4">
							<Phone className="w-8 h-8 text-muted/60" />
						</div>
						<p className="text-muted text-sm">No calls yet</p>
					</div>
				) : (
					<div className="space-y-6">
						{grouped.map(group => (
							<div key={group.label}>
								<p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">{group.label}</p>
								<div className="space-y-1">
									{group.items.map(record => (
										<CallRow
											key={record.id}
											record={record}
											avatar={getParticipantAvatar(record)}
											onCallback={() => handleCallback(record)}
											userId={userId}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</Layout>
	);
}

function CallRow({
	record,
	avatar,
	onCallback,
	userId: _userId,
}: {
	record: CallRecord,
	avatar: string,
	onCallback: () => void,
	userId: string,
}) {
	const isMissed = record.status === 'missed' || record.status === 'declined';

	const DirectionIcon =
		record.status === 'missed' ? PhoneMissed :
		record.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;

	return (
		<div className="flex items-center gap-3 bg-foreground/5 hover:bg-foreground/10 rounded-2xl p-3 transition-colors group">
			<div className="relative shrink-0">
				<img src={avatar} alt={record.participantName} className="w-11 h-11 rounded-xl object-cover" />
				<div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background flex items-center justify-center ${
					isMissed ? 'bg-rose-500/90' : record.direction === 'incoming' ? 'bg-emerald-500/90' : 'bg-sky-500/90'
				}`}
				>
					<DirectionIcon className="w-2.5 h-2.5 text-white" />
				</div>
			</div>

			<div className="flex-1 min-w-0">
				<p className={`text-sm font-semibold truncate ${isMissed ? 'text-rose-500' : 'text-foreground'}`}>
					{record.participantName}
				</p>
				<div className="flex items-center gap-1.5 mt-0.5">
					{record.type === 'video' ? (
						<Video className="w-3 h-3 text-muted/80" />
					) : (
						<Phone className="w-3 h-3 text-muted/80" />
					)}
					<span className="text-xs text-muted/80">
						{isMissed ? (record.status === 'declined' ? 'Declined' : 'Missed') : formatDuration(record.durationSeconds ?? 0)}
					</span>
					<span className="text-muted/60 text-xs">·</span>
					<span className="text-xs text-muted/80">{formatTime(record.startedAt)}</span>
				</div>
			</div>

			<button
				onClick={onCallback}
				className="w-9 h-9 rounded-xl bg-foreground/5 hover:bg-rose-500/20 hover:text-rose-500 flex items-center justify-center text-muted transition-all opacity-0 group-hover:opacity-100"
			>
				<PhoneCall className="w-4 h-4" />
			</button>
		</div>
	);
}
