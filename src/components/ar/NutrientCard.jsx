/**
 * Bottom sheet for a tapped nutrient. Occupies the AR screen's bottom zone in place
 * of the status bar, so the two never overlap.
 *
 * All values come from nutrientData.js, extracted from the production artwork. The
 * copy states presence and amount only — no health claims beyond the packaging.
 */
export const NutrientCard = ({nutrient, onClose}) => {
  if (!nutrient) return null
  const {full, amount, rda, group} = nutrient

  return (
    <div
      className="absolute inset-x-0 z-40 flex justify-center px-4"
      style={{bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)'}}
    >
      <section
        aria-label={full}
        className="glass pointer-events-auto w-full max-w-sm animate-[fadeUp_180ms_ease-out] rounded-3xl p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-[0.2em] text-gold/80">{group.toUpperCase()}</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{full}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg text-white/80 transition active:scale-95"
          >
            ×
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/5 p-3">
            <dt className="text-xs text-white/50">Per tablet</dt>
            <dd className="mt-0.5 tabular-nums text-lg text-white">{amount}</dd>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <dt className="text-xs text-white/50">RDA (men)</dt>
            <dd className="mt-0.5 tabular-nums text-lg text-white">{rda ? `${rda}%` : '—'}</dd>
          </div>
        </dl>

        {!rda && <p className="mt-3 text-xs text-white/50">%RDA not established.</p>}
      </section>
    </div>
  )
}
