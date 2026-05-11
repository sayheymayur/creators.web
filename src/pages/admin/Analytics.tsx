import { TrendingUp, DollarSign, Users, Star } from '../../components/icons';
import { Navbar } from '../../components/layout/Navbar';
import { ToastContainer } from '../../components/ui/Toast';
import { mockCreators, mockUsers } from '../../data/users';
import { UserAvatarMedia } from '../../components/ui/Avatar';

export function reports() {
	const totalPlatformRevenue = mockCreators.reduce((s, c) => s + c.totalEarnings, 0) * 0.2;
	const totalCreatorRevenue = mockCreators.reduce((s, c) => s + c.totalEarnings, 0);
	const avgEarningsPerCreator = totalCreatorRevenue / mockCreators.filter(c => c.isKYCVerified).length;

	const monthlyRevenue = [4200, 5100, 6800, 7400, 8100, 9200];
	const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
	const maxRevenue = Math.max(...monthlyRevenue);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Navbar />
			<ToastContainer />
			<div className="max-w-6xl mx-auto px-4 pt-20 pb-8">
				<div className="flex items-center gap-3 mb-6">
					<TrendingUp className="w-5 h-5 text-rose-400" />
					<h1 className="text-xl font-bold text-foreground">Platform reports</h1>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
					{[
						{ label: 'Platform Revenue', value: `₹${(totalPlatformRevenue / 1000).toFixed(1)}K`, icon: DollarSign, color: 'bg-emerald-500/15 text-emerald-400' },
						{ label: 'Total Creators', value: mockCreators.filter(c => c.isKYCVerified).length.toString(), icon: Star, color: 'bg-rose-500/15 text-rose-400' },
						{ label: 'Total Users', value: mockUsers.filter(u => u.role === 'fan').length.toString(), icon: Users, color: 'bg-blue-500/15 text-blue-400' },
						{ label: 'Avg Creator Revenue', value: `₹${(avgEarningsPerCreator / 1000).toFixed(1)}K`, icon: TrendingUp, color: 'bg-amber-500/15 text-amber-400' },
					].map(({ label, value, icon: Icon, color }) => (
						<div key={label} className="bg-surface border border-border/20 rounded-2xl p-4">
							<div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center mb-2`}>
								<Icon className="w-4 h-4" />
							</div>
							<p className="text-xl font-black text-foreground">{value}</p>
							<p className="text-xs text-muted">{label}</p>
						</div>
					))}
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
					<div className="bg-surface border border-border/20 rounded-2xl p-5">
						<h3 className="font-semibold text-foreground mb-4">Platform Revenue (6 months)</h3>
						<div className="flex items-end gap-2 h-32">
							{monthlyRevenue.map((val, i) => (
								<div key={i} className="flex-1 flex flex-col items-center gap-1">
									<div
										className="w-full rounded-t-lg bg-gradient-to-t from-emerald-700 to-emerald-400 transition-all"
										style={{ height: `${(val / maxRevenue) * 100}%` }}
									/>
									<p className="text-[9px] text-muted/80">{months[i]}</p>
								</div>
							))}
						</div>
					</div>

					<div className="bg-surface border border-border/20 rounded-2xl p-5">
						<h3 className="font-semibold text-foreground mb-4">Top Earning Creators</h3>
						<div className="space-y-3">
							{mockCreators.filter(c => c.isKYCVerified).sort((a, b) => b.totalEarnings - a.totalEarnings).slice(0, 5).map((creator, i) => {
								const max = mockCreators[0].totalEarnings;
								const pct = (creator.totalEarnings / max) * 100;
								return (
									<div key={creator.id} className="flex items-center gap-2">
										<p className="text-xs text-muted/80 w-4 shrink-0">{i + 1}</p>
										<UserAvatarMedia src={creator.avatar} alt={creator.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
										<p className="text-xs text-muted w-20 truncate">{creator.name}</p>
										<div className="flex-1 h-2 bg-foreground/10 rounded-full overflow-hidden">
											<div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-full" style={{ width: `${pct}%` }} />
										</div>
										<p className="text-xs font-semibold text-muted w-14 text-right shrink-0">
											₹{(creator.totalEarnings / 1000).toFixed(1)}K
										</p>
									</div>
								);
							})}
						</div>
					</div>
				</div>

				<div className="bg-surface border border-border/20 rounded-2xl p-5">
					<h3 className="font-semibold text-foreground mb-4">Revenue Breakdown</h3>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						{[
							{ label: 'From Subscriptions', value: totalCreatorRevenue * 0.8 * 0.2, pct: '80%', color: 'bg-rose-500' },
							{ label: 'From Tips (10%)', value: totalCreatorRevenue * 0.1 * 0.1, pct: '10%', color: 'bg-amber-500' },
							{ label: 'From PPV (10%)', value: totalCreatorRevenue * 0.1 * 0.2, pct: '10%', color: 'bg-blue-500' },
						].map(({ label, value, pct, color }) => (
							<div key={label} className="bg-foreground/5 rounded-xl p-4 text-center">
								<div className={`w-3 h-3 ${color} rounded-full mx-auto mb-2`} />
								<p className="text-xl font-black text-foreground">₹{(value / 1000).toFixed(1)}K</p>
								<p className="text-xs text-muted">{label}</p>
								<p className="text-xs text-muted/80 mt-0.5">{pct} of revenue</p>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
