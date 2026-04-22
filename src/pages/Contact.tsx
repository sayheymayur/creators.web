import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Moon, Sun, X } from '../components/icons';
import { useTheme } from '../context/ThemeContext';
import { ContactForm } from '../components/marketing/ContactForm';

export function Contact() {
	const navigate = useNavigate();
	const { mode, toggle } = useTheme();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<nav className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/10">
				<div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
					<button
						type="button"
						onClick={() => { void navigate('/'); }}
						className="flex items-center gap-2 min-w-0"
						aria-label="Go to home"
					>
						<div className="w-7 h-7 bg-rose-500 rounded-lg flex items-center justify-center">
							<span className="text-white font-black text-sm">cw</span>
						</div>
						<span className="font-bold text-foreground truncate">creators.web</span>
					</button>

					<div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
						<button
							type="button"
							onClick={e => { toggle(e); }}
							aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
							className="p-2 rounded-xl hover:bg-foreground/10 transition-colors"
						>
							{mode === 'dark' ? <Sun className="w-5 h-5 text-muted" /> : <Moon className="w-5 h-5 text-muted" />}
						</button>

						<div className="hidden sm:flex items-center gap-2">
							<button
								type="button"
								onClick={() => { void navigate('/login'); }}
								className="text-sm text-muted hover:text-foreground px-3 py-1.5 rounded-lg transition-colors"
							>
								Sign In
							</button>
							<button
								type="button"
								onClick={() => { void navigate('/partner/apply'); }}
								className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-4 py-1.5 rounded-xl transition-all active:scale-95"
							>
								Become a Partner
							</button>
						</div>

						<div className="relative sm:hidden">
							<button
								type="button"
								onClick={() => { setMobileMenuOpen(v => !v); }}
								aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
								aria-expanded={mobileMenuOpen}
								className="p-2 rounded-xl hover:bg-foreground/10 transition-colors"
							>
								{mobileMenuOpen ? <X className="w-5 h-5 text-muted" /> : <Menu className="w-5 h-5 text-muted" />}
							</button>

							{mobileMenuOpen && (
								<div className="absolute right-0 top-full mt-2 w-56 bg-surface2 border border-border/20 rounded-2xl shadow-2xl p-2 z-50">
									<button
										type="button"
										onClick={() => { setMobileMenuOpen(false); void navigate('/login'); }}
										className="w-full text-left text-sm text-muted hover:text-foreground hover:bg-foreground/10 px-3 py-2 rounded-xl transition-colors"
									>
										Sign In
									</button>
									<button
										type="button"
										onClick={() => { setMobileMenuOpen(false); void navigate('/partner/apply'); }}
										className="bg-rose-500 hover:bg-rose-600 text-white w-full text-sm font-semibold px-3 py-2 rounded-xl transition-all active:scale-95 mt-1"
									>
										Become a Partner
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			</nav>

			<main className="px-4 py-12">
				<div className="max-w-6xl mx-auto">
					<div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10 items-start">
						<div className="lg:col-span-2">
							<h1 className="text-3xl sm:text-4xl font-black mb-3">Contact us</h1>
							<p className="text-sm sm:text-base text-muted leading-relaxed mb-6">
								Get help with your account, payouts, onboarding, or report a safety concern - choose a category and send us a message.
							</p>

							<div className="space-y-3">
								<div className="bg-surface border border-border/20 rounded-2xl p-5">
									<p className="text-sm font-semibold text-foreground mb-1.5">Email</p>
									<p className="text-sm text-muted">
										<a className="text-rose-400 hover:text-rose-300 transition-colors" href="mailto:support@creators.web">
											support@creators.web
										</a>
									</p>
									<p className="text-xs text-muted/80 mt-2">For general support, safety reports, and onboarding.</p>
								</div>
								<div className="bg-surface border border-border/20 rounded-2xl p-5">
									<p className="text-sm font-semibold text-foreground mb-1.5">Response time</p>
									<p className="text-sm text-muted">Usually within 24–48 hours</p>
									<p className="text-xs text-muted/80 mt-2">Business days (IST).</p>
								</div>
							</div>

							<div className="mt-6 flex flex-col sm:flex-row gap-3">
								<button
									type="button"
									onClick={() => { void navigate('/'); }}
									className="bg-foreground/10 hover:bg-foreground/15 text-foreground font-semibold px-6 py-3 rounded-2xl transition-all"
								>
									Back to home
								</button>
								<button
									type="button"
									onClick={() => { void navigate('/partner/apply'); }}
									className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-6 py-3 rounded-2xl transition-all active:scale-95 shadow-sm"
								>
									Apply to become a partner
								</button>
							</div>
						</div>

						<div className="lg:col-span-3">
							<ContactForm />
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
