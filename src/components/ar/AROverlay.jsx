import {TrackingState} from '../../ar/trackingStore'

/**
 * The normal-user AR interface: title and a one-line status.
 *
 * Interaction now lives on the 3D nutrient nodes themselves, so there is no
 * screen-space action button here. Telemetry stays behind the debug toggle.
 */
export const AROverlay = ({tracking, cardOpen}) => {
  const isTracking = tracking.state === TrackingState.TRACKING

  return (
    <>
      {/* Title block */}
      <div
        className="pointer-events-none absolute inset-x-0 z-30 flex flex-col items-center gap-1"
        style={{top: 'calc(env(safe-area-inset-top, 0px) + 0.85rem)'}}
      >
        <h1 className="text-sm font-semibold tracking-[0.3em] text-white drop-shadow-lg sm:text-base">
          WEB AR
        </h1>
        <p className="text-[9px] font-medium tracking-[0.2em] text-white/45 sm:text-[10px]">
          CYLINDRICAL TARGET POC
        </p>
      </div>

      {/* Status / hint. Hidden while a nutrient card is open so they don't stack. */}
      {!cardOpen && (
        <div
          className="pointer-events-none absolute inset-x-0 z-30 flex flex-col items-center gap-1.5 px-6"
          style={{bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.75rem)'}}
        >
          <div className="flex items-center gap-2">
            {!isTracking && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
            )}
            <p
              className={`text-center text-xs font-medium tracking-[0.15em] drop-shadow sm:text-sm ${
                isTracking ? 'text-emerald-300' : 'text-white/70'
              }`}
            >
              {isTracking ? 'PRODUCT DETECTED' : 'Point your camera at the product'}
            </p>
          </div>

          {isTracking && (
            <p className="text-center text-[10px] tracking-[0.12em] text-white/40">
              Tap a node to learn more
            </p>
          )}
        </div>
      )}
    </>
  )
}
