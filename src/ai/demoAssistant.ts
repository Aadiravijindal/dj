/**
 * Deterministic DEMO assistant, used when no AI model is configured on the
 * server. It is clearly labelled in the UI as a demo and is not connected to
 * any AI model. It reads the same measured studio snapshot and returns the
 * same validated, structured suggestions as the real model.
 */
import type { AssistantReply, Suggestion, AssistantAction } from '../../shared/assistantSchema';
import type { StudioSnap, DeckSnap } from './context';
import type { DeckId } from '../project/types';

const has = (q: string, ...words: (string | RegExp)[]) => words.some((w) => (typeof w === 'string' ? q.includes(w) : w.test(q)));

function focusDeck(s: StudioSnap): DeckId {
  const { A, B } = s.decks;
  if (A.playing && !B.playing) return 'A';
  if (B.playing && !A.playing) return 'B';
  if (A.playing && B.playing) return s.crossfader > 0.2 ? 'B' : 'A';
  if (A.loaded) return 'A';
  if (B.loaded) return 'B';
  return 'A';
}

const other = (d: DeckId): DeckId => (d === 'A' ? 'B' : 'A');

function deckName(d: DeckSnap) {
  return d.loaded ? `Deck ${d.id} (“${d.title}”)` : `Deck ${d.id}`;
}

const TERMS: Record<string, { term: string; plain: string; try?: Suggestion }> = {
  lowpass: {
    term: 'Low-pass filter',
    plain: 'Lets the low frequencies through and removes the highs — the track sounds muffled, like it’s playing in the next room. Sweep it back open for a satisfying “reveal”.',
  },
  highpass: {
    term: 'High-pass filter',
    plain: 'Removes the bass and lets the highs through — the track gets thin and tense. DJs sweep it up before a drop, then snap it back so the bass hits harder.',
  },
  beatmatching: {
    term: 'Beatmatching',
    plain: 'Making two tracks play at the same tempo (BPM) AND with their beats landing together. Tempo is the speed; alignment is the timing. Match the tempo with the tempo slider, then nudge the jog wheel until the kicks stop “galloping”.',
  },
  crossfader: {
    term: 'Crossfader',
    plain: 'The horizontal slider between the decks. Left plays Deck A, right plays Deck B, the middle plays both. Moving it slowly blends one track into the other.',
  },
  eq: {
    term: 'EQ (equaliser)',
    plain: 'Three knobs per deck: High (cymbals, sparkle), Mid (vocals, synths), Low (kick and bass). When blending two tracks, turn one deck’s Low down so the basslines don’t fight.',
  },
  cue: {
    term: 'Cue point',
    plain: 'A bookmark in the track. Hot cues are numbered bookmarks you can jump to instantly — tap an empty one to set it, tap it again to jump there.',
  },
  loop: {
    term: 'Loop',
    plain: 'Repeats a slice of the track measured in beats (1, 2, 4, 8…). Loops let you extend a section, hold a groove while you prepare the next track, or create a stutter.',
  },
  bpm: {
    term: 'BPM',
    plain: 'Beats per minute — the speed of the music. House is usually 120–128, techno 125–135, drum & bass around 170–175. MIXPLAY’s demo tracks have exact BPMs because they were composed for the app.',
  },
  echo: {
    term: 'Echo / delay',
    plain: 'Repeats the sound in time with the beat. “Echo out” = turn the echo on and pull the volume down, so the track trails off in rhythmic repeats.',
  },
  reverb: { term: 'Reverb', plain: 'Simulates a room or hall. More reverb = more space and distance; too much makes things washy.' },
  flanger: { term: 'Flanger', plain: 'Mixes the sound with a slightly delayed copy whose delay sweeps up and down — that classic jet-plane whoosh.' },
  phaser: { term: 'Phaser', plain: 'A gentler, swirly sweep made by shifting the phase of certain frequencies.' },
  scratch: {
    term: 'Scratching',
    plain: 'Moving the record back and forth by hand to make rhythmic sounds. In MIXPLAY turn on “Scratch” under a jog wheel, grab the wheel (or the waveform) and drag back and forth. Short, rhythmic movements on a single sound work best.',
  },
  quantize: { term: 'Quantize', plain: 'Snaps cue points, loops and pad hits to the beat grid, so everything lands in time even if your click was a little early or late.' },
  drop: { term: 'Drop', plain: 'The moment the full beat and bass come back after a build-up. The bigger the contrast before it, the harder it hits.' },
};

