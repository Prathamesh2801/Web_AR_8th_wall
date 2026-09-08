import {useCallback, useState} from 'react'

import {startAR, checkSupport} from './ar/startAR'
import {TrackingState, trackingStore} from './ar/trackingStore'
import {useTracking} from './hooks/useTracking'
import {AROverlay} from './components/ar/AROverlay'
import {DebugControls} from './components/ar/DebugControls'
import {DebugPanel} from './components/ar/DebugPanel'
import {DebugToggle} from './components/ar/DebugToggle'
import {NutrientCard} from './components/ar/NutrientCard'
import {StartScreen} from './components/ar/StartScreen'
import {ErrorFallback} from './components/ar/ErrorFallback'

/**
 * React owns the DOM UI only.
 *
 * The camera canvas lives in index.html and is driven entirely by the 8th Wall
 * pipeline; React neither renders nor re-renders it, and never runs an animation
 * loop. Tracking state arrives through a throttled external store, and nutrient
 * selection arrives from three.js raycasting via the same store.
 */
export default function App() {
  const tracking = useTracking()

  const [started, setStarted] = useState(false)
  const [starting, setStarting] = useState(false)
  const [debugOn, setDebugOn] = useState(false)
  // Independent of `debugOn` so the outline can be toggled while reading the panel.
  const [outlineOn, setOutlineOn] = useState(false)
  const [orbitSpeed, setOrbitSpeed] = useState(1)

  const isTracking = tracking.state === TrackingState.TRACKING

  /**
   * Starts the engine from the button's click handler.
   *
   * This must stay inside the user gesture: iOS Safari only grants camera access
   * from a genuine interaction, so starting on mount (as before) is unreliable there
   * and gives every platform an unexplained permission prompt on arrival.
   */
  const handleStart = useCallback(() => {
    const canvas = document.getElementById('camerafeed')
    if (!canvas) {
      console.error('[AR] #camerafeed canvas not found')
      return
    }
    setStarting(true)
    // Reveal the AR UI immediately; the engine's own loading screen covers the gap
    // while the camera opens.
    setStarted(true)
    startAR(canvas)
  }, [])

  // The card is tied to the physical product. Derived during render so losing the
  // target hides it in the SAME render rather than via a second update.
  const selected = isTracking ? tracking.selectedNutrient : null

  /*
   * The occlusion wireframe rides the debug toggle: it is a verification aid, so it
   * must stay off for normal users. `setOutlineVisible` is a command straight through
   * to three.js and emits nothing, so this cannot cause a render loop.
   */
  const toggleDebug = useCallback(() => setDebugOn(v => !v), [])

  /*
   * The product outline is controlled from inside the debug panel rather than riding
   * the DEBUG button, so it can be switched on and off while inspecting tracking.
   *
   * `setOutlineVisible` is a command straight through to three.js and emits nothing,
   * so this cannot re-render at frame rate. The side effect is derived from the current
   * value OUTSIDE the state updater, because an updater must stay pure — React can
   * invoke it more than once (StrictMode double-invokes it).
   */
  const toggleOutline = useCallback(() => {
    const next = !outlineOn
    setOutlineOn(next)
    trackingStore.setOutlineVisible(next)
  }, [outlineOn])

  /** Same pattern: React holds the displayed value, three.js gets a direct command. */
  const changeOrbitSpeed = useCallback((v) => {
    setOrbitSpeed(v)
    trackingStore.setOrbitSpeed(v)
  }, [])
  const closeCard = useCallback(() => trackingStore.setSelectedNutrient(null), [])

  // Errors raised before the user has started are shown on the start screen itself,
  // so an unsupported browser never leads to a dead black page.
  if (tracking.state === TrackingState.ERROR) {
    return started
      ? <ErrorFallback message={tracking.error} />
      : <StartScreen onStart={handleStart} starting={false} unsupportedReason={tracking.error} />
  }

  if (!started) {
    const support = checkSupport()
    return (
      <StartScreen
        onStart={handleStart}
        starting={starting}
        unsupportedReason={support.ok ? null : support.reason}
      />
    )
  }

  return (
    // pointer-events-none lets touches reach the AR canvas (so nutrient nodes are
    // tappable); individual controls opt back in with pointer-events-auto.
    <main className="pointer-events-none fixed inset-0 overflow-hidden">
      <AROverlay tracking={tracking} cardOpen={Boolean(selected)} />

      <NutrientCard nutrient={selected} onClose={closeCard} />

      {/* Toggling debug only changes UI visibility — the AR pipeline is untouched. */}
      <DebugToggle on={debugOn} onToggle={toggleDebug} />
      {debugOn && (
        <>
          <DebugPanel tracking={tracking} />
          <DebugControls
            outlineOn={outlineOn}
            onToggleOutline={toggleOutline}
            speed={orbitSpeed}
            onSpeedChange={changeOrbitSpeed}
          />
        </>
      )}
    </main>
  )
}
