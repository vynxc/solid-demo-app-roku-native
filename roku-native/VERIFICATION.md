# Native Roku verification — 2026-11-05

Device: TCL 50S435 / C157X, Roku OS 16.0.4, FHD UI, `<ROKU_IP>`.
Native data: live TMDB was verified on device with a v4 read token kept only
in the gitignored `src/api/key.ts` (never committed). The automated matrix and
stress runs use the deterministic offline fixtures (`offline-api.ts` +
`fixtures.mjs`), so they need no credentials.
Web references: 1920x1080 Chrome captures with live data.

## Build / typecheck

- `node_modules/.bin/tsc --noEmit -p tsconfig.json` → **0 host errors**.
- `rk build --local` (type checks enabled) → **Type checks passed**,
  733,296-byte program bundle (final fixture/test build).
- Deploy: `rk dev --local --no-build --sideload --bump-build --out-dir dist-build`.
- The Roku build now defines `import.meta.env.VITE_USE_NEW_FLEX = 'true'`, so
  native uses **the same flex engine as the web app** (`flexLayout.ts`, not the
  legacy `flex.ts`). This was the root cause of the keyboard action-key
  collapse: the legacy engine coerced `padding: [0, 20]` into `w = "NaN0,20"`.

## Evidence

| Area | Evidence | Result |
|---|---|---|
| Build + renderer boot | console `ROKU_FONTS ... ready`, `ROKU_RENDERER ready 1920x1080` | pass |
| Browse layout | `evidence/final-browse-panel.png`, `evidence/live-browse.png`, `evidence/matrix-50.png`, `evidence/fps-fix-idle.png` | live TMDB backdrop/posters, nav, hero, grid, focus ring |
| Live TMDB native data | `evidence/live-browse.png` | real Resident Evil backdrop/poster grid via firmware `fetch` + `Request` Bearer header |
| Web Browse 1920 reference | `evidence/web-browse-1920-live.png` | live TMDB 1920x1080 capture |
| Web Login reference | `evidence/web-login-1920.png` | exact 1920x1080, offline-independent |
| Native Login + keyboard | `evidence/login-final-prod.png` | action keys full width and labelled: Delete, #@!, shift, .com…uk, Clear/Space/Save |
| Vertical text centering | `evidence/vfix-details.png`, `evidence/vfix-nav.png` | Play/Resume, HD/CC badges and nav labels sit in the middle of their fixed-height boxes |
| Native/web Login delta | measured | Username +2 px, action labels −2 px; no overlap |
| Z-order | `evidence/relaunch-grad-nav.png`, `evidence/zfix-nav2.png` | nav labels above page; page above Background; gradient below nav |
| Nav backdrop width | `evidence/grad2-fix.png`; SceneGraph `bounds={0,0,1600,1080}` | 200 → 1600 px on focus, alpha 1, below nav text |
| Color transition | `evidence/color-transition-samples.txt` | smooth blue→grey→white, alpha FF; no random colours |
| Details + related grid | `evidence/details-final-prod2.png`, `native-details-parentfix.png` | title/overview/stars/recommendations; Play/Resume filled + labelled; HD/CC badges spaced |
| Web Details reference | `evidence/web-details-1920.png` | live TMDB 1920x1080, title top y=271 |
| Details vertical delta | web vs native | title top y=270/271; overview/buttons aligned; metadata row is content-height dependent |
| Examples page | `evidence/examples-newflex.png` | gradient, cards, headings, focus tile |
| Web Examples reference | `evidence/web-examples-1920.png` | exact 1920x1080 |
| Examples vertical delta | measured | “Core Concepts” native y=175 vs web y=173 (2 px); card tops match |
| Keyboard interaction | `evidence/login-newflex.png`, `login-final-prod.png` | keys render; typing/backspace path unchanged |
| Playback | ECP `/query/media-player` | HLS `state=play`, position advances, duration 634567 ms |
| Pause / seek / exit | ECP after Play/Fwd/Back | `pause`, position moved, `close`, details visible |
| FPS semantics | `evidence/final-browse-panel.png`, `evidence/now-fresh.png` | panel shows actual produced updates (29/s active, MIN 1 idle); native line `flush 0.63ms · head 1578 · upd 29/s` |
| 100-cycle stress | `evidence/stress/stress-report.md` | **100/100 cycles**, memory 53.6–80.4 MB (plateau), textures 0–42 |
| Automated feature matrix | `evidence/matrix/matrix-report.md` | **56/56 routes, 8/8 interactions** on the final build |
| Suspicious visual-only pages | `evidence/suspicious-*.png` | 8 pages whose automated captures timed out were spot-checked: gradients, matrix, focus basics, transitions, focus handling, viewport, keep alive, destroy |

