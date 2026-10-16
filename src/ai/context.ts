/**
 * Snapshot of the studio for the assistant. Everything labelled "measured"
 * comes from the live engine or exact catalog metadata — nothing is guessed.
 */
import { engine } from '../audio/engine';
import { useApp } from '../state/store';
import type { DeckId, FxName } from '../project/types';
import { demoSections } from '../catalog/demoTracks';
import { allSounds } from '../audio/soundLibrary';
import { fmtTime } from '../ui/hooks';

export interface DeckSnap {
  id: DeckId;
  loaded: boolean;
  title?: string;
  artist?: string;
  genre?: string;
  playing: boolean;
  position: number;
  duration: number;
  bpm: number | null;
  bpmSource: string | null;
  effectiveBpm: number | null;
  tempo: number;
  key: string | null;
  section: string | null;
  loop: { beats: number | null; active: boolean } | null;
  volume: number;
  eq: { low: number; mid: number; high: number };
  activeFx: { name: FxName; detail: string }[];
  level: number;
}

export interface StudioSnap {
  mode: 'play' | 'pro';
  decks: Record<DeckId, DeckSnap>;
  crossfader: number;
  master: number;
  clipping: boolean;
  clipCount: number;
  limiterReduction: number;
  sequencer: { running: boolean; pattern: string; follow: DeckId | null; bpm: number };
  audioRunning: boolean;
}

export function snapshot(): StudioSnap {
  const s = useApp.getState();
  const p = s.project;
  const meters = engine.ctx ? engine.meters() : { A: 0, B: 0, master: 0, clipping: false, limiterReduction: 0 };
  const deck = (id: DeckId): DeckSnap => {
    const d = engine.ctx ? engine.decks[id] : null;
    const ready = d?.status === 'ready';
    const pos = ready ? d!.getPosition() : 0;
    const meta = ready ? d!.meta : null;
    const sections = meta?.providerId === 'demo' ? demoSections(meta.id.slice(5)) : [];
    const fx = p.fx[id];
    const activeFx: DeckSnap['activeFx'] = [];
    if (fx.filter.enabled && Math.abs(fx.filter.amount) > 0.01) activeFx.push({ name: 'filter', detail: `${fx.filter.amount < 0 ? 'low-pass' : 'high-pass'} ${Math.round(Math.abs(fx.filter.amount) * 100)}%` });
    if (fx.echo.enabled) activeFx.push({ name: 'echo', detail: `mix ${Math.round(fx.echo.mix * 100)}%, feedback ${Math.round(fx.echo.feedback * 100)}%, ${fx.echo.time} beat` });
    if (fx.reverb.enabled) activeFx.push({ name: 'reverb', detail: `mix ${Math.round(fx.reverb.mix * 100)}%, ${fx.reverb.decay.toFixed(1)}s` });
    if (fx.flanger.enabled) activeFx.push({ name: 'flanger', detail: `mix ${Math.round(fx.flanger.mix * 100)}%` });
    if (fx.phaser.enabled) activeFx.push({ name: 'phaser', detail: `mix ${Math.round(fx.phaser.mix * 100)}%` });
    if (fx.drive.enabled) activeFx.push({ name: 'drive', detail: `mix ${Math.round(fx.drive.mix * 100)}%` });
    return {
      id,
      loaded: ready,
      title: meta?.title,
      artist: meta?.artist,
      genre: meta?.genre,
      playing: !!d?.playing,
      position: pos,
      duration: d?.duration ?? 0,
      bpm: meta?.bpm ?? null,
      bpmSource: meta?.bpmSource ?? null,
      effectiveBpm: d?.effectiveBpm ?? null,
      tempo: p.decks[id].tempo,
      key: meta?.key ?? null,
      section: sections.find((x) => pos >= x.start && pos < x.end)?.name ?? null,
      loop: d?.loop ? { beats: d.loop.beats, active: d.loopActive } : null,
      volume: p.mixer.channels[id].volume,
      eq: { ...p.mixer.channels[id].eq },
      activeFx,
      level: meters[id],
    };
  };
  const pat = p.beats.patterns.find((x) => x.id === p.beats.activePatternId);
  return {
    mode: s.settings.mode,
    decks: { A: deck('A'), B: deck('B') },
    crossfader: p.mixer.crossfader,
    master: p.mixer.master,
    clipping: meters.clipping,
    clipCount: engine.clipCount,
    limiterReduction: meters.limiterReduction,
    sequencer: { running: !!engine.ctx && engine.sequencer.running, pattern: pat?.name ?? '—', follow: p.beats.follow, bpm: p.beats.bpm },
    audioRunning: engine.running,
  };
}

