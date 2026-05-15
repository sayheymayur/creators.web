import type { Creator } from '../types';
import type { CreatorProfileDTO, CreatorSummaryDTO } from './creatorWsTypes';

function parseFollowerCount(dto: CreatorProfileDTO, base?: Partial<Creator>): number {
	const v = dto.follower_count;
	if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
	if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Math.max(0, parseInt(v.trim(), 10));
	if (typeof base?.followerCount === 'number') return Math.max(0, base.followerCount);
	return 0;
}

function parsePostCountFromDto(dto: CreatorProfileDTO): number | undefined {
	const v = dto.post_count;
	if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
	if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Math.max(0, parseInt(v.trim(), 10));
	return undefined;
}

/** Map WS creator row → UI Creator (fill required Creator fields with defaults). */
export function creatorProfileDtoToCreator(dto: CreatorProfileDTO, base?: Partial<Creator>): Creator {
	const category0 = dto.categories[0] ?? 'Lifestyle';
	const priceMinor = typeof dto.subscription_price_minor === 'string' ? dto.subscription_price_minor.trim() : '';
	const priceRupees = /^\d+$/.test(priceMinor) ? (Number(priceMinor) / 100) : (base?.subscriptionPrice ?? 0);
	const followerCount = parseFollowerCount(dto, base);
	const fromDtoPostCount = parsePostCountFromDto(dto);
	const postCount = fromDtoPostCount ?? (base?.postCount ?? 0);
	return {
		id: dto.user_id,
		email: base?.email ?? '',
		name: dto.name,
		username: dto.username,
		avatar: dto.avatar_url ?? '',
		bio: dto.bio ?? '',
		banner: dto.banner_url ?? '',
		subscriptionPrice: priceRupees,
		totalEarnings: base?.totalEarnings ?? 0,
		monthlyEarnings: base?.monthlyEarnings ?? 0,
		tipsReceived: base?.tipsReceived ?? 0,
		subscriberCount: base?.subscriberCount ?? 0,
		followerCount,
		kycStatus: base?.kycStatus ?? 'approved',
		isKYCVerified: base?.isKYCVerified ?? true,
		category: category0,
		isOnline: base?.isOnline ?? false,
		postCount,
		likeCount: typeof dto.profile_like_count === 'number' ? dto.profile_like_count : (base?.likeCount ?? 0),
		monthlyStats: base?.monthlyStats ?? [],
		perMinuteRate: base?.perMinuteRate ?? 0,
		liveStreamEnabled: base?.liveStreamEnabled ?? false,
		role: 'creator',
		createdAt: dto.created_at,
		isAgeVerified: base?.isAgeVerified ?? true,
		status: base?.status ?? 'active',
		walletBalanceMinor: base?.walletBalanceMinor ?? '0',
	};
}

/** Creator card row id is `creators.id` (PK); UI may route by `user_id` — see Explore / profile wiring. */
export function creatorSummaryToCardCreator(dto: CreatorSummaryDTO, base?: Partial<Creator>): Creator {
	const fakeProfile: CreatorProfileDTO = {
		...dto,
		bio: null,
		banner_url: null,
		socials: null,
		created_at: base?.createdAt ?? new Date().toISOString(),
	};
	return creatorProfileDtoToCreator(fakeProfile, base);
}
