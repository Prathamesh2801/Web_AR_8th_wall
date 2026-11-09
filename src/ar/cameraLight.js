/**
 * cameraLight.js — the room's light, measured from the camera image, for lit effects.
 *
 * XR8.CameraPixelArray (added in startAR.js) hands every frame a tiny RGBA copy of the
 * camera image: processGpuResult.camerapixelarray = {rows, cols, rowBytes, pixels}
 * (verified in engine-binary 1.0.0). Its readback runs on the engine's compute context
 * right after tracking's own, so a 16 px copy is close to free.
 *
 * Averaged a few times a second and eased, so a passing hand or an auto-exposure step
 * shifts the light gently instead of making the models flash.
 */
import * as THREE from 'three'

export const CAMERA_SAMPLE_PX = 16
const EVERY_MS = 250
const EASE = 0.35

export const cameraLight = {
  color: new THREE.Color(1, 1, 1), // mean camera colour, linear
  luma: 0.18, // its luminance, linear (0.18 = mid grey)
  ready: false,
}

const target = new THREE.Color()
let last = -Infinity

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
  const n = rows * cols * 255
  target.setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace) // camera pixels are sRGB
  if (cameraLight.ready) cameraLight.color.lerp(target, EASE)
  else cameraLight.color.copy(target)
  const c = cameraLight.color
  cameraLight.luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  cameraLight.ready = true
}
