import { useMemo, useState } from 'react';
import { MessageCircle, Phone, Video } from '../icons';
import { MediaAvatar } from '../ui/MediaAvatar';
import { useAuth } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSessions, type OutgoingRequestMeta, type SessionsUiCallType } from '../../context/SessionsContext';
import { mockCreators } from '../../data/users';
import type { SessionKind } from '../../services/sessionsWsTypes';

function sessionTypeLabel(kind: SessionKind, uiCallType?: SessionsUiCallType): string {
	if (kind === 'chat') return 'Timed chat';
	if (uiCallType === 'audio') return 'Audio call';
	return 'Video call';
}

function sessionVisual(kind: SessionKind, uiCallType?: SessionsUiCallType) {
	if (kind === 'chat') {
		return {
			Icon: MessageCircle,
			iconClass: 'text-emerald-400',
			bgClass: 'bg-emerald-500/15',
		};
	}
	if (uiCallType === 'audio') {
		return {
			Icon: Phone,
			iconClass: 'text-sky-400',
			bgClass: 'bg-sky-500/15',
		};
	}
	return {
		Icon: Video,
		iconClass: 'text-rose-400',
		bgClass: 'bg-rose-500/15',
	};
}

function resolveCreatorName(meta: OutgoingRequestMeta, contentProfiles: Record<string, { name?: string } | undefined>): string {
	if (meta.creatorDisplay?.name) return meta.creatorDisplay.name;
	const fromContent = contentProfiles[meta.creatorUserId]?.name;
	if (fromContent) return fromContent;
	const mock = mockCreators.find(c => c.id === meta.creatorUserId);
	if (mock?.name) return mock.name;
	return 'Creator';
}

/** Top-right card while a fan's booked session request awaits creator acceptance. */
export function PendingSessionRequestCard() {
	const { state, cancelSession } = useSessions();
	const { state: authState } = useAuth();
	const { state: contentState } = useContent();
	const { showToast } = useNotifications();
	const [cancelling, setCancelling] = useState(false);

	const outgoing = state.outgoing;
	const activeRequestId = state.active?.accepted?.request_id;

	const show = useMemo(() => {
		if (authState.user?.role !== 'fan') return false;
		if (outgoing.state !== 'requesting' && outgoing.state !== 'pending') return false;
		if (state.active?.accepted) {
			const pendingId = outgoing.state === 'pending' ? outgoing.request.request_id : null;
			if (pendingId && activeRequestId === pendingId) return false;
			if (activeRequestId) return false;
		}
		return true;
	}, [authState.user?.role, outgoing, state.active?.accepted, activeRequestId]);

	const meta: OutgoingRequestMeta | null = useMemo(() => {
		if (outgoing.state === 'requesting' || outgoing.state === 'pending') {
			return {
				creatorUserId: outgoing.creatorUserId,
				creatorDisplay: outgoing.creatorDisplay,
				uiCallType: outgoing.uiCallType,
				minutes: outgoing.minutes,
			};
		}
		return null;
	}, [outgoing]);

	const kind: SessionKind | null = useMemo(() => {
		if (outgoing.state === 'requesting') return outgoing.kind;
		if (outgoing.state === 'pending') return outgoing.request.kind;
		return null;
	}, [outgoing]);

	if (!show || !meta || !kind) return null;

	const isRequesting = outgoing.state === 'requesting';
	const requestId = outgoing.state === 'pending' ? outgoing.request.request_id : null;
	const creatorName = resolveCreatorName(meta, contentState.creatorProfiles);
	const { Icon, iconClass, bgClass } = sessionVisual(kind, meta.uiCallType);
	const typeLabel = sessionTypeLabel(kind, meta.uiCallType);
	const minutesLabel =
		typeof meta.minutes === 'number' && meta.minutes > 0 ?
			`${meta.minutes} min session` :
			null;

	function handleCancel() {
		if (isRequesting || cancelling || !requestId) return;
		setCancelling(true);
		void cancelSession(requestId)
			.then(() => {
				showToast('Session request cancelled');
			})
			.catch(err => {
				showToast(err instanceof Error ? err.message : 'Failed to cancel request', 'error');
			})
			.finally(() => { setCancelling(false); });
	}

	return (
		<div className="fixed top-14 right-3 sm:right-4 z-[225] pointer-events-auto">
			<div className="min-w-[280px] max-w-[360px] bg-surface border border-border/20 rounded-2xl shadow-xl px-4 py-3 flex items-start gap-3">
				<div className={`w-10 h-10 rounded-xl ${bgClass} flex items-center justify-center shrink-0 overflow-hidden`}>
					{meta.creatorDisplay?.avatar ? (
						<MediaAvatar
							src={meta.creatorDisplay.avatar}
							alt={creatorName}
							className="w-10 h-10 rounded-xl object-cover"
						/>
					) : (
						<Icon className={`w-5 h-5 ${iconClass}`} />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-bold text-foreground truncate">
						{isRequesting ? 'Sending request…' : 'Request pending'}
					</p>
					<p className="text-xs font-semibold text-foreground/90 truncate mt-0.5">{creatorName}</p>
					<p className="text-[11px] text-muted truncate mt-0.5">
						{isRequesting ?
							`Booking ${typeLabel.toLowerCase()}…` :
							`Waiting for ${creatorName} to accept`}
					</p>
					<p className="text-[11px] text-muted/80 truncate">
						{typeLabel}
						{minutesLabel ? ` · ${minutesLabel}` : ''}
					</p>
				</div>
				<button
					type="button"
					disabled={isRequesting || cancelling || !requestId}
					onClick={handleCancel}
					className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-border/40 bg-background hover:bg-foreground/5 text-foreground transition-colors disabled:opacity-50"
				>
					{cancelling ? 'Cancelling…' : 'Cancel'}
				</button>
			</div>
		</div>
	);
}
