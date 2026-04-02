import { useState } from 'react';
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
	const { toggleLike, addComment, isSubscribed } = useContent();
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

	function handleLike() {
		if (!authState.user) { void navigate('/login'); return; }
		toggleLike(post.id, userId);
	}

	function handleComment(e: React.FormEvent) {
		e.preventDefault();
		if (!authState.user || !commentText.trim()) return;
		addComment(post.id, {
			id: `c-${Date.now()}`,
			userId,
			userName: authState.user.name,
			userAvatar: authState.user.avatar,
			text: commentText.trim(),
			createdAt: new Date().toISOString(),
			likes: 0,
		});
		setCommentText('');
		showToast('Comment posted!');
	}

	function handleCreatorClick() {
		if (showCreatorLink) navigate(`/creator/${post.creatorId}`);
	}

	return (
		<div className="bg-[#161616] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all duration-300">
			<div className="flex items-center justify-between px-4 pt-4 pb-3">
				<button type="button" onClick={handleCreatorClick} className="flex items-center gap-3 group">
					<Avatar src={post.creatorAvatar} alt={post.creatorName} size="md" />
					<div className="text-left">
						<p className="text-sm font-semibold text-white group-hover:text-rose-400 transition-colors">{post.creatorName}</p>
						<p className="text-xs text-white/40">@{post.creatorUsername} · {formatDistanceToNow(post.createdAt)}</p>
					</div>
				</button>
				<button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
					<MoreHorizontal className="w-4 h-4 text-white/40" />
				</button>
			</div>

			{post.text && (
				<p className="px-4 pb-3 text-sm text-white/80 leading-relaxed whitespace-pre-line line-clamp-4">{post.text}</p>
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
						<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
							<div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 text-center max-w-[220px]">
								<Lock className="w-8 h-8 text-rose-400 mx-auto mb-2" />
								{post.isPPV ? (
									<>
										<p className="text-white font-semibold text-sm mb-1">Pay-per-view</p>
										<p className="text-white/50 text-xs mb-3">Unlock this post for ${post.ppvPrice?.toFixed(2)}</p>
										<button
											onClick={() => setShowPPVModal(true)}
											className="w-full bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
										>
											Unlock for ${post.ppvPrice?.toFixed(2)}
										</button>
									</>
								) : (
									<>
										<p className="text-white font-semibold text-sm mb-1">Subscriber Only</p>
										<p className="text-white/50 text-xs mb-3">Subscribe to view this content</p>
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
						className={`flex items-center gap-1.5 group transition-all duration-200 ${isLiked ? 'text-rose-400' : 'text-white/40 hover:text-white/70'}`}
					>
						<Heart className={`w-5 h-5 transition-transform duration-200 group-active:scale-125 ${isLiked ? 'fill-rose-400' : ''}`} />
						<span className="text-xs font-medium">{post.likes.toLocaleString()}</span>
					</button>
					<button
						onClick={() => setShowComments(v => !v)}
						className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors"
					>
						<MessageCircle className="w-5 h-5" />
						<span className="text-xs font-medium">{post.comments.length}</span>
					</button>
					<button className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors">
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
					<button className="text-white/40 hover:text-white/70 transition-colors">
						<Bookmark className="w-5 h-5" />
					</button>
				</div>
			</div>

			{showComments && (
				<div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
					{post.comments.slice(0, 3).map(comment => (
						<div key={comment.id} className="flex gap-2">
							<Avatar src={comment.userAvatar} alt={comment.userName} size="xs" />
							<div className="bg-white/5 rounded-xl px-3 py-2 flex-1">
								<p className="text-xs font-semibold text-white/70">{comment.userName}</p>
								<p className="text-xs text-white/60 mt-0.5">{comment.text}</p>
							</div>
						</div>
					))}
					{authState.user && (
						<form onSubmit={handleComment} className="flex gap-2">
							<Avatar src={authState.user.avatar} alt={authState.user.name} size="xs" />
							<input
								value={commentText}
								onChange={e => setCommentText(e.target.value)}
								placeholder="Add a comment..."
								className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-rose-500/50"
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
