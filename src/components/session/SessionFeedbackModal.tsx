import { useMemo, useState } from 'react';
import { Star, X } from '../icons';
import { useSessions } from '../../context/SessionsContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatINRFromMinor } from '../../utils/money';

export function SessionFeedbackModal() {
	const { state, submitFeedback, clearFeedback } = useSessions();
	const { showToast } = useNotifications();
	const prompt = state.feedbackPrompt;
	const [rating, setRating] = useState<number>(5);
	const [comment, setComment] = useState('');
	const [busy, setBusy] = useState(false);

	const isOpen = !!prompt;
	const requestId = prompt?.request_id ?? '';

	const canSubmit = useMemo(() => Number.isInteger(rating) && rating >= 1 && rating <= 5 && !busy, [rating, busy]);

	if (!isOpen) return null;

	function handleSubmit() {
		if (!canSubmit) return;
		setBusy(true);
		submitFeedback({ requestId, rating, comment: comment.trim() || undefined })
			.then(() => {
				showToast('Feedback submitted');
				clearFeedback();
			})
			.catch(e => {
				showToast(e instanceof Error ? e.message : 'Failed to submit feedback', 'error');
			})
			.finally(() => {
				setBusy(false);
			});
	}

	return (
		<div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-4">
			<div className="absolute inset-0 bg-overlay/70 backdrop-blur-sm" onClick={clearFeedback} />
			<div className="relative w-full sm:max-w-md bg-surface border border-border/20 rounded-t-3xl sm:rounded-3xl animate-slide-up sm:animate-fade-in overflow-hidden">
				<div className="p-5 border-b border-border/10 flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
						<Star className="w-5 h-5 fill-amber-400" />
					</div>
					<div>
						<h2 className="text-base font-bold text-foreground">Session feedback</h2>
						<p className="text-xs text-muted">Request {requestId}</p>
					</div>
					<button
						onClick={clearFeedback}
						className="ml-auto w-8 h-8 rounded-xl bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center text-muted transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<div className="p-5 space-y-4">
					{prompt?.settlement && (
						<div className="rounded-xl border border-border/20 bg-foreground/5 p-3 space-y-1.5 text-xs">
							<p className="font-semibold text-foreground">Session settlement</p>
							<p className="text-muted">
								Escrow: {formatINRFromMinor(prompt.settlement.escrow_cents)}
							</p>
							<p className="text-muted">
								Settled: {formatINRFromMinor(prompt.settlement.settled_cents)}
							</p>
							<p className="text-muted">
								Refund: {formatINRFromMinor(prompt.settlement.refund_cents)}
							</p>
						</div>
					)}
					<div>
						<p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Rating</p>
						<div className="flex gap-2">
							{[1, 2, 3, 4, 5].map(n => (
								<button
									key={n}
									type="button"
									onClick={() => setRating(n)}
									className={`flex-1 py-2 rounded-xl border text-sm font-bold transition-all ${
										rating === n ?
											'bg-amber-500/15 border-amber-500/30 text-amber-400' :
											'bg-foreground/5 border-border/20 text-muted hover:bg-foreground/10'
									}`}
								>
									{n}
								</button>
							))}
						</div>
					</div>

					<div>
						<p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Comment (optional)</p>
						<textarea
							value={comment}
							onChange={e => setComment(e.target.value)}
							rows={3}
							className="w-full bg-input border border-border/20 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 resize-none"
							placeholder="Share a quick note…"
						/>
					</div>

					<button
						onClick={handleSubmit}
						disabled={!canSubmit}
						className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20"
					>
						{busy ? 'Submitting…' : 'Submit feedback'}
					</button>
				</div>
			</div>
		</div>
	);
}
