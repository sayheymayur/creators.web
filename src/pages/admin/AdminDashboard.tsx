import { useNavigate } from 'react-router-dom';
import { Users, TrendingUp, Shield, AlertTriangle, DollarSign, Star, ArrowRight } from '../../components/icons';
import { Navbar } from '../../components/layout/Navbar';
import { ToastContainer } from '../../components/ui/Toast';
import { mockCreators, mockUsers } from '../../data/users';
import { mockKYCApplications, mockReports } from '../../data/transactions';
import { mockPosts } from '../../data/posts';

export function AdminDashboard() {
	const navigate = useNavigate();

	const totalRevenue = mockCreators.reduce((s, c) => s + c.totalEarnings, 0);
	const platformRevenue = totalRevenue * 0.2;
	const pendingKYC = mockKYCApplications.filter(k => k.status === 'pending').length;
	const pendingReports = mockReports.filter(r => r.status === 'pending').length;
	const totalCreators = mockCreators.filter(c => c.isKYCVerified).length;

	const stats = [
		{ label: 'Total Users', value: mockUsers.length.toString(), icon: Users, color: 'bg-blue-500/15 text-blue-400', path: '/admin/users' },
		{ label: 'Active Creators', value: totalCreators.toString(), icon: Star, color: 'bg-rose-500/15 text-rose-400', path: '/admin/creators' },
		{ label: 'Platform Revenue', value: `$${(platformRevenue / 1000).toFixed(1)}K`, icon: DollarSign, color: 'bg-emerald-500/15 text-emerald-400', path: '/admin/reports' },
		{ label: 'Pending KYC', value: pendingKYC.toString(), icon: Shield, color: 'bg-amber-500/15 text-amber-400', path: '/admin/creators' },
		{ label: 'Open Reports', value: pendingReports.toString(), icon: AlertTriangle, color: 'bg-red-500/15 text-red-400', path: '/admin/moderation' },
		{ label: 'Total Content', value: mockPosts.length.toString(), icon: TrendingUp, color: 'bg-foreground/10 text-muted', path: '/admin/moderation' },
	];

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Navbar />
			<ToastContainer />
			<div className="max-w-6xl mx-auto px-4 pt-20 pb-8">
				<div className="mb-6">
					<h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
					<p className="text-muted text-sm">Platform management and moderation</p>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
					{stats.map(({ label, value, icon: Icon, color, path }) => (
						<button
							key={label}
							onClick={() => void navigate(path)}
							className="bg-surface border border-border/20 rounded-2xl p-4 text-left hover:border-border/30 transition-all group"
						>
							<div className="flex items-start justify-between mb-3">
								<div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
									<Icon className="w-5 h-5" />
								</div>
								<ArrowRight className="w-4 h-4 text-muted/70 group-hover:text-foreground/80 transition-colors" />
							</div>
							<p className="text-2xl font-black text-foreground">{value}</p>
							<p className="text-xs text-muted">{label}</p>
						</button>
					))}
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
					<div className="bg-surface border border-border/20 rounded-2xl p-4">
						<div className="flex items-center justify-between mb-3">
							<h3 className="font-semibold text-foreground text-sm">Top Creators</h3>
							<button onClick={() => void navigate('/admin/creators')} className="text-xs text-rose-400">View all</button>
						</div>
						<div className="space-y-3">
							{mockCreators.filter(c => c.isKYCVerified).slice(0, 4).map(creator => (
								<div key={creator.id} className="flex items-center gap-3">
									<img src={creator.avatar} alt={creator.name} className="w-9 h-9 rounded-full object-cover" />
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-foreground truncate">{creator.name}</p>
										<p className="text-xs text-muted">{creator.subscriberCount.toLocaleString()} subscribers</p>
									</div>
									<span className="text-xs font-semibold text-emerald-400">${creator.monthlyEarnings.toLocaleString()}/mo</span>
								</div>
							))}
						</div>
					</div>

					<div className="bg-surface border border-border/20 rounded-2xl p-4">
						<div className="flex items-center justify-between mb-3">
							<h3 className="font-semibold text-foreground text-sm">Recent Reports</h3>
							<button onClick={() => void navigate('/admin/moderation')} className="text-xs text-rose-400">View all</button>
						</div>
						<div className="space-y-3">
							{mockReports.map(report => (
								<div key={report.id} className="flex items-start gap-2">
									<div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${report.status === 'pending' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
									<div className="flex-1 min-w-0">
										<p className="text-xs font-medium text-foreground/80 truncate">{report.reason}</p>
										<p className="text-[10px] text-muted/80">{report.reporterName} · {report.targetType}</p>
									</div>
									<span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
										report.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
									}`}
									>
										{report.status}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="bg-surface border border-border/20 rounded-2xl p-4">
					<h3 className="font-semibold text-foreground text-sm mb-3">Platform Revenue Trend</h3>
					<div className="flex items-end gap-1.5 h-20">
						{[28, 35, 40, 44, 42, 48].map((val, i) => (
							<div key={i} className="flex-1 flex flex-col items-center gap-1">
								<div
									className="w-full rounded-t-lg bg-gradient-to-t from-emerald-700 to-emerald-400"
									style={{ height: `${(val / 48) * 100}%` }}
								/>
								<p className="text-[9px] text-muted/80">{['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'][i]}</p>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
