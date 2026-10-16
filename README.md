# MIXPLAY

**Your music. Your creativity. Your mix.**
*Everything you need to DJ. Nothing you need to learn first.*

MIXPLAY is a browser DJ studio for everyone: two decks, a real mixer, effects, loops, cue points, scratch-capable jog wheels, a beat sequencer, performance pads, a Build & Drop workspace, a mix timeline, and a creative AI assistant. **You are the DJ. AI is your creative assistant.** The assistant suggests; nothing changes until you press Apply.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (app + API in one process)
```

Production:

```bash
npm run build
npm start            # serves dist/ and the API on PORT (default 8787)
```

No accounts or keys are needed. Optional configuration lives on the **server** only (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables the real AI assistant (Claude). Never sent to the browser. |
| `MIXPLAY_AI_MODEL` | Optional model override (default `claude-opus-5-5`). |
| `PORT` | Port for `npm start`. |

Without a key the assistant runs as a clearly labelled **demo assistant** (rule-based, not an AI model) that reads the same measured studio data and returns the same validated suggestions.

## What's in the box

| Area | What actually works |
| --- | --- |
| **DJ Studio** | Two decks with play/pause, CUE (CDJ-style), 4 or 8 hot cues, seek, waveform (3-band colour, beat grid, zoom 2–32 s, section labels), tempo ±8/16/50 %, nudge, Sync (tempo + beat phase), brake, quantize, keyboard shortcuts. |
| **Mixer** | Trim, 3-band EQ (with kill), channel faders, equal-power or sharp crossfader, master, peak meters, pre-limiter clip LED, always-on safety limiter, mute, headphone cue to a second output (where `setSinkId` is supported). |
| **Jog wheels** | Vinyl mode scratches forward *and* backward (reversed-buffer playback following your hand speed); otherwise the wheel nudges tempo while playing or scrubs while paused. Dragging the zoomed waveform scratches too. |
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

## Honest limitations

- Tempo changes are vinyl-style (pitch follows tempo). Pitch-preserving time-stretch / key lock is not implemented and the UI says so.
- Browser scratching follows your hand speed and direction but can't match a real turntable's feel.
- Headphone cue requires a browser with `HTMLMediaElement.setSinkId` and a second output device.
- Hardware DJ controllers (MIDI/HID) are not supported yet; the engine API is ready for it.
- Demo tracks take ~1–3 s to render the first time they're loaded (cached afterwards in memory).

## Testing

```bash
npm test             # unit tests (schema, demo assistant, DSP/analysis, persistence, server w/ mocked model)
npm run test:e2e     # Playwright: the 10 acceptance scenarios + performance interactions
```

The end-to-end tests check real audio, not just UI state: they read the engine's analysers to confirm both decks are audible, the crossfader isolates decks, filters remove >30 dB in the target band, loops wrap within the loop region, the sequencer produces sound, and so on.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the design.
