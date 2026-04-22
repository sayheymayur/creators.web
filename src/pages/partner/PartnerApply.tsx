import { useNavigate } from 'react-router-dom';
import { CreatorApplyForm } from '../../components/marketing/CreatorApplyForm';

export function PartnerApply() {
	const navigate = useNavigate();

	return (
		<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-10">
			<div className="w-full max-w-2xl">
				<button type="button" onClick={() => { void navigate('/'); }} className="flex items-center gap-2 mb-8">
					<div className="w-8 h-8 bg-rose-500 rounded-xl flex items-center justify-center">
						<span className="text-white font-black text-sm">cw</span>
					</div>
					<span className="font-bold text-foreground text-lg">creators.web</span>
				</button>

				<div className="mb-6">
					<h1 className="text-3xl sm:text-4xl font-black text-foreground mb-2">Become a Creator</h1>
					<p className="text-sm text-muted leading-relaxed max-w-xl">
						Apply to become a verified creator on creators.web. Share your details and upload sample media (optional).
					</p>
				</div>

				<CreatorApplyForm />
			</div>
		</div>
	);
}
