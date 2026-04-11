import { useState } from 'react';
import { Plus, ArrowUpRight, ArrowDownLeft, Wallet as WalletIcon, CreditCard, TrendingUp, RefreshCw, CheckCircle } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { Modal } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { formatDate, formatCurrency } from '../../utils/date';
import { delayMs } from '../../utils/delay';
import type { Transaction } from '../../types';

const ADD_FUND_PRESETS = [10, 25, 50, 100, 200, 500];

function TransactionItem({ tx }: { tx: Transaction }) {
	const isPositive = tx.amount > 0;
	const typeColors: Record<Transaction['type'], string> = {
		deposit: 'text-emerald-400',
		subscription: 'text-rose-400',
		tip: 'text-amber-400',
		ppv: 'text-blue-400',
		withdrawal: 'text-orange-400',
		session: 'text-sky-400',
		gift: 'text-pink-400',
		refund: 'text-emerald-400',
	};
	const typeIcons: Record<Transaction['type'], React.ReactNode> = {
		deposit: <ArrowDownLeft className="w-4 h-4" />,
		subscription: <RefreshCw className="w-4 h-4" />,
		tip: <ArrowUpRight className="w-4 h-4" />,
		ppv: <ArrowUpRight className="w-4 h-4" />,
		withdrawal: <ArrowUpRight className="w-4 h-4" />,
		session: <ArrowUpRight className="w-4 h-4" />,
		gift: <ArrowUpRight className="w-4 h-4" />,
		refund: <ArrowDownLeft className="w-4 h-4" />,
	};

	return (
		<div className="flex items-center gap-3 py-3 border-b border-border/10 last:border-0">
			<div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-foreground/5 ${typeColors[tx.type]}`}>
				{typeIcons[tx.type]}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
				<p className="text-xs text-muted/80">{formatDate(tx.createdAt)}</p>
			</div>
			<div className="text-right shrink-0">
				<p className={`text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-foreground/80'}`}>
					{isPositive ? '+' : ''}{formatCurrency(tx.amount)}
				</p>
				<p className={`text-[10px] capitalize ${tx.status === 'completed' ? 'text-emerald-400/60' : 'text-amber-400/60'}`}>
					{tx.status}
				</p>
			</div>
		</div>
	);
}

