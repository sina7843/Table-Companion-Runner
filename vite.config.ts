import { Agent } from 'node:http';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * One pooled connection set to the API, rather than a socket per request.
 *
 * The proxy is a second hop: browser → this server → API. Without an agent, every request
 * opens and closes a fresh upstream socket, and each of those sits in TIME_WAIT afterwards.
 * The end-to-end suite drives two browsers hard enough to exhaust a machine's ephemeral port
 * range that way, which fails as a route chunk that will not load — nothing to do with the
 * product. Keep-alive is the fix, and it is the right setting for development too.
 */
const agent = new Agent({ keepAlive: true, maxSockets: 64 });

// The API is served same-origin, so the browser never makes a cross-origin request and no
// CORS configuration exists to get wrong. That is also the shape TC-P02 needs: a SameSite
// session cookie only travels on a same-site request. Set VITE_API_BASE_URL=/api to use it;
// unset, the app runs on fixtures as before.
//
// The same rule applies to `vite preview`, which is what the end-to-end suite runs against —
// testing the built bundle rather than the dev server is the difference between checking the
// product and checking the toolchain.
const proxy = {
  '/api': {
    target: process.env.TC_API_TARGET ?? 'http://localhost:8787',
    changeOrigin: false,
    agent,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The rules catalogue is data, not application code: it changes when a source is
        // re-imported and not when a screen is edited, and it is large enough that inlining it
        // put the entry chunk back over the size warning TC-16 removed. Its own chunk keeps the
        // app small and lets a browser keep the catalogue across deploys that did not touch it.
        manualChunks: (id) => (id.includes('/content/') ? 'content' : undefined),
      },
    },
  },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
