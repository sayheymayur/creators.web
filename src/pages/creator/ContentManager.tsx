import { useState } from 'react';
import { Plus, Lock, Unlock, Trash2, Pin, Eye, Heart, Image, Type } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { Modal } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { useCurrentCreator } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import { mockCreators } from '../../data/users';
import type { Post } from '../../types';

export function ContentManager() {
	const creator = useCurrentCreator();
	const { state: contentState, addPost, deletePost, updatePost } = useContent();
	const { showToast } = useNotifications();
	const [showNewPost, setShowNewPost] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

	const [newPostText, setNewPostText] = useState('');
	const [newPostType, setNewPostType] = useState<'text' | 'image'>('text');
	const [newPostLocked, setNewPostLocked] = useState(false);
	const [newPostPPV, setNewPostPPV] = useState(false);
	const [newPostPrice, setNewPostPrice] = useState('4.99');
	const [newPostImageUrl, setNewPostImageUrl] = useState('');
	const [isPosting, setIsPosting] = useState(false);

	const creatorData = creator ?? mockCreators[0];
	const myPosts = contentState.posts.filter(p => p.creatorId === creatorData.id);

	function handleCreatePost() {
		if (!newPostText.trim()) {
			showToast('Post text is required', 'error');
			return;
		}
		setIsPosting(true);
		const post: Post = {
			id: `post-${Date.now()}`,
			creatorId: creatorData.id,
			creatorName: creatorData.name,
			creatorAvatar: creatorData.avatar,
			creatorUsername: creatorData.username,
			type: newPostType,
			text: newPostText,
			mediaUrl: newPostType === 'image' ?
				(newPostImageUrl ||
					'https://images.pexels.com/photos/3076509/pexels-photo-3076509.jpeg?auto=compress&cs=tinysrgb&w=800') :
				undefined,
			isLocked: newPostLocked || newPostPPV,
			isPPV: newPostPPV,
			ppvPrice: newPostPPV ? parseFloat(newPostPrice) || 4.99 : undefined,
			likes: 0,
			likedBy: [],
			comments: [],
			createdAt: new Date().toISOString(),
			isPinned: false,
			unlockedBy: [],
		};
		addPost(post);
		showToast('Post published!');
		setShowNewPost(false);
		setNewPostText('');
		setNewPostImageUrl('');
		setNewPostLocked(false);
		setNewPostPPV(false);
		setIsPosting(false);
	}

	function handleDelete(postId: string) {
		deletePost(postId);
		setDeleteConfirm(null);
		showToast('Post deleted');
	}

	function handleToggleLock(post: Post) {
		updatePost({ id: post.id, isLocked: !post.isLocked });
		showToast(post.isLocked ? 'Post unlocked' : 'Post locked');
	}

	function handleTogglePin(post: Post) {
		updatePost({ id: post.id, isPinned: !post.isPinned });
		showToast(post.isPinned ? 'Post unpinned' : 'Post pinned to top');
	}

	return (
		<Layout>
			<div className="max-w-4xl mx-auto px-4 py-6">
				<div className="flex items-center justify-between mb-6">
					<div>
						<h1 className="text-xl font-bold text-foreground">Content Manager</h1>
						<p className="text-muted text-sm">{myPosts.length} posts</p>
					</div>
					<Button
						variant="primary"
						onClick={() => setShowNewPost(true)}
						leftIcon={<Plus className="w-4 h-4" />}
					>
						New Post
					</Button>
				</div>

				{myPosts.length === 0 ? (
					<div className="text-center py-16 bg-surface border border-border/20 rounded-2xl">
						<Image className="w-10 h-10 text-muted/50 mx-auto mb-3" />
						<p className="text-muted mb-4">No posts yet. Create your first post!</p>
						<Button variant="primary" onClick={() => setShowNewPost(true)} leftIcon={<Plus className="w-4 h-4" />}>
							Create Post
						</Button>
					</div>
				) : (
					<div className="space-y-3">
						{myPosts.map(post => (
							<div key={post.id} className="bg-surface border border-border/20 rounded-2xl p-4">
								<div className="flex gap-3">
									{post.mediaUrl ? (
										<img src={post.mediaUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
									) : (
										<div className="w-16 h-16 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
											<Type className="w-5 h-5 text-muted/60" />
										</div>
									)}
									<div className="flex-1 min-w-0">
										<div className="flex items-start justify-between gap-2 mb-1">
											<p className="text-sm text-foreground/80 line-clamp-2">{post.text}</p>
											<div className="flex gap-1 shrink-0">
												<button
													onClick={() => handleTogglePin(post)}
													className={`p-1.5 rounded-lg transition-colors ${post.isPinned ? 'text-amber-400 bg-amber-400/10' : 'text-muted hover:text-foreground hover:bg-foreground/10'}`}
													title={post.isPinned ? 'Unpin' : 'Pin'}
												>
													<Pin className="w-3.5 h-3.5" />
												</button>
												<button
													onClick={() => handleToggleLock(post)}
													className={`p-1.5 rounded-lg transition-colors ${post.isLocked ? 'text-rose-400 bg-rose-400/10' : 'text-muted hover:text-foreground hover:bg-foreground/10'}`}
													title={post.isLocked ? 'Unlock' : 'Lock'}
												>
													{post.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
												</button>
												<button
													onClick={() => setDeleteConfirm(post.id)}
													className="p-1.5 rounded-lg text-muted hover:text-rose-500 hover:bg-rose-400/10 transition-colors"
													title="Delete"
												>
													<Trash2 className="w-3.5 h-3.5" />
												</button>
											</div>
										</div>
										<div className="flex items-center gap-3 flex-wrap">
											<span className="flex items-center gap-1 text-xs text-muted/80">
												<Heart className="w-3 h-3" /> {post.likes}
											</span>
											<span className="flex items-center gap-1 text-xs text-muted/80">
												<Eye className="w-3 h-3" /> {post.comments.length} comments
											</span>
											{post.isLocked && !post.isPPV && (
												<span className="text-[10px] bg-rose-500/15 text-rose-400 px-2 py-0.5 rounded-full">Subscribers only</span>
											)}
											{post.isPPV && (
												<span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">PPV ${post.ppvPrice}</span>
											)}
											{post.isPinned && (
												<span className="text-[10px] bg-foreground/10 text-muted px-2 py-0.5 rounded-full">Pinned</span>
											)}
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<Modal isOpen={showNewPost} onClose={() => setShowNewPost(false)} title="Create New Post" maxWidth="max-w-lg">
				<div className="p-5 space-y-4">
					<div className="flex gap-2">
						{(['text', 'image'] as const).map(t => (
							<button
								key={t}
								onClick={() => setNewPostType(t)}
								className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all ${
									newPostType === t ? 'bg-rose-500 text-white' : 'bg-foreground/5 text-muted hover:bg-foreground/10'
								}`}
							>
								{t === 'text' ? <Type className="w-4 h-4" /> : <Image className="w-4 h-4" />}
								{t.charAt(0).toUpperCase() + t.slice(1)}
							</button>
						))}
					</div>

					<textarea
						value={newPostText}
						onChange={e => setNewPostText(e.target.value)}
						placeholder="Write your post..."
						rows={4}
						className="w-full bg-input border border-border/20 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 resize-none"
					/>

					{newPostType === 'image' && (
						<input
							value={newPostImageUrl}
							onChange={e => setNewPostImageUrl(e.target.value)}
							placeholder="Image URL (or leave blank for default)"
							className="w-full bg-input border border-border/20 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						/>
					)}

					<div className="space-y-2">
						<label className="flex items-center justify-between cursor-pointer">
							<div>
								<p className="text-sm font-medium text-foreground">Lock for subscribers</p>
								<p className="text-xs text-muted">Only subscribers can view this</p>
							</div>
							<div
								onClick={() => { setNewPostLocked(v => !v); if (!newPostLocked) setNewPostPPV(false); }}
								className={`w-10 h-5.5 rounded-full transition-all relative ${newPostLocked ? 'bg-rose-500' : 'bg-white/20'}`}
								style={{ height: '22px' }}
							>
								<div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${newPostLocked ? 'left-5' : 'left-0.5'}`} />
							</div>
						</label>

						<label className="flex items-center justify-between cursor-pointer">
							<div>
								<p className="text-sm font-medium text-foreground">Pay-per-view (PPV)</p>
								<p className="text-xs text-muted">Set a one-time unlock price</p>
							</div>
							<div
								onClick={() => { setNewPostPPV(v => !v); if (!newPostPPV) setNewPostLocked(true); }}
								className={`w-10 rounded-full transition-all relative ${newPostPPV ? 'bg-amber-500' : 'bg-white/20'}`}
								style={{ height: '22px' }}
							>
								<div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${newPostPPV ? 'left-5' : 'left-0.5'}`} />
							</div>
						</label>

						{newPostPPV && (
							<div className="flex items-center gap-2">
								<span className="text-muted text-sm">$</span>
								<input
									value={newPostPrice}
									onChange={e => setNewPostPrice(e.target.value)}
									placeholder="4.99"
									className="flex-1 bg-input border border-border/20 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
								/>
							</div>
						)}
					</div>

					<Button variant="primary" fullWidth isLoading={isPosting} onClick={handleCreatePost}>
						Publish Post
					</Button>
				</div>
			</Modal>

			<Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Post">
				<div className="p-5">
					<p className="text-muted text-sm mb-4">Are you sure you want to delete this post? This action cannot be undone.</p>
					<div className="flex gap-2">
						<button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-foreground/5 hover:bg-foreground/10 text-foreground py-2.5 rounded-xl text-sm font-medium transition-colors">
							Cancel
						</button>
						<button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} className="flex-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 py-2.5 rounded-xl text-sm font-semibold transition-colors">
							Delete
						</button>
					</div>
				</div>
			</Modal>
		</Layout>
	);
}
