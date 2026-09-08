/**
 * Small, deliberately secondary developer control.
 *
 * Toggling only flips UI visibility — it never touches the AR pipeline, so tracking
 * is unaffected.
 */
export const DebugToggle = ({on, onToggle}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={on}
    className={`pointer-events-auto fixed right-3 z-50 rounded-md border px-2.5 py-1.5 text-[10px] font-medium tracking-widest backdrop-blur-md transition-colors ${
      on
        ? 'border-cyan-300/40 bg-cyan-400/20 text-cyan-100'
        : 'border-white/15 bg-black/40 text-white/50 hover:text-white/80'
    }`}
    // Sits below the browser chrome and respects the notch / safe area.
    style={{top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)'}}
  >
    DEBUG
  </button>
)
