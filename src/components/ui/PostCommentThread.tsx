import { useCallback, useMemo, useRef, useState } from 'react';
import type { Post } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import { Avatar } from './Avatar';
import { formatDistanceToNow } from '../../utils/date';
import { Heart, ChevronDown } from '../icons';
import { buildCommentTree, type CommentTreeNode } from '../../services/commentTree';

const MAX_VISUAL_DEPTH = 4;

export interface CommentExpandControls {
	isExpanded: (threadRootId: string) => boolean;
	toggle: (threadRootId: string) => void;
	expand: (threadRootId: string) => void;
}

function autosizeTextareaElement(el: HTMLTextAreaElement | null, maxLines = 5) {
	if (!el) return;
	el.style.height = 'auto';
	const cs = getComputedStyle(el);
	const lineHeight = Number.parseFloat(cs.lineHeight || '0') || 18;
	const paddingY = (Number.parseFloat(cs.paddingTop || '0') || 0) + (Number.parseFloat(cs.paddingBottom || '0') || 0);
	const maxHeight = Math.round(lineHeight * maxLines + paddingY);
	const next = Math.min(el.scrollHeight, maxHeight);
	el.style.height = `${next}px`;
}

/** All nested replies under this node (not counting the node itself). */
function countTotalRepliesInThread(n: CommentTreeNode): number {
	let t = 0;
	for (const ch of n.replies) {
		t += 1 + countTotalRepliesInThread(ch);
	}
	return t;
}

interface CommentBranchProps {
	post: Post;
	node: CommentTreeNode;
	depth: number;
	/** Top-level comment id for this thread (Instagram: one collapse per root). */
	threadRootId: string;
	replyingToId: string | null;
	replyText: string;
	submittingReply: boolean;
	onStartReply: (commentId: string) => void;
	onCancelReply: () => void;
	onReplyText: (v: string) => void;
	onSubmitReply: (parentId: string, threadRootId: string) => void;
	onHeart: (commentId: string) => void;
	heartingId: string | null;
	expand: CommentExpandControls;
}

