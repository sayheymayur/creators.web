/** @type {import('tailwindcss').Config} */
export default {
	content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
	darkMode: 'class',
	theme: {
		extend: {
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
