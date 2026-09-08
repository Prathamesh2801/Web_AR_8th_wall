# Image target: supradyn-bottle (60-tablet SKU)

Generated from the REAL production artwork for the physical bottle.

## Source

- Artwork : raw_files/60_curvas.ai  (page 1, text outlined)
- Layers  : BACKGROUND, ARTWORK, TXT, LINKS
- Removed : VARNISH, UV VARNISH, DIECUT, DIMENSIONS, TXT DIMENSIONS, INFO
- Clean PNG: supradyn-60-label-source.png (4064x1229 px @600dpi = 172.0 x 52.0 mm)

## SKU verification (matches the physical bottle)

- Barcode : 8 904003 452786
- Net qty : 60 TABLETS
- Label   : "KLD of Label Size 172 x 52 mm"

## Geometry

- Label trim width       : 172 mm
- Label trim height      : 52 mm
- Cylinder circumference : 176 mm  (172 label + ~4 mm gap)
- Nominal diameter       : ~56.0 mm
- Arc coverage           : 351.82 deg

## Regenerate

```bash
npx @8thwall/image-target-cli@latest
# image   : public/image-targets/supradyn-60-label-source.png
# type    : cylinder
# unit    : mm
# circumference : 176
# image width   : 172
# default crop  : y
# folder  : public/image-targets
# name    : supradyn-bottle
```

## Note on crop coverage

The CLI enforces a 3:4 crop. For a 3.31:1 landscape label this means only the
central ~40.3% (69.4 mm, ~142 deg) of the label becomes the tracked region.
That is the maximum possible for a 52 mm tall label - it is not a mis-crop.
The tracked region is the front face (logo + GINSENG + part of both tables).

## Archived

The previous 30-tablet (wrong SKU) assets are in
raw_files/_old_30tablet_target/ - do not use them.
