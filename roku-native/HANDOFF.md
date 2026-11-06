# Roku native SceneGraph port — handoff

Last updated: 2026-11-05 (after z-order, gradient, colour and font-metric fixes).

## Snapshot

The shared SolidTV demo (`solid-demo-app/src`) is running natively on a physical
Roku through SceneGraph. There is no WebView, no second UI and no WebGL. Browse,
Examples, Details, back/focus restore, held-key navigation, the nested Text page
and native HLS playback have all run on the device.

The latest build passes type checks and is deployed. The largest remaining 1:1
deltas are now only 1–2 px (see below); the keyboard action keys, nav z-order,
gradient backdrop, colour transitions and font reflow are fixed. The 100-cycle
Browse → Details → Examples matrix has run without a crash.

Read `VERIFICATION.md` for the evidence matrix and the exact open gaps. This file
is the working/resume guide.

## Goal

Reuse the existing SolidJS + `@solidtv/solid` UI unchanged and render it with a
native Roku RSG 2.0 renderer at 1920x1080 with 1:1 visual parity: geometry,
spacing, typography, colours, images, clipping, z-order, focus, scrolling,
transitions and playback controls.

Do **not** replace the UI with a Roku-specific design, a WebView or a canvas.
Renderer-specific gaps must be reported, not silently hidden.

## Where things are

- Demo app: this repository
  - branch `feat/roku-rsg2`
  - shared UI: `src/` (pages, components, styles, theme)
  - native host: `roku-native/` (untracked)
- Framework: `vynxc/solid`
  - branch `feat/roku-rsg2`, commit `cd9fd94`
  - local change: renderer factory seam in `src/core/lightningInit.ts`
- SDK: `@roku-sdk/*` 2.19.x
- Device: TCL 50S435 / C157X, `<ROKU_IP>`, Roku OS 16.0.4, dev mode,
  FHD UI (1920x1080).
- Device store: the file supplied via `ROKU_DEV_CONFIG_PATH` (not committed).
- `rk` CLI v2.19.0. Local `mksquashfs`:
  `my-first-app/.roku/os16-test/tools/local/usr/bin/`.
- `pnpm` via `corepack` v10.17.0 if node_modules must be reinstalled.

## Uncommitted work that MUST be preserved

- `solid-demo-app/src/styles.ts`: first import changed to `import type`.
- `solid-demo-app/src/pages/Player.tsx`: `onCleanup(() => void destroy())`.
- `solid-demo-app/src/components/Background.tsx`: ignore the initial empty
  background signal and load the first real backdrop directly. Without this the
  native app can resolve data before the deferred effect runs and leave a white
  fallback. Safe for web.
- `solid-demo-app/roku-native/` is untracked and contains the whole host app.
- The framework-side Roku seam is committed in the public fork
  `vynxc/solid`, branch `feat/roku-rsg2` (`d0d07e1`): `setRendererFactory` in
  `src/core/lightningInit.ts` and Roku-safe `.forEach` descriptor loops in
  `src/core/elementNode.ts`. The demo still targets published
  `@solidtv/solid` 1.7.1 and applies equivalent build-time patches in
  `roku-config.ts`, so it builds without a framework checkout.
- `src/api/index.ts` is restored to the tracked version. `src/api/key.ts` is
  gitignored; it was used locally for the 1920×1080 live captures and has been
  removed again. A **v4 read token** is required to recapture; the `TMDB_API_KEY`
  in a local `.env` is a v3 key and is rejected by the app’s
  Bearer auth. Never commit a key.
- Do not disturb sibling Android/V8/Hermes worktrees.
- The temporary web-baseline TMDB edits have been reverted. Do not commit credentials.

## Architecture map (native host)

`roku-native/src/components/my-first-app.tsx`
- Host entry. Sets `globalThis.__solidtvNativeRoot`, installs browser services,
  loads bundled fonts, calls `setRendererFactory(...)`, imports the shared
  `../../../src/index`, then wires Roku `KeyHandler` to the video adapter and
  `dispatchNativeKey`.

