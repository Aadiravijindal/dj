import { useState } from 'react';
import { Sparkles, Headphones, Disc3, ArrowRight, X } from 'lucide-react';
import { useApp } from '../../state/store';
import { openSample } from '../../state/actions';
import { engine } from '../../audio/engine';

/** First-run welcome: two questions, then straight into a working mix. Always skippable. */
export function Onboarding() {
  const show = useApp((s) => s.showOnboarding);
  const setShow = useApp((s) => s.setShowOnboarding);
  const update = useApp((s) => s.updateSettings);
  const go = useApp((s) => s.go);
  const setCoach = useApp((s) => s.setCoach);
  const [step, setStep] = useState<0 | 1>(0);
  if (!show) return null;

  const finish = () => {
    update((s) => void (s.onboarded = true));
    setShow(false);
  };
  const choose = (exp: 'new' | 'experienced') => {
    update((s) => {
      s.experience = exp;
      s.mode = exp === 'new' ? 'play' : 'pro';
    });
    setStep(1);
  };

  return (
    <div className="modal-backdrop onboard-backdrop">
      <div className="modal onboard" role="dialog" aria-modal="true" aria-label="Welcome to MIXPLAY" data-testid="onboarding">
        <button className="btn ghost icon-btn sm onboard-x" aria-label="Skip setup" onClick={finish} data-testid="onboarding-skip">
          <X />
        </button>
        {step === 0 ? (
          <>
            <span className="eyebrow">Welcome to MIXPLAY</span>
            <h2>Everything you need to DJ. Nothing you need to learn first.</h2>
            <p className="dim">How familiar are you with DJing? This only sets which controls you see first — switch any time.</p>
            <div className="onboard-choices">
              <button className="onboard-choice" onClick={() => choose('new')} data-testid="onboard-new">
                <Sparkles size={22} />
                <b>I’m new to DJing</b>
                <span className="small muted">Start in Play mode: the essentials, explained as you go.</span>
              </button>
              <button className="onboard-choice" onClick={() => choose('experienced')} data-testid="onboard-pro">
                <Headphones size={22} />
                <b>I’ve used DJ software before</b>
                <span className="small muted">Start in Pro mode: hot cues, manual loops, trim, beat repeat and more.</span>
              </button>
            </div>
            <button className="linklike small" onClick={finish}>
              Skip — just let me look around
            </button>
          </>
        ) : (
          <>
            <span className="eyebrow">Your first mix</span>
            <h2>Let’s get music playing.</h2>
            <p className="dim">We’ll open a ready-made mix with two house tracks at the same tempo, and a small checklist will guide you: play, bring in the second track, crossfade, add an effect, save.</p>
            <div className="onboard-choices">
              <button
                className="onboard-choice primary"
                data-testid="onboard-open-demo"
                onClick={() => {
                  engine.resume();
                  openSample('sunset-house');
                  setCoach('first-mix');
                  finish();
                }}
              >
                <Disc3 size={22} />
                <b>Open the demo mix</b>
                <span className="small muted">Sunset House Blend · 2 tracks ready on the decks</span>
              </button>
              <button
                className="onboard-choice"
                onClick={() => {
                  setCoach('first-mix');
                  finish();
                  go('library');
                }}
              >
                <ArrowRight size={22} />
                <b>Pick my own tracks</b>
                <span className="small muted">Browse the music library and load two songs.</span>
              </button>
            </div>
            <button className="linklike small" onClick={finish}>
              Skip the guide
            </button>
          </>
        )}
      </div>
    </div>
  );
}
