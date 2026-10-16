/**
 * Production server: serves the built app from dist/ and the JSON API.
 *   npm run build && npm start
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { handleApi } from './api.ts';

const root = resolve(import.meta.dirname, '..', 'dist');
const port = Number(process.env.PORT) || 8787;
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    const url = new URL(req.url ?? '/', 'http://local');
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) {
      res.statusCode = 403;
      return res.end();
    }
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) file = join(root, 'index.html');
    const data = await readFile(file);
    res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
    res.setHeader('x-content-type-options', 'nosniff');
    if (file.includes(`${join(root, 'assets')}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.end(data);
  } catch {
    res.statusCode = 500;
    res.end('Server error');
  }
});

server.listen(port, () => {
  const ai = process.env.ANTHROPIC_API_KEY ? 'AI assistant: configured' : 'AI assistant: demo mode (set ANTHROPIC_API_KEY to enable)';
  console.log(`MIXPLAY running at http://localhost:${port} — ${ai}`);
});
