import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

/**
 * Runs the real /api/*.ts handlers inside the Vite dev server.
 *
 * Vercel executes those files as serverless functions in production; locally
 * there's nothing to serve them, which would normally mean installing the
 * Vercel CLI and running `vercel dev`. Instead this middleware loads the same
 * modules through Vite's SSR pipeline and hands them a request/response pair
 * shaped like Vercel's. One `npm run dev`, one code path, no extra tooling.
 */
export function apiPlugin(): Plugin {
  return {
    name: 'cfb-local-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        const url = new URL(req.url, 'http://localhost');
        const route = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');

        // Underscore-prefixed files are shared libs, not routes (same rule
        // Vercel applies). Don't let them be requested directly.
        if (!route || route.startsWith('_') || route.includes('..')) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }

        const file = resolve(process.cwd(), 'api', `${route}.ts`);
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `No API route /api/${route}` }));
          return;
        }

        // Shim the bits of Vercel's res that our handlers actually call.
        const shimmed = res as typeof res & {
          status(code: number): typeof shimmed;
          json(body: unknown): void;
          send(body: string): void;
        };
        shimmed.status = (code: number) => {
          res.statusCode = code;
          return shimmed;
        };
        shimmed.json = (body: unknown) => {
          if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
          }
          res.end(JSON.stringify(body));
        };
        shimmed.send = (body: string) => {
          if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          }
          res.end(body);
        };

        const request = {
          method: req.method,
          url: req.url,
          headers: req.headers as Record<string, string | string[] | undefined>,
          query: Object.fromEntries(url.searchParams.entries()),
        };

        try {
          const mod = await server.ssrLoadModule(`/api/${route}.ts`);
          const handler = mod.default;
          if (typeof handler !== 'function') {
            throw new Error(`/api/${route}.ts has no default export`);
          }
          await handler(request, shimmed);
          if (!res.writableEnded) res.end();
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error(`[dev-api] /api/${route} threw:`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
          }
          if (!res.writableEnded) {
            res.end(JSON.stringify({ error: 'Dev API handler failed', detail: String(err) }));
          }
        }
      });
    },
  };
}
