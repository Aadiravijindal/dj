import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Send, Sparkles, Eye, Check, X, Gauge, BookOpen, Undo2, Loader2, FlaskConical, Bot } from 'lucide-react';
import type { AssistantReply, ChatTurn, Suggestion } from '../../../shared/assistantSchema';
import { ask, getStatus, type ServiceStatus } from '../../ai/client';
import { applyActions, canPreview, describe, restore, type Snapshot } from '../../ai/apply';
import { useApp, toast } from '../../state/store';
import { engine } from '../../audio/engine';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  reply?: AssistantReply;
  source?: 'model' | 'demo';
  fallbackReason?: string;
  /** per-suggestion state */
  sstate?: Record<number, 'open' | 'applied' | 'dismissed'>;
}

let mid = 0;
const useChat = create<{ msgs: Msg[]; busy: boolean }>(() => ({ msgs: [], busy: false }));

const PROMPTS = [
  'Help me create a dramatic build-up before the next track.',
  'Suggest a rhythm that would work with this song.',
  'How could I make this part sound more energetic?',
  'Help me fix this transition.',
  'I want a darker, deeper sound here.',
  'What does a low-pass filter do?',
  'Help me experiment with a vocal loop.',
  'I want to create a festival-style drop.',
];

const PREVIEW_SECONDS = 8;

