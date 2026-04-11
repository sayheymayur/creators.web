import { Navbar } from './Navbar';
import { BottomNav } from './BottomNav';
import { ToastContainer } from '../ui/Toast';
import { IncomingCallOverlay } from '../call/IncomingCallOverlay';

interface LayoutProps {
	children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<Navbar />
			<main className="pt-14 pb-20 md:pb-0">
				{children}
			</main>
			<BottomNav />
			<ToastContainer />
			<IncomingCallOverlay />
		</div>
	);
}
