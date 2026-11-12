/**
 * cameraLight.js — the room's light, measured from the camera image, for lit effects.
 *
 * XR8.CameraPixelArray (added in startAR.js) hands every frame a tiny RGBA copy of the
 * camera image: processGpuResult.camerapixelarray = {rows, cols, rowBytes, pixels}
 * (verified in engine-binary 1.0.0). Its readback runs on the engine's compute context
 * right after tracking's own, so a 64 px copy is close to free.
 *
 * The copy is UPRIGHT, top row first (the engine renders it with flipY, then reads it back
 * bottom-up), and it is the whole camera frame: the canvas shows it centre-cropped to
 * fill, and the three.js camera's projection matches the canvas. So a point on screen
 * maps to a pixel here: paperAt() reads the real label paper under a spot on the bottle.
 *
 * Averaged a few times a second and eased, so a passing hand or an auto-exposure step
 * shifts the light gently instead of making the models flash.
 */
import * as THREE from 'three'

export const CAMERA_SAMPLE_PX = 64
const EVERY_MS = 250
const EASE = 0.35

export const cameraLight = {
  color: new THREE.Color(1, 1, 1), // mean camera colour, linear
  luma: 0.18, // its luminance, linear (0.18 = mid grey)
  ready: false,
}

const target = new THREE.Color()
let last = -Infinity

// The latest sampled frame, kept for paperAt(); `version` bumps when it changes.
const frame = {cols: 0, rows: 0, pixels: new Uint8Array(0), version: 0}
const lumas = new Float32Array(64 * 64)

/** Feed it processGpuResult.camerapixelarray each frame; it samples on its own clock. */
export const sampleCamera = (cpa, now) => {
  if (!cpa?.pixels || !cpa.rows || !cpa.cols || now - last < EVERY_MS) return
  last = now
  const {rows, cols, rowBytes, pixels} = cpa
  let r = 0
  let g = 0
  let b = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * rowBytes + x * 4
      r += pixels[i]
      g += pixels[i + 1]
      b += pixels[i + 2]
    }
  }
  if (frame.pixels.length !== rows * cols * 4) frame.pixels = new Uint8Array(rows * cols * 4)
  for (let y = 0; y < rows; y++) frame.pixels.set(pixels.subarray(y * rowBytes, y * rowBytes + cols * 4), y * cols * 4)
  frame.cols = cols
  frame.rows = rows
  frame.version++
  const n = rows * cols * 255
  target.setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace) // camera pixels are sRGB
  if (cameraLight.ready) cameraLight.color.lerp(target, EASE)
  else cameraLight.color.copy(target)
  const c = cameraLight.color
  cameraLight.luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  cameraLight.ready = true
}

/**
 * The real paper colour (sRGB -> linear, into `out`) of a printed label area on screen:
 * the camera pixels in that box between the 60th and 90th luma percentile: the paper (ink
 * is darker), and TYPICAL paper (the very brightest are noise/highlights: too white).
 * Box in NDC (centre, half sizes); `aspect` = the canvas's (three camera's) aspect.
 * Returns the frame version used, or 0 if there is no camera data / the box is off image.
 */
export const paperAt = (ndcX, ndcY, halfX, halfY, aspect, out) => {
  const {cols, rows, pixels} = frame
  if (!cols || !rows) return 0
  // Canvas = the frame centre-cropped to fill: shrink the cropped axis.
  const img = cols / rows
  const sx = aspect < img ? aspect / img : 1
  const sy = aspect < img ? 1 : img / aspect
  const x0 = Math.max(0, Math.floor((0.5 + ((ndcX - halfX) * sx) / 2) * cols))
  const x1 = Math.min(cols - 1, Math.ceil((0.5 + ((ndcX + halfX) * sx) / 2) * cols))
  const y0 = Math.max(0, Math.floor((0.5 - ((ndcY + halfY) * sy) / 2) * rows))
  const y1 = Math.min(rows - 1, Math.ceil((0.5 - ((ndcY - halfY) * sy) / 2) * rows))
  if (x1 < x0 || y1 < y0) return 0
  let n = 0
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1 && n < lumas.length; x++) {
    const i = (y * cols + x) * 4
    lumas[n++] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
  }
  // Typical paper = the 60th..90th percentile lumas (sort-free: a 32-bin histogram).
  let lo = 255, hi = 0
  for (let i = 0; i < n; i++) { lo = Math.min(lo, lumas[i]); hi = Math.max(hi, lumas[i]) }
  const w = (hi - lo) / 32 || 1
  const bLo = percentileBin(n, lo, w, 0.6)
  const bHi = percentileBin(n, lo, w, 0.9)
  let r = 0, g = 0, b = 0, k = 0
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * cols + x) * 4
    const bin = Math.min(31, Math.floor((0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2] - lo) / w))
    if (bin < bLo || bin > bHi) continue
    r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; k++
  }
  if (!k) return 0
  out.setRGB(r / k / 255, g / k / 255, b / k / 255, THREE.SRGBColorSpace)
  return frame.version
}

const bins = new Uint16Array(32)
/** Histogram bin (32 over lo..hi, width w) holding the q-quantile of lumas[0..n). */
const percentileBin = (n, lo, w, q) => {
  bins.fill(0)
  for (let i = 0; i < n; i++) bins[Math.min(31, Math.floor((lumas[i] - lo) / w))]++
  let seen = 0
  for (let b = 0; b < 32; b++) {
    seen += bins[b]
    if (seen >= n * q) return b
  }
  return 31
}
