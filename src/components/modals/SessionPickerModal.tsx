import { useState } from 'react';
import { X, MessageCircle, Phone, Video, Clock, Zap, AlertCircle, Wallet } from '../icons';
import { usdToInr, formatINR } from '../../services/razorpay';
import type { SessionType } from '../../types';

const DURATION_OPTIONS = [5, 10, 15, 20, 30, 60];

export type SessionPayMode = 'razorpay' | 'wallet';

interface Props {
	isOpen: boolean;
	onClose: () => void;
	creatorName: string;
	creatorAvatar: string;
	ratePerMinute: number;
	walletBalance: number;
	onConfirm: (type: SessionType, durationMinutes: number, totalCost: number, payMode: SessionPayMode) => void;
}

const SESSION_TYPES: { type: SessionType, label: string, icon: React.ElementType, color: string, bg: string }[] = [
	{ type: 'chat', label: 'Chat', icon: MessageCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
	{ type: 'audio', label: 'Audio Call', icon: Phone, color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/30' },
	{ type: 'video', label: 'Video Call', icon: Video, color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/30' },
];

export function SessionPickerModal({ isOpen, onClose, creatorName, creatorAvatar, ratePerMinute, walletBalance, onConfirm }: Props) {
	const [selectedType, setSelectedType] = useState<SessionType | null>(null);
	const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
	const [payMode, setPayMode] = useState<SessionPayMode>('razorpay');

	if (!isOpen) return null;

	const totalCost = selectedDuration ? parseFloat((selectedDuration * ratePerMinute).toFixed(2)) : 0;
	const inrCost = usdToInr(totalCost);
	const canAfford = payMode === 'razorpay' || walletBalance >= totalCost;
	const canStart = selectedType && selectedDuration && canAfford;

	function handleConfirm() {
		if (!selectedType || !selectedDuration) return;
		onConfirm(selectedType, selectedDuration, totalCost, payMode);
		onClose();
	}

	return (
		<div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
			<div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
			<div className="relative w-full sm:max-w-md bg-[#141414] border border-white/10 rounded-t-3xl sm:rounded-3xl animate-slide-up sm:animate-fade-in overflow-hidden">
				<div className="p-5 border-b border-white/5">
					<div className="flex items-center gap-3">
						<img src={creatorAvatar} alt={creatorName} className="w-10 h-10 rounded-xl object-cover" />
						<div>
							<h2 className="text-base font-bold text-white">Start a Session</h2>
							<p className="text-xs text-white/40">with {creatorName}</p>
						</div>
						<button onClick={onClose} className="ml-auto w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 transition-colors">
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="p-5 space-y-5">
					<div>
						<p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Session Type</p>
						<div className="grid grid-cols-3 gap-2">
							{SESSION_TYPES.map(({ type, label, icon: Icon, color, bg }) => (
								<button
									key={type}
									onClick={() => setSelectedType(type)}
									className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
										selectedType === type ?
											`${bg} ${color}` :
											'bg-white/3 border-white/5 text-white/40 hover:bg-white/5'
									}`}
								>
									<Icon className="w-5 h-5" />
									<span className="text-xs font-semibold">{label}</span>
								</button>
							))}
						</div>
					</div>

					<div>
						<div className="flex items-center justify-between mb-3">
							<p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Duration</p>
							<div className="flex items-center gap-1 text-xs text-amber-400">
								<Zap className="w-3 h-3 fill-amber-400" />
								<span>${ratePerMinute.toFixed(2)}/min</span>
							</div>
						</div>
						<div className="grid grid-cols-3 gap-2">
							{DURATION_OPTIONS.map(min => {
								const cost = parseFloat((min * ratePerMinute).toFixed(2));
								const affordable = payMode === 'razorpay' || walletBalance >= cost;
								return (
									<button
										key={min}
										onClick={() => setSelectedDuration(min)}
										disabled={!affordable}
										className={`flex flex-col items-center gap-1 p-3 rounded-2xl border transition-all ${
											!affordable ?
												'bg-white/2 border-white/5 text-white/20 cursor-not-allowed opacity-50' :
												selectedDuration === min ?
													'bg-amber-500/15 border-amber-500/30 text-amber-400' :
													'bg-white/3 border-white/5 text-white/60 hover:bg-white/5'
										}`}
									>
										<div className="flex items-center gap-1">
											<Clock className="w-3 h-3" />
											<span className="text-sm font-bold">{min}m</span>
										</div>
										<span className="text-[10px]">${cost.toFixed(2)}</span>
									</button>
								);
							})}
						</div>
					</div>

					<div>
						<p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Payment Method</p>
						<div className="flex gap-2">
							<button
								onClick={() => setPayMode('razorpay')}
								className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
									payMode === 'razorpay' ? 'border-rose-500/40 bg-rose-500/10 text-rose-400' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/8'
								}`}
							>
								{totalCost > 0 ? `Pay ${formatINR(inrCost)}` : 'Razorpay'}
							</button>
							<button
								onClick={() => setPayMode('wallet')}
								className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
									payMode === 'wallet' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/8'
								}`}
							>
								<Wallet className="w-3 h-3 inline mr-1" />
								Wallet (${walletBalance.toFixed(2)})
							</button>
						</div>
					</div>

					{selectedDuration && (
						<div className="bg-white/5 rounded-2xl p-4 flex items-center justify-between">
							<div>
								<p className="text-xs text-white/40 mb-0.5">Total cost</p>
								<p className="text-xl font-bold text-white">${totalCost.toFixed(2)}</p>
							</div>
							<div className="text-right">
								<p className="text-xs text-white/40 mb-0.5">
									{payMode === 'razorpay' ? 'INR amount' : 'Wallet balance'}
								</p>
								<p className={`text-sm font-semibold ${canAfford ? 'text-emerald-400' : 'text-rose-400'}`}>
									{payMode === 'razorpay' ? formatINR(inrCost) : `$${walletBalance.toFixed(2)}`}
								</p>
							</div>
						</div>
					)}

					{!canAfford && selectedDuration && (
						<div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
							<AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
							<p className="text-xs text-rose-300">Insufficient balance. Switch to Razorpay or add funds.</p>
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
								!canAfford ?
									'Insufficient balance' :
									`Start ${selectedType === 'chat' ? 'Chat' : selectedType === 'audio' ? 'Audio Call' : 'Video Call'} for $${totalCost.toFixed(2)}`}
					</button>
				</div>
			</div>
		</div>
	);
}
