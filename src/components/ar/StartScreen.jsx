/**
 * StartScreen.jsx
 *
 * The first thing a user sees. It exists for two reasons:
 *
 * 1. UX — arriving straight into a camera permission prompt with no context is the
 *    single biggest cause of people denying it. Explaining first, then asking, is
 *    both calmer and converts far better.
 *
 * 2. TECHNICAL — iOS Safari only grants camera access from inside a user gesture.
 *    Starting the engine from this button's click handler keeps the request within
 *    that gesture, which is also the most reliable path on Android.
 *
 * Copy is intentionally product-agnostic so the same screen works for any target.
 * Sized for phones, tablets and desktop with fluid type and safe-area padding.
 */

const Step = ({icon, children}) => (
  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 p-3">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm">
      {icon}
    </span>
    {/* min-w-0 lets the text wrap instead of forcing the row wider than its parent. */}
    <p className="min-w-0 text-[13px] leading-snug text-white/70">{children}</p>
  </div>
)

export const StartScreen = ({onStart, starting, unsupportedReason}) => (
  <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-neutral-950">
    {/* Soft ambient wash so the panel doesn't sit on flat black */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-70"
      style={{
        background:
          'radial-gradient(60% 45% at 50% 18%, rgba(56,189,248,0.16), transparent 70%),' +
          'radial-gradient(55% 40% at 50% 92%, rgba(16,185,129,0.12), transparent 70%)',
      }}
    />

    {/*
      Layout: the outer element is a plain block with padding, and the inner panel is
      centred with `mx-auto`. It is deliberately NOT a flex container — as a direct
      child of a `flex flex-col items-center` parent, a `w-full` button resolves its
      width against the parent rather than the shrink-wrapped flex track, which pushed
      it past the right edge. Block layout + mx-auto avoids that entirely.
    */}
    <div
      className="relative flex min-h-full flex-col justify-center px-5 py-10 sm:px-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)',
      }}
    >
      <div className="mx-auto w-full max-w-sm text-center sm:max-w-md">
        {/* Brand / title — product-agnostic */}
        <p className="text-[10px] font-medium tracking-[0.32em] text-white/40 sm:text-[11px]">
          WEB AR EXPERIENCE
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Scan to explore
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/55 sm:max-w-sm sm:text-base">
          Point your camera at the product to reveal it in augmented reality.
        </p>

        {/* What will happen — removes the surprise before the prompt appears */}
        <div className="mt-8 space-y-3 text-left">
          <Step icon="📷">
            We&apos;ll ask for camera access — tap <span className="text-white">Allow</span>
          </Step>
          <Step icon="📦">Hold the product upright, label facing the camera</Step>
          <Step icon="✨">Tap anything that appears to learn more</Step>
        </div>

        {unsupportedReason ? (
          <div className="mt-8 rounded-xl border border-amber-400/25 bg-amber-500/10 p-4">
            <p className="text-sm leading-relaxed text-amber-100/90">{unsupportedReason}</p>
          </div>
        ) : (
          <>
            {/*
              Layout note: the label is wrapped in its own <span> and the row uses
              min-w-0, so a long translation wraps inside the button instead of
              stretching it past the container.
            */}
            {/*
              The button is a BLOCK element, not a flex item of the page column, and
              its inner row is a separate <span>. A `w-full` flex child can resolve its
              width against the wrong box and spill past the right edge; `display:block`
              + `width:100%` on a border-box element cannot exceed its parent.
              `max-width:100%` is belt-and-braces for the same reason.
            */}
            <button
              type="button"
              onClick={onStart}
              disabled={starting}
              className="mt-8 block mx-auto w-[80%] rounded-2xl bg-white px-5 py-4 text-base font-semibold text-neutral-900 shadow-lg transition active:scale-[0.98] disabled:opacity-60"
            >
              <span className="flex items-center justify-center gap-2.5">
                {starting && (
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-neutral-400 border-t-neutral-900" />
                )}
                {starting ? 'Starting camera…' : 'Start experience'}
              </span>
            </button>

            <p className="mx-auto mt-4 max-w-xs text-[11px] leading-relaxed text-white/30">
              Camera is used only to detect the product. Nothing is recorded or uploaded.
            </p>
          </>
        )}
      </div>
    </div>
  </div>
)
