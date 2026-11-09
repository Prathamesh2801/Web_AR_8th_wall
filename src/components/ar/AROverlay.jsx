import {AnimationId, EXPERIENCE} from '../../config'
import {TrackingState} from '../../ar/trackingStore'
import {LensMenu} from './LensMenu'

/**
 * The AR screen's 2D layer (Penpot "02 · Lens Menu"):
 *   top     ✕ exit · status pill · debug button (`topRight`, ?debug only)
 *   centre  scanning reticle, only while the bottle is not in view
 *   bottom  before the first lock: a hint card; after it: the lens menu (dimmed while
 *           the bottle is lost, keeping the choice). Hidden while a nutrient card is open.
 *
 * The root is pointer-events-none so taps reach the canvas (3D nodes are tappable);
 * controls opt back in with pointer-events-auto.
 */
const STATUS = {
  [TrackingState.BOOTING]: 'Starting camera…',
  [TrackingState.LOADING]: 'Preparing…',
  [TrackingState.SEARCHING]: 'Looking for the bottle',
  [TrackingState.LOST]: 'Find the bottle again',
}

/** Corner brackets of the reticle: [position classes, border classes]. */
const CORNERS = [
  ['left-0 top-0', 'border-l-2 border-t-2 rounded-tl-2xl'],
  ['right-0 top-0', 'border-r-2 border-t-2 rounded-tr-2xl'],
  ['left-0 bottom-0', 'border-l-2 border-b-2 rounded-bl-2xl'],
  ['right-0 bottom-0', 'border-r-2 border-b-2 rounded-br-2xl'],
]

export const AROverlay = ({tracking, hasLocked, cardOpen, groups, effectId, onPick, onShutter, onExit, topRight}) => {
  const isTracking = tracking.state === TrackingState.TRACKING
  const top = {top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)'}

  return (
    <>
      <button
        type="button"
        aria-label="Exit AR"
        onClick={onExit}
        className="glass pointer-events-auto absolute left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full text-white"
        style={top}
      >
        ✕
      </button>

      <div className="absolute inset-x-0 z-20 flex justify-center" style={top}>
        <div className="glass mt-1 flex items-center gap-2 rounded-full px-4 py-1.5" role="status">
          <span
            className={`h-2 w-2 rounded-full ${
              isTracking ? 'bg-teal' : hasLocked ? 'animate-pulse bg-[#F0A040]' : 'animate-pulse bg-white'
            }`}
          />
          <span className="text-xs font-semibold text-white/90">
            {isTracking
              ? (effectId === AnimationId.NUTRIENT_ORBIT ? 'Tap a nutrient to learn more' : 'Bottle locked')
              : STATUS[tracking.state]}
          </span>
        </div>
      </div>

      {topRight && <div className="absolute right-4 z-30" style={top}>{topRight}</div>}

      {/* Reticle: shows where to put the bottle; gone the moment it is found. */}
      {!isTracking && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" aria-hidden="true">
          <div className="relative h-64 w-44 overflow-hidden">
            {CORNERS.map(([pos, border]) => (
              <span key={pos} className={`absolute h-8 w-8 border-white/80 ${pos} ${border}`} />
            ))}
            <span className="absolute inset-x-3 top-0 h-px animate-[scan_2.4s_ease-in-out_infinite] bg-gold shadow-[0_0_12px_2px] shadow-gold/60" />
          </div>
        </div>
      )}

      {!hasLocked && (
        <div
          className="glass absolute inset-x-4 z-30 mx-auto max-w-sm rounded-3xl px-5 py-5 text-center"
          style={{bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)'}}
        >
          <p className="text-base font-bold text-white">Point at {EXPERIENCE.lookFor}</p>
          <p className="mt-1 text-xs font-medium text-white/65">Fit the whole bottle in the frame, about 25 cm away</p>
        </div>
      )}

      {hasLocked && !cardOpen && (
        <LensMenu groups={groups} effectId={effectId} onPick={onPick} onShutter={onShutter} dimmed={!isTracking} />
      )}
    </>
  )
}