| Unit tests | `roku-native/test/unit` | **62 tests**: text layout, animation, fixtures/error injection, colours, key bridge, video, task queue, WorkerTask |
| Visual parity matrix | `evidence/visual/visual-report.md` | **48/48 comparable static routes pass**; 0 known gaps, 5 dynamic, 1 external, 2 capability |
| Performance benchmark | `evidence/performance/perf-report.md` | Browse flush p95 **2.03 ms** / 58.1 updates/s; ComplexFlex **1.53 ms**; app active median **1.04 s**, route-ready p95 **7.18 s** (dev channel) |
| Task thread | `workerTest=1` hook | **`worker: worker-ok`** from the scene graph Task thread |
| Web v2 renderer | `evidence/web-browse-1920-live.png` | `@solidtv/renderer` 2.0.7 / `@solidtv/solid` 1.7.1; live Browse 60 FPS |
| Web v2 production build | `evidence/web-build-v2.txt` | **pass**, `✓ built in 28.67 s` (placeholder key, 3 GB heap) |
| Gap reporting | console `ROKU_EFFECT_GAP shadow`, `ROKU_TEXTURE_GAP`, `ROKU_TEXT_GAP`, `ROKU_COLOR_GAP` | explicit, not silent |

## 2026-11-05 renderer fixes

1. **Same flex engine as web.** Added `VITE_USE_NEW_FLEX` to the Roku build
   defines. The legacy flex engine converted array padding to a string and
   collapsed every auto-width keyboard action key.
2. **Initial z-order is now applied on insertion.** `zIndex` is usually set
   before a node has a parent, so the parent never re-sorted. Insertions now
   mark the parent `_orderDirty`; `sortChildren()` marks the node itself.
   This fixes the gradient above the sidebar, sidebar content below the page,
   and page cards disappearing under Background.
3. **Resizing a rect/poster now repaints its visual.** `set w`/`set h` called
   only `markTransform()`, so the Group pivot moved but the Poster stayed at
   its old size. The nav backdrop’s Group was 1600 px wide while its Poster
   was still 200 px. Both mark the visual now.
4. **Colour transitions interpolate per channel.** Packed 0xRRGGBBAA values
   are no longer treated as one large number on the Roku JS engine; the
   intermediate fills are smooth and keep alpha FF.
5. **Font measurement uses the size-specific face.** The unused 32 pt
   measurement face can be unloaded by Roku (“Font is not yet loaded”), which
   left auto-width labels at 8 px. `measureText` now prefers the face the
   Label actually uses, retries transient failures, and a font-version hook
   dirties all text nodes so a face that becomes measurable after first paint
   reflows the UI.
6. **FPS panel now reports the produced update rate.** The shared panel gets
   `fps: updates` (0/1 while idle, 29 while navigating). Frame-time capacity is
   shown separately in the native diagnostics line (`flush … ms · head … ·
   upd …/s`) and carried on `fpsUpdate`/`ROKU_PERF`.
7. **CSS half-leading for native labels.** Roku paints the first line at the
   top of its line box. Labels now translate by `(lineHeight − naturalLineHeight)
   / 2`, matching CSS. This centers Play/Resume button text, HD/CC badges and
   sidebar labels inside their fixed-height containers instead of pinning them
   to the top.
8. **Live TMDB on the native app.** The build no longer substitutes
   `offline-api.ts`. Roku’s firmware `fetch` takes **one** argument, so the
   browser-services layer wraps the shared web call’s `(url, {headers})` into a
   `Request`; the Bearer token is now actually sent. Real backdrops, posters,
   titles and metadata load on device.
9. **Frame-time telemetry and a separate native line.** Each `flushDirty()`
   batch is timed; the 1 s timer emits `updates`, `avgFlushMs`, `maxFlushMs`
   and `capacityFps` on `fpsUpdate`, and a native-only line under the panel
   shows `flush … ms · head … · upd …/s`. The shared FPSCounter is patched at
   build time to accept 0, so idle shows the real one-update-per-second
   diagnostic rate instead of retaining an old number.