function SuggestionCard({ s, state, onState }: { s: Suggestion; state: 'open' | 'applied' | 'dismissed'; onState: (st: 'applied' | 'dismissed') => void }) {
  const [preview, setPreview] = useState<{ snap: Snapshot; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { audible, playing } = canPreview(s.actions);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const stopPreview = (keep: boolean) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (preview && !keep) restore(preview.snap);
    setPreview(null);
  };

  const startPreview = async () => {
    await engine.resume();
    const { snapshot, notes } = applyActions(s.actions, { preview: true });
    notes.forEach((n) => toast('info', n));
    setPreview({ snap: snapshot, left: PREVIEW_SECONDS });
    timer.current = setInterval(() => {
      setPreview((p) => {
        if (!p) return p;
        if (p.left <= 1) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          restore(p.snap);
          return null;
        }
        return { ...p, left: p.left - 1 };
      });
    }, 1000);
  };

  const apply = async () => {
    await engine.resume();
    if (preview) {
      stopPreview(true);
      onState('applied');
      return;
    }
    const { snapshot, notes } = applyActions(s.actions);
    notes.forEach((n) => toast('info', n));
    onState('applied');
    toast('success', `Applied “${s.title}”. All controls stay yours to adjust.`, { label: 'Undo', run: () => restore(snapshot) });
  };

  if (state === 'dismissed') return null;
  return (
    <div className={`sugg${state === 'applied' ? ' applied' : ''}${preview ? ' previewing' : ''}`} data-testid="suggestion">
      <div className="row">
        <span className={`chip ${s.target === 'A' ? 'a' : s.target === 'B' ? 'b' : ''}`}>{s.target === 'A' || s.target === 'B' ? `Deck ${s.target}` : s.target === 'beats' ? 'Beats & pads' : 'Master'}</span>
        <b className="spacer">{s.title}</b>
      </div>
      <p className="sugg-outcome">{s.outcome}</p>
      <p className="dim small">{s.explanation}</p>
      {s.timing && <p className="small sugg-timing">⏱ {s.timing}</p>}
      {s.actions.length > 0 && (
        <ul className="sugg-actions" aria-label="Changes this suggestion makes">
          {s.actions.map((a, i) => (
            <li key={i}>{describe(a)}</li>
          ))}
        </ul>
      )}
      {state === 'applied' ? (
        <div className="row small ok-text">
          <Check size={14} /> Applied — adjust anything in the studio.
        </div>
      ) : preview ? (
        <div className="row">
          <span className="chip ok mono">Previewing · {preview.left}s</span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => stopPreview(false)}>
            <Undo2 /> Revert
          </button>
          <button className="btn sm accent" onClick={apply} data-testid="sugg-keep">
            <Check /> Keep it
          </button>
        </div>
      ) : (
        <div className="row">
          <button
            className="btn sm"
            onClick={startPreview}
            disabled={!audible || !playing}
            data-testid="sugg-preview"
            data-tip={!audible ? 'Nothing to hear — this one opens a tool' : !playing ? 'Play a deck to preview what this sounds like' : `Try it for ${PREVIEW_SECONDS} seconds, then it reverts automatically`}
          >
            <Eye /> Preview
          </button>
          <button className="btn sm accent" onClick={apply} data-testid="sugg-apply">
            <Check /> Apply
          </button>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => onState('dismissed')} data-testid="sugg-dismiss">
            <X /> Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export function AssistantPanel({ compact = false }: { compact?: boolean }) {
  const { msgs, busy } = useChat();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const setOpen = useApp((s) => s.setAssistantOpen);

  useEffect(() => {
    getStatus().then(setStatus);
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, busy]);

  const send = async (content: string) => {
    const c = content.trim().slice(0, 2000);
    if (!c || busy) return;
    setText('');
    const userMsg: Msg = { id: ++mid, role: 'user', text: c };
    useChat.setState((s) => ({ msgs: [...s.msgs, userMsg], busy: true }));
    const history: ChatTurn[] = [...useChat.getState().msgs].map((m) => ({ role: m.role, content: m.role === 'assistant' ? (m.reply?.message ?? m.text).slice(0, 3000) : m.text }));
    try {
      const r = await ask(history);
      useChat.setState((s) => ({
        busy: false,
        msgs: [...s.msgs, { id: ++mid, role: 'assistant', text: r.reply.message, reply: r.reply, source: r.source, fallbackReason: r.fallbackReason, sstate: {} }],
      }));
    } catch (e) {
      useChat.setState((s) => ({ busy: false, msgs: [...s.msgs, { id: ++mid, role: 'assistant', text: `Sorry — something went wrong: ${(e as Error).message}` }] }));
    }
  };

  const setSState = (msgId: number, i: number, st: 'applied' | 'dismissed') =>
    useChat.setState((s) => ({ msgs: s.msgs.map((m) => (m.id === msgId ? { ...m, sstate: { ...m.sstate, [i]: st } } : m)) }));

  const live = status?.ai.configured;
  return (
    <div className={`assistant${compact ? ' compact' : ''}`} data-testid="assistant">
      <div className="assistant-head">
        <Sparkles size={17} className="accent-text" />
        <div className="spacer">
          <b>Creative assistant</b>
          <div className="small muted">You’re the DJ. Nothing changes until you press Apply.</div>
        </div>
        {status &&
          (live ? (
            <span className="chip ai" data-tip-pos="bottom" data-tip={`Connected to ${status.ai.model} through the MIXPLAY server`}>
              <Bot /> AI model
            </span>
          ) : (
            <span className="chip demo" data-testid="assistant-demo-badge" data-tip-pos="bottom" data-tip="No AI model is configured on the server. This demo assistant uses built-in rules — it is not an AI model. See Settings → AI assistant.">
              <FlaskConical /> Demo assistant
            </span>
          ))}
        {compact && (
          <button className="btn ghost icon-btn sm" aria-label="Close assistant" onClick={() => setOpen(false)}>
            <X />
          </button>
        )}
      </div>
      <div className="assistant-list" ref={listRef} aria-live="polite">
        {msgs.length === 0 && (
          <div className="assistant-intro">
            <p className="dim">Ask for ideas, explanations or help with a mix. I can see your decks, tempo, levels, effects and beats — and I’ll tell you which parts I measured.</p>
            <div className="prompt-chips">
              {PROMPTS.map((p) => (
                <button key={p} className="chip" onClick={() => send(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="bubble user">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="bubble bot">
              {m.source === 'demo' && <div className="small demo-text">Demo assistant (rule-based, not an AI model){m.fallbackReason ? ` — the AI service failed: ${m.fallbackReason}` : ''}</div>}
              <p>{m.text}</p>
              {m.reply?.terms?.length ? (
                <div className="terms">
                  {m.reply.terms.map((t) => (
                    <div key={t.term} className="term">
                      <BookOpen size={13} /> <b>{t.term}</b> — {t.plain}
                    </div>
                  ))}
                </div>
              ) : null}
              {m.reply?.measured?.length ? (
                <div className="measured">
                  <div className="eyebrow">
                    <Gauge size={12} /> Measured
                  </div>
                  {m.reply.measured.map((x, i) => (
                    <div key={i} className="small">
                      {x}
                    </div>
                  ))}
                </div>
              ) : null}
              {m.reply?.suggestions.map((s, i) => (
                <SuggestionCard key={i} s={s} state={m.sstate?.[i] ?? 'open'} onState={(st) => setSState(m.id, i, st)} />
              ))}
              {m.reply?.suggestions.length ? <div className="small muted">Suggestions are ideas, not measurements.</div> : null}
            </div>
          ),
        )}
        {busy && (
          <div className="bubble bot">
            <Loader2 size={15} className="spin" /> Thinking…
          </div>
        )}
      </div>
      <form
        className="assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          className="input"
          rows={2}
          placeholder="Describe what you want to hear…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          aria-label="Message the assistant"
          data-testid="assistant-input"
        />
        <button className="btn accent icon-btn" aria-label="Send" disabled={!text.trim() || busy}>
          <Send />
        </button>
      </form>
    </div>
  );
}
