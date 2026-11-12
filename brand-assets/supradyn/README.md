# Brand assets — Supradyn Naturals Ginseng, 60 tablets

Reference material for building AR on this product. Drop new brand material here
(artwork, photos, colour specs, copy decks). Nothing in this folder is served to users;
the app reads only `public/brands/supradyn/` (made from here by
`npm run generate-targets -- supradyn`).

Git: everything here is committed except `photos/` (local only, see `.gitignore`).

## label/supradyn-60-label-source.png  (committed)

Flat production label, exported from the printer's `60_curvas.ai` (page 1, text
outlined; varnish, die-cut and dimension layers removed). 4064 x 1229 px @ 600 dpi.
It is the input to `npm run generate-targets -- supradyn` and the source the nutrient values in
`src/brands/supradyn/nutrients.js` were transcribed from.

| Fact | Value |
|---|---|
| Barcode | 8 904003 452786 (matches the physical bottle) |
| Net qty | 60 tablets |
| Label trim | 172 x 52 mm |
| Bottle circumference | 176 mm (172 label + ~4 mm gap), ~56 mm diameter |
| Label arc | 351.8 deg — the two ends meet at the back, beside the barcode |

### Image targets made from it

A 3:4 crop covers only ~40% of this label (~142 deg), so `scripts/generate-targets.mjs`
cuts three overlapping crops (pixel ranges along the label's length):

| Target | Crop | What's on it |
|---|---|---|
| `supradyn-bottle-left` | 0-1639 | disclaimer, batch box, "Each Film Coated Tablet Contains" |
| `supradyn-bottle` | 1213-2852 | Supradyn logo, GINSENG (front) |
| `supradyn-bottle-right` | 2425-4064 | nutritional information, barcode |

The batch/MFG/expiry box is blank in the artwork but printed per batch on real bottles,
so the left crop's match can be slightly weaker there.

### Typography (A01)

Printed word boxes (source px, x0-x1 and cap top -> baseline) are `ART` in
`src/ar/typography.js`, so each 3D word starts exactly on its print:
GINSENG x 1668-2223, y 877-979; Supradyn logo x 1756-2275, y 244-354 (ink #231F20,
slanted ~12 deg).

`public/fonts/montserrat-800.typeface.json`: Montserrat ExtraBold (closest to the
headline type), A-Z + a-z only, converted from the OFL TTF with opentype.js. Licence:
`public/fonts/OFL.txt` (must ship with the font).

## Brand palette (sampled, not eyeballed)

k-means over the production label artwork, plus the bottle plastic from `photos/`.
Use these for animation and UI design; the app's current accents are `gold #FFD45A`
(a softened Supradyn yellow) and `teal #2BB3A8`.

| Colour | Hex | Share of label | Where |
|---|---|---|---|
| Label teal | `#01ACA9` | 26.5% | dominant label background |
| Deep teal | `#076961` | 19.3% | facts panels, shadows of the wave pattern |
| Mid teal | `#019591` | 13.2% | wave pattern |
| Ginseng gold (metallic) | `#9B712F` | 16.1% | GINSENG band — reads brighter, it's foil |
| Supradyn yellow | `#FBD50B` | 5.1% | logo field |
| Label white | `#FBFCFB` | 9.3% | text, batch box |
| Bottle plastic | `#05575F` | — | cap and body (photo, under room light) |

Also present in small areas: GINSENG red (headline), the orange-red logo swoosh.

## photos/  (local only)

`front.jpg`, `back.jpg`, `side-left.jpg`, `side-right.jpg` — the real bottle on a desk,
5712 x 4284. Use them to judge proportions and colours the label doesn't show:

- Body and cap are **deep teal** (cap ~28 mm of the height above the label, base ~12 mm
  below — the basis for `HEIGHT_SCALE` / `Y_OFFSET_SCALE` in `src/ar/occlusionProxy.js`).
- Label accents: Supradyn yellow, gold band, red GINSENG type.

## The bottle's shape (for every animation)

The image target measures only the 52 mm label band. The rest of the bottle is
modelled in **millimetres** in `src/brands/supradyn/brand.js` (`bottle`): heights from the table,
radii, label size and circumference. `PRODUCT.profile` is the same shape converted to
engine units; the outline draws it, the occlusion proxy is built from it, and
`npm run generate-targets` reads the label/circumference from it.

| Part | Height above table (mm) | Radius (mm) | Status |
|---|---|---|---|
| Base contact (small rounded foot) | 0 | 23 -> 28 by 4 mm | fitted |
| Body, straight cylinder (same circumference under the label) | 4 .. 64 | 28 | confirmed |
| Label band (tracked) | 12 .. 64 | 28 | label bottom height **estimated** |
| Shoulder (turns in from label top) | 64 .. 78 | 28 -> 20 | fitted |
| Neck | 80 | 17.6 | fitted |
| Cap | 81 .. 94 | 19.6 (~39 mm across) | fitted |

"Fitted" = solved from on-device screenshots: the engine-drawn label rings sit on the
printed label edges, so the phone camera can be solved per shot from them (7-10 px
RMS) and the profile corrected against the real edges, then checked on other shots.

### Calibration

- **Circumference 176 mm — confirmed** on the real bottle. The body has this same
  circumference above, on and below the label; it does not narrow under the label.
  Only the last ~4 mm at the table round in.
- Still estimated (measure with a ruler if the outline sits off): label bottom height
  above the table (12), total height to the cap top (~94), cap diameter (~39).

## reference/  (committed)

On-device screenshots of the outline locked to the real bottle (Android Chrome):

| File | Shot |
|---|---|
| `outline-on-device-android.jpg` | first outline, desk background |
| `tracked-1-mid.jpg` | mid distance, white background — used for the profile fit |
| `tracked-2-close.jpg` | close — used for the profile fit |
| `tracked-3-far.jpg` | far |
| `tracked-4-close-high.jpg` | close, from higher up |
| `ref-5.jpeg` | after the cap fix; base still pinched (old narrowing) |
| `ref-6.jpeg` | real bottle close-up, no AR — shows the body is straight below the label |

The tracked-* shots show the first profile (cap too high); ref-5 the second (base
pinched). The bottle model was corrected from them. New shots after a change go here too, so the next person can see what
"right" looks like.
