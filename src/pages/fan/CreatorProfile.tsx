import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, Grid3x3, MessageCircle, Zap, Share2, MoreHorizontal, Lock, Image, Type, Phone, Video, ArrowLeft } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { PostCard } from '../../components/ui/PostCard';
import { TipModal } from '../../components/modals/TipModal';
import { SubscribeModal } from '../../components/modals/SubscribeModal';
import { useAuth } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { mockCreators } from '../../data/users';
import { useNotifications } from '../../context/NotificationContext';
import { useChat } from '../../context/ChatContext';
import { useCall } from '../../context/CallContext';
import { useSession } from '../../context/SessionContext';
import { useWallet } from '../../context/WalletContext';
import { SessionPickerModal, type SessionPayMode } from '../../components/modals/SessionPickerModal';
import type { SessionType } from '../../types';

export function CreatorProfile() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { state: authState } = useAuth();
	const { state: contentState, isSubscribed } = useContent();
	const { showToast } = useNotifications();
	const { addConversation, getConversationForUser } = useChat();
	const { startCall } = useCall();
	const { startSession } = useSession();
	const { deductFunds, payViaRazorpay } = useWallet();
	const [showTipModal, setShowTipModal] = useState(false);
	const [showSubscribeModal, setShowSubscribeModal] = useState(false);
	const [showSessionModal, setShowSessionModal] = useState(false);
	const [postFilter, setPostFilter] = useState<'all' | 'free' | 'locked'>('all');

	const maybeCreator = mockCreators.find(c => c.id === id);

	if (!maybeCreator) {
		return (
			<Layout>
				<div className="flex items-center justify-center min-h-[50vh]">
					<p className="text-white/40">Creator not found</p>
				</div>
			</Layout>
		);
	}

	const creator = maybeCreator;
	const subscribed = isSubscribed(creator.id);
	const isOwner = authState.user?.id === creator.id;

	const creatorPosts = contentState.posts
		.filter(p => p.creatorId === creator.id)
		.filter(p => {
			if (postFilter === 'free') return !p.isLocked;
			if (postFilter === 'locked') return p.isLocked;
			return true;
		});

	function handleStartSession(type: SessionType, durationMinutes: number, totalCost: number, payMode: SessionPayMode) {
		if (!authState.user) return;

		const userId = authState.user.id;
		const userName = authState.user.name;

		const startAndNavigate = () => {
			startSession(
				type,
				creator.id,
				creator.name,
				creator.avatar,
				userId,
				userName,
				durationMinutes,
				creator.perMinuteRate
			);

			if (type === 'chat') {
				void navigate(`/session/chat/${creator.id}`);
				return;
			}

			startCall(creator.id, creator.name, creator.avatar, type);
			void navigate('/call');
		};

		if (payMode === 'razorpay') {
			void payViaRazorpay(
				totalCost,
				'session',
				`${type} session with ${creator.name} (${durationMinutes}min)`,
				creator.id,
				creator.name
			).then(result => {
				if (!result.ok) {
					if (!result.cancelled) showToast(result.error || 'Payment failed.', 'error');
					return;
				}

				startAndNavigate();
			});
			return;
		}

		const ok = deductFunds(totalCost, 'session', `Session with ${creator.name}`, creator.id, creator.name);
		if (!ok) {
			showToast('Insufficient wallet balance.', 'error');
			return;
		}

		startAndNavigate();
	}

	function handleMessage() {
		if (!authState.user) { navigate('/login'); return; }
		const existing = getConversationForUser(creator.id);
		if (existing) {
			navigate(`/messages/${existing.id}`);
		} else {
			const convId = `conv-${Date.now()}`;
			addConversation({
				id: convId,
				participantIds: [authState.user.id, creator.id],
				participantNames: [authState.user.name, creator.name],
				participantAvatars: [authState.user.avatar, creator.avatar],
				lastMessage: '',
				lastMessageTime: new Date().toISOString(),
				unreadCount: 0,
				isOnline: creator.isOnline,
			});
			navigate(`/messages/${convId}`);
		}
	}

	return (
		<Layout>
			<div className="max-w-2xl mx-auto">
				<div className="relative z-0">
					<div className="h-40 sm:h-52">
						<img src={creator.banner} alt="" className="w-full h-full object-cover" />
						<div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0d0d0d]" />
					</div>

					<div className="absolute top-3 left-3 z-20">
						<button
							type="button"
							onClick={() => { void navigate(-1); }}
							className="w-8 h-8 sm:w-9 sm:h-9 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-colors"
							aria-label="Go back"
						>
							<ArrowLeft className="w-4 h-4" />
						</button>
					</div>

					<div className="absolute top-3 right-3 z-10 flex gap-2">
						<button className="w-8 h-8 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
							<Share2 className="w-4 h-4" />
						</button>
						<button className="w-8 h-8 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
							<MoreHorizontal className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="px-4 -mt-12 pb-4 relative z-10">
					<div className="flex items-end justify-between mb-3">
						<div className="relative">
							<img
								src={creator.avatar}
								alt={creator.name}
								className="w-20 h-20 rounded-2xl border-4 border-[#0d0d0d] object-cover"
							/>
							{creator.isOnline && (
								<div className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#0d0d0d] rounded-full" />
							)}
						</div>

						{!isOwner && (
							<div className="flex gap-2 mt-4">
								{subscribed ? (
									<>
										<button
											onClick={() => { startCall(creator.id, creator.name, creator.avatar, 'audio'); navigate('/call'); }}
											className="w-9 h-9 bg-white/10 hover:bg-emerald-500/20 hover:text-emerald-400 text-white/70 rounded-xl flex items-center justify-center transition-all"
										>
											<Phone className="w-4 h-4" />
										</button>
										<button
											onClick={() => { startCall(creator.id, creator.name, creator.avatar, 'video'); navigate('/call'); }}
											className="w-9 h-9 bg-white/10 hover:bg-sky-500/20 hover:text-sky-400 text-white/70 rounded-xl flex items-center justify-center transition-all"
										>
											<Video className="w-4 h-4" />
										</button>
										<button
											onClick={handleMessage}
											className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-all"
										>
											<MessageCircle className="w-4 h-4" />
											Message
										</button>
										<button
											onClick={() => setShowTipModal(true)}
											className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-semibold px-3 py-2 rounded-xl transition-all"
										>
											<Zap className="w-4 h-4 fill-amber-400" />
											Tip
										</button>
										<button
											onClick={() => setShowSessionModal(true)}
											className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm font-semibold px-3 py-2 rounded-xl transition-all border border-rose-500/20"
										>
											Book Session
										</button>
									</>
								) : (
									<button
										onClick={() => setShowSubscribeModal(true)}
										className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-5 py-2 rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-rose-500/25"
									>
										Subscribe ${creator.subscriptionPrice}/mo
									</button>
								)}
							</div>
						)}

						{isOwner && (
							<button
								onClick={() => { void navigate('/creator-dashboard/profile'); }}
								className="bg-white/10 hover:bg-white/15 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all mt-4"
							>
								Edit Profile
							</button>
						)}
					</div>

					<div className="flex items-center gap-2 mb-1">
						<h1 className="text-xl font-bold text-white">{creator.name}</h1>
						{creator.isKYCVerified && <Star className="w-5 h-5 text-amber-400 fill-amber-400" />}
					</div>
					<p className="text-white/40 text-sm mb-2">@{creator.username}</p>
					{creator.bio && <p className="text-white/60 text-sm leading-relaxed mb-4">{creator.bio}</p>}

					<div className="flex gap-4 mb-4">
						<div className="text-center">
							<p className="font-bold text-white">{creator.postCount}</p>
							<p className="text-xs text-white/40">Posts</p>
						</div>
						<div className="text-center">
							<p className="font-bold text-white">{creator.subscriberCount.toLocaleString()}</p>
							<p className="text-xs text-white/40">Subscribers</p>
						</div>
						<div className="text-center">
							<p className="font-bold text-white">{creator.likeCount.toLocaleString()}</p>
							<p className="text-xs text-white/40">Likes</p>
						</div>
					</div>

					{!subscribed && !isOwner && (
						<div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 mb-4">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 bg-rose-500/20 rounded-xl flex items-center justify-center">
									<Lock className="w-5 h-5 text-rose-400" />
								</div>
								<div className="flex-1">
									<p className="text-sm font-semibold text-white mb-0.5">Subscribe to unlock all content</p>
									<p className="text-xs text-white/40">{creator.postCount} posts · Starting at ${creator.subscriptionPrice}/mo</p>
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

					<div className="flex gap-1 bg-white/5 p-0.5 rounded-xl mb-4">
						{[
							{ key: 'all', icon: Grid3x3, label: 'All' },
							{ key: 'free', icon: Image, label: 'Free' },
							{ key: 'locked', icon: Lock, label: 'Locked' },
						].map(({ key, icon: Icon, label }) => (
							<button
								key={key}
								onClick={() => setPostFilter(key as typeof postFilter)}
								className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-all ${
									postFilter === key ? 'bg-white/10 text-white' : 'text-white/40'
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
							<Type className="w-8 h-8 text-white/10 mx-auto mb-2" />
							<p className="text-white/30 text-sm">No posts found</p>
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
				creatorId={creator.id}
				creatorName={creator.name}
				creatorAvatar={creator.avatar}
			/>
			<SubscribeModal
				isOpen={showSubscribeModal}
				onClose={() => setShowSubscribeModal(false)}
				creator={creator}
			/>
			<SessionPickerModal
				isOpen={showSessionModal}
				onClose={() => setShowSessionModal(false)}
				creatorName={creator.name}
				creatorAvatar={creator.avatar}
				ratePerMinute={creator.perMinuteRate}
				walletBalance={authState.user?.walletBalance ?? 0}
				onConfirm={handleStartSession}
			/>
		</Layout>
	);
}
