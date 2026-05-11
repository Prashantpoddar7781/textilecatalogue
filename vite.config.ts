import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const defaultApiUrl = mode === 'development'
      ? 'http://localhost:3001/api'
      : 'https://textilecatalogue-production.up.railway.app/api';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      define: {
        'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || process.env.VITE_API_URL || defaultApiUrl),
      }
    };
});
