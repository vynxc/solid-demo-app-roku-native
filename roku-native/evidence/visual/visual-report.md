# Native/web visual parity matrix

Generated: 2026-11-05T18:34:20.771Z
Web: http://127.0.0.1:5173 (offline fixtures)
Device: <ROKU_IP>

Static routes: **39/39 within threshold**

Thresholds: RMSE ≤ 0.06, changed pixels ≤ 12% (4% fuzz), FPS/perf panel masked.
Text/image pages have documented per-route allowances (0.075–0.085 RMSE).

| Route | Result | RMSE | Changed px | Notes |
|---|---|---|---|---|
| `/` | pass | 0.0235 | 2.11% |  |
| `/browse/all` | pass | 0.0235 | 2.11% |  |
| `/browse/movie` | pass | 0.0235 | 2.11% |  |
| `/browse/tv` | pass | 0.0235 | 2.11% |  |
| `/examples` | pass | 0.0518 | 7.09% |  |
| `/examples/tmdb` | pass | 0.0239 | 1.89% |  |
| `/loops` | pass | 0.0091 | 0.48% |  |
| `/infinite` | pass | 0.0096 | 0.41% |  |
| `/tmdbgrid` | known gap (focus-driven background) | 0.1403 | 44.96% | focus-driven background |
| `/virtual` | pass | 0.0157 | 0.95% |  |
| `/destroy` | pass | 0.0415 | 2.12% |  |
| `/grid` | external | 0.0638 | 4.93% |  |
| `/matrix` | pass | 0.0037 | 0.12% |  |
| `/text` | pass | 0.07 | 6.78% |  |
| `/firebolt` | capability | 0.4362 | 62.14% |  |
| `/login` | pass | 0.0422 | 5.4% |  |
| `/nested` | pass | 0.021 | 3.35% |  |
| `/textposter` | pass | 0.0754 | 7.13% |  |
| `/textcentering` | pass | 0.0406 | 4.86% |  |
| `/countdown` | dynamic | 0.0493 | 1.22% |  |
| `/custombuttons` | known gap (shadow) | 0.0635 | 6.64% | shadow |
| `/positioning` | pass | 0.0361 | 1.05% |  |
| `/layout` | known gap (flex/border offsets) | 0.0924 | 10.65% | flex/border offsets |
| `/focusbasics` | pass | 0.0015 | 0.02% |  |
| `/transitions` | pass | 0.0019 | 0.02% |  |
| `/components` | pass | 0.0074 | 0.42% |  |
| `/focushandling` | pass | 0.0032 | 0.05% |  |
| `/keyhandling` | pass | 0.0283 | 2.31% |  |
| `/gradients` | known gap (per-corner gradient approximation) | 0.1175 | 36.63% | per-corner gradient approximation |
| `/flex` | known gap (focus-driven scroll state) | 0.2498 | 49.78% | focus-driven scroll state |
| `/create` | pass | 0.0489 | 4.41% |  |
| `/viewport` | dynamic | 0.039 | 0.45% |  |
| `/flexsize` | dynamic | 0.2923 | 54.14% |  |
| `/flexmenu` | pass | 0.0057 | 0.33% |  |
| `/flexcolumnsize` | pass | 0.0458 | 4.67% |  |
| `/flexcolumn` | pass | 0.0313 | 3.67% |  |
| `/flexgrow` | known gap (focus-driven scroll state) | 0.3087 | 38.71% | focus-driven scroll state |
| `/flexjustifywidth` | pass | 0.0346 | 5.51% |  |
| `/keepalive` | pass | 0.016 | 0.51% |  |
| `/suspense` | pass | 0.0221 | 0.58% |  |
| `/superflex` | pass | 0.019 | 2.09% |  |
| `/tags` | pass | 0.0183 | 1.26% |  |
| `/buttonsmaterial` | pass | 0.025 | 1.25% |  |
| `/entity/movie/1` | pass | 0.0471 | 6.02% |  |
| `/entity/tv/2` | pass | 0.0494 | 6.25% |  |
| `/entity/people/1` | pass | 0.0463 | 5.56% |  |
| `/image-performance` | pass | 0.0425 | 1.89% |  |
| `/large-image-performance` | pass | 0.0432 | 1.43% |  |
| `/mixed-image-performance` | pass | 0.0408 | 1.54% |  |
| `/texture-compression-performance` | known gap (KTX uses PNG fallback) | 0.3178 | 39.91% | KTX uses PNG fallback |
| `/complexflex` | known gap (flex shrink/overflow) | 0.1422 | 28.44% | flex shrink/overflow |
| `/complexflexcaps` | known gap (flex shrink/overflow) | 0.128 | 24.04% | flex shrink/overflow |
| `/benchmark` | dynamic | 0.288 | 66.21% |  |
| `/versions` | capability | 0.4282 | 61.89% |  |
| `/player/1` | dynamic |  | % |  |
| `/no-such-route` | pass | 0.0017 | 0.01% |  |

## Known gaps

- `/tmdbgrid` — focus-driven background
- `/custombuttons` — shadow
- `/layout` — flex/border offsets
- `/gradients` — per-corner gradient approximation
- `/flex` — focus-driven scroll state
- `/flexgrow` — focus-driven scroll state
- `/texture-compression-performance` — KTX uses PNG fallback
- `/complexflex` — flex shrink/overflow
- `/complexflexcaps` — flex shrink/overflow

Dynamic pages (countdown, viewport, benchmark, player, flexsize) are captured for
manual review. External-data (grid/dummyjson.com) and capability pages
(firebolt, versions) are intentionally not compared. Full frames for
screenshots are in `failures/` only when a capture itself fails.
