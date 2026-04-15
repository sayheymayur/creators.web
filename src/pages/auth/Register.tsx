import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { User, Mail, Lock, Eye, EyeOff, Camera, Video, ArrowRight } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { delayMs } from '../../utils/delay';

export function Register() {
	const navigate = useNavigate();
	const { register, loginWithGoogle, state } = useAuth();
	const [step, setStep] = useState<1 | 2>(1);
	const [role, setRole] = useState<'fan' | 'creator'>('fan');
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	function handleContinue(e: React.FormEvent) {
		e.preventDefault();
		if (step === 1) { setStep(2); return; }
		setIsLoading(true);
		void delayMs(150).then(() =>
			register(email, password, name, role).then(success => {
				setIsLoading(false);
				if (!success) return;
				void navigate(role === 'creator' ? '/creator-dashboard' : '/feed');
			})
		);
	}


	
	function handleGoogleSignup() {
		setIsLoading(true);
		void loginWithGoogle(role).then(user => {
			setIsLoading(false);
			if (user) {
				void navigate(user.role === 'admin' ? '/admin' : user.role === 'creator' ? '/creator-dashboard' : '/feed');
			}
		});
	}

	return (
		<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-8">
			<div className="w-full max-w-sm">
				<button type="button" onClick={() => { void navigate('/'); }} className="flex items-center gap-2 mb-8">
					<div className="w-8 h-8 bg-rose-500 rounded-xl flex items-center justify-center">
						<span className="text-white font-black text-sm">cw</span>
					</div>
					<span className="font-bold text-foreground text-lg">creators.web</span>
				</button>

				<div className="flex items-center gap-2 mb-6">
					{[1, 2].map(s => (
						<div key={s} className={`flex-1 h-1 rounded-full transition-all ${s <= step ? 'bg-rose-500' : 'bg-foreground/10'}`} />
					))}
				</div>

				<h1 className="text-2xl font-bold text-foreground mb-1">
					{step === 1 ? 'Join creators.web' : 'Create your account'}
				</h1>
				<p className="text-muted text-sm mb-6">
					{step === 1 ? 'Choose how you want to use the platform' : 'Fill in your details below'}
				</p>

				{step === 1 ? (
					<div className="space-y-3">
						{[
							{
								type: 'fan' as const,
								icon: Video,
								title: 'I\'m a Fan',
								desc: 'Discover and support your favorite creators',
								features: ['Browse exclusive content', 'Subscribe to creators', 'Send tips & messages'],
							},
							{
								type: 'creator' as const,
								icon: Camera,
								title: 'I\'m a Creator',
								desc: 'Monetize your content and grow your fanbase',
								features: ['Earn from subscriptions', 'PPV & tip income', 'Direct fan messaging'],
							},
						].map(({ type, icon: Icon, title, desc, features }) => (
							<button
								key={type}
								onClick={() => setRole(type)}
								className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
									role === type ? 'border-rose-500 bg-rose-500/10' : 'border-border/20 bg-foreground/5 hover:border-border/30'
								}`}
							>
								<div className="flex items-start gap-3">
									<div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${role === type ? 'bg-rose-500/20' : 'bg-foreground/10'}`}>
										<Icon className={`w-5 h-5 ${role === type ? 'text-rose-400' : 'text-muted'}`} />
									</div>
									<div>
										<p className={`font-semibold text-sm mb-0.5 ${role === type ? 'text-foreground' : 'text-foreground/80'}`}>{title}</p>
										<p className="text-xs text-muted mb-2">{desc}</p>
										<div className="space-y-0.5">
											{features.map(f => (
												<p key={f} className="text-xs text-muted/90 flex items-center gap-1.5">
													<span className="w-1 h-1 bg-rose-500/50 rounded-full" />
													{f}
												</p>
											))}
										</div>
									</div>
								</div>
							</button>
						))}
						<Button variant="primary" fullWidth size="lg" onClick={() => setStep(2)}>
							Continue as {role === 'fan' ? 'Fan' : 'Creator'}
							<ArrowRight className="w-4 h-4" />
						</Button>
						<div className="my-3 flex items-center gap-3">
							<div className="flex-1 h-px bg-border/40" />
							<span className="text-xs text-muted">or</span>
							<div className="flex-1 h-px bg-border/40" />
						</div>
						<button
							type="button"
							onClick={handleGoogleSignup}
							disabled={isLoading}
							className="w-full flex items-center justify-center gap-2 bg-foreground/5 hover:bg-foreground/10 border border-border/20 rounded-xl py-3 text-sm font-medium text-muted hover:text-foreground transition-all disabled:opacity-70"
						>
							<FcGoogle className="w-4 h-4" />
							Continue with Google
						</button>
						{state.loginError && (
							<p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
								{state.loginError}
							</p>
						)}
					</div>
				) : (
					<form
						onSubmit={e => { handleContinue(e); }}
						className="space-y-4"
					>
						<div>
							<label className="block text-sm font-medium text-muted mb-1.5">Full Name</label>
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
							<label className="block text-sm font-medium text-muted mb-1.5">Password</label>
							<div className="relative">
								<Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
								<input
									type={showPassword ? 'text' : 'password'}
									value={password}
									onChange={e => setPassword(e.target.value)}
									placeholder="Min 8 characters"
									minLength={8}
									required
									className="w-full bg-input border border-border/20 rounded-xl pl-10 pr-10 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 transition-colors"
								/>
								<button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
									{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
								</button>
							</div>
						</div>
						<p className="text-xs text-muted">
							By signing up you agree to our{' '}
							<span className="text-rose-400 cursor-pointer">Terms of Service</span>{' '}
							and confirm you are 18+.
						</p>
						{state.loginError && (
							<p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
								{state.loginError}
							</p>
						)}
						<Button variant="primary" fullWidth size="lg" type="submit" isLoading={isLoading}>
							Send Verification Code
							<ArrowRight className="w-4 h-4" />
						</Button>
						<button
							type="button"
							onClick={() => { handleGoogleSignup(); }}
							disabled={isLoading}
							className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 text-sm font-medium text-white/70 hover:text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
						>
							<FcGoogle className="w-4 h-4" />
							Continue with Google
						</button>
						<button type="button" onClick={() => setStep(1)} className="w-full text-center text-sm text-white/30 hover:text-white/50 transition-colors">
							Back
						</button>
					</form>
				)}

				<p className="text-center text-sm text-muted mt-5">
					Already have an account?{' '}
					<Link to="/login" className="text-rose-400 hover:text-rose-300 font-medium">Sign in</Link>
				</p>
			</div>
		</div>
	);
}
