import {EXPERIENCE} from '../../config'

/**
 * StartScreen.jsx
 *
 * The first thing a user sees, for two reasons:
 *  1. UX — explaining before the camera prompt (and saying nothing leaves the phone)
 *     makes people far less likely to deny it.
 *  2. TECHNICAL — iOS Safari grants the camera (and sound) only inside a user gesture,
 *     so the engine is started from this button's click handler.
 *
 * Everything product-specific comes from EXPERIENCE (config.js), so another client's
 * product only changes config. Layout: a full-height column with the button pinned to
 * the bottom; very short screens scroll instead of clipping.
 */
const Icon = ({d}) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const STEPS = [
  ['Allow the camera', 'M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7'],
  ['Point at the bottle', 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M12 9v6M9 12h6'],
  ['Pick an effect & snap', 'M12 3c.6 4.6 1.4 5.4 6 6-4.6.6-5.4 1.4-6 6-.6-4.6-1.4-5.4-6-6 4.6-.6 5.4-1.4 6-6M19 15c.3 1.9.6 2.2 2.5 2.5-1.9.3-2.2.6-2.5 2.5-.3-1.9-.6-2.2-2.5-2.5 1.9-.3 2.2-.6 2.5-2.5'],
]
const CORNERS = ['left-3 top-3 border-l-2 border-t-2 rounded-tl-xl', 'right-3 top-3 border-r-2 border-t-2 rounded-tr-xl',
  'left-3 bottom-3 border-l-2 border-b-2 rounded-bl-xl', 'right-3 bottom-3 border-r-2 border-b-2 rounded-br-xl']

export const StartScreen = ({onStart, unsupportedReason}) => (
  <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-neutral-950">
    {/* Gold light from above, the bottle's deep teal from below. */}
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{
        background:
          'radial-gradient(90% 50% at 50% -5%, rgba(255,212,90,0.16), transparent 70%),' +
          'radial-gradient(100% 55% at 50% 108%, rgba(14,107,94,0.42), transparent 70%)',
      }}
    />

    <div
      className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
      }}
    >
      <header className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-white/60">
          {EXPERIENCE.brand.toUpperCase()} <span className="text-gold">{EXPERIENCE.product.split(' ')[0].toUpperCase()}</span>
        </p>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.2em] text-gold">AR</span>
      </header>

      {/* Hero: the product, framed by the same scan corners the camera view uses. */}
      <div className="relative mx-auto mt-5 aspect-[3/4] h-[27vh] max-h-72 min-h-40">
        <div aria-hidden="true" className="absolute -inset-6 rounded-full bg-gold/20 blur-3xl" />
        <img
          src={EXPERIENCE.heroImage}
          alt={`${EXPERIENCE.brand} ${EXPERIENCE.product}`}
          className="relative h-full w-full rounded-[1.75rem] object-cover shadow-2xl"
        />
        {CORNERS.map(c => <span key={c} aria-hidden="true" className={`absolute h-6 w-6 border-white/90 ${c}`} />)}
        <span aria-hidden="true" className="absolute inset-x-5 top-6 h-px animate-[heroScan_3s_ease-in-out_infinite] bg-gold shadow-[0_0_12px_2px] shadow-gold/70" />
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-neutral-950/85 px-3 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/15">
          <span className="text-gold">✦</span> Comes alive in 3D
        </span>
      </div>

      <main className="flex flex-1 flex-col justify-center pt-7 pb-5">
        <h1 className="text-[2.1rem] font-semibold leading-[1.05] tracking-tight text-balance text-white">{EXPERIENCE.headline}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-white/65">{EXPERIENCE.intro}</p>

        <ol className="mt-5 grid grid-cols-3 gap-2">
          {STEPS.map(([text, d], i) => (
            <li key={text} className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold">
                <Icon d={d} />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[9px] font-bold text-neutral-950">{i + 1}</span>
              </span>
              <span className="text-[12px] font-medium leading-tight text-white/85">{text}</span>
            </li>
          ))}
        </ol>
      </main>

      {unsupportedReason ? (
        <p className="rounded-2xl border border-gold/30 bg-gold/10 p-4 text-sm leading-relaxed text-white/90">
          {unsupportedReason}
        </p>
      ) : (
        <div>
          <button
            type="button"
            onClick={onStart}
            className="w-full rounded-full bg-gold py-4 text-base font-semibold text-neutral-950 shadow-[0_10px_40px_-10px] shadow-gold/60 transition active:scale-[0.98]"
          >
            Start AR experience
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/45">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Runs on your phone. Nothing is recorded or uploaded.
          </p>
        </div>
      )}
    </div>
  </div>
)
