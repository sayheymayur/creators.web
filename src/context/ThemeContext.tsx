import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
	toggle: () => void;
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
	return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	// Bootstrap script sets the class before React; use that as initial.
	const initialMode: ThemeMode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
	const [mode, setModeState] = useState<ThemeMode>(initialMode);

	const setMode = (next: ThemeMode) => {
		setModeState(next);
		applyThemeToDom(next);
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// ignore
		}
	};

	const toggle = () => setMode(mode === 'dark' ? 'light' : 'dark');

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

	const value = useMemo<ThemeContextValue>(() => ({ mode, setMode, toggle }), [mode]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
	return ctx;
}
