import { engine } from '../audio/engine';
import { useApp, toast } from './store';
import type { DeckId } from '../project/types';
import { uid } from '../project/defaults';

const other = (id: DeckId): DeckId => (id === 'A' ? 'B' : 'A');
const mutate = (fn: Parameters<ReturnType<typeof useApp.getState>['mutate']>[0]) => useApp.getState().mutate(fn);

export function setTempo(id: DeckId, percent: number) {
  mutate((p) => {
    const r = p.decks[id].tempoRange;
    p.decks[id].tempo = Math.max(-r, Math.min(r, Math.round(percent * 100) / 100));
  });
}

/**
 * Match this deck's tempo to the other deck and (when both are playing) line
 * the beats up. This is resampling — pitch moves with tempo.
 */
export function syncDeck(id: DeckId): boolean {
  if (!engine.ctx) return false;
  const me = engine.decks[id];
  const ref = engine.decks[other(id)];
  if (me.status !== 'ready' || ref.status !== 'ready') {
    toast('info', 'Load tracks on both decks to sync them.');
    return false;
  }
  if (!me.bpm || !ref.effectiveBpm) {
    toast('error', 'Sync needs a known BPM on both tracks. This track has no reliable tempo information.');
    return false;
  }
  let target = ref.effectiveBpm;
  // match half/double time when that is closer (e.g. 86 ↔ 172)
  for (const f of [0.5, 2]) if (Math.abs(target * f - me.bpm) < Math.abs(target - me.bpm)) target *= f;
  const pct = (target / me.bpm - 1) * 100;
  const s = useApp.getState();
  let range = s.project.decks[id].tempoRange;
  if (Math.abs(pct) > range) {
    const needed = Math.abs(pct) <= 16 ? 16 : 50;
    if (Math.abs(pct) > 50) {
      toast('error', `These tempos are too far apart to match (${me.bpm} vs ${ref.effectiveBpm.toFixed(1)} BPM).`);
      return false;
    }
    range = needed;
    mutate((p) => {
      p.decks[id].tempoRange = needed as 16 | 50;
    });
    toast('info', `Widened Deck ${id}'s tempo range to ±${needed}% to reach ${target.toFixed(1)} BPM.`);
  }
  setTempo(id, pct);
  me.setTempo(pct);
  if (me.playing && ref.playing) {
    const myPhase = me.phaseAt(me.getPosition());
    const refPhase = ref.phaseAt(ref.getPosition());
    let diff = refPhase - myPhase;
    if (diff > 0.5) diff -= 1;
    if (diff < -0.5) diff += 1;
    me.seek(me.getPosition() + diff * (me.beatLen ?? 0));
  }
  return true;
}

export function setHotCue(id: DeckId, slot: number, time: number | null) {
  mutate((p) => {
    p.decks[id].hotCues[slot] = time;
  });
}

export function hotCuePress(id: DeckId, slot: number, clear = false) {
  if (!engine.ctx) return;
  const deck = engine.decks[id];
  if (deck.status !== 'ready') return;
  const current = useApp.getState().project.decks[id].hotCues[slot];
  if (clear) {
    setHotCue(id, slot, null);
    return;
  }
  if (current === null) {
    const pos = deck.getPosition();
    setHotCue(id, slot, deck.quantize ? deck.snap(pos) : pos);
  } else deck.jumpTo(current);
}

export function loopIn(id: DeckId) {
  const d = engine.decks[id];
  if (d.status !== 'ready') return;
  const pos = d.getPosition();
  const start = d.quantize ? d.snap(pos) : pos;
  d.setLoop({ start, end: Math.min(d.duration, start + (d.beatLen ?? 0.5) * 4), beats: null }, false);
}

export function loopOut(id: DeckId) {
  const d = engine.decks[id];
  if (d.status !== 'ready' || !d.loop) return;
  const pos = d.getPosition();
  let end = d.quantize ? d.snap(pos) : pos;
  if (end <= d.loop.start + 0.05) end = d.loop.start + (d.beatLen ?? 0.5);
  const beats = d.beatLen ? Math.round(((end - d.loop.start) / d.beatLen) * 100) / 100 : null;
  d.setLoop({ start: d.loop.start, end, beats }, true);
}

export function resizeLoop(id: DeckId, factor: number) {
  const d = engine.decks[id];
  const L = d.loop;
  if (!L) return;
  const len = (L.end - L.start) * factor;
  if (len < 0.02 || L.start + len > d.duration) return;
  d.setLoop({ start: L.start, end: L.start + len, beats: L.beats ? L.beats * factor : null }, d.loopActive);
}

export function toggleLoop(id: DeckId) {
  const d = engine.decks[id];
  if (!d.loop) {
    d.autoLoop(4);
    return;
  }
  d.setLoop(d.loop, !d.loopActive);
}

export function saveCurrentLoop(id: DeckId) {
  const d = engine.decks[id];
  if (!d.loop) return;
  const L = d.loop;
  mutate((p) => {
    const n = p.decks[id].savedLoops.length + 1;
    p.decks[id].savedLoops.push({ id: uid('l'), label: L.beats ? `${L.beats}-beat loop ${n}` : `Loop ${n}`, ...L });
  });
  toast('success', 'Loop saved to this mix.');
}

export function recallLoop(id: DeckId, loopId: string) {
  const L = useApp.getState().project.decks[id].savedLoops.find((l) => l.id === loopId);
  if (!L) return;
  engine.decks[id].setLoop({ start: L.start, end: L.end, beats: L.beats }, true);
}

export function deleteLoop(id: DeckId, loopId: string) {
  mutate((p) => {
    p.decks[id].savedLoops = p.decks[id].savedLoops.filter((l) => l.id !== loopId);
  });
}
