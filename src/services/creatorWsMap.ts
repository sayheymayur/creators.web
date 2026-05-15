import type { Creator } from '../types';
import type { CreatorProfileDTO, CreatorSummaryDTO } from './creatorWsTypes';
import { creatorsApi, type CreatorProfileResponse } from './creatorsApi';

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
	const creatorProfileId =
		dto.id && dto.id !== dto.user_id ? dto.id : (base?.creatorProfileId);
	return {
		id: dto.user_id,
		creatorProfileId,
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

/** Creator card row id is `creators.id` (PK); UI routes by `user_id`. */
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
	const userId = h.id;
	const rowPk = h.creatorProfileId;
	return {
		id: rowPk ?? userId,
		user_id: userId,
		username: h.username,
		name: h.name,
		avatar_url: h.avatar || null,
		categories: cats,
		bio: h.bio ?? null,
		banner_url: h.banner ?? null,
		socials: null,
		created_at: h.createdAt,
		subscription_price_minor: h.subscriptionPriceMinor ?? undefined,
		profile_like_count: h.profileLikeCount,
		is_profile_liked: h.isProfileLiked,
		follower_count: h.followerCount,
		is_followed: h.isFollowed,
	};
}

/** Dedupe directory rows by canonical user id (`Creator.id`). */
export function dedupeCreatorsByUserId(creators: Creator[]): Creator[] {
	const out: Creator[] = [];
	const seen: Record<string, true> = {};
	for (const c of creators) {
		const key = String(c.id);
		if (seen[key]) continue;
		seen[key] = true;
		out.push(c);
	}
	return out;
}

const CREATOR_CARD_HTTP_CONCURRENCY = 5;

/**
 * Enrich directory rows with `GET /creators/:userId` (optional Bearer) so cards match HTTP truth.
 * Failures keep the WS-derived row.
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
