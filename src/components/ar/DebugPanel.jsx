import {useEffect, useState} from 'react'

import {TrackingState, trackingStore} from '../../ar/trackingStore'

const f = (n, digits = 3) => (typeof n === 'number' ? n.toFixed(digits) : '—')

/*
 * `min-w-0` on the flex children is what prevents horizontal overflow: without it a
 * flex item's automatic minimum size is its CONTENT width, so a long value (a target
 * name, a nutrient's full name) forces the row — and the whole panel — wider than its
 * container instead of wrapping. `break-words` then lets long values wrap.
 */
/*
 * `min-w-0` on the flex children is what prevents horizontal overflow: a flex item's
 * automatic minimum size is its CONTENT width, so a long value (a nutrient's full name,
 * a ring's rotation triple) would otherwise force the row — and the panel — wider than
 * its container. The label is allowed to shrink too rather than `shrink-0`, so a long
 * value never pushes itself out of the panel; `wrap-break-word` lets both wrap.
 */
const Row = ({label, value, accent}) => (
  <div className="flex items-baseline justify-between gap-2 leading-tight">
    <span className="min-w-0 wrap-break-word text-white/45">{label}</span>
    <span className={`min-w-0 wrap-break-word text-right font-mono ${accent ?? 'text-white/90'}`}>
      {value}
    </span>
  </div>
)

const stateColor = {
  [TrackingState.BOOTING]: 'text-white/60',
  [TrackingState.LOADING]: 'text-amber-300',
  [TrackingState.SEARCHING]: 'text-amber-300',
  [TrackingState.FOUND]: 'text-emerald-300',
  [TrackingState.TRACKING]: 'text-emerald-300',
  [TrackingState.LOST]: 'text-rose-300',
  [TrackingState.ERROR]: 'text-rose-400',
}

/**
 * Toggleable observability panel.
 *
 * Values come from the throttled tracking store (~8Hz), NOT from the render loop —
 * tracking itself continues at full engine frequency regardless of this panel.
 *
 * Pose fields intentionally read "—" when not tracking, so stale values can never be
 * mistaken for live ones. Tracking failures are shown, never hidden.
 */