function termFor(q: string) {
  if (has(q, 'low-pass', 'low pass', 'lowpass')) return TERMS.lowpass;
  if (has(q, 'high-pass', 'high pass', 'highpass')) return TERMS.highpass;
  if (has(q, 'beatmatch', 'beat match', 'beat-match')) return TERMS.beatmatching;
  if (has(q, 'crossfader', 'cross fader')) return TERMS.crossfader;
  if (has(q, /\beq\b/, 'equali')) return TERMS.eq;
  if (has(q, 'cue')) return TERMS.cue;
  if (has(q, 'bpm', 'tempo')) return TERMS.bpm;
  if (has(q, 'quantiz', 'quantis')) return TERMS.quantize;
  if (has(q, 'flanger')) return TERMS.flanger;
  if (has(q, 'phaser')) return TERMS.phaser;
  if (has(q, 'reverb')) return TERMS.reverb;
  if (has(q, 'filter')) return TERMS.lowpass;
  if (has(q, 'loop')) return TERMS.loop;
  if (has(q, 'drop')) return TERMS.drop;
  return null;
}

function rhythmFor(d: DeckSnap): { name: string; rows: { sound: string; steps: string }[]; why: string } {
  const bpm = d.effectiveBpm ?? 124;
  if (bpm < 100)
    return {
      name: 'Laid-back groove',
      why: `At ${bpm.toFixed(0)} BPM a half-time feel with a lazy snare on beat 3 sits well under the track.`,
      rows: [
        { sound: 'kick-deep', steps: 'x......x..x.....' },
        { sound: 'snare-fat', steps: '........x.......' },
        { sound: 'hat-closed', steps: 'x.x.x.x.x.x.x.x.' },
        { sound: 'perc-rim', steps: '...x.......x....' },
      ],
    };
  if (bpm > 150)
    return {
      name: 'Two-step break',
      why: `At ${bpm.toFixed(0)} BPM a two-step kick/snare break doubles the drive without cluttering the low end.`,
      rows: [
        { sound: 'kick-club', steps: 'x.........x.....' },
        { sound: 'snare-tight', steps: '....x.......x...' },
        { sound: 'hat-crisp', steps: 'x.x.x.x.x.x.x.x.' },
        { sound: 'perc-shaker', steps: '..x...x...x...x.' },
      ],
    };
  return {
    name: 'Off-beat lift',
    why: `At ${bpm.toFixed(0)} BPM the track already has a kick on every beat, so this layer adds only off-beat open hats, a shaker and claps — it adds energy without doubling the kick.`,
    rows: [
      { sound: 'hat-open', steps: '..x...x...x...x.' },
      { sound: 'perc-shaker', steps: 'x.xxx.xxx.xxx.xx' },
      { sound: 'clap-classic', steps: '....x.......x...' },
      { sound: 'perc-conga', steps: '...x.....x...x..' },
    ],
  };
}

