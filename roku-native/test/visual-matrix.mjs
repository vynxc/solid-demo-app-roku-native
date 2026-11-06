#!/usr/bin/env node
/**
 * Deterministic web-vs-native visual parity matrix.
 *
 * Runs the web build against the same offline fixtures as the native host
 * (`vite --mode offline`), captures both renderers at 1920x1080 for every
 * route, masks the dynamic FPS/perf panel, and reports RMSE + changed-pixel
 * percentage. Full frames are kept only for failures; thumbnails for all.
 *
 * Prerequisites:
 *   - `vite --host 127.0.0.1 --port 5173 --mode offline` running
 *   - a deployed native fixture build (no src/api/key.ts)
 *   - Chrome/Chromium with WebGL (CHROME_BIN, optional CHROME_LD_LIBRARY_PATH)
 *   - `rk` on PATH or RK_BIN, ImageMagick `convert`/`compare`
 *
 * Usage (from roku-native/):
 *   node test/visual-matrix.mjs --device <ROKU_IP>
 *   node test/visual-matrix.mjs --device <ROKU_IP> --only /examples
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DEVICE = argValue("--device", process.env.ROKU_DEVICE || "");
if (!DEVICE) {
  console.error("Pass --device <ROKU_IP> or set ROKU_DEVICE");
  process.exit(2);
}
const WEB = argValue("--web", "http://127.0.0.1:5173").replace(/\/$/, "");
const OUT = path.resolve(argValue("--out", "evidence/visual"));
const ONLY = argValue("--only", "").split(",").map((s) => s.trim()).filter(Boolean);
const CHROME_PORT = Number(argValue("--chrome-port", "9223"));
const CHROME =
  process.env.CHROME_BIN ||
  path.join(
    os.homedir(),
    ".cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  );
const RK = process.env.RK_BIN || path.join(process.cwd(), "node_modules/.bin/rk");
const WEB_SETTLE = Number(argValue("--web-settle", "6000"));
const NATIVE_SETTLE = Number(argValue("--native-settle", "5000"));
const TIMEOUT_MS = Number(argValue("--timeout", "25000"));
const SKIP_WEB = args.includes("--skip-web");
const SKIP_NATIVE = args.includes("--skip-native");
const KEEP_ALL = args.includes("--keep-all");
const RMSE_LIMIT = Number(argValue("--rmse", "0.06"));
const DIFF_LIMIT = Number(argValue("--diff", "12"));

mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(OUT, "thumbs"), { recursive: true });
mkdirSync(path.join(OUT, "failures"), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://${DEVICE}:8060`;

async function http(pathname, opts = {}) {
  const res = await fetch(base + pathname, { ...opts, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${pathname} HTTP ${res.status}`);
  return res.text();
}

function decodeXml(s) {
  return s
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function labelsFrom(xml) {
  const out = [];
  const re = /<Label\b[^>]*\btext="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml))) out.push(decodeXml(m[1]));
  return out;
}

async function activeApp() {
  try {
    return (await http("/query/active-app")).includes('id="dev"');
  } catch {
    return false;
  }
}

async function launch(route) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${base}/launch/dev?contentId=${encodeURIComponent(route)}`, {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        await sleep(300);
        return;
      }
      lastError = new Error(`launch HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await sleep(900);
  }
  throw lastError || new Error("launch failed");
}

async function waitForRoute(expectRoute) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(400);
    if (!(await activeApp())) continue;
    try {
      const labels = labelsFrom(await http("/query/app-ui"));
      const line = labels.find((t) => t.startsWith("route "));
      if (line && line.slice("route ".length) === expectRoute) return;
    } catch {}
  }
  throw new Error(`route ${expectRoute} not reached`);
}

async function waitForLabels(markers, timeout = 9000) {
  const deadline = Date.now() + timeout;
  let last = [];
  while (Date.now() < deadline) {
    await sleep(400);
    try {
      last = labelsFrom(await http("/query/app-ui"));
      if (markers.every((m) => last.some((t) => t.includes(m)))) return last;
    } catch {}
  }
  return last;
}

function captureNative(route, file) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      execFileSync(RK, ["ecp", "capture-screen", "--device", DEVICE, "--output", file], {
        stdio: "ignore",
        env: process.env,
        timeout: 15000,
      });
      if (existsSync(file)) return;
    } catch (e) {
      last = e;
    }
    sleep(1500);
  }
  throw last || new Error("native capture failed");
}

// ---- Chrome DevTools Protocol -------------------------------------------
async function waitForChrome() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome did not start");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener("open", () =>
      resolve({
        send(method, params = {}) {
          const msgId = ++id;
          ws.send(JSON.stringify({ id: msgId, method, params }));
          return new Promise((res, rej) => pending.set(msgId, { res, rej }));
        },
        close() {
          ws.close();
        },
      }),
    );
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (!msg.id) return;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
      else p.res(msg.result);
    });
    ws.addEventListener("error", reject);
  });
}

async function ensureChrome() {
  try {
    await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`, { signal: AbortSignal.timeout(800) });
    return null;
  } catch {}
  if (!existsSync(CHROME)) throw new Error(`Chrome not found: ${CHROME} (set CHROME_BIN)`);
  const profile = path.join(os.tmpdir(), `solidtv-visual-chrome-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  const env = { ...process.env };
  if (process.env.CHROME_LD_LIBRARY_PATH) env.LD_LIBRARY_PATH = process.env.CHROME_LD_LIBRARY_PATH;
  const child = spawn(
    CHROME,
    [
      `--remote-debugging-port=${CHROME_PORT}`,
      `--user-data-dir=${profile}`,
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--hide-scrollbars",
      "--window-size=1920,1080",
      "--force-device-scale-factor=1",
      "about:blank",
    ],
    { stdio: "ignore", env },
  );
  await waitForChrome();
  return child;
}

async function openWebPage() {
  const r = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/new?about:blank`, { method: "PUT" });
  if (!r.ok) throw new Error(`Chrome new page HTTP ${r.status}`);
  const info = await r.json();
  const page = await connect(info.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return page;
}

let webNavigation = 0;
async function captureWeb(page, route, file, primeKeys = []) {
  // A changing search string forces a full document load instead of a hash
  // change, matching the native host's fresh app launch per route.
  const url = `${WEB}/?animations=false&numImageWorkers=0&visual=${++webNavigation}${route}`;
  await page.send("Page.navigate", { url });
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const { result } = await page.send("Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true,
      });
      if (result.value === "complete") break;
    } catch {}
  }
  // The shared app removes the splash after its first idle frame. Wait for
  // that signal instead of deleting the splash: deleting it early used to
  // capture a blank canvas before the app had rendered.
  const readyDeadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < readyDeadline) {
    await sleep(300);
    try {
      const { result } = await page.send("Runtime.evaluate", {
        expression: "document.getElementById('splash') === null",
        returnByValue: true,
      });
      if (result.value === true) break;
    } catch {}
  }
  for (const key of primeKeys) {
    const keyCode = key === "ArrowRight" ? 39 : key === "ArrowLeft" ? 37 : key === "ArrowUp" ? 38 : 40;
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
    await sleep(350);
  }
  if (primeKeys.length) await sleep(1400);
  await sleep(WEB_SETTLE);
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(data, "base64"));
}

// ---- comparison ---------------------------------------------------------
function magick(args) {
  return execFileSync("convert", args, { encoding: "utf8", timeout: 30000 });
}

function compareMetric(metric, a, b, extra = []) {
  try {
    const out = execFileSync("compare", ["-metric", metric, ...extra, a, b, "null:"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });
    return out.trim();
  } catch (e) {
    // ImageMagick writes the metric to stderr and exits 1 when images differ.
    return String(e.stderr || e.stdout || "").trim();
  }
}

function measure(route, webPng, nativePng) {
  const work = path.join(OUT, ".work");
  mkdirSync(work, { recursive: true });
  const mask = (src, dst) => {
    magick([
      src,
      "-fill",
      "black",
      "-draw",
      "rectangle 1400,0 1920,420",
      "-resize",
      "960x540!",
      "-blur",
      "0x1",
      dst,
    ]);
  };
  const mw = path.join(work, `${route.slug}-web.png`);
  const mn = path.join(work, `${route.slug}-native.png`);
  mask(webPng, mw);
  mask(nativePng, mn);
  const rmseRaw = compareMetric("RMSE", mw, mn);
  const rmse = Number((rmseRaw.match(/\(([\d.]+)\)/) || [])[1] || NaN);
  const aeRaw = compareMetric("AE", mw, mn, ["-fuzz", "4%"]);
  const ae = Number((aeRaw.match(/^([\d.]+)/) || [])[1] || NaN);
  const diffPct = Number.isFinite(ae) ? (ae / (960 * 540)) * 100 : NaN;
  const diffPng = path.join(work, `${route.slug}-diff.png`);
  try {
    execFileSync("compare", [mw, mn, diffPng], { stdio: "ignore", timeout: 30000 });
  } catch {}
  // Public thumbnails: native, web, diff.
  for (const [src, suffix] of [
    [webPng, "web"],
    [nativePng, "native"],
    [diffPng, "diff"],
  ]) {
    if (!existsSync(src)) continue;
    try {
      execFileSync(
        "convert",
        [src, "-resize", "480x270", "-quality", "78", path.join(OUT, "thumbs", `${route.slug}-${suffix}.jpg`)],
        { stdio: "ignore", timeout: 15000 },
      );
    } catch {}
  }
  const rmseLimit = route.rmse ?? RMSE_LIMIT;
  const diffLimit = route.diff ?? DIFF_LIMIT;
  const ok = Number.isFinite(rmse) && Number.isFinite(diffPct) && rmse <= rmseLimit && diffPct <= diffLimit;
  return { rmse, diffPct, ok };
}

// ---- routes -------------------------------------------------------------
const ROUTES = [
  { path: "/", route: "#/browse/all", waitLabels: ["Ocean Signal 1"] },
  { path: "/browse/all", route: "#/browse/all", waitLabels: ["Ocean Signal 1"] },
  { path: "/browse/movie", route: "#/browse/movie", waitLabels: ["Ocean Signal"] },
  { path: "/browse/tv", route: "#/browse/tv", waitLabels: ["Ocean Signal"] },
  { path: "/examples", route: "#/examples", waitLabels: ["Core Concepts"] },
  { path: "/examples/tmdb", route: "#/examples/tmdb" },
  { path: "/loops", route: "#/loops" },
  { path: "/infinite", route: "#/infinite", waitLabels: ["Infinite Item List"] },
  { path: "/tmdbgrid", route: "#/tmdbgrid", primeKeys: ["ArrowRight", "ArrowLeft"] },
  { path: "/virtual", route: "#/virtual", waitLabels: ["auto"] },
  { path: "/destroy", route: "#/destroy", waitLabels: ["Ocean Signal 1"] },
  { path: "/grid", route: "#/grid", external: true },
  { path: "/matrix", route: "#/matrix" },
  // TTF hinting vs the web MSDF metrics can move a word at a line boundary;
  // these two text-demo routes carry a slightly wider RMSE allowance.
  { path: "/text", route: "#/text", waitLabels: ["Title of the Page"], rmse: 0.08 },
  { path: "/firebolt", route: "#/firebolt", capability: true },
  { path: "/login", route: "#/login", waitLabels: ["Username"] },
  { path: "/nested", route: "#/nested" },
  { path: "/textposter", route: "#/textposter", waitLabels: ["Movie Name"], rmse: 0.085 },
  { path: "/textcentering", route: "#/textcentering" },
  { path: "/countdown", route: "#/countdown", dynamic: true },
  // CustomButtons relies on soft shadows/glows; SceneGraph has no shadow
  // primitive, so the fill colour differs. Structural layout is still checked.
  { path: "/custombuttons", route: "#/custombuttons" },
  { path: "/positioning", route: "#/positioning" },
  { path: "/layout", route: "#/layout" },
  { path: "/focusbasics", route: "#/focusbasics" },
  { path: "/transitions", route: "#/transitions" },
  { path: "/components", route: "#/components", waitLabels: ["Dynamic Components"] },
  { path: "/focushandling", route: "#/focushandling" },
  { path: "/keyhandling", route: "#/keyhandling" },
  { path: "/gradients", route: "#/gradients" },
  { path: "/flex", route: "#/flex" },
  { path: "/create", route: "#/create" },
  { path: "/viewport", route: "#/viewport", dynamic: true },
  // FlexSize randomises block heights on every render; two captures can
  // never be compared deterministically.
  { path: "/flexsize", route: "#/flexsize", dynamic: true },
  { path: "/flexmenu", route: "#/flexmenu" },
  { path: "/flexcolumnsize", route: "#/flexcolumnsize" },
  { path: "/flexcolumn", route: "#/flexcolumn" },
  { path: "/flexgrow", route: "#/flexgrow" },
  { path: "/flexjustifywidth", route: "#/flexjustifywidth" },
  { path: "/keepalive", route: "#/keepalive" },
  { path: "/suspense", route: "#/suspense" },
  { path: "/superflex", route: "#/superflex" },
  { path: "/tags", route: "#/tags" },
  { path: "/buttonsmaterial", route: "#/buttonsmaterial", waitLabels: ["Normal"] },
  { path: "/entity/movie/1", route: "#/entity/movie/1", waitLabels: ["Recommendations"] },
  { path: "/entity/tv/2", route: "#/entity/tv/2", waitLabels: ["Recommendations"] },
  { path: "/entity/people/1", route: "#/entity/people/1" },
  { path: "/image-performance", route: "#/image-performance", rmse: 0.075 },
  { path: "/large-image-performance", route: "#/large-image-performance", rmse: 0.075 },
  { path: "/mixed-image-performance", route: "#/mixed-image-performance", rmse: 0.075 },
  { path: "/texture-compression-performance", route: "#/texture-compression-performance", rmse: 0.065 },
  { path: "/complexflex", route: "#/complexflex" },
  { path: "/complexflexcaps", route: "#/complexflexcaps" },
  { path: "/benchmark", route: "#/benchmark", dynamic: true },
  { path: "/versions", route: "#/versions", capability: true },
  { path: "/player/1", route: "#/player/1", dynamic: true },
  { path: "/no-such-route", route: "#/no-such-route" },
]
  .map((r) => ({
    ...r,
    slug: r.path === "/" ? "root" : r.path.replace(/^\/+/, "").replace(/[^a-z0-9-]+/gi, "_"),
  }))
  .filter((r) => ONLY.length === 0 || ONLY.some((only) => r.path.includes(only)));

const startedAt = new Date().toISOString();
console.log(`visual matrix: ${ROUTES.length} routes`);
console.log(`web ${WEB} · native ${DEVICE}`);
console.log(`evidence ${OUT}`);

const chrome = SKIP_WEB ? null : await ensureChrome();
const page = SKIP_WEB ? null : await openWebPage();

const results = [];
for (let i = 0; i < ROUTES.length; i++) {
  const route = ROUTES[i];
  const tag = `${String(i + 1).padStart(2)}/${ROUTES.length}`;
  const webPng = path.join(OUT, ".work", `${route.slug}-web-full.png`);
  const nativePng = path.join(OUT, ".work", `${route.slug}-native-full.png`);
  mkdirSync(path.join(OUT, ".work"), { recursive: true });
  const failures = [];
  const started = Date.now();
  try {
    if (!SKIP_WEB) await captureWeb(page, route.route, webPng, route.primeKeys || []);
    if (!SKIP_NATIVE) {
      await launch(route.path);
      await waitForRoute(route.route);
      if (route.waitLabels) await waitForLabels(route.waitLabels);
      else await sleep(NATIVE_SETTLE);
      await sleep(1000);
      captureNative(route.route, nativePng);
    }
  } catch (e) {
    failures.push(String(e?.message || e));
  }
  let metrics = { rmse: NaN, diffPct: NaN, ok: false };
  if (!failures.length && existsSync(webPng) && existsSync(nativePng)) {
    try {
      metrics = measure(route, webPng, nativePng);
    } catch (e) {
      failures.push(`compare: ${String(e?.message || e)}`);
    }
  }
  if (route.dynamic || route.external || route.capability) {
    metrics.ok = null; // dynamic/external/capability content: report only
  }
  if (!route.dynamic && !route.external && !route.capability && !route.knownGap && !metrics.ok && !failures.length) {
    failures.push(`parity rmse=${metrics.rmse.toFixed(3)} diff=${metrics.diffPct.toFixed(1)}%`);
  }
  if (failures.length) {
    for (const [src, suffix] of [
      [webPng, "web"],
      [nativePng, "native"],
    ]) {
      if (existsSync(src)) {
        try {
          execFileSync("cp", [src, path.join(OUT, "failures", `${route.slug}-${suffix}.png`)]);
        } catch {}
      }
    }
  }
  const record = {
    path: route.path,
    route: route.route,
    dynamic: !!route.dynamic,
    external: !!route.external,
    capability: !!route.capability,
    knownGap: route.knownGap || null,
    ok: route.dynamic || route.external || route.capability || route.knownGap ? null : metricOk(metrics, failures),
    rmse: Number.isFinite(metrics.rmse) ? Number(metrics.rmse.toFixed(4)) : null,
    diffPct: Number.isFinite(metrics.diffPct) ? Number(metrics.diffPct.toFixed(2)) : null,
    elapsed: Date.now() - started,
    failures,
  };
  results.push(record);
  console.log(
    `${tag} ${route.knownGap ? "KNOWN-GAP" : route.capability ? "CAPABILITY" : route.external ? "EXTERNAL" : route.dynamic ? "DYNAMIC" : record.ok ? "PASS" : "FAIL"} ${route.path}` +
      (Number.isFinite(metrics.rmse)
        ? ` rmse=${metrics.rmse.toFixed(3)} diff=${metrics.diffPct.toFixed(1)}%`
        : "") +
      (failures.length ? ` :: ${failures.join(" | ")}` : ""),
  );
  if (!KEEP_ALL) {
    // Keep the .work PNGs only for failures; thumbnails are written already.
    for (const f of [webPng, nativePng]) {
      if (!failures.length && existsSync(f)) rmSync(f, { force: true });
    }
  }
}

function metricOk(metrics, failures) {
  return failures.length === 0 && metrics.ok === true;
}

page?.close();
if (chrome) chrome.kill("SIGTERM");

const staticRoutes = results.filter((r) => !r.dynamic && !r.external && !r.capability && !r.knownGap);
const passed = staticRoutes.filter((r) => r.ok).length;
const failed = staticRoutes.filter((r) => !r.ok);
const external = results.filter((r) => r.external);
const capability = results.filter((r) => r.capability);
const knownGaps = results.filter((r) => r.knownGap);
const report = {
  generatedAt: new Date().toISOString(),
  startedAt,
  web: WEB,
  device: DEVICE,
  thresholds: { rmse: RMSE_LIMIT, diffPct: DIFF_LIMIT, mask: "1400,0-1920,420" },
  summary: {
    routes: results.length,
    staticRoutes: staticRoutes.length,
    passed,
    failed: failed.length,
    dynamic: results.filter((r) => r.dynamic).length,
    external: external.length,
    capability: capability.length,
    knownGaps: knownGaps.length,
  },
  routes: results,
};
writeFileSync(path.join(OUT, "visual-report.json"), JSON.stringify(report, null, 2));
const md = [
  "# Native/web visual parity matrix",
  "",
  `Generated: ${report.generatedAt}`,
  `Web: ${WEB} (offline fixtures)`,
  `Device: <ROKU_IP>`,
  "",
  `Static routes: **${passed}/${staticRoutes.length} within threshold**`,
  `Thresholds: RMSE ≤ ${RMSE_LIMIT}, changed pixels ≤ ${DIFF_LIMIT}% (4% fuzz), FPS/perf panel masked`,
  "",
  "| Route | Result | RMSE | Changed px | Notes |",
  "|---|---|---|---|---|",
  ...results.map((r) =>
    `| \`${r.path}\` | ${r.knownGap ? "known gap (" + r.knownGap + ")" : r.capability ? "capability" : r.external ? "external" : r.dynamic ? "dynamic" : r.ok ? "pass" : "**fail**"} | ${r.rmse ?? ""} | ${r.diffPct ?? ""}% | ${r.failures.join("; ")} |`,
  ),
  "",
  "## Failures",
  "",
  failed.length
    ? failed.map((r) => `- \`${r.path}\`: ${r.failures.join("; ")}`).join("\n")
    : "None.",
  "",
  "Dynamic pages (countdown, viewport, player, benchmark) are captured for",
  "eyeballing but excluded from the pass/fail count because their content is",
  "time- or video-dependent.",
  "",
].join("\n");
writeFileSync(path.join(OUT, "visual-report.md"), md);
console.log(`\nstatic routes ${passed}/${staticRoutes.length} within threshold; ${results.filter((r) => r.dynamic).length} dynamic`);
if (failed.length) {
  console.log("failures:");
  for (const r of failed) console.log(`  ${r.path}: ${r.failures.join("; ")}`);
  process.exitCode = 1;
}
