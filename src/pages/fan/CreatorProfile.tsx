import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, Grid3x3, MessageCircle, Zap, Share2, MoreHorizontal, Lock, Image, Type, Phone, Video, ArrowLeft, Heart } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { PostCard } from '../../components/ui/PostCard';
import { TipModal } from '../../components/modals/TipModal';
import { SubscribeModal } from '../../components/modals/SubscribeModal';
import { useAuth } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { mockCreators } from '../../data/users';
import { useNotifications } from '../../context/NotificationContext';
import { ensureMediaPermissions, isDeviceInUseError } from '../../services/mediaPermissions';
import { useChat } from '../../context/ChatContext';
import { useCall } from '../../context/CallContext';
import { useSession } from '../../context/SessionContext';
import { SessionPickerModal, type SessionPayMode } from '../../components/modals/SessionPickerModal';
import type { Creator, SessionType } from '../../types';
import { ApiError } from '../../services/creatorsApi';
import { creatorProfileDtoToCreator } from '../../services/creatorWsMap';
import { randomUuid } from '../../utils/isUuid';
import { formatINR } from '../../services/razorpay';
import { useSessions } from '../../context/SessionsContext';
import { useEnsureWsAuth, useWs, useWsAuthReady, useWsConnected } from '../../context/WsContext';
import { creatorFollow, creatorUnfollow } from '../../services/creatorWsService';
import { useSubscriptions } from '../../context/SubscriptionContext';
import { subscriptionId, subscriptionUiStatus } from '../../services/subscriptionUi';

