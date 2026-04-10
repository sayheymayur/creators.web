import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from '../icons';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatDistanceToNow } from '../../utils/date';

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
					notifications.map(n => (
						<button
							key={n.id}
							onClick={() => handleClick(n.id, n.link)}
							className={`w-full flex gap-3 px-4 py-3 hover:bg-foreground/5 transition-colors text-left border-b border-border/10 last:border-0 ${
								!n.isRead ? 'bg-rose-500/5' : ''
							}`}
						>
							{n.fromAvatar ? (
								<img src={n.fromAvatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
							) : (
								<div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
									<Bell className="w-4 h-4 text-muted" />
								</div>
							)}
							<div className="flex-1 min-w-0">
								<p className={`text-xs font-medium ${n.isRead ? 'text-muted' : 'text-foreground'} truncate`}>{n.title}</p>
								<p className="text-xs text-muted truncate mt-0.5">{n.body}</p>
								<p className="text-[10px] text-muted/80 mt-1">{formatDistanceToNow(n.createdAt)}</p>
							</div>
							{!n.isRead && <div className="w-2 h-2 bg-rose-500 rounded-full mt-1 shrink-0" />}
						</button>
					))
				)}
			</div>
		</div>
	);
}
