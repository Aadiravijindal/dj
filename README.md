# MIXPLAY

**Your music. Your creativity. Your mix.**
*Everything you need to DJ. Nothing you need to learn first.*

MIXPLAY is a browser DJ studio for everyone: two decks, a real mixer, effects, loops, cue points, scratch-capable jog wheels, a beat sequencer, performance pads, a Build & Drop workspace, a mix timeline, and a creative AI assistant. **You are the DJ. AI is your creative assistant.** The assistant suggests; nothing changes until you press Apply.

## How to run it

**You need:** [Node.js](https://nodejs.org) 20.11 or newer (includes npm) and a modern browser (Chrome, Edge, Firefox or Safari).

```bash
git clone https://github.com/Aadiravijindal/dj.git mixplay
cd mixplay
git checkout claude/vibrant-bohr-v1w4z5   # until it's merged
npm install
npm run dev
```

Open **http://localhost:5173**, click anywhere once (browsers only allow sound after a click), and choose *I'm new to DJing → Open the demo mix*.

**Production build** (one Node process serves the app and the API):

```bash
npm run build
npm start                  # http://localhost:8787  (set PORT to change)
```

**Optional — real AI assistant.** Create a `.env` file in the project folder (see `.env.example`) and restart:

```bash
ANTHROPIC_API_KEY=sk-ant-...      # server-side only, never sent to the browser
MIXPLAY_AI_MODEL=claude-opus-5-5  # optional
```

Without a key everything still works; the assistant runs as a clearly labelled demo.

**Optional — headphones and controllers.** In *Settings → Audio* turn on *Split (L/R)* cue (main mix in the left ear, cued deck in the right) or pick a second output device. In *Settings → DJ controller* press *Connect MIDI*, then *Learn* next to an action and move the control on your hardware.

## What's in the box

| Area | What actually works |
| --- | --- |
| **DJ Studio** | Two decks with play/pause, CUE (CDJ-style), 4 or 8 hot cues, seek, waveform (3-band colour, beat grid, zoom 2–32 s, section labels), tempo ±8/16/50 % with **key lock**, **key shift** ±6 semitones, nudge, Sync (tempo + beat phase), brake, quantize, keyboard shortcuts and **MIDI controllers**. |
| **Mixer** | Trim, 3-band EQ (with kill), channel faders, equal-power or sharp crossfader, master, peak meters, pre-limiter clip LED, always-on safety limiter, mute, headphone cue (**split L/R** on any output, or a second output device). |
| **Jog wheels** | Vinyl mode scratches forward *and* backward on a sample-accurate worklet with record-like inertia; otherwise the wheel nudges tempo while playing or scrubs while paused. Dragging the zoomed waveform scratches too. |
| **Effects** | Per deck: bipolar filter (low-pass ↔ high-pass, resonance), beat-synced echo, reverb, flanger, phaser, drive — plus beginner macros (“Build tension”, “Make it spacious”, …). Feedback is capped; nothing can run away. |
| **Loops & cues** | Auto loops ¼–16 beats, loop in/out, halve/double, saved loops, beat repeat with slip (Pro), hot cues saved in the mix. |
| **Beat Playground** | 16-step sequencer (multiple saved patterns, accents, swing, per-row sound/volume/mute) scheduled on the audio clock, optionally locked to a deck's tempo and bar. 16 assignable pads (one-shots and tempo-locked loops), quantised to the music. |
| **Build & Drop** | Arrange rolls, risers, filter sweeps, echo throws, loop rolls, percussion, silence, impacts and bass hits on a bar grid; Perform locks it to the deck's next bar; you can “Drop now” at any moment. Templates are editable starting points. |
| **Timeline** | Plan a set: reorder tracks, transitions, markers, notes, alternative arrangements and a compare view, measured energy curves, section preview. It's a plan — it never performs by itself. |
| **My Mixes** | Create, rename, duplicate, delete (with confirmation), favourite, autosave, export/import JSON. Mixes store track references and settings, never audio. |
| **Learn DJing** | 14 hands-on lessons whose steps tick off only when you actually do them (verified against the engine). First-run onboarding with Play/Pro choice; always skippable. |
| **AI assistant** | Natural-language help that returns schema-validated suggestions mapped to real controls, with Preview (auto-reverts after 8 s), Apply (with Undo) and Dismiss. Separates **measured** facts from suggestions. |

## Music and rights

There is no licensed commercial catalog connected, and MIXPLAY never pretends otherwise. The **MIXPLAY Demo Catalog** contains 10 original tracks (house, deep house, tech house, techno, disco, synthwave, lo-fi, trance, drum & bass) that are *composed and synthesised on your device* in a Web Worker — so their BPM, key, structure and beat grid are exact facts, and they are cleared for mixing, looping and effects. All pad sounds and loops are synthesised too.

The catalog layer (`src/catalog/types.ts`) is a provider interface — search, metadata, artwork, availability, authorised playback — so a properly licensed catalog can be added later without touching the studio. A separate, optional “My files” tab decodes local audio for the current session only (tempo labelled *estimated*).

## Notes and requirements

- **Key lock / key shift** use an AudioWorklet pitch shifter (two crossfaded delay-line heads, 40 ms window). It adds a constant 20 ms latency to both decks, and pads/beats are delayed by the same amount so everything stays in time. Large shifts (beyond about ±15 %) get audibly grainier — the usual trade-off of real-time shifting.
- **Scratching** runs on a sample-accurate AudioWorklet: the virtual record follows your hand through a critically damped spring, so it accelerates, stops and reverses smoothly. Browsers without AudioWorklet fall back to the simpler source-restart scratch.
- **Headphone cue** works everywhere in *Split* mode; *Second device* needs `HTMLMediaElement.setSinkId` (Chromium-based browsers).
- **MIDI controllers** need Web MIDI (Chrome, Edge, Opera, Firefox — not Safari). Any class-compliant controller can be mapped with MIDI learn; jog wheels use the common relative encoding.
- **Demo tracks** are synthesised once per browser and cached in IndexedDB (~18 MB each); the whole catalog is pre-rendered in the background, so later loads take well under a second.

## Testing

```bash
npm test             # unit tests (schema, demo assistant, DSP/analysis, persistence, server w/ mocked model)
npm run test:e2e     # Playwright (Chromium): acceptance scenarios, interactions, key lock, scratch, cue, MIDI, cache
# other browsers:
npx playwright install firefox webkit
PW_ALL_BROWSERS=1 npm run test:e2e
```

The end-to-end tests check real audio, not just UI state: they read the engine's analysers to confirm both decks are audible, the crossfader isolates decks, filters remove >30 dB in the target band, loops wrap within the loop region, the sequencer produces sound, and so on.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the design.