`roku-native/src/roku/renderer.ts`
- `SceneGraphRenderer` implements the framework renderer contract:
  `root`, `createNode`, `createTextNode`, `createShader`, `createTexture`,
  `registerShaderType`, `measureText`, `getCapabilities`, `memoryInfo`,
  event emitter, `requestRender`, `defer`, `pause/resume`, `destroy`.
- Batched `flush()` loop; animation ticker at 16 ms; 1 s FPS timer.
- The FPS panel shows the **actual produced dirty-update rate** (29/s while
  navigating, 1/s at idle). Frame-time headroom is the separate native line
  (`flush … ms · head … · upd …/s`) and `ROKU_PERF`, not the panel FPS.
- `memoryInfo()` now uses `getAppMemoryMonitor()` from
  `@roku-sdk/rsg-ts/runtime` and reports live channel limits/percent-used plus
  texture/visual counts. Thresholds are approximate (80%/64% of limit).
- `collectStats()` walks `root` and counts visual nodes/posters.

`roku-native/src/roku/node.ts`
- `RokuNode`: Group `dom` + one visual child (`rect` / `poster` / `label`).
- Transform/clipping/opacity go on the Group; visual-specific props go on the
  child. Visual is inserted **before** children so card/button labels paint over
  their background.
- **Z-order:** `zIndex` is normally set before the node is parented. Every
  insertion now marks the parent `_orderDirty`; `sortChildren()` marks the node
  itself. Without this, siblings stayed in insertion order (gradient over nav,
  nav under page, cards under Background).
- **Resizing:** `set w` / `set h` mark the visual dirty for rect/poster nodes as
  well as the transform. A Group pivot could move while its Poster stayed at
  the old size (the nav gradient was 1600 px wide in the pivot but 200 px on
  screen).
- Text layout, per-size font nodes, auto-width margins, CSS line-height,
  poster placeholder/fallback, z-order, `SubTexture` sheet crop, gradients,
  animation controller.
- **Important:** `applyProps` must keep `case 'parent'` separate from
  `case 'color'`. If parent falls through, every child replaces its colour with
  the parent RokuNode and all base fills disappear.

`roku-native/src/roku/effects.ts`
- Maps framework effect props to Roku OS 16 `Effect` nodes. Logs
  `ROKU_EFFECT_GAP ...` for unsupported features.

`roku-native/src/roku/fonts.ts` / `text-layout.ts`
- `getFontMeasure` at `BASE_FONT_SIZE=32`; per-rendered-size `Font` nodes;
  metrics cache; `getFontVersion()` reflows when a face becomes measurable.
- `measureText` prefers the **exact per-size face** the Label uses. Roku can
  unload the unused 32 pt measurement face (`Font is not yet loaded`), which
  previously left auto-width labels at 8 px. `notifyFontChanged()` dirties all
  text nodes so post-paint font readiness actually reflows them.
- CSS semantics: `lineHeight <= 3` is a multiplier of `fontSize`, otherwise px.
- Auto-width labels get a width margin; box-constrained labels use exact width.

`roku-native/src/roku/browser-services.ts`
- window/document/location/history/URL/URLSearchParams/RAF/microtasks/events/
  storage/navigator for the shared app; Roku key → DOM key mapping, held-key
  `repeat`, silent `pushState`, `hashchange`/`popstate` for router back/forward.
- Wraps the firmware `fetch` (one argument only) into a `Request` so the
  shared API's `{ headers }` — including the TMDB Bearer token — is sent.
- Exposes `__solidtvSetRoute` / `__solidtvInitialRoute`; the host's
  `contentId` launch parameter drives the shared hash router for the test
  matrix and deep links.

`roku-native/test/`
- `feature-matrix.mjs` — launches every route via `contentId`, verifies the
  route label, expected markers, memory/texture bounds, and captures only
  failures/visual-only pages; also runs focus restore, portal, Login, Infinite
  list and Player interactions.
