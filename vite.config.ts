import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Game server (npm run server) — WebSocket traffic is forwarded in development.
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
