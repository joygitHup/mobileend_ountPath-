import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 9093,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9092',
        changeOrigin: true,
      },
    },
  },
});
