import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ContentProvider } from './context/ContentContext';
import { ChatProvider } from './context/ChatContext';
import { WalletProvider } from './context/WalletContext';
import { NotificationProvider } from './context/NotificationContext';
import { CallProvider } from './context/CallContext';
import { SessionProvider } from './context/SessionContext';
import { LiveStreamProvider } from './context/LiveStreamContext';
import { ThemeProvider } from './context/ThemeContext';
import { WsProvider } from './context/WsContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { SessionsProvider } from './context/SessionsContext';
import { CallSessionProvider } from './context/CallSessionContext';
import { MinimizedCallWindow } from './components/call/MinimizedCallWindow';

import { Landing } from './pages/Landing';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { AgeVerification } from './pages/auth/AgeVerification';
import { OTPVerification } from './pages/auth/OTPVerification';
import { PartnerApply } from './pages/partner/PartnerApply';

import { Feed } from './pages/fan/Feed';
import { Explore } from './pages/fan/Explore';
import { CreatorProfile } from './pages/fan/CreatorProfile';
import { Saved } from './pages/fan/Saved';

import { MessagesList } from './pages/chat/MessagesList';
import { ChatRoom } from './pages/chat/ChatRoom';

import { Wallet } from './pages/wallet/Wallet';

import { CreatorDashboard } from './pages/creator/CreatorDashboard';
import { ContentManager } from './pages/creator/ContentManager';
import { Earnings } from './pages/creator/Earnings';
import { Subscribers } from './pages/creator/Subscribers';
import { ProfileEditor } from './pages/creator/ProfileEditor';
import { KYCFlow } from './pages/creator/KYCFlow';

import { AdminDashboard } from './pages/admin/AdminDashboard';
import { CreatorApproval } from './pages/admin/CreatorApproval';
import { UserManagement } from './pages/admin/UserManagement';
import { ContentModeration } from './pages/admin/ContentModeration';
import { SubscriptionWsSimulation } from './pages/admin/SubscriptionWsSimulation';

import { Settings } from './pages/Settings';
import { ActiveCallScreen } from './pages/call/ActiveCallScreen';
import { CallHistory } from './pages/call/CallHistory';
import { TimedChatRoom } from './pages/session/TimedChatRoom';
import { LiveStreamRoom } from './pages/live/LiveStreamRoom';
import { GoLivePage } from './pages/live/GoLivePage';
import { Contact } from './pages/Contact';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { DeleteAccountRequest } from './pages/DeleteAccountRequest';
import { DeleteAccountRequestSuccess } from './pages/DeleteAccountRequestSuccess.tsx';

