import { useState } from 'react';
import { Modal } from '../ui/Toast';
import { submitReport, type ReportTargetType } from '../../services/reportTarget';
import { apiErrorMessage } from '../../services/creatorsApi';
import { useWs, useWsAuthReady, useWsConnected } from '../../context/WsContext';

interface ReportTargetModalProps {
	isOpen: boolean;
	onClose: () => void;
	targetType: ReportTargetType;
	targetId: string;
	title: string;
	onSubmitted?: () => void;
	onToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export function ReportTargetModal({
	isOpen,
	onClose,
	targetType,
	targetId,
	title,
	onSubmitted,
	onToast,
}: ReportTargetModalProps) {
	const [reason, setReason] = useState('Spam');
	const [details, setDetails] = useState('');
	const [sending, setSending] = useState(false);
	const ws = useWs();
	const wsConnected = useWsConnected();
	const wsAuthReady = useWsAuthReady();

	function handleClose() {
		if (!sending) onClose();
	}

	function submit() {
		if (sending) return;
		setSending(true);
		const r = reason.trim() || 'Other';
		const d = details.trim();
		void submitReport({
			targetType,
			targetId,
			reason: r,
			details: d || undefined,
		}, { ws, wsConnected, wsAuthReady })
			.then(res => {
				onToast(
					'already_reported' in res && res.already_reported ?
						'Already reported. Thank you.' :
						'Report submitted. Thank you.'
				);
				onSubmitted?.();
				onClose();
				setDetails('');
				setReason('Spam');
			})
			.catch((err: unknown) => {
				onToast(apiErrorMessage(err, 'Could not submit report. Please try again.'), 'error');
			})
			.finally(() => setSending(false));
	}

	return (
		<Modal isOpen={isOpen} onClose={handleClose} title={title}>
			<div className="p-5 space-y-4">
				<div className="space-y-1.5">
					<p className="text-xs text-muted">Reason</p>
					<select
						value={reason}
						onChange={e => setReason(e.target.value)}
						className="w-full bg-input border border-border/20 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
					>
						<option>Spam</option>
						<option>Harassment</option>
						<option>Nudity</option>
						<option>Violence</option>
						<option>Other</option>
					</select>
				</div>
				<div className="space-y-1.5">
					<p className="text-xs text-muted">Details (optional)</p>
					<textarea
						value={details}
						onChange={e => setDetails(e.target.value)}
						className="w-full min-h-[90px] bg-input border border-border/20 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
						placeholder="Tell us what is wrong…"
					/>
				</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={handleClose}
						disabled={sending}
						className="px-4 py-2 rounded-full border border-border/30 bg-transparent text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-60"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={submit}
						disabled={sending}
						className="px-4 py-2 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-60"
					>
						{sending ? 'Submitting…' : 'Submit'}
					</button>
				</div>
			</div>
		</Modal>
	);
}
