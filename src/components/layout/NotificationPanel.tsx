import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from '../icons';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatDistanceToNow } from '../../utils/date';
import { formatINRFromMinor } from '../../utils/money';

interface NotificationPanelProps {
	onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
	const { state: authState } = useAuth();
	const { getUserNotifications, markRead, markAllRead } = useNotifications();
	const navigate = useNavigate();

	const userId = authState.user?.id ?? '';
	const notifications = getUserNotifications(userId).slice(0, 10);

	function handleClick(id: string, link?: string) {
		markRead(id);
		onClose();
		if (link) navigate(link);
	}

	return (
		<div className="absolute right-0 top-full mt-2 w-80 bg-surface2 border border-border/20 rounded-2xl shadow-2xl z-50 overflow-hidden">
			<div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
				<div className="flex items-center gap-2">
					<Bell className="w-4 h-4 text-muted" />
					<span className="text-sm font-semibold text-foreground">Notifications</span>
				</div>
				<button onClick={markAllRead} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
					<CheckCheck className="w-3.5 h-3.5" />
					Mark all read
				</button>
			</div>

			<div className="max-h-80 overflow-y-auto">
				{notifications.length === 0 ? (
					<div className="text-center py-8 text-muted text-sm">No notifications</div>
				) : (
					notifications.map(n => {
						const data = n.data ?? {};
						const link = typeof data.link === 'string' ? data.link : undefined;
						const fromAvatar =
							typeof data.from_avatar === 'string' ? data.from_avatar :
							typeof data.fromAvatar === 'string' ? data.fromAvatar :
							undefined;
						const isRead = n.read_at != null;
						const kind = typeof data.kind === 'string' ? data.kind : '';
						const tipMinor = kind === 'tip' && typeof data.amount_cents === 'string' ? data.amount_cents : null;
						const tipSubtitle = tipMinor != null ? (
							<span className="text-amber-400/90">
								Tip · {formatINRFromMinor(tipMinor)}
								{typeof data.currency === 'string' && data.currency && data.currency !== 'INR' ? ` (${data.currency})` : ''}
							</span>
						) : null;
						return (
							<button
								key={n.id}
								onClick={() => handleClick(n.id, link)}
								className={`w-full flex gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0 ${
									!isRead ? 'bg-rose-500/5' : ''
								}`}
							>
								{fromAvatar ? (
									<img src={fromAvatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
								) : (
									<div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
										<Bell className="w-4 h-4 text-white/40" />
									</div>
								)}
								<div className="flex-1 min-w-0">
									<p className={`text-xs font-medium ${isRead ? 'text-white/60' : 'text-white'} truncate`}>{n.title}</p>
									{tipSubtitle ? (
										<p className="text-[11px] truncate mt-0.5">{tipSubtitle}</p>
									) : null}
									<p className="text-xs text-white/40 truncate mt-0.5">{n.body ?? ''}</p>
									<p className="text-[10px] text-white/25 mt-1">{formatDistanceToNow(n.created_at)}</p>
								</div>
								{!isRead && <div className="w-2 h-2 bg-rose-500 rounded-full mt-1 shrink-0" />}
							</button>
						);
					})
				)}
			</div>
		</div>
	);
}
