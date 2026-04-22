import { CheckCircle, XCircle, Info, AlertTriangle, X } from '../icons';
import { useNotifications } from '../../context/NotificationContext';

export function ToastContainer() {
	const { state } = useNotifications();

	return (
		<div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
			{state.toasts.map(toast => (
				<ToastItem key={toast.id} id={toast.id} message={toast.message} type={toast.type} />
			))}
		</div>
	);
}

function ToastItem({ id, message, type }: { id: string, message: string, type: 'success' | 'error' | 'info' | 'warning' }) {
	const { state } = useNotifications();
	const visible = state.toasts.some(t => t.id === id);

	const icons = {
		success: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
		error: <XCircle className="w-4 h-4 text-rose-400 shrink-0" />,
		info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
		warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
	};

	const borders = {
		success: 'border-emerald-500/30',
		error: 'border-rose-500/30',
		info: 'border-blue-500/30',
		warning: 'border-amber-500/30',
	};

	if (!visible) return null;

	return (
		<div
			className={`pointer-events-auto flex items-center gap-3 bg-surface2 border ${borders[type]} rounded-lg px-4 py-3 shadow-2xl min-w-[280px] max-w-[400px] animate-slide-in`}
		>
			{icons[type]}
			<span className="text-sm text-foreground/90 flex-1">{message}</span>
		</div>
	);
}

export function Modal({
	isOpen,
	onClose,
	title,
	children,
	maxWidth = 'max-w-md',
}: {
	isOpen: boolean,
	onClose: () => void,
	title?: string,
	children: React.ReactNode,
	maxWidth?: string,
}) {
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
			<div
				className="absolute inset-0 bg-background/70 dark:bg-black/70 backdrop-blur-sm"
				onClick={onClose}
			/>
			<div className={`relative w-full ${maxWidth} bg-surface border border-border/20 rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 max-h-[90vh] overflow-y-auto`}>
				{title && (
					<div className="flex items-center justify-between px-5 py-4 border-b border-border/20">
						<h2 className="text-lg font-semibold text-foreground">{title}</h2>
						<button onClick={onClose} className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors">
							<X className="w-5 h-5 text-muted" />
						</button>
					</div>
				)}
				{children}
			</div>
		</div>
	);
}
