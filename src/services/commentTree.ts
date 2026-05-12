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
	const childrenOf: Record<string, Comment[]> = {};
	for (const c of flat) {
		const raw = c.parentCommentId;
		const pid = raw == null || raw === '' ? '__root__' : String(raw);
		const list = childrenOf[pid] ?? [];
		list.push(c);
		childrenOf[pid] = list;
	}
	for (const key of Object.keys(childrenOf)) {
		childrenOf[key].sort(commentSort);
	}
	function build(parentId: string): CommentTreeNode[] {
		const kids = childrenOf[parentId] ?? [];
		return kids.map(comment => ({
			comment,
			replies: build(comment.id),
		}));
	}
	return build('__root__');
}
