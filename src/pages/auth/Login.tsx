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

	function fillDemo(type: keyof typeof DEMO_ACCOUNTS) {
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
		<div className="min-h-screen bg-[#0d0d0d] flex">
			<div className="hidden lg:flex flex-1 relative overflow-hidden">
				<img
					src="https://images.pexels.com/photos/3756766/pexels-photo-3756766.jpeg?auto=compress&cs=tinysrgb&w=1200"
					alt=""
					className="w-full h-full object-cover"
				/>
				<div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0d0d0d]" />
				<div className="absolute inset-0 bg-black/40" />
				<div className="absolute bottom-10 left-10">
					<h2 className="text-3xl font-black text-white mb-2">Join Millions of<br />Creators & Fans</h2>
					<p className="text-white/50">Premium content. Direct connections.</p>
				</div>
			</div>

			<div className="flex-1 flex items-center justify-center px-4 py-8">
				<div className="w-full max-w-sm">
					<button type="button" onClick={() => { void navigate('/'); }} className="flex items-center gap-2 mb-8">
						<div className="w-8 h-8 bg-rose-500 rounded-xl flex items-center justify-center">
							<span className="text-white font-black text-sm">cw</span>
						</div>
						<span className="font-bold text-white text-lg">creators.web</span>
					</button>

					<h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
					<p className="text-white/40 text-sm mb-6">Sign in to your account</p>

					<div className="mb-5">
						<p className="text-xs text-white/40 font-medium mb-2 uppercase tracking-wide">Quick Demo Login</p>
						<div className="grid grid-cols-3 gap-2">
							{(['fan', 'creator', 'admin'] as const).map(type => (
								<button
									key={type}
									onClick={() => fillDemo(type)}
									className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-2 text-xs font-semibold text-white/70 hover:text-white transition-all capitalize"
								>
									<Zap className="w-3 h-3 inline mr-1 text-amber-400" />
									{type}
								</button>
							))}
						</div>
					</div>

					<div className="flex items-center gap-3 mb-5">
						<div className="flex-1 h-px bg-white/10" />
						<span className="text-xs text-white/30">or sign in with email</span>
						<div className="flex-1 h-px bg-white/10" />
					</div>

					<form
						onSubmit={e => { handleLogin(e); }}
						className="space-y-4"
					>
						<div>
							<label className="block text-sm font-medium text-white/60 mb-1.5">Email</label>
							<div className="relative">
								<Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
								<input
									type="email"
									value={email}
									onChange={e => setEmail(e.target.value)}
									placeholder="your@email.com"
									required
									className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/50 transition-colors"
								/>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-white/60 mb-1.5">Password</label>
							<div className="relative">
								<Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
								<input
									type={showPassword ? 'text' : 'password'}
									value={password}
									onChange={e => setPassword(e.target.value)}
									placeholder="••••••••"
									required
									className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/50 transition-colors"
								/>
								<button
									type="button"
									onClick={() => setShowPassword(v => !v)}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
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
						<div className="flex-1 h-px bg-white/10" />
						<span className="text-xs text-white/30">or</span>
						<div className="flex-1 h-px bg-white/10" />
					</div>

					<button
						type="button"
						onClick={handleGoogleLogin}
						disabled={isLoading}
						className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 text-sm font-medium text-white/70 hover:text-white transition-all disabled:opacity-70"
					>
						<FcGoogle className="w-4 h-4" />
						Continue with Google
					</button>

					<p className="text-center text-sm text-white/40 mt-5">
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
