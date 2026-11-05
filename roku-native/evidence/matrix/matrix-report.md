# Native Roku feature matrix

Generated: 2026-11-05T18:46:39.287Z
Device: <ROKU_IP>

Routes: **56/56 passed**
Interactions: **8/8 passed**

| Route | Result | Route seen | Labels | Mem MB | Textures | Notes |
|---|---|---|---|---|---|---|
| `/` | pass | yes | 2 | 46.9 | 0 |  |
| `/browse/all` | pass | yes | 2 | 46.9 | 0 |  |
| `/browse/movie` | pass | yes | 2 | 43.55 | 0 |  |
| `/browse/tv` | pass | yes | 2 | 46.9 | 0 |  |
| `/examples` | pass | yes | 131 | 46.9 | 0 |  |
| `/examples/tmdb` | pass | yes | 168 | 46.9 | 0 |  |
| `/loops` | pass | yes | 7 | 46.9 | 0 |  |
| `/infinite` | pass | yes | 3 | 46.9 | 0 |  |
| `/tmdbgrid` | pass | yes | 2 | 46.9 | 0 |  |
| `/virtual` | pass | yes | 37 | 46.9 | 0 |  |
| `/destroy` | pass | yes | 2 | 43.55 | 0 |  |
| `/grid` | pass | yes | 24 | 46.9 | 0 |  |
| `/matrix` | pass | yes | 0 | 46.9 | 0 |  |
| `/text` | pass | yes | 6 | 43.55 | 0 |  |
| `/firebolt` | pass | yes | 1 | 46.9 | 0 |  |
| `/login` | pass | yes | 53 | 43.55 | 0 |  |
| `/nested` | pass | yes | 11 | 43.55 | 0 |  |
| `/textposter` | pass | yes | 9 | 46.9 | 0 |  |
| `/textcentering` | pass | yes | 32 | 46.9 | 0 |  |
| `/countdown` | pass | yes | 3 | 43.55 | 0 |  |
| `/custombuttons` | pass | yes | 7 | 43.55 | 0 |  |
| `/positioning` | pass | yes | 1 | 43.55 | 0 |  |
| `/layout` | pass | yes | 3 | 43.55 | 0 |  |
| `/focusbasics` | pass | yes | 0 | 43.55 | 0 |  |
| `/transitions` | pass | yes | 0 | 43.55 | 0 |  |
| `/components` | pass | yes | 2 | 43.55 | 0 |  |
| `/focushandling` | pass | yes | 0 | 43.55 | 0 |  |
| `/keyhandling` | pass | yes | 1 | 43.55 | 0 |  |
| `/gradients` | pass | yes | 0 | 43.55 | 0 |  |
| `/flex` | pass | yes | 8 | 46.9 | 0 |  |
| `/create` | pass | yes | 7 | 46.9 | 0 |  |
| `/viewport` | pass | yes | 0 | 43.55 | 0 |  |
| `/flexsize` | pass | yes | 8 | 46.9 | 0 |  |
| `/flexmenu` | pass | yes | 3 | 43.55 | 0 |  |
| `/flexcolumnsize` | pass | yes | 1 | 43.55 | 0 |  |
| `/flexcolumn` | pass | yes | 1 | 43.55 | 0 |  |
| `/flexgrow` | pass | yes | 3 | 43.55 | 0 |  |
| `/flexjustifywidth` | pass | yes | 45 | 46.9 | 0 |  |
| `/keepalive` | pass | yes | 1 | 43.55 | 0 |  |
| `/suspense` | pass | yes | 1 | 43.55 | 0 |  |
| `/superflex` | pass | yes | 24 | 43.55 | 0 |  |
| `/tags` | pass | yes | 36 | 43.55 | 0 |  |
| `/buttonsmaterial` | pass | yes | 3 | 43.55 | 0 |  |
| `/entity/movie/1` | pass | yes | 12 | 43.55 | 0 |  |
| `/entity/tv/2` | pass | yes | 12 | 46.9 | 0 |  |
| `/entity/people/1` | pass | yes | 3 | 43.55 | 0 |  |
| `/image-performance` | pass | yes | 1 | 43.55 | 0 |  |
| `/large-image-performance` | pass | yes | 1 | 43.55 | 0 |  |
| `/mixed-image-performance` | pass | yes | 1 | 43.55 | 0 |  |
| `/texture-compression-performance` | pass | yes | 1 | 46.9 | 0 |  |
| `/complexflex` | pass | yes | 129 | 46.9 | 0 |  |
| `/complexflexcaps` | pass | yes | 113 | 46.9 | 0 |  |
| `/benchmark` | pass | yes | 94 | 0 | 0 |  |
| `/versions` | pass | yes | 1 | 43.55 | 0 |  |
| `/player/1` | pass | yes | 8 | 0 | 0 |  |
| `/no-such-route` | pass | yes | 0 | 43.55 | 0 |  |

## Interactions

- pass — Browse → Details → Back (focus/screen restore)
- pass — Examples portal → tile → Back
- pass — Login keyboard renders
- pass — Infinite list D-pad stress
- pass — Browse horizontal scroll changes mounted posters
- pass — Held Right auto-repeats and scrolls
- pass — Player pause/play/seek state transitions
- pass — Home exits and relaunch recovers

## Failures

None.
