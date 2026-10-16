/**
 * Minimal JSON API used by both the Vite dev server (as middleware) and the
 * production server. No user data is logged.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { aiConfig, handleAssistant } from './assistant.ts';

const MAX_BODY = 64 * 1024;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { n: number; t: number }>();

function rateLimited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW_MS) {
    hits.set(ip, { n: 1, t: now });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  h.n++;
  return h.n > MAX_PER_WINDOW;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too-large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch {
        reject(new Error('bad-json'));
      }
    });
    req.on('error', reject);
  });
}

/** Returns true if the request was handled. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://local');
  if (!url.pathname.startsWith('/api/')) return false;

  if (url.pathname === '/api/status' && req.method === 'GET') {
    const ai = aiConfig();
    send(res, 200, { ai: { configured: ai.configured, model: ai.configured ? ai.model : null }, catalog: { demo: true, licensed: false } });
    return true;
  }

  if (url.pathname === '/api/assistant' && req.method === 'POST') {
    const ip = (req.socket.remoteAddress ?? 'unknown').toString();
    if (rateLimited(ip)) {
      send(res, 429, { error: 'Too many requests — wait a minute and try again.' });
      return true;
    }
    if (!(req.headers['content-type'] ?? '').includes('application/json')) {
      send(res, 415, { error: 'Expected JSON.' });
      return true;
    }
    let body: unknown;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, (e as Error).message === 'too-large' ? 413 : 400, { error: 'Invalid request body.' });
      return true;
    }
    const r = await handleAssistant(body);
    send(res, r.status, r.body);
    return true;
  }

  send(res, 404, { error: 'Not found' });
  return true;
}
