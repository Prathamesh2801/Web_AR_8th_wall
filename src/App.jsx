import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react'

import {ANIMATIONS, DEBUG, GROUPS, TRACKING, enabledAnimationIds} from './config'
import {TUNING_ALLOWED} from './tuning' // first: applies saved dashboard edits to config
import {startAR, checkSupport, takePhoto} from './ar/startAR'
import {haptic, playSound, unlockSound} from './sound'
import {TrackingState, trackingStore} from './ar/trackingStore'
import {AROverlay} from './components/ar/AROverlay'
import {Dashboard} from './components/ar/Dashboard'
import {DebugToggle} from './components/ar/DebugToggle'
import {NutrientCard} from './components/ar/NutrientCard'
import {PhotoPreview} from './components/ar/PhotoPreview'
import {StartScreen} from './components/ar/StartScreen'
import {ErrorFallback} from './components/ar/ErrorFallback'

/** Every enabled animation (dashboard tabs), in config order. */
const ANIMATION_CHOICES = enabledAnimationIds().map(id => ({id, label: ANIMATIONS[id].label ?? id}))
/** Always-on layers (the outline): `active` and not a menu choice. */
const BASE_IDS = ANIMATION_CHOICES.filter(a => ANIMATIONS[a.id].active && !ANIMATIONS[a.id].group).map(a => a.id)
/** Lens-menu groups with their enabled styles; a group with none is not shown. */
const MENU_GROUPS = GROUPS
  .map(g => ({...g, variants: ANIMATION_CHOICES.filter(a => ANIMATIONS[a.id].group === g.id)}))
  .filter(g => g.variants.length)

/** Developer UI (the dashboard) is opt-in per visit: open the app with `?debug`. */
const DEBUG_ALLOWED = TUNING_ALLOWED

/**
 * React owns the DOM UI only. The camera canvas lives in index.html and is driven by
 * the 8th Wall pipeline; React never renders it or runs an animation loop. State
 * arrives through the tracking store; commands go to three.js via `getScene()`.
 */
export default function App() {
  // The AR loop is an external source of truth; this keeps React reads tear-free.
  const tracking = useSyncExternalStore(trackingStore.subscribe, trackingStore.getSnapshot)

  const [started, setStarted] = useState(false)
  const [debugOn, setDebugOn] = useState(DEBUG_ALLOWED && DEBUG.panelOpenOnLoad)
  const [speed, setSpeed] = useState(DEBUG.speed)
  const [activeIds, setActiveIds] = useState(BASE_IDS)
  const [effectId, setEffectId] = useState(null) // the one lens-menu effect playing
  const [photo, setPhoto] = useState(null)
  const [flashKey, setFlashKey] = useState(0)

  /** Must stay inside the click handler: iOS grants the camera (and sound) only from a gesture. */
  const handleStart = useCallback(() => {
    const canvas = document.getElementById('camerafeed')
    if (!canvas) {
      console.error('[AR] #camerafeed canvas not found')
      return
    }
    unlockSound()
    setStarted(true)
    startAR(canvas)
  }, [])

  // Lock cue: sound + haptic on the first lock and on re-locks after a real absence
  // (same threshold that replays the entrances), not on every tracking flicker.
  const lostAt = useRef(null)
  const hasLocked = tracking.detectionCount > 0
  useEffect(() => {
    if (tracking.state === TrackingState.TRACKING) {
      if (lostAt.current === null || performance.now() - lostAt.current > TRACKING.replayAfterMs) {
        playSound('lock')
        haptic(20)
      }
      lostAt.current = Infinity // set to a time only when actually lost
    } else if (tracking.state === TrackingState.LOST) {
      lostAt.current = performance.now()
    }
  }, [tracking.state])

  // The card belongs to the physical product: derived here so losing the bottle hides
  // it in the same render.
  const selected = tracking.state === TrackingState.TRACKING ? tracking.selectedNutrient : null

  // Side effects are computed from current values OUTSIDE state updaters, which must
  // stay pure (StrictMode runs them twice).
  const changeSpeed = useCallback((v) => {
    setSpeed(v)
    trackingStore.getScene()?.setSpeed(v)
  }, [])

  /** Dashboard only (developer): toggles effects independently; at least one stays on. */
  const toggleAnimation = useCallback((id) => {
    const next = activeIds.includes(id) ? activeIds.filter(a => a !== id) : [...activeIds, id]
    if (!next.length) return
    setActiveIds(next)
    // No selection to clear: the chips are hidden while a nutrient card is open.
    trackingStore.getScene()?.setActiveAnimations(next)
  }, [activeIds])

  /** Lens menu: one effect at a time (null = none). Picking the playing one replays it. */
  const pickEffect = useCallback((id) => {
    if (id) playSound('select')
    haptic()
    const scene = trackingStore.getScene()
    if (id && id === effectId) {
      scene?.replay([id])
      return
    }
    const next = id ? [...BASE_IDS, id] : BASE_IDS
    trackingStore.setSelectedNutrient(null)
    setEffectId(id)
    setActiveIds(next)
    scene?.setActiveAnimations(next)
  }, [effectId])

  const shutter = useCallback(async () => {
    playSound('snap')
    haptic(15)
    setFlashKey(k => k + 1)
    try {
      setPhoto(await takePhoto())
    } catch (err) {
      console.error('[AR] photo capture failed', err)
    }
  }, [])

  const closeCard = useCallback(() => trackingStore.setSelectedNutrient(null), [])

  if (tracking.state === TrackingState.ERROR) {
    return started
      ? <ErrorFallback message={tracking.error} />
      : <StartScreen onStart={handleStart} unsupportedReason={tracking.error} />
  }

  if (!started) {
    const support = checkSupport()
    return <StartScreen onStart={handleStart} unsupportedReason={support.ok ? null : support.reason} />
  }

  return (
    <main className="pointer-events-none fixed inset-0 overflow-hidden">
      <AROverlay
        tracking={tracking}
        hasLocked={hasLocked}
        cardOpen={Boolean(selected)}
        groups={MENU_GROUPS}
        effectId={effectId}
        onPick={pickEffect}
        onShutter={shutter}
        onExit={() => window.location.reload()}
        topRight={DEBUG_ALLOWED && <DebugToggle on={debugOn} onToggle={() => setDebugOn(v => !v)} />}
      />

      <NutrientCard nutrient={selected} onClose={closeCard} />

      {flashKey > 0 && (
        <div key={flashKey} className="pointer-events-none fixed inset-0 z-40 animate-[snapFlash_0.35s_ease-out_forwards] bg-white" />
      )}
      {photo && <PhotoPreview photo={photo} onClose={() => setPhoto(null)} />}

      {debugOn && (
        <Dashboard
          tracking={tracking}
          animations={ANIMATION_CHOICES}
          activeIds={activeIds}
          onToggleAnimation={toggleAnimation}
          speed={speed}
          onSpeedChange={changeSpeed}
        />
      )}
    </main>
  )
}
