import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Compass, MessageCircle, Wallet, LayoutDashboard, DollarSign, FileText, PhoneCall } from '../icons';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';

export function BottomNav() {
	const navigate = useNavigate();
	const location = useLocation();
	const { state: authState } = useAuth();
	const { totalUnread } = useChat();

	const user = authState.user;
	if (!user) return null;

	const isCreator = user.role === 'creator';
	const isAdmin = user.role === 'admin';

	if (isAdmin) return null;

	const fanLinks = [
		{ icon: Home, label: 'Feed', path: '/feed' },
		{ icon: Compass, label: 'Explore', path: '/explore' },
		{ icon: MessageCircle, label: 'Messages', path: '/messages', badge: totalUnread },
		{ icon: PhoneCall, label: 'Calls', path: '/call-history' },
		{ icon: Wallet, label: 'Wallet', path: '/wallet' },
	];

	const creatorLinks = [
		{ icon: LayoutDashboard, label: 'Dashboard', path: '/creator-dashboard' },
		{ icon: FileText, label: 'Content', path: '/creator-dashboard/content' },
		{ icon: MessageCircle, label: 'Messages', path: '/messages', badge: totalUnread },
		{ icon: PhoneCall, label: 'Calls', path: '/call-history' },
		{ icon: DollarSign, label: 'Earnings', path: '/creator-dashboard/earnings' },
	];

	const links = isCreator ? creatorLinks : fanLinks;

	return (
		<nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-xl border-t border-white/5 md:hidden">
			<div className="flex items-center justify-around h-16 px-2">
				{links.map(({ icon: Icon, label, path, badge }) => {
					const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
					return (
						<button
							type="button"
							key={path}
							onClick={() => { void navigate(path); }}
							className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all relative ${
								isActive ? 'text-rose-400' : 'text-white/40 hover:text-white/70'
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
							<span className="text-[10px] font-medium">{label}</span>
							{isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-rose-400 rounded-full" />}
						</button>
					);
				})}
			</div>
		</nav>
	);
}
