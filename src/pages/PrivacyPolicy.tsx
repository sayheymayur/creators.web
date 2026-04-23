import { useNavigate } from 'react-router-dom';
import { Moon, Sun } from '../components/icons';
import { useTheme } from '../context/ThemeContext';

export function PrivacyPolicy() {
	const navigate = useNavigate();
	const { mode, toggle } = useTheme();

	return (
		<div className="min-h-screen bg-background text-foreground">
			<nav className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/10">
				<div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
					<button
						type="button"
						onClick={() => { void navigate('/'); }}
						className="flex items-center gap-2"
						aria-label="Go to home"
					>
						<div className="w-7 h-7 bg-rose-500 rounded-lg flex items-center justify-center">
							<span className="text-white font-black text-sm">cw</span>
						</div>
						<span className="font-bold text-foreground">creators.web</span>
					</button>

					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={e => { toggle(e); }}
							aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
							className="p-2 rounded-xl hover:bg-foreground/10 transition-colors"
						>
							{mode === 'dark' ? <Sun className="w-5 h-5 text-muted" /> : <Moon className="w-5 h-5 text-muted" />}
						</button>
						<button
							type="button"
							onClick={() => { void navigate('/login'); }}
							className="text-sm text-muted hover:text-foreground px-3 py-1.5 rounded-lg transition-colors"
						>
							Sign In
						</button>
					</div>
				</div>
			</nav>

			<main className="px-4 py-12">
				<div className="max-w-3xl mx-auto">
					<div className="mb-8">
						<h1 className="text-3xl sm:text-4xl font-black mb-3">Privacy Policy</h1>
						<p className="text-sm text-muted">Last updated: Apr 22, 2026</p>
					</div>

					<div className="space-y-4">
						<section className="bg-surface border border-border/20 rounded-2xl p-5">
							<h2 className="text-base font-semibold mb-2">Overview</h2>
							<p className="text-sm text-muted leading-relaxed">
								This is a placeholder Privacy Policy page. Replace this content with your legal text before production.
							</p>
						</section>

						<section className="bg-surface border border-border/20 rounded-2xl p-5">
							<h2 className="text-base font-semibold mb-2">What we collect</h2>
							<ul className="list-disc pl-5 text-sm text-muted space-y-1">
								<li>Account information you provide (e.g., email, profile details).</li>
								<li>Usage and device data to keep the platform secure and reliable.</li>
								<li>Payment-related metadata when applicable (processed by payment providers).</li>
							</ul>
						</section>

						<section className="bg-surface border border-border/20 rounded-2xl p-5">
							<h2 className="text-base font-semibold mb-2">How we use data</h2>
							<ul className="list-disc pl-5 text-sm text-muted space-y-1">
								<li>Operate and improve the service.</li>
								<li>Provide support and communicate important updates.</li>
								<li>Prevent fraud and enforce platform safety.</li>
							</ul>
						</section>

						<section className="bg-surface border border-border/20 rounded-2xl p-5">
							<h2 className="text-base font-semibold mb-2">Contact</h2>
							<p className="text-sm text-muted leading-relaxed">
								Questions about privacy? Contact us at <a className="text-rose-400 hover:text-rose-300 transition-colors" href="mailto:support@creators.web">
									support@creators.web
								</a>.
							</p>
						</section>
					</div>
				</div>
			</main>
		</div>
	);
}
