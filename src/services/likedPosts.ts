const KEY_PREFIX = 'cw.likedPosts.';

function keyForUser(userId: string): string {
	return `${KEY_PREFIX}${userId}`;
}

export function getLikedPostIds(userId: string): string[] {
	if (!userId) return [];
	try {
		const raw = globalThis.localStorage?.getItem(keyForUser(userId)) ?? '[]';
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(x => typeof x === 'string');
	} catch {
		return [];
	}
}

export function isPostLiked(userId: string, postId: string): boolean {
	return getLikedPostIds(userId).includes(postId);
}

export function setPostLiked(userId: string, postId: string, liked: boolean): void {
	if (!userId || !postId) return;
	try {
		const ids = getLikedPostIds(userId);
		const next = liked ? (ids.includes(postId) ? ids : [...ids, postId]) : ids.filter(x => x !== postId);
		globalThis.localStorage?.setItem(keyForUser(userId), JSON.stringify(next));
	} catch {
		// ignore
	}
}
