import { useNavigate } from 'react-router-dom';
import { Star, Shield, Zap, Users, TrendingUp, Lock, Play, ArrowRight, CheckCircle, Sun, Moon } from '../components/icons';
import { mockCreators } from '../data/users';
import { useDragScroll } from '../hooks/useDragScroll';
import { useTheme } from '../context/ThemeContext';

export function Landing() {
	const navigate = useNavigate();
	const featuredRef = useDragScroll();
	const { mode, toggle } = useTheme();

	function scrollFeatured(direction: 'left' | 'right') {
		const container = featuredRef.current;
		if (!container) return;
		const card = container.querySelector<HTMLElement>('button[data-featured-card]');
		const baseWidth = card?.offsetWidth || 240;
		const amount = baseWidth * (direction === 'right' ? 1 : -1);
		container.scrollBy({ left: amount, behavior: 'smooth' });
	}

	return (
		<div className="min-h-screen bg-background text-foreground overflow-x-hidden">
			<nav className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/10">
				<div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-7 h-7 bg-rose-500 rounded-lg flex items-center justify-center">
							<span className="text-white font-black text-sm">cw</span>
						</div>
						<span className="font-bold text-foreground">creators.web</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => { toggle(); }}
							aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
							className="p-2 rounded-xl hover:bg-foreground/10 transition-colors"
						>
							{mode === 'dark' ? <Sun className="w-5 h-5 text-muted" /> : <Moon className="w-5 h-5 text-muted" />}
						</button>
						<button
							onClick={() => { void navigate('/login'); }}
							className="text-sm text-muted hover:text-foreground px-3 py-1.5 rounded-lg transition-colors"
						>
							Sign In
						</button>
						<button
							onClick={() => { void navigate('/register'); }}
							className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-4 py-1.5 rounded-xl transition-all active:scale-95"
						>
							Get Started
						</button>
					</div>
				</div>
			</nav>

			<section className="relative min-h-screen flex items-center pt-14">
				<div className="absolute inset-0 overflow-hidden">
					<div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-rose-500/10 rounded-full blur-[120px]" />
					<div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-rose-800/10 rounded-full blur-[80px]" />
				</div>

				<div className="relative max-w-6xl mx-auto px-4 py-20 text-center">
					<div className="inline-flex items-center gap-2 bg-foreground/5 border border-border/20 rounded-full px-4 py-1.5 mb-6">
						<Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
						<span className="text-xs text-foreground/80 font-medium">The #1 Creator Monetization Platform</span>
					</div>

					<h1 className="text-4xl sm:text-6xl md:text-7xl font-black mb-6 leading-[1.05]">
						Create. Share.
						<br />
						<span className="text-rose-400">Earn from your content.</span>
					</h1>

					<p className="text-base sm:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
						Build a loyal audience, offer subscriptions and tips,
						and manage your content in a single platform.
					</p>

					<div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
						<button
							onClick={() => { void navigate('/register'); }}
							className="flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-bold px-8 py-3.5 rounded-2xl transition-all active:scale-95 shadow-2xl shadow-rose-500/30 text-base"
						>
							Create account
							<ArrowRight className="w-4 h-4" />
						</button>
						<button
							onClick={() => { void navigate('/explore'); }}
							className="flex items-center justify-center gap-2 bg-foreground/10 hover:bg-foreground/15 text-foreground font-semibold px-8 py-3.5 rounded-2xl transition-all text-base"
						>
							<Play className="w-4 h-4" />
							Explore Creators
						</button>
					</div>

					<div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
						{[
							{ value: '50K+', label: 'Creators' },
							{ value: '$2M+', label: 'Paid Out' },
							{ value: '1M+', label: 'Fans' },
						].map(stat => (
							<div key={stat.label} className="text-center">
								<p className="text-2xl font-black text-foreground">{stat.value}</p>
								<p className="text-xs text-muted">{stat.label}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="py-16 px-4">
				<div className="max-w-6xl mx-auto">
					<div className="text-center mb-6 md:mb-8">
						<h2 className="text-2xl sm:text-3xl font-bold mb-2">Featured Creators</h2>
						<p className="text-muted text-sm">Browse a selection of highlighted creators</p>
					</div>
					<div className="relative space-y-3 md:space-y-4">
						<div
							ref={featuredRef}
							className="flex gap-3 md:gap-4 overflow-x-auto pb-2 md:pb-4 scrollbar-hide -mx-4 px-4"
						>
							{mockCreators.slice(0, 8).map(creator => (
								<button
									type="button"
									key={creator.id}
									data-featured-card
									onClick={() => { void navigate('/explore'); }}
									className="bg-surface border border-border/20 rounded-2xl overflow-hidden cursor-pointer hover:border-rose-500/30 transition-all group flex-shrink-0 w-44 sm:w-52 md:w-60"
								>
									<div className="relative h-28 sm:h-32 md:h-40">
										<img src={creator.banner} alt="" className="w-full h-full object-cover" />
										<div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface" />
									</div>
									<div className="px-3 pb-3 pt-2">
										<div className="flex items-center gap-2 mb-1.5">
											<img
												src={creator.avatar}
												alt={creator.name}
												className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-full border-2 border-surface object-cover"
											/>
											<div className="min-w-0">
												<p className="text-sm md:text-base font-semibold text-foreground truncate group-hover:text-rose-500 transition-colors">
													{creator.name}
												</p>
												<p className="text-[11px] md:text-xs text-muted truncate">{creator.category}</p>
											</div>
										</div>
										<p className="text-[11px] md:text-xs text-rose-400 font-semibold mt-1">
											${creator.subscriptionPrice}/month
										</p>
									</div>
								</button>
							))}
						</div>
						<div className="flex justify-center gap-3 md:gap-4">
							<button
								type="button"
								onClick={() => scrollFeatured('left')}
								className="px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-border/20 bg-foreground/5 text-xs md:text-sm text-muted hover:bg-foreground/10 hover:text-foreground transition-colors"
								aria-label="Scroll featured creators left"
							>
								←
							</button>
							<button
								type="button"
								onClick={() => scrollFeatured('right')}
								className="px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-border/20 bg-foreground/5 text-xs md:text-sm text-muted hover:bg-foreground/10 hover:text-foreground transition-colors"
								aria-label="Scroll featured creators right"
							>
								→
							</button>
						</div>
					</div>
				</div>
			</section>

			<section className="py-16 px-4 bg-surface">
				<div className="max-w-4xl mx-auto">
					<div className="text-center mb-12">
						<h2 className="text-2xl sm:text-3xl font-bold mb-2">Everything you need</h2>
						<p className="text-muted">Built for creators, loved by fans</p>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{[
							{ icon: Lock, title: 'Paywalled Content', desc: 'Lock exclusive content behind subscriptions or one-time payments' },
							{ icon: Zap, title: 'Instant Tips', desc: 'Fans can send tips directly to show appreciation' },
							{ icon: Users, title: 'Direct Messaging', desc: 'Real-time 1:1 chat with your entire fanbase' },
							{ icon: TrendingUp, title: 'Earnings Dashboard', desc: 'Track your monthly earnings, tips, and growth in real-time' },
							{ icon: Shield, title: 'Verified Creators', desc: 'KYC verification builds trust with your audience' },
							{ icon: Star, title: 'PPV Content', desc: 'Set custom pay-per-view prices for premium content' },
						].map(({ icon: Icon, title, desc }) => (
							<div key={title} className="bg-surface2 border border-border/20 rounded-2xl p-5">
								<div className="w-10 h-10 bg-rose-500/15 rounded-xl flex items-center justify-center mb-3">
									<Icon className="w-5 h-5 text-rose-400" />
								</div>
								<h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
								<p className="text-sm text-muted leading-relaxed">{desc}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="py-16 px-4">
				<div className="max-w-2xl mx-auto text-center">
					<h2 className="text-2xl sm:text-3xl font-bold mb-3">Demo access</h2>
					<p className="text-muted mb-8 text-sm">Explore the demo environment. No credit card required.</p>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
						{[
							{ role: 'Fan', email: 'fan@demo.com', desc: 'Browse, subscribe, tip', color: 'border-blue-500/30 bg-blue-500/5' },
							{ role: 'Creator', email: 'creator@demo.com', desc: 'Dashboard, earnings, posts', color: 'border-rose-500/30 bg-rose-500/5' },
							{ role: 'Admin', email: 'admin@demo.com', desc: 'Full platform control', color: 'border-emerald-500/30 bg-emerald-500/5' },
						].map(({ role, email, desc, color }) => (
							<div key={role} className={`border ${color} rounded-xl p-4 text-left`}>
								<div className="flex items-center gap-1.5 mb-2">
									<CheckCircle className="w-4 h-4 text-emerald-400" />
									<span className="text-sm font-semibold text-foreground">{role} Account</span>
								</div>
								<p className="text-xs text-muted mb-1">{email}</p>
								<p className="text-xs text-muted/80">Password: demo123 (demo only)</p>
								<p className="text-xs text-muted mt-2">{desc}</p>
							</div>
						))}
					</div>
					<button
						onClick={() => { void navigate('/login'); }}
						className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-10 py-3.5 rounded-2xl transition-all active:scale-95 shadow-xl shadow-rose-500/25 text-base"
					>
						Sign in to demo
					</button>
				</div>
			</section>

			<footer className="border-t border-border/10 py-8 px-4">
				<div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<div className="w-6 h-6 bg-rose-500 rounded-lg flex items-center justify-center">
							<span className="text-white font-black text-[10px]">cw</span>
						</div>
						<span className="text-sm font-bold text-foreground">creators.web</span>
					</div>
					<p className="text-xs text-muted/80">© 2026 creators.web. All rights reserved. 18+ only.</p>
				</div>
			</footer>
		</div>
	);
}
