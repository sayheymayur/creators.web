import { useEffect, useMemo, useRef } from 'react';
import { tokenizeHashtags } from '../../utils/hashtag';

type TextareaProps = Omit<
	React.TextareaHTMLAttributes<HTMLTextAreaElement>,
	'value' | 'onChange'
>;

export function RichTextarea({
	value,
	onChange,
	className,
	...rest
}: {
	value: string,
	onChange: (next: string) => void,
	className?: string,
} & TextareaProps) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const highlightRef = useRef<HTMLDivElement | null>(null);

	const tokens = useMemo(() => tokenizeHashtags(value ?? ''), [value]);

	useEffect(() => {
		const ta = textareaRef.current;
		const hi = highlightRef.current;
		if (!ta || !hi) return;
		hi.scrollTop = ta.scrollTop;
		hi.scrollLeft = ta.scrollLeft;
	}, [value]);

	function syncScroll() {
		const ta = textareaRef.current;
		const hi = highlightRef.current;
		if (!ta || !hi) return;
		hi.scrollTop = ta.scrollTop;
		hi.scrollLeft = ta.scrollLeft;
	}

	return (
		<div className="relative">
			<div
				ref={highlightRef}
				aria-hidden="true"
				className={[
					'pointer-events-none absolute inset-0 overflow-hidden',
					'whitespace-pre-wrap break-words',
					// Match typical textarea layout via Tailwind padding/text sizes in `className`.
					className ?? '',
				].join(' ')}
				// Keep background/border from parent className; only ensure text is visible here.
				style={{ color: undefined }}
			>
				{tokens.map((t, i) =>
					t.type === 'hashtag' ? (
						<span key={i} className="text-rose-400 font-medium">
							{t.value}
						</span>
					) : (
						<span key={i} className="text-foreground/90">
							{t.value}
						</span>
					)
				)}
				{/* Ensure last line height matches textarea caret line */}
				<span className="select-none"> </span>
			</div>

			<textarea
				{...rest}
				ref={textareaRef}
				value={value}
				onChange={e => onChange(e.target.value)}
				onScroll={e => {
					syncScroll();
					rest.onScroll?.(e);
				}}
				className={[
					// Make typed text invisible; show caret.
					'bg-transparent relative',
					'text-transparent caret-foreground',
					// Keep selection readable.
					'selection:bg-rose-500/30 selection:text-transparent',
					className ?? '',
				].join(' ')}
			/>
		</div>
	);
}
