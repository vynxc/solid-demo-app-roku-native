# Native Roku performance benchmark

Generated: 2026-11-05T19:02:54.603Z
Device: <ROKU_IP>

## Launch

Runs: 8
Median: **7644 ms** · p95: **7735 ms**
Memory after launch: 46.9, 43.55, 46.9, 46.9, 46.9, 46.9, 43.55, 43.55 MB

## Navigation

| Page | Flush avg | Flush p95 | Updates/s | Memory | Textures | Quads |
|---|---|---|---|---|---|---|
| Browse | 1.17 ms | 2.67 ms | 56.7 | 46.9–46.9 MB | 0 | 128 |
| ComplexFlex | 0.74 ms | 2.31 ms | 4.7 | 46.9–46.9 MB | 0 | 345 |

Budgets: startup p95 ≤ 12 s, flush p95 ≤ 16.7 ms, memory ≤ 268 MB, textures ≤ 200.

Result: **PASS**
