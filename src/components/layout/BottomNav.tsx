import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Compass, MessageCircle, Wallet, LayoutDashboard, DollarSign, FileText, PhoneCall, Bookmark, Bell } from '../icons';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useNotifications } from '../../context/NotificationContext';

export function BottomNav() {
	const navigate = useNavigate();
	const location = useLocation();
	const { state: authState } = useAuth();
	const { totalUnread } = useChat();
	const { getUnreadCount } = useNotifications();

	const user = authState.user;
	if (!user) return null;

	const isCreator = user.role === 'creator';
	const isAdmin = user.role === 'admin';

	if (isAdmin) return null;

	const unreadNotifs = getUnreadCount(user.id);

	const fanLinks = [
		{ icon: Home, label: 'Feed', path: '/feed' },
		{ icon: Compass, label: 'Explore', path: '/explore' },
		{ icon: Bookmark, label: 'Saved', path: '/saved' },
		{ icon: Bell, label: 'Notifications', path: '/notifications', badge: unreadNotifs },
		{ icon: MessageCircle, label: 'Messages', path: '/messages', badge: totalUnread },
		{ icon: PhoneCall, label: 'Calls', path: '/call-history' },
		{ icon: Wallet, label: 'Wallet', path: '/wallet' },
	];

	const creatorLinks = [
		{ icon: LayoutDashboard, label: 'Dashboard', path: '/creator-dashboard' },
		{ icon: FileText, label: 'Content', path: '/creator-dashboard/content' },
		{ icon: Bell, label: 'Notifications', path: '/notifications', badge: unreadNotifs },
		{ icon: MessageCircle, label: 'Messages', path: '/messages', badge: totalUnread },
		{ icon: PhoneCall, label: 'Calls', path: '/call-history' },
		{ icon: DollarSign, label: 'Earnings', path: '/creator-dashboard/earnings' },
	];

	const links = isCreator ? creatorLinks : fanLinks;

	return (
		<nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/10 md:hidden">
			<div className="flex items-center h-16 px-1 gap-0.5 overflow-x-auto scrollbar-hide flex-nowrap justify-start min-w-0">
				{links.map(({ icon: Icon, label, path, badge }) => {
					const isActive =
						path === '/notifications' ?
							location.pathname === '/notifications' :
							location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
					return (
						<button
							type="button"
							key={path}
							onClick={() => { void navigate(path); }}
							className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-all relative shrink-0 ${
								isActive ? 'text-rose-500' : 'text-muted hover:text-foreground'
							}`}
						>
							<div className="relative">
								<Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
								{badge && badge > 0 ? (
									<span className="absolute -top-1 -right-1.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
										{badge > 9 ? '9+' : badge}
									</span>
								) : null}
							</div>
							<span className="text-[10px] font-medium whitespace-nowrap">{label}</span>
							{isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-rose-400 rounded-full" />}
						</button>
					);
				})}
			</div>
		</nav>
	);
}
