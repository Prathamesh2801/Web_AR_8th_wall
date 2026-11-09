import {useEffect, useLayoutEffect, useRef, useState} from 'react'

import {haptic} from '../../sound'

/*
 * Snapchat-style lens menu (Penpot "02 · Lens Menu"):
 *   tray      styles (variants) of the selected group
 *   carousel  [no effect, ...groups], dragged freely; whatever stops under the
 *             shutter ring is the ONE effect playing
 *   ring      tap = take a photo (with or without an effect)
 *
 * The carousel is a native scroller with CSS scroll-snap, so the drag follows the finger
 * with the platform's own momentum and snap on iOS and Android. The choice is committed
 * when scrolling settles; while dragging, only the visuals and a haptic tick follow.
 */
const SLOT = 88 // px per carousel item; the scroll position is index * SLOT
const SETTLE_MS = 140 // no scroll events for this long = the snap has finished
const SERIF = {fontFamily: 'Georgia, "Times New Roman", serif'} // inline: XRExtras' `*` rule beats utilities

const ICONS = {
  type: () => <span className="text-2xl leading-none font-semibold text-white" style={SERIF}>Aa</span>,
  elements: () => (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
      <ellipse cx="20" cy="20" rx="16" ry="7" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.6" transform="rotate(-12 20 20)" />
      <rect x="16.5" y="11" width="7" height="17" rx="2.5" fill="white" fillOpacity="0.9" />
      <circle cx="5" cy="23" r="3" fill="#FFD45A" />
      <circle cx="31" cy="13.5" r="2.6" fill="#7FE3D3" />
      <circle cx="27" cy="27" r="2.6" fill="#F08A5D" />
    </svg>
  ),
  glow: () => (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
      <circle cx="20" cy="20" r="12" fill="#FFD45A" fillOpacity="0.35" />
      <path d="M20 7 C21.5 18.5 21.5 18.5 33 20 C21.5 21.5 21.5 21.5 20 33 C18.5 21.5 18.5 21.5 7 20 C18.5 18.5 18.5 18.5 20 7 Z" fill="#FFF8D6" />
    </svg>
  ),
}

export const LensMenu = ({groups, effectId, onPick, onShutter, dimmed}) => {
  const selIdx = groups.findIndex(g => g.variants.some(v => v.id === effectId)) + 1 // 0 = no effect
  const group = groups[selIdx - 1]
  const scroller = useRef(null)
  const settle = useRef(null)
  const [centred, setCentred] = useState(selIdx) // follows the finger while dragging

  // Open on the current choice without animating.
  useLayoutEffect(() => {
    scroller.current.scrollLeft = selIdx * SLOT
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Choice changed elsewhere (tray, replay): glide there.
  useEffect(() => {
    const el = scroller.current
    if (Math.round(el.scrollLeft / SLOT) !== selIdx) el.scrollTo({left: selIdx * SLOT, behavior: 'smooth'})
  }, [selIdx])

  useEffect(() => () => clearTimeout(settle.current), [])

  const onScroll = () => {
    const i = Math.max(0, Math.min(groups.length, Math.round(scroller.current.scrollLeft / SLOT)))
    if (i !== centred) {
      setCentred(i)
      haptic(6)
    }
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      if (i !== selIdx) onPick(i === 0 ? null : groups[i - 1].variants[0].id)
    }, SETTLE_MS)
  }

  const tap = (i) => {
    if (i === centred) onShutter()
    else scroller.current.scrollTo({left: i * SLOT, behavior: 'smooth'})
  }

  const items = [{id: 'none', label: ''}, ...groups]

  return (
    <div
      className={`pointer-events-auto absolute inset-x-0 bottom-0 z-30 transition-opacity duration-300 ${dimmed ? 'opacity-40' : ''}`}
      style={{paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)'}}
    >
      <div className="absolute inset-x-0 bottom-0 -z-10 h-64 bg-linear-to-b from-transparent via-black/60 to-black/85" />

      {/* Tray: styles of the selected group */}
      <div className="mb-3 h-24 px-6">
        {group && (
          <div key={group.id} className="animate-[fadeUp_0.25s_ease-out]">
            <div className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-gold">STYLES</div>
            <div className="flex gap-4">
              {group.variants.map(v => (
                <button key={v.id} type="button" onClick={() => onPick(v.id)} className="flex w-16 flex-col items-center gap-1.5 active:scale-95">
                  <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ${v.id === effectId ? 'ring-2 ring-gold ring-offset-2 ring-offset-black/40' : ''}`}>
                    {ICONS[group.id]?.()}
                  </span>
                  <span className="text-center text-[10px] leading-tight font-semibold text-white">{v.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!group && !dimmed && (
          <p className="pt-10 text-center text-sm font-semibold text-white/90">Swipe to pick an effect</p>
        )}
      </div>

      {/* Carousel under a fixed shutter ring */}
      <div className="relative">
        <div
          ref={scroller}
          onScroll={onScroll}
          role="radiogroup"
          aria-label="Effects"
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{paddingInline: `calc(50% - ${SLOT / 2}px)`, touchAction: 'pan-x'}}
        >
          {items.map((g, i) => {
            const on = i === centred
            const Icon = ICONS[g.id]
            return (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={i === 0 ? (on ? 'Take photo' : 'No effect') : on ? `${g.label}: take photo` : g.label}
                onClick={() => tap(i)}
                className="flex shrink-0 snap-center flex-col items-center pt-1 pb-1"
                style={{width: SLOT}}
              >
                <span className="flex h-[86px] items-center justify-center">
                  {i > 0 && (
                    <span
                      className={`flex items-center justify-center rounded-full transition-all duration-200 ${
                        on ? 'h-[66px] w-[66px] bg-gold/25' : 'h-[52px] w-[52px] border border-white/20 bg-white/10'
                      }`}
                    >
                      {Icon && <Icon />}
                    </span>
                  )}
                </span>
                <span className={`mt-2 h-4 whitespace-nowrap text-xs transition-colors ${on ? 'font-bold text-gold' : 'font-medium text-white/70'}`}>
                  {g.label}
                </span>
              </button>
            )
          })}
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1 h-[86px] w-[86px] -translate-x-1/2 rounded-full border-[5px] border-white"
        />
      </div>
    </div>
  )
}
