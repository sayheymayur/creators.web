import type { Creator } from '../types';
import type { CreatorDisplay } from '../services/postDtoMap';

/** Neutral creator row for loading / unknown profile — no mock stock photos or demo bios. */
export function buildSkeletonCreator(userId: string): Creator {
	const shortId = userId.length > 14 ? `…${userId.slice(-10)}` : userId;
	return {
		id: userId,
		email: '',
		name: 'Creator',
		username: shortId,
		avatar: '',
		banner: '',
		bio: '',
		role: 'creator',
		createdAt: '',
		isAgeVerified: true,
		status: 'active',
		walletBalanceMinor: '0',
		subscriptionPrice: 0,
		totalEarnings: 0,
		monthlyEarnings: 0,
		tipsReceived: 0,
		subscriberCount: 0,
		followerCount: 0,
		kycStatus: 'not_submitted',
		isKYCVerified: false,
		category: 'Lifestyle',
		isOnline: false,
		postCount: 0,
		likeCount: 0,
		monthlyStats: [],
		perMinuteRate: 0,
		liveStreamEnabled: false,
	};
}

/** Minimal creator from post-directory cache only (never pulls mock demo assets). */
export function creatorFromCacheDisplay(userId: string, c: CreatorDisplay): Creator {
	const base = buildSkeletonCreator(userId);
	const name = c.name?.trim();
	const username = c.username?.trim();
	const avatar = c.avatar?.trim() ?? '';
	return {
		...base,
		name: name || base.name,
		username: username || base.username,
		avatar,
	};
}