const dbfs = (v: number) => (v > 0 ? `${(20 * Math.log10(v)).toFixed(1)} dBFS` : 'silent');

export function snapshotToText(s: StudioSnap): string {
  const lines: string[] = [];
  lines.push(`Interface mode: ${s.mode === 'play' ? 'Play (beginner)' : 'Pro'}`);
  lines.push('MEASURED STATE (live engine + exact catalog metadata):');
  for (const id of ['A', 'B'] as DeckId[]) {
    const d = s.decks[id];
    if (!d.loaded) {
      lines.push(`- Deck ${id}: empty`);
      continue;
    }
    lines.push(
      `- Deck ${id}: "${d.title}" by ${d.artist} (${d.genre}); ${d.playing ? 'PLAYING' : 'paused'} at ${fmtTime(d.position)} of ${fmtTime(d.duration)}` +
        `${d.section ? `, section "${d.section}"` : ''}; original ${d.bpm ?? 'unknown'} BPM (${d.bpmSource ?? 'no tempo data'}), tempo ${d.tempo >= 0 ? '+' : ''}${d.tempo.toFixed(2)}% → ${d.effectiveBpm?.toFixed(2) ?? '?'} BPM; key ${d.key ?? 'unknown'}; ` +
        `loop ${d.loop ? `${d.loop.beats ?? 'manual'} beats ${d.loop.active ? 'ACTIVE' : 'set but off'}` : 'none'}; fader ${Math.round(d.volume * 100)}%; EQ low ${d.eq.low} dB, mid ${d.eq.mid} dB, high ${d.eq.high} dB; ` +
        `FX: ${d.activeFx.length ? d.activeFx.map((f) => `${f.name} (${f.detail})`).join(', ') : 'none'}; current level ${dbfs(d.level)}`,
    );
  }
  const a = s.decks.A;
  const b = s.decks.B;
  if (a.effectiveBpm && b.effectiveBpm) lines.push(`- Tempo difference A vs B: ${(((b.effectiveBpm - a.effectiveBpm) / a.effectiveBpm) * 100).toFixed(2)}%`);
  lines.push(`- Crossfader: ${s.crossfader.toFixed(2)} (-1 = only A, 0 = both, 1 = only B); master ${Math.round(s.master * 100)}%`);
  lines.push(`- Clipping before the safety limiter in the last second: ${s.clipping ? 'YES' : 'no'} (clip events this session: ${s.clipCount}); limiter gain reduction ${s.limiterReduction.toFixed(1)} dB`);
  lines.push(`- Beat sequencer: ${s.sequencer.running ? 'running' : 'stopped'}, pattern "${s.sequencer.pattern}", follows ${s.sequencer.follow ? `Deck ${s.sequencer.follow}` : 'nothing'} (own tempo ${s.sequencer.bpm} BPM)`);
  lines.push(`- Audio output running: ${s.audioRunning ? 'yes' : 'no (needs a click/tap first)'}`);
  lines.push('');
  lines.push('SOUND IDS available for trigger_sample and set_beat_pattern rows:');
  lines.push(allSounds().map((x) => `${x.id} (${x.name}${x.loop ? ', loop' : ''})`).join('; '));
  return lines.join('\n');
}
