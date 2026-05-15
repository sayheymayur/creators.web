import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from '../components/icons';
import { Layout } from '../components/layout/Layout';
import { NotificationRow } from '../components/notifications/NotificationRow';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useWsAuthReady, useWsConnected } from '../context/WsContext';

/** First paint and each “show more” step: how many rows to reveal (rest stay hidden until Load more). */
const NOTIFICATIONS_PAGE_SIZE = 20;

export function Notifications() {
	const navigate = useNavigate();
	const { state: authState } = useAuth();
	const wsConnected = useWsConnected();
	const wsAuthReady = useWsAuthReady();
	const { state, getUserNotifications, markRead, markAllRead, refresh, loadMore } = useNotifications();
	const [visibleCount, setVisibleCount] = useState(NOTIFICATIONS_PAGE_SIZE);
	const [loadMorePending, setLoadMorePending] = useState(false);

	const userId = authState.user?.id ?? '';
	const notifications = getUserNotifications(userId);
	const visibleNotifications = notifications.slice(0, visibleCount);
	const hasMoreLocally = visibleCount < notifications.length;
	const hasMoreOnServer = Boolean(state.nextCursor);
	const showLoadMore = hasMoreLocally || hasMoreOnServer;

	useEffect(() => {
		void refresh({ unreadOnly: false });
	}, [refresh]);

	useEffect(() => {
		setVisibleCount(NOTIFICATIONS_PAGE_SIZE);
	}, [userId]);

	const waitingForSocket = !wsConnected || !wsAuthReady;
	const showConnecting =
		(waitingForSocket && notifications.length === 0) ||
		(state.status === 'loading' && notifications.length === 0);

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
					<div className="flex items-center gap-2">
						<Bell className="w-4 h-4 text-rose-400" />
						<h1 className="font-semibold text-foreground">Notifications</h1>
					</div>
					<button
						type="button"
						onClick={markAllRead}
						className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 self-start sm:self-auto px-3 py-1.5 rounded-xl border border-border/30 hover:bg-foreground/5 transition-colors"
					>
						Mark all read
					</button>
				</div>

				{state.status === 'error' ? (
					<div className="text-center py-12">
						<p className="text-sm text-muted mb-1">Couldn’t load notifications</p>
						<p className="text-xs text-muted/80 break-words mb-4">{state.error}</p>
						<button
							type="button"
							onClick={() => { void refresh({ unreadOnly: false }); }}
							className="text-sm font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 px-4 py-2 rounded-xl border border-border/30 hover:bg-foreground/5 transition-colors"
						>
							Retry
						</button>
					</div>
				) : showConnecting ? (
					<p className="text-sm text-muted text-center py-12">Connecting…</p>
				) : notifications.length === 0 ? (
					<div className="text-center py-16">
						<div className="w-14 h-14 bg-foreground/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
							<Bell className="w-6 h-6 text-muted/60" />
						</div>
						<p className="text-muted font-medium mb-1">No notifications yet</p>
						<p className="text-sm text-muted/80">When something happens, it will show up here.</p>
					</div>
				) : (
					<>
						<div className="rounded-2xl border border-border/20 bg-surface2 overflow-hidden">
							{visibleNotifications.map(n => {
								const data = n.data ?? {};
								const link = typeof data.link === 'string' ? data.link : undefined;
								return (
									<NotificationRow
										key={n.id}
										notification={n}
										onClick={() => {
											markRead(n.id);
											if (link) void navigate(link);
										}}
									/>
								);
							})}
						</div>
						{showLoadMore ? (
							<div className="pt-4 flex flex-col items-center gap-1">
								<button
									type="button"
									disabled={loadMorePending}
									onClick={() => {
										if (hasMoreLocally) {
											setVisibleCount(c => Math.min(c + NOTIFICATIONS_PAGE_SIZE, notifications.length));
											return;
										}
										if (!hasMoreOnServer) return;
										setLoadMorePending(true);
										void loadMore().finally(() => {
											setLoadMorePending(false);
											setVisibleCount(c => c + NOTIFICATIONS_PAGE_SIZE);
										});
									}}
									className={
										'text-sm font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400 ' +
										'dark:hover:text-rose-300 px-4 py-2.5 rounded-xl border border-border/30 ' +
										'hover:bg-foreground/5 transition-colors disabled:opacity-50 ' +
										'disabled:pointer-events-none min-w-[200px]'
									}
								>
									{loadMorePending ? 'Loading…' : hasMoreLocally ? 'Show more' : 'Load older'}
								</button>
								<p className="text-[11px] text-muted text-center max-w-sm">
									{hasMoreLocally ? (
										<>Showing {visibleNotifications.length} of {notifications.length}</>
									) : hasMoreOnServer ? (
										<>Showing {notifications.length} loaded — tap for older</>
									) : null}
								</p>
							</div>
						) : null}
					</>
				)}
			</div>
		</Layout>
	);
}
