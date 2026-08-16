import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API is served same-origin in development, so the browser never makes a
    // cross-origin request and no CORS configuration exists to get wrong. That is also the
    // shape TC-P02 needs: a SameSite session cookie only travels on a same-site request.
    // Set VITE_API_BASE_URL=/api to use it; unset, the app runs on fixtures as before.
    proxy: {
      '/api': {
        target: process.env.TC_API_TARGET ?? 'http://localhost:8787',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
