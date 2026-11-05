#!/usr/bin/env node
/**
 * Production performance benchmark for the native Roku host.
 *
 * Measures:
 *   - cold/warm launch to the first route label (10 runs)
 *   - idle memory/textures
 *   - navigation flush time, update rate and memory on Browse
 *   - the same on a deliberately complex flex page
 *
 * The device perf line is the source of flush/capacity data:
 *   flush 0.63ms · head 1578 · upd 29/s
 *
 * Usage (from roku-native/):
 *   ROKU_DEV_CONFIG_PATH=... node test/perf-benchmark.mjs --device <ROKU_IP>
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
const OUT = path.resolve(argValue("--out", "evidence/performance"));
const STARTUP_RUNS = Number(argValue("--startup-runs", "10"));
const RUNS = Number(argValue("--runs", "5"));
const TIMEOUT_MS = Number(argValue("--timeout", "30000"));
const base = `http://${DEVICE}:8060`;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(pathname) {
  const res = await fetch(base + pathname, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${pathname} HTTP ${res.status}`);
  return res.text();
}
function decode(s) {
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
function labels(xml) {
  const out = [];
  const re = /<Label\b[^>]*\btext="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml))) out.push(decode(m[1]));
  return out;
}
const number = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};
function readPerf(ls) {
  const get = (key) => {
    const i = ls.indexOf(key);
    return i >= 0 ? ls[i + 1] : undefined;
  };
  const perfLine = ls.find((t) => t.startsWith("flush ") || t.startsWith("idle "));
  const perf = { flushMs: undefined, head: undefined, updates: undefined };
  if (perfLine) {
    const m = perfLine.match(/flush ([\d.]+)ms · head (\d+) · upd (\d+)\/s/);
    if (m) {
      perf.flushMs = Number(m[1]);
      perf.head = Number(m[2]);
      perf.updates = Number(m[3]);
    } else {
      const idle = perfLine.match(/idle · upd (\d+)\/s/);
      if (idle) perf.updates = Number(idle[1]);
    }
  }
  return {
    ...perf,
    fps: number(get("FPS:")),
    avg: number(get("AVG:")),
    min: number(get("MIN:")),
    max: number(get("MAX:")),
    memUsed: number(get("memUsed:")),
    critical: number(get("criticalThreshold:")),
    textures: number(get("Textures In Memory:")),
    onScreen: number(get("Textures On Screen:")),
    quads: number(get("Quads:")),
    draws: number(get("Draws:")),
  };
}
async function launch(route) {
  const started = Date.now();
  await fetch(`${base}/launch/dev?contentId=${encodeURIComponent(route)}`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
  });
  return started;
}
async function waitRoute(expect, started) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(150);
    try {
      const ls = labels(await http("/query/app-ui"));
      const line = ls.find((t) => t.startsWith("route "));
      if (line && line.slice("route ".length) === expect) {
        return { ms: Date.now() - started, labels: ls };
      }
    } catch {}
  }
  throw new Error(`route ${expect} not reached`);
}
async function key(k, wait = 120) {
  await fetch(`${base}/keypress/${k}`, { method: "POST", signal: AbortSignal.timeout(5000) });
  await sleep(wait);
}
async function sample() {
  return readPerf(labels(await http("/query/app-ui")));
}
const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined);
const pct = (values, p) => {
  if (!values.length) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const report = {
  generatedAt: new Date().toISOString(),
  device: "<ROKU_IP>",
  startup: {},
  navigation: {},
  complex: {},
  summary: { failures: [] },
};

console.log(`perf: ${STARTUP_RUNS} launches, ${RUNS} navigation samples`);

// ---- startup -------------------------------------------------------------
const startupTimes = [];
const startupMemory = [];
for (let i = 0; i < STARTUP_RUNS; i++) {
  const started = await launch("/browse/all");
  const result = await waitRoute("#/browse/all", started);
  await sleep(700);
  const perf = await sample();
  startupTimes.push(result.ms);
  startupMemory.push(perf.memUsed);
  console.log(
    `start ${String(i + 1).padStart(2)}/${STARTUP_RUNS} ${result.ms}ms mem=${perf.memUsed ?? "?"} tex=${perf.textures ?? "?"}`,
  );
}
report.startup = {
  runs: STARTUP_RUNS,
  ms: startupTimes,
  medianMs: pct(startupTimes, 50),
  p95Ms: pct(startupTimes, 95),
  memoryMB: startupMemory.filter((v) => v !== undefined),
};

// ---- navigation on Browse -----------------------------------------------
async function navigation(targetRoute, label, presses) {
  const started = await launch(label);
  await waitRoute(targetRoute, started);
  await sleep(1200);
  const samples = [];
  for (let i = 0; i < presses; i++) {
    const keyName = i % 4 === 0 ? "Down" : "Right";
    await key(keyName, 140);
    const perf = await sample();
    samples.push(perf);
  }
  const flush = samples.map((s) => s.flushMs).filter((n) => n !== undefined);
  const updates = samples.map((s) => s.updates).filter((n) => n !== undefined);
  return {
    route: targetRoute,
    samples: samples.length,
    flushMs: {
      avg: avg(flush),
      p95: pct(flush, 95),
      max: flush.length ? Math.max(...flush) : undefined,
    },
    updates: {
      avg: avg(updates),
      min: updates.length ? Math.min(...updates) : undefined,
      max: updates.length ? Math.max(...updates) : undefined,
    },
    memoryMB: {
      min: Math.min(...samples.map((s) => s.memUsed ?? Infinity)),
      max: Math.max(...samples.map((s) => s.memUsed ?? -Infinity)),
    },
    texturesMax: Math.max(...samples.map((s) => s.textures ?? 0)),
    quadsMax: Math.max(...samples.map((s) => s.quads ?? 0)),
    raw: samples,
  };
}

report.navigation = await navigation("#/browse/all", "/browse/all", 30);
console.log(
  `browse flush avg=${(report.navigation.flushMs.avg ?? 0).toFixed(2)}ms p95=${(report.navigation.flushMs.p95 ?? 0).toFixed(2)}ms updates=${(report.navigation.updates.avg ?? 0).toFixed(1)}/s`,
);

report.complex = await navigation("#/complexflex", "/complexflex", 30);
console.log(
  `complex flush avg=${(report.complex.flushMs.avg ?? 0).toFixed(2)}ms p95=${(report.complex.flushMs.p95 ?? 0).toFixed(2)}ms updates=${(report.complex.updates.avg ?? 0).toFixed(1)}/s`,
);

// ---- budgets -------------------------------------------------------------
const failures = report.summary.failures;
if (report.startup.p95Ms > 12000) failures.push(`startup p95 ${report.startup.p95Ms}ms > 12000ms`);
for (const [name, data] of [
  ["browse", report.navigation],
  ["complex", report.complex],
]) {
  if (data.flushMs.p95 !== undefined && data.flushMs.p95 > 16.7) {
    failures.push(`${name} flush p95 ${data.flushMs.p95.toFixed(2)}ms > 16.7ms`);
  }
  if (data.memoryMB.max !== undefined && data.memoryMB.max > 268) {
    failures.push(`${name} memory ${data.memoryMB.max}MB > critical`);
  }
  if (data.texturesMax > 200) failures.push(`${name} textures ${data.texturesMax} > 200`);
  if (data.updates.avg !== undefined && data.updates.avg <= 0) failures.push(`${name} produced no updates`);
}

writeFileSync(path.join(OUT, "perf-report.json"), JSON.stringify(report, null, 2));
const md = [
  "# Native Roku performance benchmark",
  "",
  `Generated: ${report.generatedAt}`,
  `Device: <ROKU_IP>`,
  "",
  "## Launch",
  "",
  `Runs: ${STARTUP_RUNS}`,
  `Median: **${report.startup.medianMs} ms** · p95: **${report.startup.p95Ms} ms**`,
  `Memory after launch: ${report.startup.memoryMB.join(", ")} MB`,
  "",
  "## Navigation",
  "",
  "| Page | Flush avg | Flush p95 | Updates/s | Memory | Textures | Quads |",
  "|---|---|---|---|---|---|---|",
  `| Browse | ${report.navigation.flushMs.avg?.toFixed(2)} ms | ${report.navigation.flushMs.p95?.toFixed(2)} ms | ${report.navigation.updates.avg?.toFixed(1)} | ${report.navigation.memoryMB.min}–${report.navigation.memoryMB.max} MB | ${report.navigation.texturesMax} | ${report.navigation.quadsMax} |`,
  `| ComplexFlex | ${report.complex.flushMs.avg?.toFixed(2)} ms | ${report.complex.flushMs.p95?.toFixed(2)} ms | ${report.complex.updates.avg?.toFixed(1)} | ${report.complex.memoryMB.min}–${report.complex.memoryMB.max} MB | ${report.complex.texturesMax} | ${report.complex.quadsMax} |`,
  "",
  "Budgets: startup p95 ≤ 12 s, flush p95 ≤ 16.7 ms, memory ≤ 268 MB, textures ≤ 200.",
  "",
  `Result: ${failures.length ? "**FAIL** — " + failures.join("; ") : "**PASS**"}`,
  "",
].join("\n");
writeFileSync(path.join(OUT, "perf-report.md"), md);
console.log(failures.length ? `FAIL: ${failures.join("; ")}` : "PASS");
if (failures.length) process.exitCode = 1;
