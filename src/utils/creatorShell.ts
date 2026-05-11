import type { Creator, User } from '../types';
import type { CreatorDisplay } from '../services/postDtoMap';

const CREATOR_NUMERIC_DEFAULTS: Pick<Creator,
	'subscriptionPrice' | 'totalEarnings' | 'monthlyEarnings' | 'tipsReceived' |
	'subscriberCount' | 'postCount' | 'likeCount' | 'perMinuteRate'
> = {
	subscriptionPrice: 0,
	totalEarnings: 0,
	monthlyEarnings: 0,
	tipsReceived: 0,
	subscriberCount: 0,
	postCount: 0,
	likeCount: 0,
	perMinuteRate: 0,
};

/** Realistic creator row for the logged-in user — no mock assets. */
export function minimalCreatorFromUser(user: User): Creator {
	return {
		...CREATOR_NUMERIC_DEFAULTS,
		id: user.id,
		email: user.email,
		name: user.name,
		username: user.username,
		avatar: user.avatar,
		bio: user.bio ?? '',
		banner: user.banner ?? '',
		category: user.category ?? 'Lifestyle',
		kycStatus: 'not_submitted',
		isKYCVerified: false,
		isOnline: false,
		monthlyStats: [],
		liveStreamEnabled: false,
		role: 'creator',
		createdAt: user.createdAt,
		isAgeVerified: user.isAgeVerified,
		status: user.status,
		walletBalanceMinor: user.walletBalanceMinor,
	};
}

/** Placeholder creator from post-directory cache — never uses mock stock photos. */
export function minimalCreatorFromDisplay(creatorUserId: string, cached: CreatorDisplay): Creator {
	return {
		...CREATOR_NUMERIC_DEFAULTS,
		id: creatorUserId,
		email: '',
		name: cached.name?.trim() ? cached.name : 'Creator',
		username: cached.username?.trim() ? cached.username : 'creator',
		avatar: cached.avatar ?? '',
		bio: '',
		banner: '',
		category: 'Lifestyle',
		kycStatus: 'not_submitted',
		isKYCVerified: false,
		isOnline: false,
		monthlyStats: [],
		liveStreamEnabled: false,
		role: 'creator',
		createdAt: new Date().toISOString(),
		isAgeVerified: true,
		status: 'active',
		walletBalanceMinor: '0',
	};
}
