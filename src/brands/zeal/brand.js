/**
 * Zeal Interactive Services — our own showcase, for the company's socials.
 * Event technology + gaming: VR, AR tables, interactive walls, AI photobooths, sensor games.
 *
 * Same physical bottle as Supradyn, with the company sticker over its label and cap.
 * The sticker art is GENERATED: `node brand-assets/zeal/sticker/make-sticker.mjs`
 * (it prints the label.px + ZEAL print box below), then
 * `npm run generate-targets -- zeal`. Open with `?brand=zeal`.
 */
import {bottle} from '../supradyn/brand.js'

// Sticker: light label, deep-green ink (logo #1C552A), teal + lime accents.
const LIME = '#9BE23B'
const MINT = '#3FD9A8'
const GREEN_GLASS = 'rgba(10, 36, 18, 0.85)'

export default {
  id: 'zeal',
  // Same bottle, but the sticker's ARTWORK (what tracking finds) sits at a different height
  // than Supradyn's label. Everything 3D (occluder, glow, spotlight, cap effects) hangs off
  // this number: wrong = a doubled edge at the cap. 10 = tuned on the device (2026-11-12).
  bottle: {...bottle, labelBottom: 10},

  label: {
    source: 'brand-assets/zeal/sticker/body-wrap.png', // flat trim art, generated
    px: {w: 4063, h: 1228},
    // What is PHYSICALLY on the bottle, for Spin: the print file with its top/bottom bleed
    // (the sticker went on uncut), sides trimmed so the 360° wrap closes. public/brands/zeal/.
    image: 'label-wrap.jpg',
    imageBleedMm: 3, // the image extends this far past the art's top and bottom edges
  },

  targets: ['zeal-left', 'zeal-front', 'zeal-right'],

  /** App UI colours (replace the gold / teal tokens of src/index.css). */
  theme: {accent: LIME, teal: MINT},

  experience: {
    brand: 'Zeal',
    product: 'Interactive Services',
    maker: 'Zeal Interactive Services',
    headline: "Let's go interactive.",
    lookFor: 'the Zeal bottle',
    heroImage: '', // add public/brands/zeal/hero.jpg (bottle with sticker), then 'hero.jpg'
    logo: 'logo.png', // shown in the hero frame while there is no photo or model
    // Start-screen 3D bottle: `bottle` lathed + the sticker art (files in public/brands/zeal/,
    // exported from brand-assets/zeal/sticker/). Colours = the bottle's teal plastic.
    model: {label: 'label.jpg', capTop: 'cap-top.jpg', capTopMm: 36, bodyColor: '#06787A', capColor: '#0A9393'},
    photoName: 'zeal-ar.jpg',
  },

  nutrients: null,

  animations: {
    productOutline: {color: LIME},

    typography: {
      words: {
        zeal: {
          // Printed in the same Montserrat 800 the 3D letters use: lifts off its exact print.
          print: {text: 'ZEAL', x0: 1546, x1: 2526, top: 536, base: 784},
          show: true,
          faceColor: '#1C552A', // the print's green, so the lifted letters match it
          sideColor: LIME,
          glowColor: LIME,
          glow: 0.25,
          slantDeg: 0,
          letterHeight: 0.24,
          radius: 1.4,
          height: 0.1,
          direction: 1,
          speed: 0.3,
          rounds: 1,
          delay: 0.2,
          loop: true,
          loopPause: 1.5,
        },
      },
    },

    callouts: {
      items: {
        vr: {text: 'Virtual Reality', side: -1, y: 0.3},
        ar: {text: 'AR Experiences', side: 1, y: 0.15},
        games: {text: 'Interactive Games', side: -1, y: -0.15},
        events: {text: 'Event Tech', side: 1, y: -0.3},
      },
      lineColor: LIME,
      cardColor: GREEN_GLASS,
      cardBorderColor: 'rgba(155, 226, 59, 0.55)',
    },

    tickerRings: {
      rings: {
        top: {text: 'VIRTUAL REALITY  •  AR TABLE  •  INTERACTIVE WALL  •  AI PHOTOBOOTH', y: 0.3, radius: 1.3, tiltDeg: 7, speed: 0.05, direction: -1},
        bottom: {text: 'ZEAL INTERACTIVE SERVICES  •  EVENT TECH  •  GAMING', y: -0.28, radius: 1.42, tiltDeg: -5, speed: 0.04, direction: 1},
      },
      accentColor: LIME,
      bandColor: 'rgba(10, 36, 18, 0.6)',
    },

    settle: {label: 'Glow', highlightColor: '#E9FFC2', deepColor: '#4FB83A', emberColor: '#F2FFE0'},
    sparkle: {color1: LIME, color2: '#FFFFFF', color3: MINT},
    // The Z mark printed at the top of the front (make-sticker.mjs: 17 mm box at x 77.5,
    // y 4.4) lifts off in 3D. Mark traced from Zeal_logo.png (same 1000 px frame as the
    // printed image); patch = that spot of the label without the logo, feathered.
    logoLift: {
      mark: 'logo-mark.svg',
      print: {cx: 86, cy: 12.9, size: 17},
      patch: 'logo-patch.png',
      patchMm: 19.4,
      faceColor: '#1C552A',
      sideColor: LIME,
      glowColor: LIME,
      ringColor: LIME,
    },
    // Elements "Tech Orbit": five of the sticker's badges (the ones with a Meshy model) lift
    // off and orbit, evenly spaced (badge = its centre in make-sticker.mjs, mm). The other
    // three badges stay printed. Pitch = ONE short line on the panel (~6 words); edit freely.
    // size = MEASURED: each model's screen area averaged over a full spin, equalised (the wall
    // covered ~2x the others). Re-measure if a model is replaced.
    techOrbit: {
      items: [
        {key: 'vr', label: 'Virtual Reality', icon: 'cardboards', badge: {cx: 14.5, cy: 10.4},
          model: 'models/vr-headset.glb', size: 1.12, // Meshy, via scripts/optimize-model.mjs
          pitch: 'Immersive VR for events and brands'},
        {key: 'walls', label: 'Interactive Walls', icon: 'hand-click', badge: {cx: 38, cy: 32.2},
          model: 'models/interactive-wall.glb', size: 0.77, // Meshy; full 278k triangles, erode 1 (hides atlas seams on the black screen)
          pitch: 'Walls that react to touch'},
        {key: 'photobooth', label: 'AI Photobooth', icon: 'camera-ai', badge: {cx: 134, cy: 10.4},
          model: 'models/camera.glb', size: 1.11, // Meshy; 20% of its 1.04M triangles (full looked the same)
          pitch: 'AI-styled photos guests take home'},
        {key: 'vrgames', label: 'VR Games', icon: 'device-gamepad-2', badge: {cx: 38, cy: 10.4},
          model: 'models/game-controller.glb', size: 1.15, // Meshy; 40% of its 553k triangles (full looked the same)
          pitch: 'VR games that pull a crowd'},
        {key: 'robotics', label: 'Robotics Hardware', icon: 'robot', badge: {cx: 157.5, cy: 32.2},
          model: 'models/robot.glb', size: 1.02, // Meshy; 40% of its 366k triangles (full looked the same)
          pitch: 'Custom robots for live installations'},
      ],
    },
    // Elements "Photo Burst": real Zeal event work as polaroids, each in its photo's own
    // shape (never cropped). Files made with scripts/prepare-photos.mjs (originals in
    // brand-assets/zeal/photos/events/, local). Order = fan order: the middle 7 show at rest
    // (05 at the centre), 01 comes round on a swipe. Captions name the service shown, no
    // client names: edit freely.
    photoBurst: {
      photos: [
        {file: 'photos/event-01.webp', caption: 'Smart factory scale model'},
        {file: 'photos/event-02.webp', caption: 'Interactive scale models'},
        {file: 'photos/event-03.webp', caption: 'VR interactive zone'},
        {file: 'photos/event-04.webp', caption: 'Interactive projection floor'},
        {file: 'photos/event-05.webp', caption: 'Interactive touch wall'},
        {file: 'photos/event-06.webp', caption: 'Sensor game table'},
        {file: 'photos/event-07.webp', caption: 'Virtual cricket'},
        {file: 'photos/event-08.webp', caption: 'Beachside surf game'},
      ],
    },
    // Elements "Arcade" (Badge Bash): all 8 printed badges are the holes (centres from
    // make-sticker.mjs); the gold bonus coin pops off the Z logo (logoLift's print).
    arcade: {
      targets: [
        {icon: 'cardboards', badge: {cx: 14.5, cy: 10.4}},
        {icon: 'device-gamepad-2', badge: {cx: 38, cy: 10.4}},
        {icon: 'augmented-reality', badge: {cx: 14.5, cy: 32.2}},
        {icon: 'hand-click', badge: {cx: 38, cy: 32.2}},
        {icon: 'camera-ai', badge: {cx: 134, cy: 10.4}},
        {icon: 'hand-move', badge: {cx: 157.5, cy: 10.4}},
        {icon: 'radar-2', badge: {cx: 134, cy: 32.2}},
        {icon: 'robot', badge: {cx: 157.5, cy: 32.2}},
      ],
      bonus: {cx: 86, cy: 12.9, mark: 'logo-mark.svg'},
    },
    // The sticker's 8 service badges, scanned off the bottle.
    scan: {
      readouts: ['Virtual Reality', 'VR Games', 'AR Experiences', 'Interactive Walls',
        'AI Photobooth', 'Gesture Tech', 'Sensor Games', 'Robotics Hardware'],
      verdict: '✓ Zeal scanned · 8 services',
      color: MINT,
      cardColor: GREEN_GLASS,
      cardBorderColor: 'rgba(63, 217, 168, 0.6)',
    },
  },
}
