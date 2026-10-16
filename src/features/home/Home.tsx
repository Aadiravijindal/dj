import { Play, ArrowRight, Drum, Sparkles, Repeat2, Rocket, AudioWaveform, Disc3, Clock, Library as LibIcon, Star, GraduationCap } from 'lucide-react';
import { useApp } from '../../state/store';
import { openProjectById, openSample, newProject, loadTrack } from '../../state/actions';
import { SAMPLE_PROJECTS } from '../../project/samples';
import { getTrackMetaSync, demoCatalog } from '../../catalog/registry';
import { Artwork } from '../../ui/Artwork';
import { fmtAgo } from '../../ui/hooks';
import { soundById } from '../../audio/soundLibrary';
import { triggerSound } from '../beats/Pads';
import { engine } from '../../audio/engine';

const EXPERIMENTS = [
  { icon: Repeat2, title: 'Make a 1-beat stutter', text: 'Loop a single beat, then release it on the bar.', run: () => useApp.getState().go('studio'), lesson: 'loops' },
  { icon: AudioWaveform, title: 'Sweep a filter', text: 'Turn a track muffled, then bring it roaring back.', run: () => useApp.getState().setPanel('fx'), lesson: 'filters' },
  { icon: Rocket, title: 'Perform a drop', text: 'Design an 8-bar build-up and decide when it lands.', run: () => useApp.getState().setPanel('build'), lesson: 'buildup' },
  { icon: Drum, title: 'Layer your own beat', text: 'Program hats and claps over a playing track.', run: () => useApp.getState().setPanel('beats'), lesson: 'samples' },
];

