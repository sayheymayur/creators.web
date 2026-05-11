import { useState } from 'react';
import { CheckCircle, XCircle, Eye, Clock, Shield } from '../../components/icons';
import { Navbar } from '../../components/layout/Navbar';
import { ToastContainer, Modal } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { useNotifications } from '../../context/NotificationContext';
import { mockKYCApplications } from '../../data/transactions';
import type { KYCApplication } from '../../types';
import { formatDate } from '../../utils/date';
import { UserAvatarMedia } from '../../components/ui/Avatar';

export function CreatorApproval() {
	const { showToast } = useNotifications();
	const [applications, setApplications] = useState<KYCApplication[]>(mockKYCApplications);
	const [selectedApp, setSelectedApp] = useState<KYCApplication | null>(null);
	const [rejectReason, setRejectReason] = useState('');
	const [showRejectModal, setShowRejectModal] = useState(false);
	const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

	const displayed = activeTab === 'pending' ?
		applications.filter(a => a.status === 'pending') :
		applications;

	function handleApprove(id: string) {
		setApplications(prev => prev.map(a => a.id === id ? { ...a, status: 'approved' } : a));
		showToast('Creator approved successfully!');
		setSelectedApp(null);
	}

	function handleReject() {
		if (!selectedApp || !rejectReason.trim()) { showToast('Please provide a rejection reason', 'error'); return; }
		setApplications(prev => prev.map(a =>
			a.id === selectedApp.id ? { ...a, status: 'rejected', rejectionReason: rejectReason } : a
		));
		showToast('Creator application rejected');
		setShowRejectModal(false);
		setSelectedApp(null);
		setRejectReason('');
	}

	const statusColors = {
		pending: 'bg-amber-500/20 text-amber-400',
		approved: 'bg-emerald-500/20 text-emerald-400',
		rejected: 'bg-rose-500/20 text-rose-400',
		not_submitted: 'bg-foreground/10 text-muted',
	};

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Navbar />
			<ToastContainer />
			<div className="max-w-4xl mx-auto px-4 pt-20 pb-8">
				<div className="flex items-center gap-3 mb-6">
					<Shield className="w-5 h-5 text-rose-400" />
					<h1 className="text-xl font-bold text-foreground">KYC Applications</h1>
				</div>

				<div className="flex gap-1 bg-foreground/5 p-0.5 rounded-xl mb-4 w-fit">
					{(['pending', 'all'] as const).map(tab => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all capitalize ${
								activeTab === tab ? 'bg-foreground/10 text-foreground' : 'text-muted'
							}`}
						>
							{tab} {tab === 'pending' && `(${applications.filter(a => a.status === 'pending').length})`}
						</button>
					))}
				</div>

				<div className="space-y-3">
					{displayed.length === 0 ? (
						<div className="text-center py-10 bg-surface border border-border/20 rounded-2xl">
							<Clock className="w-8 h-8 text-muted/50 mx-auto mb-2" />
							<p className="text-muted text-sm">No pending applications</p>
						</div>
					) : (
						displayed.map(app => (
							<div key={app.id} className="bg-surface border border-border/20 rounded-2xl p-4">
								<div className="flex items-start gap-4">
									<UserAvatarMedia src={app.creatorAvatar} alt={app.creatorName} className="w-12 h-12 rounded-xl object-cover shrink-0" />
									<div className="flex-1 min-w-0">
										<div className="flex items-start justify-between gap-2 mb-1">
											<div>
												<p className="font-semibold text-foreground">{app.creatorName}</p>
												<p className="text-xs text-muted">{app.creatorEmail}</p>
												<p className="text-xs text-muted/80 mt-0.5">Submitted {formatDate(app.submittedAt)}</p>
											</div>
											<span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusColors[app.status]}`}>
												{app.status}
											</span>
										</div>
										{app.rejectionReason && (
											<p className="text-xs text-rose-400/80 bg-rose-500/10 rounded-lg px-2 py-1 mt-1">
												Reason: {app.rejectionReason}
											</p>
										)}
									</div>
								</div>
								{app.status === 'pending' && (
									<div className="flex gap-2 mt-3">
										<button
											onClick={() => setSelectedApp(app)}
											className="flex-1 flex items-center justify-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 text-muted hover:text-foreground text-sm py-2 rounded-xl transition-colors"
										>
											<Eye className="w-4 h-4" /> Review
										</button>
										<button
											onClick={() => handleApprove(app.id)}
											className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm py-2 rounded-xl transition-colors"
										>
											<CheckCircle className="w-4 h-4" /> Approve
										</button>
										<button
											onClick={() => { setSelectedApp(app); setShowRejectModal(true); }}
											className="flex-1 flex items-center justify-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm py-2 rounded-xl transition-colors"
										>
											<XCircle className="w-4 h-4" /> Reject
										</button>
									</div>
								)}
							</div>
						))
					)}
				</div>
			</div>

			{selectedApp && !showRejectModal && (
				<Modal isOpen title="Review KYC Application" onClose={() => setSelectedApp(null)} maxWidth="max-w-lg">
					<div className="p-5 space-y-4">
						<div className="flex items-center gap-3">
							<UserAvatarMedia src={selectedApp.creatorAvatar} alt={selectedApp.creatorName} className="w-12 h-12 rounded-xl object-cover" />
							<div>
								<p className="font-semibold text-foreground">{selectedApp.creatorName}</p>
								<p className="text-xs text-muted">{selectedApp.creatorEmail}</p>
							</div>
						</div>
						<div className="grid grid-cols-3 gap-2">
							{[
								{ label: 'ID Front', url: selectedApp.idFrontUrl },
								{ label: 'ID Back', url: selectedApp.idBackUrl },
								{ label: 'Selfie', url: selectedApp.selfieUrl },
							].map(({ label, url }) => (
								<div key={label}>
									<p className="text-xs text-muted mb-1">{label}</p>
									<img src={url} alt={label} className="w-full h-24 object-cover rounded-xl" />
								</div>
							))}
						</div>
						<div className="flex gap-2">
							<Button variant="primary" fullWidth onClick={() => handleApprove(selectedApp.id)}>
								<CheckCircle className="w-4 h-4" /> Approve
							</Button>
							<Button variant="danger" fullWidth onClick={() => setShowRejectModal(true)}>
								<XCircle className="w-4 h-4" /> Reject
							</Button>
						</div>
					</div>
				</Modal>
			)}

			<Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject Application">
				<div className="p-5">
					<p className="text-sm text-muted mb-3">Provide a reason for rejection. This will be shared with the creator.</p>
					<textarea
						value={rejectReason}
						onChange={e => setRejectReason(e.target.value)}
						placeholder="e.g., ID documents are blurry..."
						rows={3}
						className="w-full bg-input border border-border/20 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 resize-none mb-3"
					/>
					<Button variant="danger" fullWidth onClick={handleReject}>
						Confirm Rejection
					</Button>
				</div>
			</Modal>
		</div>
	);
}
