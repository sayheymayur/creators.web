import { useMemo, useRef, useState } from 'react';
import { CheckCircle, Trash2, Upload, XCircle } from '../icons';

const MAX_FILES = 5;
const MAX_BYTES_PER_FILE = 50 * 1024 * 1024; // 50MB

const ACCEPT_ATTR = 'image/*,video/*,audio/*,.pdf,.zip';
const EXTRA_ALLOWED_EXT = ['pdf', 'zip'] as const;

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	const gb = mb / 1024;
	return `${gb.toFixed(2)} GB`;
}

function isAllowedFile(file: File) {
	if (file.type.startsWith('image/')) return true;
	if (file.type.startsWith('video/')) return true;
	if (file.type.startsWith('audio/')) return true;
	const ext = file.name.split('.').pop()?.toLowerCase();
	return !!ext && (EXTRA_ALLOWED_EXT as readonly string[]).includes(ext);
}

type CreatorApplyPayload = {
	fullName: string,
	email: string,
	phone: string,
	category: string,
	location: string,
	bio: string,
	instagram: string,
	youtube: string,
	portfolio: string,
	files: File[],
	consent: boolean,
};

export function CreatorApplyForm({ compact }: { compact?: boolean }) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const [fullName, setFullName] = useState('');
	const [email, setEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [category, setCategory] = useState('');
	const [location, setLocation] = useState('');
	const [bio, setBio] = useState('');
	const [instagram, setInstagram] = useState('');
	const [youtube, setYoutube] = useState('');
	const [portfolio, setPortfolio] = useState('');
	const [files, setFiles] = useState<File[]>([]);
	const [consent, setConsent] = useState(false);

	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);
	const [receipt, setReceipt] = useState<CreatorApplyPayload | null>(null);

	const canAddMore = files.length < MAX_FILES;

	const uploadHint = useMemo(() => {
		return `Up to ${MAX_FILES} files, ${formatBytes(MAX_BYTES_PER_FILE)} each. Supported: photo, video, audio, PDF, ZIP.`;
	}, []);

	function openFilePicker() {
		if (!canAddMore) return;
		fileInputRef.current?.click();
	}

	function onPickFiles(newFiles: FileList | null) {
		setError(null);
		if (!newFiles || newFiles.length === 0) return;

		const next = [...files];
		for (const f of Array.from(newFiles)) {
			if (next.length >= MAX_FILES) {
				setError(`You can upload up to ${MAX_FILES} files.`);
				break;
			}
			if (!isAllowedFile(f)) {
				setError(`Unsupported file: ${f.name}. Please upload photo/video/audio, or PDF/ZIP.`);
				continue;
			}
			if (f.size > MAX_BYTES_PER_FILE) {
				setError(`File too large: ${f.name} (${formatBytes(f.size)}). Max ${formatBytes(MAX_BYTES_PER_FILE)} per file.`);
				continue;
			}
			next.push(f);
		}

		setFiles(next);
		// allow selecting the same file again after removing
		if (fileInputRef.current) fileInputRef.current.value = '';
	}

	function removeFileAt(idx: number) {
		setError(null);
		setFiles(prev => prev.filter((_, i) => i !== idx));
	}

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);

		if (!consent) {
			setError('Please confirm the consent checkbox to submit.');
			return;
		}

		const payload: CreatorApplyPayload = {
			fullName,
			email,
			phone,
			category,
			location,
			bio,
			instagram,
			youtube,
			portfolio,
			files,
			consent,
		};

		// Frontend-only for now (no API / uploads yet).
		setReceipt(payload);
		setSubmitted(true);
	}

	const submitDisabled =
		!fullName.trim() ||
		!email.trim() ||
		!phone.trim() ||
		!category.trim() ||
		!location.trim() ||
		!bio.trim() ||
		!consent;

	if (submitted && receipt) {
		return (
			<div className={`bg-surface border border-border/20 rounded-3xl ${compact ? 'p-5' : 'p-6 sm:p-7'}`}>
				<div className="flex items-start gap-3">
					<div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
						<CheckCircle className="w-5 h-5 text-emerald-400" />
					</div>
					<div className="min-w-0">
						<p className="text-sm font-semibold text-foreground">Application received</p>
						<p className="text-xs text-muted mt-1 leading-relaxed">
							This is a demo submission (frontend-only). Your media isn’t uploaded anywhere yet, but the form is ready to connect to an API later.
						</p>
					</div>
				</div>

				<div className="mt-5 rounded-2xl border border-border/20 bg-surface2 p-4">
					<p className="text-xs font-semibold text-foreground mb-2">Summary</p>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted">
						<div>
							<p className="text-foreground/80 font-semibold">Name</p>
							<p className="truncate">{receipt.fullName}</p>
						</div>
						<div>
							<p className="text-foreground/80 font-semibold">Email</p>
							<p className="truncate">{receipt.email}</p>
						</div>
						<div>
							<p className="text-foreground/80 font-semibold">WhatsApp/Phone</p>
							<p className="truncate">{receipt.phone}</p>
						</div>
						<div>
							<p className="text-foreground/80 font-semibold">Category</p>
							<p className="truncate">{receipt.category}</p>
						</div>
						<div className="sm:col-span-2">
							<p className="text-foreground/80 font-semibold">Location</p>
							<p className="truncate">{receipt.location}</p>
						</div>
						<div className="sm:col-span-2">
							<p className="text-foreground/80 font-semibold">Media files</p>
							{receipt.files.length ? (
								<ul className="mt-1 space-y-1">
									{receipt.files.map(f => (
										<li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-3">
											<span className="truncate">{f.name}</span>
											<span className="shrink-0 text-muted/80">{formatBytes(f.size)}</span>
										</li>
									))}
								</ul>
							) : (
								<p className="text-muted/80 mt-1">No media uploaded.</p>
							)}
						</div>
					</div>
				</div>

				<div className="mt-5 flex flex-col sm:flex-row gap-3">
					<button
						type="button"
						onClick={() => {
							setSubmitted(false);
							setReceipt(null);
							setError(null);
							setFullName('');
							setEmail('');
							setPhone('');
							setCategory('');
							setLocation('');
							setBio('');
							setInstagram('');
							setYoutube('');
							setPortfolio('');
							setFiles([]);
							setConsent(false);
						}}
						className="bg-foreground/10 hover:bg-foreground/15 text-foreground font-semibold px-6 py-3 rounded-2xl transition-all w-full sm:w-auto"
					>
						Submit another
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className={`bg-surface border border-border/20 rounded-3xl ${compact ? 'p-5' : 'p-6 sm:p-7'}`}>
			<div className="mb-5">
				<p className="text-sm font-semibold text-foreground">Creator application</p>
				<p className="text-xs text-muted mt-1">
					Share your details and upload a few sample files (or skip media and just submit your info).
				</p>
			</div>

			<form onSubmit={onSubmit} className="space-y-4">
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

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-foreground">WhatsApp / Phone</label>
						<input
							type="tel"
							required
							value={phone}
							onChange={e => setPhone(e.target.value)}
							placeholder="+91 90000 00000"
							className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
						/>
					</div>
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-foreground">Category / Niche</label>
						<input
							type="text"
							required
							value={category}
							onChange={e => setCategory(e.target.value)}
							placeholder="Fitness, Comedy, Music…"
							className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
						/>
					</div>
				</div>

				<div className="space-y-1.5">
					<label className="text-xs font-semibold text-foreground">City / Country</label>
					<input
						type="text"
						required
						value={location}
						onChange={e => setLocation(e.target.value)}
						placeholder="Mumbai, India"
						className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
					/>
				</div>

				<div className="space-y-1.5">
					<label className="text-xs font-semibold text-foreground">Short bio</label>
					<textarea
						required
						value={bio}
						onChange={e => setBio(e.target.value)}
						placeholder="Tell us what content you create and what you want to monetize…"
						rows={compact ? 4 : 5}
						className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-y"
					/>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-foreground">Instagram (optional)</label>
						<input
							type="url"
							value={instagram}
							onChange={e => setInstagram(e.target.value)}
							placeholder="https://instagram.com/…"
							className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
						/>
					</div>
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-foreground">YouTube (optional)</label>
						<input
							type="url"
							value={youtube}
							onChange={e => setYoutube(e.target.value)}
							placeholder="https://youtube.com/…"
							className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
						/>
					</div>
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-foreground">Portfolio/Link (optional)</label>
						<input
							type="url"
							value={portfolio}
							onChange={e => setPortfolio(e.target.value)}
							placeholder="https://…"
							className="w-full rounded-xl bg-input border border-border/20 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
						/>
					</div>
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-xs font-semibold text-foreground">Media samples (optional)</p>
							<p className="text-[11px] text-muted mt-0.5">{uploadHint}</p>
						</div>
						<button
							type="button"
							onClick={openFilePicker}
							disabled={!canAddMore}
							className={[
								'flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold transition-all',
								canAddMore ? 'bg-foreground/10 hover:bg-foreground/15 text-foreground' : 'bg-foreground/5 text-muted cursor-not-allowed',
							].join(' ')}
						>
							<Upload className="w-4 h-4" />
							Add files
						</button>
						<input
							ref={fileInputRef}
							type="file"
							multiple
							accept={ACCEPT_ATTR}
							onChange={e => onPickFiles(e.target.files)}
							className="hidden"
						/>
					</div>

					{files.length ? (
						<ul className="space-y-2">
							{files.map((f, idx) => (
								<li
									key={`${f.name}-${f.size}-${idx}`}
									className="flex items-center justify-between gap-3 rounded-2xl border border-border/20 bg-surface2 px-4 py-3"
								>
									<div className="min-w-0">
										<p className="text-xs font-semibold text-foreground truncate">{f.name}</p>
										<p className="text-[11px] text-muted mt-0.5">{formatBytes(f.size)}</p>
									</div>
									<button
										type="button"
										onClick={() => removeFileAt(idx)}
										className="p-2 rounded-xl hover:bg-foreground/10 transition-colors"
										aria-label={`Remove ${f.name}`}
									>
										<Trash2 className="w-4 h-4 text-muted" />
									</button>
								</li>
							))}
						</ul>
					) : (
						<div className="rounded-2xl border border-dashed border-border/25 bg-surface2 px-4 py-4">
							<p className="text-xs text-muted">No files selected.</p>
						</div>
					)}
				</div>

				<div className="flex items-start gap-3 rounded-2xl border border-border/20 bg-surface2 px-4 py-3">
					<input
						id="creator-consent"
						type="checkbox"
						checked={consent}
						onChange={e => setConsent(e.target.checked)}
						className="mt-0.5 accent-rose-500"
					/>
					<label htmlFor="creator-consent" className="text-xs text-muted leading-relaxed">
						I confirm I’m 18+ and I have the right to share these media samples. I agree to be contacted about onboarding.
					</label>
				</div>

				{error ? (
					<div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 flex items-start gap-2">
						<XCircle className="w-4 h-4 text-rose-300 mt-0.5" />
						<p className="text-xs text-rose-200/90">{error}</p>
					</div>
				) : null}

				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
					<p className="text-xs text-muted/80">
						We typically respond within 24–48 hours (business days).
					</p>
					<button
						type="submit"
						disabled={submitDisabled}
						className={[
							'font-bold px-6 py-3 rounded-2xl transition-all shadow-sm w-full sm:w-auto flex items-center justify-center gap-2',
							submitDisabled ? 'bg-foreground/10 text-muted cursor-not-allowed' : 'bg-rose-500 hover:bg-rose-600 text-white active:scale-95',
						].join(' ')}
					>
						Submit application
					</button>
				</div>
			</form>
		</div>
	);
}
