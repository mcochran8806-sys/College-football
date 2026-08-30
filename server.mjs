#!/usr/bin/env node
/**
 * Local production server.
 *
 * Serves the built app and the same /api handlers Vercel runs, bound to the
 * LAN so the TVs, OBS and a phone can all reach it. The reason this exists at
 * all is the browser mixed-content rule: a page served over https cannot open
 * a ws:// connection, so /deck can only talk to obs-websocket when the app is
 * served over plain http from your own machine.
 *
 *   npm start          build, then serve on 0.0.0.0:5180
 *   PORT=8080 npm start
 *
 * The Vercel deployment is unaffected and stays the fallback for the TVs.
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT ?? 5180);
const DIST = 'dist';
const API_DIR = 'dist-server/api';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Cache handler modules so a Saturday of polling does not re-import them. */
const handlers = new Map();

async function loadHandler(route) {
  if (handlers.has(route)) return handlers.get(route);
  const file = join(API_DIR, `${route}.mjs`);
  if (!existsSync(file)) return null;
  const mod = await import(pathToFileURL(file).href);
  const fn = typeof mod.default === 'function' ? mod.default : null;
  handlers.set(route, fn);
  return fn;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  // ---- API ---------------------------------------------------------------
  if (url.pathname.startsWith('/api/')) {
    const route = url.pathname.slice(5).replace(/\/+$/, '');
    // Underscore-prefixed files are shared libs, not routes — same rule Vercel
    // applies. Never let one be requested directly.
    if (!route || route.startsWith('_') || route.includes('..') || route.includes('/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const handler = await loadHandler(route);
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No API route /api/${route}` }));
      return;
    }

    // Shim the bits of Vercel's res our handlers call.
    const shim = res;
    shim.status = (code) => {
      res.statusCode = code;
      return shim;
    };
    shim.json = (body) => {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(body));
    };
    shim.send = (body) => {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.end(body);
    };

    try {
      await handler(
        {
          method: req.method,
          url: req.url,
          headers: req.headers,
          query: Object.fromEntries(url.searchParams.entries()),
        },
        shim,
      );
      if (!res.writableEnded) res.end();
    } catch (err) {
      console.error(`[api/${route}]`, err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      if (!res.writableEnded) res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // ---- static, with SPA fallback -----------------------------------------
  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);

  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not built. Run: npm run build');
    return;
  }

  const ext = extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    // Hashed asset filenames make long caching safe; index.html must not be.
    'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(readFileSync(file));
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

  console.log(`\n  Football dashboard — local server\n`);
  console.log(`  local     http://localhost:${PORT}/`);
  for (const a of addresses) console.log(`  network   http://${a}:${PORT}/`);
  console.log(`\n  OBS sources   http://localhost:${PORT}/ticker`);
  console.log(`                http://localhost:${PORT}/break`);
  if (addresses[0]) console.log(`  phone deck    http://${addresses[0]}:${PORT}/deck`);
  console.log('');
});