export function Home() {
  const projects = useApp((s) => s.projects);
  const current = useApp((s) => s.project);
  const saveState = useApp((s) => s.saveState);
  const settings = useApp((s) => s.settings);
  const go = useApp((s) => s.go);
  const setCoach = useApp((s) => s.setCoach);
  const continueP = projects[0];
  const recentTracks = settings.recentTracks.map(getTrackMetaSync).filter(Boolean).slice(0, 6);
  const recentSounds = settings.recentSounds.map((id) => soundById(id)).filter(Boolean).slice(0, 6);
  const isNew = projects.length === 0;

  const start = () => {
    engine.resume();
    if (saveState === 'new' && !current.decks.A.trackId && !current.decks.B.trackId) {
      openSample('sunset-house');
      if (!settings.onboarded || isNew) setCoach('first-mix');
    } else go('studio');
  };

  return (
    <div className="page home" data-testid="home">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">MIXPLAY</span>
          <h1>
            Your music. Your creativity. <span className="grad">Your mix.</span>
          </h1>
          <p className="dim">Mix, loop, scratch, drop beats and shape sound with real DJ tools that explain themselves. An AI assistant is on hand when you want ideas — you’re always the DJ.</p>
          <div className="row wrap" style={{ gap: 12, marginTop: 8 }}>
            <button className="btn primary lg" onClick={start} data-testid="start-mixing">
              <Play /> Start mixing
            </button>
            <button className="btn lg" onClick={() => go('beats')}>
              <Drum /> Beat Playground
            </button>
          </div>
          {isNew && (
            <p className="small muted">
              New here? “Start mixing” opens a ready-made mix with two tracks and a short guide.{' '}
              <button className="linklike" onClick={() => go('learn')}>
                Or learn the basics first
              </button>
              .
            </p>
          )}
        </div>
        <div className="hero-visual" aria-hidden>
          <div className="hv-deck a">
            <Disc3 />
          </div>
          <div className="hv-wave">
            {Array.from({ length: 48 }, (_, i) => (
              <i key={i} style={{ height: `${18 + Math.abs(Math.sin(i * 0.7) * 50 + Math.sin(i * 0.23) * 30)}%`, animationDelay: `${(i % 12) * 0.08}s` }} />
            ))}
          </div>
          <div className="hv-deck b">
            <Disc3 />
          </div>
        </div>
      </section>

      {continueP && (
        <section className="home-section">
          <div className="section-head">
            <h2>Continue your mix</h2>
            <button className="btn ghost sm" onClick={() => go('mixes')}>
              All mixes <ArrowRight />
            </button>
          </div>
          <button className="continue-card" onClick={() => openProjectById(continueP.id)} data-testid="continue-mix">
            <div className="cc-arts">
              {continueP.trackIds.slice(0, 3).map((id) => {
                const m = getTrackMetaSync(id);
                return <Artwork key={id} art={m?.artwork ?? null} size={56} radius={12} />;
              })}
            </div>
            <div className="spacer" style={{ textAlign: 'left' }}>
              <div className="cc-title">
                {continueP.name} {continueP.favorite && <Star size={14} className="fav-on" />}
              </div>
              <div className="muted small">
                {continueP.trackIds.length} tracks · edited {fmtAgo(continueP.updatedAt)}
              </div>
            </div>
            <span className="btn accent">
              <Play /> Open
            </span>
          </button>
          {projects.length > 1 && (
            <div className="recent-projects">
              {projects.slice(1, 5).map((p) => (
                <button key={p.id} className="mini-proj" onClick={() => openProjectById(p.id)}>
                  <b>{p.name}</b>
                  <span className="muted small">{fmtAgo(p.openedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="home-section">
        <div className="section-head">
          <h2>Sample mixes</h2>
          <button className="btn ghost sm" onClick={() => newProject('Untitled mix')}>
            Blank mix <ArrowRight />
          </button>
        </div>
        <div className="sample-grid">
          {SAMPLE_PROJECTS.map((s) => {
            const p = s.make();
            const ids = [p.decks.A.trackId, p.decks.B.trackId].filter(Boolean) as string[];
            return (
              <button key={s.key} className="sample-card" onClick={() => openSample(s.key)} data-testid={`sample-${s.key}`}>
                <div className="sample-arts">
                  {ids.map((id) => (
                    <Artwork key={id} art={getTrackMetaSync(id)?.artwork ?? null} size={64} radius={14} />
                  ))}
                </div>
                <b>{s.name}</b>
                <p className="small muted">{s.description}</p>
                <div className="row wrap">
                  {s.tags.map((t) => (
                    <span key={t} className="chip tiny">
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="home-section">
        <div className="section-head">
          <h2>Creative experiments</h2>
          <button className="btn ghost sm" onClick={() => go('learn')}>
            <GraduationCap /> Learn DJing
          </button>
        </div>
        <div className="exp-grid">
          {EXPERIMENTS.map((e) => (
            <button
              key={e.title}
              className="exp-card"
              onClick={() => {
                if (!current.decks.A.trackId) openSample('sunset-house');
                e.run();
                go('studio');
                setCoach(e.lesson);
              }}
            >
              <e.icon size={20} />
              <b>{e.title}</b>
              <span className="small muted">{e.text}</span>
            </button>
          ))}
          <button
            className="exp-card ai"
            onClick={() => {
              go('studio');
              useApp.getState().setAssistantOpen(true);
            }}
          >
            <Sparkles size={20} />
            <b>Ask for an idea</b>
            <span className="small muted">“Make this part darker”, “suggest a rhythm”…</span>
          </button>
        </div>
      </section>

      <section className="home-section two-col">
        <div>
          <div className="section-head">
            <h2>
              <Clock size={17} /> Recently played
            </h2>
            <button className="btn ghost sm" onClick={() => go('library')}>
              <LibIcon /> Library
            </button>
          </div>
          <div className="recent-tracks">
            {(recentTracks.length ? recentTracks : demoCatalog.all().slice(0, 4)).map((m) => (
              <div key={m!.id} className="recent-track">
                <Artwork art={m!.artwork} size={40} />
                <div className="spacer" style={{ minWidth: 0 }}>
                  <div className="ellipsis">{m!.title}</div>
                  <div className="small muted ellipsis">
                    {m!.artist} · {m!.bpm} BPM
                  </div>
                </div>
                <button className="btn xs" onClick={() => loadTrack('A', m!.id).then(() => go('studio'))}>
                  A
                </button>
                <button className="btn xs" onClick={() => loadTrack('B', m!.id).then(() => go('studio'))}>
                  B
                </button>
              </div>
            ))}
            {!recentTracks.length && <p className="small muted">Suggestions from the demo catalog — tracks you play will show up here.</p>}
          </div>
        </div>
        <div>
          <div className="section-head">
            <h2>Recent sounds</h2>
            <button className="btn ghost sm" onClick={() => go('sounds')}>
              Sound Library <ArrowRight />
            </button>
          </div>
          <div className="recent-sounds">
            {(recentSounds.length ? recentSounds : ['impact-boom', 'rise-4', 'fx-horn', 'vox-ah'].map(soundById)).map((s) => (
              <button key={s!.id} className="sound-chip" style={{ ['--hue' as string]: s!.hue }} onClick={() => triggerSound(s!.id, 0.8, false)}>
                <Play size={12} /> {s!.name}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