function CommentBranch({
	post,
	node,
	depth,
	threadRootId,
	replyingToId,
	replyText,
	submittingReply,
	onStartReply,
	onCancelReply,
	onReplyText,
	onSubmitReply,
	onHeart,
	heartingId,
	expand,
}: CommentBranchProps) {
	const { state: authState } = useAuth();
	const { comment } = node;
	const isPostAuthor = authState.user?.id === post.creatorId;
	const isCreatorComment = comment.userId === post.creatorId;
	const marginSteps = ['', 'ml-2.5 sm:ml-3', 'ml-5 sm:ml-6', 'ml-7 sm:ml-9', 'ml-7 sm:ml-9'] as const;
	const ml = marginSteps[Math.min(depth, MAX_VISUAL_DEPTH)];

	const hearts = comment.heartCount ?? 0;
	const creatorHeartedComment = hearts > 0;
	const totalInThread = countTotalRepliesInThread(node);
	const directReplyCount = node.replies.length;
	const threadOpen = expand.isExpanded(threadRootId);
	const isThreadRoot = comment.id === threadRootId;
	const showReplyComposer = replyingToId === comment.id && Boolean(authState.user);

	const showViewRepliesRow = isThreadRoot && directReplyCount > 0 && !threadOpen;
	const showHideRepliesRow = isThreadRoot && directReplyCount > 0 && threadOpen;
	const showRepliesBlock = directReplyCount > 0 && threadOpen;

	return (
		<div className={depth === 0 ? '' : `border-l border-border/40 dark:border-border/30 ${ml}`}>
			<div className={`flex gap-2 sm:gap-2.5 ${depth > 0 ? 'pt-2.5 pl-2 sm:pl-2.5' : ''}`}>
				<div className="shrink-0 pt-0.5">
					<Avatar src={comment.userAvatar} alt={comment.userName} size="xs" />
				</div>
				<div className="flex-1 min-w-0">
					<div
						className={
							'px-0 py-0 ' +
							'bg-transparent border-0 shadow-none'
						}
					>
						<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
							<p className="text-[13px] sm:text-sm font-semibold text-foreground leading-tight">{comment.userName}</p>
							{isCreatorComment && (
								<span className="text-[10px] font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-400 bg-rose-500/12 dark:bg-rose-500/20 px-1.5 py-0.5 rounded-md">
									Creator
								</span>
							)}
						</div>
						<p className="text-[13px] sm:text-sm text-foreground/90 dark:text-foreground/85 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
							{comment.text}
						</p>
					</div>

					<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5">
						<span className="text-[11px] sm:text-xs text-muted tabular-nums">
							{formatDistanceToNow(comment.createdAt)}
						</span>
						{authState.user && (
							<button
								type="button"
								onClick={() => onStartReply(comment.id)}
								className="text-[11px] sm:text-xs font-semibold text-foreground/75 dark:text-foreground/70 hover:text-foreground min-h-[44px] sm:min-h-0 py-2 sm:py-0 px-1 -mx-1 rounded-lg sm:rounded-none active:bg-foreground/5 sm:active:bg-transparent"
							>
								Reply
							</button>
						)}
						{creatorHeartedComment && !isPostAuthor && (
							<span
								className={
									'inline-flex items-center gap-1 max-w-full min-w-0 rounded-full px-2 py-0.5 ' +
									'bg-rose-500/10 dark:bg-rose-500/15 ' +
									'text-[11px] sm:text-xs font-semibold text-rose-600 dark:text-rose-400'
								}
								title={`${post.creatorName} liked this comment`}
								aria-label={`${post.creatorName} liked this comment`}
							>
								<Heart className="w-3.5 h-3.5 shrink-0 fill-rose-500 text-rose-500 dark:fill-rose-400 dark:text-rose-400" aria-hidden />
								<span className="truncate">
									Liked by <span className="text-foreground/90 dark:text-foreground/85">{post.creatorName}</span>
								</span>
							</span>
						)}
						{isPostAuthor && (
							<button
								type="button"
								onClick={() => { void onHeart(comment.id); }}
								disabled={heartingId === comment.id}
								className={
									'text-[11px] sm:text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50 ' +
									'min-h-[44px] sm:min-h-0 py-2 sm:py-0 px-1 -mx-1 rounded-lg sm:rounded-none ' +
									'motion-safe:transition-transform motion-safe:active:scale-95 ' +
									(creatorHeartedComment ?
										'text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300' :
										'text-muted hover:text-rose-500 dark:hover:text-rose-400')
								}
								title={creatorHeartedComment ? 'Remove heart' : 'Heart comment'}
							>
								<Heart
									className={
										'w-3.5 h-3.5 ' +
										(creatorHeartedComment ?
											'fill-rose-500 text-rose-500 dark:fill-rose-400 dark:text-rose-400' :
											'fill-rose-400/25 text-rose-500/80 dark:text-rose-400')
									}
								/>
								{hearts > 0 ? <span className="tabular-nums">{hearts}</span> : null}
							</button>
						)}
					</div>

					{showViewRepliesRow && (
						<button
							type="button"
							onClick={() => expand.toggle(threadRootId)}
							className="mt-1 flex items-center gap-1 text-left text-[11px] sm:text-xs font-semibold text-muted hover:text-foreground min-h-[40px] sm:min-h-0 py-1.5 -ml-0.5 pl-0.5 pr-2 rounded-lg active:bg-foreground/5"
						>
							<ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
							View {totalInThread} {totalInThread === 1 ? 'reply' : 'replies'}
						</button>
					)}

					{showHideRepliesRow && (
						<button
							type="button"
							onClick={() => expand.toggle(threadRootId)}
							className="mt-1 flex items-center gap-1 text-[11px] sm:text-xs font-medium text-muted hover:text-foreground py-1"
						>
							<ChevronDown className="w-3.5 h-3.5 shrink-0 rotate-180 opacity-70" aria-hidden />
							Hide replies
						</button>
					)}

					{showReplyComposer && (
						<div className="mt-2">
							<label className="sr-only" htmlFor={`reply-${comment.id}`}>Reply to {comment.userName}</label>
							<div className="flex items-end gap-2 border-b border-border/35 dark:border-border/35">
								<textarea
									id={`reply-${comment.id}`}
									value={replyText}
									onChange={e => {
										onReplyText(e.target.value);
										autosizeTextareaElement(e.currentTarget, 5);
									}}
									onInput={e => autosizeTextareaElement(e.currentTarget, 5)}
									placeholder={`Reply to ${comment.userName}…`}
									rows={1}
									className={
										'flex-1 min-h-[40px] max-h-[118px] overflow-y-auto scrollbar-hide resize-none px-0 py-2 text-[13px] sm:text-sm ' +
										'bg-transparent text-foreground placeholder:text-muted ' +
										'border-0 rounded-none ' +
										'focus:outline-none'
									}
								/>
								<div className="flex items-center gap-2 pb-1">
								<button
									type="button"
									onClick={onCancelReply}
									className="text-[11px] sm:text-xs px-2 py-2 rounded-lg text-muted hover:text-foreground disabled:opacity-40 font-semibold min-h-[36px]"
								>
									Cancel
								</button>
								<button
									type="button"
									disabled={!replyText.trim() || submittingReply}
									onClick={() => onSubmitReply(comment.id, threadRootId)}
									className="text-[11px] sm:text-xs px-3 py-2 rounded-lg bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 font-semibold min-h-[36px]"
								>
									{submittingReply ? 'Posting…' : 'Reply'}
								</button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			{showRepliesBlock && (
				<div className="space-y-0">
					{node.replies.map(child => (
						<CommentBranch
							key={child.comment.id}
							post={post}
							node={child}
							depth={depth + 1}
							threadRootId={threadRootId}
							replyingToId={replyingToId}
							replyText={replyText}
							submittingReply={submittingReply}
							onStartReply={onStartReply}
							onCancelReply={onCancelReply}
							onReplyText={onReplyText}
							onSubmitReply={onSubmitReply}
							onHeart={onHeart}
							heartingId={heartingId}
							expand={expand}
						/>
					))}
				</div>
			)}
		</div>
	);
}

interface PostCommentThreadProps {
	post: Post;
	commentNext: string | null | undefined;
	onCommentPosted?: () => void;
}

export function PostCommentThread({ post, commentNext, onCommentPosted }: PostCommentThreadProps) {
	const { state: authState } = useAuth();
	const { addComment, addReply, heartComment, loadMorePostComments } = useContent();
	const { showToast } = useNotifications();
	const [rootText, setRootText] = useState('');
	const [replyingToId, setReplyingToId] = useState<string | null>(null);
	const [replyText, setReplyText] = useState('');
	const [submittingRoot, setSubmittingRoot] = useState(false);
	const [submittingReply, setSubmittingReply] = useState(false);
	const [heartingId, setHeartingId] = useState<string | null>(null);
	const [expandedThreads, setExpandedThreads] = useState<Record<string, true>>({});
	const rootInputRef = useRef<HTMLTextAreaElement | null>(null);

	const expand = useMemo<CommentExpandControls>(
		() => ({
			isExpanded: (threadRootId: string) => expandedThreads[threadRootId] === true,
			toggle: (threadRootId: string) => {
				setExpandedThreads(p => {
					const next = { ...p };
					if (next[threadRootId]) delete next[threadRootId];
					else next[threadRootId] = true;
					return next;
				});
			},
			expand: (threadRootId: string) => {
				setExpandedThreads(p => ({ ...p, [threadRootId]: true }));
			},
		}),
		[expandedThreads]
	);

	const tree = useMemo(() => buildCommentTree(post.comments), [post.comments]);

	const submitRootComment = useCallback(() => {
		if (!authState.user || !rootText.trim()) return;
		setSubmittingRoot(true);
		void addComment(post.id, rootText.trim())
			.then(() => {
				setRootText('');
				if (rootInputRef.current) {
					rootInputRef.current.style.height = 'auto';
				}
				onCommentPosted?.();
				showToast('Comment posted!');
			})
			.catch(() => {
				showToast('Could not post comment', 'error');
			})
			.finally(() => setSubmittingRoot(false));
	}, [addComment, authState.user, onCommentPosted, post.id, rootText, showToast]);

	const handleSubmitReply = useCallback(
		(parentId: string, threadRootId: string) => {
			if (!authState.user || !replyText.trim()) return;
			setSubmittingReply(true);
			void addReply(post.id, parentId, replyText.trim())
				.then(() => {
					setReplyText('');
					setReplyingToId(null);
					expand.expand(threadRootId);
					onCommentPosted?.();
					showToast('Reply posted!');
				})
				.catch(() => {
					showToast('Could not post reply', 'error');
				})
				.finally(() => setSubmittingReply(false));
		},
		[addReply, authState.user, expand, onCommentPosted, post.id, replyText, showToast]
	);

	const handleHeart = useCallback(
		(commentId: string) => {
			setHeartingId(commentId);
			void heartComment(commentId)
				.catch(() => {
					showToast('Could not update heart', 'error');
				})
				.finally(() => setHeartingId(null));
		},
		[heartComment, showToast]
	);

	return (
		<div className="space-y-3">
			{authState.user && (
				<div className="border-b border-border/15 dark:border-border/20 pb-3">
					<div className="flex gap-2 sm:gap-2.5">
						<div className="shrink-0 pt-0.5">
							<Avatar src={authState.user.avatar} alt={authState.user.name} size="xs" />
						</div>
						<div className="flex-1 min-w-0">
							<label className="sr-only" htmlFor={`root-comment-${post.id}`}>Add a comment</label>
							<div className="flex items-end gap-2 border-b border-border/35 dark:border-border/35">
								<textarea
									id={`root-comment-${post.id}`}
									ref={rootInputRef}
									value={rootText}
									onChange={e => {
										setRootText(e.target.value);
										autosizeTextareaElement(e.currentTarget, 5);
									}}
									onInput={e => autosizeTextareaElement(e.currentTarget, 5)}
									placeholder="Add a comment…"
									rows={1}
									className={
										'flex-1 min-h-[40px] max-h-[118px] overflow-y-auto scrollbar-hide resize-none px-0 py-2 text-[13px] sm:text-sm ' +
										'bg-transparent text-foreground placeholder:text-muted ' +
										'border-0 rounded-none ' +
										'focus:outline-none'
									}
								/>
								<div className="flex items-center gap-2 pb-1">
									<button
										type="button"
										onClick={() => setRootText('')}
										disabled={!rootText.trim() || submittingRoot}
										className="text-[11px] sm:text-xs px-2 py-2 rounded-lg text-muted hover:text-foreground disabled:opacity-40 font-semibold min-h-[36px]"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={submitRootComment}
										disabled={!rootText.trim() || submittingRoot}
										className="text-[11px] sm:text-xs px-3 py-2 rounded-lg bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 font-semibold min-h-[36px]"
									>
										{submittingRoot ? 'Commenting…' : 'Comment'}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			<div
				className={
					'max-h-[min(280px,52dvh)] sm:max-h-80 overflow-y-auto overscroll-y-contain ' +
					'scrollbar-hide space-y-3 sm:space-y-3.5 pr-1 -mr-1'
				}
			>
				{tree.length === 0 ? (
					<p className="text-[13px] sm:text-sm text-muted text-center py-4 px-2">
						No comments yet. Be the first to comment.
					</p>
				) : (
					tree.map(node => {
						const rootId = node.comment.id;
						return (
							<CommentBranch
								key={rootId}
								post={post}
								node={node}
								depth={0}
								threadRootId={rootId}
								replyingToId={replyingToId}
								replyText={replyText}
								submittingReply={submittingReply}
								onStartReply={id => {
									setReplyingToId(id);
									setReplyText('');
								}}
								onCancelReply={() => {
									setReplyingToId(null);
									setReplyText('');
								}}
								onReplyText={setReplyText}
								onSubmitReply={handleSubmitReply}
								onHeart={handleHeart}
								heartingId={heartingId}
								expand={expand}
							/>
						);
					})
				)}
			</div>
			{typeof commentNext === 'string' && commentNext ? (
				<button
					type="button"
					onClick={() => { void loadMorePostComments(post.id); }}
					className="text-[11px] sm:text-xs text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 font-semibold py-2 min-h-[44px] sm:min-h-0"
				>
					Load older comments
				</button>
			) : null}
		</div>
	);
}
