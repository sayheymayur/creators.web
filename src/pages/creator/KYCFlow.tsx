import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, Clock, XCircle, Shield } from '../../components/icons';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/Button';
import { useCurrentCreator } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { mockCreators } from '../../data/users';
import { delayMs } from '../../utils/delay';

export function KYCFlow() {
	const creator = useCurrentCreator();
	const { showToast } = useNotifications();
	const navigate = useNavigate();
	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [idFront, setIdFront] = useState(false);
	const [idBack, setIdBack] = useState(false);
	const [selfie, setSelfie] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);

	const creatorData = creator ?? mockCreators[0];

	if (creatorData.kycStatus === 'approved') {
		return (
			<Layout>
				<div className="max-w-lg mx-auto px-4 py-12 text-center">
					<div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
						<CheckCircle className="w-8 h-8 text-emerald-400" />
					</div>
					<h2 className="text-xl font-bold text-white mb-2">Identity Verified</h2>
					<p className="text-white/40 mb-6">Your account is fully verified and you can monetize your content.</p>
					<Button variant="primary" onClick={() => { void navigate('/creator-dashboard'); }}>Go to Dashboard</Button>
				</div>
			</Layout>
		);
	}

	function handleSubmit() {
		if (!idFront || !idBack || !selfie) {
			showToast('Please upload all required documents', 'error'); return;
		}
		setIsSubmitting(true);
		void delayMs(1500).then(() => {
			setSubmitted(true);
			setIsSubmitting(false);
			showToast('KYC submitted! Review takes 1-2 business days.');
		});
	}

	if (submitted || creatorData.kycStatus === 'pending') {
		return (
			<Layout>
				<div className="max-w-lg mx-auto px-4 py-12 text-center">
					<div className="w-16 h-16 bg-amber-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
						<Clock className="w-8 h-8 text-amber-400" />
					</div>
					<h2 className="text-xl font-bold text-white mb-2">Under Review</h2>
					<p className="text-white/40 mb-6">Your documents have been submitted and are being reviewed. This typically takes 1-2 business days.</p>
					<div className="bg-[#161616] border border-white/5 rounded-2xl p-4 text-left mb-6">
						{['Government ID (Front)', 'Government ID (Back)', 'Selfie with ID'].map(doc => (
							<div key={doc} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
								<CheckCircle className="w-4 h-4 text-emerald-400" />
								<span className="text-sm text-white/60">{doc}</span>
								<span className="ml-auto text-xs text-emerald-400">Submitted</span>
							</div>
						))}
					</div>
					<Button variant="outline" onClick={() => { void navigate('/creator-dashboard'); }}>Back to Dashboard</Button>
				</div>
			</Layout>
		);
	}

	const STEPS = [
		{ title: 'Government ID Front', key: 'idFront' as const },
		{ title: 'Government ID Back', key: 'idBack' as const },
		{ title: 'Selfie with ID', key: 'selfie' as const },
	];

	const currentStep = STEPS[step - 1];
	const uploadedMap = { idFront, idBack, selfie };
	const setUploadedMap = { idFront: setIdFront, idBack: setIdBack, selfie: setSelfie };

	return (
		<Layout>
			<div className="max-w-lg mx-auto px-4 py-6">
				<div className="flex items-center gap-3 mb-6">
					<div className="w-10 h-10 bg-rose-500/15 rounded-xl flex items-center justify-center">
						<Shield className="w-5 h-5 text-rose-400" />
					</div>
					<div>
						<h1 className="text-xl font-bold text-white">Identity Verification</h1>
						<p className="text-white/40 text-sm">Required to monetize your content</p>
					</div>
				</div>

				{creatorData.kycStatus === 'rejected' && (
					<div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 mb-4 flex gap-2">
						<XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
						<div>
							<p className="text-sm font-medium text-rose-300">Previous submission rejected</p>
							<p className="text-xs text-rose-400/70 mt-0.5">ID document is blurry and unreadable. Please resubmit with clear photos.</p>
						</div>
					</div>
				)}

				<div className="flex gap-2 mb-6">
					{[1, 2, 3].map(s => (
						<div key={s} className={`flex-1 h-1 rounded-full transition-all ${s <= step ? 'bg-rose-500' : 'bg-white/10'}`} />
					))}
				</div>

				<div className="bg-[#161616] border border-white/5 rounded-2xl p-5 mb-4">
					<h3 className="font-semibold text-white mb-1">Step {step}: {currentStep.title}</h3>
					<p className="text-white/40 text-sm mb-4">Upload a clear photo of your {currentStep.title.toLowerCase()}</p>

					<button
						type="button"
						onClick={() => { setUploadedMap[currentStep.key](true); }}
						className={`w-full border-2 border-dashed rounded-2xl py-10 flex flex-col items-center gap-3 transition-all ${
							uploadedMap[currentStep.key] ?
								'border-emerald-500/50 bg-emerald-500/5' :
								'border-white/10 hover:border-rose-500/30 hover:bg-white/2'
						}`}
					>
						{uploadedMap[currentStep.key] ? (
							<>
								<CheckCircle className="w-10 h-10 text-emerald-400" />
								<p className="text-emerald-400 font-medium text-sm">Document uploaded</p>
							</>
						) : (
							<>
								<Upload className="w-10 h-10 text-white/20" />
								<p className="text-white/40 text-sm">Click to upload {currentStep.title}</p>
								<p className="text-white/20 text-xs">Accepted: JPG, PNG, PDF</p>
							</>
						)}
					</button>
				</div>

				<div className="flex gap-2">
					{step > 1 && (
						<Button variant="outline" onClick={() => setStep(s => (s - 1) as typeof step)}>
							Back
						</Button>
					)}
					{step < 3 ? (
						<Button
							variant="primary"
							fullWidth
							disabled={!uploadedMap[currentStep.key]}
							onClick={() => setStep(s => (s + 1) as typeof step)}
						>
							Continue
						</Button>
					) : (
						<Button
							variant="primary"
							fullWidth
							isLoading={isSubmitting}
							onClick={() => { void handleSubmit(); }}
						>
							Submit for Verification
						</Button>
					)}
				</div>
			</div>
		</Layout>
	);
}
