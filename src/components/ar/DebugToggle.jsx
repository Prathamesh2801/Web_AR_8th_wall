/**
 * Developer-only switch for the dashboard. Rendered only when the URL has `?debug`
 * (see App.jsx), so normal users never see it. Never touches the AR pipeline.
 */
export const DebugToggle = ({on, onToggle}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={on}
    className={`pointer-events-auto min-h-8 rounded-full border px-3 text-[11px] font-medium tracking-widest backdrop-blur-md transition-colors ${
      on ? 'border-gold/50 bg-gold/20 text-white' : 'border-white/15 bg-black/40 text-white/60'
    }`}
  >
    TUNE
  </button>
)
