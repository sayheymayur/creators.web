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
	const { showToast } = useNotifications();
	const { subscribeWallet } = useSubscriptions();
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [error, setError] = useState('');
	const [autoRenew, setAutoRenew] = useState(true);

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

			if (!canAffordWallet) {
				setError('Insufficient wallet balance.');
				setIsLoading(false);
				return;
			}

			void subscribeWallet(creator.id, autoRenew)
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
							<img src={creator.avatar} alt={creator.name} className="w-12 h-12 rounded-full object-cover" />
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
						<div className="bg-foreground/5 border border-border/20 rounded-xl p-3 mb-4 flex items-center justify-between gap-3">
							<div className="flex items-center gap-2 text-muted">
								<Wallet className="w-4 h-4" />
								<span className="text-xs font-semibold">Wallet balance</span>
							</div>
							<span className="text-xs font-semibold text-foreground">{formatINRFromMinor(balanceMinor)}</span>
						</div>

						<div className="flex items-center justify-between mb-4">
							<div>
								<p className="text-xs font-semibold text-muted uppercase tracking-widest">Auto-renew</p>
								<p className="text-xs text-muted/80 mt-1">You can cancel anytime.</p>
							</div>
							<label className="relative inline-flex items-center cursor-pointer select-none">
								<input
									type="checkbox"
									className="sr-only peer"
									checked={autoRenew}
									onChange={() => setAutoRenew(v => !v)}
									role="switch"
									aria-label="Auto-renew subscription"
								/>
								<span
									className={[
										'relative inline-flex h-6 w-11 rounded-full border transition-colors',
										'bg-foreground/10 border-border/30',
										'peer-checked:bg-rose-500 peer-checked:border-rose-500/40',
										"after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200",
										'peer-checked:after:translate-x-5',
									].join(' ')}
								/>
							</label>
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
							disabled={!canAffordWallet}
						>
							Subscribe for {formatINR(creator.subscriptionPrice)}/month
						</Button>
						{!canAffordWallet && (
							<p className="text-center text-xs text-rose-400 mt-2">
								Insufficient balance. Please add funds to your wallet.
							</p>
						)}
						<p className="text-center text-xs text-muted/80 mt-2">Billing and expiry are handled server-side; you’ll see updates in-app.</p>
					</>
				)}
			</div>
		</Modal>
	);
}
