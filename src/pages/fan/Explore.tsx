import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, TrendingUp, Star, Users, Eye } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { CreatorCard } from '../../components/ui/CreatorCard';
import { mockCreators } from '../../data/users';
import { useLiveStream } from '../../context/LiveStreamContext';

const CATEGORIES = ['All', 'Fitness', 'Art', 'Tech', 'Travel', 'Music', 'Food', 'Gaming'];

export function Explore() {
	const navigate = useNavigate();
	const [search, setSearch] = useState('');
	const [category, setCategory] = useState('All');
	const [sortBy, setSortBy] = useState<'popular' | 'new' | 'price'>('popular');
	const { getLiveStreams } = useLiveStream();
	const liveStreams = getLiveStreams();

	const approvedCreators = mockCreators.filter(c => c.isKYCVerified);

	const filtered = approvedCreators
		.filter(c => {
			const matchesSearch = !search ||
				c.name.toLowerCase().includes(search.toLowerCase()) ||
				c.username.toLowerCase().includes(search.toLowerCase()) ||
				c.bio.toLowerCase().includes(search.toLowerCase());
			const matchesCategory = category === 'All' || c.category === category;
			return matchesSearch && matchesCategory;
		})
		.sort((a, b) => {
			if (sortBy === 'popular') return b.subscriberCount - a.subscriberCount;
			if (sortBy === 'new') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
			return a.subscriptionPrice - b.subscriptionPrice;
		});

	const trendingCreators = approvedCreators.slice(0, 3);

	return (
		<Layout>
			<div className="max-w-6xl mx-auto px-4 py-6">
				<div className="mb-6">
					<div className="relative mb-4">
						<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
						<input
							value={search}
							onChange={e => setSearch(e.target.value)}
							placeholder="Search creators by name, category..."
							className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/30 transition-colors"
						/>
					</div>

					<div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
						{CATEGORIES.map(cat => (
							<button
								key={cat}
								onClick={() => setCategory(cat)}
								className={`shrink-0 text-sm px-3 py-1.5 rounded-xl font-medium transition-all ${
									category === cat ? 'bg-rose-500 text-white' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
								}`}
							>
								{cat}
							</button>
						))}
					</div>
				</div>

				{!search && category === 'All' && liveStreams.length > 0 && (
					<div className="mb-8">
						<div className="flex items-center gap-2 mb-4">
							<div className="flex items-center gap-1.5 bg-rose-500 rounded-lg px-2 py-0.5">
								<div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
								<span className="text-white text-[10px] font-bold">LIVE</span>
							</div>
							<h2 className="font-semibold text-white text-sm">Live Now</h2>
						</div>
					<div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 mb-8">
						{liveStreams.map(stream => (
							<button
								key={stream.id}
								onClick={() => navigate(`/live/${stream.id}`)}
								className="relative bg-[#161616] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all group flex-shrink-0 w-64 sm:w-72"
							>
								<div className="relative h-28">
									<img src={stream.creatorAvatar} alt={stream.creatorName} className="w-full h-full object-cover scale-105 blur-sm brightness-50" />
									<div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
									<div className="absolute top-2 left-2 flex items-center gap-1.5 bg-rose-500 rounded-lg px-2 py-0.5">
										<div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
										<span className="text-white text-[10px] font-bold">LIVE</span>
									</div>
									<div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 rounded-lg px-2 py-0.5">
										<Eye className="w-3 h-3 text-white/70" />
										<span className="text-white text-[10px] font-semibold">{stream.viewerCount.toLocaleString()}</span>
									</div>
									<div className="absolute bottom-2 left-2 flex items-center gap-1.5">
										<img src={stream.creatorAvatar} alt="" className="w-6 h-6 rounded-full object-cover border border-white/20" />
										<span className="text-white text-xs font-semibold">{stream.creatorName}</span>
									</div>
								</div>
								<div className="px-3 py-2.5">
									<p className="text-white/70 text-xs truncate">{stream.title}</p>
								</div>
							</button>
						))}
					</div>
					</div>
				)}

				{!search && category === 'All' && (
					<div className="mb-8">
						<div className="flex items-center gap-2 mb-4">
							<TrendingUp className="w-4 h-4 text-rose-400" />
							<h2 className="font-semibold text-white text-sm">Trending Now</h2>
						</div>
					<div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
						{trendingCreators.map((creator, idx) => (
							<div key={creator.id} className="relative flex-shrink-0 w-56 sm:w-64 md:w-72">
								{idx === 0 && (
									<div className="absolute -top-2 -right-2 z-10 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
										<Star className="w-2.5 h-2.5 fill-white" />
										#1 Trending
									</div>
								)}
								<CreatorCard creator={creator} />
							</div>
						))}
					</div>
					</div>
				)}

				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-1.5 text-white/50 text-sm">
						<Users className="w-4 h-4" />
						<span>{filtered.length} creator{filtered.length !== 1 ? 's' : ''}</span>
					</div>
					<div className="flex items-center gap-2">
						<SlidersHorizontal className="w-4 h-4 text-white/30" />
						<select
							value={sortBy}
							onChange={e => setSortBy(e.target.value as typeof sortBy)}
							className="bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white/70 focus:outline-none [color-scheme:dark]"
						>
							<option value="popular">Most Popular</option>
							<option value="new">Newest</option>
							<option value="price">Lowest Price</option>
						</select>
					</div>
				</div>

				{filtered.length === 0 ? (
					<div className="text-center py-16">
						<Search className="w-10 h-10 text-white/10 mx-auto mb-3" />
						<p className="text-white/30">No creators found</p>
					</div>
				) : (
					<div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
						{filtered.map(creator => (
							<div key={creator.id} className="flex-shrink-0 w-48 sm:w-56 md:w-64">
								<CreatorCard creator={creator} />
							</div>
						))}
					</div>
				)}
			</div>
		</Layout>
	);
}
