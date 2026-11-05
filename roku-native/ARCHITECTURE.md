# Roku native architecture

This document covers the parts that are Roku-specific rather than shared
SolidTV UI: the renderer adapter, the video plane, and the concurrency model.
The shared demo in `../src` remains the single application UI; this package
only supplies platform services.

## Rendering pipeline

- **One SceneGraph `Group` per SolidTV node.** The group owns transforms,
  opacity and clipping. Its visual (`Rectangle`, `Poster` or `Label`) is the
  first child so app children always paint above it.
- **Dirty-driven flush.** Property writes mark nodes dirty; one `setTimeout(0)`
  flush coalesces a frame into a single transaction. The 1 s meter reports
  produced dirty updates separately from frame-time headroom.
- **Z-order.** `zIndex` is applied on insertion and on change; all-zero
  grid/list insertions skip the re-sort.
- **Text.** Fonts are measured with the native `FontMeasure` API at the exact
  face size and laid out by the shared line breaker. `Raleway-ExtraBold.ttf`
  must be present in `pkg/fonts`; missing faces measure 0 and clip auto-width
  labels. (An MSDF advance-table experiment was reverted because it shifted
  the Examples portal.)
- **Gradients.** Roku's `Effect` gradient is ignored by this firmware.
  Single-axis `colorTop/Bottom`/`colorLeft/Right` use one alpha-ramp Poster
  over a solid base (smooth, one node); per-corner/diagonal cases use bands.
  The Gradients demo’s diagonal columns are therefore an approximation.
- **Images.** `pkg:/` posters use `scaleToFill`/`scaleToFit` and honor
  `textureOptions.resizeMode` (`contain`, `cover`); SubTextures crop the sprite
  sheet in a clipped group. Poster `loadStatus` is forwarded as the shared
  `loaded` event, with a bounded fallback for cached textures. KTX is not
  decoded by Poster; the texture-compression demo uses PNG stand-ins and logs
  `ROKU_TEXTURE_GAP`.
- **Flush budget.** A frame writes dirty nodes for at most 8 ms and requeues
  the rest on the next tick, keeping input and animation responsive on large
  screens.

### Performance rules

1. Keep the flush batch small; avoid per-node work in the hot path.
2. Prefer explicit props over JSX spreads in row/tile components. The shared
   `Poster`/`TitleRow` already do this.
3. Virtualize long rows (`VirtualRow`, `LazyColumn`); mount only a screenful.
4. Use the banded gradient only where the design needs it; each band is a
   SceneGraph rectangle. A full-screen gradient is ~32 nodes.
5. Never block the JS thread on image decode/network; use firmware async
   APIs and the cooperative queue below.
6. Keep `numImageWorkers=0` on the native host: image decoding is firmware
   asynchronous; a JS image worker would compete with the UI.
7. Texture budget: the stress run plateaus far below the 268 MB critical
   threshold; monitor `Textures In Memory` in the panel.

## Video API

`src/roku/video.ts` is the Roku-specific player surface. It is intentionally
separate from the shared Shaka/DOM player in `../src/video.js`.

```ts
import player from "./video";

await player.init(root);                       // attach Video + black backdrop
await player.load({ streamUrl });             // assign ContentNode.url
player.play(); player.pause(); player.seek(42);
player.getCurrentTime();                      // seconds
player.getVideoDuration();                    // seconds
player.getTimeFormat();                       // "1:05 : 2:05"
player.handleMediaKey("playpause");           // remote keys
await player.destroy();                       // stop + detach
```

- One SceneGraph `Video` node plus a `ContentNode`; the Video is the bottom
  child of the app root so the UI paints over it.
- `position`/`duration` from this firmware are milliseconds; the adapter
  normalises to seconds.
- `load()` resolves when the node reports `buffering`, `playing`, `paused` or
  `error`, or after a 3 s accept timeout.
- `handleMediaKey` maps Play/Pause, Stop, Fwd/Rev and InstantReplay; the host
  calls it before the Solid key bridge.
