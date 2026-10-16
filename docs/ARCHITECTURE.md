# MIXPLAY architecture

## Stack

- **Client:** React 19 + TypeScript, Vite, Zustand (+ Immer) for state, Web Audio API for all sound, lucide icons, self-hosted fonts.
- **Server:** a small Node HTTP server (`server/`) used both as Vite middleware in dev and standalone in production. It serves the JSON API (`/api/status`, `/api/assistant`) and, in production, the built app.
- **Shared:** `shared/assistantSchema.ts` — the zod contract between the assistant and the studio, used on both sides.

## Module map

```
src/
  audio/                 ← the engine (no React)
    engine.ts            AudioContext, graph, meters, cue output, subscriptions
    deck.ts              playback, analytic playhead, loops, cue, hot-cue jumps, scratch, nudge, brake, beat maths
    channel.ts           trim → EQ → FX → fader → crossfader → mute (+ meter and cue taps)
    fxRack.ts            filter, echo, reverb, flanger, phaser, drive (+ scheduled automation for Build & Drop)
    sampler.ts           one-shots and tempo-locked loops, tagged voices
    sequencer.ts         look-ahead step scheduler on the audio clock, deck-locked
    performance.ts       Build & Drop scheduler
    analysis.ts          waveform buckets, band colours, per-bar energy, BPM estimate (labelled "estimated")
    soundLibrary.ts      extensible sound packs
    synth/               pure-TS DSP: oscillators, SVF, reverb, drum/FX synthesis, track composer
  catalog/               provider abstraction + demo catalog (Web Worker renderer) + local files
  project/               project model, defaults, sample mixes, persistence repository
  state/                 Zustand store, engine sync, user actions (load/save/sync/hot cues/…)
  ai/                    studio snapshot, demo assistant, client, preview/apply/undo
  features/              UI: home, library, studio (deck, mixer, waveform, jog, FX), beats, build, timeline,
                         mixes, sounds, learn (+ coach), assistant, settings, onboarding
  ui/                    primitives: Knob, Range, Meter, Modal, Toasts, Artwork, ErrorBoundary, hooks
```

## Signal graph

```
Deck A source ─► Deck A out ─► Channel A: trim ─► low/mid/high EQ ─► FX rack ─► fader ─► xfade ─► mute ─┐
Deck B source ─► Deck B out ─► Channel B: …                                                            ├─► master sum ─► master gain ─► limiter ─► speakers
Pads (sampler) ──────────────────────────────────────────────────────────────────────────────────────┤        │
Sequencer ───────────────────────────────────────────────────────────────────────────────────────────┘        └─► pre-limiter analyser (clip LED)
FX rack outputs ─► cue taps ─► cue bus ─► MediaStreamDestination ─► <audio>.setSinkId(headphones)
```

FX rack: `in → drive (dry/wet) → low-pass → high-pass → { dry, echo send → delay⟲, reverb send → convolver, flanger send → modulated delay⟲, phaser send → 4 allpass } → out`. Every feedback gain is capped (≤ 0.85) and a limiter sits on the master, so no combination can run away. All parameter changes use `setTargetAtTime` to avoid zipper noise and clicks; source starts/stops use 4 ms fades.

## Timing

- **Playheads** are computed analytically (`anchorPos + elapsed × rate`, wrapped inside active loops) — the UI polls them in `requestAnimationFrame` and draws directly to canvases, so React never re-renders per frame.
- **Loops** use `AudioBufferSourceNode.loopStart/loopEnd`, i.e. sample-accurate, and snap to the beat grid when quantize is on.
- **Sequencer and Build & Drop** use the look-ahead pattern: a light timer schedules events ~120 ms ahead on the `AudioContext` clock. The sequencer re-locks to its followed deck on every beat, so tempo changes, seeks and loops don't drift.
- **Pads** fire on the next 16th note (loops on the next bar) of the deck closest to the crossfader.
- **Scratch** switches between the forward buffer and a lazily built reversed buffer, matching playback rate to hand speed and re-syncing when drift exceeds 60 ms.

