import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertTriangle, Calendar } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';

export function AgeVerification() {
	const navigate = useNavigate();
	const { verifyAge } = useAuth();
	const [dob, setDob] = useState('');
	const [error, setError] = useState('');

	function handleVerify() {
		if (!dob) { setError('Please enter your date of birth'); return; }
		const birthDate = new Date(dob);
		const today = new Date();
		const age = today.getFullYear() - birthDate.getFullYear();
		const monthDiff = today.getMonth() - birthDate.getMonth();
		const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;

		if (actualAge < 18) {
			setError('You must be 18 or older to access this platform.');
			return;
		}
		verifyAge();
		navigate('/login');
	}

	const maxDate = new Date();
	maxDate.setFullYear(maxDate.getFullYear() - 18);

	return (
		<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
			<div className="w-full max-w-sm">
				<div className="text-center mb-8">
					<div className="w-16 h-16 bg-amber-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
						<Shield className="w-8 h-8 text-amber-400" />
					</div>
					<h1 className="text-2xl font-bold text-foreground mb-2">Age Verification</h1>
					<p className="text-muted text-sm">This platform contains adult content. You must be 18 or older to continue.</p>
				</div>

				<div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 flex gap-2">
					<AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
					<p className="text-xs text-amber-300/80">By continuing, you confirm you are at least 18 years old and agree to our Terms of Service.</p>
				</div>

				<div className="mb-5">
					<label className="block text-sm font-medium text-muted mb-2">
						<Calendar className="w-4 h-4 inline mr-1.5 -mt-0.5" />
						Date of Birth
					</label>
					<input
						type="date"
						value={dob}
						onChange={e => { setDob(e.target.value); setError(''); }}
						max={maxDate.toISOString().split('T')[0]}
						className="w-full bg-input border border-border/20 rounded-xl px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40 transition-colors"
					/>
					{error && <p className="text-rose-400 text-xs mt-1.5">{error}</p>}
				</div>

				<Button variant="primary" fullWidth size="lg" onClick={handleVerify}>
					Verify My Age
				</Button>

				<p className="text-center text-xs text-muted/80 mt-4">
					Exit if you are under 18
				</p>
			</div>
		</div>
	);
}