- `stress-matrix.mjs` — 100-cycle Browse → Details → Examples → Browse run with
  memory/FPS/texture samples.
- `unit/` — Vitest tests for text layout and animation/colour interpolation.
  The route and perf labels under the FPS panel are the test/operator readout.

`roku-native/src/roku/video.ts`
- Native `Video` + `ContentNode`, HLS load/play/pause/seek/destroy, media-key
  bridge, black backdrop. Inserted last/top because shared Player is full-screen.
- Firmware reports position/duration in ms; normalized by `durationIsMs`.

`roku-native/src/roku/animation.ts`
- `Animation`, `AnimationController`, `Animator` (delay/easing/loop/repeat/
  retarget/restore). Numeric props only; shader/texture props get a completion
  animation without interpolating.

`roku-native/src/roku/events.ts`
- Small emitter used by renderer/FPS/animations.

`roku-native/roku-config.ts`
- Defines: `SOLIDTV_DOM_RENDERING:'false'`, `SOLIDTV_DISABLE_SHADERS:'false'`,
  `SOLIDTV_SHARED_ENTRY:'"../../../src/index"'`, `import.meta.env.*`, and
  **`import.meta.env.VITE_USE_NEW_FLEX:'true'`**. The last one is critical: the
  web `.env` selects the new flex engine, and the Roku build must use the same
  one. The legacy engine coerced array padding to `w="NaN0,20"` and collapsed
  the keyboard action keys.
- Aliases: `theme`, `solid-js`, `@solidtv`, `@solidjs`, `@solid-primitives`;
  `../video` → `src/roku/video.ts`; Firebolt/RendererVersions → `capability.ts`;
  Player stream URL → Mux HLS.
- **Critical:** `patchSolidElementNode()` rewrites the published
  `@solidtv/solid` `for (const key of LightningRendererNumberProps)` /
  `NonAnimatingProps` loops to `.forEach`. Roku's JS engine gave each iteration
  the same binding, so all width/height/x/y writes went to `lng.wordWrap` and
  layout collapsed. The config throws if the patch cannot apply.
- `src/scenegraph-renderer.ts` is a thin re-export of `./roku/renderer`.

`roku-native/src/compiled-components/BaseAppScene.xml/.brs`
- `Scene` with `backExitsScene="true"`.

## Build / typecheck / deploy

Run from `solid-demo-app/roku-native`:

