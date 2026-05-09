import { useState, useEffect, useMemo } from 'react';
import { Plus, ArrowUpRight, ArrowDownLeft, Wallet as WalletIcon, CreditCard, TrendingUp, RefreshCw, CheckCircle } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { Modal } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { formatDate } from '../../utils/date';
import { delayMs } from '../../utils/delay';
import type { Transaction } from '../../types';
import { formatINRFromMinor } from '../../utils/money';
import type { RazorpayOrderRow } from '../../services/paymentWs';
import { useSubscriptions } from '../../context/SubscriptionContext';
import { useContent } from '../../context/ContentContext';
import { subscriptionAmountMinor, subscriptionId, subscriptionUiStatus } from '../../services/subscriptionUi';
import { UserAvatarMedia } from '../../components/ui/Avatar';

const ADD_FUND_PRESETS_INR = [100, 250, 500, 1000, 2000, 5000];
const SHOW_MORE_STEP = 12;

type SubscriptionRowKeyInput = {
	creatorUserId: string,
	subscriptionId: string | null,
	dto: Record<string, unknown>,
};

/** Stable unique key per subscription row (multiple rows per creator are valid). */
function subscriptionListKey(s: SubscriptionRowKeyInput, listIndex: number): string {
	if (s.subscriptionId) return s.subscriptionId;
	const d = s.dto;
	const t =
		typeof d.updated_at === 'string' ? d.updated_at :
		typeof d.created_at === 'string' ? d.created_at :
		typeof d.started_at === 'string' ? d.started_at :
		'';
	const base = `${s.creatorUserId}:${t || 'nostamp'}`;
	return t ? base : `${base}:i${listIndex}`;
}

