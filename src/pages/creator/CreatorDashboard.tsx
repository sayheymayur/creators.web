import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	TrendingUp,
	Users,
	Zap,
	DollarSign,
	ArrowRight,
	Star,
	Eye,
	Radio,
	MessageCircle,
	Phone,
	Video,
	Clock,
} from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { useAuth, useCurrentCreator } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { useSession } from '../../context/SessionContext';
import { useNotifications } from '../../context/NotificationContext';
import { mockCreators } from '../../data/users';
import { ApiError, creatorsApi } from '../../services/creatorsApi';
import { formatINR } from '../../services/razorpay';
import { creatorDashboardMonthlyRupeeRows, parseMinorStringToRupees } from '../../utils/creatorDashboardMonthlyStats';
import { inrRupeesToMinor } from '../../utils/money';

function parseMinorToRupees(minor: string | number | null | undefined): number {
	return parseMinorStringToRupees(minor);
}

function StatCard({ label, value, sub, icon, color, onClick }: {
	label: string, value: string, sub?: string, icon: React.ReactNode, color: string, onClick?: () => void,
}) {
	return (
		<button
			onClick={onClick}
			className={`bg-surface border border-border/20 rounded-2xl p-4 text-left hover:border-border/30 transition-all group ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
		>
			<div className="flex items-start justify-between mb-3">
				<div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
					{icon}
				</div>
				{onClick && <ArrowRight className="w-4 h-4 text-muted/70 group-hover:text-foreground/80 transition-colors" />}
			</div>
			<p className="text-2xl font-black text-foreground mb-0.5">{value}</p>
			<p className="text-xs text-muted font-medium">{label}</p>
			{sub && <p className="text-xs text-muted/80 mt-0.5">{sub}</p>}
		</button>
	);
}

function formatSessionType(type: string) {
	if (type === 'chat') return { label: 'Chat', icon: MessageCircle, color: 'text-emerald-400' };
	if (type === 'audio') return { label: 'Audio', icon: Phone, color: 'text-sky-400' };
	return { label: 'Video', icon: Video, color: 'text-rose-400' };
}

function formatDuration(secs: number): string {
	const m = Math.floor(secs / 60);
	const s = secs % 60;
	return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Turn `YYYY-MM` (API) into compact labels like `May '26`. */
function shortMonthLabel(raw: string): string {
	const t = raw.trim();
	const m = /^(\d{4})-(\d{2})$/.exec(t);
	if (!m) return t;
	const y = m[1];
	const mo = parseInt(m[2], 10);
	const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	if (mo < 1 || mo > 12) return t;
	return `${names[mo - 1]} '${y.slice(2)}`;
}

export function CreatorDashboard() {
	const navigate = useNavigate();
	const creator = useCurrentCreator();
	const { state: authState, updateUser, refreshMe } = useAuth();
	const { state: contentState, loadCreatorPosts } = useContent();
	const { state: sessionState } = useSession();
	const { showToast } = useNotifications();
	const [editingRate, setEditingRate] = useState(false);
	const [rateInput, setRateInput] = useState('');
	const [savingRate, setSavingRate] = useState(false);

	const authedCreatorId = authState.user?.id ?? '';
	const dashboard = authState.user?.creatorDashboard;
	const creatorData = creator ?? (authState.user?.role === 'creator' ? {
		...mockCreators[0],
		id: authState.user.id,
		name: authState.user.name,
		email: authState.user.email,
		username: authState.user.username,
		avatar: authState.user.avatar,
	} : mockCreators[0]);
	const creatorUserIdForPosts = authedCreatorId || creatorData.id;

	useEffect(() => {
		if (!creatorUserIdForPosts) return;
		void loadCreatorPosts(creatorUserIdForPosts, true);
	}, [creatorUserIdForPosts, loadCreatorPosts]);

	useEffect(() => {
		if (authState.user?.role !== 'creator') return;
		void refreshMe();
	}, [authState.user?.role, authState.user?.id, refreshMe]);

	const creatorPosts = contentState.posts.filter(p => p.creatorId === creatorUserIdForPosts);

	const creatorSessions = sessionState.sessionHistory.filter(s => s.creatorId === creatorUserIdForPosts);
	const sessionEarnings = creatorSessions.reduce((sum, s) => sum + s.earnings, 0);

	const chartMonthlyRows = useMemo(
		() => creatorDashboardMonthlyRupeeRows(dashboard),
		[dashboard]
	);

	const chartMaxEarnings = useMemo(() => {
		if (!chartMonthlyRows.length) return 1;
		return Math.max(1, ...chartMonthlyRows.map(s => s.earnings));
	}, [chartMonthlyRows]);

	const sixMonthTotal = useMemo(
		() => chartMonthlyRows.reduce((sum, r) => sum + r.earnings, 0),
		[chartMonthlyRows]
	);

	const earningsGrowth = useMemo(() => {
		const lastMonth = chartMonthlyRows[chartMonthlyRows.length - 2];
		const thisMonth = chartMonthlyRows[chartMonthlyRows.length - 1];
		if (!lastMonth || lastMonth.earnings <= 0) return '0';
		return (((thisMonth?.earnings ?? 0) - lastMonth.earnings) / lastMonth.earnings * 100).toFixed(1);
	}, [chartMonthlyRows]);

	const recentSessions = useMemo(() => {
		if (dashboard?.sessionHistory?.length) {
			return dashboard.sessionHistory.map(row => ({
				id: row.requestId,
				type: row.type === 'call' ? 'audio' : 'chat',
				fanName: row.fanName,
				durationMinutes: row.durationMinutes ?? 0,
				actualDurationSeconds: null as number | null,
				earnings: parseMinorToRupees(row.earningsCents),
			}));
		}
		return creatorSessions;
	}, [dashboard?.sessionHistory, creatorSessions]);

	const kycStatus = dashboard?.kycStatus ?? creatorData.kycStatus;
	const skipCreatorKycGate =
		import.meta.env.DEV ||
			import.meta.env.VITE_SKIP_CREATOR_KYC === 'true';
	if (!skipCreatorKycGate && kycStatus !== 'approved') {
		return (
			<Layout>
				<div className="max-w-lg mx-auto px-4 py-12 text-center">
					<div className="w-16 h-16 bg-amber-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
						<Star className="w-8 h-8 text-amber-400" />
					</div>
					<h2 className="text-xl font-bold text-foreground mb-2">
						{kycStatus === 'pending' ? 'KYC Verification Pending' :
						kycStatus === 'rejected' ? 'KYC Rejected' :
						'Complete KYC Verification'}
					</h2>
					<p className="text-muted text-sm mb-6">
						{kycStatus === 'pending' ?
							'Your identity verification is being reviewed. This usually takes 1-2 business days.' :
							kycStatus === 'rejected' ?
								'Your KYC was rejected. Please resubmit with clearer documents.' :
								'Verify your identity to start earning on creators.web.'}
					</p>
					<button
						type="button"
						onClick={() => { void navigate('/creator-dashboard/kyc'); }}
						className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-all"
					>
						{kycStatus === 'rejected' ? 'Resubmit KYC' : 'Submit KYC Documents'}
					</button>
				</div>
			</Layout>
		);
	}

	const subscriberCount = dashboard?.subscriberCount ?? creatorData.subscriberCount;
	const monthlyEarnings = dashboard ? parseMinorToRupees(dashboard.monthlyEarningsCents) : creatorData.monthlyEarnings;
	const totalEarnings = dashboard ? parseMinorToRupees(dashboard.totalEarningsCents) : creatorData.totalEarnings;
	const dashboardSessionEarnings = dashboard ? parseMinorToRupees(dashboard.earningsBySource?.sessionsCents) : sessionEarnings;
	const perMinuteRateRupees = dashboard?.perMinuteRateCents != null ? parseMinorToRupees(dashboard.perMinuteRateCents) : creatorData.perMinuteRate;

	return (
		<Layout>
			<div className="max-w-4xl mx-auto px-4 py-6">
				<div className="flex items-start justify-between mb-6">
					<div>
						<h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
						<p className="text-muted text-sm">Welcome back, {creatorData.name.split(' ')[0]}</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => { void navigate('/go-live'); }}
							className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-sm font-semibold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5"
						>
							<Radio className="w-4 h-4" />
							Go Live
						</button>
						<button
							type="button"
							onClick={() => { void navigate('/creator-dashboard/content'); }}
							className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all"
						>
							+ New Post
						</button>
					</div>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
					<StatCard
						label="Monthly Earnings"
						value={formatINR(monthlyEarnings)}
						sub={`+${earningsGrowth}% vs last month`}
						icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
						color="bg-emerald-500/15"
						onClick={() => { void navigate('/creator-dashboard/earnings'); }}
					/>
					<StatCard
						label="Subscribers"
						value={subscriberCount.toLocaleString()}
						sub="Active this month"
						icon={<Users className="w-5 h-5 text-blue-400" />}
						color="bg-blue-500/15"
						onClick={() => { void navigate('/creator-dashboard/subscribers'); }}
					/>
					<StatCard
						label="Session Earnings"
						value={formatINR(dashboardSessionEarnings)}
						sub={`${recentSessions.length} sessions`}
						icon={<Zap className="w-5 h-5 text-amber-400" />}
						color="bg-amber-500/15"
					/>
					<StatCard
						label="Total Earnings"
						value={formatINR(totalEarnings)}
						sub="All time"
						icon={<TrendingUp className="w-5 h-5 text-rose-400" />}
						color="bg-rose-500/15"
					/>
				</div>

				<div className="bg-surface border border-border/20 rounded-2xl p-4 mb-4">
					<div className="flex items-center justify-between mb-3">
						<div>
							<h3 className="text-sm font-semibold text-foreground">Per-Minute Rate</h3>
							<p className="text-xs text-muted mt-0.5">Charged for chat, audio & video sessions</p>
						</div>
						{!editingRate ? (
							<button
								onClick={() => { setRateInput(perMinuteRateRupees.toFixed(2)); setEditingRate(true); }}
								className="text-xs text-rose-400 hover:text-rose-300 font-semibold transition-colors"
							>
								Edit Rate
							</button>
						) : (
							<button
								onClick={() => setEditingRate(false)}
								className="text-xs text-muted hover:text-foreground font-semibold transition-colors"
							>
								Cancel
							</button>
						)}
					</div>
					{editingRate ? (
						<div className="flex items-center gap-3">
							<div className="flex-1 flex items-center gap-2 bg-input border border-border/20 rounded-xl px-3 py-2">
								<span className="text-muted text-sm">₹</span>
								<input
									type="number"
									min="0.50"
									max="99.99"
									step="0.01"
									value={rateInput}
									onChange={e => setRateInput(e.target.value)}
									className="flex-1 bg-transparent text-foreground text-sm focus:outline-none"
								/>
								<span className="text-muted text-xs">/min</span>
							</div>
							<button
								disabled={savingRate}
								onClick={() => {
									if (savingRate) return;
									const minorStr = inrRupeesToMinor(parseFloat(rateInput) || 0);
									const minor = /^\d+$/.test(minorStr) ? Number(minorStr) : 0;
									setSavingRate(true);
									void creatorsApi.me.updateProfile({ perMinuteRate: minor })
										.then(({ user }) => {
											showToast('Per-minute rate saved!');
											updateUser(user);
										})
										.catch(err => {
											const msg =
												err instanceof ApiError ? `Save failed (HTTP ${err.status}).` :
												err instanceof Error ? err.message :
												'Save failed.';
											showToast(msg, 'error');
										})
										.finally(() => {
											setSavingRate(false);
											setEditingRate(false);
										});
								}}
								className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all"
							>
								{savingRate ? 'Saving…' : 'Save'}
							</button>
						</div>
					) : (
						<div className="flex items-center gap-3">
							<div className="text-3xl font-black text-foreground">{formatINR(perMinuteRateRupees)}</div>
							<span className="text-muted/80 text-sm">/minute</span>
							<div className="ml-auto flex flex-col items-end gap-1">
								{[5, 10, 15].map(m => (
									<div key={m} className="flex items-center gap-2 text-xs text-muted/80">
										<Clock className="w-3 h-3" />
										{m}min = <span className="text-foreground/80 font-semibold">{formatINR(m * perMinuteRateRupees)}</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
					<div className="bg-surface border border-border/15 rounded-2xl p-5 sm:p-6 shadow-sm shadow-black/5">
						<div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div className="flex items-start gap-3">
								<div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 ring-1 ring-rose-500/20">
									<TrendingUp className="h-4 w-4 text-rose-400" aria-hidden />
								</div>
								<div>
									<h3 className="text-base font-semibold tracking-tight text-foreground">Earnings overview</h3>
									<p className="text-xs text-muted mt-0.5">Trailing six months from your dashboard</p>
								</div>
							</div>
							{chartMonthlyRows.length > 0 && (
								<div className="text-left sm:text-right">
									<p className="text-[10px] font-medium uppercase tracking-wider text-muted">Period total</p>
									<p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">{formatINR(sixMonthTotal)}</p>
								</div>
							)}
						</div>

						{chartMonthlyRows.length === 0 ? (
							<p className="text-sm text-muted py-8 text-center border border-dashed border-border/25 rounded-xl bg-foreground/[0.02]">
								No monthly breakdown yet. Totals will appear here once data is available.
							</p>
						) : (
							<>
								{/* Column chart — baseline + proportional bars */}
								<div className="rounded-xl bg-foreground/[0.03] ring-1 ring-border/10 px-3 pt-4 pb-2 sm:px-4">
									<div className="flex h-[132px] items-end justify-between gap-1.5 sm:gap-2 border-b border-border/15">
										{chartMonthlyRows.map((stat, i) => {
											const ratio = stat.earnings / chartMaxEarnings;
											const pct = stat.earnings <= 0 ? 0 : Math.max(ratio * 100, 4);
											return (
												<div key={i} className="flex h-full min-w-0 flex-1 flex-col items-stretch justify-end">
													<div className="mx-auto flex w-full max-w-[40px] flex-1 flex-col justify-end sm:max-w-[48px]">
														{stat.earnings > 0 ? (
															<div
																className="w-full rounded-t-[3px] bg-rose-500 shadow-[0_0_20px_-4px_rgba(244,63,94,0.45)] transition-[height] duration-500"
																style={{ height: `${pct}%` }}
																title={`${stat.month}: ${formatINR(stat.earnings)}`}
															/>
														) : (
															<div
																className="h-1 w-full rounded-full bg-foreground/[0.08]"
																aria-hidden
															/>
														)}
													</div>
												</div>
											);
										})}
									</div>
									<div className="mt-2 flex justify-between gap-1.5 sm:gap-2">
										{chartMonthlyRows.map((stat, i) => (
											<div key={i} className="min-w-0 flex-1 text-center">
												<span className="block truncate text-[10px] font-medium text-muted sm:text-[11px]">
													{shortMonthLabel(stat.month)}
												</span>
											</div>
										))}
									</div>
								</div>

								<button
									type="button"
									onClick={() => { void navigate('/creator-dashboard/earnings'); }}
									className="mt-5 w-full rounded-lg border border-border/15 py-2 text-xs font-medium text-muted transition-colors hover:border-border/30 hover:bg-foreground/[0.04] hover:text-foreground"
								>
									View full earnings report
								</button>
							</>
						)}
					</div>

					<div className="bg-surface border border-border/20 rounded-2xl p-4">
						<div className="flex items-center justify-between mb-3">
							<h3 className="text-sm font-semibold text-foreground">Recent Sessions</h3>
						</div>
						{recentSessions.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-4">
								<p className="text-xs text-muted">No sessions yet</p>
							</div>
						) : (
							<div className="space-y-2.5">
								{recentSessions.slice(0, 4).map(sess => {
									const typeInfo = formatSessionType(sess.type);
									const Icon = typeInfo.icon;
									return (
										<div key={sess.id} className="flex items-center gap-2.5">
											<div className="w-9 h-9 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
												<Icon className={`w-4 h-4 ${typeInfo.color}`} />
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-xs text-foreground/80 font-medium truncate">{sess.fanName}</p>
												<p className="text-[10px] text-muted/80">
													{typeInfo.label} · {sess.durationMinutes}min
													{sess.actualDurationSeconds && ` · ${formatDuration(sess.actualDurationSeconds)}`}
												</p>
											</div>
											<span className="text-xs font-bold text-emerald-400">+{formatINR(sess.earnings)}</span>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
					<div className="bg-surface border border-border/20 rounded-2xl p-4">
						<h3 className="text-sm font-semibold text-foreground mb-3">Recent Posts</h3>
						<div className="space-y-2.5">
							{creatorPosts.slice(0, 4).map(post => (
								<div key={post.id} className="flex items-center gap-2.5">
									{post.mediaUrl ? (
										<img src={post.mediaUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
									) : (
										<div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
											<span className="text-xs text-muted">T</span>
										</div>
									)}
									<div className="flex-1 min-w-0">
										<p className="text-xs text-foreground/80 truncate">{post.text.slice(0, 50)}...</p>
										<div className="flex items-center gap-2 mt-0.5">
											<span className="text-[10px] text-muted/80 flex items-center gap-0.5">
												<Eye className="w-2.5 h-2.5" /> {post.likes}
											</span>
											{post.isLocked && <span className="text-[10px] text-rose-400">Locked</span>}
										</div>
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="bg-surface border border-border/20 rounded-2xl p-4">
						<h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
						<div className="grid grid-cols-2 gap-2">
							{[
								{ label: 'Go Live', path: '/go-live', color: 'bg-rose-500/15 text-rose-400' },
								{ label: 'Earnings', path: '/creator-dashboard/earnings', color: 'bg-emerald-500/15 text-emerald-400' },
								{ label: 'Subscribers', path: '/creator-dashboard/subscribers', color: 'bg-blue-500/15 text-blue-400' },
								{ label: 'Edit Profile', path: '/creator-dashboard/profile', color: 'bg-amber-500/15 text-amber-400' },
							].map(({ label, path, color }) => (
								<button
									type="button"
									key={label}
									onClick={() => { void navigate(path); }}
									className={`${color} rounded-xl py-2.5 text-xs font-semibold transition-all hover:opacity-80`}
								>
									{label}
								</button>
							))}
						</div>
					</div>
				</div>
			</div>
		</Layout>
	);
}
