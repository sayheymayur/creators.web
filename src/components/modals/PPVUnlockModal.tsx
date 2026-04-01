import { useState } from 'react';
import { Lock, Unlock, Wallet } from '../icons';
import { Modal } from '../ui/Toast';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import type { Post } from '../../types';

interface PPVUnlockModalProps {
	isOpen: boolean;
	onClose: () => void;
	post: Post;
}

export function PPVUnlockModal({ isOpen, onClose, post }: PPVUnlockModalProps) {
	const { state: authState } = useAuth();
	const { deductFunds } = useWallet();
	const { unlockPost } = useContent();
	const { showToast } = useNotifications();
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const price = post.ppvPrice ?? 0;
	const balance = authState.user?.walletBalance ?? 0;

	async function handleUnlock() {
		if (!authState.user) return;
		setIsLoading(true);
		await new Promise(r => setTimeout(r, 800));
		const ok = deductFunds(price, 'ppv', `PPV unlock: ${post.creatorName}`, post.creatorId, post.creatorName);
		if (ok) {
			unlockPost(post.id, authState.user.id);
			setSuccess(true);
			showToast('Content unlocked!');
			setTimeout(onClose, 1500);
		} else {
			showToast('Insufficient balance. Please add funds.', 'error');
		}
		setIsLoading(false);
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Unlock Content">
			<div className="p-5">
				{success ? (
					<div className="text-center py-6">
						<div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
							<Unlock className="w-8 h-8 text-emerald-400" />
						</div>
						<p className="text-white font-semibold text-lg">Unlocked!</p>
						<p className="text-white/50 text-sm mt-1">You can now view this exclusive content</p>
					</div>
				) : (
					<>
						<div className="relative mb-4 rounded-xl overflow-hidden">
							{post.mediaUrl && (
								<img src={post.mediaUrl} alt="" className="w-full h-32 object-cover filter blur-md scale-105" />
							)}
							<div className="absolute inset-0 flex items-center justify-center bg-black/50">
								<Lock className="w-8 h-8 text-white" />
							</div>
						</div>

						<p className="text-white/70 text-sm mb-4 line-clamp-2">{post.text}</p>

						<div className="bg-white/5 rounded-xl p-4 mb-4">
							<div className="flex justify-between items-center mb-2">
								<span className="text-white/60 text-sm">Pay-per-view price</span>
								<span className="text-white font-semibold">${price.toFixed(2)}</span>
							</div>
							<div className="flex justify-between items-center">
								<span className="text-white/60 text-sm flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Your balance</span>
								<span className={`font-semibold text-sm ${balance < price ? 'text-rose-400' : 'text-emerald-400'}`}>
									${balance.toFixed(2)}
								</span>
							</div>
						</div>

						<Button
							variant="primary"
							fullWidth
							isLoading={isLoading}
							onClick={handleUnlock}
							disabled={balance < price}
						>
							<Unlock className="w-4 h-4" />
							Unlock for ${price.toFixed(2)}
						</Button>
						{balance < price && (
							<p className="text-center text-xs text-rose-400 mt-2">Insufficient balance. Add funds in your wallet.</p>
						)}
					</>
				)}
			</div>
		</Modal>
	);
}
