import React from 'react';
import { Loader2 } from '../icons';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
	size?: 'sm' | 'md' | 'lg';
	isLoading?: boolean;
	leftIcon?: React.ReactNode;
	rightIcon?: React.ReactNode;
	fullWidth?: boolean;
}

export function Button({
	variant = 'primary',
	size = 'md',
	isLoading,
	leftIcon,
	rightIcon,
	fullWidth,
	children,
	className = '',
	disabled,
	...rest
}: ButtonProps) {
	const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 select-none';

	const variants = {
		primary: 'bg-rose-500 hover:bg-rose-600 active:scale-95 text-white shadow-lg shadow-rose-500/20 disabled:opacity-50',
		secondary: 'bg-foreground/10 hover:bg-foreground/20 active:scale-95 text-foreground',
		ghost: 'hover:bg-foreground/10 active:scale-95 text-muted hover:text-foreground',
		danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30',
		outline: 'border border-border/30 hover:border-border/60 hover:bg-foreground/5 active:scale-95 text-foreground',
	};

	const sizes = {
		sm: 'text-xs px-3 py-1.5',
		md: 'text-sm px-4 py-2.5',
		lg: 'text-base px-6 py-3',
	};

	return (
		<button
			{...rest}
			disabled={disabled || isLoading}
			className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
		>
			{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : leftIcon}
			{children}
			{!isLoading && rightIcon}
		</button>
	);
}
