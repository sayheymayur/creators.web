import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { delayMs } from '../../utils/delay';

export function OTPVerification() {
	const navigate = useNavigate();
	const { state } = useAuth();
	const [otp, setOtp] = useState(['', '', '', '', '', '']);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState('');
	const [countdown, setCountdown] = useState(60);
	const [canResend, setCanResend] = useState(false);
	const [success, setSuccess] = useState(false);
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

	useEffect(() => {
		inputRefs.current[0]?.focus();
		const timer = setInterval(() => {
			setCountdown(prev => {
				if (prev <= 1) {
					setCanResend(true);
					clearInterval(timer);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	function handleChange(index: number, value: string) {
		if (!/^\d*$/.test(value)) return;
		const newOtp = [...otp];
		newOtp[index] = value.slice(-1);
		setOtp(newOtp);
		setError('');
		if (value && index < 5) inputRefs.current[index + 1]?.focus();
	}

	function handleKeyDown(index: number, e: React.KeyboardEvent) {
		if (e.key === 'Backspace' && !otp[index] && index > 0) {
			inputRefs.current[index - 1]?.focus();
		}
	}

	function handlePaste(e: React.ClipboardEvent) {
		const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
		if (text.length === 6) {
			setOtp(text.split(''));
			inputRefs.current[5]?.focus();
		}
	}

	function handleVerify() {
		const code = otp.join('');
		if (code.length < 6) { setError('Please enter the 6-digit code'); return; }
		setIsLoading(true);
		void delayMs(1000).then(() => {
			if (code === '123456' || code === '000000') {
				setSuccess(true);
				void delayMs(1000).then(() => { void navigate('/login'); });
			} else {
				setError('Invalid code. Use 123456 for demo.');
			}
			setIsLoading(false);
		});
	}

	function handleResend() {
		if (!canResend) return;
		setCountdown(60);
		setCanResend(false);
		setOtp(['', '', '', '', '', '']);
		setError('');
		inputRefs.current[0]?.focus();
		const timer = setInterval(() => {
			setCountdown(prev => {
				if (prev <= 1) {
					setCanResend(true);
					clearInterval(timer);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
	}

	return (
		<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
			<div className="w-full max-w-sm">
				<div className="text-center mb-8">
					{success ? (
						<div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
							<CheckCircle className="w-8 h-8 text-emerald-400" />
						</div>
					) : (
						<div className="w-16 h-16 bg-rose-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
							<Mail className="w-8 h-8 text-rose-400" />
						</div>
					)}
					<h1 className="text-2xl font-bold text-foreground mb-2">
						{success ? 'Email Verified!' : 'Verify Your Email'}
					</h1>
					<p className="text-muted text-sm">
						{success ?
							'Your account is ready. Redirecting...' :
							`Enter the 6-digit code sent to ${state.pendingEmail || 'your email'}`}
					</p>
					{!success && (
						<p className="text-muted/80 text-xs mt-1">Demo code: 123456</p>
					)}
				</div>

				{!success && (
					<>
						<div className="flex gap-2 justify-center mb-5" onPaste={handlePaste}>
							{otp.map((digit, i) => (
								<input
									key={i}
									ref={el => { inputRefs.current[i] = el; }}
									type="text"
									inputMode="numeric"
									maxLength={1}
									value={digit}
									onChange={e => handleChange(i, e.target.value)}
									onKeyDown={e => handleKeyDown(i, e)}
									className={`w-11 h-12 text-center text-lg font-bold bg-input border rounded-xl text-foreground focus:outline-none transition-all ${
										digit ? 'border-rose-500 bg-rose-500/5' : error ? 'border-rose-500/50' : 'border-border/20 focus:border-ring/40'
									}`}
								/>
							))}
						</div>
						{error && <p className="text-rose-400 text-sm text-center mb-4">{error}</p>}

						<Button variant="primary" fullWidth size="lg" onClick={() => { handleVerify(); }} isLoading={isLoading}>
							Verify Code
						</Button>

						<button
							onClick={handleResend}
							disabled={!canResend}
							className={`w-full flex items-center justify-center gap-2 mt-4 text-sm transition-colors ${
								canResend ? 'text-rose-400 hover:text-rose-300' : 'text-muted/80'
							}`}
						>
							<RefreshCw className="w-4 h-4" />
							{canResend ? 'Resend Code' : `Resend in ${countdown}s`}
						</button>
					</>
				)}
			</div>
		</div>
	);
}
