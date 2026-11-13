# Brands: one app, many products

The engine, effects and UI are shared. Everything that belongs to ONE product lives in
three places, all named by the brand id:

```
src/brands/<id>/brand.js       bottle size, label, target names, start-screen copy, effect content
src/brands/<id>/nutrients.js   (optional) ingredient/nutrient data for Orbit, Scan, Planted
public/brands/<id>/            served files: hero.jpg, targets/ (generated), models/ (optional)
brand-assets/<id>/             source material: README, label or sticker art, reference/, photos/ (local)
```

Brands today: `supradyn` (client, Bayer) and `zeal` (Zeal Interactive Service, ours).

## Switching brand

- **Default for the build:** `DEFAULT_BRAND` at the top of `src/config.js`.
- **Per link, no rebuild:** add `?brand=zeal` (or `?brand=supradyn`) to the URL.
  Combine with debug: `?brand=zeal&debug`.

Dashboard tuning is saved per brand, so tuning one never changes another.

## Adding a brand / product

1. **Assets** -> `brand-assets/<id>/`: the flat label (or sticker) PNG at print size,
   logo, colours, product photos, and its measurements (see "Measure" below).
2. **Brand file** -> copy `src/brands/zeal/brand.js` to `src/brands/<id>/brand.js` and fill:
   - `id`: the folder name.
   - `bottle`: millimetres, measured on the real product (or import another brand's
     `bottle` when it is the same container, like zeal does).
   - `label.source` (path of the flat PNG) and `label.px` (its width x height in px).
   - `targets`: three names `[left, front, right]`.
   - `experience`: start-screen copy; `heroImage` = a file in `public/brands/<id>/`
     (or `logo`, shown instead while there is no photo).
     Or a turning 3D bottle: `model: {label, capTop, capTopMm, bodyColor, capColor}`
     (label = the flat art as a ~2048 px JPG in `public/brands/<id>/`; it is wrapped on at
     the real label size, so the print stays sharp). See zeal's brand file.
   - `theme`: `{accent, teal}` — the app UI's two colours for this brand.
   - `nutrients`: `null`, or `import * as nutrients from './nutrients.js'` (same shape
     as supradyn's).
   - `animations`: only what is specific to this product, merged over the defaults
     in `src/config.js` (see "Effects" below).
3. **Register** it in `src/brands/index.js` (one import + one key).
4. **Targets:** `npm run generate-targets -- <id>` -> `public/brands/<id>/targets/`.
5. **Hero:** `public/brands/<id>/hero.jpg` (3:4, the product on its own).
6. Open `?brand=<id>`, point at the product, tune with `?brand=<id>&debug`.

## Effects per brand

Generic effects work for every brand with no content: Outline, Golden, Spotlight,
Energy, Sparkle. Give them brand colours under `animations`, e.g.
`sparkle: {color1: '#...', color3: '#...'}`, `settle: {deepColor: '#...'}`.

These switch on by themselves when the brand provides their content (and stay out
of the lens menu until then):

| Effect | Needs, in `animations` / brand file |
|---|---|
| Typography "Lift & Spin" | `typography.words.<key>.print` = the word's box on the flat label (px) + `label.px` |
| Typography "Logo" | `logoLift: {mark, print: {cx, cy, size} (mm on the trim label), patch, patchMm}`: see zeal (`brand-assets/zeal/sticker/make-logo-assets.mjs` makes mark + patch) |
| Typography "Spin" | `label.image` = the label as it physically is (~2048 px JPG in `public/brands/<id>/`, sides trimmed); `label.imageBleedMm` if it extends past the art top/bottom (an uncut sticker) |
| Callouts | `callouts.items` = `{key: {text, side: -1/1, y}}` |
| Ticker | `tickerRings.rings` = `{key: {text, y, radius, tiltDeg, speed, direction}}` |
| Orbit | `nutrients` |
| Tech Orbit (Elements) | `techOrbit.items` = `[{key, label, icon, badge: {cx, cy} (mm), pitch, model?}]` + `public/brands/<id>/icons/<icon>.svg`: see zeal |
| Scan | `scan.readouts` = `['line', ...]` (+ `scan.verdict`), or `nutrients` |
| Planted | `nutrients` + `planted: {enabled: true}` + `public/brands/<id>/models/{soil,ginseng-root,grape}.glb` |

Copy the shape from `src/brands/supradyn/brand.js`. Keep claims to what the pack says.

## Measure (for a new container)

Ruler stood next to the product, heights from the table:
label width x height, label bottom edge height, circumference round the label
(tape or string), total height, cap diameter, and a few [height, radius] points up the
shoulder. These go into `bottle`. The label art must be the exact print size: if it is
off, effects drift off the print.

## Good tracking artwork

The app recognises the product from the label image. Every ~70 mm stretch of the
label (one target crop) needs busy, high-contrast detail. Avoid big flat colour areas,
repeating patterns, lone logos on plain backgrounds, and glossy finishes.
