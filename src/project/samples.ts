import { createProject, uid, BUILD_TEMPLATES } from './defaults';
import type { Project, TimelineItem, TransitionKind } from './types';
import { demoSections } from '../catalog/demoTracks';

const item = (local: string, transition: TransitionKind, note: string, sections?: [string, string?]): TimelineItem => {
  const secs = demoSections(local);
  const startSec = sections ? secs.find((s) => s.name === sections[0])?.start ?? 0 : 0;
  const endSec = sections?.[1] ? secs.find((s) => s.name === sections[1])?.end ?? null : null;
  return {
    id: uid('i'),
    trackId: `demo:${local}`,
    start: startSec,
    end: endSec,
    transition,
    note,
    markers: secs
      .filter((s) => s.name.startsWith('Drop') || s.name === 'Break' || s.name === 'Chorus')
      .map((s) => ({ id: uid('m'), time: s.start, label: s.name })),
  };
};

export interface SampleProject {
  key: string;
  name: string;
  description: string;
  tags: string[];
  make: () => Project;
}

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    key: 'sunset-house',
    name: 'Sunset House Blend',
    description: 'Two 124 BPM house tracks that already share a tempo — the easiest first mix.',
    tags: ['Beginner', 'House', '124 BPM'],
    make: () => {
      const p = createProject('Sunset House Blend');
      p.description = 'Two house tracks at 124 BPM. Start Deck A, bring in Deck B on the beat, then slide the crossfader.';
      p.decks.A.trackId = 'demo:neon-tide';
      p.decks.B.trackId = 'demo:sunday-signal';
      p.mixer.crossfader = -1;
      const arr = p.timeline.arrangements[0];
      arr.name = 'Golden hour';
      arr.items = [
        item('neon-tide', 'blend', 'Open with the intro drums. Bring Sunday Signal in during the Outro.'),
        item('sunday-signal', 'echo-out', 'Echo out at the end of Drop 2.'),
        item('velvet-hours', 'build-drop', 'Tempo jump 124 → 116: nudge Deck B down or let the echo cover it.'),
      ];
      arr.notes = 'Warm-up set for the terrace. Keep the energy steady until Velvet Hours.';
      return p;
    },
  },
  {
    key: 'warehouse-techno',
    name: 'Warehouse Techno',
    description: 'Tech house into techno — practise matching 126 to 128 BPM with the tempo slider.',
    tags: ['Intermediate', 'Techno', 'Beatmatching'],
    make: () => {
      const p = createProject('Warehouse Techno');
      p.description = 'Glass Elevator runs at 126 BPM and Night Shift Engine at 128. Match them by ear, or press Sync.';
      p.decks.A.trackId = 'demo:glass-elevator';
      p.decks.B.trackId = 'demo:night-shift-engine';
      p.decks.A.tempoRange = 16;
      p.decks.B.tempoRange = 16;
      p.mixer.crossfader = -1;
      p.fx.B.filter = { enabled: true, amount: 0.3, resonance: 0.3 };
      p.build = { ...BUILD_TEMPLATES['festival-16'].make(), deck: 'B' };
      const arr = p.timeline.arrangements[0];
      arr.name = 'Peak time';
      arr.items = [
        item('glass-elevator', 'filter-fade', 'Groove section is perfect for the blend.'),
        item('night-shift-engine', 'build-drop', 'Festival build into Drop 2.'),
        item('skyline-pulse', 'cut', 'Hard cut on the downbeat — 128 → 138 is a big jump.'),
      ];
      return p;
    },
  },
  {
    key: 'lofi-synthwave',
    name: 'Lo-fi to Synthwave',
    description: 'A chilled journey from dusty lo-fi beats into a neon night drive.',
    tags: ['Chill', 'Lo-fi', 'Creative'],
    make: () => {
      const p = createProject('Lo-fi to Synthwave');
      p.description = 'Golden Static (86 BPM) into Afterglow Run (100 BPM). Use echo and reverb to glue them.';
      p.decks.A.trackId = 'demo:golden-static';
      p.decks.B.trackId = 'demo:afterglow-run';
      p.mixer.crossfader = -1;
      p.fx.A.reverb = { enabled: true, decay: 3.5, mix: 0.25 };
      p.beats.follow = 'A';
      p.beats.activePatternId = p.beats.patterns[2].id;
      const arr = p.timeline.arrangements[0];
      arr.name = 'Night drive';
      arr.items = [
        item('golden-static', 'echo-out', 'Echo out the final keys.'),
        item('afterglow-run', 'blend', 'Start from the pad intro — no drums to clash.'),
      ];
      return p;
    },
  },
];