export function demoReply(message: string, s: StudioSnap): AssistantReply {
  const q = message.toLowerCase();
  const fd = focusDeck(s);
  const d = s.decks[fd];
  const o = s.decks[other(fd)];
  const suggestions: Suggestion[] = [];
  const measured: string[] = [];
  const loadedAny = s.decks.A.loaded || s.decks.B.loaded;

  // ---- troubleshooting
  if (has(q, 'wrong', 'fix', 'bad', 'messy', 'muddy', 'clash', 'train', 'gallop', 'help my', 'off beat', 'out of time', 'too loud', 'distort', 'clip', 'transition')) {
    const issues: string[] = [];
    if (s.clipping || s.clipCount > 0) {
      measured.push(`Measured: the mix went over 0 dB before the safety limiter ${s.clipCount} time(s) this session${s.clipping ? ' — including just now' : ''}.`);
      suggestions.push({
        title: 'Bring the levels down',
        outcome: 'Cleaner, punchier sound with no distortion',
        target: 'master',
        explanation: 'Two loud tracks plus effects add up. Lowering both channel faders a little gives the mix headroom; the limiter then stops working so hard.',
        actions: [
          { type: 'set_volume', deck: 'A', value: Math.min(s.decks.A.volume, 0.72) },
          { type: 'set_volume', deck: 'B', value: Math.min(s.decks.B.volume, 0.72) },
        ],
      });
      issues.push('levels');
    }
    if (d.loaded && o.loaded && d.effectiveBpm && o.effectiveBpm) {
      const diff = ((o.effectiveBpm - d.effectiveBpm) / d.effectiveBpm) * 100;
      measured.push(`Measured: Deck ${d.id} plays at ${d.effectiveBpm.toFixed(2)} BPM and Deck ${o.id} at ${o.effectiveBpm.toFixed(2)} BPM (${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%).`);
      if (Math.abs(diff) > 0.2) {
        suggestions.push({
          title: `Match Deck ${o.id}'s tempo to Deck ${d.id}`,
          outcome: 'Kicks land together instead of drifting apart (“galloping”)',
          target: o.id,
          explanation: `A ${Math.abs(diff).toFixed(1)}% tempo difference makes the beats drift apart within a few seconds. Sync sets Deck ${o.id}'s tempo slider and lines up the beats. Pitch moves slightly with tempo.`,
          actions: [{ type: 'sync_tempo', deck: o.id }],
        });
        issues.push('tempo');
      }
    }
    if (d.playing && o.playing && Math.abs(s.crossfader) < 0.7 && d.eq.low > -10 && o.eq.low > -10) {
      measured.push('Measured: both decks are playing through the crossfader with their bass (Low EQ) fully up.');
      suggestions.push({
        title: `Swap the bass: cut Deck ${o.id}'s lows`,
        outcome: 'One clear bassline instead of two muddy ones',
        target: o.id,
        explanation: 'Two kick drums and basslines at once sound muddy and boomy. Keep the lows on the main track; bring them in on the new track when you swap over (turn one down as you turn the other up).',
        actions: [{ type: 'set_eq', deck: o.id, band: 'low', value: -20 }],
      });
      issues.push('bass');
    }
    for (const dk of [s.decks.A, s.decks.B]) {
      const heavy = dk.activeFx.length >= 3;
      if (heavy) {
        measured.push(`Measured: Deck ${dk.id} has ${dk.activeFx.length} effects on (${dk.activeFx.map((f) => f.name).join(', ')}).`);
        suggestions.push({
          title: `Ease off Deck ${dk.id}'s effects`,
          outcome: 'Effects that stand out instead of smearing the track',
          target: dk.id,
          explanation: 'Stacked effects tend to blur the groove. Keep the one that matters most for the moment.',
          actions: dk.activeFx.slice(1).map((f) => ({ type: 'set_fx', deck: dk.id, effect: f.name, enabled: false }) as AssistantAction),
        });
        issues.push('fx');
      }
      if (dk.loop?.active && dk.loop.beats !== null && dk.loop.beats < 1) {
        measured.push(`Measured: Deck ${dk.id} is looping a ${dk.loop.beats}-beat slice.`);
        suggestions.push({
          title: `Release Deck ${dk.id}'s short loop`,
          outcome: 'Back to the full groove',
          target: dk.id,
          explanation: 'Very short loops are great as a quick stutter, but they get tiring if held for long.',
          actions: [{ type: 'clear_loop', deck: dk.id }],
        });
        issues.push('loop');
      }
    }
    if (!issues.length) {
      return {
        message: loadedAny
          ? 'I checked what I can measure — tempo, levels, bass overlap, effects and loops — and nothing stands out right now. If it still sounds off, listen for: kicks drifting apart (tempo or alignment), boomy low end (two basslines), or harsh peaks (levels). Tell me which one and I’ll suggest a fix.'
          : 'Load a track on each deck first, then I can check tempo, alignment and levels for you.',
        measured,
        suggestions: loadedAny ? [] : [{ title: 'Open the music library', outcome: 'Pick two tracks to mix', target: 'master', explanation: 'Choose one track for Deck A and one for Deck B.', actions: [{ type: 'open_panel', panel: 'timeline' }] }],
      };
    }
    return { message: `Here’s what I found from the live mix. Each suggestion changes only the controls listed — preview it first if you like.`, measured, suggestions: suggestions.slice(0, 3) };
  }

  // ---- build-ups and drops
  if (has(q, 'build', 'tension', 'drop', 'festival', 'riser', 'climax')) {
    const festival = has(q, 'festival', 'huge', 'massive', 'big room');
    const template = festival ? 'festival-16' : 'classic-8';
    suggestions.push({
      title: festival ? 'Festival-style 16-bar build' : 'Classic 8-bar build-up',
      outcome: 'Rising tension that releases into a big drop — performed by you',
      target: fd,
      timing: d.section ? `Deck ${fd} is in “${d.section}”. Start the build so it ends where the next section begins.` : 'Start on a phrase boundary (every 8 bars).',
      explanation: festival
        ? 'Loads an editable template: percussion, then a riser and high-pass sweep, a loop roll and snare roll, a beat of silence, then an impact and sub drop. You press Perform, and you can hit “Drop now” whenever you choose.'
        : 'Loads an editable template: a riser over 8 bars, a high-pass filter sweep, a snare roll in the last 4 bars and a beat of silence before an impact. Move or stretch any block before you perform it.',
      actions: [
        { type: 'load_build_template', template },
        { type: 'open_panel', panel: 'build' },
      ],
    });
    suggestions.push({
      title: 'Hands-on filter rise',
      outcome: 'Instant tension you control with one slider',
      target: fd,
      explanation: `Sets ${deckName(d)}'s filter to high-pass with some resonance and adds a little echo. When you want the drop, drag the filter back to the centre — the bass slams back in.`,
      actions: [
        { type: 'set_fx', deck: fd, effect: 'filter', enabled: true, params: { amount: 0.6, resonance: 0.5 } },
        { type: 'set_fx', deck: fd, effect: 'echo', enabled: true, params: { time: 0.5, feedback: 0.5, mix: 0.3 } },
      ],
    });
    suggestions.push({
      title: 'Add a riser and impact on the pads',
      outcome: 'Classic FX moments you trigger yourself',
      target: 'beats',
      explanation: 'The pads already include a 4-second riser and a boom impact. Hit the riser ~4 seconds before the drop, and the impact on the drop.',
      actions: [{ type: 'open_panel', panel: 'pads' }],
    });
    return {
      message: d.playing
        ? `Here are three ways to build tension on ${deckName(d)}${d.effectiveBpm ? ` at ${d.effectiveBpm.toFixed(1)} BPM` : ''}. You stay in charge of when the drop lands.`
        : `Start a deck playing and these will lock to its beat. Here are three ways to build tension:`,
      terms: [TERMS.drop],
      suggestions,
    };
  }

  // ---- rhythm
  if (has(q, 'rhythm', 'beat', 'pattern', 'drum', 'groove', 'percussion')) {
    const r = rhythmFor(d);
    suggestions.push({
      title: `Layer: “${r.name}”`,
      outcome: 'A drum layer that follows your playing deck',
      target: 'beats',
      explanation: `${r.why} The pattern follows Deck ${fd}'s tempo and beat. Edit any step in the Beat Playground.`,
      actions: [
        { type: 'set_beat_pattern', pattern_name: r.name, pattern: r.rows, pattern_bpm: d.effectiveBpm ? Math.round(d.effectiveBpm) : undefined },
        { type: 'open_panel', panel: 'beats' },
      ],
    });
    return {
      message: d.loaded
        ? `Based on ${deckName(d)}${d.bpm ? ` (${d.bpm} BPM, ${d.bpmSource === 'composed' ? 'exact' : d.bpmSource})` : ''}, here’s a pattern that complements it rather than copying it.`
        : 'Here’s a starter pattern. Load a track and I can tailor it to the tempo.',
      suggestions,
    };
  }

  // ---- energy
  if (has(q, 'energ', 'hype', 'intense', 'excit', 'louder', 'punch', 'lift')) {
    suggestions.push({
      title: 'Brighten and push',
      outcome: 'More sparkle and bite',
      target: fd,
      explanation: 'A little extra High EQ brings out hi-hats, and gentle drive adds harmonics so the track feels more urgent. Keep an eye on the CLIP light.',
      actions: [
        { type: 'set_eq', deck: fd, band: 'high', value: 3 },
        { type: 'set_fx', deck: fd, effect: 'drive', enabled: true, params: { amount: 0.35, mix: 0.35 } },
      ],
    });
    const r = rhythmFor(d);
    suggestions.push({
      title: 'Add a percussion layer',
      outcome: 'Busier groove on top of the track',
      target: 'beats',
      explanation: r.why,
      actions: [{ type: 'set_beat_pattern', pattern_name: `${r.name} (energy)`, pattern: r.rows }],
    });
    suggestions.push({
      title: 'Quick 1-beat loop stutter',
      outcome: 'A rhythmic “stutter” moment',
      target: fd,
      explanation: 'A 1-beat loop for a bar or two, then release, is a simple energy spike. Apply, listen, then press Exit loop.',
      actions: [{ type: 'set_loop', deck: fd, beats: 1 }],
    });
    return { message: `Three ways to raise the energy on ${deckName(d)} — try one at a time.`, suggestions };
  }

  // ---- darker / deeper
  if (has(q, 'dark', 'deep', 'moody', 'warm', 'mellow', 'chill', 'calm', 'softer', 'less intense')) {
    suggestions.push({
      title: 'Darker and deeper',
      outcome: 'Muffled highs, warm low end',
      target: fd,
      explanation: 'A gentle low-pass filter removes brightness, a High EQ cut softens hats, and a touch of reverb pushes the track into the background.',
      actions: [
        { type: 'set_fx', deck: fd, effect: 'filter', enabled: true, params: { amount: -0.35, resonance: 0.25 } },
        { type: 'set_eq', deck: fd, band: 'high', value: -8 },
        { type: 'set_fx', deck: fd, effect: 'reverb', enabled: true, params: { decay: 3.5, mix: 0.25 } },
      ],
    });
    return { message: `Here’s a deeper, darker treatment for ${deckName(d)}. Undo it by dragging the filter back to the centre.`, terms: [TERMS.lowpass], suggestions };
  }

  // ---- space
  if (has(q, 'space', 'spacious', 'wide', 'big room', 'atmos')) {
    suggestions.push({
      title: 'Open up the space',
      outcome: 'A bigger, more atmospheric sound',
      target: fd,
      explanation: 'A long reverb at a moderate mix adds space without washing out the beat.',
      actions: [{ type: 'set_fx', deck: fd, effect: 'reverb', enabled: true, params: { decay: 4.5, mix: 0.4 } }],
    });
    return { message: 'Reverb is the quickest way to add space.', terms: [TERMS.reverb], suggestions };
  }

  // ---- echo
  if (has(q, 'echo', 'delay')) {
    suggestions.push({
      title: 'Beat-synced echo',
      outcome: 'Rhythmic repeats that follow the tempo',
      target: fd,
      explanation: `A ¾-beat echo with medium feedback on ${deckName(d)}. For an “echo out”, apply this, then pull the channel fader down: the repeats ring on after the track stops.`,
      actions: [{ type: 'set_fx', deck: fd, effect: 'echo', enabled: true, params: { time: 0.75, feedback: 0.55, mix: 0.45 } }],
    });
    return { message: 'Here’s an echo you can hear straight away.', terms: [TERMS.echo], suggestions };
  }

  // ---- vocal / loop experiments
  if (has(q, 'vocal', 'loop', 'stutter', 'repeat')) {
    suggestions.push({
      title: `2-beat loop on Deck ${fd}`,
      outcome: 'Repeat a short phrase to build a hook',
      target: fd,
      explanation: `Loops 2 beats from the current beat of ${deckName(d)}. Try it on a melodic part (the demo tracks have synth leads in the Drop and Break sections), then halve to 1 beat for a stutter, and exit when it lands.`,
      actions: [{ type: 'set_loop', deck: fd, beats: 2 }],
    });
    suggestions.push({
      title: 'Vocal-style chop on the pads',
      outcome: 'Add a synthesised “vox” stab on the off-beat',
      target: 'beats',
      explanation: 'MIXPLAY’s Vox Chops are formant-synthesised vocal sounds (not recordings). Tap them on the off-beats for a vocal hook.',
      actions: [{ type: 'trigger_sample', sound: 'vox-ah' }, { type: 'open_panel', panel: 'pads' }],
    });
    return { message: 'Loops are the fastest way to experiment with a phrase.', terms: [TERMS.loop], suggestions };
  }

  // ---- scratch
  if (has(q, 'scratch')) {
    return {
      message:
        'To scratch: 1) Play a track and find a punchy sound (a clap or a synth stab). 2) Turn on “Scratch” under the jog wheel. 3) Grab the wheel — or the zoomed waveform — and push forward and pull back in short, rhythmic strokes. 4) In Pro mode, switch the crossfader curve to “Cut” and flick the crossfader to chop the sound. The virtual record has weight: it speeds up, slows down and reverses smoothly with your hand, and carries on playing when you let go.',
      terms: [TERMS.scratch],
      suggestions: [],
    };
  }

  // ---- key lock / key / pitch
  if (has(q, 'key lock', 'keylock', 'pitch', 'chipmunk', 'harmonic', 'transpose', 'key clash', 'out of key')) {
    const plain =
      'Key lock keeps a track at its original pitch when you change its tempo, so speeding up doesn’t make vocals and synths sound “chipmunky”. Key shift moves a track up or down in semitones without changing its tempo — use it to bring two tracks into compatible keys (same or neighbouring Camelot codes).';
    if (d.loaded)
      suggestions.push({
        title: `Key lock on for Deck ${fd}`,
        outcome: 'Tempo changes without pitch changes',
        target: fd,
        explanation: `${deckName(d)} will keep its ${d.key ?? 'original'} key whatever its tempo.`,
        actions: [{ type: 'set_key_lock', deck: fd, enabled: true }],
      });
    return { message: plain, terms: [{ term: 'Key lock & key shift', plain }], suggestions };
  }

  // ---- explanations
  const t = termFor(q);
  if (t || has(q, 'what is', 'what does', 'how do', 'explain', 'mean')) {
    const term = t ?? TERMS.beatmatching;
    if (term === TERMS.lowpass || term === TERMS.highpass)
      suggestions.push({
        title: `Try a ${term === TERMS.lowpass ? 'low' : 'high'}-pass filter`,
        outcome: 'Hear it for yourself',
        target: fd,
        explanation: 'Sets the filter on your playing deck so you can hear the difference, then move the slider in the FX panel.',
        actions: [
          { type: 'set_fx', deck: fd, effect: 'filter', enabled: true, params: { amount: term === TERMS.lowpass ? -0.55 : 0.55, resonance: 0.3 } },
          { type: 'open_panel', panel: 'fx' },
        ],
      });
    if (term === TERMS.beatmatching && d.loaded && o.loaded)
      suggestions.push({
        title: `Match Deck ${o.id} to Deck ${d.id}`,
        outcome: 'Tempos matched and beats aligned',
        target: o.id,
        explanation: 'Sync does both steps for you. To learn it by ear: play both, adjust the tempo slider until the beats stop drifting, then nudge with the jog wheel.',
        actions: [{ type: 'sync_tempo', deck: o.id }],
      });
    if (term === TERMS.loop) suggestions.push({ title: '4-beat loop', outcome: 'Hold the current groove', target: fd, explanation: 'Loops one bar on your playing deck.', actions: [{ type: 'set_loop', deck: fd, beats: 4 }] });
    return { message: term.plain, terms: [{ term: term.term, plain: term.plain }], suggestions };
  }

  // ---- fallback
  return {
    message:
      'I can help you build tension and drops, suggest rhythms that fit your track, shape the sound (darker, brighter, more spacious), explain DJ terms, and troubleshoot a mix that sounds wrong. Try: “Help me create a build-up”, “Suggest a rhythm for this song” or “Why does my transition sound messy?”',
    suggestions: loadedAny
      ? []
      : [{ title: 'Start with a sample mix', outcome: 'Two tracks ready to mix', target: 'master', explanation: 'Open the Timeline to see the planned set, or load tracks from the library.', actions: [{ type: 'open_panel', panel: 'timeline' }] }],
  };
}
