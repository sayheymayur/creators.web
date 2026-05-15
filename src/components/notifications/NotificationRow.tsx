import type { Notification } from '../../types';
import { Bell } from '../icons';
import { formatDistanceToNow } from '../../utils/date';
import { formatINRFromMinor } from '../../utils/money';

/** Tip payloads use `amount_cents` (minor string) per API; values are INR paise in this product. */
export function tipMinorFromNotificationData(data: Record<string, unknown>): string | null {
	for (const key of ['amount_cents', 'amount_minor', 'price_minor'] as const) {
		const v = data[key];
		if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return String(Math.round(v));
		if (typeof v === 'string' && /^\d+$/.test(v.trim())) return v.trim();
	}
	return null;
}

interface NotificationRowProps {
	notification: Notification;
	onClick: () => void;
}

export function NotificationRow({ notification: n, onClick }: NotificationRowProps) {
	const data = n.data ?? {};
	const fromAvatar =
		typeof data.from_avatar === 'string' ? data.from_avatar :
		typeof data.fromAvatar === 'string' ? data.fromAvatar :
		undefined;
	const isRead = n.read_at != null;
	const kind = typeof data.kind === 'string' ? data.kind : '';
	const tipMinor = kind === 'tip' ? tipMinorFromNotificationData(data) : null;
	const currency = typeof data.currency === 'string' ? data.currency.trim() : '';
	const tipSubtitle =
		tipMinor != null ? (
			<span className="text-amber-500 dark:text-amber-400/90">
				Tip · {formatINRFromMinor(tipMinor)}
				{currency && currency !== 'INR' ? ` (${currency})` : ''}
			</span>
		) : null;
	const tipBody = kind === 'tip' && tipMinor != null ? '' : (n.body ?? '');

	return (
		<button
			type="button"
			onClick={onClick}
			className={
				'w-full flex gap-3 px-4 py-3 hover:bg-foreground/5 transition-colors text-left ' +
				'border-b border-border/10 last:border-0 ' +
				(!isRead ? 'bg-rose-500/5' : '')
			}
		>
			{fromAvatar ? (
				<img src={fromAvatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
			) : (
				<div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
					<Bell className="w-4 h-4 text-muted" />
				</div>
			)}
			<div className="flex-1 min-w-0">
				<p className={`text-xs font-medium truncate ${isRead ? 'text-muted' : 'text-foreground'}`}>{n.title}</p>
				{tipSubtitle ? <p className="text-[11px] truncate mt-0.5 text-foreground/90">{tipSubtitle}</p> : null}
				{tipBody ? <p className="text-xs text-muted truncate mt-0.5">{tipBody}</p> : null}
				<p className="text-[10px] text-muted/80 mt-1">{formatDistanceToNow(n.created_at)}</p>
			</div>
			{!isRead && <div className="w-2 h-2 bg-rose-500 rounded-full mt-1 shrink-0" aria-hidden />}
		</button>
	);
}
