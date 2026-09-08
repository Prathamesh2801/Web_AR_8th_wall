/**
 * Information card for a tapped nutrient node.
 *
 * All values come from nutrientData.js, extracted from the production artwork.
 * The copy states presence and amount only — no health claims beyond the packaging.
 *
 * Styled to read as part of the AR scene rather than a generic web modal.
 */
export const NutrientCard = ({nutrient, onClose}) => {
  if (!nutrient) return null

  const {full, amount, rda, group} = nutrient

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4"
      style={{bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)'}}
    >
      <div className="pointer-events-auto w-full max-w-[17rem] animate-[fadeUp_180ms_ease-out] rounded-2xl border border-white/15 bg-neutral-950/80 p-4 text-center shadow-2xl backdrop-blur-xl">
        <p className="text-[9px] font-medium tracking-[0.22em] text-white/40">
          {group.toUpperCase()}
        </p>

        <h2 className="mt-1 text-lg font-semibold tracking-wide text-white">{full}</h2>

        <div className="mt-3 flex items-center justify-center gap-4 text-sm">
          <div>
            <div className="font-mono text-cyan-200">{amount}</div>
            <div className="text-[9px] tracking-wider text-white/35">PER TABLET</div>
          </div>
          {rda && (
            <div className="border-l border-white/10 pl-4">
              <div className="font-mono text-cyan-200">{rda}%</div>
              <div className="text-[9px] tracking-wider text-white/35">RDA (MEN)</div>
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-white/50">
          {rda
            ? 'Present in this product.'
            : 'Present in this product. %RDA not established.'}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-3.5 w-full rounded-xl border border-white/20 bg-white/10 py-2.5 text-[11px] font-semibold tracking-[0.18em] text-white transition active:scale-[0.98] active:bg-white/20"
        >
          CLOSE
        </button>
      </div>
    </div>
  )
}