- Tests: `test/unit/video.test.ts` (mock SceneGraph nodes).

## Concurrency: cooperative queue vs Task nodes

Roku SceneGraph has **no JavaScript workers**. The JS engine is single
threaded, so CPU-bound work must either be sliced or moved to a SceneGraph
`Task` node (BrightScript thread).

### Cooperative queue (TypeScript)

`src/roku/tasks.ts` provides a priority queue that runs jobs for a bounded
slice, yields, and resumes:

```ts
import { postTask, taskQueue, yieldToUI } from "./roku/tasks";

const rows = await postTask(() => buildIndex(records), { priority: 5 });
await taskQueue.idle();
```

- `sliceMs` defaults to 8 ms.
- `post()` returns a promise; `signal` supports cancellation.
- `idle()` resolves when queued and in-flight jobs settle.
- `yieldToUI()` yields one event-loop turn.
- Tests use an injected clock/scheduler; see `test/unit/tasks.test.ts`.

This keeps focus/animation responsive but does **not** give parallel CPU
execution. Use it for non-urgent index building, cache warming and chunked
transforms.

### True background Threads (SceneGraph Task)

A SceneGraph `Task` node runs a BrightScript function on another thread. It
cannot execute TypeScript directly. The bridge is implemented here:

- `src/compiled-components/WorkerTask.xml` and `WorkerTask.brs` — a Task
  component whose thread reads `m.top.request` and writes `m.top.response`.
- `src/roku/worker-task.ts` — typed `postRokuTask()`; it sets
  `functionName`/`fields`, observes `response`, and supports timeout,
  cancellation and cleanup.
- Current commands: `echo`, `sleep`, `json`, `fetch` (GET with headers).
  Extend `runWorker()` and `WorkerRequest` together.

```ts
import { workerTask } from "./roku";

const text = await workerTask.postRokuTask<string>({
  op: "fetch",
  url: "https://example.test/data.json",
}, { timeoutMs: 8000 }).result;
```

A Task node without a registered BRS component/function cannot run, so the
TypeScript API does not pretend to run TS closures in the worker. Use the
cooperative queue for TypeScript CPU work and the Task bridge for BRS/network
work. The `WorkerTask.xml` import in `src/index.ts` is required so the component
is compiled into `pkg:/components`. Device test hook: launch with
`contentId=/examples&workerTest=1`; a label reports `worker: worker-ok`
when the Task thread returns (verified on the TCL OS 16 device).

## Testing layers

- **Visual parity matrix** (`test/visual-matrix.mjs`): web (`vite --mode
  offline`) vs native screenshots for every route; masks the FPS/perf panel;
  reports RMSE and changed-pixel percentage. Failing routes keep full frames.
- **Feature matrix** (`test/feature-matrix.mjs`): route labels, content
  markers, SceneGraph colours, memory/texture bounds and five interaction
  flows.
- **Stress** (`test/stress-matrix.mjs`): 50 navigation cycles with memory,
  texture and update-rate samples.
- **Unit** (`test/unit/`): text layout, animation, fixtures/error injection,
  colours, key bridge, video adapter, cooperative queue.
- **CI**: unit tests + web v2 production build on every push; the device
  matrices need a reachable Roku and run manually/on a self-hosted runner.

## Known gaps / next steps

- Visual matrix thresholds are RMSE-based; a perceptual/SSIM pass would catch
  structural differences better than colour noise.
- Banded gradients approximate a smooth ramp; increase bands for large
  surfaces if banding is visible.
- A Poster gradient tint is a black-alpha approximation, not per-channel
  multiply.
- SceneGraph `Effect` shadows, hole punches and non-circular radial gradients
  are not equivalent; they log `ROKU_EFFECT_GAP`.
- Create/destroy fades on preload resources are bypassed; content appears
  immediately on native. The animator/route-preload interaction is the next
  framework fix.
- Device matrix is one TCL 50S435 on OS 16.0.4; 4K/HDR and older OS versions
  are untested.
- The Task-node bridge above is designed but not yet shipped.
