import { useState } from 'react';
import { CheckCircle, Wallet, Star } from '../icons';
import { Modal } from '../ui/Toast';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import { usdToInr, formatINR } from '../../services/razorpay';
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

type PayMode = 'razorpay' | 'wallet';

export function SubscribeModal({ isOpen, onClose, creator }: SubscribeModalProps) {
	const { state: authState } = useAuth();
	const { deductFunds, payViaRazorpay, addSubscription } = useWallet();
	const { subscribe } = useContent();
	const { showToast } = useNotifications();
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [payMode, setPayMode] = useState<PayMode>('razorpay');
	const [error, setError] = useState('');

	const balance = authState.user?.walletBalance ?? 0;
	const inrPrice = usdToInr(creator.subscriptionPrice);

	function completeSubscription() {
		if (!authState.user) return;
		subscribe(creator.id);
		const endDate = new Date();
		endDate.setMonth(endDate.getMonth() + 1);
		addSubscription({
			id: `sub-${Date.now()}`,
			userId: authState.user.id,
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
		showToast(`Subscribed to ${creator.name}!`);
		setTimeout(onClose, 2000);
	}

	function handleSubscribe() {
		if (!authState.user) return;
		setIsLoading(true);
		void delayMs(900).then(() => {
			setError('');

			if (payMode === 'razorpay') {
				void payViaRazorpay(
					creator.subscriptionPrice,
					'subscription',
					`Subscription to ${creator.name}`,
					creator.id,
					creator.name
				).then(result => {
					if (result.ok) {
						completeSubscription();
					} else if (!result.cancelled) {
						setError(result.error || 'Payment failed. Please try again.');
					}
					setIsLoading(false);
				});
				return;
			}

			const ok = deductFunds(
				creator.subscriptionPrice,
				'subscription',
				`Subscription to ${creator.name}`,
				creator.id,
				creator.name
			);

			if (ok) {
				completeSubscription();
			} else {
				setError('Insufficient wallet balance.');
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

						<p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Payment Method</p>
						<div className="flex gap-2 mb-4">
							<button
								onClick={() => setPayMode('razorpay')}
								className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
									payMode === 'razorpay' ? 'border-rose-500/40 bg-rose-500/10 text-rose-400' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/8'
								}`}
							>
								Pay {formatINR(inrPrice)}
							</button>
							<button
								onClick={() => setPayMode('wallet')}
								className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
									payMode === 'wallet' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/8'
								}`}
							>
								<Wallet className="w-3 h-3 inline mr-1" />
								Wallet (${balance.toFixed(2)})
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
							onClick={() => { void handleSubscribe(); }}
							disabled={payMode === 'wallet' && balance < creator.subscriptionPrice}
						>
							Subscribe for ${creator.subscriptionPrice}/month
						</Button>
						{payMode === 'wallet' && balance < creator.subscriptionPrice && (
							<p className="text-center text-xs text-rose-400 mt-2">
								Insufficient balance. Switch to Razorpay or add funds.
							</p>
						)}
						<p className="text-center text-xs text-white/30 mt-2">Auto-renews monthly. Cancel anytime.</p>
					</>
				)}
			</div>
		</Modal>
	);
}
