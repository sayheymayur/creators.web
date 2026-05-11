import { useState } from 'react';
import { CheckCircle, Wallet, Star } from '../icons';
import { Modal } from '../ui/Toast';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSubscriptions } from '../../context/SubscriptionContext';
import { formatINR } from '../../services/razorpay';
import { compareMinor, formatINRFromMinor, inrRupeesToMinor } from '../../utils/money';
import type { Creator } from '../../types';
import { delayMs } from '../../utils/delay';
import { UserAvatarMedia } from '../ui/Avatar';

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

type PayMode = 'external' | 'wallet';

export function SubscribeModal({ isOpen, onClose, creator }: SubscribeModalProps) {
	const { state: authState } = useAuth();
	const { showToast } = useNotifications();
	const { subscribeWallet, subscribeViaCheckout } = useSubscriptions();
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [payMode, setPayMode] = useState<PayMode>('external');
	const [error, setError] = useState('');

	const balanceMinor = authState.user?.walletBalanceMinor ?? '0';
	const inrPrice = creator.subscriptionPrice;
	const subMinor = inrRupeesToMinor(creator.subscriptionPrice);
	const canAffordWallet = compareMinor(balanceMinor, '>=', subMinor);

	function completeSubscription() {
		setSuccess(true);
		showToast(`Subscribed to ${creator.name}!`);
		setTimeout(onClose, 2000);
	}

	function handleSubscribe() {
		if (!authState.user) return;
		setIsLoading(true);
		void delayMs(900).then(() => {
			setError('');

			if (payMode === 'external') {
				void subscribeViaCheckout(creator.id, creator.subscriptionPrice).then(result => {
					if (result.ok) {
						completeSubscription();
					} else if (!result.cancelled) {
						setError(result.error || 'Payment failed. Please try again.');
					}
					setIsLoading(false);
				}).catch(err => {
					setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
					setIsLoading(false);
				});
				return;
			}

			if (!canAffordWallet) {
				setError('Insufficient wallet balance.');
				setIsLoading(false);
				return;
			}

			void subscribeWallet(creator.id, true)
				.then(() => {
					completeSubscription();
				})
				.catch(err => {
					setError(err instanceof Error ? err.message : 'Subscription failed. Please try again.');
				})
				.finally(() => setIsLoading(false));
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
						<p className="text-foreground font-semibold text-xl mb-1">Subscribed!</p>
						<p className="text-muted text-sm">Welcome to {creator.name}'s exclusive content</p>
					</div>
				) : (
					<>
						<div className="flex items-center gap-3 mb-5 p-3 bg-foreground/5 rounded-xl">
							<UserAvatarMedia src={creator.avatar} alt={creator.name} className="w-12 h-12 rounded-full object-cover" />
							<div className="flex-1">
								<div className="flex items-center gap-1.5">
									<p className="font-semibold text-foreground">{creator.name}</p>
									{creator.isKYCVerified && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
								</div>
								<p className="text-xs text-muted">@{creator.username}</p>
							</div>
							<div className="text-right">
								<p className="text-lg font-bold text-rose-400">{formatINR(inrPrice)}</p>
								<p className="text-xs text-muted">per month</p>
							</div>
						</div>

						<div className="space-y-2 mb-5">
							{PERKS.map(perk => (
								<div key={perk} className="flex items-center gap-2.5">
									<CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
									<span className="text-sm text-foreground/80">{perk}</span>
								</div>
							))}
						</div>

						<p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Payment Method</p>
						<div className="flex gap-2 mb-4">
							<button
								onClick={() => setPayMode('external')}
								className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
									payMode === 'external' ? 'border-rose-500/40 bg-rose-500/10 text-rose-500' : 'border-border/20 bg-foreground/5 text-muted hover:bg-foreground/10'
								}`}
							>
								Pay {formatINR(inrPrice)}
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
							onClick={() => { void handleSubscribe(); }}
							disabled={payMode === 'wallet' && !canAffordWallet}
						>
							Subscribe for {formatINR(creator.subscriptionPrice)}/month
						</Button>
						{payMode === 'wallet' && !canAffordWallet && (
							<p className="text-center text-xs text-rose-400 mt-2">
								Insufficient balance. Use checkout or add funds.
							</p>
						)}
						<p className="text-center text-xs text-muted/80 mt-2">Auto-renews monthly. Cancel anytime.</p>
					</>
				)}
			</div>
		</Modal>
	);
}
