import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:4000';
  const port = parseInt(env.VITE_PORT, 10) || 5173;

  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        '/api': apiUrl,
        '/uploads': apiUrl,
      },
    },
  };
});