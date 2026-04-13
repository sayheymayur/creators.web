import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { Eye, EyeOff, Mail, Lock, ChevronRight, Zap } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { DEMO_ACCOUNTS } from '../../data/users';

export function Login() {
	const navigate = useNavigate();
	const { login, loginWithGoogle, state } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	function handleLogin(e: React.FormEvent) {
		e.preventDefault();
		setIsLoading(true);
		void login(email, password).then(success => {
			setIsLoading(false);
			if (success) {
				const role = email.toLowerCase() === DEMO_ACCOUNTS.admin.email ? 'admin' :
					email.toLowerCase() === DEMO_ACCOUNTS.creator.email ? 'creator' : 'fan';
				void navigate(role === 'admin' ? '/admin' : role === 'creator' ? '/creator-dashboard' : '/feed');
			}
		});
	}

	function fillDemo(type: 'fan' | 'creator') {
		setEmail(DEMO_ACCOUNTS[type].email);
		setPassword(DEMO_ACCOUNTS[type].password);
	}

	function handleGoogleLogin() {
		setIsLoading(true);
		void loginWithGoogle('fan').then(user => {
			setIsLoading(false);
			if (user) {
				void navigate(user.role === 'admin' ? '/admin' : user.role === 'creator' ? '/creator-dashboard' : '/feed');
			}
		});
	}

	return (
		<div className="min-h-screen bg-background text-foreground flex">
			<div className="hidden lg:flex flex-1 relative overflow-hidden">
				<img
					src="https://images.pexels.com/photos/3756766/pexels-photo-3756766.jpeg?auto=compress&cs=tinysrgb&w=1200"
					alt=""
					className="w-full h-full object-cover"
				/>
				<div className="absolute inset-0 bg-gradient-to-r from-transparent to-background" />
				<div className="absolute inset-0 bg-overlay/40" />
				<div className="absolute bottom-10 left-10">
					<h2 className="text-3xl font-black text-white mb-2">Join Millions of<br />Creators & Fans</h2>
					<p className="text-white/70">Premium content. Direct connections.</p>
				</div>
			</div>

			<div className="flex-1 flex items-center justify-center px-4 py-8">
				<div className="w-full max-w-sm">
					<button type="button" onClick={() => { void navigate('/'); }} className="flex items-center gap-2 mb-8">
						<div className="w-8 h-8 bg-rose-500 rounded-xl flex items-center justify-center">
							<span className="text-white font-black text-sm">cw</span>
						</div>
						<span className="font-bold text-foreground text-lg">creators.web</span>
					</button>

					<h1 className="text-2xl font-bold text-foreground mb-1">Welcome back</h1>
					<p className="text-muted text-sm mb-6">Sign in to your account</p>

					<div className="mb-5">
						<p className="text-xs text-muted font-medium mb-2 uppercase tracking-wide">Quick Demo Login</p>
						<div className="grid grid-cols-2 gap-2">
							{(['fan', 'creator'] as const).map(type => (
								<button
									key={type}
									onClick={() => fillDemo(type)}
									className="bg-foreground/5 hover:bg-foreground/10 border border-border/20 rounded-xl py-2 text-xs font-semibold text-muted hover:text-foreground transition-all capitalize"
								>
									<Zap className="w-3 h-3 inline mr-1 text-amber-400" />
									{type}
								</button>
							))}
						</div>
					</div>

					<div className="flex items-center gap-3 mb-5">
						<div className="flex-1 h-px bg-border/40" />
						<span className="text-xs text-muted">or sign in with email</span>
						<div className="flex-1 h-px bg-border/40" />
					</div>

					<form
						onSubmit={e => { handleLogin(e); }}
						className="space-y-4"
					>
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
									placeholder="••••••••"
									required
									className="w-full bg-input border border-border/20 rounded-xl pl-10 pr-10 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 transition-colors"
								/>
								<button
									type="button"
									onClick={() => setShowPassword(v => !v)}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
								>
									{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
								</button>
							</div>
						</div>

						{state.loginError && (
							<p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
								{state.loginError}
							</p>
						)}

						<Button variant="primary" fullWidth size="lg" type="submit" isLoading={isLoading}>
							Sign In
							<ChevronRight className="w-4 h-4" />
						</Button>
					</form>

					<div className="my-4 flex items-center gap-3">
						<div className="flex-1 h-px bg-border/40" />
						<span className="text-xs text-muted">or</span>
						<div className="flex-1 h-px bg-border/40" />
					</div>

					<button
						type="button"
						onClick={handleGoogleLogin}
						disabled={isLoading}
						className="w-full flex items-center justify-center gap-2 bg-foreground/5 hover:bg-foreground/10 border border-border/20 rounded-xl py-3 text-sm font-medium text-muted hover:text-foreground transition-all disabled:opacity-70"
					>
						<FcGoogle className="w-4 h-4" />
						Continue with Google
					</button>

					<p className="text-center text-sm text-muted mt-5">
						Don't have an account?{' '}
						<Link to="/register" className="text-rose-400 hover:text-rose-300 font-medium">
							Sign up
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
