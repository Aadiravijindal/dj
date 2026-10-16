/**
 * Exercises the real-model server path against a local mock of the Messages
 * API, so the request shape and the reply validation are tested without
 * credentials or network access.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server;
let lastBody: Record<string, unknown> | null = null;
let lastHeaders: Record<string, string | string[] | undefined> = {};
let reply: unknown = null;

beforeAll(async () => {
  server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      lastBody = JSON.parse(data);
      lastHeaders = req.headers;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(reply) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.MIXPLAY_AI_MODEL;
});

afterAll(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
});

describe('assistant endpoint (mocked model)', () => {
  it('sends a structured-output request and returns a validated reply', async () => {
    const { handleAssistant } = await import('../../server/assistant');
    reply = {
      message: 'Try a filter rise.',
      measured: ['Deck A plays at 124.00 BPM.'],
      suggestions: [
        {
          title: 'Filter rise',
          outcome: 'Tension',
          target: 'A',
          explanation: 'High-pass sweep.',
          actions: [
            { type: 'set_fx', deck: 'A', effect: 'filter', enabled: true, params: { amount: 0.7 } },
            { type: 'set_volume', deck: 'A', value: 9 },
            { type: 'set_eq', deck: 'A' },
          ],
        },
      ],
    };
    const r = await handleAssistant({ messages: [{ role: 'user', content: 'build-up please' }], context: 'Deck A: playing' });
    expect(r.status).toBe(200);
    const body = r.body as { reply: { suggestions: { actions: { type: string; value?: number }[] }[] }; dropped: number };
    // invalid action dropped, out-of-range value clamped
    expect(body.dropped).toBe(1);
    expect(body.reply.suggestions[0].actions.map((a) => a.type)).toEqual(['set_fx', 'set_volume']);
    expect(body.reply.suggestions[0].actions[1].value).toBe(1);
    // request shape
    expect(lastBody?.model).toBe('claude-opus-5-5');
    expect((lastBody?.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    expect(lastBody?.fallbacks).toBe('default');
    expect(String(lastHeaders['anthropic-beta'])).toContain('server-side-fallback-2026-07-01');
    const msgs = lastBody?.messages as { content: string }[];
    expect(msgs[0].content).toContain('<studio_context>');
  });

  it('rejects replies that do not match the schema', async () => {
    const { handleAssistant } = await import('../../server/assistant');
    reply = { message: 'hi', suggestions: [{ title: 'x' }] };
    const r = await handleAssistant({ messages: [{ role: 'user', content: 'hi' }], context: '' });
    expect(r.status).toBe(502);
  });

  it('validates the request body', async () => {
    const { handleAssistant } = await import('../../server/assistant');
    expect((await handleAssistant({ messages: [] })).status).toBe(400);
  });
});