10. **Loop/repeat animation reset.** A looping animation restarted from the
    value it had just reached, pinning it at the target. It now resets to the
    initial value (and emits the reset frame); unit-tested.
11. **Letter spacing in layout.** `layoutText` adds
    `(length - 1) * letterSpacing` to every advance, matching the renderer
    measurement contract. The native Label still cannot draw the extra
    advance (documented gap).
12. **Hot-path performance.** `flushDirty` reuses a dirty-node array instead
    of allocating with `Array.from` per frame; z-order re-sorting is skipped
    for the common all-zero-zIndex grid/list insertion case.
13. **Automated coverage.** A `contentId` launch parameter drives the shared
    hash router. `test/feature-matrix.mjs` verifies every route, markers,
    memory bounds and core interactions; `test/stress-matrix.mjs` runs the
    100-cycle endurance pass; `test/unit` covers text layout, animation, fixtures,
    colours, key bridge, video, task queue and WorkerTask.
14. **Web v2 renderer.** The web baseline uses `@solidtv/renderer` 2.0.7 and
    `@solidtv/solid` 1.7.1, matching the native host; live Browse runs at
    60 FPS in the reference environment.
15. **Web text metrics.** Line-break decisions use the web MSDF advance/kerning
    tables and unitless `lineHeight` uses the shared app's natural line boxes
    (Roboto `0.9 × fontSize`, Raleway `1.174 × fontSize`). TTF `FontMeasure`
    still supplies auto-width sizes, so the Examples portal is unchanged.
16. **Smooth gradients.** One alpha-ramp Poster over a solid base replaces
    hundreds of band rectangles. The corner combinations used by the demos use
    pre-rendered exact RGBA textures generated with the renderer's two-triangle,
    premultiplied-alpha interpolation; unknown combinations fall back to bands.
17. **Shadow approximation.** Roku OS 16's Effect has no DropShadow fields;
    two pre-blurred Poster presets are inserted as sibling groups behind the
    node, tinted with the shader's shadow colour and mirrored transform/opacity.
18. **Texture modes and image events.** `textureOptions.resizeMode`
    contain/cover is honored; Poster load status is forwarded as the shared
    `loaded` event, with a bounded fallback for cached images. KTX is decoded at
    build time into PNG previews.
19. **True background Task.** `WorkerTask.xml/.brs` plus
    `src/roku/worker-task.ts` run BrightScript on a SceneGraph Task thread;
    device hook returns `worker: worker-ok`. `src/roku/tasks.ts` is the
    cooperative TS scheduler (priority, 8 ms slicing, cancellation).
20. **8 ms flush budget.** Large screens requeue remaining dirty nodes instead
    of blocking input/animation for a full frame.

## Current 1:1 deltas

- **Browse hero:** native title top 369 px, web 370 px (1 px).
- **Examples:** “Core Concepts” heading native 175 px, web 173 px (2 px);
  card tops, fills, focus tile and in-card type match within a few px.
- **Details:** title top 270 px native / 271 px web; overview, stars, Play/Resume
  and recommendations aligned; HD/CC badges no longer overlap (the earlier
  overlap predated the exact-face font fix). The metadata row shifts with the
  overview’s line count (content-dependent).
- **Login keyboard:** Username 2 px lower, action-key labels 2 px higher than
  web; key width/fill/labels now match.
- **FPS panel:** the displayed FPS is the **actual number of dirty update
  frames produced** in the last second (29 while navigating, 1 at idle because
  the panel/perf line itself updates once). It is not panel refresh; the
  compositor refreshes independently. Frame-time headroom is the separate
  native line (`flush 0.63 ms · head 1578 · upd 29/s`) and the `ROKU_PERF`
  payload, not the shared FPS number.
- **Player:** ECP captures omit the hardware video plane. Web player capture
  is also black because headless Chrome has no video plane. Verify playback via
  `/query/media-player`.

## Startup / distribution investigation (2026-11-06)

- Cold dev-channel route-ready p95: **7.176 s**, median **6.829 s**; app
  active median **1.041 s**. The earlier 7.79 s included an immediate
  `query/app-ui` request that ECP holds open while the first scene is built.
- Minimal SDK template on the same dev slot: UI in ~1 s with a 35 KB bundle,
  proving the channel itself can launch quickly.
