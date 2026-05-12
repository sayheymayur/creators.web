import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Zap, Users } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { PostCard } from '../../components/ui/PostCard';
import { MediaAvatar } from '../../components/ui/MediaAvatar';
import { useContent } from '../../context/ContentContext';
import { useSubscriptions } from '../../context/SubscriptionContext';
import { useDragScroll } from '../../hooks/useDragScroll';
import type { Creator } from '../../types';

export function Feed() {
	const { state: contentState, loadMoreFeed, refreshFeed, loadCreatorPosts } = useContent();
	const { isSubscribed: isWsSubscribed, activeByCreatorUserId } = useSubscriptions();
	const navigate = useNavigate();
	const [filter, setFilter] = useState<'all' | 'subscribed'>('all');
	const followingRef = useDragScroll();
	const lastSubscribedLoadKey = useRef<string>('');

	const subscribedCreatorIds = useMemo(
		() => Object.keys(activeByCreatorUserId),
		[activeByCreatorUserId]
	);

	const subscribedCreators: Creator[] = useMemo(() => {
		return subscribedCreatorIds.map(id => {
			const prof = contentState.creatorProfiles[id];
			const fromPost = contentState.posts.find(p => p.creatorId === id);
			return {
				id,
				email: '',
				name: prof?.name ?? fromPost?.creatorName ?? 'Creator',
				username: prof?.username ?? fromPost?.creatorUsername ?? id,
				avatar: prof?.avatar ?? fromPost?.creatorAvatar ?? '',
				role: 'creator' as const,
				createdAt: '',
				isAgeVerified: true,
				status: 'active' as const,
				walletBalanceMinor: '0',
				bio: '',
				banner: '',
				subscriptionPrice: 0,
				totalEarnings: 0,
				monthlyEarnings: 0,
				tipsReceived: 0,
				subscriberCount: 0,
				followerCount: 0,
				kycStatus: 'approved' as const,
				isKYCVerified: false,
				category: 'Lifestyle',
				isOnline: false,
				postCount: 0,
				likeCount: 0,
				monthlyStats: [],
				perMinuteRate: 0,
				liveStreamEnabled: false,
			};
		});
	}, [subscribedCreatorIds, contentState.creatorProfiles, contentState.posts]);

	const loadSubscribedCreatorPosts = useCallback(() => {
		if (subscribedCreatorIds.length === 0) return Promise.resolve();
		const key = subscribedCreatorIds.slice().sort().join(',');
		if (lastSubscribedLoadKey.current === key) return Promise.resolve();
		lastSubscribedLoadKey.current = key;
		return Promise.all(subscribedCreatorIds.map(id => loadCreatorPosts(id, true))).then(() => {});
	}, [subscribedCreatorIds, loadCreatorPosts]);

	useEffect(() => {
		if (contentState.postsWsStatus !== 'ready') return;
		if (subscribedCreatorIds.length === 0) return;
		void loadSubscribedCreatorPosts();
	}, [contentState.postsWsStatus, subscribedCreatorIds, loadSubscribedCreatorPosts]);

	useEffect(() => {
		if (filter !== 'subscribed') return;
		if (contentState.postsWsStatus !== 'ready') return;
		lastSubscribedLoadKey.current = '';
		void loadSubscribedCreatorPosts();
	}, [filter, contentState.postsWsStatus, loadSubscribedCreatorPosts]);

	const posts = contentState.posts.filter(p => {
		if (filter === 'subscribed') return isWsSubscribed(p.creatorId);
		return true;
	});

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				{subscribedCreators.length > 0 && (
					<div className="mb-6">
						<p className="text-xs text-muted font-medium uppercase tracking-wider mb-3">Subscribed</p>
						<div ref={followingRef} className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
							{subscribedCreators.map(creator => (
								<button
									key={creator.id}
									type="button"
									onClick={() => { void navigate(`/creator/${creator.id}`); }}
									className="flex flex-col items-center gap-1 shrink-0"
								>
									<div className="relative">
										<div className={`w-14 h-14 rounded-full p-0.5 ${creator.isOnline ? 'bg-gradient-to-tr from-rose-500 to-amber-400' : 'bg-foreground/10'}`}>
											<MediaAvatar
												src={creator.avatar}
												alt={creator.name}
												name={creator.name}
												className="h-full w-full rounded-full border-2 border-background"
											/>
										</div>
										{creator.isOnline && (
											<div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-background rounded-full" />
										)}
									</div>
									<p className="text-[10px] text-muted w-14 text-center truncate">{creator.name.split(' ')[0]}</p>
								</button>
							))}
						</div>
					</div>
				)}

				<div className="flex items-center justify-between mb-5">
					<div className="flex items-center gap-2">
						<Sparkles className="w-4 h-4 text-rose-400" />
						<h1 className="font-semibold text-foreground">Your Feed</h1>
					</div>
					<div className="flex gap-1 bg-foreground/5 p-0.5 rounded-xl">
						<button
							type="button"
							onClick={() => setFilter('all')}
							className={`text-xs px-3 py-1 rounded-lg transition-all ${filter === 'all' ? 'bg-foreground/10 text-foreground' : 'text-muted'}`}
						>
							All
						</button>
						<button
							type="button"
							onClick={() => setFilter('subscribed')}
							className={`text-xs px-3 py-1 rounded-lg transition-all ${filter === 'subscribed' ? 'bg-foreground/10 text-foreground' : 'text-muted'}`}
						>
							Subscribed
						</button>
					</div>
				</div>

				{posts.length === 0 ? (
					<div className="text-center py-16">
						<div className="w-14 h-14 bg-foreground/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
							<Users className="w-6 h-6 text-muted/60" />
						</div>
						<p className="text-muted font-medium mb-1">No posts yet</p>
						<p className="text-sm text-muted/80 mb-4">Subscribe to creators to see their content here</p>
						<button
							type="button"
							onClick={() => { void navigate('/explore'); }}
							className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-6 py-2 rounded-xl transition-colors"
						>
							<Zap className="w-4 h-4 inline mr-1.5" />
							Explore Creators
						</button>
					</div>
				) : (
					<>
						{contentState.postsWsError && (
							<div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-200 flex items-center justify-between gap-2">
								<span>{contentState.postsWsError}</span>
								<button
									type="button"
									onClick={() => { void refreshFeed(); }}
									className="shrink-0 text-xs font-semibold px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30"
								>
									Retry
								</button>
							</div>
						)}
						<div className="space-y-4">
							{posts.map(post => (
								<PostCard key={post.id} post={post} />
							))}
						</div>
						{filter === 'all' && contentState.feedNextCursor && (
							<div className="pt-4 flex justify-center">
								<button
									type="button"
									onClick={() => { void loadMoreFeed(); }}
									className="text-sm font-medium text-rose-400 hover:text-rose-300 px-4 py-2 rounded-xl border border-border/30 hover:bg-foreground/5 transition-colors"
								>
									Load more
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</Layout>
	);
}
