import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useContent } from '../context/ContentContext';
import { useSubscriptions } from '../context/SubscriptionContext';
import type { Creator } from '../types';

type Options = {
	/**
	 * When true (default), when posts WS is ready, load each subscribed creator's posts once
	 * (deduped) so `creatorProfiles` hydrates — Feed behavior.
	 */
	eagerHydrate?: boolean,
};

export function useSubscribedCreatorsForFan(options?: Options) {
	const eagerHydrate = options?.eagerHydrate !== false;
	const { state: contentState, loadCreatorPosts } = useContent();
	const { activeByCreatorUserId } = useSubscriptions();
	const lastSubscribedLoadKey = useRef('');

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

	const bumpHydrate = useCallback(() => {
		lastSubscribedLoadKey.current = '';
		void loadSubscribedCreatorPosts();
	}, [loadSubscribedCreatorPosts]);

	useEffect(() => {
		if (!eagerHydrate) return;
		if (contentState.postsWsStatus !== 'ready') return;
		if (subscribedCreatorIds.length === 0) return;
		void loadSubscribedCreatorPosts();
	}, [eagerHydrate, contentState.postsWsStatus, subscribedCreatorIds, loadSubscribedCreatorPosts]);

	return { subscribedCreators, subscribedCreatorIds, loadSubscribedCreatorPosts, bumpHydrate };
}
