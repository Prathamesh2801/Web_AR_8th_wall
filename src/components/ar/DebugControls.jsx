/**
 * DebugControls.jsx
 *
 * Floating developer controls, separate from the read-only DebugPanel.
 *
 * The split is deliberate: DebugPanel REPORTS state and is safe to scroll past, while
 * this panel CHANGES the scene. Keeping them apart means the controls stay reachable at
 * the bottom of the screen (thumb range on a phone) while the telemetry sits top-left,
 * and neither has to scroll to reach the other.
 *
 * Every control here drives three.js through a command on the tracking store. None of
 * them writes to the store's snapshot, so moving the speed slider cannot re-render the
 * AR view or disturb tracking.
 */
const SPEED_STEPS = [0, 0.25, 0.5, 1, 1.5, 2, 3]

export const DebugControls = ({outlineOn, onToggleOutline, speed, onSpeedChange}) => (
  <div
    className="pointer-events-auto absolute right-3 z-40 w-52 max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/10 bg-black/80 p-3 text-[11px] text-white shadow-xl backdrop-blur-md"
    style={{bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)'}}
  >
    <div className="mb-2 border-b border-white/10 pb-1.5 font-semibold tracking-wide text-white/70">
      CONTROLS
    </div>

    <button
      type="button"
      onClick={onToggleOutline}
      aria-pressed={outlineOn}
      className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 transition-colors ${
        outlineOn
          ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100'
          : 'border-white/15 bg-white/5 text-white/60'
      }`}
    >
      <span>Product outline</span>
      <span className="font-mono">{outlineOn ? 'ON' : 'OFF'}</span>
    </button>

    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-white/45">Orbit speed</span>
        <span className="font-mono text-white/90">{speed}&times;</span>
      </div>

      {/*
        Discrete steps rather than a continuous range input: a native slider is fiddly
        on a phone and 0 / 1x / 2x are the values actually wanted while debugging.
        0 freezes the orbit, which is the most useful setting for inspecting geometry.
      */}
      <div className="grid grid-cols-4 gap-1">
        {SPEED_STEPS.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onSpeedChange(v)}
            aria-pressed={speed === v}
            className={`rounded border px-1 py-1 font-mono transition-colors ${
              speed === v
                ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100'
                : 'border-white/15 bg-white/5 text-white/55'
            }`}
          >
            {v === 0 ? '||' : `${v}x`}
          </button>
        ))}
      </div>
    </div>
  </div>
)
