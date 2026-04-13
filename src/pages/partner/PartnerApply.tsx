import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, User, ArrowRight } from '../../components/icons';
import { useTheme } from '../../context/ThemeContext';

export function PartnerApply() {
	const navigate = useNavigate();
	const { mode } = useTheme();
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [contactNumber, setContactNumber] = useState('');

	const submitClass =
		mode === 'dark' ?
			'bg-foreground text-background hover:bg-foreground/90' :
			'bg-rose-500 hover:bg-rose-600 text-white';

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		// Frontend-only for now (no navigation / API).
		void Promise.resolve();
	}

	return (
		<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-8">
			<div className="w-full max-w-md">
				<button type="button" onClick={() => { void navigate('/'); }} className="flex items-center gap-2 mb-8">
					<div className="w-8 h-8 bg-rose-500 rounded-xl flex items-center justify-center">
						<span className="text-white font-black text-sm">cw</span>
					</div>
					<span className="font-bold text-foreground text-lg">creators.web</span>
				</button>

				<div className="bg-surface border border-border/20 rounded-2xl p-6">
					<h1 className="text-2xl font-bold text-foreground mb-1">Become a Partner</h1>
					<p className="text-muted text-sm mb-6">
						Share your details and our team will reach out.
					</p>

					<form onSubmit={onSubmit} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-muted mb-1.5">Name</label>
							<div className="relative">
								<User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
								<input
									type="text"
									value={name}
									onChange={e => setName(e.target.value)}
									placeholder="Your name"
									required
									className="w-full bg-input border border-border/20 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 transition-colors"
								/>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-muted mb-1.5">Email</label>
							<div className="relative">
								<Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
								<input
									type="email"
									value={email}
									onChange={e => setEmail(e.target.value)}
									placeholder="your@email.com"
									required
									className="w-full bg-input border border-border/20 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 transition-colors"
								/>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-muted mb-1.5">Contact number</label>
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-medium">
									+91
								</span>
								<input
									type="tel"
									value={contactNumber}
									onChange={e => setContactNumber(e.target.value)}
									placeholder="9876543210"
									inputMode="numeric"
									autoComplete="tel"
									required
									className="w-full bg-input border border-border/20 rounded-xl pl-14 pr-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 transition-colors"
								/>
							</div>
						</div>

						<button
							type="submit"
							className={`${submitClass} w-full flex items-center justify-center gap-2 font-bold px-6 py-3 rounded-2xl transition-all active:scale-95`}
						>
							Submit
							<ArrowRight className="w-4 h-4" />
						</button>

						<p className="text-xs text-muted text-center">
							By submitting, you agree to be contacted by our team.
						</p>
					</form>
				</div>
			</div>
		</div>
	);
}
