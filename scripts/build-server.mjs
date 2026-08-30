#!/usr/bin/env node
/**
 * Bundles the /api handlers for the local server.
 *
 * On Vercel these are compiled by the platform. Running them under plain Node
 * is not possible as-is: the source uses TypeScript's convention of importing
 * "../config.js" to mean "../config.ts", which bundlers and tsc understand but
 * Node's loader does not. esbuild resolves it the same way Vercel does, so the
 * local server runs byte-identical logic rather than a reimplementation.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const entryPoints = readdirSync('api')
  .filter((f) => f.endsWith('.ts'))
  .map((f) => join('api', f));

await esbuild.build({
  entryPoints,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist-server/api',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});

console.log(`bundled ${entryPoints.length} API route(s) -> dist-server/api`);
