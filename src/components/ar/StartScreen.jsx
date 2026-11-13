import {useEffect, useState} from 'react'

import {onPreload} from '../../assets'
import {EXPERIENCE} from '../../config'
import {BottleModel} from './BottleModel'

/**
 * StartScreen.jsx
 *
 * The first thing a user sees, for two reasons:
 *  1. UX — the product, big, and one line saying nothing leaves the phone (that line makes
 *     people far less likely to deny the camera prompt). Nothing else: no one reads it.
 *  2. TECHNICAL — iOS Safari grants the camera (and sound) only inside a user gesture,
 *     so the engine is started from this button's click handler.
 *
 * Everything product-specific comes from EXPERIENCE (config.js). Layout: a full-height
 * column, the product taking the free space, the button pinned to the bottom.
 *
 * The button doubles as the loading bar: every effect's files preload while this screen is
 * up (assets.js), and Start unlocks when they are in, so no effect downloads mid-AR.
 */
const CORNERS = ['left-3 top-3 border-l-2 border-t-2 rounded-tl-xl', 'right-3 top-3 border-r-2 border-t-2 rounded-tr-xl',
  'left-3 bottom-3 border-l-2 border-b-2 rounded-bl-xl', 'right-3 bottom-3 border-r-2 border-b-2 rounded-br-xl']

export const StartScreen = ({onStart, unsupportedReason}) => {
  const [load, setLoad] = useState({progress: 0, done: false})
  useEffect(() => onPreload(setLoad), [])
  const pct = Math.round(load.progress * 100)
  return (
  <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-neutral-950">
    {/* Accent light from above, the bottle's deep teal from below. */}
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{
        background:
          'radial-gradient(90% 50% at 50% -5%, color-mix(in srgb, var(--color-gold) 16%, transparent), transparent 70%),' +
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

      {/* Hero: the product, as big as the screen allows, in the camera view's scan corners. */}
      <div className="flex flex-1 items-center justify-center py-6">
        <div className="relative aspect-[3/4] h-[54vh] max-h-[520px] min-h-56 max-w-full">
          <div aria-hidden="true" className="absolute -inset-6 rounded-full bg-gold/20 blur-3xl" />
          {EXPERIENCE.model ? (
            <BottleModel className="h-full w-full" />
          ) : EXPERIENCE.heroImage ? (
            <img
              src={EXPERIENCE.heroImage}
              alt={`${EXPERIENCE.brand} ${EXPERIENCE.product}`}
              className="relative h-full w-full rounded-[1.75rem] object-cover shadow-2xl"
            />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center rounded-[1.75rem] bg-white/5 ring-1 ring-white/10">
              {EXPERIENCE.logo && <img src={EXPERIENCE.logo} alt={EXPERIENCE.brand} className="w-3/4" />}
            </div>
          )}
          {CORNERS.map(c => <span key={c} aria-hidden="true" className={`pointer-events-none absolute h-7 w-7 border-white/90 ${c}`} />)}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-6 h-px animate-[heroScan_3s_ease-in-out_infinite] bg-gold shadow-[0_0_12px_2px] shadow-gold/70" />
        </div>
      </div>

      <h1 className="pb-6 text-center text-[2.1rem] font-semibold leading-[1.05] tracking-tight text-balance text-white">{EXPERIENCE.headline}</h1>

      {unsupportedReason ? (
        <p className="rounded-2xl border border-gold/30 bg-gold/10 p-4 text-sm leading-relaxed text-white/90">
          {unsupportedReason}
        </p>
      ) : (
        <div>
          <button
            type="button"
            onClick={onStart}
            disabled={!load.done}
            aria-busy={!load.done}
            className={`relative w-full overflow-hidden rounded-full py-4 text-base font-semibold transition active:scale-[0.98] ${
              load.done ? 'bg-gold text-neutral-950 shadow-[0_10px_40px_-10px] shadow-gold/60' : 'bg-gold/15 text-white/85'
            }`}
          >
            {!load.done && (
              <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-gold/35 transition-[width] duration-300" style={{width: `${pct}%`}} />
            )}
            <span className="relative">{load.done ? 'Start AR experience' : `Getting ready… ${pct}%`}</span>
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/45">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Nothing is recorded or uploaded.
          </p>
        </div>
      )}
    </div>
  </div>
  )
}
