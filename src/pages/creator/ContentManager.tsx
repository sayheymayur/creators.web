import { useEffect, useMemo, useState } from 'react';
import { Plus, Lock, Trash2, Image, Type, MessageCircle, Sparkles } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { Modal } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { useAuth, useCurrentCreator } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import { mockCreators } from '../../data/users';
import { uploadPostMediaFile } from '../../services/uploadPostMedia';
import { formatINR } from '../../services/razorpay';
import { PostCard } from '../../components/ui/PostCard';
import { RichTextarea } from '../../components/ui/RichTextarea';

export function ContentManager() {
	const creator = useCurrentCreator();
	const { state: contentState, createPost, deletePost, loadCreatorPosts } = useContent();
	const { showToast } = useNotifications();
	const { state: authState } = useAuth();
	const [showNewPost, setShowNewPost] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

	const [newPostText, setNewPostText] = useState('');
	const [newPostType, setNewPostType] = useState<'text' | 'image'>('text');
	const [newPostLocked, setNewPostLocked] = useState(false);
	const [newPostPPV, setNewPostPPV] = useState(false);
	const [newPostPrice, setNewPostPrice] = useState('4.99');
	const [remoteMediaFile, setRemoteMediaFile] = useState<File | null>(null);
	const [isPosting, setIsPosting] = useState(false);
	const [uploadError, setUploadError] = useState<string>('');

	const authedCreatorId = authState.user?.id ?? '';
	const creatorData = creator ?? (authState.user?.role === 'creator' ? {
		...mockCreators[0],
		id: authState.user.id,
		name: authState.user.name,
		email: authState.user.email,
		username: authState.user.username,
		avatar: authState.user.avatar,
	} : mockCreators[0]);
	const myPosts = contentState.posts.filter(p =>
		String(p.creatorId) === String(authedCreatorId || creatorData.id)
	);
	const totalLikes = useMemo(() => myPosts.reduce((s, p) => s + (p.likes ?? 0), 0), [myPosts]);
	const totalComments = useMemo(() => myPosts.reduce((s, p) => s + Math.max(p.commentCount ?? 0, p.comments?.length ?? 0), 0), [myPosts]);

	useEffect(() => {
		// Wait until the WebSocket is ready before fetching — calling loadCreatorPosts
		// while the WS client is still connecting returns silently with no data.
		if (contentState.postsWsStatus !== 'ready') return;
		const id = authedCreatorId || creatorData.id;
		if (!id) return;
		void loadCreatorPosts(id, true);
	}, [authedCreatorId, creatorData.id, loadCreatorPosts, contentState.postsWsStatus]);

	function handleCreatePost() {
		const text = newPostText.trim();

		if (!text && !remoteMediaFile) {
			showToast('Add text or upload media', 'error');
			return;
		}

		setIsPosting(true);
		setUploadError('');
		const uploadStep = remoteMediaFile ?
			uploadPostMediaFile(
				remoteMediaFile,
				remoteMediaFile.type.startsWith('video/') ? 'post_video' : 'post_image'
			) :
			Promise.resolve(null);

		void uploadStep
			.then(assetId => {
				const assetIds = assetId ? [assetId] : [];
				const visibility = newPostPPV ? 'ppv' : newPostLocked ? 'subscribers' : 'public';
				const ppvUsdCents = newPostPPV ? Math.round((parseFloat(newPostPrice) || 4.99) * 100) : undefined;
				return createPost({
					visibility,
					text,
					assetIds: assetIds.length ? assetIds : undefined,
					ppvUsdCents,
				});
			})
			.then(() => {
				showToast('Post published!');
				setShowNewPost(false);
				setNewPostText('');
				setRemoteMediaFile(null);
				setNewPostLocked(false);
				setNewPostPPV(false);
				setUploadError('');
			})
			.catch(e => {
				// Avoid showing raw URLs/tokens from upload errors in UI.
				if (e instanceof Error && e.message.includes('Upload failed')) {
					const statusMatch = /HTTP\s+(\d{3})/.exec(e.message);
					const status = statusMatch ? Number(statusMatch[1]) : null;
					const hint =
						status === 500 ?
							'Upload server error (500). The upload service may be down or misconfigured.' :
							status ?
								`Upload failed (${status}).` :
								'Upload failed.';
					setUploadError(`${hint} Please try again.`);
					return;
				}
				showToast(e instanceof Error ? e.message : 'Could not create post', 'error');
			})
			.finally(() => {
				setIsPosting(false);
			});
	}

	function handleDelete(postId: string) {
		void deletePost(postId)
			.then(() => {
				setDeleteConfirm(null);
				showToast('Post deleted');
			})
			.catch(() => {
				showToast('Could not delete post', 'error');
			});
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

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
					<div className="bg-surface border border-border/20 rounded-2xl p-4">
						<p className="text-xs text-muted mb-1">Total likes</p>
						<p className="text-lg font-bold text-foreground">{totalLikes.toLocaleString()}</p>
					</div>
					<div className="bg-surface border border-border/20 rounded-2xl p-4">
						<p className="text-xs text-muted mb-1">Total comments</p>
						<p className="text-lg font-bold text-foreground">{totalComments.toLocaleString()}</p>
					</div>
					<div className="bg-surface border border-border/20 rounded-2xl p-4">
						<p className="text-xs text-muted mb-1">Tips & earnings</p>
						<p className="text-sm text-muted">See breakdown in Earnings.</p>
					</div>
				</div>

				{myPosts.length === 0 ? (
					<div className="text-center py-16 bg-surface border border-border/20 rounded-2xl">
						<Sparkles className="w-10 h-10 text-muted/50 mx-auto mb-3" />
						<p className="text-muted mb-1">No posts yet</p>
						<p className="text-xs text-muted/80 mb-4">Create your first post and start engaging with fans.</p>
						<Button variant="primary" onClick={() => setShowNewPost(true)} leftIcon={<Plus className="w-4 h-4" />}>
							Create Post
						</Button>
					</div>
				) : (
					<div className="space-y-4">
						{myPosts.map(post => (
							<div key={post.id} className="space-y-2">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 flex-wrap">
										{post.isLocked && !post.isPPV && (
											<span className="text-[10px] bg-rose-500/15 text-rose-400 px-2 py-0.5 rounded-full flex items-center gap-1">
												<Lock className="w-3 h-3" /> Subscribers
											</span>
										)}
										{post.isPPV && (
											<span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
												PPV {formatINR(post.ppvPrice ?? 0)}
											</span>
										)}
										<span className="text-[10px] bg-foreground/10 text-muted px-2 py-0.5 rounded-full flex items-center gap-1">
											<MessageCircle className="w-3 h-3" />
											{Math.max(post.commentCount ?? 0, post.comments?.length ?? 0)} comments
										</span>
									</div>
									<div className="flex gap-1">
										<button
											onClick={() => setDeleteConfirm(post.id)}
											className="p-1.5 rounded-lg text-muted hover:text-rose-500 hover:bg-rose-400/10 transition-colors"
											title="Delete"
										>
											<Trash2 className="w-3.5 h-3.5" />
										</button>
									</div>
								</div>

								<PostCard post={post} showCreatorLink={false} />
							</div>
						))}
					</div>
				)}
			</div>

			<Modal isOpen={showNewPost} onClose={() => setShowNewPost(false)} title="Create New Post" maxWidth="max-w-lg">
				<div className="p-5 space-y-4">
					{uploadError && (
						<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-200 flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="font-semibold">Upload failed</p>
								<p className="text-xs text-rose-100/80 mt-1 break-words">{uploadError}</p>
							</div>
							<button
								type="button"
								onClick={() => { if (!isPosting) handleCreatePost(); }}
								className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30"
							>
								Try again
							</button>
						</div>
					)}
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

					<RichTextarea
						value={newPostText}
						onChange={setNewPostText}
						placeholder="Write your post..."
						rows={4}
						className="w-full bg-input border border-border/20 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 resize-none"
					/>

					{newPostType === 'image' && (
						<div>
							<label className="block text-xs text-muted mb-1">Image or video file</label>
							<input
								type="file"
								accept="image/*,video/*"
								onChange={e => { setRemoteMediaFile(e.target.files?.[0] ?? null); setUploadError(''); }}
								className="w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-foreground/10 file:text-foreground"
							/>
							{remoteMediaFile && (
								<p className="text-xs text-muted mt-1 truncate">{remoteMediaFile.name}</p>
							)}
						</div>
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
								<span className="text-muted text-sm">₹</span>
								<input
									value={newPostPrice}
									onChange={e => setNewPostPrice(e.target.value)}
									placeholder="4.99"
									className="flex-1 bg-input border border-border/20 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
								/>
							</div>
						)}
					</div>

					<Button variant="primary" fullWidth isLoading={isPosting} onClick={() => { handleCreatePost(); }}>
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
						<button onClick={() => { if (deleteConfirm) handleDelete(deleteConfirm); }} className="flex-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 py-2.5 rounded-xl text-sm font-semibold transition-colors">
							Delete
						</button>
					</div>
				</div>
			</Modal>
		</Layout>
	);
}
