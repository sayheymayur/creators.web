import { useEffect, useMemo, useState } from 'react';
import { Search, Users, MessageCircle } from '../../components/icons';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { useCurrentCreator } from '../../context/AuthContext';
import { mockCreators } from '../../data/users';
import { useChat } from '../../context/ChatContext';
import { randomUuid } from '../../utils/isUuid';
import { createSubscriptionWs, type SubscriptionSubscriberRow } from '../../services/subscriptionWs';
import { useEnsureWsAuth, useWs, useWsAuthReady, useWsConnected } from '../../context/WsContext';
import { subscriptionUiStatus } from '../../services/subscriptionUi';

export function Subscribers() {
	const creator = useCurrentCreator();
	const navigate = useNavigate();
	const { addConversation, state: chatState } = useChat();
	const ws = useWs();
	const wsConnected = useWsConnected();
	const wsAuthReady = useWsAuthReady();
	const ensureWsAuth = useEnsureWsAuth();
	const [search, setSearch] = useState('');
	const [filter, setFilter] = useState<'all' | 'active' | 'cancelled'>('active');
	const [rows, setRows] = useState<SubscriptionSubscriberRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const creatorData = creator ?? mockCreators[0];

	const subscriptionWs = useMemo(() => createSubscriptionWs(ws), [ws]);

	const refresh = useMemo(() => {
		return () => {
			if (!wsConnected || !wsAuthReady) return Promise.resolve();
			setLoading(true);
			setError(null);
			return ensureWsAuth()
				.then(() => subscriptionWs.listSubscribers(30))
				.then(resp => {
					setRows(resp.subscribers ?? []);
				})
				.catch(e => {
					setError(e instanceof Error ? e.message : 'Failed to load subscribers');
				})
				.finally(() => setLoading(false));
		};
	}, [wsConnected, wsAuthReady, ensureWsAuth, subscriptionWs]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (!wsConnected) return;
		const services = ['subscription', 'subscriptions'];
		const offCreated = services.map(svc => ws.on(svc, 'created', () => { void refresh(); }));
		const offCancelled = services.map(svc => ws.on(svc, 'cancelled', () => { void refresh(); }));
		return () => {
			offCreated.forEach(fn => fn());
			offCancelled.forEach(fn => fn());
		};
	}, [ws, wsConnected, refresh]);

	const filteredRows = useMemo(() => {
		if (filter === 'all') return rows;
		return rows.filter(r => {
			const st = subscriptionUiStatus(r.subscription);
			// Treat any non-active subscription (cancelled/expired) as \"cancelled\" for filtering.
			return filter === 'active' ? st === 'active' : st !== 'active';
		});
	}, [rows, filter]);

	const subscribers = useMemo(() => {
		const q = search.trim().toLowerCase();
		const filtered = q ?
			filteredRows.filter(r =>
				r.fan?.name?.toLowerCase().includes(q) ||
				r.fan?.username?.toLowerCase().includes(q)
			) :
			filteredRows;
		return filtered;
	}, [filteredRows, search]);

	const activeCount = useMemo(() => rows.filter(r => subscriptionUiStatus(r.subscription) === 'active').length, [rows]);
	const cancelledCount = useMemo(() => rows.filter(r => subscriptionUiStatus(r.subscription) === 'cancelled').length, [rows]);

	const rowKey = useMemo(() => {
		return (row: SubscriptionSubscriberRow, idx: number) => {
			const rawSubId = (row.subscription as unknown as { id?: unknown } | undefined)?.id;
			const rawFanId = (row.fan as unknown as { id?: unknown } | undefined)?.id;
			const subId = typeof rawSubId === 'string' || typeof rawSubId === 'number' ? String(rawSubId) : 'sub';
			const fanId = typeof rawFanId === 'string' || typeof rawFanId === 'number' ? String(rawFanId) : 'fan';
			return `${subId}-${fanId}-${idx}`;
		};
	}, []);

	function handleMessage(userId: string, userName: string, userAvatar: string) {
		const existing = chatState.conversations.find(c =>
			c.participantIds.includes(creatorData.id) && c.participantIds.includes(userId)
		);
		if (existing) {
			navigate(`/messages/${existing.id}`);
		} else {
			const convId = randomUuid();
			addConversation({
				id: convId,
				participantIds: [creatorData.id, userId],
				participantNames: [creatorData.name, userName],
				participantAvatars: [creatorData.avatar, userAvatar],
				lastMessage: '',
				lastMessageTime: new Date().toISOString(),
				unreadCount: 0,
				isOnline: false,
			});
			navigate(`/messages/${convId}`);
		}
	}

	return (
		<Layout>
			<div className="max-w-4xl mx-auto px-4 py-6">
				<div className="flex items-center justify-between mb-6">
					<div>
						<h1 className="text-xl font-bold text-foreground">Subscribers</h1>
						<p className="text-muted text-sm">{rows.length.toLocaleString()} total</p>
					</div>
				</div>

				<div className="grid grid-cols-3 gap-3 mb-6">
					<div className="bg-surface border border-border/20 rounded-2xl p-4 text-center">
						<p className="text-2xl font-black text-foreground">{rows.length}</p>
						<p className="text-xs text-muted">Total Subscribers</p>
					</div>
					<div className="bg-surface border border-border/20 rounded-2xl p-4 text-center">
						<p className="text-2xl font-black text-emerald-400">{activeCount}</p>
						<p className="text-xs text-muted">Active</p>
					</div>
					<div className="bg-surface border border-border/20 rounded-2xl p-4 text-center">
						<p className="text-2xl font-black text-rose-400">{cancelledCount}</p>
						<p className="text-xs text-muted">Cancelled</p>
					</div>
				</div>

				<div className="flex gap-1 bg-foreground/5 p-0.5 rounded-xl mb-4 overflow-x-auto">
					{(['all', 'active', 'cancelled'] as const).map(k => (
						<button
							key={k}
							onClick={() => setFilter(k)}
							className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all capitalize whitespace-nowrap px-2 ${
								filter === k ? 'bg-foreground/10 text-foreground' : 'text-muted'
							}`}
						>
							{k}
						</button>
					))}
				</div>

				<div className="relative mb-4">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
					<input
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder="Search subscribers..."
						className="w-full bg-input border border-border/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
					/>
				</div>

				<div className="bg-surface border border-border/20 rounded-2xl overflow-hidden">
					{error && (
						<div className="px-4 py-3 border-b border-border/10">
							<p className="text-xs text-rose-400">{error}</p>
						</div>
					)}
					{loading && rows.length === 0 ? (
						<div className="text-center py-10">
							<p className="text-muted text-sm">Loading…</p>
						</div>
					) : subscribers.length === 0 ? (
						<div className="text-center py-10">
							<Users className="w-8 h-8 text-muted/50 mx-auto mb-2" />
							<p className="text-muted text-sm">No subscribers found</p>
						</div>
					) : (
						subscribers.map((row, idx) => (
							<div
								key={rowKey(row, idx)}
								className={`flex items-center gap-3 px-4 py-3 ${idx < subscribers.length - 1 ? 'border-b border-border/10' : ''}`}
							>
								{row.fan?.avatar_url ? (
									<img src={row.fan.avatar_url} alt={row.fan.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
								) : <div className="w-10 h-10 rounded-full bg-foreground/10 shrink-0" />}
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-foreground truncate">{row.fan?.name ?? 'Unknown'}</p>
									<p className="text-xs text-muted truncate">
										@{row.fan?.username ?? '—'} · <span className={subscriptionUiStatus(row.subscription) === 'active' ? 'text-emerald-300' : 'text-muted'}>{subscriptionUiStatus(row.subscription)}</span>
									</p>
								</div>
								<button
									onClick={() => handleMessage(String(row.fan.id), row.fan.name, row.fan.avatar_url ?? '')}
									className="flex items-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 text-muted hover:text-foreground text-xs px-3 py-1.5 rounded-xl transition-colors shrink-0"
								>
									<MessageCircle className="w-3.5 h-3.5" />
									Message
								</button>
							</div>
						))
					)}
				</div>
			</div>
		</Layout>
	);
}
