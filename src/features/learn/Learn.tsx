import { CheckCircle2, Clock, Play, BookOpen } from 'lucide-react';
import { useApp } from '../../state/store';
import { LESSONS, startLesson } from './lessons';

const GLOSSARY: [string, string][] = [
  ['BPM', 'Beats per minute — the speed of a track.'],
  ['Beatmatching', 'Matching two tracks’ tempo, then lining up their beats.'],
  ['Crossfader', 'Slides between Deck A and Deck B.'],
  ['EQ', 'High / Mid / Low tone controls for each deck.'],
  ['Cue point', 'A bookmark in a track you can jump back to.'],
  ['Loop', 'A section of beats that repeats until you exit it.'],
  ['Phrase', 'Dance music is built in blocks of 8 or 16 bars — mix on these boundaries.'],
  ['Drop', 'When the full beat and bass return after a build-up.'],
  ['Low-pass / High-pass', 'Filters that remove highs (muffled) or lows (thin).'],
  ['Quantize', 'Snapping actions to the beat grid so they land in time.'],
];

export function Learn() {
  const completed = useApp((s) => s.settings.completedLessons);
  return (
    <div className="page learn" data-testid="learn">
      <header className="page-head">
        <div>
          <h1>Learn DJing</h1>
          <p className="muted">Short, hands-on guides. Each one opens the studio and ticks off steps as you actually do them. Skip any of them — the studio is always open.</p>
        </div>
        <span className="chip ok">
          {completed.length}/{LESSONS.length} done
        </span>
      </header>
      <div className="lesson-grid">
        {LESSONS.map((l, i) => {
          const done = completed.includes(l.id);
          return (
            <article key={l.id} className={`lesson${done ? ' done' : ''}`}>
              <div className="row">
                <span className="lesson-num mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="spacer" />
                {done ? (
                  <span className="chip ok tiny">
                    <CheckCircle2 /> Done
                  </span>
                ) : (
                  <span className="chip tiny">
                    <Clock /> {l.minutes} min
                  </span>
                )}
              </div>
              <h3>{l.title}</h3>
              <p className="small muted">{l.summary}</p>
              <ol className="lesson-steps small">
                {l.steps.map((s, k) => (
                  <li key={k}>{s.text}</li>
                ))}
              </ol>
              <button className="btn sm accent" onClick={() => startLesson(l.id)} data-testid={`lesson-${l.id}`}>
                <Play /> {done ? 'Practise again' : 'Try it'}
              </button>
            </article>
          );
        })}
      </div>
      <section className="glossary">
        <h2>
          <BookOpen size={18} /> Quick glossary
        </h2>
        <dl>
          {GLOSSARY.map(([t, d]) => (
            <div key={t}>
              <dt>{t}</dt>
              <dd className="muted">{d}</dd>
            </div>
          ))}
        </dl>
        <p className="small muted">Want more? Ask the assistant “what does … mean?” anywhere in the studio.</p>
      </section>
    </div>
  );
}
