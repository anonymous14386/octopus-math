import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3011',
      '/login': 'http://localhost:3011',
      '/logout': 'http://localhost:3011',
    },
  },
});
