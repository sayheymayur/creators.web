import { useState } from 'react';
import { Camera, Save } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/Button';
import { useAuth, useCurrentCreator } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { mockCreators } from '../../data/users';
import { delayMs } from '../../utils/delay';

export function ProfileEditor() {
	const creator = useCurrentCreator();
	const { state: authState, updateUser, updateCreatorProfile } = useAuth();
	const { showToast } = useNotifications();

	const creatorData = creator ?? mockCreators[0];
	const currentUser = authState.user;
	const isNewGoogleCreator = !!currentUser &&
		currentUser.role === 'creator' &&
		!authState.creatorProfiles[currentUser.id] &&
		!mockCreators.some(c => c.id === currentUser.id);

	const [name, setName] = useState(isNewGoogleCreator && currentUser ? currentUser.name : creatorData.name);
	const [username, setUsername] = useState(isNewGoogleCreator && currentUser ? currentUser.username : creatorData.username);
	const [bio, setBio] = useState(creatorData.bio);
	const [price, setPrice] = useState(String(creatorData.subscriptionPrice));
	const [category, setCategory] = useState(creatorData.category);
	const [avatarUrl, setAvatarUrl] = useState(isNewGoogleCreator && currentUser ? currentUser.avatar : creatorData.avatar);
	const [bannerUrl, setBannerUrl] = useState(creatorData.banner);
	const [isSaving, setIsSaving] = useState(false);

	const CATEGORIES = ['Fitness', 'Art', 'Tech', 'Travel', 'Music', 'Food', 'Gaming', 'Lifestyle'];

	function handleSave() {
		setIsSaving(true);
		void delayMs(800).then(() => {
			const parsedPrice = Math.max(1, parseFloat(price) || 0);
			const perMinuteRate = Math.max(0.5, parseFloat((parsedPrice / 4).toFixed(2)));

			updateUser({
				name,
				username,
				avatar: avatarUrl,
			});
			updateCreatorProfile({
				name,
				username,
				bio,
				category,
				avatar: avatarUrl,
				banner: bannerUrl,
				subscriptionPrice: parsedPrice,
				perMinuteRate,
			});
			showToast('Creator profile updated!');
			setIsSaving(false);
		});
	}

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<h1 className="text-xl font-bold text-white mb-1">Set Up Creator Profile</h1>
				<p className="text-sm text-white/40 mb-6">
					This is how your fan-facing profile appears after Google signup.
				</p>

				<div className="relative mb-6">
					<div className="h-32 rounded-2xl overflow-hidden relative">
						<img src={bannerUrl} alt="" className="w-full h-full object-cover" />
						<button className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
							<div className="bg-black/60 rounded-xl px-3 py-2 flex items-center gap-2 text-white text-sm">
								<Camera className="w-4 h-4" />
								Change Banner
							</div>
						</button>
					</div>

					<div className="absolute -bottom-6 left-4">
						<div className="relative">
							<img src={avatarUrl} alt="" className="w-16 h-16 rounded-2xl border-4 border-[#0d0d0d] object-cover" />
							<button className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl opacity-0 hover:opacity-100 transition-opacity">
								<Camera className="w-4 h-4 text-white" />
							</button>
						</div>
					</div>
				</div>

				<div className="mt-10 space-y-4">
					<div>
						<label className="block text-sm font-medium text-white/60 mb-1.5">Email</label>
						<input
							value={authState.user?.email ?? creatorData.email}
							readOnly
							className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/60 cursor-not-allowed"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/60 mb-1.5">Display Name</label>
						<input
							value={name}
							onChange={e => setName(e.target.value)}
							className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500/50"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/60 mb-1.5">Username</label>
						<input
							value={username}
							onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
							className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500/50"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/60 mb-1.5">Avatar URL</label>
						<input
							value={avatarUrl}
							onChange={e => setAvatarUrl(e.target.value)}
							placeholder="https://..."
							className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500/50"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/60 mb-1.5">Banner URL</label>
						<input
							value={bannerUrl}
							onChange={e => setBannerUrl(e.target.value)}
							placeholder="https://..."
							className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500/50"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/60 mb-1.5">Bio</label>
						<textarea
							value={bio}
							onChange={e => setBio(e.target.value)}
							rows={4}
							className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500/50 resize-none"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/60 mb-1.5">Category</label>
						<div className="grid grid-cols-4 gap-2">
							{CATEGORIES.map(cat => (
								<button
									key={cat}
									onClick={() => setCategory(cat)}
									className={`py-2 rounded-xl text-xs font-medium transition-all ${
										category === cat ? 'bg-rose-500 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
									}`}
								>
									{cat}
								</button>
							))}
						</div>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/60 mb-1.5">Subscription Price ($/month)</label>
						<div className="relative">
							<span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">$</span>
							<input
								type="number"
								value={price}
								onChange={e => setPrice(e.target.value)}
								min="1"
								step="0.99"
								className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500/50"
							/>
						</div>
						<p className="text-xs text-white/30 mt-1">Platform fee 20%. You receive ${((parseFloat(price) || 0) * 0.8).toFixed(2)} per subscriber.</p>
					</div>

					<Button variant="primary" fullWidth isLoading={isSaving} onClick={() => { void handleSave(); }} leftIcon={<Save className="w-4 h-4" />}>
						Save Changes
					</Button>
				</div>
			</div>
		</Layout>
	);
}
