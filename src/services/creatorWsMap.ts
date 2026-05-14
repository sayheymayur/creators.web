import type { Creator } from '../types';
import type { CreatorProfileDTO, CreatorSummaryDTO } from './creatorWsTypes';
import { creatorsApi, type CreatorProfileResponse } from './creatorsApi';

/** Map WS creator row → UI Creator (fill required Creator fields with defaults). */
export function creatorProfileDtoToCreator(dto: CreatorProfileDTO, base?: Partial<Creator>): Creator {
	const category0 = dto.categories[0] ?? 'Lifestyle';
	const priceMinor = typeof dto.subscription_price_minor === 'string' ? dto.subscription_price_minor.trim() : '';
	const priceRupees = /^\d+$/.test(priceMinor) ? (Number(priceMinor) / 100) : (base?.subscriptionPrice ?? 0);
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
		subscriberCount:
			typeof dto.follower_count === 'number' ? dto.follower_count :
			typeof dto.follower_count === 'string' && /^\d+$/.test(dto.follower_count) ? Number(dto.follower_count) :
			(base?.subscriberCount ?? 0),
		kycStatus: base?.kycStatus ?? 'approved',
		isKYCVerified: base?.isKYCVerified ?? true,
		category: category0,
		isOnline: base?.isOnline ?? false,
		postCount: base?.postCount ?? 0,
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

/** Map GET /creators JSON (camelCase) → WS-shaped DTO for `creatorProfileDtoToCreator`. */
export function httpCreatorProfileToDto(h: CreatorProfileResponse): CreatorProfileDTO {
	const cats = h.categories?.length ? h.categories : (h.category ? [h.category] : []);
	return {
		id: h.id,
		user_id: h.id,
		username: h.username,
		name: h.name,
		avatar_url: h.avatar || null,
		categories: cats,
		bio: h.bio ?? null,
		banner_url: h.banner ?? null,
		socials: h.socials ?? null,
		created_at: h.createdAt,
		subscription_price_minor: h.subscriptionPriceMinor ?? undefined,
		profile_like_count: h.profileLikeCount,
		is_profile_liked: h.isProfileLiked,
		follower_count: h.followerCount,
		is_followed: h.isFollowed,
	};
}

const CREATOR_CARD_HTTP_CONCURRENCY = 5;

/**
 * Enrich directory rows with `GET /creators/:userId` (optional Bearer) so cards match HTTP truth
 * (followerCount, profileLikeCount, follow/like flags, pricing). Failures keep the WS-derived row.
 */
export function hydrateCreatorCardsFromHttp(creators: Creator[], signal?: AbortSignal): Promise<Creator[]> {
	if (!creators.length) return Promise.resolve(creators);
	const out = [...creators];

	function runBatch(start: number): Promise<Creator[]> {
		if (signal?.aborted) return Promise.resolve(out);
		if (start >= out.length) return Promise.resolve(out);
		const batch = out.slice(start, start + CREATOR_CARD_HTTP_CONCURRENCY);
		return Promise.all(
			batch.map(c => {
				if (signal?.aborted) return Promise.resolve(c);
				return creatorsApi.creators.getById(c.id, signal).then(
					profile => creatorProfileDtoToCreator(httpCreatorProfileToDto(profile), c),
					() => c
				);
			})
		).then(settled => {
			for (let k = 0; k < settled.length; k++) out[start + k] = settled[k];
			return runBatch(start + CREATOR_CARD_HTTP_CONCURRENCY);
		});
	}

	return runBatch(0);
}
