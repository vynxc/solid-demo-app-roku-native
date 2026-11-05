#!/usr/bin/env node
/**
 * Long-run navigation stress for the native Roku host.
 *
 * 50 cycles of Browse → Details → Back → Examples → Back on one app instance,
 * sampling memory/textures/FPS and checking that the app stays alive and the
 * routes return to where they should. This is the endurance counterpart to
 * feature-matrix.mjs (breadth across every route).
 *
 * Usage (from roku-native/):
 *   ROKU_DEV_CONFIG_PATH=... node test/stress-matrix.mjs --device <ROKU_IP>
 */
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
const OUT = path.resolve(argValue("--out", "evidence/stress"));
const CYCLES = Number(argValue("--cycles", "50"));
const TIMEOUT_MS = Number(argValue("--timeout", "20000"));
const base = `http://${DEVICE}:8060`;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(p) {
  const res = await fetch(base + p, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${p} HTTP ${res.status}`);
  return res.text();
}
async function launch(route) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`${base}/launch/dev?contentId=${encodeURIComponent(route)}`, {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) { await sleep(300); return; }
      last = new Error(`launch ${res.status}`);
    } catch (e) { last = e; }
    await sleep(900);
  }
  throw last || new Error("launch failed");
}
function decode(s) {
  return s.replace(/&#10;/g, "\n").replace(/&#13;/g, "\r").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function labels(xml) {
  const out = [];
  const re = /<Label\b[^>]*\btext="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml))) out.push(decode(m[1]));
  return out;
}
function stats(labels) {
  const get = (k) => { const i = labels.indexOf(k); return i >= 0 ? labels[i + 1] : undefined; };
  const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : undefined; };
  return {
    fps: num(get("FPS:")), avg: num(get("AVG:")), min: num(get("MIN:")), max: num(get("MAX:")),
    memUsed: num(get("memUsed:")), critical: num(get("criticalThreshold:")),
    textures: num(get("Textures In Memory:")), onScreen: num(get("Textures On Screen:")),
    quads: num(get("Quads:")),
  };
}
function routeOf(labels) {
  const line = labels.find((t) => t.startsWith("route "));
  return line ? line.slice("route ".length) : "";
}
async function active() {
  try { return (await http("/query/active-app")).includes('id="dev"'); } catch { return false; }
}
async function waitRoute(expect) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = [];
  while (Date.now() < deadline) {
    await sleep(400);
    if (!(await active())) continue;
    try {
      last = labels(await http("/query/app-ui"));
      if (routeOf(last) === expect) return last;
    } catch {}
  }
  throw new Error(`route ${expect} not reached; last=${routeOf(last) || "?"}`);
}
async function key(k, wait = 420) {
  await fetch(`${base}/keypress/${k}`, { method: "POST", signal: AbortSignal.timeout(5000) });
  await sleep(wait);
}
async function sample(cycle) {
  const ls = labels(await http("/query/app-ui"));
  return { cycle, route: routeOf(ls), ...stats(ls), alive: await active() };
}

const startedAt = new Date().toISOString();
console.log(`stress: ${CYCLES} cycles on ${DEVICE}`);
await launch("/browse/all");
await waitRoute("#/browse/all");
const samples = [await sample(0)];
const failures = [];
for (let cycle = 1; cycle <= CYCLES; cycle++) {
  try {
    await key("Enter", 900);
    await waitRoute("#/entity/movie/1");
    const detail = labels(await http("/query/app-ui"));
    if (!detail.some((t) => t.includes("Recommendations"))) failures.push(`cycle ${cycle}: recommendations missing`);
    // First Back focuses the nav, second walks history back to Browse.
    await key("Back", 500);
    await key("Back", 800);
    await waitRoute("#/browse/all");

    await key("Back", 550);
    await key("Down", 260); await key("Down", 260); await key("Down", 260);
    await key("Enter", 800);
    await waitRoute("#/examples");
    // Info is bridged to the shared Menu key ("m"), which navigates to "/";
    // the router redirects to /browse/all. This avoids relying on nav focus
    // order after a portal visit.
    await key("Info", 900);
    await waitRoute("#/browse/all");
  } catch (e) {
    failures.push(`cycle ${cycle}: ${String(e?.message || e)}`);
    break;
  }
  if (cycle % 5 === 0 || cycle === 1) {
    const s = await sample(cycle);
    samples.push(s);
    console.log(`cycle ${String(cycle).padStart(2)}/${CYCLES} route=${s.route} mem=${s.memUsed ?? "?"} tex=${s.textures ?? "?"} fps=${s.fps ?? "?"}`);
    if (!s.alive) { failures.push(`cycle ${cycle}: app not alive`); break; }
    if (s.critical !== undefined && s.memUsed !== undefined && s.memUsed > s.critical) failures.push(`cycle ${cycle}: memory over critical`);
    if (s.textures !== undefined && s.textures > 200) failures.push(`cycle ${cycle}: textures ${s.textures} > 200`);
  }
}
const mem = samples.map((s) => s.memUsed).filter((n) => n !== undefined);
const textures = samples.map((s) => s.textures).filter((n) => n !== undefined);
const report = {
  generatedAt: new Date().toISOString(),
  startedAt,
  device: DEVICE,
  cycles: CYCLES,
  samples,
  summary: {
    completed: samples.length ? samples[samples.length - 1].cycle : 0,
    failures,
    memoryMin: mem.length ? Math.min(...mem) : undefined,
    memoryMax: mem.length ? Math.max(...mem) : undefined,
    memoryLast: mem.length ? mem[mem.length - 1] : undefined,
    texturesMin: textures.length ? Math.min(...textures) : undefined,
    texturesMax: textures.length ? Math.max(...textures) : undefined,
  },
};
writeFileSync(path.join(OUT, "stress-report.json"), JSON.stringify(report, null, 2));
const md = [
  "# Native Roku stress matrix",
  "",
  `Generated: ${report.generatedAt}`,
  `Device: ${DEVICE}`,
  `Cycles: ${CYCLES}`,
  "",
  `Memory: min ${report.summary.memoryMin ?? "?"} / max ${report.summary.memoryMax ?? "?"} / last ${report.summary.memoryLast ?? "?"} MB`,
  `Textures: min ${report.summary.texturesMin ?? "?"} / max ${report.summary.texturesMax ?? "?"}`,
  `Failures: ${failures.length ? failures.join("; ") : "none"}`,
  "",
  "| Cycle | Route | FPS | Mem MB | Textures |",
  "|---|---|---|---|---|",
  ...samples.map((s) => `| ${s.cycle} | \`${s.route}\` | ${s.fps ?? ""} | ${s.memUsed ?? ""} | ${s.textures ?? ""} |`),
  "",
].join("\n");
writeFileSync(path.join(OUT, "stress-report.md"), md);
console.log(`stress done: ${CYCLES - failures.length}/${CYCLES}; memory ${report.summary.memoryMin}-${report.summary.memoryMax} MB; textures ${report.summary.texturesMin}-${report.summary.texturesMax}`);
if (failures.length) {
  console.log("failures:");
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
}
