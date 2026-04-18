import { useState } from 'react';
import { Lock, Unlock, Wallet } from '../icons';
import { Modal } from '../ui/Toast';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatINR } from '../../services/razorpay';
import { compareMinor, formatINRFromMinor, inrRupeesToMinor } from '../../utils/money';
import type { Post } from '../../types';
import { delayMs } from '../../utils/delay';

interface PPVUnlockModalProps {
	isOpen: boolean;
	onClose: () => void;
	post: Post;
}

type PayMode = 'razorpay' | 'wallet';

export function PPVUnlockModal({ isOpen, onClose, post }: PPVUnlockModalProps) {
	const { state: authState } = useAuth();
	const { deductFunds, payViaRazorpay } = useWallet();
	const { unlockPost } = useContent();
	const { showToast } = useNotifications();
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [payMode, setPayMode] = useState<PayMode>('razorpay');
	const [error, setError] = useState('');

	const price = post.ppvPrice ?? 0;
	const balanceMinor = authState.user?.walletBalanceMinor ?? '0';
	const priceMinor = inrRupeesToMinor(price);
	const canAffordWallet = compareMinor(balanceMinor, '>=', priceMinor);

	function handleUnlock() {
		const user = authState.user;
		if (!user) return;
		setIsLoading(true);
		void delayMs(800).then(() => {
			setError('');

			if (payMode === 'razorpay') {
				void payViaRazorpay(price, 'ppv', `PPV unlock: ${post.creatorName}`, post.creatorId, post.creatorName).then(result => {
					if (!result.ok) {
						if (!result.cancelled) setError(result.error || 'Payment failed.');
						setIsLoading(false);
						return;
					}

					unlockPost(post.id, user.id);
					setSuccess(true);
					showToast('Content unlocked!');
					setTimeout(onClose, 1500);
					setIsLoading(false);
				});
				return;
			}

			const ok = deductFunds(price, 'ppv', `PPV unlock: ${post.creatorName}`, post.creatorId, post.creatorName);
			if (!ok) {
				setError('Insufficient wallet balance.');
				setIsLoading(false);
				return;
			}

			unlockPost(post.id, user.id);
			setSuccess(true);
			showToast('Content unlocked!');
			setTimeout(onClose, 1500);
			setIsLoading(false);
		});
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Unlock Content">
			<div className="p-5">
				{success ? (
					<div className="text-center py-6">
						<div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
							<Unlock className="w-8 h-8 text-emerald-400" />
						</div>
						<p className="text-foreground font-semibold text-lg">Unlocked!</p>
						<p className="text-muted text-sm mt-1">You can now view this exclusive content</p>
					</div>
				) : (
					<>
						<div className="relative mb-4 rounded-xl overflow-hidden">
							{post.mediaUrl && (
								<img src={post.mediaUrl} alt="" className="w-full h-32 object-cover filter blur-md scale-105" />
							)}
							<div className="absolute inset-0 flex items-center justify-center bg-overlay/50">
								<Lock className="w-8 h-8 text-white" />
							</div>
						</div>

						<p className="text-foreground/80 text-sm mb-4 line-clamp-2">{post.text}</p>

						<div className="bg-foreground/5 rounded-xl p-4 mb-4">
							<div className="flex justify-between items-center mb-2">
								<span className="text-muted text-sm">Pay-per-view price</span>
								<span className="text-foreground font-semibold">{formatINR(price)}</span>
							</div>
							<div className="flex justify-between items-center">
								<span className="text-muted text-sm flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Your balance</span>
								<span className={`font-semibold text-sm ${!canAffordWallet ? 'text-rose-400' : 'text-emerald-400'}`}>
									{formatINRFromMinor(balanceMinor)}
								</span>
							</div>
						</div>

						<p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Payment Method</p>
						<div className="flex gap-2 mb-4">
							<button
								onClick={() => setPayMode('razorpay')}
								className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
									payMode === 'razorpay' ? 'border-rose-500/40 bg-rose-500/10 text-rose-500' : 'border-border/20 bg-foreground/5 text-muted hover:bg-foreground/10'
								}`}
							>
								Pay {formatINR(price)}
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
							onClick={() => { void handleUnlock(); }}
							disabled={payMode === 'wallet' && !canAffordWallet}
						>
							<Unlock className="w-4 h-4" />
							Unlock for {formatINR(price)}
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
