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
  696,512-byte program bundle (final fixture/test build).
- Deploy: `rk dev --local --no-build --sideload --bump-build --out-dir dist-build`.
- The Roku build now defines `import.meta.env.VITE_USE_NEW_FLEX = 'true'`, so
  native uses **the same flex engine as the web app** (`flexLayout.ts`, not the
  legacy `flex.ts`). This was the root cause of the keyboard action-key
  collapse: the legacy engine coerced `padding: [0, 20]` into `w = "NaN0,20"`.

## Evidence

| Area | Evidence | Result |
|---|---|---|
| Build + renderer boot | console `ROKU_FONTS ... ready`, `ROKU_RENDERER ready 1920x1080` | pass |
| Browse layout | `evidence/live-browse.png`, `evidence/matrix-50.png`, `evidence/fps-fix-idle.png` | live TMDB backdrop/posters, nav, hero, grid, focus ring |
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
| 50-cycle matrix | `evidence/matrix-50-cycles-live.txt` (live) and `matrix-50-cycles-offline.txt` (fixtures) | no crash; memory plateau; textures 49–65 |
| Automated feature matrix | `evidence/matrix/matrix-report.md` | **56/56 routes, 5/5 interactions** |
| Suspicious visual-only pages | `evidence/suspicious-*.png` | 8 pages whose automated captures timed out were spot-checked: gradients, matrix, focus basics, transitions, focus handling, viewport, keep alive, destroy |
| Long-run stress | `evidence/stress/stress-report.md` | **50/50 cycles**, memory 46.9–80.4 MB (plateau), textures 0–27 |
| Unit tests | `roku-native/test/unit` | 15 tests: text layout / line height / letter spacing; animation/colour loops/retarget |
| Web v2 renderer | `evidence/web-browse-1920-live.png` | `@solidtv/renderer` 2.0.7 / `@solidtv/solid` 1.7.1; live Browse 60 FPS |
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
    50-cycle endurance pass; `test/unit` covers text layout and animation.
14. **Web v2 renderer.** The web baseline uses `@solidtv/renderer` 2.0.7 and
    `@solidtv/solid` 1.7.1, matching the native host; live Browse runs at
    60 FPS in the reference environment.

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

## Known gaps / not yet verified

- Web v2 dev server and live 1920 captures pass (`web-browse-1920-live.png`,
  `web-details-1920.png`, 60 FPS). The production `pnpm build` was OOM-killed
  in this 14 GB workspace with swap exhausted; it is an environment limit, not
  a reported code/type error. Re-run in CI or a larger-memory runner.
- **Offline data only** for the deterministic native matrix; live TMDB works
  on device when `src/api/key.ts` is present.
- **Explicit renderer gaps** (logged, not silently faked):
  - shadows have no native `Effect` equivalent;
  - `holePunch` / `radialProgress` need other primitives;
  - per-side border widths collapse to the widest side; `border-align: outside`
    is honoured by the native Effect border;
  - non-circular radial-gradient radius is approximated per axis;
  - a Label cannot take an `Effect`, so shader text is not drawn;
  - per-corner colors use a two-stop gradient and are not exact;
  - `SubTexture` crop is implemented with the sheet dimensions for
    `icons_white.png`/`icons.png`; unknown sheets still log a gap;
  - `letterSpacing` is measured but the native Label does not draw it;
  - rotated clipping uses the unrotated rect;
  - combined vertical+horizontal/per-corner masks are not implemented.
- `memoryInfo()` thresholds are approximate (80%/64% of the foreground limit);
  channel limits and percent-used are real.
- Web references now exist for Browse, Examples, Details and Login. The live
  web baseline needs a **v4 read token**; the `TMDB_API_KEY` in the local env is
  a v3 key and is rejected by the app’s Bearer auth. No key is stored in the
  tree; re-add one locally in the gitignored `src/api/key.ts` to recapture.
- Not run: device reboot/recovery, every sub-example page, on-device hardware
  keyboard text entry.

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
