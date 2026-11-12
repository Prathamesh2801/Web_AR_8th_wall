# Supradyn Bottle AR

WebAR concept: point a phone at a real **Supradyn Naturals Ginseng** bottle. The moment
it's detected, a gold outline traces the whole product — proof the tracking is locked.
From there, switch on effects: nutrients orbiting the bottle (tap one for its amount and
%RDA from the label) or a golden glow that settles into an aura.

```
bottle label → camera → 8th Wall cylindrical image targets (3 crops, full wrap)
             → lead-target pose → smoothing → three.js animations on the bottle
```

Open-source 8th Wall engine. No account, no API key, no backend, no `.env`.

## Quick start

```bash
npm install
npm run dev
```

Open the printed **Network** URL (e.g. `https://192.168.1.20:5173/`) on a phone on the
same Wi-Fi and accept the self-signed certificate (*Advanced → Proceed*). The camera only
works over HTTPS. iPhone: Safari only, not in-app browsers.

Add `?debug` to the URL for the debug panel (tracking telemetry, lead target, occlusion
outline, animation speed).

## Tuning

Everything is in **`src/config.js`** — which brand runs (`DEFAULT_BRAND`, or `?brand=<id>`
in the URL), pose smoothing, loss grace period, which animations exist and which start on,
their colours and timing. Each product/brand is a folder in **`src/brands/`**; how to add
one is in [`src/brands/README.md`](src/brands/README.md). Contributor/agent notes,
architecture and the animation contract are in **`CLAUDE.md`**.

## Image targets

`npm run generate-targets -- <brand>` rebuilds `public/brands/<brand>/targets/` from that
brand's flat label (for supradyn: `brand-assets/supradyn/label/supradyn-60-label-source.png`,
172 × 52 mm label on a 176 mm bottle). The engine needs a 3:4 crop, which covers only ~40% of this label, so the script
writes three overlapping crops — left (supplement facts), centre (logo), right (nutrition
table + barcode) — giving detection from any side.

## Brand assets

`brand-assets/<brand>/` is where each brand's reference material goes (artwork, photos,
specs). Its README records the product facts the code depends on. Everything there is
committed except `photos/`, which stays local.

## Test checklist (real bottle + phone)

| # | Test | Detected? | Stable? | Jitter | Recovery | Notes |
|---|---|---|---|---|---|---|
| 0 | Outline hugs the real bottle (cap, neck, base) while you move it | | | | | |
| 1 | Front (logo) facing camera | | | | | |
| 2 | Supplement-facts side facing camera | | | | | |
| 3 | Barcode side facing camera | | | | | |
| 4 | Rotate bottle slowly 360° — content should not jump at hand-overs | | | | | |
| 5 | Camera close (~15 cm) / far (~60 cm) | | | | | |
| 6 | Move the bottle quickly — content lag acceptable? (`smoothingMs`) | | | | | |
| 7 | Cover the label briefly (<1.5 s) — animation continues, no replay | | | | | |
| 8 | Remove bottle >1.5 s, bring back — entrance replays | | | | | |
| 9 | Toggle Outline / Nutrients / Glow chips | | | | | |
| 10 | Android Chrome | | | | | |
| 11 | iPhone Safari | | | | | |

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Never detects | Poor light / glare on the label; check console for skipped targets |
| Content offset or wrong curvature | Circumference vs label width wrong in `scripts/generate-targets.mjs` |
| Outline off the real neck/cap/base | Measure the bottle and fix `bottle` in `src/brands/<brand>/brand.js` |
| Outline right shape but drifts as the bottle moves | Tracking/pose issue — check the debug panel |
| Content swims behind a moving bottle | Lower `TRACKING.smoothingMs` |
| Content jitters on a still bottle | Raise `TRACKING.smoothingMs` |
| Camera never opens | Not HTTPS, or permission denied |
| Blank screen | Engine CDN blocked — check the console |

## Licence

The 8th Wall XR Engine binary is free for commercial use but not open source; its copyright
notice must remain unmodified. The framework, `xrextras` and `image-target-cli` are MIT.
