import {useCallback, useState, useSyncExternalStore} from 'react'

import {ANIMATIONS, DEBUG, enabledAnimationIds} from './config'
import {startAR, checkSupport} from './ar/startAR'
import {TrackingState, trackingStore} from './ar/trackingStore'
import {AROverlay} from './components/ar/AROverlay'
import {DebugPanel} from './components/ar/DebugPanel'
import {DebugToggle} from './components/ar/DebugToggle'
import {NutrientCard} from './components/ar/NutrientCard'
import {StartScreen} from './components/ar/StartScreen'
import {ErrorFallback} from './components/ar/ErrorFallback'

/** Chips shown in the AR screen: every enabled animation, in config order. */
const ANIMATION_CHOICES = enabledAnimationIds().map(id => ({id, label: ANIMATIONS[id].label ?? id}))
const INITIAL_ACTIVE = ANIMATION_CHOICES.filter(a => ANIMATIONS[a.id].active).map(a => a.id)

/** Developer UI is opt-in per visit: open the app with `?debug`. */
const DEBUG_ALLOWED = new URLSearchParams(window.location.search).has('debug')

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
  const [activeIds, setActiveIds] = useState(INITIAL_ACTIVE)

  /** Must stay inside the click handler: iOS grants the camera only from a gesture. */
  const handleStart = useCallback(() => {
    const canvas = document.getElementById('camerafeed')
    if (!canvas) {
      console.error('[AR] #camerafeed canvas not found')
      return
    }
    setStarted(true)
    startAR(canvas)
  }, [])

  // The card belongs to the physical product: derived here so losing the bottle hides
  // it in the same render.
  const selected = tracking.state === TrackingState.TRACKING ? tracking.selectedNutrient : null

  // Side effects are computed from current values OUTSIDE state updaters, which must
  // stay pure (StrictMode runs them twice).
  const changeSpeed = useCallback((v) => {
    setSpeed(v)
    trackingStore.getScene()?.setSpeed(v)
  }, [])

  /** Chips toggle independently, but at least one effect always stays on. */
  const toggleAnimation = useCallback((id) => {
    const next = activeIds.includes(id) ? activeIds.filter(a => a !== id) : [...activeIds, id]
    if (!next.length) return
    setActiveIds(next)
    // No selection to clear: the chips are hidden while a nutrient card is open.
    trackingStore.getScene()?.setActiveAnimations(next)
  }, [activeIds])

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
        cardOpen={Boolean(selected)}
        animations={ANIMATION_CHOICES}
        activeIds={activeIds}
        onToggleAnimation={toggleAnimation}
        topRight={DEBUG_ALLOWED && <DebugToggle on={debugOn} onToggle={() => setDebugOn(v => !v)} />}
      />

      <NutrientCard nutrient={selected} onClose={closeCard} />

      {debugOn && (
        <DebugPanel
          tracking={tracking}
          speed={speed}
          onSpeedChange={changeSpeed}
        />
      )}
    </main>
  )
}
