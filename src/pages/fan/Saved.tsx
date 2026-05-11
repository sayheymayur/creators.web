import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { PostCard } from '../../components/ui/PostCard';
import { useContent } from '../../context/ContentContext';

export function Saved() {
	const navigate = useNavigate();
	const { state, loadSavedFeed } = useContent();
	const { savedFeedPosts, savedFeedNextCursor, postsWsStatus } = state;

	useEffect(() => {
		if (postsWsStatus !== 'ready') return;
		void loadSavedFeed(true);
	}, [loadSavedFeed, postsWsStatus]);

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<div className="flex items-center gap-2 mb-5">
					<Bookmark className="w-4 h-4 text-rose-400" />
					<h1 className="font-semibold text-foreground">Saved posts</h1>
				</div>

				{postsWsStatus !== 'ready' ? (
					<p className="text-sm text-muted text-center py-12">Connecting…</p>
				) : savedFeedPosts.length === 0 ? (
					<div className="text-center py-16">
						<div className="w-14 h-14 bg-foreground/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
							<Bookmark className="w-6 h-6 text-muted/60" />
						</div>
						<p className="text-muted font-medium mb-1">Nothing saved yet</p>
						<p className="text-sm text-muted/80 mb-4">Bookmark posts from your feed to see them here.</p>
						<button
							type="button"
							onClick={() => { void navigate('/feed'); }}
							className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-6 py-2 rounded-xl transition-colors"
						>
							Go to feed
						</button>
					</div>
				) : (
					<>
						<div className="space-y-4">
							{savedFeedPosts.map(post => (
								<PostCard key={post.id} post={post} />
							))}
						</div>
						{savedFeedNextCursor ? (
							<div className="pt-4 flex justify-center">
								<button
									type="button"
									onClick={() => { void loadSavedFeed(false); }}
									className="text-sm font-medium text-rose-400 hover:text-rose-300 px-4 py-2 rounded-xl border border-border/30 hover:bg-foreground/5 transition-colors"
								>
									Load more
								</button>
							</div>
						) : null}
					</>
				)}
			</div>
		</Layout>
	);
}