export function CreatorProfile() {
	const { id: creatorUserId } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { state: authState } = useAuth();
	const { state: contentState, isSubscribed, loadCreatorPosts, creatorWsGetByUserId } = useContent();
	const { showToast } = useNotifications();
	const { addConversation, getConversationForUser } = useChat();
	const { startCall } = useCall();
	useSession();
	const { requestSession, state: sessionsState, clearOutgoing } = useSessions();
	const ws = useWs();
	const wsConnected = useWsConnected();
	const wsAuthReady = useWsAuthReady();
	const ensureWsAuth = useEnsureWsAuth();
	const { getSubscriptionForCreator, cancel: cancelWsSubscription, toggleAutoRenew } = useSubscriptions();
	const [showTipModal, setShowTipModal] = useState(false);
	const [showSubscribeModal, setShowSubscribeModal] = useState(false);
	const [showSessionModal, setShowSessionModal] = useState(false);
	const [postFilter, setPostFilter] = useState<'all' | 'free' | 'locked'>('all');
	const [remoteCreator, setRemoteCreator] = useState<Creator | null>(null);
	const [isLoadingCreator, setIsLoadingCreator] = useState(false);
	const [followBusy, setFollowBusy] = useState(false);
	const [isFollowed, setIsFollowed] = useState<boolean>(false);
	const [profileLikedByMe, setProfileLikedByMe] = useState(false);
	const [profileLikeBusy, setProfileLikeBusy] = useState(false);
	const [profileLikePopKey, setProfileLikePopKey] = useState(0);
	const hasLoadedCreatorRef = useRef(false);

	const maybeCreator = useMemo(() => mockCreators.find(c => c.id === creatorUserId), [creatorUserId]);
	const cachedDisplay = useMemo(() => (creatorUserId ? contentState.creatorProfiles[creatorUserId] : undefined), [creatorUserId, contentState.creatorProfiles]);
	const fallbackCreator = useMemo<Creator | null>(() => {
		if (!creatorUserId) return null;
		if (!cachedDisplay) return null;
		const base = mockCreators[0];
		return {
			...base,
			id: creatorUserId,
			name: cachedDisplay.name || base.name,
			username: cachedDisplay.username || base.username,
			avatar: cachedDisplay.avatar || base.avatar,
		};
	}, [creatorUserId, cachedDisplay]);

	useEffect(() => {
		if (!creatorUserId) return;
		const ac = new AbortController();
		const base = maybeCreator ?? mockCreators[0];

		// creator WS commands are multiplexed over the posts socket; wait until it is ready.
		if (contentState.postsWsStatus !== 'ready') {
			setIsLoadingCreator(false);
			return () => ac.abort();
		}

		setIsLoadingCreator(true);

		void creatorWsGetByUserId(creatorUserId)
			.then(r => {
				if (ac.signal.aborted) return;
				if (r.creator) {
					hasLoadedCreatorRef.current = true;
					const dto = r.creator;
					setIsFollowed(Boolean(dto.is_followed));
					setProfileLikedByMe(Boolean(dto.is_profile_liked));
					setRemoteCreator(creatorProfileDtoToCreator(dto, base));
					return;
				}
				if (!hasLoadedCreatorRef.current && !fallbackCreator) {
					showToast('Creator profile not found for this user.', 'error');
				}
				// Fall back to cached display from posts directory so the user can still view creator posts.
				if (!hasLoadedCreatorRef.current && fallbackCreator) {
					setRemoteCreator(fallbackCreator);
				}
			})
			.catch((err: unknown) => {
				if (ac.signal.aborted) return;
				if (err instanceof ApiError) {
					console.error('[creator-profile] ws getByUserId failed', { creatorUserId, status: err.status, body: err.body });
				} else {
					console.error('[creator-profile] ws getByUserId failed', { creatorUserId, err });
				}
				if (!hasLoadedCreatorRef.current) {
					showToast('Could not load creator profile. Please try again.', 'error');
				}
			})
			.finally(() => {
				if (!ac.signal.aborted) setIsLoadingCreator(false);
			});

		return () => ac.abort();
	}, [creatorUserId, maybeCreator, creatorWsGetByUserId, contentState.postsWsStatus]);

	useEffect(() => {
		if (!creatorUserId) return;
		void loadCreatorPosts(creatorUserId, true);
	}, [creatorUserId, loadCreatorPosts]);

	useEffect(() => {
		if (!wsConnected) return;
		const off = ws.on('creator', 'profilelikeupdate', (data: unknown) => {
			const pl = data as { creator_user_id?: string, profile_like_count?: number };
			if (!pl?.creator_user_id || String(pl.creator_user_id) !== String(creatorUserId)) return;
			const n = Number(pl.profile_like_count);
			if (Number.isFinite(n)) {
				setRemoteCreator(c => (c ? { ...c, likeCount: n } : c));
			}
		});
		return () => { off(); };
	}, [ws, wsConnected, creatorUserId]);

	function handleProfileLikeToggle() {
		if (!authState.user || !creatorUserId) {
			void navigate('/login');
			return;
		}
		if (isOwner) return;
		setProfileLikeBusy(true);
		const cmd = profileLikedByMe ? 'unlikeprofile' : 'likeprofile';
		void ensureWsAuth()
			.then(() => ws.request('creator', cmd, [creatorUserId]))
			.then((json: unknown) => {
				const b = json as { profile_like_count?: number };
				if (typeof b.profile_like_count === 'number') {
					const n = b.profile_like_count;
					setRemoteCreator(c => (c ? { ...c, likeCount: n } : c));
				}
				const nextLiked = cmd === 'likeprofile';
				if (nextLiked) setProfileLikePopKey(k => k + 1);
				setProfileLikedByMe(nextLiked);
			})
			.catch((err: unknown) => {
				showToast(err instanceof Error ? err.message : 'Could not update profile like', 'error');
			})
			.finally(() => setProfileLikeBusy(false));
	}

	if (!creatorUserId) {
		return (
			<Layout>
				<div className="flex items-center justify-center min-h-[50vh]">
					<p className="text-muted">Creator not found</p>
				</div>
			</Layout>
		);
	}

	const creator = remoteCreator ?? fallbackCreator ?? maybeCreator ?? null;

	if (!creator && !isLoadingCreator) {
		return (
			<Layout>
				<div className="flex items-center justify-center min-h-[50vh]">
					<p className="text-muted">Creator not found</p>
				</div>
			</Layout>
		);
	}

	if (!creator) {
		return (
			<Layout>
				<div className="flex items-center justify-center min-h-[50vh]">
					<p className="text-muted">Loading creator…</p>
				</div>
			</Layout>
		);
	}

	const subDto = getSubscriptionForCreator(creator.id);
	const subStatus = subDto ? subscriptionUiStatus(subDto) : null;
	const subscribed = subStatus === 'active' || isSubscribed(creator.id);
	const subId = subDto ? subscriptionId(subDto) : null;
	const isOwner = authState.user?.id === creator.id;
	const creatorForDisplay: Creator = isOwner && authState.user ? {
		...creator,
		name: authState.user.name,
		username: authState.user.username,
		avatar: authState.user.avatar,
		bio: authState.user.bio ?? creator.bio,
		banner: authState.user.banner ?? creator.banner,
		category: authState.user.category ?? creator.category,
	} : creator;

	const creatorPosts = contentState.posts
		.filter(p => p.creatorId === creatorForDisplay.id)
		.filter(p => {
			if (postFilter === 'free') return !p.isLocked;
			if (postFilter === 'locked') return p.isLocked;
			return true;
		});

	function handleStartSession(type: SessionType, durationMinutes: number, _totalCost: number, _payMode: SessionPayMode) {
		if (!authState.user) return;

		// Sessions WS protocol: pricing & wallet rules are enforced server-side (SESSION_PRICE_CENTS).
		// Spec: fan must have sufficient wallet balance to request; debit/credit happens on accept.
		// This UI now sends a request and waits for creator accept/reject push.
		const kind = type === 'chat' ? 'chat' : 'call';
		const uiCallType = type === 'audio' ? 'audio' : type === 'video' ? 'video' : undefined;

		const preflight =
			kind === 'call' ?
				ensureMediaPermissions({ audio: true, video: uiCallType === 'video' }).catch(e => {
					if (isDeviceInUseError(e)) {
						showToast('Camera/mic is busy in another tab. You can still request; join will be receive-only here.', 'error');
						return;
					}
					throw e;
				}) :
				Promise.resolve();

		void preflight
			.then(() => requestSession({
				creatorUserId: creatorForDisplay.id,
				kind,
				minutes: durationMinutes,
				uiCallType,
				creatorDisplay: { name: creatorForDisplay.name, avatar: creatorForDisplay.avatar },
			}))
			.then(() => {
				showToast('Session request sent. Waiting for creator…');
			})
			.catch(err => {
				showToast(err instanceof Error ? err.message : 'Failed to request session', 'error');
			});
	}

	useEffect(() => {
		if (sessionsState.outgoing.state === 'rejected') {
			showToast(sessionsState.outgoing.rejected.message || 'Session rejected', 'error');
		}
		if (sessionsState.outgoing.state === 'accepted') {
			showToast('Session accepted!');
		}
		return () => {
			// clear on unmount / profile change
			clearOutgoing();
		};
	}, [sessionsState.outgoing.state]);

	function handleWsFollow() {
		if (!authState.user) {
			void navigate('/login');
			return;
		}
		if (!wsConnected) {
			showToast('Connect to the server before following.', 'error');
			return;
		}
		if (!wsAuthReady) {
			showToast('Authenticating… try again in a moment.', 'error');
			return;
		}
		setFollowBusy(true);
		const op = isFollowed ? creatorUnfollow : creatorFollow;
		void ensureWsAuth()
			.then(() => op(ws, creatorForDisplay.id))
			.then(() => {
				setIsFollowed(prev => !prev);
				showToast(isFollowed ? 'Unfollowed.' : 'You are now following this creator.');
			})
			.catch((err: unknown) => {
				showToast(err instanceof Error ? err.message : (isFollowed ? 'Unfollow failed' : 'Follow failed'), 'error');
			})
			.finally(() => {
				setFollowBusy(false);
			});
	}

	const [cancelBusy, setCancelBusy] = useState(false);
	function handleCancelSubscription() {
		if (!subId) return;
		setCancelBusy(true);
		void cancelWsSubscription(subId)
			.then(() => {
				showToast('Subscription cancelled.');
			})
			.catch(err => {
				showToast(err instanceof Error ? err.message : 'Cancel failed', 'error');
			})
			.finally(() => setCancelBusy(false));
	}

	const [autoRenewBusy, setAutoRenewBusy] = useState(false);
	const autoRenew =
		subDto && typeof (subDto as unknown as { auto_renew?: unknown }).auto_renew === 'boolean' ?
			Boolean((subDto as unknown as { auto_renew: boolean }).auto_renew) :
			true;
	function handleToggleAutoRenew() {
		if (!subId) return;
		if (autoRenewBusy) return;
		setAutoRenewBusy(true);
		void toggleAutoRenew(subId)
			.then(() => {
				showToast('Auto-renew updated.');
			})
			.catch(err => {
				showToast(err instanceof Error ? err.message : 'Failed to update auto-renew', 'error');
			})
			.finally(() => setAutoRenewBusy(false));
	}

	function handleMessage() {
		if (!authState.user) { navigate('/login'); return; }
		const existing = getConversationForUser(creatorForDisplay.id);
		if (existing) {
			navigate(`/messages/${existing.id}`);
		} else {
			const convId = randomUuid();
			addConversation({
				id: convId,
				participantIds: [authState.user.id, creatorForDisplay.id],
				participantNames: [authState.user.name, creatorForDisplay.name],
				participantAvatars: [authState.user.avatar, creatorForDisplay.avatar],
				lastMessage: '',
				lastMessageTime: new Date().toISOString(),
				unreadCount: 0,
				isOnline: creatorForDisplay.isOnline,
			});
			navigate(`/messages/${convId}`);
		}
	}

	return (
		<Layout>
			<div className="max-w-2xl mx-auto">
				<div className="relative z-0">
					<div className="h-40 sm:h-52">
						<img src={creatorForDisplay.banner} alt="" className="w-full h-full object-cover" />
						<div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
					</div>

					<div className="absolute top-3 left-3 z-20">
						<button
							type="button"
							onClick={() => { void navigate(-1); }}
							className={
								'w-8 h-8 sm:w-9 sm:h-9 bg-background/70 text-foreground hover:bg-background/90 ' +
								'dark:bg-black/50 dark:text-white/80 dark:hover:text-white dark:hover:bg-black/70 ' +
								'backdrop-blur-sm rounded-full flex items-center justify-center transition-colors'
							}
							aria-label="Go back"
						>
							<ArrowLeft className="w-4 h-4" />
						</button>
					</div>

					<div className="absolute top-3 right-3 z-10 flex gap-2">
						<button className="w-8 h-8 bg-background/70 text-foreground hover:bg-background/90 dark:bg-black/40 dark:text-white dark:hover:bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors">
							<Share2 className="w-4 h-4" />
						</button>
						<button className="w-8 h-8 bg-background/70 text-foreground hover:bg-background/90 dark:bg-black/40 dark:text-white dark:hover:bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors">
							<MoreHorizontal className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="px-4 -mt-12 pb-4 relative z-10">
					<div className="flex items-end justify-between mb-3">
						<div className="relative">
							<img
								src={creatorForDisplay.avatar}
								alt={creatorForDisplay.name}
								className="w-20 h-20 rounded-2xl border-4 border-background object-cover"
							/>
							{creatorForDisplay.isOnline && (
								<div className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-background rounded-full" />
							)}
						</div>

						{!isOwner && (
							<div className="flex gap-2 mt-4">
								{subscribed ? (
									<>
										<button
											onClick={() => { startCall(creatorForDisplay.id, creatorForDisplay.name, creatorForDisplay.avatar, 'audio'); navigate('/call'); }}
											className="w-9 h-9 bg-foreground/10 hover:bg-emerald-500/20 hover:text-emerald-400 text-muted rounded-xl flex items-center justify-center transition-all"
										>
											<Phone className="w-4 h-4" />
										</button>
										<button
											onClick={() => { startCall(creatorForDisplay.id, creatorForDisplay.name, creatorForDisplay.avatar, 'video'); navigate('/call'); }}
											className="w-9 h-9 bg-foreground/10 hover:bg-sky-500/20 hover:text-sky-400 text-muted rounded-xl flex items-center justify-center transition-all"
										>
											<Video className="w-4 h-4" />
										</button>
										<button
											onClick={handleMessage}
											className="flex items-center gap-1.5 bg-foreground/10 hover:bg-foreground/15 text-foreground text-sm font-semibold px-3 py-2 rounded-xl transition-all"
										>
											<MessageCircle className="w-4 h-4" />
											Message
										</button>
										<button
											type="button"
											disabled={!subId || cancelBusy}
											onClick={handleCancelSubscription}
											className="flex items-center gap-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-sm font-semibold px-3 py-2 rounded-xl transition-all border border-rose-500/20 disabled:opacity-50"
										>
											Cancel
										</button>
										<button
											type="button"
											disabled={!subId || autoRenewBusy}
											onClick={handleToggleAutoRenew}
											className={
												'flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl transition-all border disabled:opacity-50 ' +
												(autoRenew ?
													'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/20' :
													'bg-foreground/10 hover:bg-foreground/15 text-foreground border-border/20')
											}
										>
											<span className="text-xs">{autoRenew ? 'Auto-renew: On' : 'Auto-renew: Off'}</span>
										</button>
										<button
											onClick={() => setShowTipModal(true)}
											className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-semibold px-3 py-2 rounded-xl transition-all"
										>
											<Zap className="w-4 h-4 fill-amber-400" />
											Tip
										</button>
									</>
								) : (
									<button
										onClick={() => setShowSubscribeModal(true)}
										className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-5 py-2 rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-rose-500/25"
									>
										Subscribe {formatINR(creatorForDisplay.subscriptionPrice)}/mo
									</button>
								)}

								{/* Booking sessions is not subscription-gated (v3 sessions spec). */}
								<button
									onClick={() => setShowSessionModal(true)}
									className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm font-semibold px-3 py-2 rounded-xl transition-all border border-rose-500/20"
								>
									Book Session
								</button>
								<button
									type="button"
									onClick={() => { handleWsFollow(); }}
									disabled={followBusy}
									className={
										'flex items-center gap-1.5 ' +
										(isFollowed ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/20 ' : 'bg-foreground/10 hover:bg-foreground/15 text-foreground border-border/20 ') +
										'text-sm font-semibold px-3 py-2 rounded-xl transition-all border border-border/20 ' +
										'disabled:opacity-50'
									}
								>
									{isFollowed ? 'Following' : 'Follow'}
								</button>
							</div>
						)}

						{isOwner && (
							<button
								onClick={() => { void navigate('/creator-dashboard/profile'); }}
								className="bg-foreground/10 hover:bg-foreground/15 text-foreground text-sm font-semibold px-4 py-2 rounded-xl transition-all mt-4"
							>
								Edit Profile
							</button>
						)}
					</div>

					<div className="flex items-center gap-2 mb-1">
						<h1 className="text-xl font-bold text-foreground dark:text-white">{creatorForDisplay.name}</h1>
						{creatorForDisplay.isKYCVerified && <Star className="w-5 h-5 text-amber-400 fill-amber-400" />}
					</div>
					<p className="text-muted text-sm mb-2 dark:text-white/40">@{creatorForDisplay.username}</p>
					{creatorForDisplay.bio && <p className="text-foreground/70 dark:text-white/60 text-sm leading-relaxed mb-4">{creatorForDisplay.bio}</p>}

					<div className="flex gap-4 mb-4">
						<div className="text-center">
							<p className="font-bold text-foreground">{creatorForDisplay.postCount}</p>
							<p className="text-xs text-muted">Posts</p>
						</div>
						<div className="text-center">
							<p className="font-bold text-foreground dark:text-white">{creatorForDisplay.subscriberCount.toLocaleString()}</p>
							<p className="text-xs text-muted dark:text-white/40">Subscribers</p>
						</div>
						<div className="text-center">
							{!isOwner && authState.user ? (
								<button
									type="button"
									onClick={() => { handleProfileLikeToggle(); }}
									disabled={profileLikeBusy}
									className="flex flex-col items-center gap-0.5 mx-auto disabled:opacity-50 motion-safe:active:scale-95 transition-transform"
								>
									<span
										key={profileLikePopKey}
										className={profileLikePopKey > 0 ? 'inline-flex motion-safe:animate-cw-heart-pop' : 'inline-flex'}
									>
										<Heart className={`w-5 h-5 mx-auto ${profileLikedByMe ? 'text-rose-500 fill-rose-500' : 'text-muted'}`} />
									</span>
									<p className="font-bold text-foreground dark:text-white">{creatorForDisplay.likeCount.toLocaleString()}</p>
									<p className="text-xs text-muted dark:text-white/40">Profile likes</p>
								</button>
							) : (
								<>
									<p className="font-bold text-foreground dark:text-white">{creatorForDisplay.likeCount.toLocaleString()}</p>
									<p className="text-xs text-muted dark:text-white/40">Profile likes</p>
								</>
							)}
						</div>
					</div>

					{!subscribed && !isOwner && (
						<div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 mb-4">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 bg-rose-500/20 rounded-xl flex items-center justify-center">
									<Lock className="w-5 h-5 text-rose-400" />
								</div>
								<div className="flex-1">
									<p className="text-sm font-semibold text-foreground dark:text-white mb-0.5">Subscribe to unlock all content</p>
									<p className="text-xs text-muted dark:text-white/40">{creatorForDisplay.postCount} posts · Starting at {formatINR(creatorForDisplay.subscriptionPrice)}/mo</p>
								</div>
								<button
									onClick={() => setShowSubscribeModal(true)}
									className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold px-3 py-1.5 rounded-xl transition-all"
								>
									Subscribe
								</button>
							</div>
						</div>
					)}

					<div className="flex gap-1 bg-foreground/5 p-0.5 rounded-xl mb-4">
						{[
							{ key: 'all', icon: Grid3x3, label: 'All' },
							{ key: 'free', icon: Image, label: 'Free' },
							{ key: 'locked', icon: Lock, label: 'Locked' },
						].map(({ key, icon: Icon, label }) => (
							<button
								key={key}
								onClick={() => setPostFilter(key as typeof postFilter)}
								className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-all ${
									postFilter === key ? 'bg-foreground/10 text-foreground' : 'text-muted'
								}`}
							>
								<Icon className="w-3.5 h-3.5" />
								{label}
							</button>
						))}
					</div>
				</div>

				<div className="px-4 pb-8 space-y-4">
					{creatorPosts.length === 0 ? (
						<div className="text-center py-10">
							<Type className="w-8 h-8 text-muted/50 mx-auto mb-2" />
							<p className="text-muted text-sm">No posts found</p>
						</div>
					) : (
						creatorPosts.map(post => (
							<PostCard key={post.id} post={post} showCreatorLink={false} />
						))
					)}
				</div>
			</div>

			<TipModal
				isOpen={showTipModal}
				onClose={() => setShowTipModal(false)}
				creatorId={creatorForDisplay.id}
				creatorName={creatorForDisplay.name}
				creatorAvatar={creatorForDisplay.avatar}
			/>
			<SubscribeModal
				isOpen={showSubscribeModal}
				onClose={() => setShowSubscribeModal(false)}
				creator={creatorForDisplay}
			/>
			<SessionPickerModal
				isOpen={showSessionModal}
				onClose={() => setShowSessionModal(false)}
				creatorName={creatorForDisplay.name}
				creatorAvatar={creatorForDisplay.avatar}
				ratePerMinute={creatorForDisplay.perMinuteRate}
				walletBalanceMinor={authState.user?.walletBalanceMinor ?? '0'}
				onConfirm={handleStartSession}
				protocol="sessions"
			/>
		</Layout>
	);
}
