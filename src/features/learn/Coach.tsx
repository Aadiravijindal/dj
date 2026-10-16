import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, X, GraduationCap, PartyPopper, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../state/store';
import { LESSONS, baseline, type Baseline } from './lessons';

/** Floating, dismissible guide that ticks off steps as the user actually performs them. */
export function Coach() {
  const lessonId = useApp((s) => s.coachLesson);
  const setCoach = useApp((s) => s.setCoach);
  const update = useApp((s) => s.updateSettings);
  const lesson = LESSONS.find((l) => l.id === lessonId) ?? null;
  const [done, setDone] = useState(0);
  const [min, setMin] = useState(false);
  const base = useRef<Baseline | null>(null);

  useEffect(() => {
    setDone(0);
    setMin(false);
    base.current = lesson ? baseline() : null;
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lesson) return;
    const t = setInterval(() => {
      setDone((n) => {
        if (n >= lesson.steps.length || !base.current) return n;
        let k = n;
        // allow several steps to complete at once (e.g. sample mix already loaded)
        while (k < lesson.steps.length && lesson.steps[k].check(base.current)) k++;
        return k;
      });
    }, 250);
    return () => clearInterval(t);
  }, [lesson]);

  useEffect(() => {
    if (lesson && done >= lesson.steps.length) {
      update((s) => {
        if (!s.completedLessons.includes(lesson.id)) s.completedLessons.push(lesson.id);
        if (lesson.id === 'first-mix') s.onboarded = true;
      });
    }
  }, [done, lesson, update]);

  if (!lesson) return null;
  const complete = done >= lesson.steps.length;
  return (
    <aside className={`coach${min ? ' min' : ''}`} aria-label={`Guide: ${lesson.title}`} data-testid="coach">
      <div className="coach-head">
        {complete ? <PartyPopper size={16} className="ok-text" /> : <GraduationCap size={16} className="accent-text" />}
        <b className="spacer">{lesson.title}</b>
        <span className="small muted mono">
          {Math.min(done, lesson.steps.length)}/{lesson.steps.length}
        </span>
        <button className="btn ghost icon-btn xs" aria-label={min ? 'Expand guide' : 'Minimise guide'} onClick={() => setMin((m) => !m)}>
          {min ? <ChevronUp /> : <ChevronDown />}
        </button>
        <button className="btn ghost icon-btn xs" aria-label="Close guide" onClick={() => setCoach(null)}>
          <X />
        </button>
      </div>
      {!min && (
        <>
          <ol className="coach-steps">
            {lesson.steps.map((s, i) => (
              <li key={i} className={i < done ? 'done' : i === done ? 'now' : ''} data-testid={`coach-step-${i}`}>
                {i < done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                <div>
                  <div>{s.text}</div>
                  {i === done && s.hint && <div className="small muted">{s.hint}</div>}
                </div>
              </li>
            ))}
          </ol>
          {complete ? (
            <div className="coach-done">
              <span>Nice work — you did it yourself.</span>
              <button className="btn sm accent" onClick={() => setCoach(null)}>
                Keep playing
              </button>
            </div>
          ) : (
            <div className="small muted">Steps tick off automatically when you do them. You can close this any time.</div>
          )}
        </>
      )}
    </aside>
  );
}
