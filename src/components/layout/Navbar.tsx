import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, Wallet, ChevronDown, LogOut, Settings, User, Shield, LayoutDashboard, Sun, Moon } from '../icons';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useChat } from '../../context/ChatContext';
import { useTheme } from '../../context/ThemeContext';
import { Avatar } from '../ui/Avatar';
import { NotificationPanel } from './NotificationPanel';
import { formatINRFromMinor } from '../../utils/money';

export function Navbar() {
	const navigate = useNavigate();
	const location = useLocation();
	const { state: authState, logout } = useAuth();
	const { getUnreadCount } = useNotifications();
	const { totalUnread } = useChat();
	const { mode, toggle } = useTheme();
	const [showUserMenu, setShowUserMenu] = useState(false);
	const [showNotifications, setShowNotifications] = useState(false);

	const user = authState.user;
	const unreadNotifs = user ? getUnreadCount(user.id) : 0;

	useEffect(() => {
		setShowNotifications(false);
		setShowUserMenu(false);
	}, [location.pathname]);

	function handleLogout() {
		logout();
		void navigate('/');
		setShowUserMenu(false);
	}

	if (!user) return null;

	const isCreator = user.role === 'creator';
	const isAdmin = user.role === 'admin';

	return (
		<nav className="fixed top-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/10">
			<div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
				<button
					type="button"
					onClick={() => { void navigate(isAdmin ? '/admin' : isCreator ? '/creator-dashboard' : '/feed'); }}
					className="flex items-center gap-2 shrink-0"
				>
					<div className="w-7 h-7 bg-rose-500 rounded-lg flex items-center justify-center">
						<span className="text-white font-black text-sm">cw</span>
					</div>
					<span className="font-bold text-foreground text-base hidden sm:block">creators.web</span>
				</button>

				{!isAdmin && (
					<div className="hidden md:flex items-center gap-1">
						{!isCreator && (
							<>
								<NavLink
									label="Feed"
									path="/feed"
									current={location.pathname}
									onClick={() => { void navigate('/feed'); }}
								/>
								<NavLink
									label="Explore"
									path="/explore"
									current={location.pathname}
									onClick={() => { void navigate('/explore'); }}
								/>
								<NavLink
									label="Saved"
									path="/saved"
									current={location.pathname}
									onClick={() => { void navigate('/saved'); }}
								/>
								<NavLink
									label="Notifications"
									path="/notifications"
									current={location.pathname}
									onClick={() => { void navigate('/notifications'); }}
									badge={unreadNotifs}
									exact
								/>
								<NavLink
									label="Messages"
									path="/messages"
									current={location.pathname}
									onClick={() => { void navigate('/messages'); }}
									badge={totalUnread}
								/>
							</>
						)}
						{isCreator && (
							<>
								<NavLink
									label="Dashboard"
									path="/creator-dashboard"
									current={location.pathname}
									onClick={() => { void navigate('/creator-dashboard'); }}
									exact
								/>
								<NavLink
									label="Content"
									path="/creator-dashboard/content"
									current={location.pathname}
									onClick={() => { void navigate('/creator-dashboard/content'); }}
								/>
								<NavLink
									label="Messages"
									path="/messages"
									current={location.pathname}
									onClick={() => { void navigate('/messages'); }}
									badge={totalUnread}
								/>
								<NavLink
									label="Notifications"
									path="/notifications"
									current={location.pathname}
									onClick={() => { void navigate('/notifications'); }}
									badge={unreadNotifs}
									exact
								/>
								<NavLink
									label="Earnings"
									path="/creator-dashboard/earnings"
									current={location.pathname}
									onClick={() => { void navigate('/creator-dashboard/earnings'); }}
								/>
							</>
						)}
					</div>
				)}

				{isAdmin && (
					<div className="hidden md:flex items-center gap-1">
						<NavLink
							label="Dashboard"
							path="/admin"
							current={location.pathname}
							onClick={() => { void navigate('/admin'); }}
							exact
						/>
						<NavLink
							label="Notifications"
							path="/notifications"
							current={location.pathname}
							onClick={() => { void navigate('/notifications'); }}
							badge={unreadNotifs}
							exact
						/>
						<NavLink
							label="KYC Queue"
							path="/admin/creators"
							current={location.pathname}
							onClick={() => { void navigate('/admin/creators'); }}
						/>
						<NavLink
							label="Users"
							path="/admin/users"
							current={location.pathname}
							onClick={() => { void navigate('/admin/users'); }}
						/>
						<NavLink
							label="Moderation"
							path="/admin/moderation"
							current={location.pathname}
							onClick={() => { void navigate('/admin/moderation'); }}
						/>
						<NavLink
							label="reports"
							path="/admin/reports"
							current={location.pathname}
							onClick={() => { void navigate('/admin/reports'); }}
						/>
					</div>
				)}

				<div className="flex items-center gap-2 shrink-0">
					<button
						type="button"
						onClick={e => { toggle(e); }}
						aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
						className="p-2 rounded-xl hover:bg-foreground/10 transition-colors"
					>
						{mode === 'dark' ? <Sun className="w-5 h-5 text-muted" /> : <Moon className="w-5 h-5 text-muted" />}
					</button>
					{!isAdmin && !isCreator && (
						<button
							type="button"
							onClick={() => { void navigate('/wallet'); }}
							className="hidden sm:flex items-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 px-3 py-1.5 rounded-xl transition-colors"
						>
							<Wallet className="w-3.5 h-3.5 text-emerald-400" />
							<span className="text-xs font-semibold text-foreground">
								{formatINRFromMinor(user.walletBalanceMinor)}
							</span>
						</button>
					)}

					<div className="relative">
						<button
							type="button"
							onClick={() => { setShowNotifications(v => !v); setShowUserMenu(false); }}
							className="relative p-2 rounded-xl hover:bg-foreground/10 transition-colors"
						>
							<Bell className="w-5 h-5 text-muted" />
							{unreadNotifs > 0 && (
								<span
									className={
										'absolute top-0.5 right-0.5 w-4 h-4 bg-rose-500 text-white text-[9px] ' +
										'font-bold rounded-full flex items-center justify-center'
									}
								>
									{unreadNotifs > 9 ? '9+' : unreadNotifs}
								</span>
							)}
						</button>
						{showNotifications && <NotificationPanel onClose={() => setShowNotifications(false)} />}
					</div>

					<div className="relative">
						<button
							type="button"
							onClick={() => { setShowUserMenu(v => !v); setShowNotifications(false); }}
							className={
								'flex items-center gap-2 hover:bg-foreground/10 pl-1 pr-2 py-1 ' +
								'rounded-xl transition-colors'
							}
						>
							<Avatar src={user.avatar} alt={user.name} size="sm" />
							<ChevronDown className="w-3.5 h-3.5 text-muted hidden sm:block" />
						</button>

						{showUserMenu && (
							<div
								className={
									'absolute right-0 top-full mt-2 w-52 bg-surface2 border ' +
									'border-border/20 rounded-2xl shadow-2xl py-1.5 z-50'
								}
							>
								<div className="px-3 py-2 border-b border-border/10 mb-1">
									<p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
									<p className="text-xs text-muted truncate">{user.email}</p>
									{!isAdmin && (
										<p className="text-xs text-muted/80 mt-0.5">
											Balance: {formatINRFromMinor(user.walletBalanceMinor)}
										</p>
									)}
								</div>

								{!isAdmin && (
									<MenuItem
										icon={<User className="w-4 h-4" />}
										label="Profile"
										onClick={() => {
											void navigate(isCreator ? '/creator-dashboard/profile' : '/settings');
											setShowUserMenu(false);
										}}
									/>
								)}
								{!isCreator && !isAdmin && (
									<MenuItem
										icon={<Wallet className="w-4 h-4" />}
										label="Wallet"
										onClick={() => {
											void navigate('/wallet');
											setShowUserMenu(false);
										}}
									/>
								)}
								{isCreator && (
									<MenuItem
										icon={<LayoutDashboard className="w-4 h-4" />}
										label="Dashboard"
										onClick={() => {
											void navigate('/creator-dashboard');
											setShowUserMenu(false);
										}}
									/>
								)}
								{isAdmin && (
									<MenuItem
										icon={<Shield className="w-4 h-4" />}
										label="Admin Panel"
										onClick={() => {
											void navigate('/admin');
											setShowUserMenu(false);
										}}
									/>
								)}
								<MenuItem
									icon={<Settings className="w-4 h-4" />}
									label="Settings"
									onClick={() => {
										void navigate('/settings');
										setShowUserMenu(false);
									}}
								/>
								<div className="border-t border-border/10 mt-1 pt-1">
									<MenuItem
										icon={<LogOut className="w-4 h-4" />}
										label="Sign Out"
										onClick={handleLogout}
										danger
									/>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</nav>
	);
}

function NavLink({ label, path, current, onClick, badge, exact }: {
	label: string,
	path: string,
	current: string,
	onClick: () => void,
	badge?: number,
	exact?: boolean,
}) {
	const isActive = exact ? current === path : current === path || (path !== '/' && current.startsWith(path));
	return (
		<button
			type="button"
			onClick={onClick}
			className={`relative px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${isActive ?
				'text-foreground bg-foreground/10' :
				'text-muted hover:text-foreground hover:bg-foreground/5'
			}`}
		>
			{label}
			{badge && badge > 0 ? (
				<span
					className={
						'absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[9px] ' +
						'font-bold rounded-full flex items-center justify-center'
					}
				>
					{badge > 9 ? '9+' : badge}
				</span>
			) : null}
		</button>
	);
}

function MenuItem({ icon, label, onClick, danger }: {
	icon: React.ReactNode,
	label: string,
	onClick: () => void,
	danger?: boolean,
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors rounded-lg mx-1 ${danger ?
				'text-rose-400 hover:bg-rose-500/10' :
				'text-muted hover:text-foreground hover:bg-foreground/10'
			}`}
			style={{ width: 'calc(100% - 8px)' }}
		>
			{icon}
			{label}
		</button>
	);
}
