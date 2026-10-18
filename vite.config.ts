import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.PORT ?? 8088);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  // Local-only app served from disk: one bundle is fine, so don't warn about its size.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${serverPort}`, changeOrigin: true },
      '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true, changeOrigin: true },
    },
  },
});
