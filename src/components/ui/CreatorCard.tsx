import { Users, Star, Zap } from '../icons';
import { useNavigate } from 'react-router-dom';
import type { Creator } from '../../types';
import { formatINR } from '../../services/razorpay';

interface CreatorCardProps {
	creator: Creator;
}

const categoryColors: Record<string, string> = {
	Fitness: 'bg-emerald-500/20 text-emerald-400',
	Art: 'bg-purple-500/20 text-purple-400',
	Tech: 'bg-blue-500/20 text-blue-400',
	Travel: 'bg-amber-500/20 text-amber-400',
	Music: 'bg-rose-500/20 text-rose-400',
	Food: 'bg-orange-500/20 text-orange-400',
	Gaming: 'bg-cyan-500/20 text-cyan-400',
};

export function CreatorCard({ creator }: CreatorCardProps) {
	const navigate = useNavigate();
	const categoryColor = categoryColors[creator.category] ?? 'bg-foreground/10 text-muted';

	return (
		<div
			onClick={() => { void navigate(`/creator/${creator.id}`); }}
			className="bg-surface border border-border/20 rounded-2xl overflow-hidden cursor-pointer hover:border-rose-500/30 hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-300 group"
		>
			<div className="relative h-24">
				<img src={creator.banner} alt="" className="w-full h-full object-cover" />
				<div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface" />
				{creator.isOnline && (
					<div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
						LIVE
					</div>
				)}
			</div>

			<div className="px-3 pb-4">
				<div className="flex items-end gap-2 -mt-5 mb-2">
					<div className="relative">
						<img
							src={creator.avatar}
							alt={creator.name}
							className="w-10 h-10 rounded-full border-2 border-surface object-cover"
						/>
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-semibold text-foreground truncate group-hover:text-rose-500 transition-colors">
							{creator.name}
						</p>
						<p className="text-xs text-muted truncate">@{creator.username}</p>
					</div>
				</div>

				<div className="flex items-center gap-1.5 mb-2">
					<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${categoryColor}`}>
						{creator.category}
					</span>
					{creator.isKYCVerified && (
						<Star className="w-3 h-3 text-amber-400 fill-amber-400" />
					)}
				</div>

				<p className="text-xs text-muted/90 line-clamp-2 mb-3">{creator.bio}</p>

				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1 text-muted/90">
						<Users className="w-3.5 h-3.5" />
						<span className="text-xs">{creator.subscriberCount.toLocaleString()}</span>
					</div>
					<div className="flex items-center gap-1 text-amber-400">
						<Zap className="w-3.5 h-3.5 fill-amber-400" />
						<span className="text-xs font-semibold">{formatINR(creator.subscriptionPrice)}/mo</span>
					</div>
				</div>
			</div>
		</div>
	);
}
