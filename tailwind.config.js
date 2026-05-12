/** @type {import('tailwindcss').Config} */
export default {
	content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
	darkMode: 'class',
	theme: {
		extend: {
			keyframes: {
				'cw-heart-pop': {
					'0%': { transform: 'scale(1)' },
					'45%': { transform: 'scale(1.18)' },
					'100%': { transform: 'scale(1)' },
				},
				'cw-bookmark-pop': {
					'0%': { transform: 'scale(1) translateY(0)' },
					'50%': { transform: 'scale(1.12) translateY(-2px)' },
					'100%': { transform: 'scale(1) translateY(0)' },
				},
			},
			animation: {
				'cw-heart-pop': 'cw-heart-pop 280ms ease-out',
				'cw-bookmark-pop': 'cw-bookmark-pop 320ms ease-out',
			},
			colors: {
				background: 'rgb(var(--background) / <alpha-value>)',
				foreground: 'rgb(var(--foreground) / <alpha-value>)',
				surface: 'rgb(var(--surface) / <alpha-value>)',
				surface2: 'rgb(var(--surface-2) / <alpha-value>)',
				border: 'rgb(var(--border) / <alpha-value>)',
				muted: 'rgb(var(--muted) / <alpha-value>)',
				overlay: 'rgb(var(--overlay) / <alpha-value>)',
				input: 'rgb(var(--input) / <alpha-value>)',
				ring: 'rgb(var(--ring) / <alpha-value>)',
			},
		}
	},
	plugins: []
};
