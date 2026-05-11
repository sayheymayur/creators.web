import { useState } from 'react';
import { Image, User } from '../icons';

export function isValidAvatarUrl(src: string | null | undefined): boolean {
	return typeof src === 'string' && src.trim().length > 0;
}

interface UserAvatarMediaProps {
	src?: string | null;
	alt: string;
	className: string;
}

/** Rounds/square avatar slot: photo when URL works, otherwise a user silhouette. */
export function UserAvatarMedia({ src, alt, className }: UserAvatarMediaProps) {
	const [failed, setFailed] = useState(false);
	const url = typeof src === 'string' ? src.trim() : '';
	const showImg = url.length > 0 && !failed;

	if (!showImg) {
		return (
			<div
				className={`flex items-center justify-center bg-foreground/10 text-muted/80 shrink-0 overflow-hidden ${className}`}
				role="img"
				aria-label={alt}
			>
				<User className="w-[45%] h-[45%] min-w-[0.75rem] min-h-[0.75rem]" />
			</div>
		);
	}

	return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}

interface AvatarBackdropProps {
	src?: string | null;
	alt: string;
	className: string;
}

/** Full-area image (e.g. blurred stream/call background). Gradient when missing or broken. */
export function AvatarBackdrop({ src, alt, className }: AvatarBackdropProps) {
	const [failed, setFailed] = useState(false);
	const url = typeof src === 'string' ? src.trim() : '';
	if (!url || failed) {
		return (
			<div
				className={
					'bg-gradient-to-br from-foreground/20 via-foreground/10 to-foreground/5 ' +
					'dark:from-white/10 dark:via-white/5 dark:to-transparent ' +
					className
				}
				role="img"
				aria-label={alt}
			/>
		);
	}
	return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}

interface ProfileBannerMediaProps {
	src?: string | null;
	alt: string;
	className: string;
}

/** Profile/cover banner: full-width image when URL works, otherwise gradient + image icon. */
export function ProfileBannerMedia({ src, alt, className }: ProfileBannerMediaProps) {
	const [failed, setFailed] = useState(false);
	const url = typeof src === 'string' ? src.trim() : '';
	const showImg = url.length > 0 && !failed;

	if (!showImg) {
		return (
			<div
				className={
					'flex items-center justify-center bg-gradient-to-br from-rose-500/20 via-foreground/12 to-foreground/5 ' +
					'dark:from-rose-500/15 dark:via-white/8 dark:to-white/5 text-muted/45 overflow-hidden ' +
					className
				}
				role="img"
				aria-label={alt}
			>
				<Image className="w-[min(4rem,18%)] h-[min(4rem,40%)] min-w-[1.5rem] min-h-[1.5rem] opacity-50" />
			</div>
		);
	}

	return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}

interface AvatarProps {
	src: string;
	alt: string;
	size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
	isOnline?: boolean;
	className?: string;
}

const sizes = {
	xs: 'w-6 h-6',
	sm: 'w-8 h-8',
	md: 'w-10 h-10',
	lg: 'w-12 h-12',
	xl: 'w-16 h-16',
	'2xl': 'w-24 h-24',
};

const dotSizes = {
	xs: 'w-1.5 h-1.5',
	sm: 'w-2 h-2',
	md: 'w-2.5 h-2.5',
	lg: 'w-3 h-3',
	xl: 'w-3.5 h-3.5',
	'2xl': 'w-4 h-4',
};

export function Avatar({ src, alt, size = 'md', isOnline, className = '' }: AvatarProps) {
	const [imgFailed, setImgFailed] = useState(false);
	const url = typeof src === 'string' ? src.trim() : '';
	const showImg = url.length > 0 && !imgFailed;

	return (
		<div className={`relative shrink-0 ${sizes[size]} ${className}`}>
			{showImg ? (
				<img
					src={url}
					alt={alt}
					onError={() => setImgFailed(true)}
					className={`${sizes[size]} rounded-full object-cover`}
				/>
			) : (
				<div
					className={`${sizes[size]} rounded-full flex items-center justify-center bg-foreground/10 text-muted/80`}
					role="img"
					aria-label={alt}
				>
					<User className="w-1/2 h-1/2 min-w-[0.5rem] min-h-[0.5rem]" />
				</div>
			)}
			{isOnline !== undefined && (
				<span
					className={`absolute bottom-0 right-0 ${dotSizes[size]} rounded-full border-2 border-background ${
						isOnline ? 'bg-emerald-500' : 'bg-gray-500'
					}`}
				/>
			)}
		</div>
	);
}
