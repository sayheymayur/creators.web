import type { Comment } from '../types';

export interface CommentTreeNode {
	comment: Comment;
	replies: CommentTreeNode[];
}

function commentSort(a: Comment, b: Comment): number {
	const ta = new Date(a.createdAt).getTime();
	const tb = new Date(b.createdAt).getTime();
	if (ta !== tb) return ta - tb;
	return a.id.localeCompare(b.id);
}

/** Group flat API comments into a forest (roots = no parent). */
export function buildCommentTree(flat: Comment[]): CommentTreeNode[] {
	const childrenOf = new Map<string | null, Comment[]>();
	for (const c of flat) {
		const raw = c.parentCommentId;
		const pid = raw == null || raw === '' ? null : String(raw);
		const list = childrenOf.get(pid) ?? [];
		list.push(c);
		childrenOf.set(pid, list);
	}
	for (const list of childrenOf.values()) {
		list.sort(commentSort);
	}
	function build(parentId: string | null): CommentTreeNode[] {
		const kids = childrenOf.get(parentId) ?? [];
		return kids.map(comment => ({
			comment,
			replies: build(comment.id),
		}));
	}
	return build(null);
}