export const DebugPanel = ({tracking}) => {
  const {state, targetName, targetType, position, rotation, scale, geometry, fps,
    detectionCount, selectedNutrient} = tracking

  /*
   * The orbital block reads straight out of three.js, which is NOT part of the tracking
   * store — so nothing re-renders this component when those values change. Previously it
   * was read once per render and simply went stale (it only refreshed when the store
   * happened to emit for an unrelated reason, and froze entirely once tracking stopped).
   *
   * A 4Hz ticker while the panel is open keeps it live. This exists ONLY for the debug
   * panel: it is unmounted with the panel, so a normal user never pays for it, and it
   * never touches the AR loop.
   */
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 250)
    return () => clearInterval(id)
  }, [])

  const orbital = trackingStore.getDebugInfo()

  return (
    <div
      /*
       * pointer-events-auto is REQUIRED for the panel to scroll. Its parent <main> is
       * pointer-events-none (so taps reach the AR canvas and 3D nodes), and this panel
       * previously inherited that — which meant `overflow-y-auto` had no effect,
       * because touches passed straight through to the canvas instead of scrolling it.
       * `overscroll-contain` stops a scroll at either end from chaining to the page.
       */
      /*
       * Width is capped against the VIEWPORT (`max-w-[calc(100vw-1.5rem)]`), not just
       * set to a fixed `w-62`: on a narrow phone a fixed width plus the left offset
       * pushed the panel past the right edge, which is what produced the horizontal
       * scrolling. `overflow-x-hidden` is the backstop, so only vertical scrolling
       * remains possible.
       */
      className="pointer-events-auto absolute left-3 z-40 max-h-[58vh] w-68 max-w-[calc(100vw-1.5rem)] touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-white/10 bg-black/80 p-3 text-[11px] text-white shadow-xl backdrop-blur-md"
      // max-h caps at 58vh so the panel cannot run underneath the DebugControls panel
      // pinned to the bottom of the screen.
      style={{top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)'}}
    >
      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
        <span className="font-semibold tracking-wide text-white/70">AR DEBUG</span>
        <span className="font-mono text-white/40">{fps} fps</span>
      </div>

      <div className="space-y-1">
        <Row label="Status" value={state} accent={stateColor[state]} />
        <Row label="Target" value={targetName ?? '—'} />
        <Row label="Type" value={targetType ?? '—'} />
        <Row label="Detections" value={detectionCount} />
        <Row label="Selected" value={selectedNutrient?.full ?? '—'} />
      </div>

      {/* Controls live in DebugControls; this panel stays read-only. */}

      {orbital && (
        <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
          <div className="mb-1 text-white/35">SCENE DEBUG</div>

          {/* Which animations config.js switched on. Occlusion is reported separately
              below because it is independent of them. */}
          <Row label="Animations" value={orbital.animations ?? 'none'} />

          {/* Orbit rows only exist while an orbital animation is running. */}
          {orbital.ringCount != null && (
            <>
              <Row label="Nutrients" value={orbital.nutrientCount} />
              <Row label="Connections" value={orbital.connectionCount} />
              <Row label="Rings" value={orbital.ringCount} />
              {/* speedScale is the automatic selection slow-down; userSpeed is the
                  multiplier set in DebugControls. They multiply together. */}
              <Row label="Speed (auto)" value={`${orbital.speedScale}x`} />
              <Row label="Speed (user)" value={`${orbital.userSpeed ?? 1}x`} />
            </>
          )}

          {/* One block per ring: radii, tilt and travel direction as actually built. */}
          {orbital.rings?.map((r, i) => (
            <div key={i} className="mt-1.5 rounded border border-white/8 bg-white/4 p-1.5">
              <div className="mb-0.5 text-white/35">
                RING {i} · {r.members} node{r.members === 1 ? '' : 's'} ·{' '}
                {r.dir > 0 ? 'CW' : 'CCW'}
              </div>
              <Row label="rx / rz" value={`${r.rx} / ${r.rz}`} />
              <Row label="rot X/Y/Z" value={r.rot?.join(' / ') ?? '—'} />
            </div>
          ))}
          <Row
            label="Occlusion"
            value={orbital.occlusionEnabled ? 'ON' : 'OFF'}
            accent={orbital.occlusionEnabled ? 'text-emerald-300' : 'text-rose-300'}
          />
        </div>
      )}

      <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
        <div className="mb-1 text-white/35">POSITION</div>
        <Row label="x" value={f(position?.x)} />
        <Row label="y" value={f(position?.y)} />
        <Row label="z" value={f(position?.z)} />
      </div>

      <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
        <div className="mb-1 text-white/35">ROTATION</div>
        <Row label="x" value={f(rotation?.x)} />
        <Row label="y" value={f(rotation?.y)} />
        <Row label="z" value={f(rotation?.z)} />
        <Row label="w" value={f(rotation?.w)} />
      </div>

      <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
        <div className="mb-1 text-white/35">SCALE</div>
        {/* The engine reports a single uniform scale factor for image targets;
            it is shown on all three axes because it is applied uniformly. */}
        <Row label="x" value={f(scale)} />
        <Row label="y" value={f(scale)} />
        <Row label="z" value={f(scale)} />
      </div>

      {/* Only rendered when the engine actually supplies curved geometry.
          Nothing here is fabricated — absent fields simply do not appear. */}
      {geometry && (
        <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
          <div className="mb-1 text-white/35">CYLINDER GEOMETRY</div>
          <Row label="height" value={f(geometry.height)} />
          <Row label="radiusTop" value={f(geometry.radiusTop)} />
          <Row label="radiusBottom" value={f(geometry.radiusBottom)} />
          <Row label="arcStart" value={f(geometry.arcStartRadians, 4)} />
          <Row label="arcLength" value={f(geometry.arcLengthRadians, 4)} />
        </div>
      )}
    </div>
  )
}
