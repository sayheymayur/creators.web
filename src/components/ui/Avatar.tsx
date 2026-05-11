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
	return (
		<div className={`relative shrink-0 ${sizes[size]} ${className}`}>
			<img
				src={src}
				alt={alt}
				className={`${sizes[size]} rounded-full object-cover`}
			/>
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
