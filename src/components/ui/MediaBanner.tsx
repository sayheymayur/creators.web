import { useEffect, useState } from 'react';
import { isRenderableImageUrl } from '../../utils/imageUrl';

type Props = {
	src?: string | null;
	alt?: string;
	className?: string;
};

/** Centered landscape placeholder when no banner image (or load error). */
function DefaultBannerSvg({ className = '' }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 200 64"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			preserveAspectRatio="xMidYMid meet"
			aria-hidden
		>
			<path d="M0 64 L52 28 L84 48 L120 18 L200 64 Z" className="fill-foreground/18" />
			<path d="M0 64 L64 36 L96 52 L136 24 L200 64 Z" className="fill-foreground/10" />
			<circle cx="158" cy="18" r="12" className="fill-rose-400/15" />
		</svg>
	);
}

/**
 * Profile/listing banner: shows image only for safe URLs; on error or missing URL,
 * a gradient with a centered default landscape graphic (no broken-image icon).
 */
export function MediaBanner({ src, alt = '', className = '' }: Props) {
	const [broken, setBroken] = useState(false);
	const raw = typeof src === 'string' ? src.trim() : '';
	const urlOk = isRenderableImageUrl(raw);
	const showImg = urlOk && !broken;

	useEffect(() => {
		setBroken(false);
	}, [src]);

	if (showImg) {
		return (
			<img
				src={raw}
				alt={alt}
				className={className}
				onError={() => { setBroken(true); }}
			/>
		);
	}

	return (
		<div
			className={
				'box-border flex items-center justify-center border border-border/40 bg-gradient-to-br from-foreground/14 via-foreground/7 to-rose-500/10 ' +
				className
			}
			role="img"
			aria-label={alt || 'Banner'}
		>
			<div className="inline-flex shrink-0 items-center justify-center rounded-xl border border-border/45 bg-foreground/[0.04] p-2 sm:p-3">
				<DefaultBannerSvg className="block h-8 w-auto shrink-0 opacity-90 sm:h-10 md:h-11" />
			</div>
		</div>
	);
}
