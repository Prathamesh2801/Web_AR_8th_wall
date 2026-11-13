/**
 * Preloads every file the active brand's effects use while the start screen is up, so
 * nothing downloads (or hitches) the first time an effect plays: 3D models (~2 MB each
 * at full detail, see scripts/optimize-model.mjs), textures, icons, the 3D font, sounds,
 * the tracking targets.
 *
 * Handing them over: the effects ask with the same URLs as always.
 * - three.js loaders read THREE.Cache, keyed `file:<url>` (FileLoader: GLB models) and
 *   `image:<url>` (ImageLoader: TextureLoader); we fill it, decoded.
 * - Plain fetches go through fetchAsset(), which answers from memory when it can.
 * - The engine loads target images itself: those are only warmed in the HTTP cache.
 * A file that fails is skipped (its effect loads it late, as before); it never blocks Start.
 */
import * as THREE from 'three'

import {ANIMATIONS, BRAND, PRODUCT, TRACKING, brandFile, enabledAnimationIds} from './config'
import {PLANTED_MODELS} from './ar/planted'
import {FONT_URL} from './ar/typography'
import {SOUND_NAMES} from './sound'

THREE.Cache.enabled = true
const blobs = new Map() // url -> Blob

/** fetch(), answered from the preload when it has the file. */
export const fetchAsset = (url) => (blobs.has(url) ? Promise.resolve(new Response(blobs.get(url))) : fetch(url))

/** Every URL the enabled effects of this brand will ask for. */
const assetList = () => {
  const on = new Set(enabledAnimationIds())
  const urls = new Set(SOUND_NAMES.map(n => `/sounds/${n}.mp3`))
  for (const name of TRACKING.targets) urls.add(brandFile(`targets/${name}.json`))
  if (on.has('typography')) urls.add(FONT_URL)
  if (on.has('labelSpin') && PRODUCT.label.image) urls.add(PRODUCT.label.image)
  if (on.has('logoLift')) for (const f of [ANIMATIONS.logoLift.mark, ANIMATIONS.logoLift.patch]) if (f) urls.add(brandFile(f))
  if (on.has('planted')) for (const n of PLANTED_MODELS) urls.add(brandFile(`models/${n}.glb`))
  if (on.has('techOrbit')) {
    for (const it of ANIMATIONS.techOrbit.items ?? []) {
      urls.add(brandFile(`icons/${it.icon}.svg`))
      if (it.model) urls.add(brandFile(it.model))
    }
  }
  return [...urls]
}

const isImage = url => /\.(png|jpe?g|webp)$/i.test(url)
const isModel = url => /\.glb$/i.test(url)

/** One file: streamed (for byte progress), kept, and put where its loader will look. */
const load = async (url, onBytes) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  onBytes(0, +res.headers.get('content-length') || 0)
  const reader = res.body.getReader()
  const chunks = []
  for (;;) {
    const {done, value} = await reader.read()
    if (done) break
    chunks.push(value)
    onBytes(value.length, 0)
  }
  const blob = new Blob(chunks, {type: res.headers.get('content-type') ?? ''})
  blobs.set(url, blob)
  if (isModel(url)) THREE.Cache.add(`file:${url}`, await blob.arrayBuffer())
  if (isImage(url)) {
    const img = new Image()
    img.src = URL.createObjectURL(blob)
    await img.decode()
    THREE.Cache.add(`image:${url}`, img)
  }
  // Tracking target: warm its image for the engine.
  if (url.endsWith('.json') && url.includes('/targets/')) {
    const meta = await blob.text().then(JSON.parse).catch(() => null)
    if (meta?.imagePath) await fetch(meta.imagePath).catch(() => {})
  }
}

let started = null
const listeners = new Set()
let state = {progress: 0, done: false}
const emit = (next) => { state = {...state, ...next}; listeners.forEach(l => l(state)) }

/** Starts the preload once (later calls share it); follow it with onPreload(). */
export const preloadAssets = () => {
  if (started) return started
  const urls = assetList()
  let loaded = 0
  let expected = 0
  let finished = 0
  // The more cautious of bytes and files: bytes alone read 99% while a big model's size
  // was still unknown (it only counts files whose headers have arrived). Never goes back.
  let shown = 0
  const tick = () => {
    const files = finished / Math.max(urls.length, 1)
    const bytes = expected ? loaded / expected : files
    shown = Math.max(shown, Math.min(0.99, files, bytes))
    emit({progress: shown})
  }
  started = Promise.all(urls.map(url => load(url, (got, size) => { loaded += got; expected += size; tick() })
    .catch(err => console.warn(`[assets] ${url}: ${err.message} (loads on demand)`))
    .finally(() => { finished++; tick() })))
    .then(() => emit({progress: 1, done: true}))
  console.log(`[assets] preloading ${urls.length} files for ${BRAND.id}`)
  return started
}

/** Subscribes to {progress 0..1, done}; returns the unsubscribe. */
export const onPreload = (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn) }
