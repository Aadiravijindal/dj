import { sanitizeReply, type AssistantReply, type ChatTurn } from '../../shared/assistantSchema';
import { demoReply } from './demoAssistant';
import { snapshot, snapshotToText } from './context';

export interface ServiceStatus {
  ai: { configured: boolean; model: string | null };
  server: boolean;
}

let statusCache: Promise<ServiceStatus> | null = null;

export function getStatus(force = false): Promise<ServiceStatus> {
  if (!statusCache || force) {
    statusCache = fetch('/api/status', { headers: { accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        return { ai: { configured: !!j?.ai?.configured, model: j?.ai?.model ?? null }, server: true };
      })
      .catch(() => ({ ai: { configured: false, model: null }, server: false }));
  }
  return statusCache;
}

export interface AskResult {
  reply: AssistantReply;
  source: 'model' | 'demo';
  model?: string;
  /** set when the model was configured but failed and we fell back to the demo */
  fallbackReason?: string;
  dropped?: number;
}

export async function ask(history: ChatTurn[]): Promise<AskResult> {
  const snap = snapshot();
  const status = await getStatus();
  const last = history[history.length - 1]?.content ?? '';
  if (status.ai.configured) {
    try {
      const r = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12), context: snapshotToText(snap) }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `The assistant service returned ${r.status}.`);
      const clean = sanitizeReply(j?.reply);
      if (!clean) throw new Error('The model returned a reply that did not match the expected format.');
      return { reply: clean.reply, source: 'model', model: j?.model, dropped: clean.dropped };
    } catch (e) {
      return { reply: demoReply(last, snap), source: 'demo', fallbackReason: (e as Error).message };
    }
  }
  return { reply: demoReply(last, snap), source: 'demo' };
}
