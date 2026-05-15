import { useState } from 'react';
import { Zap, Wallet } from '../icons';
import { Modal } from '../ui/Toast';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatINR } from '../../services/razorpay';
import { compareMinor, formatINRFromMinor, inrRupeesToMinor } from '../../utils/money';
import { delayMs } from '../../utils/delay';
import { MediaAvatar } from '../ui/MediaAvatar';

const TIP_PRESETS = [3, 5, 10, 20, 50, 100];

interface TipModalProps {
	isOpen: boolean;
	onClose: () => void;
	creatorId: string;
	creatorName: string;
	creatorAvatar: string;
}

type PayMode = 'external' | 'wallet';

export function TipModal({ isOpen, onClose, creatorId, creatorName, creatorAvatar }: TipModalProps) {
	const { state: authState } = useAuth();
	const { tip } = useWallet();
	const { showToast, refresh } = useNotifications();
	const [amount, setAmount] = useState<number>(10);
	const [customAmount, setCustomAmount] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [payMode, setPayMode] = useState<PayMode>('external');
	const [error, setError] = useState('');

	const tipAmount = customAmount ? parseFloat(customAmount) || 0 : amount;
	const balanceMinor = authState.user?.walletBalanceMinor ?? '0';
	const tipMinor = inrRupeesToMinor(tipAmount);
	const canAffordWallet = compareMinor(balanceMinor, '>=', tipMinor);

	function handleSendTip() {
		if (!tipAmount || tipAmount <= 0) return;
		setIsLoading(true);
		void delayMs(800).then(() => {
			setError('');

			const amountCents = tipMinor; // already minor-unit integer string
			void tip(String(creatorId), amountCents)
				.then(result => {
					if (!result.ok) {
						setError(result.error || 'Tip failed.');
						return;
					}
					setSuccess(true);
					showToast(`Sent ${formatINR(tipAmount)} tip to ${creatorName}!`);
					void refresh({ unreadOnly: true });
					setTimeout(onClose, 1500);
				})
				.catch(err => {
					setError(err instanceof Error ? err.message : 'Tip failed.');
				})
				.finally(() => setIsLoading(false));
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
						<p className="text-foreground font-semibold text-lg">Tip Sent!</p>
						<p className="text-muted text-sm mt-1">{formatINR(tipAmount)} sent to {creatorName}</p>
					</div>
				) : (
					<>
						<div className="flex items-center gap-3 mb-5 p-3 bg-foreground/5 rounded-xl">
							<MediaAvatar
								src={creatorAvatar}
								alt={creatorName}
								name={creatorName}
								className="h-10 w-10 shrink-0 rounded-full"
							/>
							<div>
								<p className="text-sm font-semibold text-foreground">{creatorName}</p>
								<p className="text-xs text-muted">Your tip supports their work directly</p>
							</div>
						</div>

						<p className="text-xs text-muted mb-2 font-medium">CHOOSE AMOUNT</p>
						<div className="grid grid-cols-3 gap-2 mb-3">
							{TIP_PRESETS.map(preset => (
								<button
									key={preset}
									onClick={() => { setAmount(preset); setCustomAmount(''); }}
									className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
										amount === preset && !customAmount ?
											'bg-amber-500 text-white' :
											'bg-foreground/5 text-muted hover:bg-foreground/10'
									}`}
								>
									{formatINR(preset)}
								</button>
							))}
						</div>
						<input
							type="number"
							value={customAmount}
							onChange={e => setCustomAmount(e.target.value)}
							placeholder="Custom amount..."
							className="w-full bg-input border border-border/20 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 mb-4"
						/>

						<p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Payment Method</p>
						<div className="flex gap-2 mb-4">
							<button
								onClick={() => setPayMode('external')}
								className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
									payMode === 'external' ? 'border-amber-500/40 bg-amber-500/10 text-amber-500' : 'border-border/20 bg-foreground/5 text-muted hover:bg-foreground/10'
								}`}
							>
								Tip via wallet
							</button>
							<button
								onClick={() => setPayMode('wallet')}
								className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
									payMode === 'wallet' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : 'border-border/20 bg-foreground/5 text-muted hover:bg-foreground/10'
								}`}
							>
								<Wallet className="w-3 h-3 inline mr-1" />
								Wallet ({formatINRFromMinor(balanceMinor)})
							</button>
						</div>

						{error && (
							<div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-3">
								<p className="text-xs text-rose-400">{error}</p>
							</div>
						)}

						<Button
							variant="primary"
							fullWidth
							isLoading={isLoading}
							onClick={() => { void handleSendTip(); }}
							disabled={tipAmount <= 0 || (payMode === 'wallet' && !canAffordWallet)}
							className="bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
						>
							<Zap className="w-4 h-4 fill-white" />
							Send {formatINR(tipAmount)} Tip
						</Button>
						{payMode === 'wallet' && !canAffordWallet && (
							<p className="text-center text-xs text-rose-400 mt-2">Insufficient balance. Use checkout or add funds.</p>
						)}
					</>
				)}
			</div>
		</Modal>
	);
}
