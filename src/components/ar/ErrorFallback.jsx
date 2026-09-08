/**
 * Shown instead of a crash when the engine, camera, or target assets fail.
 * Covers: unsupported browser, denied camera permission, missing target metadata,
 * and engine initialisation/runtime errors.
 *
 * User-facing copy comes first; developer detail stays behind a disclosure so a
 * normal user is never shown an npm command.
 */
export const ErrorFallback = ({message}) => {
  // Permission denial is by far the most common failure, and it is recoverable —
  // so it gets its own instructions rather than a generic "unavailable".
  const isPermission = /permission|denied|NotAllowed/i.test(message ?? '')

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950">
      <div
        className="flex min-h-full flex-col justify-center px-5 py-10 sm:px-6"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
        }}
      >
        <div className="mx-auto w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-3xl">
            {isPermission ? '📷' : '⚠️'}
          </div>

          <h1 className="mb-2 text-xl font-semibold text-white">
            {isPermission ? 'Camera access needed' : 'AR unavailable'}
          </h1>

          <p className="mb-6 text-sm leading-relaxed text-white/60">{message}</p>

          {isPermission && (
            <div className="mb-6 space-y-2.5 rounded-xl border border-white/10 bg-white/4 p-4 text-left">
              <p className="text-[11px] font-medium tracking-widest text-white/35">
                HOW TO FIX
              </p>
              <p className="text-[13px] leading-relaxed text-white/65">
                Tap the padlock or <span className="text-white">ⓘ</span> icon in the address
                bar, turn <span className="text-white">Camera</span> on, then reload.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="block w-full max-w-full rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-neutral-900 shadow-lg transition active:scale-[0.98]"
          >
            Reload and try again
          </button>

          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs text-white/30 hover:text-white/50">
              Technical details
            </summary>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/40">
              <li>• The page must be served over HTTPS.</li>
              <li>• On iPhone and iPad the camera works only in Safari.</li>
              <li>• Some in-app browsers block camera access entirely.</li>
              <li>
                • Target assets are generated with{' '}
                <code className="text-white/60">npm run generate-target</code>.
              </li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  )
}
