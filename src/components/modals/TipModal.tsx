import { useState } from 'react';
import { Zap, Wallet } from '../icons';
import { Modal } from '../ui/Toast';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useNotifications } from '../../context/NotificationContext';
import { delayMs } from '../../utils/delay';

const TIP_PRESETS = [3, 5, 10, 20, 50, 100];

interface TipModalProps {
	isOpen: boolean;
	onClose: () => void;
	creatorId: string;
	creatorName: string;
	creatorAvatar: string;
}

export function TipModal({ isOpen, onClose, creatorId, creatorName, creatorAvatar }: TipModalProps) {
	const { state: authState } = useAuth();
	const { deductFunds } = useWallet();
	const { showToast } = useNotifications();
	const [amount, setAmount] = useState<number>(10);
	const [customAmount, setCustomAmount] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const tipAmount = customAmount ? parseFloat(customAmount) || 0 : amount;
	const balance = authState.user?.walletBalance ?? 0;

	function handleSendTip() {
		if (!tipAmount || tipAmount <= 0) return;
		setIsLoading(true);
		void delayMs(800).then(() => {
			const ok = deductFunds(tipAmount, 'tip', `Tip to ${creatorName}`, creatorId, creatorName);
			if (ok) {
				setSuccess(true);
				showToast(`Sent $${tipAmount.toFixed(2)} tip to ${creatorName}! 💝`);
				setTimeout(onClose, 1500);
			} else {
				showToast('Insufficient balance. Please add funds.', 'error');
			}
			setIsLoading(false);
		});
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Send a Tip">
			<div className="p-5">
				{success ? (
					<div className="text-center py-6">
						<div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
							<Zap className="w-8 h-8 text-amber-400 fill-amber-400" />
						</div>
						<p className="text-white font-semibold text-lg">Tip Sent!</p>
						<p className="text-white/50 text-sm mt-1">${tipAmount.toFixed(2)} sent to {creatorName}</p>
					</div>
				) : (
					<>
						<div className="flex items-center gap-3 mb-5 p-3 bg-white/5 rounded-xl">
							<img src={creatorAvatar} alt={creatorName} className="w-10 h-10 rounded-full object-cover" />
							<div>
								<p className="text-sm font-semibold text-white">{creatorName}</p>
								<p className="text-xs text-white/40">Your tip supports their work directly</p>
							</div>
						</div>

						<p className="text-xs text-white/40 mb-2 font-medium">CHOOSE AMOUNT</p>
						<div className="grid grid-cols-3 gap-2 mb-3">
							{TIP_PRESETS.map(preset => (
								<button
									key={preset}
									onClick={() => { setAmount(preset); setCustomAmount(''); }}
									className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
										amount === preset && !customAmount ?
											'bg-amber-500 text-white' :
											'bg-white/5 text-white/70 hover:bg-white/10'
									}`}
								>
									${preset}
								</button>
							))}
						</div>
						<input
							type="number"
							value={customAmount}
							onChange={e => setCustomAmount(e.target.value)}
							placeholder="Custom amount..."
							className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50 mb-4"
						/>

						<div className="flex items-center justify-between text-xs text-white/40 mb-4 px-1">
							<div className="flex items-center gap-1">
								<Wallet className="w-3.5 h-3.5" />
								<span>Balance: ${balance.toFixed(2)}</span>
							</div>
							<span>Tip: ${tipAmount.toFixed(2)}</span>
						</div>

						<Button
							variant="primary"
							fullWidth
							isLoading={isLoading}
							onClick={() => { void handleSendTip(); }}
							disabled={tipAmount <= 0 || balance < tipAmount}
							className="bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
						>
							<Zap className="w-4 h-4 fill-white" />
							Send ${tipAmount.toFixed(2)} Tip
						</Button>
						{balance < tipAmount && (
							<p className="text-center text-xs text-rose-400 mt-2">Insufficient balance</p>
						)}
					</>
				)}
			</div>
		</Modal>
	);
}
