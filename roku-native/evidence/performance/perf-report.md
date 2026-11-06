# Native Roku performance benchmark

Generated: 2026-11-06T01:16:46.630Z
Device: <ROKU_IP>

## Launch

Runs: 8
Median: **7659 ms** · p95: **7785 ms**
Memory after launch: 46.9, 46.9, 46.9, 46.9, 46.9, 46.9, 46.9, 46.9 MB

## Navigation

| Page | Flush avg | Flush p95 | Updates/s | Memory | Textures | Quads |
|---|---|---|---|---|---|---|
| Browse | 1.39 ms | 4.11 ms | 56.9 | 46.9–46.9 MB | 0 | 128 |
| ComplexFlex | 0.98 ms | 2.68 ms | 4.7 | 46.9–46.9 MB | 0 | 345 |

Budgets: startup p95 ≤ 12 s, flush p95 ≤ 16.7 ms, memory ≤ 268 MB, textures ≤ 200.

Result: **PASS**
