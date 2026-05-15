import { useState, useEffect } from 'react';
import { X, MessageCircle, Phone, Video, Clock, Zap, AlertCircle, Wallet } from '../icons';
import { MediaAvatar } from '../ui/MediaAvatar';
import { formatINR } from '../../services/razorpay';
import { compareMinor, formatINRFromMinor, inrRupeesToMinor } from '../../utils/money';
import type { SessionType } from '../../types';

// Backend spec allowed values: 10, 15, 20, 25, 30
const DURATION_OPTIONS = [10, 15, 20, 25, 30];

export type SessionPayMode = 'external' | 'wallet';

export type SessionPickerProtocol = 'local' | 'sessions';

interface Props {
	isOpen: boolean;
	onClose: () => void;
	creatorName: string;
	creatorAvatar: string;
	ratePerMinute: number;
	walletBalanceMinor: string;
	onConfirm: (type: SessionType, durationMinutes: number, totalCost: number, payMode: SessionPayMode) => void;
	/** When set to `sessions`, pricing/payment UI is deferred to the backend; session type + duration are still chosen here. */
	protocol?: SessionPickerProtocol;
}

const SESSION_TYPES: { type: SessionType, label: string, icon: React.ElementType, color: string, bg: string }[] = [
	{ type: 'chat', label: 'Chat', icon: MessageCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
	{ type: 'audio', label: 'Audio Call', icon: Phone, color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/30' },
	{ type: 'video', label: 'Video Call', icon: Video, color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/30' },
];

function sessionsRequestCtaLabel(type: SessionType): string {
	switch (type) {
		case 'chat':
			return 'Request chat session';
		case 'audio':
			return 'Request audio call';
		case 'video':
			return 'Request video call';
		default:
			return 'Request session';
	}
}

export function SessionPickerModal({
	isOpen,
	onClose,
	creatorName,
	creatorAvatar,
	ratePerMinute,
	walletBalanceMinor,
	onConfirm,
	protocol = 'local',
}: Props) {
	const [selectedType, setSelectedType] = useState<SessionType | null>(null);
	const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
	const [payMode, setPayMode] = useState<SessionPayMode>('external');

	useEffect(() => {
		if (!isOpen) return;
		setSelectedType(null);
		setSelectedDuration(null);
	}, [isOpen]);

	if (!isOpen) return null;

	const totalCost = selectedDuration ? parseFloat((selectedDuration * ratePerMinute).toFixed(2)) : 0;
	const totalMinor = inrRupeesToMinor(totalCost);
	const canAfford = payMode === 'external' || compareMinor(walletBalanceMinor, '>=', totalMinor);
	const canStart =
		protocol === 'sessions' ?
			!!selectedType && !!selectedDuration :
			!!selectedType && !!selectedDuration && canAfford;

	function handleConfirm() {
		if (!selectedType) return;
		if (protocol === 'sessions') {
			if (!selectedDuration) return;
			onConfirm(selectedType, selectedDuration, 0, 'wallet');
			onClose();
			return;
		}
		if (!selectedDuration) return;
		onConfirm(selectedType, selectedDuration, totalCost, payMode);
		onClose();
	}

	return (
		<div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
			<div className="absolute inset-0 bg-overlay/70 backdrop-blur-sm" onClick={onClose} />
			<div className="relative w-full sm:max-w-md bg-surface border border-border/20 rounded-t-3xl sm:rounded-3xl animate-slide-up sm:animate-fade-in overflow-hidden">
				<div className="p-5 border-b border-border/10">
					<div className="flex items-center gap-3">
						<MediaAvatar
							src={creatorAvatar}
							alt={creatorName}
							name={creatorName}
							className="h-10 w-10 rounded-xl"
						/>
						<div>
							<h2 className="text-base font-bold text-foreground">Start a Session</h2>
							<p className="text-xs text-muted">with {creatorName}</p>
						</div>
						<button onClick={onClose} className="ml-auto w-8 h-8 rounded-xl bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center text-muted transition-colors">
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="p-5 space-y-5">
					<div>
						<p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Session Type</p>
						<div className="grid grid-cols-3 gap-2">
							{SESSION_TYPES.map(({ type, label, icon: Icon, color, bg }) => (
								<button
									key={type}
									onClick={() => setSelectedType(type)}
									className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
										selectedType === type ?
											`${bg} ${color}` :
											'bg-foreground/5 border-border/20 text-muted hover:bg-foreground/10'
									}`}
								>
									<Icon className="w-5 h-5" />
									<span className="text-xs font-semibold">{label}</span>
								</button>
							))}
						</div>
					</div>

					{protocol === 'sessions' && (
						<div className="bg-foreground/5 rounded-2xl p-4">
							<p className="text-xs text-muted">
								Pricing and wallet checks are handled by the server. You must have enough wallet balance to request a session, and the wallet is charged only if the creator accepts.
							</p>
						</div>
					)}

					<div>
						<div className="flex items-center justify-between mb-3">
							<p className="text-xs font-semibold text-muted uppercase tracking-widest">Duration</p>
							{protocol !== 'sessions' && (
								<div className="flex items-center gap-1 text-xs text-amber-400">
									<Zap className="w-3 h-3 fill-amber-400" />
									<span>{formatINR(ratePerMinute)}/min</span>
								</div>
							)}
						</div>
						<div className="grid grid-cols-3 gap-2">
							{DURATION_OPTIONS.map(min => {
								const cost = parseFloat((min * ratePerMinute).toFixed(2));
								const costMinor = inrRupeesToMinor(cost);
								const affordable =
									protocol === 'sessions' ?
										true :
										(payMode === 'external' || compareMinor(walletBalanceMinor, '>=', costMinor));
								return (
									<button
										key={min}
										onClick={() => setSelectedDuration(min)}
										disabled={!affordable}
										className={`flex flex-col items-center gap-1 p-3 rounded-2xl border transition-all ${
											!affordable ?
												'bg-foreground/5 border-border/20 text-muted/50 cursor-not-allowed opacity-50' :
												selectedDuration === min ?
													'bg-amber-500/15 border-amber-500/30 text-amber-400' :
													'bg-foreground/5 border-border/20 text-foreground/80 hover:bg-foreground/10'
										}`}
									>
										<div className="flex items-center gap-1">
											<Clock className="w-3 h-3" />
											<span className="text-sm font-bold">{min}m</span>
										</div>
										{protocol !== 'sessions' && (
											<span className="text-[10px]">{formatINR(cost)}</span>
										)}
									</button>
								);
							})}
						</div>
					</div>

					{protocol !== 'sessions' && (
						<div>
							<p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Payment Method</p>
							<div className="flex gap-2">
								<button
									onClick={() => setPayMode('external')}
									className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
										payMode === 'external' ? 'border-rose-500/40 bg-rose-500/10 text-rose-500' : 'border-border/20 bg-foreground/5 text-muted hover:bg-foreground/10'
									}`}
								>
									{totalCost > 0 ? `Pay ${formatINR(totalCost)}` : 'Checkout'}
								</button>
								<button
									onClick={() => setPayMode('wallet')}
									className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
										payMode === 'wallet' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : 'border-border/20 bg-foreground/5 text-muted hover:bg-foreground/10'
									}`}
								>
									<Wallet className="w-3 h-3 inline mr-1" />
									Wallet ({formatINRFromMinor(walletBalanceMinor)})
								</button>
							</div>
						</div>
					)}

					{protocol !== 'sessions' && selectedDuration && (
						<div className="bg-foreground/5 rounded-2xl p-4 flex items-center justify-between">
							<div>
								<p className="text-xs text-muted mb-0.5">Total cost</p>
								<p className="text-xl font-bold text-foreground">{formatINR(totalCost)}</p>
							</div>
							<div className="text-right">
								<p className="text-xs text-muted mb-0.5">
									{payMode === 'external' ? 'INR amount' : 'Wallet balance'}
								</p>
								<p className={`text-sm font-semibold ${canAfford ? 'text-emerald-400' : 'text-rose-400'}`}>
									{payMode === 'external' ? formatINR(totalCost) : formatINRFromMinor(walletBalanceMinor)}
								</p>
							</div>
						</div>
					)}

					{protocol !== 'sessions' && !canAfford && selectedDuration && (
						<div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
							<AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
							<p className="text-xs text-rose-300">Insufficient balance. Use checkout or add funds.</p>
						</div>
					)}

					<button
						onClick={handleConfirm}
						disabled={!canStart}
						className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20"
					>
						{!selectedType ?
							'Select a session type' :
							!selectedDuration ?
								'Select duration' :
								protocol !== 'sessions' && !canAfford ?
									'Insufficient balance' :
									protocol === 'sessions' ?
										sessionsRequestCtaLabel(selectedType) :
										`Start ${selectedType === 'chat' ? 'Chat' : selectedType === 'audio' ? 'Audio Call' : 'Video Call'} for ${formatINR(totalCost)}`}
					</button>
				</div>
			</div>
		</div>
	);
}