function TransactionItem({ tx }: { tx: Transaction }) {
	const isPositive = tx.amount > 0;
	const typeColors: Record<Transaction['type'], string> = {
		deposit: 'text-emerald-400',
		subscription: 'text-rose-400',
		tip: 'text-amber-400',
		ppv: 'text-blue-400',
		withdrawal: 'text-orange-400',
		session: 'text-sky-400',
		gift: 'text-pink-400',
		refund: 'text-emerald-400',
	};
	const typeIcons: Record<Transaction['type'], React.ReactNode> = {
		deposit: <ArrowDownLeft className="w-4 h-4" />,
		subscription: <RefreshCw className="w-4 h-4" />,
		tip: <ArrowUpRight className="w-4 h-4" />,
		ppv: <ArrowUpRight className="w-4 h-4" />,
		withdrawal: <ArrowUpRight className="w-4 h-4" />,
		session: <ArrowUpRight className="w-4 h-4" />,
		gift: <ArrowUpRight className="w-4 h-4" />,
		refund: <ArrowDownLeft className="w-4 h-4" />,
	};

	const amountLabel = new Intl.NumberFormat('en-IN', {
		style: 'currency',
		currency: 'INR',
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(Math.abs(tx.amount));

	return (
		<div className="flex items-center gap-3 py-3 border-b border-border/10 last:border-0">
			<div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-foreground/5 ${typeColors[tx.type]}`}>
				{typeIcons[tx.type]}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
				<p className="text-xs text-muted/80">{formatDate(tx.createdAt)}</p>
			</div>
			<div className="text-right shrink-0">
				<p className={`text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-foreground/80'}`}>
					{isPositive ? '+' : '−'}{amountLabel}
				</p>
				<p className={`text-[10px] capitalize ${tx.status === 'completed' ? 'text-emerald-400/60' : 'text-amber-400/60'}`}>
					{tx.status}
				</p>
			</div>
		</div>
	);
}

function OrderRow({ o }: { o: RazorpayOrderRow }) {
	const amount = formatINRFromMinor(o.amount_minor);
	const paid = o.status === 'paid' || o.status === 'captured';
	const pending = o.status === 'created' || o.status === 'attempted';
	return (
		<div className="flex items-center gap-3 py-3 border-b border-border/10 last:border-0">
			<div className="w-9 h-9 rounded-xl flex items-center justify-center bg-foreground/5 text-muted">
				<CreditCard className="w-4 h-4" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-foreground truncate font-mono text-xs">{o.razorpay_order_id}</p>
				<p className="text-xs text-muted/80">{formatDate(o.created_at)}</p>
			</div>
			<div className="text-right shrink-0">
				<p className="text-sm font-semibold text-foreground">{amount}</p>
				<p className={`text-[10px] capitalize ${paid ? 'text-emerald-400/80' : pending ? 'text-amber-400/80' : 'text-rose-400/80'}`}>
					{o.status}
				</p>
			</div>
		</div>
	);
}

export function Wallet() {
	const { state: authState } = useAuth();
	const {
		addFundsViaRazorpay,
		getUserTransactions,
		razorpayOrders,
		historyNextCursor,
		loadMoreLedger,
		refreshWalletData,
		state: walletState,
	} = useWallet();
	const { byCreatorUserId, cancel: cancelWsSubscription, loading: subsLoading, error: subsError } = useSubscriptions();
	const { creatorWsGetByUserId } = useContent();
	const [showAddFunds, setShowAddFunds] = useState(false);
	const [addAmount, setAddAmount] = useState(500);
	const [customAmount, setCustomAmount] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [addSuccess, setAddSuccess] = useState(false);
	const [payError, setPayError] = useState('');
	const [activeTab, setActiveTab] = useState<'transactions' | 'subscriptions' | 'orders'>('transactions');
	const [creatorDisplay, setCreatorDisplay] = useState<Record<string, { name: string, avatar: string }>>({});
	const [visibleTxCount, setVisibleTxCount] = useState(SHOW_MORE_STEP);
	const [visibleOrderCount, setVisibleOrderCount] = useState(SHOW_MORE_STEP);
	const [visibleActiveSubsCount, setVisibleActiveSubsCount] = useState(SHOW_MORE_STEP);
	const [visibleCancelledSubsCount, setVisibleCancelledSubsCount] = useState(SHOW_MORE_STEP);
	const [visibleExpiredSubsCount, setVisibleExpiredSubsCount] = useState(SHOW_MORE_STEP);

	const user = authState.user;
	const userId = user?.id ?? '';
	const transactions = getUserTransactions(userId);
	type WalletSubRow = {
		creatorUserId: string,
		dto: Record<string, unknown>,
		status: 'active' | 'cancelled' | 'expired',
		subscriptionId: string | null,
		amountMinor: string | null,
	};

	const subs = useMemo<WalletSubRow[]>(() => {
		const out: WalletSubRow[] = [];
		for (const [creatorUserId, list] of Object.entries(byCreatorUserId)) {
			for (const dto of list ?? []) {
				out.push({
					creatorUserId,
					dto,
					status: subscriptionUiStatus(dto),
					subscriptionId: subscriptionId(dto),
					amountMinor: subscriptionAmountMinor(dto),
				});
			}
		}
		return out;
	}, [byCreatorUserId]);

	const activeSubs = useMemo(() => subs.filter((s: WalletSubRow) => s.status === 'active'), [subs]);
	const cancelledSubs = useMemo(() => subs.filter((s: WalletSubRow) => s.status === 'cancelled'), [subs]);
	const expiredSubs = useMemo(() => subs.filter((s: WalletSubRow) => s.status === 'expired'), [subs]);

	const creatorIds = useMemo(() => {
		const ids: Record<string, true> = {};
		for (const s of subs) ids[s.creatorUserId] = true;
		return Object.keys(ids);
	}, [subs]);

	const balanceMinor = user?.walletBalanceMinor ?? '0';

	const totalSpent = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
	const totalDeposited = transactions.filter(t => t.type === 'deposit' && t.amount > 0).reduce((sum, t) => sum + t.amount, 0);

	useEffect(() => {
		// Reset pagination when switching tabs (keeps UX predictable).
		if (activeTab === 'transactions') setVisibleTxCount(SHOW_MORE_STEP);
		if (activeTab === 'orders') setVisibleOrderCount(SHOW_MORE_STEP);
		if (activeTab === 'subscriptions') {
			setVisibleActiveSubsCount(SHOW_MORE_STEP);
			setVisibleCancelledSubsCount(SHOW_MORE_STEP);
			setVisibleExpiredSubsCount(SHOW_MORE_STEP);
		}
	}, [activeTab]);

	useEffect(() => {
		setPayError(walletState.walletError ?? '');
	}, [walletState.walletError]);

	useEffect(() => {
		if (activeTab !== 'subscriptions') return;
		if (creatorIds.length === 0) return;
		let cancelled = false;
		const missing = creatorIds.filter(id => !creatorDisplay[id]);
		if (missing.length === 0) return;

		void Promise.all(missing.map(id =>
			creatorWsGetByUserId(id)
				.then(r => {
					if (cancelled) return;
					const c = r.creator;
					if (!c) return;
					setCreatorDisplay(prev => ({
						...prev,
						[id]: {
							name: c.name,
							avatar: c.avatar_url ?? '',
						},
					}));
				})
				.catch(() => {})
		));
		return () => { cancelled = true; };
	}, [activeTab, creatorIds.join(','), creatorDisplay, creatorWsGetByUserId]);

	function handleAddFunds() {
		const amount = customAmount ? parseFloat(customAmount) : addAmount;
		if (!amount || amount <= 0) return;
		setIsLoading(true);
		void delayMs(400).then(() => {
			setPayError('');
			void addFundsViaRazorpay(amount).then(ok => {
				if (ok) {
					setAddSuccess(true);
					setTimeout(() => {
						setAddSuccess(false);
						setShowAddFunds(false);
						setCustomAmount('');
						setPayError('');
					}, 1500);
				}
				setIsLoading(false);
			});
		});
	}

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<div className="flex justify-end mb-2">
					<button
						type="button"
						onClick={() => { void refreshWalletData(); }}
						className="text-xs text-muted hover:text-foreground flex items-center gap-1"
					>
						<RefreshCw className="w-3.5 h-3.5" />
						Refresh
					</button>
				</div>
				<div className="bg-gradient-to-br from-rose-500/20 via-rose-900/10 to-transparent border border-rose-500/20 rounded-3xl p-6 mb-6">
					<div className="flex items-start justify-between mb-4">
						<div>
							<p className="text-xs text-muted font-medium uppercase tracking-wider mb-1">Available Balance</p>
							<p className="text-4xl font-black text-foreground">{formatINRFromMinor(balanceMinor)}</p>
						</div>
						<div className="w-12 h-12 bg-rose-500/20 rounded-2xl flex items-center justify-center">
							<WalletIcon className="w-6 h-6 text-rose-400" />
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3 mb-4">
						<div className="bg-foreground/5 rounded-xl p-3">
							<p className="text-xs text-muted mb-0.5">Total Deposited (view)</p>
							<p className="text-base font-bold text-emerald-400">
								{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalDeposited)}
							</p>
						</div>
						<div className="bg-foreground/5 rounded-xl p-3">
							<p className="text-xs text-muted mb-0.5">Total Spent (view)</p>
							<p className="text-base font-bold text-foreground/80">
								{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalSpent)}
							</p>
						</div>
					</div>
					<Button
						variant="primary"
						fullWidth
						onClick={() => setShowAddFunds(true)}
						leftIcon={<Plus className="w-4 h-4" />}
					>
						Add Funds
					</Button>
				</div>

				<div className="flex gap-1 bg-foreground/5 p-0.5 rounded-xl mb-4 overflow-x-auto">
					{(['transactions', 'orders', 'subscriptions'] as const).map(tab => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all capitalize whitespace-nowrap px-2 ${
								activeTab === tab ? 'bg-foreground/10 text-foreground' : 'text-muted'
							}`}
						>
							{tab}
						</button>
					))}
				</div>

				{activeTab === 'transactions' && (
					<div className="bg-surface border border-border/20 rounded-2xl px-4">
						{transactions.length === 0 ? (
							<p className="text-center text-muted py-8 text-sm">No transactions yet</p>
						) : (
							<>
								{transactions.slice(0, visibleTxCount).map(tx => <TransactionItem key={tx.id} tx={tx} />)}
								{transactions.length > visibleTxCount && (
									<div className="py-4 flex justify-center">
										<button
											type="button"
											onClick={() => setVisibleTxCount(v => v + SHOW_MORE_STEP)}
											className="text-sm text-foreground/80 hover:text-foreground underline underline-offset-4"
										>
											Show more
										</button>
									</div>
								)}
								{historyNextCursor && (
									<div className="py-4 flex justify-center">
										<button
											type="button"
											onClick={() => { void loadMoreLedger(); }}
											className="text-sm text-rose-400 hover:underline"
										>
											Load older
										</button>
									</div>
								)}
							</>
						)}
					</div>
				)}

				{activeTab === 'orders' && (
					<div className="bg-surface border border-border/20 rounded-2xl px-4">
						{razorpayOrders.length === 0 ? (
							<p className="text-center text-muted py-8 text-sm">No Razorpay orders yet</p>
						) : (
							<>
								{razorpayOrders.slice(0, visibleOrderCount).map(o => <OrderRow key={o.id} o={o} />)}
								{razorpayOrders.length > visibleOrderCount && (
									<div className="py-4 flex justify-center">
										<button
											type="button"
											onClick={() => setVisibleOrderCount(v => v + SHOW_MORE_STEP)}
											className="text-sm text-foreground/80 hover:text-foreground underline underline-offset-4"
										>
											Show more
										</button>
									</div>
								)}
							</>
						)}
					</div>
				)}

				{activeTab === 'subscriptions' && (
					<div className="space-y-3">
						{subs.length === 0 ? (
							<div className="bg-surface border border-border/20 rounded-2xl p-8 text-center">
								<TrendingUp className="w-8 h-8 text-muted/50 mx-auto mb-2" />
								<p className="text-muted text-sm">No active subscriptions</p>
							</div>
						) : (
							<div className="space-y-3">
								{activeSubs.length > 0 && (
									<div className="px-1">
										<p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Active</p>
										<div className="space-y-3">
											{activeSubs.slice(0, visibleActiveSubsCount).map((s, i) => {
												const display = creatorDisplay[s.creatorUserId];
												return (
													<div key={subscriptionListKey(s, i)} className="bg-surface border border-border/20 rounded-2xl p-4">
														<div className="flex items-center gap-3 mb-3">
															<UserAvatarMedia
																src={display?.avatar}
																alt={display?.name ?? `Creator ${s.creatorUserId}`}
																className="w-10 h-10 rounded-full object-cover"
															/>
															<div className="flex-1">
																<p className="text-sm font-semibold text-foreground">{display?.name ?? `Creator ${s.creatorUserId}`}</p>
																<p className="text-xs text-emerald-300/80">Active subscription</p>
															</div>
															<span className="text-sm font-bold text-rose-400">{s.amountMinor ? `${formatINRFromMinor(s.amountMinor)}/mo` : '—'}</span>
														</div>
														<div className="flex gap-2">
															<button
																disabled={!s.subscriptionId}
																onClick={() => {
																	if (!s.subscriptionId) return;
																	void cancelWsSubscription(s.subscriptionId);
																}}
																className="flex-1 text-xs py-1.5 rounded-xl font-medium border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
															>
																Cancel subscription
															</button>
														</div>
													</div>
												);
											})}
											{activeSubs.length > visibleActiveSubsCount && (
												<div className="py-1 flex justify-center">
													<button
														type="button"
														onClick={() => setVisibleActiveSubsCount(v => v + SHOW_MORE_STEP)}
														className="text-sm text-foreground/80 hover:text-foreground underline underline-offset-4"
													>
														Show more
													</button>
												</div>
											)}
										</div>
									</div>
								)}

								{cancelledSubs.length > 0 && (
									<div className="px-1">
										<p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Cancelled</p>
										<div className="space-y-3">
											{cancelledSubs.slice(0, visibleCancelledSubsCount).map((s, i) => {
												const display = creatorDisplay[s.creatorUserId];
												return (
													<div key={subscriptionListKey(s, i)} className="bg-surface border border-border/20 rounded-2xl p-4 opacity-90">
														<div className="flex items-center gap-3">
															<UserAvatarMedia
																src={display?.avatar}
																alt={display?.name ?? `Creator ${s.creatorUserId}`}
																className="w-10 h-10 rounded-full object-cover"
															/>
															<div className="flex-1">
																<p className="text-sm font-semibold text-foreground">{display?.name ?? `Creator ${s.creatorUserId}`}</p>
																<p className="text-xs text-muted">Cancelled</p>
															</div>
															<span className="text-xs px-2 py-1 rounded-full bg-foreground/5 text-muted">Cancelled</span>
														</div>
													</div>
												);
											})}
											{cancelledSubs.length > visibleCancelledSubsCount && (
												<div className="py-1 flex justify-center">
													<button
														type="button"
														onClick={() => setVisibleCancelledSubsCount(v => v + SHOW_MORE_STEP)}
														className="text-sm text-foreground/80 hover:text-foreground underline underline-offset-4"
													>
														Show more
													</button>
												</div>
											)}
										</div>
									</div>
								)}

								{expiredSubs.length > 0 && (
									<div className="px-1">
										<p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Past (Expired)</p>
										<div className="space-y-3">
											{expiredSubs.slice(0, visibleExpiredSubsCount).map((s, i) => {
												const display = creatorDisplay[s.creatorUserId];
												return (
													<div key={subscriptionListKey(s, i)} className="bg-surface border border-border/20 rounded-2xl p-4 opacity-90">
														<div className="flex items-center gap-3">
															<UserAvatarMedia
																src={display?.avatar}
																alt={display?.name ?? `Creator ${s.creatorUserId}`}
																className="w-10 h-10 rounded-full object-cover"
															/>
															<div className="flex-1">
																<p className="text-sm font-semibold text-foreground">{display?.name ?? `Creator ${s.creatorUserId}`}</p>
																<p className="text-xs text-muted">Expired</p>
															</div>
															<span className="text-xs px-2 py-1 rounded-full bg-foreground/5 text-muted">Expired</span>
														</div>
													</div>
												);
											})}
											{expiredSubs.length > visibleExpiredSubsCount && (
												<div className="py-1 flex justify-center">
													<button
														type="button"
														onClick={() => setVisibleExpiredSubsCount(v => v + SHOW_MORE_STEP)}
														className="text-sm text-foreground/80 hover:text-foreground underline underline-offset-4"
													>
														Show more
													</button>
												</div>
											)}
										</div>
									</div>
								)}
							</div>
						)}
						{(subsLoading || subsError) && (
							<div className="px-1">
								{subsLoading && <p className="text-xs text-muted">Syncing subscriptions…</p>}
								{subsError && <p className="text-xs text-rose-400">{subsError}</p>}
							</div>
						)}
					</div>
				)}
			</div>

			<Modal isOpen={showAddFunds} onClose={() => { setShowAddFunds(false); setAddSuccess(false); }} title="Add Funds">
				<div className="p-5">
					{addSuccess ? (
						<div className="text-center py-6">
							<div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
								<CheckCircle className="w-7 h-7 text-emerald-400" />
							</div>
							<p className="text-foreground font-semibold">Funds Added!</p>
							<p className="text-muted text-sm mt-1">
								{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(customAmount ? parseFloat(customAmount) || 0 : addAmount)} added to your wallet
							</p>
						</div>
					) : (
						<>
							<div className="flex items-center gap-2 bg-foreground/5 rounded-xl p-3 mb-4">
								<CreditCard className="w-4 h-4 text-muted" />
								<span className="text-sm text-muted">Secure payment via Razorpay (INR)</span>
							</div>
							{payError && (
								<div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-3">
									<p className="text-xs text-rose-400">{payError}</p>
								</div>
							)}

							<p className="text-xs text-muted font-medium mb-2 uppercase tracking-wide">Select Amount (₹)</p>
							<div className="grid grid-cols-3 gap-2 mb-3">
								{ADD_FUND_PRESETS_INR.map(p => (
									<button
										key={p}
										onClick={() => { setAddAmount(p); setCustomAmount(''); }}
										className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
											addAmount === p && !customAmount ? 'bg-rose-500 text-white' : 'bg-foreground/5 text-muted hover:bg-foreground/10'
										}`}
									>
										₹{p.toLocaleString('en-IN')}
									</button>
								))}
							</div>
							<input
								type="number"
								value={customAmount}
								onChange={e => setCustomAmount(e.target.value)}
								placeholder="Custom amount (₹)..."
								className="w-full bg-input border border-border/20 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 mb-4"
							/>
							<Button variant="primary" fullWidth isLoading={isLoading} onClick={() => { void handleAddFunds(); }}>
								Add {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(customAmount ? parseFloat(customAmount) || 0 : addAmount)}
							</Button>
						</>
					)}
				</div>
			</Modal>
		</Layout>
	);
}
