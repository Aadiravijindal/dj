import { useEffect, useState } from 'react';
import { Bot, FlaskConical, Headphones, Keyboard, Library, Database, Gamepad2, RotateCcw, Trash2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useApp, toast } from '../../state/store';
import { getStatus, type ServiceStatus } from '../../ai/client';
import { engine } from '../../audio/engine';
import { demoCatalog, PLANNED_INTEGRATIONS } from '../../catalog/registry';
import { clearAllData } from '../../project/storage';
import { Confirm } from '../../ui/Modal';
import { ModeSwitch } from '../studio/Studio';

function Section({ icon: Icon, title, children }: { icon: typeof Bot; title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2>
        <Icon size={18} /> {title}
      </h2>
      <div className="settings-body">{children}</div>
    </section>
  );
}

export function Settings() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    getStatus(true).then(setStatus);
  }, []);

  const listDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'audiooutput'));
    } catch (e) {
      toast('error', `Couldn't list audio outputs: ${(e as Error).message}`);
    }
  };

  return (
    <div className="page settings" data-testid="settings">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Everything works without accounts or keys. Optional services are explained below.</p>
        </div>
      </header>

      <Section icon={Gamepad2} title="Interface">
        <div className="setting">
          <div>
            <b>Mode</b>
            <p className="small muted">Play mode keeps things simple. Pro mode adds trim, 8 hot cues, manual loops, beat repeat, brake, quantize, crossfader curve and headphone cue. Switching never changes your mix.</p>
          </div>
          <ModeSwitch />
        </div>
        <label className="setting">
          <div>
            <b>Helpful tooltips</b>
            <p className="small muted">Plain-language explanations when you hover over controls.</p>
          </div>
          <input type="checkbox" className="toggle" checked={settings.tips} onChange={(e) => update((s) => void (s.tips = e.target.checked))} />
        </label>
        <label className="setting">
          <div>
            <b>Autosave</b>
            <p className="small muted">Save your mix automatically a moment after each change.</p>
          </div>
          <input type="checkbox" className="toggle" checked={settings.autosave} onChange={(e) => update((s) => void (s.autosave = e.target.checked))} />
        </label>
        <div className="setting">
          <div>
            <b>Welcome guide</b>
            <p className="small muted">Show the first-time setup again.</p>
          </div>
          <button
            className="btn sm"
            onClick={() => {
              update((s) => void (s.onboarded = false));
              useApp.getState().setShowOnboarding(true);
            }}
          >
            <RotateCcw /> Show again
          </button>
        </div>
      </Section>

      <Section icon={Bot} title="AI assistant">
        {status === null ? (
          <p className="muted">Checking…</p>
        ) : status.ai.configured ? (
          <div className="status-line ok-text">
            <CheckCircle2 size={16} /> Connected to <b className="mono">&nbsp;{status.ai.model}&nbsp;</b> through the MIXPLAY server.
          </div>
        ) : (
          <>
            <div className="status-line warn-text">
              <FlaskConical size={16} /> Demo assistant active — not connected to an AI model.
            </div>
            <p className="small muted">
              {status.server
                ? 'The MIXPLAY server is running but has no AI key configured.'
                : 'No MIXPLAY server was found (the app may be hosted as static files).'}{' '}
              The demo assistant answers with built-in rules using the same measured studio data and the same Preview / Apply / Dismiss controls.
            </p>
            <div className="code-hint">
              <div className="small">To connect a real model, set these on the <b>server</b> (never in the browser) and restart:</div>
              <pre className="mono">{`ANTHROPIC_API_KEY=sk-ant-…\nMIXPLAY_AI_MODEL=claude-opus-5-5   # optional`}</pre>
            </div>
          </>
        )}
        <button className="btn ghost sm" onClick={() => getStatus(true).then(setStatus)}>
          <RefreshCw /> Re-check
        </button>
      </Section>

      <Section icon={Library} title="Music catalog">
        <div className="status-line ok-text">
          <CheckCircle2 size={16} /> {demoCatalog.name} — {demoCatalog.status().label}
        </div>
        <p className="small muted">{demoCatalog.status().detail}</p>
        {PLANNED_INTEGRATIONS.map((p) => (
          <div key={p.id} className="setting">
            <div>
              <b>{p.name}</b>
              <p className="small muted">{p.requirement}</p>
            </div>
            <span className="chip">Not connected</span>
          </div>
        ))}
        <p className="small muted">
          MIXPLAY never scrapes streaming services, bypasses DRM or downloads music without permission. A subscription to a streaming service does not by itself allow its music to be mixed in third-party apps.
        </p>
      </Section>

      <Section icon={Headphones} title="Audio">
        <div className="setting">
          <div>
            <b>Output</b>
            <p className="small muted">
              Sample rate {engine.ctx?.sampleRate ?? '—'} Hz · {engine.running ? 'running' : 'waiting for your first click or tap'} · safety limiter always on.
            </p>
          </div>
        </div>
        <div className="setting">
          <div>
            <b>Headphone cue (pre-listen)</b>
            <p className="small muted">
              Sends decks with the headphone button (Pro mode) to a second audio output, such as a USB headset.{' '}
              {engine.supportsSinkId ? 'Your browser supports choosing an output.' : 'Your browser can’t send audio to a second device, so headphone cue is unavailable here.'}
            </p>
            {devices && (
              <select
                className="select"
                value={settings.cueDeviceId ?? ''}
                onChange={async (e) => {
                  const id = e.target.value || null;
                  const r = await engine.setCueDevice(id);
                  toast(r.ok ? 'success' : 'error', r.message);
                  if (r.ok) update((s) => void (s.cueDeviceId = id));
                }}
                aria-label="Headphone output"
              >
                <option value="">Off</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Output ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button className="btn sm" disabled={!engine.supportsSinkId} onClick={listDevices}>
            Find outputs
          </button>
        </div>
        <div className="setting">
          <div>
            <b>DJ controllers</b>
            <p className="small muted">Hardware controller support (MIDI/HID) is not available yet. The engine is designed so controllers can drive the same deck, mixer and effects actions later.</p>
          </div>
          <span className="chip">Coming later</span>
        </div>
      </Section>

      <Section icon={Keyboard} title="Keyboard">
        <label className="setting">
          <div>
            <b>Studio shortcuts</b>
            <p className="small muted">Active in the DJ Studio when you’re not typing.</p>
          </div>
          <input type="checkbox" className="toggle" checked={settings.keyboard} onChange={(e) => update((s) => void (s.keyboard = e.target.checked))} />
        </label>
        <div className="shortcuts">
          {[
            ['F / J', 'Play / pause Deck A / B'],
            ['D / K', 'Cue Deck A / B (hold to preview)'],
            ['1–4', 'Deck A hot cues'],
            ['7–0', 'Deck B hot cues'],
            ['S / L', 'Crossfader left / right'],
            ['Ctrl/⌘ + S', 'Save mix'],
          ].map(([k, v]) => (
            <div key={k}>
              <span className="kbd">{k}</span> <span className="muted">{v}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Database} title="Your data">
        <p className="small muted">
          Mixes and preferences are stored in this browser only (no account needed). They contain track references and creative settings — never audio. Use Export in My Mixes to back up or move a mix.
        </p>
        <button className="btn danger sm" onClick={() => setConfirmReset(true)}>
          <Trash2 /> Delete all MIXPLAY data on this device
        </button>
      </Section>

      {confirmReset && (
        <Confirm
          title="Delete everything?"
          message={
            <>
              <AlertTriangle size={14} /> All saved mixes and preferences in this browser will be permanently deleted.
            </>
          }
          confirmLabel="Delete everything"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            clearAllData();
            location.hash = '/home';
            location.reload();
          }}
        />
      )}
    </div>
  );
}
