import { formatINR } from '../../services/razorpay';
import type { VirtualGift } from '../../types';

export function LiveGiftsTray({
	title = 'Send a Gift',
	gifts,
	disabled,
	loading,
	onGift,
	onClose,
}: {
	title?: string,
	gifts: VirtualGift[],
	disabled?: boolean,
	loading?: boolean,
	onGift: (gift: VirtualGift) => void,
	onClose?: () => void,
}) {
	return (
		<div className="bg-surface border border-border/20 rounded-2xl overflow-hidden">
			<div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
				<p className="text-sm font-bold text-foreground">{title}</p>
				{onClose && (
					<button onClick={onClose} className="text-muted text-xs hover:text-foreground">Close</button>
				)}
			</div>
			<div className="p-3 grid grid-cols-3 gap-2">
				{gifts.map(gift => (
					<button
						key={gift.id}
						onClick={() => onGift(gift)}
						disabled={Boolean(disabled) || Boolean(loading)}
						className="flex flex-col items-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 border border-border/20 rounded-2xl p-3 transition-all active:scale-95 disabled:opacity-50"
					>
						<span className="text-2xl">{gift.emoji}</span>
						<span className="text-xs text-foreground font-medium">{gift.name}</span>
						<span className="text-[10px] text-amber-400 font-semibold">{formatINR(gift.value)}</span>
					</button>
				))}
			</div>
		</div>
	);
}
