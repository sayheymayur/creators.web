import { useState } from 'react';
import { CheckCircle, Wallet, Star } from '../icons';
import { Modal } from '../ui/Toast';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import type { Creator } from '../../types';
import { delayMs } from '../../utils/delay';

interface SubscribeModalProps {
	isOpen: boolean;
	onClose: () => void;
	creator: Creator;
}

const PERKS = [
	'Access to all subscriber-only posts',
	'Direct messaging with creator',
	'Early access to new content',
	'Exclusive behind-the-scenes content',
];

export function SubscribeModal({ isOpen, onClose, creator }: SubscribeModalProps) {
	const { state: authState } = useAuth();
	const { deductFunds, addSubscription } = useWallet();
	const { subscribe } = useContent();
	const { showToast } = useNotifications();
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const balance = authState.user?.walletBalance ?? 0;

	function handleSubscribe() {
		if (!authState.user) return;
		setIsLoading(true);
		void delayMs(900).then(() => {
			const ok = deductFunds(
				creator.subscriptionPrice,
				'subscription',
				`Subscription to ${creator.name}`,
				creator.id,
				creator.name
			);
			if (ok) {
				subscribe(creator.id);
				const endDate = new Date();
				endDate.setMonth(endDate.getMonth() + 1);
				addSubscription({
					id: `sub-${Date.now()}`,
					userId: authState.user!.id,
					creatorId: creator.id,
					creatorName: creator.name,
					creatorAvatar: creator.avatar,
					startDate: new Date().toISOString().split('T')[0],
					endDate: endDate.toISOString().split('T')[0],
					isActive: true,
					price: creator.subscriptionPrice,
					autoRenew: true,
				});
				setSuccess(true);
				showToast(`Subscribed to ${creator.name}! 🎉`);
				setTimeout(onClose, 2000);
			} else {
				showToast('Insufficient balance. Please add funds to your wallet.', 'error');
			}
			setIsLoading(false);
		});
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Subscribe">
			<div className="p-5">
				{success ? (
					<div className="text-center py-8">
						<div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
							<CheckCircle className="w-8 h-8 text-rose-400" />
						</div>
						<p className="text-white font-semibold text-xl mb-1">Subscribed!</p>
						<p className="text-white/50 text-sm">Welcome to {creator.name}'s exclusive content</p>
					</div>
				) : (
					<>
						<div className="flex items-center gap-3 mb-5 p-3 bg-white/5 rounded-xl">
							<img src={creator.avatar} alt={creator.name} className="w-12 h-12 rounded-full object-cover" />
							<div className="flex-1">
								<div className="flex items-center gap-1.5">
									<p className="font-semibold text-white">{creator.name}</p>
									{creator.isKYCVerified && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
								</div>
								<p className="text-xs text-white/40">@{creator.username}</p>
							</div>
							<div className="text-right">
								<p className="text-lg font-bold text-rose-400">${creator.subscriptionPrice}</p>
								<p className="text-xs text-white/40">per month</p>
							</div>
						</div>

						<div className="space-y-2 mb-5">
							{PERKS.map(perk => (
								<div key={perk} className="flex items-center gap-2.5">
									<CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
									<span className="text-sm text-white/70">{perk}</span>
								</div>
							))}
						</div>

						<div className="bg-white/5 rounded-xl p-3 mb-4">
							<div className="flex justify-between items-center">
								<span className="text-sm text-white/60 flex items-center gap-1.5"><Wallet className="w-4 h-4" /> Wallet balance</span>
								<span className={`font-semibold ${balance < creator.subscriptionPrice ? 'text-rose-400' : 'text-emerald-400'}`}>
									${balance.toFixed(2)}
								</span>
							</div>
						</div>

						<Button
							variant="primary"
							fullWidth
							isLoading={isLoading}
							onClick={() => { void handleSubscribe(); }}
							disabled={balance < creator.subscriptionPrice}
						>
							Subscribe for ${creator.subscriptionPrice}/month
						</Button>
						{balance < creator.subscriptionPrice && (
							<p className="text-center text-xs text-rose-400 mt-2">
								Insufficient balance. Add funds in your wallet.
							</p>
						)}
						<p className="text-center text-xs text-white/30 mt-2">Auto-renews monthly. Cancel anytime.</p>
					</>
				)}
			</div>
		</Modal>
	);
}
