import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';

type SuccessState = {
	fullName?: string,
	email?: string,
	profileHint?: string,
};

export function DeleteAccountRequestSuccess() {
	const navigate = useNavigate();
	const location = useLocation();
	const { state: authState } = useAuth();
	const user = authState.user;

	const st = (location.state ?? {}) as SuccessState;

	const goTo = useMemo(() => {
		if (!user) return '/';
		if (user.role === 'creator') return '/creator-dashboard';
		if (user.role === 'fan') return '/feed';
		return '/';
	}, [user]);

	const primaryLabel = useMemo(() => {
		if (!user) return 'Go to home';
		if (user.role === 'creator') return 'Go to dashboard';
		if (user.role === 'fan') return 'Go to feed';
		return 'Go to home';
	}, [user]);

	const ref = useMemo(() => {
		const parts = [st.fullName?.trim(), st.email?.trim(), st.profileHint?.trim()].filter(Boolean) as string[];
		return parts.join(' · ');
	}, [st.email, st.fullName, st.profileHint]);

	return (
		<Layout>
			<div className="max-w-2xl mx-auto px-4 py-8">
				<div className="bg-surface border border-border/20 rounded-2xl p-6">
					<h1 className="text-xl font-bold text-foreground">Request submitted</h1>
					<p className="text-sm text-muted mt-1">
						Thanks! We received your request. Our team will follow up within 24–48 hours (business days).
					</p>

					{ref ? (
						<div className="mt-4 rounded-2xl border border-border/20 bg-surface2 px-4 py-3">
							<p className="text-xs text-muted">Reference</p>
							<p className="text-sm text-foreground mt-1 break-words">{ref}</p>
						</div>
					) : null}

					<div className="mt-5 flex flex-col sm:flex-row gap-3">
						<button
							type="button"
							onClick={() => { void navigate(goTo, { replace: true }); }}
							className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-6 py-3 rounded-2xl transition-all active:scale-95 shadow-sm w-full sm:w-auto"
						>
							{primaryLabel}
						</button>
					</div>
				</div>
			</div>
		</Layout>
	);
}
