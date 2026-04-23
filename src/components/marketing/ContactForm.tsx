import { useMemo, useState } from 'react';

type ContactReason = 'support' | 'partnership' | 'report';

export function ContactForm({ compact }: { compact?: boolean }) {
	const [reason, setReason] = useState<ContactReason>('support');
	const [fullName, setFullName] = useState('');
	const [email, setEmail] = useState('');
	const [message, setMessage] = useState('');
	const [accountEmail, setAccountEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [reportLink, setReportLink] = useState('');
	const [submitted, setSubmitted] = useState(false);

	const reasonMeta = useMemo(() => {
		const map: Record<ContactReason, { title: string, desc: string }> = {
			support: { title: 'Support', desc: 'Account, login, payouts' },
			partnership: { title: 'Partnership', desc: 'Creator onboarding' },
			report: { title: 'Report', desc: 'Safety & content issues' },
		};
		return map;
	}, []);

	const extraField = useMemo(() => {
		if (reason === 'support') {
			return (
				<div className="space-y-1.5">
					<label className="text-xs font-semibold text-foreground">Account email (if different)</label>
					<input
						type="email"
						value={accountEmail}
						onChange={e => setAccountEmail(e.target.value)}
						placeholder="name@example.com"
						className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
					/>
				</div>
			);
		}

		if (reason === 'partnership') {
			return (
				<div className="space-y-1.5">
					<label className="text-xs font-semibold text-foreground">Phone (WhatsApp)</label>
					<input
						type="tel"
						value={phone}
						onChange={e => setPhone(e.target.value)}
						placeholder="+91 90000 00000"
						className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
					/>
				</div>
			);
		}

		return (
			<div className="space-y-1.5">
				<label className="text-xs font-semibold text-foreground">Link to the content/profile (optional)</label>
				<input
					type="url"
					value={reportLink}
					onChange={e => setReportLink(e.target.value)}
					placeholder="https://…"
					className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
				/>
			</div>
		);
	}, [accountEmail, phone, reason, reportLink]);

	return (
		<div className={`bg-surface border border-border/20 rounded-3xl ${compact ? 'p-5' : 'p-6 sm:p-7'}`}>
			<div className="flex items-start justify-between gap-4 mb-5">
				<div>
					<p className="text-sm font-semibold text-foreground">Send a message</p>
					<p className="text-xs text-muted mt-1">We typically respond within 24–48 hours (business days).</p>
				</div>
				<a
					href="mailto:support@creators.web"
					className="text-xs text-rose-400 hover:text-rose-300 transition-colors whitespace-nowrap"
				>
					support@creators.web
				</a>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
				{(Object.keys(reasonMeta) as ContactReason[]).map(key => {
					const active = key === reason;
					return (
						<button
							key={key}
							type="button"
							onClick={() => setReason(key)}
							className={[
								'text-left rounded-2xl border px-4 py-3 transition-all',
								active ? 'border-rose-500/40 bg-rose-500/10' : 'border-border/20 bg-surface2 hover:bg-foreground/5',
							].join(' ')}
						>
							<p className="text-sm font-semibold text-foreground">{reasonMeta[key].title}</p>
							<p className="text-xs text-muted mt-0.5">{reasonMeta[key].desc}</p>
						</button>
					);
				})}
			</div>

			<form
				onSubmit={e => {
					e.preventDefault();
					setSubmitted(true);
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
							className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
						/>
					</div>
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-foreground">Email</label>
						<input
							type="email"
							required
							value={email}
							onChange={e => setEmail(e.target.value)}
							placeholder="name@example.com"
							className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
						/>
					</div>
				</div>

				{extraField}

				<div className="space-y-1.5">
					<label className="text-xs font-semibold text-foreground">Message</label>
					<textarea
						required
						value={message}
						onChange={e => setMessage(e.target.value)}
						placeholder="Tell us what you need help with…"
						rows={compact ? 4 : 5}
						className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-y"
					/>
				</div>

				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
					<p className="text-xs text-muted/80">
						By submitting you agree we may contact you about this request.
					</p>
					<button
						type="submit"
						className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-6 py-3 rounded-2xl transition-all active:scale-95 shadow-sm w-full sm:w-auto"
					>
						Submit
					</button>
				</div>

				{submitted ? (
					<div className="mt-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
						<p className="text-sm text-emerald-300/90">Thanks — we received your message.</p>
					</div>
				) : null}
			</form>
		</div>
	);
}
