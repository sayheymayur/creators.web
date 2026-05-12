import { useEffect, useState } from 'react';
import { User } from '../icons';
import { isRenderableImageUrl } from '../../utils/imageUrl';

type Props = {
	src?: string | null;
	alt: string;
	name?: string;
	className?: string;
	/**
	 * When false (default), missing/broken images show a neutral silhouette like WhatsApp.
	 * When true, shows the first letter of `name` if present instead of the icon.
	 */
	preferInitial?: boolean;
};

/**
 * Renders avatar image only for safe URLs; otherwise a default user silhouette (WhatsApp-style when preferInitial is false).
 */
export function MediaAvatar({ src, alt, name, className = '', preferInitial = false }: Props) {
	const [broken, setBroken] = useState(false);
	const raw = typeof src === 'string' ? src.trim() : '';

	useEffect(() => {
		setBroken(false);
	}, [src]);
	const urlOk = isRenderableImageUrl(raw);
	const showImg = urlOk && !broken;
	const initial = preferInitial ? (name?.trim()?.charAt(0)?.toUpperCase() ?? '') : '';

	return (
		<div
			className={
				'relative box-border flex shrink-0 items-center justify-center overflow-hidden bg-foreground/12 text-muted ' +
				(!showImg ? 'border border-border/40 ' : '') +
				className
			}
		>
			{showImg ? (
				<img
					src={raw}
					alt={alt}
					className="h-full w-full object-cover"
					onError={() => { setBroken(true); }}
				/>
			) : initial ? (
				<span className="select-none text-sm font-semibold text-foreground/65 sm:text-base" aria-hidden>
					{initial}
				</span>
			) : (
				<User className="w-[46%] h-[46%] shrink-0 opacity-55" aria-hidden />
			)}
		</div>
	);
}
