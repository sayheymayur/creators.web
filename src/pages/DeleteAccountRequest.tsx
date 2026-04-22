import { useMemo, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';

type RequestStatus = 'idle' | 'submitted';

export function DeleteAccountRequest() {
	const { state: authState } = useAuth();
	const user = authState.user;

	const [fullName, setFullName] = useState(user?.name ?? '');
	const [email, setEmail] = useState(user?.email ?? '');
	const [profileHint, setProfileHint] = useState('');
	const [phone, setPhone] = useState('');
	const [reason, setReason] = useState('');
	const [confirm, setConfirm] = useState(false);
	const [status, setStatus] = useState<RequestStatus>('idle');

	const roleLabel = useMemo(() => {
		if (!user) return 'account';
		if (user.role === 'creator') return 'creator account';
		if (user.role === 'fan') return 'fan account';
		return 'account';
	}, [user]);

	const disabled = status === 'submitted';

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<div className="mb-5">
					<h1 className="text-xl font-bold text-foreground">Delete account request</h1>
					<p className="text-sm text-muted mt-1">
						Send a request to delete your {roleLabel}. We may contact you to verify ownership.
					</p>
				</div>

				<div className="bg-surface border border-border/20 rounded-2xl p-5">
					<form
						onSubmit={e => {
							e.preventDefault();
							setStatus('submitted');
						}}
						className="space-y-4"
					>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div className="space-y-1.5">
								<label className="text-xs font-semibold text-foreground">Full name</label>
								<input
									type="text"
									required
									value={fullName}
									onChange={e => setFullName(e.target.value)}
									placeholder="Your name"
									disabled={disabled}
									className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
								/>
							</div>
							<div className="space-y-1.5">
								<label className="text-xs font-semibold text-foreground">Login email</label>
								<input
									type="email"
									required
									value={email}
									onChange={e => setEmail(e.target.value)}
									placeholder="name@example.com"
									disabled={disabled}
									className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
								/>
							</div>
						</div>

						<div className="space-y-1.5">
							<label className="text-xs font-semibold text-foreground">Username or profile link (optional)</label>
							<input
								type="text"
								value={profileHint}
								onChange={e => setProfileHint(e.target.value)}
								placeholder="@username or https://…"
								disabled={disabled}
								className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
							/>
						</div>

						<div className="space-y-1.5">
							<label className="text-xs font-semibold text-foreground">Phone (optional)</label>
							<input
								type="tel"
								value={phone}
								onChange={e => setPhone(e.target.value)}
								placeholder="+91 90000 00000"
								disabled={disabled}
								className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
							/>
						</div>

						<div className="space-y-1.5">
							<label className="text-xs font-semibold text-foreground">Reason for deletion</label>
							<textarea
								required
								value={reason}
								onChange={e => setReason(e.target.value)}
								placeholder="Tell us why you want to delete the account…"
								rows={5}
								disabled={disabled}
								className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-y disabled:opacity-60"
							/>
						</div>

						<label className="flex items-start gap-2 text-xs text-muted select-none">
							<input
								type="checkbox"
								required
								checked={confirm}
								onChange={e => setConfirm(e.target.checked)}
								disabled={disabled}
								className="mt-0.5"
							/>
							<span>
								I understand this is a request and may take 24–48 hours (business days). We may ask for verification to confirm it’s my account.
							</span>
						</label>

						<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
							<p className="text-xs text-muted/80 sm:flex-1">
								After submitting, please also email{' '}
								<a className="text-rose-400 hover:text-rose-300 transition-colors" href="mailto:support@creators.web">
									support@creators.web
								</a>{' '}
								from your login email if we need to confirm ownership.
							</p>
							<button
								type="submit"
								disabled={disabled}
								className="bg-rose-500 hover:bg-rose-600 disabled:hover:bg-rose-500 disabled:opacity-60 text-white font-bold px-6 py-3 rounded-2xl transition-all active:scale-95 shadow-sm w-full sm:w-auto shrink-0 whitespace-nowrap"
							>
								Submit request
							</button>
						</div>

						{status === 'submitted' ? (
							<div className="mt-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
								<p className="text-sm text-emerald-300/90">
									Thanks — we received your request. Our team will follow up within 24–48 hours (business days).
								</p>
								<p className="text-xs text-muted mt-2">
									Reference details: {fullName.trim() || '—'} · {email.trim() || '—'}{profileHint.trim() ? ` · ${profileHint.trim()}` : ''}
								</p>
							</div>
						) : null}
					</form>
				</div>
			</div>
		</Layout>
	);
}
