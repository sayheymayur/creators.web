import { useEffect, useMemo, useRef, useState } from 'react';
import { User, Bell, Shield, LogOut, Eye, EyeOff, Save, Camera } from '../components/icons';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { ApiError, apiErrorMessage, creatorsApi, type NotificationSettings } from '../services/creatorsApi';
import { uploadMediaAsset } from '../services/mediaUpload';

const defaultNotifPrefs: NotificationSettings = {
	messages: true,
	subscriptions: true,
	tips: true,
	likes: true,
	system: true,
};

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
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [isChangingPassword, setIsChangingPassword] = useState(false);
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
	const avatarInputRef = useRef<HTMLInputElement | null>(null);
	const [notifPrefs, setNotifPrefs] = useState({
		messages: true,
		subscriptions: true,
		tips: true,
		likes: true,
		system: true,
	});
	const [notifLoading, setNotifLoading] = useState(false);
	const [notifDirty, setNotifDirty] = useState(false);

	useEffect(() => {
		if (!user) return;
		setNotifLoading(true);
		void creatorsApi.me.notificationSettings.get()
			.then(res => {
				if (!res?.settings) return;
				setNotifPrefs({
					messages: Boolean(res.settings.messages),
					subscriptions: Boolean(res.settings.subscriptions),
					tips: Boolean(res.settings.tips),
					likes: Boolean(res.settings.likes),
					system: Boolean(res.settings.system),
				});
				setNotifDirty(false);
			})
			.catch(() => {
				// Per spec: defaults are true when nothing saved yet.
				// If the endpoint is unavailable in some env, keep local defaults and avoid blocking Settings.
				setNotifPrefs({ ...defaultNotifPrefs });
				setNotifDirty(false);
			})
			.finally(() => setNotifLoading(false));
		// We intentionally load once per Settings mount.
	}, []);

	function handleSaveProfile() {
		setIsSavingProfile(true);
		void creatorsApi.me.updateProfile({ name: name.trim() || undefined })
			.then(({ user: updated }) => {
				updateUser(updated);
				showToast('Profile updated!');
			})
			.catch(err => {
				if (err instanceof ApiError) {
					showToast(`Save failed (HTTP ${err.status}).`, 'error');
					return;
				}
				showToast('Save failed.', 'error');
			})
			.finally(() => setIsSavingProfile(false));
	}

	const avatarPreviewUrl = useMemo(() => {
		if (!avatarFile) return null;
		return URL.createObjectURL(avatarFile);
	}, [avatarFile]);

	function handleSaveAvatar() {
		if (!avatarFile) return;
		setIsUploadingAvatar(true);
		void uploadMediaAsset('avatar', avatarFile)
			.then(r => creatorsApi.me.updateProfile({ avatarAssetId: r.assetId }))
			.then(({ user: updated }) => {
				updateUser(updated);
				showToast('Avatar updated!');
				setAvatarFile(null);
			})
			.catch(err => {
				const msg =
					err instanceof ApiError ? `Avatar update failed (HTTP ${err.status}).` :
					err instanceof Error ? err.message :
					'Avatar update failed.';
				showToast(msg, 'error');
			})
			.finally(() => setIsUploadingAvatar(false));
	}

	function handleChangePassword() {
		if (!currentPassword || !newPassword) { showToast('Please fill in both fields', 'error'); return; }
		if (newPassword.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
		setIsChangingPassword(true);
		void creatorsApi.me.changePassword({ currentPassword, newPassword })
			.then(() => {
				showToast('Password changed successfully!');
				setCurrentPassword('');
				setNewPassword('');
			})
			.catch((err: unknown) => {
				showToast(apiErrorMessage(err, 'Could not change password'), 'error');
			})
			.finally(() => setIsChangingPassword(false));
	}

	function handleLogout() {
		logout();
		navigate('/');
	}

	if (!user) return null;

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
				<h1 className="text-xl font-bold text-foreground mb-6">Settings</h1>

				<section className="bg-surface border border-border/20 rounded-2xl p-5">
					<div className="flex items-center gap-2 mb-4">
						<User className="w-4 h-4 text-rose-400" />
						<h2 className="font-semibold text-foreground">Profile</h2>
					</div>
					<div className="flex items-center gap-4 mb-4">
						<div className="relative">
							<img src={avatarPreviewUrl ?? user.avatar} alt={user.name} className="w-14 h-14 rounded-2xl object-cover" />
							{user.role === 'fan' && (
								<button
									type="button"
									onClick={() => avatarInputRef.current?.click()}
									className="absolute -bottom-2 -right-2 w-7 h-7 rounded-xl bg-foreground/10 hover:bg-foreground/20 border border-border/30 flex items-center justify-center transition-colors"
									aria-label="Change avatar"
								>
									<Camera className="w-4 h-4 text-foreground" />
								</button>
							)}
						</div>
						<div>
							<p className="font-semibold text-foreground">{user.name}</p>
							<p className="text-sm text-muted">{user.email}</p>
							<p className="text-xs text-rose-400/70 capitalize mt-0.5">{user.role} account</p>
						</div>
					</div>
					{user.role === 'fan' && (
						<div className="mb-4">
							<input
								ref={avatarInputRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={e => {
									const f = e.target.files?.[0] ?? null;
									setAvatarFile(f);
								}}
							/>
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs text-muted">
									Upload a profile picture (avatar) for your fan account.
								</p>
								<Button
									variant="outline"
									size="sm"
									onClick={() => { handleSaveAvatar(); }}
									isLoading={isUploadingAvatar}
									disabled={!avatarFile || isUploadingAvatar}
								>
									Save avatar
								</Button>
							</div>
						</div>
					)}
					<div className="mb-3">
						<label className="block text-sm text-muted mb-1.5">Display Name</label>
						<input
							value={name}
							onChange={e => setName(e.target.value)}
							className="w-full bg-input border border-border/20 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						/>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => { handleSaveProfile(); }}
						isLoading={isSavingProfile}
						leftIcon={<Save className="w-3.5 h-3.5" />}
					>
						Save
					</Button>
				</section>

				<section className="bg-surface border border-border/20 rounded-2xl p-5">
					<div className="flex items-center gap-2 mb-4">
						<Shield className="w-4 h-4 text-rose-400" />
						<h2 className="font-semibold text-foreground">Security</h2>
					</div>
					<div className="space-y-3">
						<div>
							<label className="block text-sm text-muted mb-1.5">Current Password</label>
							<div className="relative">
								<input
									type={showCurrent ? 'text' : 'password'}
									value={currentPassword}
									onChange={e => setCurrentPassword(e.target.value)}
									placeholder="••••••••"
									className="w-full bg-input border border-border/20 rounded-xl px-4 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
								/>
								<button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
									{showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
								</button>
							</div>
						</div>
						<div>
							<label className="block text-sm text-muted mb-1.5">New Password</label>
							<div className="relative">
								<input
									type={showNew ? 'text' : 'password'}
									value={newPassword}
									onChange={e => setNewPassword(e.target.value)}
									placeholder="Min 8 characters"
									className="w-full bg-input border border-border/20 rounded-xl px-4 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
								/>
								<button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
									{showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
								</button>
							</div>
						</div>
						<Button variant="outline" size="sm" onClick={() => { handleChangePassword(); }} isLoading={isChangingPassword}>
							Change Password
						</Button>
					</div>
				</section>

				<section className="bg-surface border border-border/20 rounded-2xl p-5">
					<div className="flex items-center gap-2 mb-4">
						<Bell className="w-4 h-4 text-rose-400" />
						<h2 className="font-semibold text-foreground">Notifications</h2>
					</div>
					<p className="text-xs text-muted mb-4">
						Follow/unfollow alerts are controlled by <span className="text-foreground/80 font-medium">Likes</span> (per backend spec).
					</p>
					<div className="space-y-3">
						{(Object.keys(notifPrefs) as (keyof NotificationSettings)[]).map(key => (
							<div key={key} className="flex items-center justify-between">
								<span className="text-sm text-muted capitalize">{key}</span>
								<label className="relative inline-flex items-center cursor-pointer select-none">
									<input
										type="checkbox"
										className="sr-only peer"
										checked={notifPrefs[key]}
										disabled={notifLoading}
										onChange={() => {
											setNotifDirty(true);
											setNotifPrefs(p => ({ ...p, [key]: !p[key] }));
										}}
										role="switch"
										aria-label={`${String(key)} notifications`}
									/>
									<span
										className={[
											'relative inline-flex h-6 w-11 rounded-full border transition-colors',
											'bg-foreground/10 border-border/30',
											'peer-checked:bg-rose-500 peer-checked:border-rose-500/40',
											'peer-focus-visible:ring-2 peer-focus-visible:ring-ring/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
											"after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200",
											'peer-checked:after:translate-x-5',
										].join(' ')}
									/>
								</label>
							</div>
						))}
					</div>
					<div className="flex items-center justify-end gap-2 mt-4">
						<Button
							variant="outline"
							size="sm"
							disabled={!notifDirty || notifLoading}
							isLoading={notifLoading}
							onClick={() => {
								setNotifLoading(true);
								void creatorsApi.me.notificationSettings.update({ settings: notifPrefs })
									.then(() => {
										showToast('Notification preferences saved!');
										setNotifDirty(false);
									})
									.catch(err => {
										const msg =
											err instanceof ApiError ? `Save failed (HTTP ${err.status}).` :
											err instanceof Error ? err.message :
											'Save failed.';
										showToast(msg, 'error');
									})
									.finally(() => setNotifLoading(false));
							}}
						>
							Save notification settings
						</Button>
					</div>
				</section>

				<section className="bg-surface border border-border/20 rounded-2xl p-5">
					<h2 className="font-semibold text-foreground mb-3">Danger Zone</h2>
					<div className="space-y-2">
						<Button
							variant="outline"
							fullWidth
							onClick={() => { void navigate('/delete-account-request'); }}
							className="border-red-500/25 text-red-300 hover:border-red-500/40 hover:bg-red-500/10"
						>
							Request account deletion
						</Button>
						<Button
							variant="danger"
							fullWidth
							onClick={handleLogout}
							leftIcon={<LogOut className="w-4 h-4" />}
						>
							Sign Out
						</Button>
					</div>
				</section>
			</div>
		</Layout>
	);
}
