import { useState } from 'react';
import { User, Bell, Shield, LogOut, Eye, EyeOff, Save } from '../components/icons';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { delayMs } from '../utils/delay';

export function Settings() {
	const { state: authState, logout, updateUser } = useAuth();
	const { showToast } = useNotifications();
	const navigate = useNavigate();
	const user = authState.user;

	const [name, setName] = useState(user?.name ?? '');
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [showCurrent, setShowCurrent] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [notifPrefs, setNotifPrefs] = useState({
		messages: true,
		subscriptions: true,
		tips: true,
		likes: true,
		system: true,
	});

	function handleSaveProfile() {
		setIsSaving(true);
		void delayMs(700).then(() => {
			updateUser({ name });
			showToast('Profile updated!');
			setIsSaving(false);
		});
	}

	function handleChangePassword() {
		if (!currentPassword || !newPassword) { showToast('Please fill in both fields', 'error'); return; }
		if (newPassword.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
		setIsSaving(true);
		void delayMs(700).then(() => {
			showToast('Password changed successfully!');
			setCurrentPassword('');
			setNewPassword('');
			setIsSaving(false);
		});
	}

	function handleLogout() {
		logout();
		navigate('/');
	}

	if (!user) return null;

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
				<h1 className="text-xl font-bold text-white mb-6">Settings</h1>

				<section className="bg-[#161616] border border-white/5 rounded-2xl p-5">
					<div className="flex items-center gap-2 mb-4">
						<User className="w-4 h-4 text-rose-400" />
						<h2 className="font-semibold text-white">Profile</h2>
					</div>
					<div className="flex items-center gap-4 mb-4">
						<img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-2xl object-cover" />
						<div>
							<p className="font-semibold text-white">{user.name}</p>
							<p className="text-sm text-white/40">{user.email}</p>
							<p className="text-xs text-rose-400/70 capitalize mt-0.5">{user.role} account</p>
						</div>
					</div>
					<div className="mb-3">
						<label className="block text-sm text-white/50 mb-1.5">Display Name</label>
						<input
							value={name}
							onChange={e => setName(e.target.value)}
							className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500/50"
						/>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => { handleSaveProfile(); }}
						isLoading={isSaving}
						leftIcon={<Save className="w-3.5 h-3.5" />}
					>
						Save
					</Button>
				</section>

				<section className="bg-[#161616] border border-white/5 rounded-2xl p-5">
					<div className="flex items-center gap-2 mb-4">
						<Shield className="w-4 h-4 text-rose-400" />
						<h2 className="font-semibold text-white">Security</h2>
					</div>
					<div className="space-y-3">
						<div>
							<label className="block text-sm text-white/50 mb-1.5">Current Password</label>
							<div className="relative">
								<input
									type={showCurrent ? 'text' : 'password'}
									value={currentPassword}
									onChange={e => setCurrentPassword(e.target.value)}
									placeholder="••••••••"
									className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500/50"
								/>
								<button onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
									{showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
								</button>
							</div>
						</div>
						<div>
							<label className="block text-sm text-white/50 mb-1.5">New Password</label>
							<div className="relative">
								<input
									type={showNew ? 'text' : 'password'}
									value={newPassword}
									onChange={e => setNewPassword(e.target.value)}
									placeholder="Min 8 characters"
									className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500/50"
								/>
								<button onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
									{showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
								</button>
							</div>
						</div>
						<Button variant="outline" size="sm" onClick={() => { handleChangePassword(); }} isLoading={isSaving}>
							Change Password
						</Button>
					</div>
				</section>

				<section className="bg-[#161616] border border-white/5 rounded-2xl p-5">
					<div className="flex items-center gap-2 mb-4">
						<Bell className="w-4 h-4 text-rose-400" />
						<h2 className="font-semibold text-white">Notifications</h2>
					</div>
					<div className="space-y-3">
						{(Object.keys(notifPrefs) as (keyof typeof notifPrefs)[]).map(key => (
							<div key={key} className="flex items-center justify-between">
								<span className="text-sm text-white/60 capitalize">{key}</span>
								<button
									onClick={() => setNotifPrefs(p => ({ ...p, [key]: !p[key] }))}
									className={`w-10 rounded-full transition-all relative ${notifPrefs[key] ? 'bg-rose-500' : 'bg-white/20'}`}
									style={{ height: '22px' }}
								>
									<div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${notifPrefs[key] ? 'left-5' : 'left-0.5'}`} />
								</button>
							</div>
						))}
					</div>
				</section>

				<section className="bg-[#161616] border border-white/5 rounded-2xl p-5">
					<h2 className="font-semibold text-white mb-3">Danger Zone</h2>
					<Button
						variant="danger"
						fullWidth
						onClick={handleLogout}
						leftIcon={<LogOut className="w-4 h-4" />}
					>
						Sign Out
					</Button>
				</section>
			</div>
		</Layout>
	);
}