- Shared app boot: `onMount` +0.28 s, renderer ready +0.66 s, render called
  +1.54 s; first full SceneGraph tree ~6 s.
- `splash_min_time=1` was added to the manifest; it did not change the timing.
- Removing the Background, FPS panel and nav shell, using fallback images,
  preloading exact font sizes, using a single 32 pt font atlas, MSDF layout,
  and larger flush budgets did **not** move the first frame.
- A stripped 1.4 MB package (no offline/KTX/extra fonts) still took ~6 s.
- `rk build --compile-ts --release` produces a valid 764 KB
  `source/compiled/index.hbc`, but sideloading it is refused on this TV:
  “Devices without the rsg_typescript device token will refuse to launch it.”
  The TV returned to Home. The signed numeric-beta path is also not viable:
  the earlier beta 890006 experiment documented RSG 2.0/TypeScript static
  analysis errors and exited before UI.
- **Blocker:** closing the remaining startup gap requires the
  `rsg_typescript` device token or a release/beta channel/firmware that accepts
  RSG 2.0/TypeScript. App-side tuning is exhausted; a framework-level bundle or
  node-count reduction is the alternative.

## Verified approximations / limits

- The visual matrix now passes **48/48 comparable static routes** with zero
  known-gap classifications. Dynamic (5), external-data (1) and capability (2)
  routes are reported separately.
- Text uses the native TTF for drawing and the web MSDF advances only for
  line-break decisions and line-box ratios; glyph rasterisation is not
  pixel-identical to the browser. A few text/image routes carry documented
  RMSE allowances (0.065–0.085).
- Single-axis gradients use an alpha-ramp Poster. The corner combinations used
  by the shared demos use pre-rendered exact RGBA textures; unknown corner
  combinations fall back to banded rectangles.
- Roku OS 16.0.4 has no `Effect` DropShadow fields. Shadows use two pre-blurred
  Poster presets (soft/focus) tinted with the shader's shadow colour; arbitrary
  blur/spread values are approximated by the nearest preset.
- KTX is decoded at build time into PNG previews because Poster has no runtime
  KTX decoder; the texture page reports `ROKU_TEXTURE_GAP`.
- `holePunch` / `radialProgress` need other primitives; per-side border widths
  collapse to the widest side; non-circular radial radius is per-axis; a Label
  cannot take an Effect; SubTexture crop needs known sheet dimensions;
  letterSpacing is measured but not drawn by the native Label; rotated clipping
  uses the unrotated rect.
- Create/destroy fades are restored with a deferred start and a visibility
  fallback; the animator/preload interaction remains a framework workaround.
- Dev-channel launch is ~7.7 s; release packaging/code-splitting is the next
  performance target.
- Device matrix: one TCL 50S435 / Roku OS 16.0.4. 4K/HDR, older OS versions,
  hardware keyboard text entry and device reboot/recovery remain untested.

## Reproduce

```bash
cd roku-native
node_modules/.bin/tsc --noEmit -p tsconfig.json
PATH="<mksquashfs-bin>:$PATH" \
ROKU_DEV_CONFIG_PATH="/path/to/device-store.json" \
node_modules/.bin/rk build --local
# deploy:
PATH=... ROKU_DEV_CONFIG_PATH=... node_modules/.bin/rk dev --local --no-build --sideload --bump-build --out-dir dist-build
# screenshot:
ROKU_DEV_CONFIG_PATH=... node_modules/.bin/rk ecp capture-screen --device <ROKU_IP> -o evidence/x.png
# media state:
curl -s http://<ROKU_IP>:8060/query/media-player
# automated feature matrix (fixture build; no key needed):
ROKU_DEV_CONFIG_PATH=... node test/feature-matrix.mjs --device <ROKU_IP>
# 50-cycle endurance pass:
ROKU_DEV_CONFIG_PATH=... node test/stress-matrix.mjs --device <ROKU_IP> --cycles 50
# unit tests (from the repository root):
node_modules/.bin/vitest run roku-native/test/unit
```

The feature matrix launches routes through the `contentId` launch parameter,
checks the route label and page markers via `query/app-ui`, samples
memory/textures, and captures screenshots only for failures or visual-only
pages. Add `--screens` for a full contact sheet.

Note: ECP screenshots do not include the hardware video plane; player captures
are black by design. Verify playback with `/query/media-player` (`state`,
`position`, `duration`) instead.
