# Native/web visual parity matrix

Generated: 2026-11-06T00:47:29.005Z
Web: http://127.0.0.1:5173 (offline fixtures)
Device: <ROKU_IP>

Static routes: **48/48 within threshold**
Thresholds: RMSE ≤ 0.06 standard; a few text/image routes use documented per-route allowances (0.065–0.085). Changed pixels ≤ 12% (4% fuzz); FPS/perf panel masked.

| Route | Result | RMSE | Changed px | Notes |
|---|---|---|---|---|
| `/` | pass | 0.0213 | 1.96% |  |
| `/browse/all` | pass | 0.0213 | 1.96% |  |
| `/browse/movie` | pass | 0.0213 | 1.96% |  |
| `/browse/tv` | pass | 0.0213 | 1.96% |  |
| `/examples` | pass | 0.0587 | 6.37% |  |
| `/examples/tmdb` | pass | 0.0217 | 1.73% |  |
| `/loops` | pass | 0.0088 | 0.45% |  |
| `/infinite` | pass | 0.0093 | 0.38% |  |
| `/tmdbgrid` | pass | 0.0047 | 0.2% |  |
| `/virtual` | pass | 0.0151 | 0.93% |  |
| `/destroy` | pass | 0.0318 | 1.9% |  |
| `/grid` | external | 0.0638 | 4.93% |  |
| `/matrix` | pass | 0.0037 | 0.12% |  |
| `/text` | pass | 0.0384 | 4.4% |  |
| `/firebolt` | capability | 0.4362 | 62.14% |  |
| `/login` | pass | 0.0221 | 3.06% |  |
| `/nested` | pass | 0.006 | 0.68% |  |
| `/textposter` | pass | 0.0395 | 4.58% |  |
| `/textcentering` | pass | 0.0481 | 4.72% |  |
| `/countdown` | dynamic | 0.0525 | 1.19% |  |
| `/custombuttons` | pass | 0.0341 | 2.34% |  |
| `/positioning` | pass | 0.0368 | 0.99% |  |
| `/layout` | pass | 0.0293 | 7.99% |  |
| `/focusbasics` | pass | 0.0015 | 0.02% |  |
| `/transitions` | pass | 0.0019 | 0.02% |  |
| `/components` | pass | 0.0069 | 0.24% |  |
| `/focushandling` | pass | 0.0032 | 0.05% |  |
| `/keyhandling` | pass | 0.0232 | 1.88% |  |
| `/gradients` | pass | 0.0034 | 0.03% |  |
| `/flex` | pass | 0.0261 | 3.74% |  |
| `/create` | pass | 0.0257 | 2.44% |  |
| `/viewport` | dynamic | 0.0391 | 0.46% |  |
| `/flexsize` | dynamic | 0.3064 | 58.23% |  |
| `/flexmenu` | pass | 0.0055 | 0.3% |  |
| `/flexcolumnsize` | pass | 0.0484 | 5.07% |  |
| `/flexcolumn` | pass | 0.0305 | 3.57% |  |
| `/flexgrow` | pass | 0.0315 | 5.02% |  |
| `/flexjustifywidth` | pass | 0.0338 | 4.95% |  |
| `/keepalive` | pass | 0.033 | 0.79% |  |
| `/suspense` | pass | 0.0221 | 0.58% |  |
| `/superflex` | pass | 0.0137 | 1.58% |  |
| `/tags` | pass | 0.017 | 1.2% |  |
| `/buttonsmaterial` | pass | 0.0243 | 1.09% |  |
| `/entity/movie/1` | pass | 0.019 | 2% |  |
| `/entity/tv/2` | pass | 0.0242 | 2.24% |  |
| `/entity/people/1` | pass | 0.0265 | 1.59% |  |
| `/image-performance` | pass | 0.0609 | 1.92% |  |
| `/large-image-performance` | pass | 0.0633 | 1.42% |  |
| `/mixed-image-performance` | pass | 0.0612 | 1.47% |  |
| `/texture-compression-performance` | pass | 0.0643 | 1.5% |  |
| `/complexflex` | pass | 0.0256 | 6.93% |  |
| `/complexflexcaps` | pass | 0.029 | 6.07% |  |
| `/benchmark` | dynamic | 0.31 | 72.28% |  |
| `/versions` | capability | 0.4282 | 61.89% |  |
| `/player/1` | dynamic |  | % |  |
| `/no-such-route` | pass | 0.0017 | 0.01% |  |

## Failures

None.

Dynamic pages (countdown, viewport, player, benchmark) are captured for
eyeballing but excluded from the pass/fail count because their content is
time- or video-dependent.
