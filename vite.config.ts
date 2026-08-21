import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { apiPlugin } from './vite-plugin-api.js';

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars to the client bundle, which is what
  // we want — but the dev-server-side API handlers still need the unprefixed
  // ones (YOUTUBE_API_KEY, MOCK) from .env.local. Load them into process.env
  // here so `npm run dev` behaves like Vercel does. Nothing here reaches the
  // browser bundle.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['YOUTUBE_API_KEY', 'MOCK']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), tailwindcss(), apiPlugin()],
    server: {
      host: true,
      port: 5173,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
