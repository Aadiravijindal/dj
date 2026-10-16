import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Mount the MIXPLAY JSON API inside the Vite dev server (single `npm run dev`). */
function mixplayApi(): Plugin {
  return {
    name: 'mixplay-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const { handleApi } = (await server.ssrLoadModule('/server/api.ts')) as typeof import('./server/api');
        handleApi(req, res).catch(next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const { handleApi } = await import('./server/api');
        handleApi(req, res).catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // expose server-side secrets to the API handler only (never to the client bundle)
  const env = loadEnv(mode, process.cwd(), '');
  for (const k of ['ANTHROPIC_API_KEY', 'MIXPLAY_AI_MODEL']) if (env[k] && !process.env[k]) process.env[k] = env[k];
  return {
    plugins: [react(), mixplayApi()],
    worker: { format: 'es' },
    server: { port: 5173 },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
