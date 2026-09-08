/**
 * brandTextData.js
 *
 * Copy and palette for the floating brand-text animation.
 *
 * EVERY string below is transcribed VERBATIM from the production artwork
 * (public/image-targets/supradyn-bottle_cropped.png, generated from
 * raw_files/60_curvas.ai). Nothing is invented, paraphrased, or embellished, and no
 * claim appears here that the pack does not itself print. The pack's own claim wording
 * — "HELPS BOOST ENERGY, STAMINA & MENTAL FOCUS" — is reproduced exactly as printed,
 * including the word "HELPS", which is what keeps it the manufacturer's claim rather
 * than a stronger one of our own.
 *
 * The pack also carries the mandatory disclaimer "THIS IS ONLY A BRAND NAME (NATURALS)
 * AND DOES NOT REPRESENT ITS TRUE NATURE". It is included as a low-emphasis panel so
 * the AR experience does not present the brand name more favourably than the physical
 * product does.
 */

/**
 * Brand palette, sampled from the artwork rather than chosen:
 *   gold    #F5C518  Supradyn wordmark plate
 *   teal    #0E8C8C  pack background
 *   red     #C8322D  GINSENG headline and the "MULTIVITAMIN FOR MEN" flag
 *   sand    #A8894B  lower panel
 *   white   #FFFFFF  body text
 */
export const BRAND = {
  gold: 0xf5c518,
  teal: 0x0e8c8c,
  red: 0xc8322d,
  sand: 0xa8894b,
  white: 0xffffff,
}

/**
 * Panels placed around the tracked bottle.
 *
 * `side` picks the anchor: 'left' | 'right' | 'top'. Positions are multiples of the
 * bottle's own radius/height, so every panel is derived from the tracked geometry and
 * rescales with the target rather than being hardcoded in metres.
 *
 * `lines` are rendered as separate rows so long copy wraps predictably instead of
 * relying on canvas measurement.
 *
 * `delay` staggers the entrance in seconds after the target is acquired.
 */
export const TEXT_PANELS = [
  {
    id: 'brand',
    side: 'top',
    lines: [
      {text: 'Supradyn', weight: 700, size: 1.0, color: BRAND.gold},
      {text: 'Naturals', weight: 500, size: 0.62, color: BRAND.white},
    ],
    delay: 0.15,
  },
  {
    id: 'ginseng',
    side: 'left',
    lines: [
      {text: 'GINSENG', weight: 800, size: 1.0, color: BRAND.red},
      {text: 'HELPS BOOST ENERGY,', weight: 600, size: 0.42, color: BRAND.white},
      {text: 'STAMINA & MENTAL FOCUS', weight: 600, size: 0.42, color: BRAND.white},
    ],
    delay: 0.5,
  },
  {
    id: 'format',
    side: 'right',
    lines: [
      {text: 'MULTIVITAMIN', weight: 700, size: 0.72, color: BRAND.white},
      {text: 'FOR MEN', weight: 700, size: 0.72, color: BRAND.red},
      {text: 'NET QTY: 60 TABLETS', weight: 500, size: 0.4, color: BRAND.gold},
    ],
    delay: 0.85,
  },
  {
    id: 'composition',
    side: 'right',
    offsetY: -0.95,
    lines: [
      {text: 'MULTIVITAMIN, MULTIMINERAL,', weight: 500, size: 0.34, color: BRAND.white},
      {text: 'GINSENG, GRAPE SEED EXTRACT', weight: 500, size: 0.34, color: BRAND.white},
    ],
    delay: 1.2,
  },
  {
    /*
     * The pack's mandatory disclaimer. Deliberately dim and small — matching how it is
     * printed — but present, because showing the brand name without it would overstate
     * the product.
     */
    id: 'disclaimer',
    side: 'left',
    offsetY: -1.05,
    dim: true,
    lines: [
      {text: '"NATURALS" IS ONLY A BRAND NAME AND', weight: 400, size: 0.3, color: BRAND.white},
      {text: 'DOES NOT REPRESENT ITS TRUE NATURE', weight: 400, size: 0.3, color: BRAND.white},
    ],
    delay: 1.5,
  },
]
