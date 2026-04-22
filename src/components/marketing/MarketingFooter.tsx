import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function MarketingFooter() {
	const navigate = useNavigate();
	const location = useLocation();

	const goToContact = useCallback(() => {
		const scroll = () => {
			const el = document.getElementById('contact');
			if (!el) return;
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		};

		if (location.pathname === '/') {
			scroll();
			return;
		}

		void navigate('/');
		window.setTimeout(scroll, 0);
	}, [location.pathname, navigate]);

	return (
		<footer className="border-t border-border/10 py-10 px-4">
			<div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
				<div>
					<div className="flex items-center gap-2 mb-2">
						<div className="w-7 h-7 bg-rose-500 rounded-lg flex items-center justify-center">
							<span className="text-white font-black text-sm">cw</span>
						</div>
						<span className="text-sm font-bold text-foreground">creators.web</span>
					</div>
					<p className="text-xs text-muted/80 leading-relaxed max-w-xs">
						A creator monetization platform for subscriptions, tips, and direct messaging.
					</p>
				</div>

				<div>
					<p className="text-sm font-semibold text-foreground mb-3">Company</p>
					<ul className="space-y-2 text-sm">
						<li>
							<button
								type="button"
								onClick={goToContact}
								className="text-muted hover:text-foreground transition-colors"
							>
								Contact
							</button>
						</li>
						<li>
							<button
								type="button"
								onClick={() => { void navigate('/privacy-policy'); }}
								className="text-muted hover:text-foreground transition-colors"
							>
								Privacy Policy
							</button>
						</li>
						<li>
							<button
								type="button"
								onClick={() => { void navigate('/delete-account-request'); }}
								className="text-muted hover:text-foreground transition-colors"
							>
								Delete account request
							</button>
						</li>
					</ul>
				</div>

				<div>
					<p className="text-sm font-semibold text-foreground mb-3">Get started</p>
					<ul className="space-y-2 text-sm">
						<li>
							<button
								type="button"
								onClick={() => { void navigate('/login'); }}
								className="text-muted hover:text-foreground transition-colors"
							>
								Sign In
							</button>
						</li>
						<li>
							<button
								type="button"
								onClick={() => { void navigate('/partner/apply'); }}
								className="text-muted hover:text-foreground transition-colors"
							>
								Become a Partner
							</button>
						</li>
					</ul>
				</div>

				<div className="lg:text-right">
					<p className="text-xs text-muted/80 mt-6 lg:mt-0">© 2026 creators.web. All rights reserved. 18+ only.</p>
				</div>
			</div>
		</footer>
	);
}