export function Wallet() {
	const { state: authState } = useAuth();
	const { addFundsViaRazorpay, getUserTransactions, getUserSubscriptions, cancelSubscription, toggleAutoRenew } = useWallet();
	const [showAddFunds, setShowAddFunds] = useState(false);
	const [addAmount, setAddAmount] = useState(50);
	const [customAmount, setCustomAmount] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [addSuccess, setAddSuccess] = useState(false);
	const [payError, setPayError] = useState('');
	const [activeTab, setActiveTab] = useState<'transactions' | 'subscriptions'>('transactions');

	const user = authState.user;
	const userId = user?.id ?? '';
	const transactions = getUserTransactions(userId);
	const subscriptions = getUserSubscriptions(userId);
	const activeSubscriptions = subscriptions.filter(s => s.isActive);

	const totalSpent = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
	const totalDeposited = transactions.filter(t => t.type === 'deposit').reduce((sum, t) => sum + t.amount, 0);

	function handleAddFunds() {
		const amount = customAmount ? parseFloat(customAmount) : addAmount;
		if (!amount || amount <= 0) return;
		setIsLoading(true);
		void delayMs(1000).then(() => {
			setPayError('');
			void addFundsViaRazorpay(amount).then(ok => {
				if (ok) {
					setAddSuccess(true);
					setTimeout(() => {
						setAddSuccess(false);
						setShowAddFunds(false);
						setCustomAmount('');
						setPayError('');
					}, 1500);
				} else {
					setPayError('');
				}
				setIsLoading(false);
			});
		});
	}

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-6">
				<div className="bg-gradient-to-br from-rose-500/20 via-rose-900/10 to-transparent border border-rose-500/20 rounded-3xl p-6 mb-6">
					<div className="flex items-start justify-between mb-4">
						<div>
							<p className="text-xs text-muted font-medium uppercase tracking-wider mb-1">Available Balance</p>
							<p className="text-4xl font-black text-foreground">${(user?.walletBalance ?? 0).toFixed(2)}</p>
						</div>
						<div className="w-12 h-12 bg-rose-500/20 rounded-2xl flex items-center justify-center">
							<WalletIcon className="w-6 h-6 text-rose-400" />
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3 mb-4">
						<div className="bg-foreground/5 rounded-xl p-3">
							<p className="text-xs text-muted mb-0.5">Total Deposited</p>
							<p className="text-base font-bold text-emerald-400">${totalDeposited.toFixed(2)}</p>
						</div>
						<div className="bg-foreground/5 rounded-xl p-3">
							<p className="text-xs text-muted mb-0.5">Total Spent</p>
							<p className="text-base font-bold text-foreground/80">${totalSpent.toFixed(2)}</p>
						</div>
					</div>
					<Button
						variant="primary"
						fullWidth
						onClick={() => setShowAddFunds(true)}
						leftIcon={<Plus className="w-4 h-4" />}
					>
						Add Funds
					</Button>
				</div>

				<div className="flex gap-1 bg-foreground/5 p-0.5 rounded-xl mb-4">
					{(['transactions', 'subscriptions'] as const).map(tab => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all capitalize ${
								activeTab === tab ? 'bg-foreground/10 text-foreground' : 'text-muted'
							}`}
						>
							{tab}
						</button>
					))}
				</div>

				{activeTab === 'transactions' && (
					<div className="bg-surface border border-border/20 rounded-2xl px-4">
						{transactions.length === 0 ? (
							<p className="text-center text-muted py-8 text-sm">No transactions yet</p>
						) : (
							transactions.map(tx => <TransactionItem key={tx.id} tx={tx} />)
						)}
					</div>
				)}

				{activeTab === 'subscriptions' && (
					<div className="space-y-3">
						{activeSubscriptions.length === 0 ? (
							<div className="bg-surface border border-border/20 rounded-2xl p-8 text-center">
								<TrendingUp className="w-8 h-8 text-muted/50 mx-auto mb-2" />
								<p className="text-muted text-sm">No active subscriptions</p>
							</div>
						) : (
							activeSubscriptions.map(sub => (
								<div key={sub.id} className="bg-surface border border-border/20 rounded-2xl p-4">
									<div className="flex items-center gap-3 mb-3">
										<img src={sub.creatorAvatar} alt={sub.creatorName} className="w-10 h-10 rounded-full object-cover" />
										<div className="flex-1">
											<p className="text-sm font-semibold text-foreground">{sub.creatorName}</p>
											<p className="text-xs text-muted">Renews {formatDate(sub.endDate)}</p>
										</div>
										<span className="text-sm font-bold text-rose-400">${sub.price}/mo</span>
									</div>
									<div className="flex gap-2">
										<button
											onClick={() => toggleAutoRenew(sub.id)}
											className={`flex-1 text-xs py-1.5 rounded-xl font-medium transition-all border ${
												sub.autoRenew ?
													'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
													'border-border/20 bg-foreground/5 text-muted'
											}`}
										>
											<RefreshCw className="w-3 h-3 inline mr-1" />
											Auto-renew {sub.autoRenew ? 'ON' : 'OFF'}
										</button>
										<button
											onClick={() => cancelSubscription(sub.id)}
											className="flex-1 text-xs py-1.5 rounded-xl font-medium border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
										>
											Cancel
										</button>
									</div>
								</div>
							))
						)}
					</div>
				)}
			</div>

			<Modal isOpen={showAddFunds} onClose={() => { setShowAddFunds(false); setAddSuccess(false); }} title="Add Funds">
				<div className="p-5">
					{addSuccess ? (
						<div className="text-center py-6">
							<div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
								<CheckCircle className="w-7 h-7 text-emerald-400" />
							</div>
							<p className="text-foreground font-semibold">Funds Added!</p>
							<p className="text-muted text-sm mt-1">
								${(customAmount ? parseFloat(customAmount) : addAmount).toFixed(2)} added to your wallet
							</p>
						</div>
					) : (
						<>
							<div className="flex items-center gap-2 bg-foreground/5 rounded-xl p-3 mb-4">
								<CreditCard className="w-4 h-4 text-muted" />
								<span className="text-sm text-muted">Secure payment via Razorpay</span>
							</div>
							{payError && (
								<div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-3">
									<p className="text-xs text-rose-400">{payError}</p>
								</div>
							)}

							<p className="text-xs text-muted font-medium mb-2 uppercase tracking-wide">Select Amount</p>
							<div className="grid grid-cols-3 gap-2 mb-3">
								{ADD_FUND_PRESETS.map(p => (
									<button
										key={p}
										onClick={() => { setAddAmount(p); setCustomAmount(''); }}
										className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
											addAmount === p && !customAmount ? 'bg-rose-500 text-white' : 'bg-foreground/5 text-muted hover:bg-foreground/10'
										}`}
									>
										${p}
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
							<Button variant="primary" fullWidth isLoading={isLoading} onClick={() => { void handleAddFunds(); }}>
								Add ${(customAmount ? parseFloat(customAmount) || 0 : addAmount).toFixed(2)}
							</Button>
						</>
					)}
				</div>
			</Modal>
		</Layout>
	);
}
