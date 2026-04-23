import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
	/** Pass the click event from the theme control for a circular reveal (View Transitions). */
	toggle: (event?: React.MouseEvent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'theme';

function applyThemeToDom(mode: ThemeMode) {
	const isDark = mode === 'dark';
	document.documentElement.classList.toggle('dark', isDark);
	document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

function readStoredTheme(): ThemeMode | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === 'dark' || stored === 'light' ? stored : null;
	} catch {
		return null;
	}
}

function getSystemTheme(): ThemeMode {
	return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	// Bootstrap script sets the class before React; use that as initial.
	const initialMode: ThemeMode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
	const [mode, setModeState] = useState<ThemeMode>(initialMode);

	const setMode = useCallback((next: ThemeMode) => {
		setModeState(next);
		applyThemeToDom(next);
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// ignore
		}
	}, []);

	const toggle = useCallback(
		(event?: React.MouseEvent) => {
			const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
			const apply = () => setMode(next);

			const reducedMotion =
				typeof window.matchMedia === 'function' &&
				window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			const startVt = document.startViewTransition;

			if (reducedMotion || !event || typeof startVt !== 'function') {
				apply();
				return;
			}

			document.documentElement.style.setProperty('--theme-toggle-x', `${event.clientX}px`);
			document.documentElement.style.setProperty('--theme-toggle-y', `${event.clientY}px`);

			startVt.call(document, apply);
		},
		[mode, setMode]
	);

	// Keep in sync with storage/system if user hasn't chosen a theme yet.
	useEffect(() => {
		const stored = readStoredTheme();
		if (stored) {
			setModeState(stored);
			applyThemeToDom(stored);
			return;
		}

		const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
		if (!mq) return;

		const updateFromSystem = () => {
			const sys = getSystemTheme();
			setModeState(sys);
			applyThemeToDom(sys);
		};

		updateFromSystem();

		const handler = () => updateFromSystem();
		if (typeof mq.addEventListener === 'function') {
			mq.addEventListener('change', handler);
			return () => mq.removeEventListener('change', handler);
		}
		// Safari fallback
		mq.addListener(handler);
		return () => mq.removeListener(handler);
	}, []);

	const value = useMemo<ThemeContextValue>(() => ({ mode, setMode, toggle }), [mode, setMode, toggle]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
	return ctx;
}
