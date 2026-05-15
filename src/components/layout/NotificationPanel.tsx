import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from '../icons';
import { NotificationRow } from '../notifications/NotificationRow';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

interface NotificationPanelProps {
	onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
	const { state: authState } = useAuth();
	const { getUserNotifications, markRead, markAllRead } = useNotifications();
	const navigate = useNavigate();

	const userId = authState.user?.id ?? '';
	const notifications = getUserNotifications(userId).slice(0, 10);

	function handleRowClick(id: string, link?: string) {
		markRead(id);
		onClose();
		if (link) navigate(link);
	}

	function goToAll() {
		onClose();
		void navigate('/notifications');
	}

	return (
		<div className="absolute right-0 top-full mt-2 w-80 bg-surface2 border border-border/20 rounded-2xl shadow-2xl z-50 overflow-hidden">
			<div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
				<div className="flex items-center gap-2">
					<Bell className="w-4 h-4 text-muted" />
					<span className="text-sm font-semibold text-foreground">Notifications</span>
				</div>
				<button
					type="button"
					onClick={markAllRead}
					className="text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 flex items-center gap-1"
				>
					<CheckCheck className="w-3.5 h-3.5" />
					Mark all read
				</button>
			</div>

			<div className="max-h-80 overflow-y-auto scrollbar-hide">
				{notifications.length === 0 ? (
					<div className="text-center py-8 text-muted text-sm">No notifications</div>
				) : (
					notifications.map(n => {
						const data = n.data ?? {};
						const link = typeof data.link === 'string' ? data.link : undefined;
						return (
							<NotificationRow
								key={n.id}
								notification={n}
								onClick={() => handleRowClick(n.id, link)}
							/>
						);
					})
				)}
			</div>

			<div className="border-t border-border/10 px-2 py-2">
				<button
					type="button"
					onClick={goToAll}
					className="w-full text-center text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 py-2 rounded-xl hover:bg-foreground/5 transition-colors"
				>
					View all
				</button>
			</div>
		</div>
	);
}
