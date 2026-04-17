import { useEffect, useState } from 'react';
import { Heart, MessageCircle, Lock, Zap, MoreHorizontal, Bookmark, Send } from '../icons';
import { useNavigate } from 'react-router-dom';
import type { Post } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import { Avatar } from './Avatar';
import { formatDistanceToNow } from '../../utils/date';
import { TipModal } from '../modals/TipModal';
import { PPVUnlockModal } from '../modals/PPVUnlockModal';

interface PostCardProps {
	post: Post;
	showCreatorLink?: boolean;
}

export function PostCard({ post, showCreatorLink = true }: PostCardProps) {
	const { state: authState } = useAuth();
	const { toggleLike, addComment, isSubscribed, loadPostComments, loadMorePostComments, state: contentState } = useContent();
	const { showToast } = useNotifications();
	const navigate = useNavigate();
	const [commentText, setCommentText] = useState('');
	const [showComments, setShowComments] = useState(false);
	const [showTipModal, setShowTipModal] = useState(false);
	const [showPPVModal, setShowPPVModal] = useState(false);

	const userId = authState.user?.id ?? '';
	const isLiked = post.likedBy.includes(userId);
	const isSubscribedToCreator = isSubscribed(post.creatorId);
	const isOwner = userId === post.creatorId;
	const isContentVisible = isOwner || !post.isLocked || (post.isPPV && post.unlockedBy.includes(userId)) || (!post.isPPV && isSubscribedToCreator);

	const commentNext = contentState.commentPagination[post.id];
	const commentCountShown = Math.max(post.commentCount, post.comments.length);

	useEffect(() => {
		if (!showComments) return;
		void loadPostComments(post.id);
	}, [showComments, post.id, loadPostComments]);

	function handleLike() {
		if (!authState.user) { void navigate('/login'); return; }
		void toggleLike(post.id, userId);
	}

	function handleComment(e: React.FormEvent) {
		e.preventDefault();
		if (!authState.user || !commentText.trim()) return;
		void addComment(post.id, commentText.trim())
			.then(() => {
				setCommentText('');
				showToast('Comment posted!');
			})
			.catch(() => {
				showToast('Could not post comment', 'error');
			});
	}

	function handleCreatorClick() {
		if (showCreatorLink) navigate(`/creator/${post.creatorId}`);
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
				<button className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors">
					<MoreHorizontal className="w-4 h-4 text-muted" />
				</button>
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
										<p className="text-muted text-xs mb-3">Unlock this post for ${post.ppvPrice?.toFixed(2)}</p>
										<button
											onClick={() => setShowPPVModal(true)}
											className="w-full bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
										>
											Unlock for ${post.ppvPrice?.toFixed(2)}
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
						className="flex items-center gap-1.5 text-muted hover:text-foreground transition-colors"
					>
						<MessageCircle className="w-5 h-5" />
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
					<button className="text-muted hover:text-foreground transition-colors">
						<Bookmark className="w-5 h-5" />
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
		</div>
	);
}
