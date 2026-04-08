import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const DEFAULT_CREATORS_API = 'https://creatorsapi.pnine.me';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const apiTarget = (env.VITE_CREATORS_API_URL?.trim() || DEFAULT_CREATORS_API).replace(/\/+$/, '');

	return {
		plugins: [react()],
		optimizeDeps: {
			exclude: ['lucide-react'],
		},
		server: {
			proxy: {
				// Same-origin in dev so the browser does not apply CORS; forwards to the real API.
				'/creators-api': {
					target: apiTarget,
					changeOrigin: true,
					secure: true,
					rewrite: (path) => path.replace(/^\/creators-api/, '') || '/',
				},
			},
		},
	};
});
