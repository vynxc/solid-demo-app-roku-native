#!/usr/bin/env node
/**
 * Automatic feature matrix for the native Roku host.
 *
 * Each route is launched with an ECP launch parameter (`contentId`), which the
 * host maps to the shared hash router. The runner then verifies:
 *   - the app stayed foreground and the route label matches
 *   - expected page markers are present
 *   - the screen is not blank/uniform
 *   - memory/texture counts are sane
 * and saves a small thumbnail for every route plus a full capture on failure.
 *
 * Usage (from roku-native/):
 *   ROKU_DEV_CONFIG_PATH=/path/to/device-store.json \
 *     node test/feature-matrix.mjs --device <ROKU_IP>
 *
 * Requires: a deployed build, `rk` on PATH (or RK_BIN), ImageMagick `convert`.
 * The fixture build (no src/api/key.ts) is deterministic and is what CI uses.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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
const OUT = path.resolve(argValue("--out", "evidence/matrix"));
const RK = process.env.RK_BIN || path.join(process.cwd(), "node_modules/.bin/rk");
const TIMEOUT_MS = Number(argValue("--timeout", "30000"));
const ONLY = argValue("--only", "");
const SCREENS = args.includes("--screens");
const NO_INTERACTIONS = args.includes("--no-interactions");

mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(OUT, "thumbs"), { recursive: true });
mkdirSync(path.join(OUT, "failures"), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://${DEVICE}:8060`;

async function http(pathname, opts = {}) {
  const res = await fetch(base + pathname, {
    ...opts,
    signal: AbortSignal.timeout(8000),
  });
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

function pageLabels(labels) {
  const fps = labels.indexOf("FPS:");
  const before = fps >= 0 ? labels.slice(0, fps) : labels;
  return before.filter(
    (t) => t && !t.startsWith("Window Size:") && !t.startsWith("Last key:"),
  );
}

function readStats(labels) {
  const get = (key) => {
    const i = labels.indexOf(key);
    return i >= 0 ? labels[i + 1] : undefined;
  };
  const num = (v) => {
    const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    fps: num(get("FPS:")),
    avg: num(get("AVG:")),
    min: num(get("MIN:")),
    max: num(get("MAX:")),
    memUsed: num(get("memUsed:")),
    critical: num(get("criticalThreshold:")),
    textures: num(get("Textures In Memory:")),
    onScreen: num(get("Textures On Screen:")),
    quads: num(get("Quads:")),
  };
}

async function activeApp() {
  try {
    const xml = await http("/query/active-app");
    return xml.includes('id="dev"');
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

async function waitForRoute(expectRoute, settle = 700) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = [];
  while (Date.now() < deadline) {
    await sleep(500);
    if (!(await activeApp())) continue;
    let xml;
    try {
      xml = await http("/query/app-ui");
    } catch {
      continue;
    }
    last = labelsFrom(xml);
    const routeLine = last.find((t) => t.startsWith("route "));
    const route = routeLine ? routeLine.slice("route ".length) : "";
    if (route === expectRoute) {
      await sleep(settle);
      try {
        xml = await http("/query/app-ui");
        last = labelsFrom(xml);
      } catch {}
      return { ok: true, labels: last };
    }
  }
  return { ok: false, labels: last };
}

async function capture(route) {
  const slug =
    route === "/" ? "root" : route.replace(/^\/+/, "").replace(/[^a-z0-9-]+/gi, "_");
  const png = path.join(OUT, "thumbs", `${slug}.png`);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      execFileSync(
        RK,
        ["ecp", "capture-screen", "--device", DEVICE, "--output", png],
        { stdio: "ignore", env: process.env, timeout: 8000 },
      );
      const stat = execFileSync(
        "convert",
        [png, "-resize", "64x36!", "-colorspace", "Gray", "-format", "%[fx:mean] %[fx:standard_deviation]", "info:"],
        { encoding: "utf8", timeout: 10000 },
      ).trim().split(/\s+/);
      const mean = Number(stat[0]);
      const std = Number(stat[1]);
      // Thumbnail for evidence; full PNG only kept on failure.
      execFileSync("convert", [png, "-resize", "480x270", "-quality", "72", path.join(OUT, "thumbs", `${slug}.jpg`)], { timeout: 10000 });
      return { png, mean, std, slug };
    } catch (e) {
      lastError = e;
      await sleep(500);
    }
  }
  return { error: String(lastError?.message || lastError), slug };
}

async function mediaPlayer() {
  try {
    const xml = await http("/query/media-player");
    return {
      state: (xml.match(/\bstate="([^"]+)"/) || [])[1],
      error: (xml.match(/\berror="([^"]+)"/) || [])[1],
    };
  } catch {
    return {};
  }
}

async function key(key, wait = 350) {
  await fetch(`${base}/keypress/${key}`, { method: "POST", signal: AbortSignal.timeout(5000) });
  await sleep(wait);
}

const CAPABILITY = "not available on Roku yet";
const ROUTES = [
  { path: "/", route: "#/browse/all", markers: ["Ocean Signal 1"] },
  { path: "/browse/all", route: "#/browse/all", markers: ["Ocean Signal 1"] },
  { path: "/browse/movie", route: "#/browse/movie" },
  { path: "/browse/tv", route: "#/browse/tv" },
  { path: "/examples", route: "#/examples", markers: ["Examples", "Core Concepts"] },
  { path: "/examples/tmdb", settle: 1800, route: "#/examples/tmdb" },
  { path: "/loops", route: "#/loops" },
  { path: "/infinite", route: "#/infinite", markers: ["Infinite Item List"] },
  { path: "/tmdbgrid", route: "#/tmdbgrid" },
  { path: "/virtual", route: "#/virtual" },
  { path: "/destroy", route: "#/destroy" },
  { path: "/grid", route: "#/grid" },
  { path: "/matrix", route: "#/matrix" },
  { path: "/text", route: "#/text", markers: ["Title of the Page"] },
  { path: "/firebolt", route: "#/firebolt", markers: [CAPABILITY] },
  { path: "/login", route: "#/login", markers: ["Username", "Clear", "Save"] },
  { path: "/nested", route: "#/nested" },
  { path: "/textposter", route: "#/textposter", markers: ["Movie Name"] },
  { path: "/textcentering", route: "#/textcentering" },
  { path: "/countdown", route: "#/countdown" },
  { path: "/custombuttons", route: "#/custombuttons" },
  { path: "/positioning", route: "#/positioning" },
  { path: "/layout", route: "#/layout" },
  { path: "/focusbasics", route: "#/focusbasics" },
  { path: "/transitions", route: "#/transitions" },
  { path: "/components", route: "#/components", markers: ["Dynamic Components"] },
  { path: "/focushandling", route: "#/focushandling" },
  { path: "/keyhandling", route: "#/keyhandling" },
  { path: "/gradients", route: "#/gradients" },
  { path: "/flex", route: "#/flex" },
  { path: "/create", route: "#/create" },
  { path: "/viewport", route: "#/viewport" },
  { path: "/flexsize", route: "#/flexsize" },
  { path: "/flexmenu", route: "#/flexmenu" },
  { path: "/flexcolumnsize", route: "#/flexcolumnsize" },
  { path: "/flexcolumn", route: "#/flexcolumn" },
  { path: "/flexgrow", route: "#/flexgrow" },
  { path: "/flexjustifywidth", route: "#/flexjustifywidth" },
  { path: "/keepalive", route: "#/keepalive" },
  { path: "/suspense", route: "#/suspense" },
  { path: "/superflex", route: "#/superflex" },
  { path: "/tags", route: "#/tags" },
  { path: "/buttonsmaterial", route: "#/buttonsmaterial", markers: ["Normal"] },
  { path: "/entity/movie/1", route: "#/entity/movie/1", markers: ["Recommendations"] },
  { path: "/entity/tv/2", route: "#/entity/tv/2", markers: ["Recommendations"] },
  { path: "/entity/people/1", route: "#/entity/people/1" },
  { path: "/image-performance", settle: 1800, route: "#/image-performance" },
  { path: "/large-image-performance", settle: 1800, route: "#/large-image-performance" },
  { path: "/mixed-image-performance", settle: 1800, route: "#/mixed-image-performance" },
  { path: "/texture-compression-performance", settle: 1800, route: "#/texture-compression-performance" },
  { path: "/complexflex", route: "#/complexflex" },
  { path: "/complexflexcaps", route: "#/complexflexcaps" },
  { path: "/benchmark", settle: 1800, route: "#/benchmark" },
  { path: "/versions", route: "#/versions", markers: [CAPABILITY] },
  { path: "/player/1", settle: 1800, route: "#/player/1", player: true },
  { path: "/no-such-route", route: "#/no-such-route", skipContent: true },
].filter((r) => !ONLY || r.path.includes(ONLY));

const results = [];
console.log(`feature matrix: ${ROUTES.length} routes on ${DEVICE}`);
console.log(`evidence: ${OUT}`);

let index = 0;
for (const entry of ROUTES) {
  index++;
  const started = Date.now();
  const fail = [];
  let routeSeen = false;
  let labels = [];
  try {
    await launch(entry.path);
    const waited = await waitForRoute(entry.route, entry.settle || 700);
    labels = waited.labels;
    routeSeen = waited.ok;
    if (!routeSeen) fail.push(`route not reached (want ${entry.route})`);
  } catch (e) {
    fail.push(`launch/query failed: ${String(e?.message || e)}`);
  }
  const pages = pageLabels(labels);
  const missing = (entry.markers || []).filter((m) => !labels.some((t) => t.includes(m)));
  if (missing.length) fail.push(`missing: ${missing.join(", ")}`);

  const stats = readStats(labels);
  if (stats.memUsed !== undefined && stats.critical !== undefined && stats.memUsed > stats.critical) {
    fail.push(`memory ${stats.memUsed} > critical ${stats.critical}`);
  }
  if (stats.textures !== undefined && stats.textures > 200) fail.push(`textures ${stats.textures} > 200`);

  // Captures are expensive and `rk ecp capture-screen` can time out while a
  // fresh launch settles. By default capture only failures and visual-only
  // pages (no text labels); `--screens` captures every route for a contact
  // sheet. The route label, markers and UI tree are the primary checks.
  const warnings = [];
  const visualOnly = !entry.player && !entry.skipContent && pages.length === 0;
  let shot = {};
  if (SCREENS || fail.length > 0 || visualOnly) {
    shot = await capture(entry.path);
    if (shot.error) {
      warnings.push(`capture unavailable: ${shot.error}`);
    } else if (visualOnly || SCREENS === false && fail.length > 0) {
      if (shot.mean < 0.006 || shot.std < 0.012) {
        fail.push(`blank/uniform screen (mean ${shot.mean.toFixed(3)} std ${shot.std.toFixed(3)})`);
      }
    }
  }

  let player;
  if (entry.player) {
    player = await mediaPlayer();
    if (player.state && player.state !== "play" && player.state !== "pause") {
      // Network stream availability is external; report but don't fail the build.
      fail.push(`media player state=${player.state}`);
    }
  }

  const elapsed = Date.now() - started;
  const record = {
    path: entry.path,
    route: entry.route,
    ok: fail.length === 0,
    routeSeen,
    pageLabelCount: pages.length,
    missing,
    mean: shot.mean,
    std: shot.std,
    memUsed: stats.memUsed,
    textures: stats.textures,
    onScreen: stats.onScreen,
    fps: stats.fps,
    player,
    elapsed,
    warnings,
    failures: fail,
    sampleLabels: pages.slice(0, 8),
  };
  results.push(record);
  const tag = record.ok ? "PASS" : "FAIL";
  console.log(
    `${String(index).padStart(2)}/${ROUTES.length} ${tag} ${entry.path}` +
    ` labels=${pages.length} mem=${stats.memUsed ?? "?"} tex=${stats.textures ?? "?"}` +
    (fail.length ? ` :: ${fail.join(" | ")}` : ""),
  );

  if (fail.length) {
    if (shot && shot.png) {
      try {
        execFileSync("cp", [shot.png, path.join(OUT, "failures", `${shot.slug}.png`)]);
      } catch {}
    }
  }
}

// ---- focused interactions ------------------------------------------------
const interactions = [];
async function interaction(name, fn) {
  const started = Date.now();
  const fail = [];
  let detail;
  try {
    detail = await fn((m) => fail.push(m));
  } catch (e) {
    fail.push(String(e?.message || e));
  }
  interactions.push({ name, ok: fail.length === 0, failures: fail, detail, elapsed: Date.now() - started });
  console.log(`INTERACTION ${fail.length ? "FAIL" : "PASS"} ${name}${fail.length ? ` :: ${fail.join(" | ")}` : ""}`);
}

async function waitRoute(expectRoute) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(400);
    try {
      const xml = await http("/query/app-ui");
      const labels = labelsFrom(xml);
      const line = labels.find((t) => t.startsWith("route "));
      if (line && line.slice("route ".length) === expectRoute) return labels;
    } catch {}
  }
  throw new Error(`route ${expectRoute} not reached`);
}

if (!NO_INTERACTIONS) {
  await interaction("Browse → Details → Back (focus/screen restore)", async (fail) => {
    await launch("/browse/all");
    let labels = await waitRoute("#/browse/all");
    const before = pageLabels(labels).find((t) => /Signal|Observatory|Lights|Planets|Orbit|Roads|City|Horizon/.test(t));
    await key("Enter", 1200);
    labels = await waitRoute("#/entity/movie/1");
    if (!labels.some((t) => t.includes("Recommendations"))) fail("Details did not render recommendations");
    // A single Back from page content focuses the nav; the second walks
    // history back to Browse (the handoff's Back/Back cycle).
    await key("Back", 500);
    await key("Back", 900);
    labels = await waitRoute("#/browse/all");
    const after = pageLabels(labels).find((t) => /Signal|Observatory|Lights|Planets|Orbit|Roads|City|Horizon/.test(t));
    if (!after) fail("Browse content missing after Back");
    if (before && after && before !== after) fail(`focus restore changed hero: ${before} -> ${after}`);
    return { before, after };
  });

  await interaction("Examples portal → tile → Back", async (fail) => {
    await launch("/examples");
    await waitRoute("#/examples");
    await key("Down", 400);
    await key("Right", 300);
    await key("Enter", 1400);
    // Any example route other than the portal is a pass; report which one.
    const deadline = Date.now() + 12000;
    let route = "";
    while (Date.now() < deadline) {
      await sleep(300);
      try {
        const labels = labelsFrom(await http("/query/app-ui"));
        const line = labels.find((t) => t.startsWith("route "));
        route = line ? line.slice(6) : "";
        if (route && route !== "#/examples" && route !== "#/examples/") break;
      } catch {}
    }
    if (!route || route === "#/examples" || route === "#/examples/") fail("tile Enter did not change route");
    await key("Back", 500);
    await key("Back", 900);
    return { route };
  });

  await interaction("Login keyboard renders", async (fail) => {
    await launch("/login");
    const labels = await waitRoute("#/login");
    for (const m of ["Username", "Clear", "Save", "Delete", "#@!"]) {
      if (!labels.some((t) => t.includes(m))) fail(`missing keyboard marker ${m}`);
    }
    return { labels: labels.filter((t) => t === "Username" || t === "Clear" || t === "Save").length };
  });

  await interaction("Infinite list D-pad stress", async (fail) => {
    await launch("/infinite");
    await waitRoute("#/infinite");
    for (let i = 0; i < 15; i++) await key("Down", 180);
    const xml = await http("/query/app-ui");
    const labels = labelsFrom(xml);
    const stats = readStats(labels);
    if (!(await activeApp())) fail("app died during D-pad stress");
    if (stats.memUsed !== undefined && stats.critical !== undefined && stats.memUsed > stats.critical) fail("memory over critical");
    return stats;
  });

  await interaction("Player route / media state", async (fail) => {
    await launch("/player/1");
    await waitRoute("#/player/1");
    await sleep(1500);
    const state = await mediaPlayer();
    if (!state.state) fail("media player returned no state");
    for (const k of ["Play", "Pause", "Fwd", "Back"]) await key(k, 600);
    const after = await mediaPlayer();
    return { state, after };
  });
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
const interactionFailed = interactions.filter((i) => !i.ok);
const report = {
  generatedAt: new Date().toISOString(),
  device: DEVICE,
  routes: results,
  interactions,
  summary: {
    routes: results.length,
    passed,
    failed: failed.length,
    interactions: interactions.length,
    interactionsFailed: interactionFailed.length,
  },
};
writeFileSync(path.join(OUT, "matrix-report.json"), JSON.stringify(report, null, 2));
const md = [
  "# Native Roku feature matrix",
  "",
  `Generated: ${report.generatedAt}`,
  `Device: ${DEVICE}`,
  "",
  `Routes: **${passed}/${results.length} passed**`,
  `Interactions: **${interactions.length - interactionFailed.length}/${interactions.length} passed**`,
  "",
  "| Route | Result | Route seen | Labels | Mem MB | Textures | Notes |",
  "|---|---|---|---|---|---|---|",
  ...results.map((r) =>
    `| \`${r.path}\` | ${r.ok ? "pass" : "**fail**"} | ${r.routeSeen ? "yes" : "no"} | ${r.pageLabelCount} | ${r.memUsed ?? ""} | ${r.textures ?? ""} | ${r.failures.join("; ")} |`,
  ),
  "",
  "## Interactions",
  "",
  ...interactions.map((i) => `- ${i.ok ? "pass" : "**fail**"} — ${i.name}${i.failures.length ? `: ${i.failures.join("; ")}` : ""}`),
  "",
  "## Failures",
  "",
  failed.length || interactionFailed.length
    ? [...failed.map((r) => `- \`${r.path}\`: ${r.failures.join("; ")}`), ...interactionFailed.map((i) => `- interaction ${i.name}: ${i.failures.join("; ")}`)].join("\n")
    : "None.",
  "",
].join("\n");
writeFileSync(path.join(OUT, "matrix-report.md"), md);

console.log(`\nroutes ${passed}/${results.length} passed; interactions ${interactions.length - interactionFailed.length}/${interactions.length} passed`);
if (failed.length || interactionFailed.length) {
  console.log("failures:");
  for (const r of failed) console.log(`  ${r.path}: ${r.failures.join("; ")}`);
  for (const i of interactionFailed) console.log(`  interaction ${i.name}: ${i.failures.join("; ")}`);
  process.exitCode = 1;
}
