import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Zap, Users } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { PostCard } from '../../components/ui/PostCard';
import { useContent } from '../../context/ContentContext';
import { mockCreators } from '../../data/users';
import { useDragScroll } from '../../hooks/useDragScroll';

export function Feed() {
	const { state: contentState, isSubscribed } = useContent();
	const navigate = useNavigate();
	const [filter, setFilter] = useState<'all' | 'subscribed'>('all');
	const followingRef = useDragScroll();

	const posts = contentState.posts.filter(p => {
		if (filter === 'subscribed') return isSubscribed(p.creatorId);
		return true;
	});

	const subscribedCreators = mockCreators.filter(c => isSubscribed(c.id));

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				{subscribedCreators.length > 0 && (
					<div className="mb-6">
						<p className="text-xs text-white/30 font-medium uppercase tracking-wider mb-3">Following</p>
						<div ref={followingRef} className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
							{subscribedCreators.map(creator => (
								<button
									key={creator.id}
									onClick={() => { void navigate(`/creator/${creator.id}`); }}
									className="flex flex-col items-center gap-1 shrink-0"
								>
									<div className="relative">
										<div className={`w-14 h-14 rounded-full p-0.5 ${creator.isOnline ? 'bg-gradient-to-tr from-rose-500 to-amber-400' : 'bg-white/10'}`}>
											<img
												src={creator.avatar}
												alt={creator.name}
												className="w-full h-full rounded-full object-cover border-2 border-[#0d0d0d]"
											/>
										</div>
										{creator.isOnline && (
											<div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#0d0d0d] rounded-full" />
										)}
									</div>
									<p className="text-[10px] text-white/50 w-14 text-center truncate">{creator.name.split(' ')[0]}</p>
								</button>
							))}
						</div>
					</div>
				)}

				<div className="flex items-center justify-between mb-5">
					<div className="flex items-center gap-2">
						<Sparkles className="w-4 h-4 text-rose-400" />
						<h1 className="font-semibold text-white">Your Feed</h1>
					</div>
					<div className="flex gap-1 bg-white/5 p-0.5 rounded-xl">
						<button
							onClick={() => setFilter('all')}
							className={`text-xs px-3 py-1 rounded-lg transition-all ${filter === 'all' ? 'bg-white/10 text-white' : 'text-white/40'}`}
						>
							All
						</button>
						<button
							onClick={() => setFilter('subscribed')}
							className={`text-xs px-3 py-1 rounded-lg transition-all ${filter === 'subscribed' ? 'bg-white/10 text-white' : 'text-white/40'}`}
						>
							Subscribed
						</button>
					</div>
				</div>

				{posts.length === 0 ? (
					<div className="text-center py-16">
						<div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
							<Users className="w-6 h-6 text-white/20" />
						</div>
						<p className="text-white/40 font-medium mb-1">No posts yet</p>
						<p className="text-sm text-white/25 mb-4">Subscribe to creators to see their content here</p>
						<button
							onClick={() => { void navigate('/explore'); }}
							className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-6 py-2 rounded-xl transition-colors"
						>
							<Zap className="w-4 h-4 inline mr-1.5" />
							Explore Creators
						</button>
					</div>
				) : (
					<div className="space-y-4">
						{posts.map(post => (
							<PostCard key={post.id} post={post} />
						))}
					</div>
				)}
			</div>
		</Layout>
	);
}
