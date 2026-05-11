import { useState } from 'react';
import { Search, Ban, CheckCircle, AlertTriangle, Users } from '../../components/icons';
import { Navbar } from '../../components/layout/Navbar';
import { ToastContainer } from '../../components/ui/Toast';
import { useNotifications } from '../../context/NotificationContext';
import { mockUsers } from '../../data/users';
import type { User, AccountStatus } from '../../types';
import { formatDate } from '../../utils/date';
import { UserAvatarMedia } from '../../components/ui/Avatar';

export function UserManagement() {
	const { showToast } = useNotifications();
	const [users, setUsers] = useState<User[]>(mockUsers);
	const [search, setSearch] = useState('');
	const [roleFilter, setRoleFilter] = useState<'all' | 'fan' | 'creator' | 'admin'>('all');

	const filtered = users.filter(u => {
		const matchesSearch = !search ||
			u.name.toLowerCase().includes(search.toLowerCase()) ||
			u.email.toLowerCase().includes(search.toLowerCase());
		const matchesRole = roleFilter === 'all' || u.role === roleFilter;
		return matchesSearch && matchesRole;
	});

	function handleStatusChange(userId: string, newStatus: AccountStatus) {
		setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
		showToast(`User ${newStatus === 'active' ? 'unsuspended' : newStatus}`);
	}

	const statusColors = {
		active: 'bg-emerald-500/20 text-emerald-400',
		suspended: 'bg-amber-500/20 text-amber-400',
		banned: 'bg-rose-500/20 text-rose-400',
	};

	const roleColors = {
		fan: 'bg-blue-500/20 text-blue-400',
		creator: 'bg-rose-500/20 text-rose-400',
		admin: 'bg-foreground/10 text-muted',
	};

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Navbar />
			<ToastContainer />
			<div className="max-w-6xl mx-auto px-4 pt-20 pb-8">
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-3">
						<Users className="w-5 h-5 text-rose-400" />
						<h1 className="text-xl font-bold text-foreground">User Management</h1>
					</div>
					<p className="text-muted text-sm">{filtered.length} users</p>
				</div>

				<div className="flex flex-col sm:flex-row gap-3 mb-4">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
						<input
							value={search}
							onChange={e => setSearch(e.target.value)}
							placeholder="Search users by name or email..."
							className="w-full bg-input border border-border/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						/>
					</div>
					<div className="flex gap-1 bg-foreground/5 p-0.5 rounded-xl">
						{(['all', 'fan', 'creator', 'admin'] as const).map(r => (
							<button
								key={r}
								onClick={() => setRoleFilter(r)}
								className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${
									roleFilter === r ? 'bg-foreground/10 text-foreground' : 'text-muted'
								}`}
							>
								{r}
							</button>
						))}
					</div>
				</div>

				<div className="bg-surface border border-border/20 rounded-2xl overflow-hidden">
					<div className="grid grid-cols-12 gap-3 px-4 py-2 border-b border-border/10">
						<p className="text-xs text-muted col-span-4">User</p>
						<p className="text-xs text-muted col-span-2 hidden sm:block">Role</p>
						<p className="text-xs text-muted col-span-2 hidden sm:block">Joined</p>
						<p className="text-xs text-muted col-span-2 hidden sm:block">Status</p>
						<p className="text-xs text-muted col-span-2">Actions</p>
					</div>

					{filtered.map(user => (
						<div key={user.id} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-border/10 last:border-0 items-center">
							<div className="col-span-4 flex items-center gap-2 min-w-0">
								<UserAvatarMedia src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
								<div className="min-w-0">
									<p className="text-sm font-medium text-foreground truncate">{user.name}</p>
									<p className="text-xs text-muted/80 truncate">{user.email}</p>
								</div>
							</div>
							<div className="col-span-2 hidden sm:block">
								<span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${roleColors[user.role]}`}>
									{user.role}
								</span>
							</div>
							<div className="col-span-2 hidden sm:block">
								<p className="text-xs text-muted">{formatDate(user.createdAt)}</p>
							</div>
							<div className="col-span-2 hidden sm:block">
								<span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[user.status]}`}>
									{user.status}
								</span>
							</div>
							<div className="col-span-2 sm:col-span-2 flex gap-1">
								{user.role !== 'admin' && (
									<>
										{user.status === 'active' ? (
											<button
												onClick={() => handleStatusChange(user.id, 'suspended')}
												className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-colors"
												title="Suspend"
											>
												<AlertTriangle className="w-3.5 h-3.5" />
											</button>
										) : (
											<button
												onClick={() => handleStatusChange(user.id, 'active')}
												className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors"
												title="Unsuspend"
											>
												<CheckCircle className="w-3.5 h-3.5" />
											</button>
										)}
										{user.status !== 'banned' ? (
											<button
												onClick={() => handleStatusChange(user.id, 'banned')}
												className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors"
												title="Ban"
											>
												<Ban className="w-3.5 h-3.5" />
											</button>
										) : (
											<button
												onClick={() => handleStatusChange(user.id, 'active')}
												className="p-1.5 bg-foreground/5 hover:bg-foreground/10 text-muted rounded-lg transition-colors"
												title="Unban"
											>
												<CheckCircle className="w-3.5 h-3.5" />
											</button>
										)}
									</>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
