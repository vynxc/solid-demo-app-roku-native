# Native Roku performance benchmark

Generated: 2026-11-06T01:57:40.702Z
Device: <ROKU_IP>

## Launch

Runs: 8
App active (median): **1041 ms**
Route ready from launch: median **6829 ms** · p95: **7176 ms**
Memory after launch: 50.25, 46.9, 46.9, 46.9, 46.9, 46.9, 46.9, 46.9 MB

## Navigation

| Page | Flush avg | Flush p95 | Updates/s | Memory | Textures | Quads |
|---|---|---|---|---|---|---|
| Browse | 1.39 ms | 2.03 ms | 58.1 | 50.25–50.25 MB | 0 | 128 |
| ComplexFlex | 1.21 ms | 1.53 ms | 6.6 | 50.25–50.25 MB | 0 | 345 |

Budgets: startup p95 ≤ 12 s, flush p95 ≤ 16.7 ms, memory ≤ 268 MB, textures ≤ 200.

Result: **PASS**