type ErrorBoundaryState = {
	hasError: boolean,
	error?: unknown,
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
	constructor(props: { children: React.ReactNode }) {
		super(props);
		this.state = { hasError: false, error: undefined };
	}

	static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: unknown, info: unknown) {
		console.error('App crashed:', error, info);
	}

	render() {
		if (this.state.hasError) {
			const error = this.state.error;
			const isDev = import.meta.env.DEV;
			const message =
				error instanceof Error ?
					error.message :
					typeof error === 'string' ?
						error :
						'';

			return (
				<div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
					<div className="max-w-[480px] text-center">
						<h1 className="text-2xl font-bold mb-2">The app crashed</h1>
						<p className="text-sm text-muted mb-4">
							Something went wrong while rendering this page. Please retry. If it keeps happening,
							check the console for the exact error.
						</p>
						{isDev && message && (
							<details className="text-left bg-surface2 border border-border/20 rounded-2xl p-3 mb-4">
								<summary className="cursor-pointer text-xs font-semibold text-muted">
									Error details (dev)
								</summary>
								<pre className="mt-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-rose-300">
									{message}
								</pre>
							</details>
						)}
						<button
							onClick={() => this.setState({ hasError: false, error: undefined })}
							className="px-4 py-2 rounded-full border border-border/30 bg-transparent text-foreground hover:bg-foreground/5 transition-colors"
						>
							Retry
						</button>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}

function AuthBootScreen() {
	const { sessionRestoreError, retrySessionRestore } = useAuth();
	return (
		<div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
			<div className="w-full max-w-[420px] text-center">
				<div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-border/30 border-t-foreground/80 animate-spin" />
				<h1 className="text-xl font-semibold mb-1">Checking your session</h1>
				<p className="text-sm text-muted mb-4">Please wait a moment…</p>
				{sessionRestoreError && (
					<div className="text-left bg-surface2 border border-border/20 rounded-2xl p-3">
						<p className="text-xs font-semibold text-muted mb-1">We couldn’t restore your session.</p>
						<p className="text-xs text-foreground/80 break-words">{sessionRestoreError}</p>
						<button
							onClick={retrySessionRestore}
							className="mt-3 px-4 py-2 rounded-full border border-border/30 bg-transparent text-foreground hover:bg-foreground/5 transition-colors text-sm"
						>
							Retry
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode, roles?: string[] }) {
	const { state, authStatus } = useAuth();
	if (authStatus === 'unknown') return <AuthBootScreen />;
	if (!state.isAuthenticated) return <Navigate to="/login" replace />;
	if (roles && state.user && !roles.includes(state.user.role)) {
		const redirect = state.user.role === 'admin' ? '/admin' :
			state.user.role === 'creator' ? '/creator-dashboard' : '/feed';
		return <Navigate to={redirect} replace />;
	}
	return <>{children}</>;
}

function getAuthedRedirectPath(role?: string | null) {
	return role === 'admin' ? '/admin' :
		role === 'creator' ? '/creator-dashboard' : '/feed';
}

function GuestRoute({ children }: { children: React.ReactNode }) {
	const { state, authStatus } = useAuth();
	if (authStatus === 'unknown') return <AuthBootScreen />;
	if (state.isAuthenticated) return <Navigate to={getAuthedRedirectPath(state.user?.role)} replace />;
	return <>{children}</>;
}

function AppFallbackRoute() {
	const { state, authStatus } = useAuth();
	if (authStatus === 'unknown') return <AuthBootScreen />;
	return (
		<Navigate
			to={state.isAuthenticated ? getAuthedRedirectPath(state.user?.role) : '/'}
			replace
		/>
	);
}

function AppRoutes() {
	const { state } = useAuth();

	return (
		<Routes>
			<Route path="/" element={<GuestRoute><Landing /></GuestRoute>} />
			<Route path="/contact" element={<Contact />} />
			<Route path="/privacy-policy" element={<PrivacyPolicy />} />
			<Route path="/partner/apply" element={<PartnerApply />} />
			<Route path="/creator/apply" element={<PartnerApply />} />
			<Route
				path="/login" element={state.isAuthenticated ? (
					<Navigate to={state.user?.role === 'admin' ? '/admin' : state.user?.role === 'creator' ? '/creator-dashboard' : '/feed'} replace />
				) : <Login />}
			/>
			<Route path="/register" element={<Register />} />
			<Route path="/verify-age" element={<AgeVerification />} />
			<Route path="/otp" element={<OTPVerification />} />

			<Route path="/explore" element={<ProtectedRoute><Explore /></ProtectedRoute>} />
			<Route path="/feed" element={<ProtectedRoute roles={['fan']}><Feed /></ProtectedRoute>} />
			<Route path="/saved" element={<ProtectedRoute roles={['fan']}><Saved /></ProtectedRoute>} />
			<Route path="/creator/:id" element={<ProtectedRoute><CreatorProfile /></ProtectedRoute>} />

			<Route path="/messages" element={<ProtectedRoute><MessagesList /></ProtectedRoute>} />
			<Route path="/messages/:id" element={<ProtectedRoute><ChatRoom /></ProtectedRoute>} />

			<Route path="/wallet" element={<ProtectedRoute roles={['fan']}><Wallet /></ProtectedRoute>} />

			<Route path="/creator-dashboard" element={<ProtectedRoute roles={['creator']}><CreatorDashboard /></ProtectedRoute>} />
			<Route path="/creator-dashboard/content" element={<ProtectedRoute roles={['creator']}><ContentManager /></ProtectedRoute>} />
			<Route path="/creator-dashboard/earnings" element={<ProtectedRoute roles={['creator']}><Earnings /></ProtectedRoute>} />
			<Route path="/creator-dashboard/subscribers" element={<ProtectedRoute roles={['creator']}><Subscribers /></ProtectedRoute>} />
			<Route path="/creator-dashboard/profile" element={<ProtectedRoute roles={['creator']}><ProfileEditor /></ProtectedRoute>} />
			<Route path="/creator-dashboard/kyc" element={<ProtectedRoute roles={['creator']}><KYCFlow /></ProtectedRoute>} />

			<Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
			<Route path="/admin/creators" element={<ProtectedRoute roles={['admin']}><CreatorApproval /></ProtectedRoute>} />
			<Route path="/admin/users" element={<ProtectedRoute roles={['admin']}><UserManagement /></ProtectedRoute>} />
			<Route path="/admin/moderation" element={<ProtectedRoute roles={['admin']}><ContentModeration /></ProtectedRoute>} />
			<Route path="/admin/subscription-ws" element={<ProtectedRoute roles={['admin']}><SubscriptionWsSimulation /></ProtectedRoute>} />
			<Route path="/admin/reports" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />

			<Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
			<Route
				path="/delete-account-request"
				element={<ProtectedRoute roles={['fan', 'creator']}><DeleteAccountRequest /></ProtectedRoute>}
			/>
			<Route
				path="/delete-account-request/success"
				element={<ProtectedRoute roles={['fan', 'creator']}><DeleteAccountRequestSuccess /></ProtectedRoute>}
			/>
			<Route path="/call" element={<ProtectedRoute><ActiveCallScreen /></ProtectedRoute>} />
			<Route path="/call-history" element={<ProtectedRoute><CallHistory /></ProtectedRoute>} />
			<Route path="/session/chat/:creatorId" element={<ProtectedRoute><TimedChatRoom /></ProtectedRoute>} />
			<Route path="/live/:streamId" element={<ProtectedRoute><LiveStreamRoom /></ProtectedRoute>} />
			<Route path="/go-live" element={<ProtectedRoute roles={['creator']}><GoLivePage /></ProtectedRoute>} />

			<Route path="*" element={<AppFallbackRoute />} />
		</Routes>
	);
}

function Providers({ children }: { children: React.ReactNode }) {
	return (
		<BrowserRouter>
			<ThemeProvider>
				<AuthProvider>
					<WsProvider>
						<SubscriptionProvider>
							<NotificationProvider>
								<ContentProvider>
									<ChatProvider>
										<WalletProvider>
											<CallProvider>
												<SessionProvider>
													<SessionsProvider>
														<CallSessionProvider>
															<LiveStreamProvider>
																{children}
															</LiveStreamProvider>
														</CallSessionProvider>
													</SessionsProvider>
												</SessionProvider>
											</CallProvider>
										</WalletProvider>
									</ChatProvider>
								</ContentProvider>
							</NotificationProvider>
						</SubscriptionProvider>
					</WsProvider>
				</AuthProvider>
			</ThemeProvider>
		</BrowserRouter>
	);
}

export default function App() {
	return (
		<Providers>
			<ErrorBoundary>
				<AppRoutes />
				<MinimizedCallWindow />
			</ErrorBoundary>
		</Providers>
	);
}
