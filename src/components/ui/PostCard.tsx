import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, Lock, Zap, MoreHorizontal, Bookmark, Send, Trash2, Type, AlertTriangle } from '../icons';
import { useNavigate } from 'react-router-dom';
import type { Post } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import { Avatar } from './Avatar';
import { formatDistanceToNow } from '../../utils/date';
import { formatINR } from '../../services/razorpay';
import { TipModal } from '../modals/TipModal';
import { PPVUnlockModal } from '../modals/PPVUnlockModal';
import { Modal } from './Toast';
import { creatorsApi, ApiError } from '../../services/creatorsApi';
import { isPostCommented } from '../../services/commentedPosts';

interface PostCardProps {
	post: Post;
	showCreatorLink?: boolean;
}

export function PostCard({ post, showCreatorLink = true }: PostCardProps) {
	const { state: authState } = useAuth();
	const { toggleLike, addComment, isSubscribed, loadPostComments, loadMorePostComments, updatePost, deletePost, state: contentState } = useContent();
	const { showToast } = useNotifications();
	const navigate = useNavigate();
	const [commentText, setCommentText] = useState('');
	const [showComments, setShowComments] = useState(false);
	const [showTipModal, setShowTipModal] = useState(false);
	const [showPPVModal, setShowPPVModal] = useState(false);
	const [showMenu, setShowMenu] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [showReportModal, setShowReportModal] = useState(false);
	const [editText, setEditText] = useState(post.text ?? '');
	const [reportReason, setReportReason] = useState('Spam');
	const [reportDesc, setReportDesc] = useState('');
	const [reportSending, setReportSending] = useState(false);
	const menuRef = useRef<HTMLDivElement | null>(null);

	const userId = authState.user?.id ?? '';
	const isLiked = post.likedBy.includes(userId);
	const isSubscribedToCreator = isSubscribed(post.creatorId);
	const isOwner = userId === post.creatorId;
	const isContentVisible = isOwner || !post.isLocked || (post.isPPV && post.unlockedBy.includes(userId)) || (!post.isPPV && isSubscribedToCreator);

	const commentNext = contentState.commentPagination[post.id];
	const commentCountShown = Math.max(post.commentCount, post.comments.length);

	const savedKey = useMemo(() => (userId ? `cw.savedPosts.${userId}` : ''), [userId]);
	const [isSaved, setIsSaved] = useState(false);
	const [isCommented, setIsCommented] = useState(false);

	useEffect(() => {
		if (!showComments) return;
		void loadPostComments(post.id);
	}, [showComments, post.id, loadPostComments]);

	useEffect(() => {
		if (!savedKey) { setIsSaved(false); return; }
		try {
			const raw = globalThis.localStorage?.getItem(savedKey) ?? '[]';
			const ids = JSON.parse(raw) as unknown;
			setIsSaved(Array.isArray(ids) && ids.includes(post.id));
		} catch {
			setIsSaved(false);
		}
	}, [savedKey, post.id]);

	useEffect(() => {
		if (!userId) { setIsCommented(false); return; }
		setIsCommented(isPostCommented(userId, post.id));
	}, [userId, post.id]);

	useEffect(() => {
		setEditText(post.text ?? '');
	}, [post.id, post.text]);

	useEffect(() => {
		function onDocMouseDown(e: MouseEvent) {
			if (!showMenu) return;
			const t = e.target as Node | null;
			if (!t) return;
			if (menuRef.current && !menuRef.current.contains(t)) setShowMenu(false);
		}
		document.addEventListener('mousedown', onDocMouseDown);
		return () => document.removeEventListener('mousedown', onDocMouseDown);
	}, [showMenu]);

	function handleLike() {
		if (!authState.user) { void navigate('/login'); return; }
		void toggleLike(post.id, userId);
	}

	function toggleSaved() {
		if (!authState.user) { void navigate('/login'); return; }
		if (!savedKey) return;
		try {
			const raw = globalThis.localStorage?.getItem(savedKey) ?? '[]';
			const ids0 = JSON.parse(raw) as unknown;
			const ids: string[] = Array.isArray(ids0) ? ids0.filter(x => typeof x === 'string') : [];
			const nextSaved = !ids.includes(post.id);
			const next = nextSaved ? [...ids, post.id] : ids.filter(x => x !== post.id);
			globalThis.localStorage?.setItem(savedKey, JSON.stringify(next));
			setIsSaved(nextSaved);
			showToast(nextSaved ? 'Saved' : 'Removed from saved');
		} catch {
			showToast('Could not update saved posts', 'error');
		}
	}

	function handleComment(e: React.FormEvent) {
		e.preventDefault();
		if (!authState.user || !commentText.trim()) return;
		void addComment(post.id, commentText.trim())
			.then(() => {
				setCommentText('');
				setIsCommented(true);
				showToast('Comment posted!');
			})
			.catch(() => {
				showToast('Could not post comment', 'error');
			});
	}

	function handleCreatorClick() {
		if (showCreatorLink) navigate(`/creator/${post.creatorId}`);
	}

	function openEdit() {
		setShowMenu(false);
		if (!authState.user) { void navigate('/login'); return; }
		if (!isOwner && authState.user?.role !== 'admin') return;
		setEditText(post.text ?? '');
		setShowEditModal(true);
	}

	function submitEdit() {
		if (!authState.user) { void navigate('/login'); return; }
		const text = editText.trim();
		if (text.length === 0) {
			showToast('Post text cannot be empty', 'error');
			return;
		}
		void updatePost({ id: post.id, text })
			.then(() => {
				showToast('Post updated');
				setShowEditModal(false);
			})
			.catch(() => {
				showToast('Could not update post', 'error');
			});
	}

	function openDelete() {
		setShowMenu(false);
		if (!authState.user) { void navigate('/login'); return; }
		if (!isOwner && authState.user?.role !== 'admin') return;
		setShowDeleteModal(true);
	}

	function confirmDelete() {
		if (!authState.user) { void navigate('/login'); return; }
		void deletePost(post.id)
			.then(() => {
				showToast('Post deleted');
				setShowDeleteModal(false);
			})
			.catch(() => {
				showToast('Could not delete post', 'error');
			});
	}

	function openReport() {
		setShowMenu(false);
		if (!authState.user) { void navigate('/login'); return; }
		setReportReason('Spam');
		setReportDesc('');
		setShowReportModal(true);
	}

	function submitReport() {
		if (!authState.user) { void navigate('/login'); return; }
		if (reportSending) return;
		setReportSending(true);
		void creatorsApi.reports.create({
			targetType: 'post',
			targetId: post.id,
			reason: reportReason.trim() || 'Other',
			description: reportDesc.trim() || undefined,
		})
			.then(() => {
				showToast('Report submitted. Thank you.');
				setShowReportModal(false);
			})
			.catch(err => {
				if (err instanceof ApiError) {
					console.error('[report] create failed', { status: err.status, body: err.body });
				} else {
					console.error('[report] create failed', err);
				}
				showToast('Could not submit report. Please try again.', 'error');
			})
			.finally(() => setReportSending(false));
	}

	return (
		<div className="bg-surface border border-border/20 rounded-2xl overflow-hidden hover:border-border/30 transition-all duration-300">
			<div className="flex items-center justify-between px-4 pt-4 pb-3">
				<button type="button" onClick={handleCreatorClick} className="flex items-center gap-3 group">
					<Avatar src={post.creatorAvatar} alt={post.creatorName} size="md" />
					<div className="text-left">
						<p className="text-sm font-semibold text-foreground group-hover:text-rose-500 transition-colors">{post.creatorName}</p>
						<p className="text-xs text-muted">@{post.creatorUsername} · {formatDistanceToNow(post.createdAt)}</p>
					</div>
				</button>
				<div ref={menuRef} className="relative">
					<button
						type="button"
						onClick={() => setShowMenu(v => !v)}
						className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors"
						aria-label="Post actions"
					>
						<MoreHorizontal className="w-4 h-4 text-muted" />
					</button>
					{showMenu && (
						<div className="absolute right-0 top-full mt-2 w-48 bg-surface2 border border-border/20 rounded-2xl shadow-2xl py-1.5 z-40">
							{(isOwner || authState.user?.role === 'admin') ? (
								<>
									<button
										type="button"
										onClick={openEdit}
										className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-foreground/5 transition-colors"
									>
										<Type className="w-4 h-4 text-muted" />
										Edit
									</button>
									<button
										type="button"
										onClick={openDelete}
										className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-foreground/5 transition-colors"
									>
										<Trash2 className="w-4 h-4" />
										Delete
									</button>
								</>
							) : (
								<>
									<button
										type="button"
										onClick={toggleSaved}
										className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-foreground/5 transition-colors"
									>
										<Bookmark className={`w-4 h-4 ${isSaved ? 'text-rose-500 fill-rose-500' : 'text-muted'}`} />
										{isSaved ? 'Unsave' : 'Save'}
									</button>
									<button
										type="button"
										onClick={openReport}
										className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-400 hover:bg-foreground/5 transition-colors"
									>
										<AlertTriangle className="w-4 h-4" />
										Report
									</button>
								</>
							)}
						</div>
					)}
				</div>
			</div>

			{post.text && (
				<p className="px-4 pb-3 text-sm text-foreground/90 leading-relaxed whitespace-pre-line line-clamp-4">{post.text}</p>
			)}

			{post.type !== 'text' && post.mediaUrl && (
				<div className="relative">
					<img
						src={post.mediaUrl}
						alt="Post content"
						className={`w-full object-cover max-h-[480px] ${!isContentVisible ? 'filter blur-xl scale-105' : ''} transition-all duration-500`}
						style={{ aspectRatio: '4/3' }}
					/>
					{!isContentVisible && (
						<div className="absolute inset-0 flex flex-col items-center justify-center bg-overlay/60 backdrop-blur-md">
							<div className="bg-surface2 border border-border/20 rounded-2xl p-6 text-center max-w-[220px]">
								<Lock className="w-8 h-8 text-rose-400 mx-auto mb-2" />
								{post.isPPV ? (
									<>
										<p className="text-foreground font-semibold text-sm mb-1">Pay-per-view</p>
										<p className="text-muted text-xs mb-3">Unlock this post for {post.ppvPrice != null ? formatINR(post.ppvPrice) : '—'}</p>
										<button
											onClick={() => setShowPPVModal(true)}
											className="w-full bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
										>
											Unlock for {post.ppvPrice != null ? formatINR(post.ppvPrice) : '—'}
										</button>
									</>
								) : (
									<>
										<p className="text-foreground font-semibold text-sm mb-1">Subscriber Only</p>
										<p className="text-muted text-xs mb-3">Subscribe to view this content</p>
										<button
											type="button"
											onClick={() => { void navigate(`/creator/${post.creatorId}`); }}
											className="w-full bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
										>
											Subscribe
										</button>
									</>
								)}
							</div>
						</div>
					)}
				</div>
			)}

			<div className="px-4 py-3 flex items-center justify-between">
				<div className="flex items-center gap-4">
					<button
						onClick={handleLike}
						className={`flex items-center gap-1.5 group transition-all duration-200 ${isLiked ? 'text-rose-500' : 'text-muted hover:text-foreground'}`}
					>
						<Heart className={`w-5 h-5 transition-transform duration-200 group-active:scale-125 ${isLiked ? 'fill-rose-500' : ''}`} />
						<span className="text-xs font-medium">{post.likes.toLocaleString()}</span>
					</button>
					<button
						onClick={() => setShowComments(v => !v)}
						className={`flex items-center gap-1.5 transition-colors ${isCommented ? 'text-rose-500' : 'text-muted hover:text-foreground'}`}
					>
						<MessageCircle className={`w-5 h-5 ${isCommented ? 'fill-rose-500' : ''}`} />
						<span className="text-xs font-medium">{commentCountShown}</span>
					</button>
					<button className="flex items-center gap-1.5 text-muted hover:text-foreground transition-colors">
						<Send className="w-5 h-5" />
					</button>
				</div>
				<div className="flex items-center gap-2">
					{!isOwner && authState.user?.role !== 'admin' && (
						<button
							onClick={() => setShowTipModal(true)}
							className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
							title="Send tip"
						>
							<Zap className="w-4 h-4 fill-amber-400" />
							<span className="text-xs font-medium">Tip</span>
						</button>
					)}
					<button
						type="button"
						onClick={toggleSaved}
						className="text-muted hover:text-foreground transition-colors"
						aria-label={isSaved ? 'Unsave post' : 'Save post'}
					>
						<Bookmark className={`w-5 h-5 ${isSaved ? 'text-rose-500 fill-rose-500' : 'text-muted'}`} />
					</button>
				</div>
			</div>

			{showComments && (
				<div className="px-4 pb-4 border-t border-border/10 pt-3 space-y-3">
					<div className="max-h-64 overflow-y-auto space-y-3">
						{post.comments.map(comment => (
							<div key={comment.id} className="flex gap-2">
								<Avatar src={comment.userAvatar} alt={comment.userName} size="xs" />
								<div className="bg-foreground/5 rounded-xl px-3 py-2 flex-1">
									<p className="text-xs font-semibold text-foreground/80">{comment.userName}</p>
									<p className="text-xs text-muted mt-0.5">{comment.text}</p>
								</div>
							</div>
						))}
					</div>
					{typeof commentNext === 'string' && commentNext ? (
						<button
							type="button"
							onClick={() => { void loadMorePostComments(post.id); }}
							className="text-xs text-rose-400 hover:text-rose-300 font-medium"
						>
							Load older comments
						</button>
					) : null}
					{authState.user && (
						<form onSubmit={e => { handleComment(e); }} className="flex gap-2">
							<Avatar src={authState.user.avatar} alt={authState.user.name} size="xs" />
							<input
								value={commentText}
								onChange={e => setCommentText(e.target.value)}
								placeholder="Add a comment..."
								className="flex-1 bg-input border border-border/20 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
							/>
						</form>
					)}
				</div>
			)}

			{showTipModal && (
				<TipModal
					isOpen={showTipModal}
					onClose={() => setShowTipModal(false)}
					creatorId={post.creatorId}
					creatorName={post.creatorName}
					creatorAvatar={post.creatorAvatar}
				/>
			)}
			{showPPVModal && (
				<PPVUnlockModal
					isOpen={showPPVModal}
					onClose={() => setShowPPVModal(false)}
					post={post}
				/>
			)}

			<Modal
				isOpen={showEditModal}
				onClose={() => setShowEditModal(false)}
				title="Edit post"
				maxWidth="max-w-lg"
			>
				<div className="p-5 space-y-4">
					<textarea
						value={editText}
						onChange={e => setEditText(e.target.value)}
						className="w-full min-h-[120px] bg-input border border-border/20 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						placeholder="Update your post..."
					/>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setShowEditModal(false)}
							className="px-4 py-2 rounded-full border border-border/30 bg-transparent text-foreground hover:bg-foreground/5 transition-colors"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={submitEdit}
							className="px-4 py-2 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors"
						>
							Save
						</button>
					</div>
				</div>
			</Modal>

			<Modal
				isOpen={showDeleteModal}
				onClose={() => setShowDeleteModal(false)}
				title="Delete post?"
			>
				<div className="p-5 space-y-4">
					<p className="text-sm text-muted">This action cannot be undone.</p>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setShowDeleteModal(false)}
							className="px-4 py-2 rounded-full border border-border/30 bg-transparent text-foreground hover:bg-foreground/5 transition-colors"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={confirmDelete}
							className="px-4 py-2 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors"
						>
							Delete
						</button>
					</div>
				</div>
			</Modal>

			<Modal
				isOpen={showReportModal}
				onClose={() => { if (!reportSending) setShowReportModal(false); }}
				title="Report post"
			>
				<div className="p-5 space-y-4">
					<div className="space-y-1.5">
						<p className="text-xs text-muted">Reason</p>
						<select
							value={reportReason}
							onChange={e => setReportReason(e.target.value)}
							className="w-full bg-input border border-border/20 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						>
							<option>Spam</option>
							<option>Harassment</option>
							<option>Nudity</option>
							<option>Violence</option>
							<option>Other</option>
						</select>
					</div>
					<div className="space-y-1.5">
						<p className="text-xs text-muted">Details (optional)</p>
						<textarea
							value={reportDesc}
							onChange={e => setReportDesc(e.target.value)}
							className="w-full min-h-[90px] bg-input border border-border/20 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
							placeholder="Tell us what’s wrong…"
						/>
					</div>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setShowReportModal(false)}
							disabled={reportSending}
							className="px-4 py-2 rounded-full border border-border/30 bg-transparent text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-60"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={submitReport}
							disabled={reportSending}
							className="px-4 py-2 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-60"
						>
							{reportSending ? 'Submitting…' : 'Submit'}
						</button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
