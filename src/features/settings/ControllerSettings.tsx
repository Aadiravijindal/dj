import { useSyncExternalStore } from 'react';
import { Plug, Radio, X, Usb } from 'lucide-react';
import { midi, MIDI_ACTIONS } from '../../midi/midi';
import { useApp } from '../../state/store';

export function ControllerSettings() {
  useSyncExternalStore(
    (cb) => midi.subscribe(cb),
    () => `${midi.learning}|${midi.inputs.length}|${midi.lastMessage}|${midi.error}`,
  );
  const enabled = useApp((s) => s.settings.midiEnabled);
  const map = useApp((s) => s.settings.midiMap);
  const update = useApp((s) => s.updateSettings);
  const keyFor = (actionId: string) => Object.keys(map).find((k) => map[k] === actionId) ?? null;
  const groups = [...new Set(MIDI_ACTIONS.map((a) => a.group))];

  if (!midi.supported) {
    return <p className="small muted">This browser has no Web MIDI support. Controllers work in Chrome, Edge, Opera and Firefox.</p>;
  }

  return (
    <div className="stack" style={{ width: '100%' }} data-testid="midi-settings">
      <div className="setting">
        <div>
          <b>Use a MIDI controller</b>
          <p className="small muted">Plug in any class-compliant DJ controller or MIDI device, then map its buttons, faders, knobs and jog wheels below with Learn.</p>
          {midi.error && <p className="small danger-text">{midi.error}</p>}
        </div>
        {enabled ? (
          <button
            className="btn sm"
            onClick={() => {
              midi.disable();
              update((s) => void (s.midiEnabled = false));
            }}
          >
            <X /> Disconnect
          </button>
        ) : (
          <button
            className="btn sm accent"
            data-testid="midi-enable"
            onClick={async () => {
              if (await midi.enable()) update((s) => void (s.midiEnabled = true));
            }}
          >
            <Plug /> Connect MIDI
          </button>
        )}
      </div>
      {enabled && (
        <>
          <div className="row wrap small">
            <Usb size={14} />
            {midi.inputs.length ? midi.inputs.map((i) => <span key={i.id} className="chip tiny ok">{i.name}</span>) : <span className="muted">No MIDI devices found — plug one in.</span>}
            <span className="spacer" />
            {midi.lastMessage && <span className="mono muted">Last: {midi.lastMessage}</span>}
          </div>
          <div className="midi-map">
            {groups.map((g) => (
              <div key={g} className="midi-group">
                <div className="eyebrow">{g}</div>
                {MIDI_ACTIONS.filter((a) => a.group === g).map((a) => {
                  const k = keyFor(a.id);
                  const learning = midi.learning === a.id;
                  return (
                    <div key={a.id} className="midi-row">
                      <span className="spacer">{a.label}</span>
                      <span className="mono small muted">{k ?? '—'}</span>
                      <button
                        className={`btn xs${learning ? ' on' : ''}`}
                        data-testid={`learn-${a.id}`}
                        onClick={() => midi.startLearn(learning ? null : a.id)}
                      >
                        <Radio /> {learning ? 'Move a control…' : 'Learn'}
                      </button>
                      {k && (
                        <button className="btn ghost icon-btn xs" aria-label={`Clear mapping for ${a.label}`} onClick={() => update((s) => void delete s.midiMap[k])}>
                          <X />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