## State and persistence

One project model (`src/project/types.ts`) is shared by the studio, Beat Playground, Build & Drop and timeline. User edits go through `useApp().mutate()` (Immer, structural sharing); `state/actions.ts` subscribes once and pushes only the changed slices into the engine. Engine-originated changes (cue set from the CUE button, loops set on the deck) flow back into the project via deck events.

Persistence goes through the `ProjectRepository` interface. The shipped implementation is `LocalProjectRepository` (browser storage, versioned keys, quota errors surfaced to the user). Projects store **track references and settings only — never audio**. `normalizeProject` upgrades older or partial data, and unavailable tracks are reported per deck instead of breaking the project.

### Production persistence (proposed)

For a hosted deployment, implement `ProjectRepository` against an authenticated API backed by PostgreSQL:

```sql
create table users (id uuid primary key, created_at timestamptz not null default now());
create table projects (
  id uuid primary key,
  owner_id uuid not null references users(id) on delete cascade,
  name text not null check (length(name) <= 80),
  favorite boolean not null default false,
  data jsonb not null,                 -- the Project document (references + settings)
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opened_at timestamptz not null default now()
);
create index on projects (owner_id, opened_at desc);
create table project_tracks (          -- for "track unavailable" checks and analytics
  project_id uuid references projects(id) on delete cascade,
  track_ref text not null,             -- e.g. "provider:id"
  primary key (project_id, track_ref)
);
```

Enforce ownership on every query (`where owner_id = $session_user`), validate `data` with the same normalizer server-side, cap document size, and keep audio out of the database.

## Catalog providers

`CatalogProvider` (`src/catalog/types.ts`) defines `search`, `getTrack`, `checkAvailability`, `requestPlayback` and a `status()` that declares what the provider legally permits (mix, effects, loop/sample, saving references). The registry routes by the `provider:` prefix of a track id. To add a licensed catalog: implement the interface using the provider's actual playback API and terms (typically a server-side token exchange plus an authorised stream), register it, and the studio, library, timeline and projects work unchanged. `PLANNED_INTEGRATIONS` lists such catalogs as *not connected* — they are never presented as working.

The demo provider renders original compositions (`audio/synth/composer.ts`) in a Web Worker at 32 kHz, caching the three most recent results; analysis (waveform, band colours, per-bar energy, loudness) is computed from the rendered audio.

## AI assistant

1. `ai/context.ts` snapshots the studio: deck tracks, playing state, exact BPM/key, tempo, sections, loops, EQ, active FX, measured levels and clip events, sequencer state, plus the list of valid sound ids.
2. `ai/client.ts` calls `POST /api/assistant` when the server reports a configured model; otherwise (or on failure) it uses `ai/demoAssistant.ts`, and the UI labels the reply as coming from the demo.
3. `server/assistant.ts` calls Claude through the official SDK with adaptive thinking, structured outputs (JSON schema generated from the zod contract) and server-side refusal fallbacks. The reply is validated with `sanitizeReply` on the server **and** again in the browser; invalid actions are dropped, values clamped.
4. `ai/apply.ts` maps the 13 permitted action types to real controls. Preview snapshots the affected state, applies, and reverts after 8 s unless kept; Apply offers Undo; Dismiss changes nothing. The assistant can never act on its own.

## Security and privacy

- API keys exist only in the server environment; `/api/status` reports whether a model is configured, never the key.
- The API validates content type, body size (64 KB), request schema (zod), and rate-limits per IP. It logs no user content.
- The static server resolves paths inside `dist/` only.
- No account is required; all user data stays in the browser unless exported.

## Extensibility hooks

- **Sound packs:** `registerPack()` in `audio/soundLibrary.ts`.
- **Effects:** add a field to `FxSettings`, wire it in `FxRack.apply`, add a card in `FxPanel`, and (optionally) an action in the assistant schema.
- **Controllers:** deck/mixer/FX operations are plain methods on the engine and store actions, so a Web MIDI layer can map controls to them directly.
