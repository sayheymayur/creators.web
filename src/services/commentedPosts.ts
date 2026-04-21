const KEY_PREFIX = 'cw.commentedPosts.';

function keyForUser(userId: string): string {
	return `${KEY_PREFIX}${userId}`;
}

export function getCommentedPostIds(userId: string): string[] {
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

export function isPostCommented(userId: string, postId: string): boolean {
	return getCommentedPostIds(userId).includes(postId);
}

export function setPostCommented(userId: string, postId: string, commented: boolean): void {
	if (!userId || !postId) return;
	try {
		const ids = getCommentedPostIds(userId);
		const next = commented ? (ids.includes(postId) ? ids : [...ids, postId]) : ids.filter(x => x !== postId);
		globalThis.localStorage?.setItem(keyForUser(userId), JSON.stringify(next));
	} catch {
		// ignore
	}
}
