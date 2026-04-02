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
	const { updateUser } = useAuth();
	const { showToast } = useNotifications();

	const creatorData = creator ?? mockCreators[0];

	const [name, setName] = useState(creatorData.name);
	const [bio, setBio] = useState(creatorData.bio);
	const [price, setPrice] = useState(String(creatorData.subscriptionPrice));
	const [category, setCategory] = useState(creatorData.category);
	const [isSaving, setIsSaving] = useState(false);

	const CATEGORIES = ['Fitness', 'Art', 'Tech', 'Travel', 'Music', 'Food', 'Gaming', 'Lifestyle'];

	function handleSave() {
		setIsSaving(true);
		void delayMs(800).then(() => {
			updateUser({ name });
			showToast('Profile updated!');
			setIsSaving(false);
		});
	}

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<h1 className="text-xl font-bold text-white mb-6">Edit Profile</h1>

				<div className="relative mb-6">
					<div className="h-32 rounded-2xl overflow-hidden relative">
						<img src={creatorData.banner} alt="" className="w-full h-full object-cover" />
						<button className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
							<div className="bg-black/60 rounded-xl px-3 py-2 flex items-center gap-2 text-white text-sm">
								<Camera className="w-4 h-4" />
								Change Banner
							</div>
						</button>
					</div>

					<div className="absolute -bottom-6 left-4">
						<div className="relative">
							<img src={creatorData.avatar} alt="" className="w-16 h-16 rounded-2xl border-4 border-[#0d0d0d] object-cover" />
							<button className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl opacity-0 hover:opacity-100 transition-opacity">
								<Camera className="w-4 h-4 text-white" />
							</button>
						</div>
					</div>
				</div>

				<div className="mt-10 space-y-4">
					<div>
						<label className="block text-sm font-medium text-white/60 mb-1.5">Display Name</label>
						<input
							value={name}
							onChange={e => setName(e.target.value)}
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
