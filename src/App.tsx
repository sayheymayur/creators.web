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

import { Landing } from './pages/Landing';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { AgeVerification } from './pages/auth/AgeVerification';
import { OTPVerification } from './pages/auth/OTPVerification';

import { Feed } from './pages/fan/Feed';
import { Explore } from './pages/fan/Explore';
import { CreatorProfile } from './pages/fan/CreatorProfile';

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

import { Settings } from './pages/Settings';
import { ActiveCallScreen } from './pages/call/ActiveCallScreen';
import { CallHistory } from './pages/call/CallHistory';
import { TimedChatRoom } from './pages/session/TimedChatRoom';
import { LiveStreamRoom } from './pages/live/LiveStreamRoom';
import { GoLivePage } from './pages/live/GoLivePage';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
	constructor(props: { children: React.ReactNode }) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: unknown) {
		console.error('App crashed:', error);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
					<div className="max-w-[480px] text-center">
						<h1 className="text-2xl font-bold mb-2">Something blocked the app</h1>
						<p className="text-sm text-muted mb-4">
							A browser extension or network filter likely blocked a script the app needs.
							Try opening this site in an incognito window or disabling ad/privacy blockers for this domain.
						</p>
						<button
							onClick={() => this.setState({ hasError: false })}
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

function ProtectedRoute({ children, roles }: { children: React.ReactNode, roles?: string[] }) {
	const { state } = useAuth();
	if (!state.isAuthenticated) return <Navigate to="/login" replace />;
	if (roles && state.user && !roles.includes(state.user.role)) {
		const redirect = state.user.role === 'admin' ? '/admin' :
			state.user.role === 'creator' ? '/creator-dashboard' : '/feed';
		return <Navigate to={redirect} replace />;
	}
	return <>{children}</>;
}

function AppRoutes() {
	const { state } = useAuth();

	return (
		<Routes>
			<Route path="/" element={<Landing />} />
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
			<Route path="/admin/reports" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />

			<Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
			<Route path="/call" element={<ProtectedRoute><ActiveCallScreen /></ProtectedRoute>} />
			<Route path="/call-history" element={<ProtectedRoute><CallHistory /></ProtectedRoute>} />
			<Route path="/session/chat/:creatorId" element={<ProtectedRoute><TimedChatRoom /></ProtectedRoute>} />
			<Route path="/live/:streamId" element={<ProtectedRoute><LiveStreamRoom /></ProtectedRoute>} />
			<Route path="/go-live" element={<ProtectedRoute roles={['creator']}><GoLivePage /></ProtectedRoute>} />

			<Route path="*" element={<Navigate to="/" replace />} />
		</Routes>
	);
}

function Providers({ children }: { children: React.ReactNode }) {
	return (
		<BrowserRouter>
			<ThemeProvider>
				<AuthProvider>
					<NotificationProvider>
						<ContentProvider>
							<ChatProvider>
								<WalletProvider>
									<CallProvider>
										<SessionProvider>
											<LiveStreamProvider>
												{children}
											</LiveStreamProvider>
										</SessionProvider>
									</CallProvider>
								</WalletProvider>
							</ChatProvider>
						</ContentProvider>
					</NotificationProvider>
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
			</ErrorBoundary>
		</Providers>
	);
}
