import {AnimationId} from '../../config'
import {TrackingState} from '../../ar/trackingStore'

/**
 * The AR screen's 2D layer, in three fixed zones so nothing ever stacks:
 *   top     debug button only (`topRight`, shown with ?debug)
 *   centre  scanning reticle — only while the bottle is not in view
 *   bottom  status, animation chips, hint — replaced by the nutrient card when open
 *
 * The root is pointer-events-none so taps reach the canvas (3D nodes are tappable);
 * controls opt back in with pointer-events-auto.
 */
const STATUS = {
  [TrackingState.BOOTING]: 'Starting camera…',
  [TrackingState.LOADING]: 'Preparing…',
  [TrackingState.SEARCHING]: 'Point at the bottle’s label',
  [TrackingState.LOST]: 'Bring the bottle back into view',
}

/** Corner brackets of the reticle: [position classes, border classes]. */
const CORNERS = [
  ['left-0 top-0', 'border-l-2 border-t-2 rounded-tl-2xl'],
  ['right-0 top-0', 'border-r-2 border-t-2 rounded-tr-2xl'],
  ['left-0 bottom-0', 'border-l-2 border-b-2 rounded-bl-2xl'],
  ['right-0 bottom-0', 'border-r-2 border-b-2 rounded-br-2xl'],
]

export const AROverlay = ({tracking, cardOpen, animations, activeIds, onToggleAnimation, topRight}) => {
  const isTracking = tracking.state === TrackingState.TRACKING
  const showsNutrients = activeIds.includes(AnimationId.NUTRIENT_ORBIT)

  return (
    <>
      {/* Top-right slot: the debug button with ?debug, otherwise nothing. The camera
          view stays clean; the bottle is the brand. */}
      {topRight && (
        <div
          className="absolute right-4 z-30"
          style={{top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)'}}
        >
          {topRight}
        </div>
      )}

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

      {/* Bottom bar */}
      {!cardOpen && (
        <div
          className="absolute inset-x-0 z-30 flex flex-col items-center gap-3 px-4"
          style={{bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)'}}
        >
          <div className="glass flex items-center gap-2 rounded-full px-4 py-2" role="status">
            <span
              className={`h-2 w-2 rounded-full ${isTracking ? 'bg-teal' : 'animate-pulse bg-gold'}`}
            />
            <span className="text-sm font-medium text-white/90">
              {isTracking
                ? (showsNutrients ? 'Tap a nutrient to learn more' : 'Bottle locked')
                : STATUS[tracking.state]}
            </span>
          </div>

          {animations.length > 1 && (
            <div className="pointer-events-auto flex flex-wrap justify-center gap-2" role="group" aria-label="Effects">
              {animations.map(({id, label}) => {
                const on = activeIds.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggleAnimation(id)}
                    className={`min-h-10 rounded-full border px-4 text-sm font-medium backdrop-blur-md transition active:scale-95 ${
                      on
                        ? 'border-gold/50 bg-gold/20 text-white'
                        : 'border-white/15 bg-black/40 text-white/55'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
