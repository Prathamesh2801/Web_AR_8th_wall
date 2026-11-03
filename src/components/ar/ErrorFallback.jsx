/**
 * Shown instead of a crash when the engine, camera or target assets fail: unsupported
 * browser, denied camera permission, missing targets, engine errors.
 *
 * User-facing copy first; developer detail stays behind a disclosure.
 */
export const ErrorFallback = ({message}) => {
  // Permission denial is the most common failure and it is recoverable, so it gets
  // its own instructions rather than a generic "unavailable".
  const isPermission = /permission|denied|NotAllowed/i.test(message ?? '')

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950">
      <div
        className="mx-auto flex min-h-full w-full max-w-md flex-col px-7"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.75rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
        }}
      >
        <p className="text-[11px] font-semibold tracking-[0.32em] text-white/55">
          SUPRADYN <span className="text-gold">NATURALS</span>
        </p>

        <main className="flex flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {isPermission ? 'Camera access needed' : 'AR is unavailable'}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/65">{message}</p>

          {isPermission && (
            <p className="mt-6 border-y border-white/10 py-4 text-[15px] leading-relaxed text-white/75">
              Tap the <span className="text-white">ⓘ</span> or padlock icon in the address bar,
              turn <span className="text-white">Camera</span> on, then reload.
            </p>
          )}

          <details className="mt-6 text-sm text-white/45">
            <summary className="cursor-pointer">Technical details</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
              <li>The page must be served over HTTPS.</li>
              <li>On iPhone and iPad the camera works only in Safari.</li>
              <li>Some in-app browsers block the camera entirely.</li>
              <li>Targets are generated with <code>npm run generate-targets</code>.</li>
            </ul>
          </details>
        </main>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full rounded-full bg-gold py-4 text-base font-semibold text-neutral-950 transition active:scale-[0.98]"
        >
          Reload and try again
        </button>
      </div>
    </div>
  )
}
