import { useState } from 'react';
import { DollarSign, TrendingUp, Zap, Users, ArrowUpRight, CheckCircle } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { Modal } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { useCurrentCreator } from '../../context/AuthContext';
import { mockCreators } from '../../data/users';
import { useNotifications } from '../../context/NotificationContext';
import { delayMs } from '../../utils/delay';

export function Earnings() {
	const creator = useCurrentCreator();
	const { showToast } = useNotifications();
	const [showWithdraw, setShowWithdraw] = useState(false);
	const [withdrawAmount, setWithdrawAmount] = useState('');
	const [isWithdrawing, setIsWithdrawing] = useState(false);
	const [withdrawSuccess, setWithdrawSuccess] = useState(false);
	const [bankName, setBankName] = useState('');
	const [accountNumber, setAccountNumber] = useState('');

	const creatorData = creator ?? mockCreators[0];

	function handleWithdraw() {
		if (!withdrawAmount || !bankName || !accountNumber) {
			showToast('Please fill in all fields', 'error'); return;
		}
		setIsWithdrawing(true);
		void delayMs(1200).then(() => {
			setWithdrawSuccess(true);
			setIsWithdrawing(false);
			showToast(`Withdrawal of $${withdrawAmount} initiated!`);
			setTimeout(() => {
				setWithdrawSuccess(false);
				setShowWithdraw(false);
			}, 2000);
		});
	}

	return (
		<Layout>
			<div className="max-w-4xl mx-auto px-4 py-6">
				<div className="flex items-center justify-between mb-6">
					<h1 className="text-xl font-bold text-white">Earnings</h1>
					<Button variant="primary" onClick={() => setShowWithdraw(true)} leftIcon={<ArrowUpRight className="w-4 h-4" />} size="sm">
						Withdraw
					</Button>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
					{[
						{ label: 'Total Earnings', value: `$${creatorData.totalEarnings.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
						{ label: 'This Month', value: `$${creatorData.monthlyEarnings.toLocaleString()}`, icon: TrendingUp, color: 'text-rose-400', bg: 'bg-rose-500/15' },
						{ label: 'Tips Received', value: `$${creatorData.tipsReceived.toLocaleString()}`, icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/15' },
						{ label: 'Subscribers', value: creatorData.subscriberCount.toLocaleString(), icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/15' },
					].map(({ label, value, icon: Icon, color, bg }) => (
						<div key={label} className="bg-[#161616] border border-white/5 rounded-2xl p-4">
							<div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-2`}>
								<Icon className={`w-4 h-4 ${color}`} />
							</div>
							<p className="text-xl font-black text-white">{value}</p>
							<p className="text-xs text-white/40">{label}</p>
						</div>
					))}
				</div>

				<div className="bg-[#161616] border border-white/5 rounded-2xl p-5 mb-4">
					<h3 className="font-semibold text-white mb-4 flex items-center gap-2">
						<TrendingUp className="w-4 h-4 text-rose-400" />
						Monthly Breakdown
					</h3>
					<div className="space-y-3">
						{creatorData.monthlyStats.map((stat, i) => {
							const max = Math.max(...creatorData.monthlyStats.map(s => s.earnings));
							const pct = (stat.earnings / max) * 100;
							return (
								<div key={i} className="flex items-center gap-3">
									<p className="text-xs text-white/40 w-8 shrink-0">{stat.month}</p>
									<div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
										<div
											className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
											style={{ width: `${pct}%` }}
										>
											{pct > 30 && <span className="text-[10px] font-bold text-white">${stat.earnings.toLocaleString()}</span>}
										</div>
									</div>
									<p className="text-xs font-semibold text-white/60 w-16 text-right shrink-0">${stat.earnings.toLocaleString()}</p>
								</div>
							);
						})}
					</div>
				</div>

				<div className="bg-[#161616] border border-white/5 rounded-2xl p-5">
					<h3 className="font-semibold text-white mb-4">Revenue Sources</h3>
					<div className="space-y-3">
						{[
							{ label: 'Subscriptions', value: creatorData.monthlyEarnings - creatorData.tipsReceived * 0.1, color: 'bg-rose-500', pct: 80 },
							{ label: 'Tips', value: creatorData.tipsReceived, color: 'bg-amber-500', pct: 16 },
							{ label: 'PPV Content', value: Math.round(creatorData.monthlyEarnings * 0.04), color: 'bg-blue-500', pct: 4 },
						].map(({ label, value, color, pct }) => (
							<div key={label} className="flex items-center gap-3">
								<div className={`w-3 h-3 rounded-full ${color} shrink-0`} />
								<p className="text-sm text-white/60 flex-1">{label}</p>
								<div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
									<div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
								</div>
								<p className="text-sm font-semibold text-white/70 w-20 text-right">${value.toLocaleString()}</p>
							</div>
						))}
					</div>
				</div>
			</div>

			<Modal isOpen={showWithdraw} onClose={() => { setShowWithdraw(false); setWithdrawSuccess(false); }} title="Withdraw Earnings">
				<div className="p-5">
					{withdrawSuccess ? (
						<div className="text-center py-8">
							<div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
								<CheckCircle className="w-8 h-8 text-emerald-400" />
							</div>
							<p className="text-white font-semibold text-lg">Withdrawal Initiated!</p>
							<p className="text-white/40 text-sm mt-1">Funds will arrive in 2-3 business days</p>
						</div>
					) : (
						<div className="space-y-4">
							<div className="bg-white/5 rounded-xl p-3 flex justify-between">
								<span className="text-sm text-white/50">Available Balance</span>
								<span className="text-sm font-bold text-emerald-400">${creatorData.walletBalance.toFixed(2)}</span>
							</div>
							<div>
								<label className="block text-sm text-white/50 mb-1.5">Amount to Withdraw</label>
								<input
									type="number"
									value={withdrawAmount}
									onChange={e => setWithdrawAmount(e.target.value)}
									placeholder="0.00"
									max={creatorData.walletBalance}
									className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500/50"
								/>
							</div>
							<div>
								<label className="block text-sm text-white/50 mb-1.5">Bank Name</label>
								<input
									value={bankName}
									onChange={e => setBankName(e.target.value)}
									placeholder="e.g. Chase Bank"
									className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500/50"
								/>
							</div>
							<div>
								<label className="block text-sm text-white/50 mb-1.5">Account Number (last 4)</label>
								<input
									value={accountNumber}
									onChange={e => setAccountNumber(e.target.value)}
									placeholder="****1234"
									maxLength={8}
									className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500/50"
								/>
							</div>
							<Button variant="primary" fullWidth isLoading={isWithdrawing} onClick={() => { void handleWithdraw(); }}>
								Withdraw ${withdrawAmount || '0.00'}
							</Button>
						</div>
					)}
				</div>
			</Modal>
		</Layout>
	);
}
