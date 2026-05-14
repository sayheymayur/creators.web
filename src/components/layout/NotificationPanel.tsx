import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from '../icons';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatDistanceToNow } from '../../utils/date';
import { formatINRFromMinor } from '../../utils/money';

interface NotificationPanelProps {
	onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
	const { state: authState } = useAuth();
	const {
		state: notifState,
		getUserNotifications,
		markRead,
		markAllRead,
		dismiss,
		dismissAll,
		loadMore,
		refresh,
	} = useNotifications();
	const navigate = useNavigate();
	const [unreadOnly, setUnreadOnly] = useState(false);
	const [includeDeleted, setIncludeDeleted] = useState(false);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [clearBusy, setClearBusy] = useState(false);

	const userId = authState.user?.id ?? '';
	const notifications = getUserNotifications(userId).slice(0, 30);

	const reload = useCallback(() => {
		void refresh({ unreadOnly: unreadOnly || undefined, includeDeleted: includeDeleted || undefined });
	}, [refresh, unreadOnly, includeDeleted]);

	function handleClick(id: string, link?: string) {
		markRead(id);
		onClose();
		if (link) navigate(link);
	}

	function handleDismiss(e: React.MouseEvent, id: string) {
		e.preventDefault();
		e.stopPropagation();
		if (busyId) return;
		setBusyId(id);
		void dismiss(id).finally(() => setBusyId(null));
	}

	function handleClearAll() {
		if (clearBusy) return;
		setClearBusy(true);
		void dismissAll().finally(() => setClearBusy(false));
	}

	return (
		<div className="absolute right-0 top-full mt-2 w-80 bg-surface2 border border-border/20 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[min(24rem,70vh)]">
			<div className="flex flex-col gap-2 px-4 py-3 border-b border-border/10 shrink-0">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<Bell className="w-4 h-4 text-muted shrink-0" />
						<span className="text-sm font-semibold text-foreground truncate">Notifications</span>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						<button
							type="button"
							onClick={markAllRead}
							className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 px-1.5 py-1 rounded-lg"
							title="Mark all as read"
						>
							<CheckCheck className="w-3.5 h-3.5" />
							Read all
						</button>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2 text-[11px]">
					<button
						type="button"
						onClick={() => {
							const next = !unreadOnly;
							setUnreadOnly(next);
							void refresh({ unreadOnly: next || undefined, includeDeleted: includeDeleted || undefined });
						}}
						className={`rounded-lg px-2 py-1 font-medium ${unreadOnly ? 'bg-rose-500/20 text-rose-300' : 'bg-foreground/5 text-muted hover:text-foreground'}`}
					>
						Unread only
					</button>
					<button
						type="button"
						onClick={() => {
							const next = !includeDeleted;
							setIncludeDeleted(next);
							void refresh({ unreadOnly: unreadOnly || undefined, includeDeleted: next || undefined });
						}}
						className={`rounded-lg px-2 py-1 font-medium ${includeDeleted ? 'bg-foreground/15 text-foreground' : 'bg-foreground/5 text-muted hover:text-foreground'}`}
					>
						Show dismissed
					</button>
					<button
						type="button"
						onClick={() => { void reload(); }}
						className="rounded-lg px-2 py-1 font-medium bg-foreground/5 text-muted hover:text-foreground"
					>
						Reload
					</button>
					<button
						type="button"
						onClick={() => { handleClearAll(); }}
						disabled={clearBusy}
						className="rounded-lg px-2 py-1 font-medium text-amber-400/90 hover:text-amber-300 disabled:opacity-50"
						title="Remove all notifications from this list"
					>
						{clearBusy ? 'Clearing…' : 'Clear all'}
					</button>
				</div>
				{notifState.status === 'error' && notifState.error ? (
					<p className="text-xs text-red-400/90">{notifState.error}</p>
				) : null}
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto">
				{notifState.status === 'loading' && notifications.length === 0 ? (
					<div className="text-center py-8 text-muted text-sm">Loading…</div>
				) : notifications.length === 0 ? (
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
							<div
								key={n.id}
								className={`flex gap-2 px-4 py-3 border-b border-white/5 last:border-0 ${
									!isRead ? 'bg-rose-500/5' : ''
								} ${n.deleted_at ? 'opacity-50' : ''}`}
							>
								<button
									type="button"
									onClick={() => handleClick(n.id, link)}
									className="flex flex-1 min-w-0 gap-3 text-left hover:bg-white/5 transition-colors rounded-lg -mx-1 px-1 py-0.5"
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
								{n.deleted_at == null ? (
									<button
										type="button"
										onClick={e => { void handleDismiss(e, n.id); }}
										disabled={busyId === n.id}
										className="shrink-0 self-start mt-1 p-2 rounded-lg text-white/35 hover:text-rose-400 hover:bg-white/5 disabled:opacity-40"
										title="Dismiss"
										aria-label="Dismiss notification"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								) : null}
							</div>
						);
					})
				)}
				{notifState.nextCursor ? (
					<div className="p-3 border-t border-border/10">
						<button
							type="button"
							onClick={() => { void loadMore(); }}
							className="w-full text-xs font-semibold text-rose-400 hover:text-rose-300 py-2 rounded-xl bg-foreground/5"
						>
							Load more
						</button>
					</div>
				) : null}
			</div>
		</div>
	);
}
