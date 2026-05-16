import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Save } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/Button';
import { MediaAvatar } from '../../components/ui/MediaAvatar';
import { MediaBanner } from '../../components/ui/MediaBanner';
import { useAuth, useCurrentCreator } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import { useWallet } from '../../context/WalletContext';
import { mockCreators } from '../../data/users';
import { ApiError, creatorsApi } from '../../services/creatorsApi';
import { uploadMediaAsset } from '../../services/mediaUpload';
import { formatINR } from '../../services/razorpay';
import { inrRupeesToMinor } from '../../utils/money';

function perMinuteRateRupeesFromUser(
	perMinuteRate: number | null | undefined,
	dashboardCents: number | null | undefined,
	fallback: number
): number {
	const minor = perMinuteRate ?? dashboardCents ?? null;
	return minor != null ? Number(minor) / 100 : fallback;
}

export function ProfileEditor() {
	const creator = useCurrentCreator();
	const { state: authState, updateUser, refreshMe } = useAuth();
	const { creatorWsUpsert, userWsUpdateProfile } = useContent();
	const { refreshBalance } = useWallet();
	const { showToast } = useNotifications();

	const creatorData = creator ?? mockCreators[0];
	const currentUser = authState.user;
	const isNewGoogleCreator = !!currentUser &&
		currentUser.role === 'creator' &&
		!authState.creatorProfiles[currentUser.id] &&
		!mockCreators.some(c => c.id === currentUser.id);

	const initialPerMinute = currentUser ?
		perMinuteRateRupeesFromUser(
			currentUser.perMinuteRate,
			currentUser.creatorDashboard?.perMinuteRateCents,
			creatorData.perMinuteRate
		) :
		creatorData.perMinuteRate;

	const [name, setName] = useState(isNewGoogleCreator && currentUser ? currentUser.name : creatorData.name);
	const [username, setUsername] = useState(isNewGoogleCreator && currentUser ? currentUser.username : creatorData.username);
	const [bio, setBio] = useState(currentUser?.bio ?? creatorData.bio);
	const [price, setPrice] = useState(String(creatorData.subscriptionPrice));
	const [perMinuteRate, setPerMinuteRate] = useState(String(initialPerMinute));
	const [category, setCategory] = useState(currentUser?.category ?? creatorData.category);
	const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar ?? creatorData.avatar);
	const [bannerUrl, setBannerUrl] = useState(currentUser?.banner ?? creatorData.banner);
	const [isSaving, setIsSaving] = useState(false);
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [bannerFile, setBannerFile] = useState<File | null>(null);

	const avatarInputRef = useRef<HTMLInputElement | null>(null);
	const bannerInputRef = useRef<HTMLInputElement | null>(null);

	const avatarPreviewUrl = useMemo(() => {
		if (!avatarFile) return null;
		return URL.createObjectURL(avatarFile);
	}, [avatarFile]);

	const bannerPreviewUrl = useMemo(() => {
		if (!bannerFile) return null;
		return URL.createObjectURL(bannerFile);
	}, [bannerFile]);

	useEffect(() => {
		return () => {
			if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
		};
	}, [avatarPreviewUrl]);

	useEffect(() => {
		return () => {
			if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl);
		};
	}, [bannerPreviewUrl]);

	useEffect(() => {
		const u = authState.user;
		if (!u || u.role !== 'creator') return;
		setBio(u.bio ?? '');
		setBannerUrl(u.banner ?? '');
		setAvatarUrl(u.avatar ?? '');
		setPerMinuteRate(String(perMinuteRateRupeesFromUser(
			u.perMinuteRate,
			u.creatorDashboard?.perMinuteRateCents,
			creatorData.perMinuteRate
		)));
	}, [authState.user?.id, authState.user?.bio, authState.user?.banner, authState.user?.avatar, authState.user?.perMinuteRate, authState.user?.creatorDashboard?.perMinuteRateCents]);

	const CATEGORIES = ['Fitness', 'Art', 'Tech', 'Travel', 'Music', 'Food', 'Gaming', 'Lifestyle'];

	function handleSave() {
		if (isSaving) return;
		setIsSaving(true);
		const avatarPromise = avatarFile ? uploadMediaAsset('avatar', avatarFile).then(r => r.assetId) : Promise.resolve(undefined);
		const bannerPromise = bannerFile ? uploadMediaAsset('banner', bannerFile).then(r => r.assetId) : Promise.resolve(undefined);

		const subscriptionPriceMinorStr = inrRupeesToMinor(parseFloat(price) || 0);
		const perMinuteRateMinorStr = inrRupeesToMinor(parseFloat(perMinuteRate) || 0);
		const subscriptionPriceMinor =
			/^\d+$/.test(subscriptionPriceMinorStr) ? Number(subscriptionPriceMinorStr) : undefined;
		const perMinuteRateMinor =
			/^\d+$/.test(perMinuteRateMinorStr) ? Number(perMinuteRateMinorStr) : undefined;

		const avatarUrlSend = !avatarFile && avatarUrl.trim() ? avatarUrl.trim() : undefined;
		const bannerUrlSend = !bannerFile && bannerUrl.trim() ? bannerUrl.trim() : undefined;

		void Promise.all([avatarPromise, bannerPromise])
			.then(([avatarAssetId, bannerAssetId]) =>
				creatorsApi.me.updateProfile({
					name: name.trim() || undefined,
					username: username.trim() || undefined,
					bio: bio.trim() || undefined,
					category: category?.trim() || undefined,
					avatarAssetId,
					avatarUrl: avatarUrlSend,
					bannerAssetId,
					bannerUrl: bannerUrlSend,
					subscriptionPriceMinor,
					perMinuteRate: perMinuteRateMinor,
				})
			)
			.then(({ user }) => {
				updateUser(user);
				setAvatarUrl(user.avatar || '');
				setBannerUrl(user.banner || '');
				const uname = username.trim() || creatorData.username;
				const displayName = name.trim() || creatorData.name;
				void creatorWsUpsert(uname, displayName, {
					bio: bio.trim() || undefined,
					bannerUrl: user.banner?.trim() || bannerUrlSend,
					bannerAssetId,
					avatarUrl: user.avatar?.trim() || avatarUrlSend,
				}).catch(() => {});
				void userWsUpdateProfile({
					name: displayName,
					username: uname,
					bio: bio.trim() || undefined,
					bannerUrl: user.banner?.trim() || bannerUrlSend,
					avatarUrl: user.avatar?.trim() || avatarUrlSend,
					perMinuteRate: perMinuteRateMinor,
				}).catch(() => {});
				void refreshMe();
				void refreshBalance();
				showToast('Profile updated!');
				setAvatarFile(null);
				setBannerFile(null);
			})
			.catch(err => {
				if (err instanceof ApiError) {
					const body = err.body;
					const msg =
						typeof body === 'object' && body && 'message' in body && typeof (body as { message?: unknown }).message === 'string' ?
							(body as { message: string }).message :
							`Save failed (HTTP ${err.status}).`;
					showToast(msg, 'error');
					return;
				}
				showToast(err instanceof Error ? err.message : 'Save failed.', 'error');
			})
			.finally(() => setIsSaving(false));
	}

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<h1 className="text-xl font-bold text-foreground dark:text-white mb-1">Set Up Creator Profile</h1>
				<p className="text-sm text-muted dark:text-white/40 mb-6">
					This is how your fan-facing profile appears after Google signup.
				</p>

				<div className="relative mb-6">
					<div className="h-32 rounded-2xl overflow-hidden relative border border-border/20">
						<MediaBanner
							src={bannerPreviewUrl ?? bannerUrl}
							alt=""
							className="h-full w-full object-cover"
						/>
						<button
							type="button"
							onClick={() => bannerInputRef.current?.click()}
							className="absolute inset-0 flex items-center justify-center bg-background/40 dark:bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
						>
							<div className="bg-background/70 text-foreground dark:bg-black/60 dark:text-white rounded-xl px-3 py-2 flex items-center gap-2 text-sm backdrop-blur-sm border border-border/20">
								<Camera className="w-4 h-4" />
								Change Banner
							</div>
						</button>
						<input
							ref={bannerInputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={e => {
								const f = e.target.files?.[0] ?? null;
								setBannerFile(f);
							}}
						/>
					</div>

					<div className="absolute -bottom-6 left-4">
						<div className="relative">
							<MediaAvatar
								src={avatarPreviewUrl ?? avatarUrl}
								alt={name || 'Creator'}
								name={name}
								className="h-16 w-16 rounded-2xl border-4 border-background"
							/>
							<button
								type="button"
								onClick={() => avatarInputRef.current?.click()}
								className="absolute inset-0 flex items-center justify-center bg-background/50 dark:bg-black/50 rounded-2xl opacity-0 hover:opacity-100 transition-opacity"
							>
								<Camera className="w-4 h-4 text-foreground dark:text-white" />
							</button>
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
						</div>
					</div>
				</div>

				<div className="mt-10 space-y-4">
					<div>
						<label className="block text-sm font-medium text-muted dark:text-white/60 mb-1.5">Email</label>
						<input
							value={authState.user?.email ?? creatorData.email}
							readOnly
							className="w-full bg-foreground/5 border border-border/20 rounded-xl px-4 py-3 text-sm text-muted cursor-not-allowed"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-muted dark:text-white/60 mb-1.5">Display Name</label>
						<input
							value={name}
							onChange={e => setName(e.target.value)}
							className="w-full bg-input border border-border/20 rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-muted mb-1.5">Username</label>
						<input
							value={username}
							onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
							className="w-full bg-input border border-border/20 rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-muted dark:text-white/60 mb-1.5">Avatar URL</label>
						<input
							value={avatarUrl}
							onChange={e => setAvatarUrl(e.target.value)}
							placeholder="https://..."
							className="w-full bg-input border border-border/20 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-muted dark:text-white/60 mb-1.5">Banner URL</label>
						<input
							value={bannerUrl}
							onChange={e => setBannerUrl(e.target.value)}
							placeholder="https://..."
							className="w-full bg-input border border-border/20 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-muted dark:text-white/60 mb-1.5">Bio</label>
						<textarea
							value={bio}
							onChange={e => setBio(e.target.value)}
							rows={4}
							className="w-full bg-input border border-border/20 rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 resize-none"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-muted mb-1.5">Category</label>
						<div className="grid grid-cols-4 gap-2">
							{CATEGORIES.map(cat => (
								<button
									key={cat}
									onClick={() => setCategory(cat)}
									className={`py-2 rounded-xl text-xs font-medium transition-all ${
										category === cat ? 'bg-rose-500 text-white' : 'bg-foreground/5 text-muted hover:bg-foreground/10'
									}`}
								>
									{cat}
								</button>
							))}
						</div>
					</div>

					<div>
						<label className="block text-sm font-medium text-muted mb-1.5">Subscription Price (₹/month)</label>
						<div className="relative">
							<span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">₹</span>
							<input
								type="number"
								value={price}
								onChange={e => setPrice(e.target.value)}
								min="1"
								step="0.99"
								className="w-full bg-input border border-border/20 rounded-xl pl-8 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
							/>
						</div>
						<p className="text-xs text-muted/80 mt-1">Platform fee 20%. You receive {formatINR((parseFloat(price) || 0) * 0.8)} per subscriber.</p>
					</div>

					<div>
						<label className="block text-sm font-medium text-muted mb-1.5">Per-minute rate for timed sessions (₹/min)</label>
						<div className="relative">
							<span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">₹</span>
							<input
								type="number"
								value={perMinuteRate}
								onChange={e => setPerMinuteRate(e.target.value)}
								min="0"
								step="0.5"
								className="w-full bg-input border border-border/20 rounded-xl pl-8 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
							/>
						</div>
						<p className="text-xs text-muted/80 mt-1">Used for timed chat/call sessions. Saved as minor units per minute per backend spec.</p>
					</div>

					<Button variant="primary" fullWidth isLoading={isSaving} onClick={() => { void handleSave(); }} leftIcon={<Save className="w-4 h-4" />}>
						Save Changes
					</Button>
				</div>
			</div>
		</Layout>
	);
}
