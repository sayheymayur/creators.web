import { useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Eye } from '../../components/icons';
import { Navbar } from '../../components/layout/Navbar';
import { ToastContainer, Modal } from '../../components/ui/Toast';
import { useNotifications } from '../../context/NotificationContext';
import { mockReports } from '../../data/transactions';
import { mockPosts } from '../../data/posts';
import type { Report } from '../../types';
import { formatDate } from '../../utils/date';

export function ContentModeration() {
	const { showToast } = useNotifications();
	const [reports, setReports] = useState<Report[]>(mockReports);
	const [selectedReport, setSelectedReport] = useState<Report | null>(null);
	const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending');

	const displayed = reports.filter(r => filter === 'all' || r.status === filter);

	function handleResolve(id: string) {
		setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'resolved' } : r));
		showToast('Report marked as resolved');
		setSelectedReport(null);
	}

	function handleDismiss(id: string) {
		setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'dismissed' } : r));
		showToast('Report dismissed');
		setSelectedReport(null);
	}

	const relatedPost = selectedReport?.targetType === 'post' ?
		mockPosts.find(p => p.id === selectedReport.targetId) :
		null;

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Navbar />
			<ToastContainer />
			<div className="max-w-4xl mx-auto px-4 pt-20 pb-8">
				<div className="flex items-center gap-3 mb-6">
					<AlertTriangle className="w-5 h-5 text-amber-400" />
					<h1 className="text-xl font-bold text-foreground">Content Moderation</h1>
				</div>

				<div className="flex gap-1 bg-foreground/5 p-0.5 rounded-xl mb-4 w-fit">
					{(['pending', 'resolved', 'all'] as const).map(f => (
						<button
							key={f}
							onClick={() => setFilter(f)}
							className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all capitalize ${
								filter === f ? 'bg-foreground/10 text-foreground' : 'text-muted'
							}`}
						>
							{f} {f === 'pending' && `(${reports.filter(r => r.status === 'pending').length})`}
						</button>
					))}
				</div>

				<div className="space-y-3">
					{displayed.length === 0 ? (
						<div className="text-center py-10 bg-surface border border-border/20 rounded-2xl">
							<CheckCircle className="w-8 h-8 text-muted/50 mx-auto mb-2" />
							<p className="text-muted text-sm">No reports in this category</p>
						</div>
					) : (
						displayed.map(report => (
							<div key={report.id} className="bg-surface border border-border/20 rounded-2xl p-4">
								<div className="flex items-start justify-between gap-3 mb-3">
									<div>
										<div className="flex items-center gap-2 mb-1">
											<span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${
												report.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
												report.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-400' :
												'bg-foreground/10 text-muted'
											}`}
											>
												{report.status}
											</span>
											<span className="text-[10px] bg-foreground/5 text-muted px-2 py-0.5 rounded-full capitalize">
												{report.targetType}
											</span>
										</div>
										<p className="text-sm font-semibold text-foreground">{report.reason}</p>
										<p className="text-xs text-muted mt-0.5">Reported by {report.reporterName} · {formatDate(report.createdAt)}</p>
									</div>
								</div>
								<p className="text-xs text-foreground/80 bg-foreground/5 rounded-xl px-3 py-2 mb-3">{report.description}</p>
								{report.status === 'pending' && (
									<div className="flex gap-2">
										<button
											onClick={() => setSelectedReport(report)}
											className="flex-1 flex items-center justify-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 text-muted hover:text-foreground text-xs py-2 rounded-xl transition-colors"
										>
											<Eye className="w-3.5 h-3.5" /> View
										</button>
										<button
											onClick={() => handleResolve(report.id)}
											className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs py-2 rounded-xl transition-colors"
										>
											<CheckCircle className="w-3.5 h-3.5" /> Resolve
										</button>
										<button
											onClick={() => handleDismiss(report.id)}
											className="flex-1 flex items-center justify-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 text-muted text-xs py-2 rounded-xl transition-colors"
										>
											<XCircle className="w-3.5 h-3.5" /> Dismiss
										</button>
									</div>
								)}
							</div>
						))
					)}
				</div>
			</div>

			{selectedReport && (
				<Modal isOpen onClose={() => setSelectedReport(null)} title="Report Details" maxWidth="max-w-lg">
					<div className="p-5 space-y-4">
						<div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
							<p className="text-sm font-semibold text-amber-300">{selectedReport.reason}</p>
							<p className="text-xs text-amber-400/70 mt-1">{selectedReport.description}</p>
						</div>
						{relatedPost && (
							<div className="bg-foreground/5 rounded-xl p-3">
								<p className="text-xs text-muted mb-2">Reported Content:</p>
								{relatedPost.mediaUrl && (
									<img src={relatedPost.mediaUrl} alt="" className="w-full h-32 object-cover rounded-xl mb-2" />
								)}
								<p className="text-xs text-foreground/80 line-clamp-3">{relatedPost.text}</p>
								<p className="text-xs text-muted/80 mt-1">By {relatedPost.creatorName}</p>
							</div>
						)}
						<div className="flex gap-2">
							<button
								onClick={() => handleResolve(selectedReport.id)}
								className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 py-2.5 rounded-xl text-sm font-medium transition-colors"
							>
								<CheckCircle className="w-4 h-4" /> Resolve
							</button>
							<button
								onClick={() => handleDismiss(selectedReport.id)}
								className="flex-1 flex items-center justify-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 text-muted py-2.5 rounded-xl text-sm font-medium transition-colors"
							>
								<XCircle className="w-4 h-4" /> Dismiss
							</button>
						</div>
					</div>
				</Modal>
			)}
		</div>
	);
}
