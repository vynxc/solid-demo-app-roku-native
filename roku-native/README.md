# SolidTV demo — native Roku SceneGraph host

This directory is the native Roku host for the shared SolidTV demo in `../src`.
The shared SolidJS + `@solidtv/solid` UI is **unchanged**; there is no WebView,
DOM canvas or second Roku-specific UI. The host renders the same scene graph
through an RSG 2.0 adapter at 1920×1080.

Start with [`../ROKU-NATIVE.md`](../ROKU-NATIVE.md) for the full overview,
build/deploy steps and verification, and [`HANDOFF.md`](HANDOFF.md) /
[`VERIFICATION.md`](VERIFICATION.md) for the working log and evidence matrix.

## Quick start

Prerequisites: Node 24+, pnpm via corepack, a Roku in developer mode, the
`rk` CLI (2.19+), and `mksquashfs` on `PATH` (Debian bookworm
squashfs-tools 4.5.1 works).

```sh
pnpm install
cd roku-native
pnpm install
```

Live TMDB is optional. Copy `../src/api/key.example.ts` to
`../src/api/key.ts` and replace the placeholder with a **v4 read access
token** (the long JWT). Without that file the host build automatically uses
the deterministic offline fixtures in `src/offline-api.ts` / `src/fixtures.mjs`.
Never commit `src/api/key.ts`.

Typecheck and build:

```sh
node_modules/.bin/tsc --noEmit -p tsconfig.json
PATH="…/usr/bin:$PATH" \
ROKU_DEV_CONFIG_PATH="/path/to/device-store.json" \
node_modules/.bin/rk build --local
```

Deploy the typechecked build (the `--out-dir` matters):

```sh
PATH="…/usr/bin:$PATH" \
ROKU_DEV_CONFIG_PATH="/path/to/device-store.json" \
node_modules/.bin/rk dev --local --no-build --sideload --bump-build --out-dir dist-build
```

Capture/verify:

```sh
export ROKU_DEV_CONFIG_PATH="/path/to/device-store.json"
node_modules/.bin/rk ecp capture-screen --device <ROKU_IP> -o evidence/screen.png
node_modules/.bin/rk ecp keypress Down --device <ROKU_IP>
curl -s http://<ROKU_IP>:8060/query/media-player
```

ECP screenshots omit the hardware video plane; verify playback with
`/query/media-player` (`state`, `position`, `duration`).

## Key renderer notes

- `roku-config.ts` defines `import.meta.env.VITE_USE_NEW_FLEX=true` so native
  uses the same flex engine as the web app. It also patches the published
  `@solidtv/solid` descriptor loops and renderer boundary at build time.
- `src/roku/node.ts` owns z-ordering (including insertion), visual resizing,
  CSS half-leading, text layout and texture/poster conversion.
- `src/roku/fonts.ts` measures with the per-size face and reflows text when a
  face becomes measurable; it also wraps the firmware one-argument `fetch`
  via `browser-services.ts` so the shared API's Bearer header is sent.
- `src/roku/renderer.ts` is dirty-driven; the 1 s meter reports update batches
  and frame-time/capacity telemetry.