```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Expected: 0 errors under `src/`. Host `tsc` without `-p` still sees unrelated
pre-existing `nativescript/` and node_modules errors; do not use that as the
native verdict.

```bash
PATH="<mksquashfs-bin>:$PATH" \
ROKU_DEV_CONFIG_PATH="/path/to/device-store.json" \
node_modules/.bin/rk build --local
```

Latest: **Type checks passed**, 733,296-byte JS bundle (final fixture/test build).

Deploy the built bundle:

```bash
PATH="<mksquashfs-bin>:$PATH" \
ROKU_DEV_CONFIG_PATH="/path/to/device-store.json" \
node_modules/.bin/rk dev --local --no-build --sideload --bump-build --out-dir dist-build
```

`--out-dir dist-build` is required after `rk build`; without it `rk dev`
sideloads the older `dist-dev` bundle.

Iteration build+deploy (no typecheck; use only while iterating, then run the
typechecked build above):

```bash
PATH=... ROKU_DEV_CONFIG_PATH=... \
node_modules/.bin/rk dev --local --bump-build --no-typecheck
```

## Device verification commands

```bash
export ROKU_DEV_CONFIG_PATH="/path/to/device-store.json"
cd roku-native
node_modules/.bin/rk ecp capture-screen --device <ROKU_IP> --output evidence/x.png
node_modules/.bin/rk ecp keypress Down --device <ROKU_IP>
node_modules/.bin/rk ecp keypress Enter --device <ROKU_IP>
node_modules/.bin/rk ecp keypress Back --device <ROKU_IP>
curl -s http://<ROKU_IP>:8060/query/media-player
```

- ECP screenshots do **not** include the hardware video plane; player captures
  are black by design. Verify playback with `/query/media-player` (`state`,
  `position`, `duration`).
- ECP capture fails ("Screenshot not ok") when the app is not foreground.
  Relaunch with `rk dev` first.
- `rk logs` needs server mode. `--local` supports `rk ecp` and `rk dev
  --console`. Only one console can attach; "Console connection is already in
  use" means a previous console job is still alive.

## Evidence (latest first)

- `evidence/matrix/matrix-report.md` — **56/56 routes, 8/8 interactions**
  on the final 696,512-byte build (route label, markers, SceneGraph
  colours, memory/texture bounds, core interactions).
- `evidence/stress/stress-report.md` — **50/50 cycles**, memory
  46.9–80.4 MB plateau, textures 0–27.
- `evidence/suspicious-*.png` — manual spot-check of the 8 visual-only pages
  whose automated screenshots timed out during the rapid route matrix.
- `evidence/web-browse-1920-live.png`, `web-details-1920.png` — web v2
  (`@solidtv/renderer` 2.0.7 / `@solidtv/solid` 1.7.1), live Browse 60 FPS.
- `roku-native/test/unit` — 15 passing text-layout/animation tests.
- `evidence/live-browse.png` — native Browse with **live TMDB** data
  (Resident Evil backdrop, real poster grid).
- `evidence/matrix-50-cycles-live.txt` — earlier 50-cycle matrix on the live build (historical).
- `evidence/matrix-50-cycles-offline.txt` — earlier 50-cycle matrix on the
  deterministic fixture build (same navigation/memory plateau).
- `evidence/vfix-details.png`, `evidence/vfix-nav.png` — Play/Resume, HD/CC
  badges and sidebar labels vertically centred (CSS half-leading).
- `evidence/matrix-50.png` — Browse frame after the 50-cycle run.
- `evidence/login-final-prod.png` — final production keyboard: full-width
  Delete/#@!/shift/.com…uk/Clear/Space/Save with labels.
- `evidence/relaunch-grad-nav.png`, `evidence/grad2-fix.png` — nav labels above
  the page, gradient expands to 1600×1080 below the nav text.
- `evidence/color-transition-samples.txt` — smooth per-channel focus colour
  transitions; no random intermediate colours.
- `evidence/fps-idle-trace.txt` — idle 0 update frames/s, active ~26/s.
- `evidence/web-browse-1920-live.png`, `web-details-1920.png`,
  `web-login-1920.png`, `web-player-1920.png` — 1920×1080 web references
  (Player capture is black because headless Chrome has no video plane).
- `evidence/native-fps-memory.png` — Browse with real FPS, memory limits/usage,
  26 textures, 103 visuals; black panel backdrop fixed.
- `evidence/native-details-parentfix.png` — Details: title/overview/stars,
  Play and Resume both filled with visible labels, recommendations row.
- `evidence/native-examples-parentfix.png` — Examples: blue gradient, dark navy
  cards, white focused card, headings and body text.
- `evidence/compare-web-native-hero.png` — 1:1 web/native hero crop.
- `evidence/compare-web-native-examples.png` — 1:1 web/native Examples crop.
- `evidence/web-browse-1920.png`, `evidence/web-examples-1920.png` — web
  references.
- Earlier playback/cycles/keyboard evidence remains in `evidence/` but predates
  the parent/color fix or the latest text work; re-run before claiming closure.

## What was fixed recently

1. **`parent` → `color` prop fall-through.** In `node.ts` `applyProps`, `case
   'parent'` fell into `case 'color'`. Every node with a parent replaced its
   fill colour with the parent RokuNode. This caused the transparent Examples
   tiles, the transparent Details Resume fill / missing Play label and the
   transparent FPS backdrop. Splitting the cases fixed all three.
2. **Per-size native Font nodes** instead of scaling one 32 pt face; small
   auto-width/height margins and CSS line-height; reflow on
   `getFontVersion()`. Fixed missing hero titles, card titles and false
   `Exampl...` / `Core Conce...` truncation.
3. **Focus `scale`** implemented (single number), in addition to scaleX/scaleY.
4. **`SubTexture` sheet crop** with `loadDisplayMode:'noScale'` + translation
   in a clipped group; nav sprite icons match the web.
5. **Gradients** for rect `colorTop/Bottom` and `colorLeft/Right` via Roku
   linear-gradient `Effect`; Examples portal background.
6. **Transparent layout containers** no longer paint implicit white rectangles;
   visual is inserted before children; unknown colour wrappers fall back safely.
7. **Background first-frame fix** in shared `Background.tsx` (see uncommitted).
8. **Memory/counters** wired through `roAppMemoryMonitor` and a visual-node walk.
9. **Web/native flex parity.** Added `VITE_USE_NEW_FLEX=true` to the Roku
   defines. The old engine turned `padding: [0,20]` into `w="NaN0,20"` and
   collapsed the keyboard action keys; the new engine also tightened the
   hero/section vertical offsets to 1–2 px.
10. **Z-order on insertion.** Parents now sort when a child is inserted, not
    only when a later `zIndex` write happens. This fixed the gradient-over-nav,
    nav-under-page and cards-under-Background reports.
11. **Resize repaints the visual.** `set w`/`set h` now mark rect/poster visuals
    dirty. The nav backdrop’s Group pivot was 1600 px while its Poster stayed
    200 px.
12. **Per-channel colour transitions.** Packed 0xRRGGBBAA values are no longer
    interpolated as one large number (which produced random low bytes); focus
    fades are smooth and keep alpha FF.
13. **Font measurement uses the exact face + reflow hook.** The unused 32 pt
    measurement face can be unloaded by Roku; `measureText` now uses the face
    the Label uses, retries transient failures, and dirties all text when a
    face becomes ready. This restored the keyboard action labels.
14. **FPS counting** now includes animation ticks and counts update batches,
    not only batched `flush()` calls.
15. **CSS half-leading for labels.** Roku draws the first line at the top of
    its line box; labels now shift by `(lineHeight − natural)/2`. This fixed
    the Play/Resume, HD/CC and sidebar text all sitting at the top of their
    boxes instead of being vertically centred.
16. **Live TMDB on device.** Removed the build-time `offline-api.ts`
    substitution. Roku's firmware `fetch` accepts only one argument, so the
    browser-services layer converts the shared API's `(url, { headers })` call
    into a `Request`; the Bearer token reaches TMDB and real backdrops/posters
    load. The fixture API remains for deterministic runs.
17. **FPS panel and frame-time telemetry.** The shared panel now shows the
    actual produced dirty-update rate; the build patches its `fps > 5`/`!fps`
    guards to accept 0. A native line underneath shows
    `flush … ms · head … · upd …/s`; `fpsUpdate`/`ROKU_PERF` carry
    `updates`, `avgFlushMs`, `maxFlushMs`, `capacityFps`.
18. **Automated coverage.** Added the route feature matrix, 100-cycle stress
    runner and unit tests. A `contentId` launch parameter drives the shared
    router; the matrix verifies 56 routes automatically and only captures
    screenshots for failures/visual-only pages.
19. **Loop/repeat animation reset.** `Animation` restarted a loop from the
    value it had just reached, pinning it at the target. It now resets to the
    initial value and emits the reset frame. Covered by unit tests.
20. **Letter spacing in layout.** `layoutText` now adds
    `(length - 1) * letterSpacing` to every measured advance, matching the
    renderer measurement contract; the native Label still cannot draw the
    extra advance (documented gap).
21. **Hot-path performance.** `flushDirty` reuses a dirty-node array instead
    of `Array.from` each frame; z-order re-sorting is skipped for the common
    all-zero-zIndex grid/list insertion case.
22. **Web v2 renderer.** The web baseline now uses `@solidtv/renderer` 2.0.7
    and `@solidtv/solid` 1.7.1, matching the native host; the live Browse
    capture runs at 60 FPS in the reference environment.
23. **TTF layout metrics retained.** An MSDF advance-table experiment was
    reverted; TTF `FontMeasure` kept the Examples portal closer to the web.
24. **Smooth gradients.** Single-axis gradients use one alpha-ramp Poster over
    a solid base; per-corner/diagonal cases use bands.
25. **Texture modes + image events.** `textureOptions.resizeMode` contain/cover
    and Poster `loaded` forwarding, with a cached-image fallback; KTX uses PNG
    stand-ins and logs the gap.
26. **SceneGraph Task thread.** `WorkerTask.xml/.brs` + typed
    `postRokuTask()`; device hook returns `worker: worker-ok`.
27. **Cooperative scheduler.** Priority, sliced, cancellable TS background
    jobs in `src/roku/tasks.ts`, with tests.
28. **8 ms flush budget.** Remaining dirty nodes are requeued rather than
    blocking a frame on large scenes.
29. **Visual parity harness.** Web `vite --mode offline` vs native screenshots
    for every route, with FPS/perf masking and RMSE/changed-pixel reports.

## Remaining work (priority order)

1. **Automated suite (done, keep running).** `test/feature-matrix.mjs` checks
   all 56 routes + 8 interactions; `test/stress-matrix.mjs` runs the
   100-cycle endurance pass; `test/unit` has 62 tests; `test/visual-matrix.mjs`
   and `test/perf-benchmark.mjs` cover parity and performance. Re-run after every
   renderer change. The web v2 dev server/captures pass at 60 FPS, and the
   production build passes (`NODE_OPTIONS=--max-old-space-size=3072`,
   `✓ built in 28.67 s`) with a placeholder key; CI runs the unit tests and the
   production build.
2. **Micro-offsets (1:1 target).** Current measured deltas are small:
   - Browse hero title: native 369 px vs web 370 px (1 px).
   - Examples “Core Concepts”: native 175 px vs web 173 px (2 px); card
     tops/fills/focus tile match.
   - Login: Username 2 px lower, action-key labels 2 px higher than web.
   - Details: title top 271 px on both; buttons/recommendations aligned.
   Fix only with equal 1:1 crops; do not shift all text blindly.
3. **FPS panel semantics.** It now shows the actual produced dirty-update
   rate (0/1 at idle, ~29 while navigating); the native line under it shows
   frame-time headroom (`flush … ms · head … · upd …/s`). The panel is not
   panel refresh.
4. **Web references** now exist for Browse, Examples, Details and Login.
   `web-player-1920.png` is black because headless Chrome (like ECP) has no
   hardware video plane; compare the Player overlay on the TV directly.
5. **Startup performance.** Dev-channel launch is ~7.7 s (release packaging,
   bundle splitting and font/import overlap are the next targets).
6. **Task/video APIs.** `WorkerTask` + `postRokuTask()` is verified on device;
   the BRS command set currently covers echo/sleep/json/fetch. The typed video
   adapter and cooperative task queue are in `src/roku/`.
7. **Visual parity.** `test/visual-matrix.mjs` now reports **48/48 comparable
   static routes** with zero known-gap classifications. Remaining limits are
   implementation approximations, not route failures: TTF vs MSDF
   rasterisation, two shadow blur presets, fallback bands for unknown corner
   combinations, and KTX's build-time PNG preview.
8. **Device matrix:** one TCL 50S435 / OS 16.0.4; 4K/HDR, older OS versions,
   hardware keyboard text entry and device reboot/recovery remain untested.

## Known renderer gaps (report, do not hide)

- Shadows have no native `Effect` equivalent.
- `holePunch` / `radialProgress` need other primitives.
- Per-side border widths collapse to the widest side; `border-align: outside`
  is honoured by the native Effect border.
- Non-circular radial-gradient radii are approximated per axis.
- A Roku `Label` cannot take an `Effect`; shader text is not drawn.
- Single-axis gradients use a smooth alpha-ramp Poster; per-corner/diagonal
  gradients use a banded approximation. The native `Effect` gradient is
  ignored on this firmware.
- `SubTexture` crop is implemented for `icons_white.png` / `icons.png`; unknown
  sheets log `ROKU_TEXTURE_GAP` and fall back to scaled.
- `letterSpacing` is measured but the native Label does not draw extra advance.
- Rotated clipping uses the unrotated rect.
- Colour transitions now interpolate per channel; the easing curve matches the
  shared transition settings, but it is not the WebGL shader's exact blend.
- `memoryInfo()` thresholds are approximate; channel limits/percent-used are
  real.
- Offline fixtures only; all content is synthetic and labelled as such.

## Roku-specific pitfalls already hit

- The published `@solidtv/solid` `for...of` descriptor loops must be rewritten
  to `forEach` (see `roku-config.ts`); without it layout collapses.
- `applyProps` `case 'parent'` must not fall through into `color`.
- A `zIndex` is usually applied before the node has a parent; insertion must
  mark the parent `_orderDirty` or siblings never sort.
- Resizing a rect/poster must mark the visual dirty as well as the transform.
- Measure with the exact per-size `Font` face; the unused 32 pt face can be
  unloaded and reports “Font is not yet loaded”. A newly measurable face must
  dirty text nodes so the dirty-driven renderer reflows them.
- Roku draws the first Label line at the top of the line box. Add CSS
  half-leading, `(lineHeight − naturalLineHeight) / 2`, or fixed-height
  buttons/badges/nav rows show their text at the top.
- `rk dev --no-build` defaults to `dist-dev`; use `--out-dir dist-build` after
  `rk build`.
- `rk ecp input` does not refresh `useLaunchConfig` on this firmware. Relaunch
  with `POST /launch/dev?contentId=<route>` for the test matrix.
- `rk ecp capture-screen` can time out while an app relaunch is settling; the
  matrix captures only failures/visual-only pages by default (`--screens` for
  every route).
- Automated suite commands (from `roku-native/`):
  `ROKU_DEV_CONFIG_PATH=... node test/feature-matrix.mjs --device <ROKU_IP>`
  and `... node test/stress-matrix.mjs --device <ROKU_IP> --cycles 100`.
  The reports land in `evidence/matrix/` and `evidence/stress/`.
- Group transform/clipping/opacity must be written to `dom`, not to the visual
  child; visual-specific props go on the child.
- Text `loaded`/layout must fire after layout so `ElementNode` reflows.
- `withScrolling` checks `lng.renderState === 8`; `node.ts` computes intersection
  with 1920x1080.
- Browser services must be installed **before** importing shared `src/index`
  (`URLSearchParams`, `document`, etc. are used during module init).
- Do not use a provisional idle timer as FPS evidence.
- `--no-typecheck` is not evidence of a passing build.
- Do not commit any API key, device password or `src/api/key.ts`.

## Definition of done

- `tsc --noEmit -p tsconfig.json`: 0 errors in `src/`.
- `rk build --local`: type checks pass.
- 1:1 comparison for Browse, Examples, Details, Login, Player against 1920x1080
  web captures; only documented, unavoidable gaps remain (measured 1–2 px
  offsets, Player video plane not capturable).
- D-pad, held keys, focus restore, panels, keyboard, long lists, playback,
  pause, seek, exit and failure recovery pass.
- 50+ cycle matrix with memory/FPS samples, no crash/leak: **passed**
  (`evidence/matrix-50-cycles-live.txt` and
  `matrix-50-cycles-offline.txt`; memory plateaus, textures 49–65).
- Automated feature matrix across all 56 routes + interactions: **passed**
  (`evidence/matrix/matrix-report.md`: 56/56 routes, 8/8 interactions).
- 100-cycle stress runner + unit tests: **passed**
  (`evidence/stress/stress-report.md`: 100/100, memory 53.6–80.4 MB; `roku-native/test/unit`: 62/62).
- `VERIFICATION.md` reflects the real result; failed items stay failed until
  they pass.
