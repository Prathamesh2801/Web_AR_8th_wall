/**
 * Supradyn Naturals Ginseng, 60 tablets (client: Bayer).
 *
 * Everything that is THIS product lives here; the engine, effects and UI are shared.
 * Files: artwork + photos in brand-assets/supradyn/, served files in public/brands/supradyn/
 * (hero.jpg, targets/ made by `npm run generate-targets -- supradyn`, models/).
 * See src/brands/README.md for how a brand file is laid out.
 */
import * as nutrients from './nutrients.js'

/**
 * The physical bottle, in MILLIMETRES — measure the real one and type it in here.
 * The single model every animation shares: the outline draws it, the occlusion proxy
 * is built from it, and `generate-targets` reads the label/circumference.
 * After changing circumference / labelWidth, re-run generate-targets.
 */
export const bottle = {
  circumference: 176, // around the label — confirmed on the real bottle
  labelWidth: 172, // printed label length (artwork KLD: 172 x 52)
  labelHeight: 52, // printed label height (artwork)
  labelBottom: 12, // table -> bottom edge of the label. Measured on the real bottle

  // [height above the table, radius] in mm, base -> cap top.
  // The body is ONE straight cylinder, same 176mm circumference above, on and below
  // the label (confirmed; brand-assets/supradyn/reference/ref-6.jpeg). Only the last
  // ~4mm at the table curve in — the rounded bottom edge.
  profile: [
    [0.8, 26], // base contact (rounded foot)
    [0.8, 26],
    [2, 27.5],
    [4, 28], // full body width
    [64, 28], // label top (labelBottom + labelHeight); shoulder turns in from here
    [67.6, 27.2],
    [71.3, 25.8],
    [74.9, 23.8],
    [78.4, 20.2],
    [79.6, 17.6], // neck
    [80.4, 17.6],
    [81.2, 19.6], // cap lip — cap ~39mm across
    [92.1, 19.6],
    [93.6, 18.5], // cap top, rounded edge. Total height ~94mm (measured)
  ],
}

export default {
  id: 'supradyn',
  bottle,

  /** Flat label artwork: input to generate-targets; Typography maps print boxes from it. */
  label: {
    source: 'brand-assets/supradyn/label/supradyn-60-label-source.png',
    px: {w: 4064, h: 1229},
  },

  /** Target names (public/brands/supradyn/targets/<name>.json): left, front, right crops. */
  targets: ['supradyn-bottle-left', 'supradyn-bottle', 'supradyn-bottle-right'],

  /** App UI colours (the gold / teal tokens of src/index.css). */
  theme: {accent: '#FFD45A', teal: '#2BB3A8'},

  /** Everything the 2D UI says about the product. */
  experience: {
    brand: 'Supradyn',
    product: 'Naturals Ginseng',
    maker: 'Bayer',
    headline: 'Bring your product to life.',
    lookFor: 'your Supradyn bottle', // "Point at ___"
    heroImage: 'hero.jpg', // in public/brands/supradyn/ ('' = no photo)
    photoName: 'supradyn-ar.jpg', // file name of saved photos
  },

  /** Nutrient data (Orbit, Scan, Planted captions, nutrient card). null = none. */
  nutrients,

  /**
   * Overrides on top of the shared ANIMATIONS defaults in src/config.js (deep-merged).
   * Only what is specific to this product: its words, claims and colours.
   */
  animations: {
    typography: {
      words: {
        supradyn: {
          // Box of the printed word in the label source px (x0-x1, cap top -> baseline).
          print: {text: 'Supradyn', x0: 1756, x1: 2275, top: 244, base: 354},
          show: true,
          faceColor: '#1F3A8A', // logo navy (lifted a touch: the matcap darkens it, deeper reads black)
          sideColor: '#3355AA', // same navy, lighter so the depth reads
          glowColor: '#FFC84A',
          glow: 0.18, // gold glow behind the letters, 0..1
          slantDeg: 12, // the logo's italic
          letterHeight: 0.22, // lifted letters, x label height
          radius: 1.45, // orbit radius, x bottle radius
          height: 0.45, // orbit height, x label height from its centre (print +0.26)
          direction: -1, // 1 = front moves right, -1 = left
          speed: 0.3, // rev/s
          rounds: 1, // whole turns before it lands back on its print
          delay: 0.3, // s after the animation starts
          loop: true, // replay after exiting
          loopPause: 1.5, // s between loops
        },
        ginseng: {
          print: {text: 'GINSENG', x0: 1668, x1: 2223, top: 877, base: 979},
          show: true,
          faceColor: '#E2483B', // label red
          sideColor: '#D9A23A',
          glowColor: '#FFC84A',
          glow: 0.2,
          slantDeg: 0,
          letterHeight: 0.2,
          radius: 1.3,
          height: 0, // print is at -0.25
          direction: 1,
          speed: 0.3,
          rounds: 1,
          delay: 0,
          loop: true,
          loopPause: 1.5,
        },
      },
    },

    // The front label's own claims — keep new text to what the pack says.
    callouts: {
      items: {
        energy: {text: 'Energy boost', side: -1, y: 0.3},
        focus: {text: 'Mental focus', side: 1, y: 0.15},
        stamina: {text: 'Stamina', side: -1, y: -0.15},
        men: {text: 'Multivitamin', side: 1, y: -0.3},
      },
    },

    tickerRings: {
      rings: {
        top: {text: 'ENERGY  •  STAMINA  •  MENTAL FOCUS', y: 0.3, radius: 1.3, tiltDeg: 7, speed: 0.05, direction: -1},
        bottom: {text: 'GINSENG  •  MULTIVITAMIN FOR MEN', y: -0.28, radius: 1.42, tiltDeg: -5, speed: 0.04, direction: 1},
      },
    },

    // Planted = ginseng roots + grape berries: this label's botanicals (public/brands/supradyn/models).
    planted: {enabled: true},

    sparkle: {color1: '#FFD45A', color3: '#3FD9C4'}, // brand gold, brand teal
  },
}
