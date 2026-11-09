import {useEffect, useState} from 'react'

import {ANIMATIONS, SOUND} from '../../config'
import {playSound} from '../../sound'
import {trackingStore} from '../../ar/trackingStore'
import {resetTuning, saveTuning, tuningJSON} from '../../tuning'

/*
 * Dashboard (`?debug`): one place to control every animation, in sync.
 *   Sync   which effects run, each one's start delay, Replay all, speed, copy/reset
 *   <tab>  every knob of that animation in config.js, edited live
 *   Stats  tracking telemetry + what each animation reports
 *
 * Controls are generated from the config objects themselves (boolean -> switch,
 * number -> slider, '#rrggbb' -> colour, object -> section), so a new knob in config
 * shows up here with no UI code. RANGE only gives sliders sensible limits.
 */

const RANGE = {
  delay: [0, 5, 0.1], speed: [0.02, 0.4, 0.01], rounds: [0, 8, 1],
  letterHeight: [0.08, 0.4, 0.01], radius: [1.05, 2.5, 0.01], height: [-0.6, 1.2, 0.01],
  glow: [0, 1, 0.01], slantDeg: [-20, 20, 0.5], printAzimuthDeg: [-30, 30, 0.5],
  loopPause: [0, 10, 0.1], thickness: [0.005, 0.06, 0.001], opacity: [0, 1, 0.01],
  drawDuration: [200, 3000, 50], holdDuration: [0, 3000, 50], fadeDuration: [100, 3000, 50], idleOpacity: [0, 1, 0.01], pulseSpeed: [0, 5, 0.1], entranceDuration: [500, 5000, 100],
  glowReach: [0.2, 1.5, 0.05], glowFalloff: [0.02, 0.4, 0.01], particleCount: [0, 300, 10],
  particleSpread: [1.05, 2, 0.01], finalAuraOpacity: [0, 1.5, 0.01],
  finalPulseSpeed: [0, 3, 0.05], orbitSpeed: [0, 3, 0.05],
  stagger: [0, 2000, 50], typeSpeed: [10, 150, 5], cursorLinger: [0, 3000, 100],
  cardHeight: [0.1, 0.5, 0.01], reach: [1.05, 2.5, 0.01], lineThickness: [0.003, 0.04, 0.001],
  dotSize: [0.05, 0.4, 0.01], minFit: [0.3, 1, 0.05], tiltDeg: [-30, 30, 0.5], bandHeight: [0.06, 0.4, 0.01], backOpacity: [0, 1, 0.05], followMs: [0, 1500, 50], side: [-1, 1, 2], y: [-0.9, 0.9, 0.01],
  volume: [0, 1, 0.05], lock: [0, 1, 0.05], select: [0, 1, 0.05], snap: [0, 1, 0.05],
}
const OPTIONS = {direction: [['← Left', -1], ['Right →', 1]]}
/** Read once when the effect is built: these need a page reload. */
const ON_RELOAD = new Set(['glowReach', 'particleCount', 'particleSpread', 'thickness',
  'showBase', 'showLabelBand', 'slantDeg', 'bandHeight'])
const HIDDEN = new Set(['enabled', 'active', 'label', 'delay'])
const SPEEDS = [0, 0.5, 1, 2, 3]

const words = key => key.replace(/([A-Z])/g, ' $1').toLowerCase()
const isColor = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
const pill = on => `rounded-lg border px-2.5 py-1.5 text-xs transition active:scale-95 ${
  on ? 'border-gold/50 bg-gold/20 text-white' : 'border-white/15 bg-white/5 text-white/60'
}`

const Slider = ({label, value, range, onChange, note}) => {
  const [min, max, step] = range ?? [0, Math.max(1, value * 3), Math.max(Math.abs(value) / 50, 0.01)]
  return (
    <label className="block">
      <span className="flex justify-between text-[11px] text-white/55">
        <span>{label}{note && <span className="ml-1 text-white/30">{note}</span>}</span>
        <span className="tabular-nums text-white/90">{+value.toFixed(3)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        className="mt-1 h-6 w-full accent-[#ffd45a]" />
    </label>
  )
}

/** Generic editor for one config object; recurses into nested objects. */
const Knobs = ({obj, onEdit}) => (
  <div className="space-y-3">
    {Object.entries(obj).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => {
      const set = val => onEdit(() => { obj[k] = val })
      const note = ON_RELOAD.has(k) ? '(reload)' : null
      if (v && typeof v === 'object') {
        return (
          <fieldset key={k} className="space-y-3 rounded-xl border border-white/10 p-3">
            <legend className="px-1 text-[11px] tracking-[0.2em] text-gold/80">{k.toUpperCase()}</legend>
            <Knobs obj={v} onEdit={onEdit} />
          </fieldset>
        )
      }
      if (OPTIONS[k]) {
        return (
          <div key={k} className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-white/55">{words(k)}</span>
            <span className="flex gap-1">
              {OPTIONS[k].map(([text, val]) => (
                <button key={text} type="button" className={pill(v === val)} onClick={() => set(val)}>{text}</button>
              ))}
            </span>
          </div>
        )
      }
      if (typeof v === 'boolean') {
        return (
          <div key={k} className="flex items-center justify-between">
            <span className="text-[11px] text-white/55">{words(k)}{note && <span className="ml-1 text-white/30">{note}</span>}</span>
            <button type="button" className={pill(v)} aria-pressed={v} onClick={() => set(!v)}>{v ? 'On' : 'Off'}</button>
          </div>
        )
      }
      if (isColor(v)) {
        return (
          <label key={k} className="flex items-center justify-between">
            <span className="text-[11px] text-white/55">{words(k)}</span>
            <span className="flex items-center gap-2 text-[11px] tabular-nums text-white/60">
              {v.toUpperCase()}
              <input type="color" value={v} onChange={e => set(e.target.value.toUpperCase())}
                className="h-7 w-9 rounded border border-white/15 bg-transparent" />
            </span>
          </label>
        )
      }
      if (typeof v === 'number') {
        return <Slider key={k} label={words(k)} value={v} range={RANGE[k]} onChange={set} note={note} />
      }
      return null
    })}
  </div>
)

const Row = ({label, value}) => (
  <div className="flex justify-between gap-3 text-[11px]">
    <span className="min-w-0 text-white/45">{label}</span>
    <span className="min-w-0 wrap-break-word text-right tabular-nums text-white/90">{String(value ?? '—')}</span>
  </div>
)

export const Dashboard = ({tracking, animations, activeIds, onToggleAnimation, speed, onSpeedChange}) => {
  const [tab, setTab] = useState('sync')
  const [, bump] = useState(0)
  const [copied, setCopied] = useState(false)

  // Stats read three.js directly, which never emits: tick while the Stats tab is open.
  useEffect(() => {
    if (tab !== 'stats') return
    const id = setInterval(() => bump(n => n + 1), 250)
    return () => clearInterval(id)
  }, [tab])

  /** Every edit: mutate config in place (animations read it live), remember, re-render. */
  const edit = (fn) => {
    fn()
    saveTuning()
    bump(n => n + 1)
  }
  const scene = () => trackingStore.getScene()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tuningJSON())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      console.log(tuningJSON()) // clipboard blocked (http / permissions): log it instead
    }
  }

  const tabs = [['sync', 'Sync'], ...animations.map(a => [a.id, a.label]), ['stats', 'Stats']]
  const info = tab === 'stats' ? scene()?.getDebugInfo() ?? {} : null

  return (
    <section
      aria-label="Animation dashboard"
      className="glass pointer-events-auto absolute inset-x-3 z-40 mx-auto flex max-h-[55vh] max-w-md flex-col overflow-hidden rounded-2xl text-white shadow-2xl"
      style={{top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)'}}
    >
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`shrink-0 ${pill(tab === id)}`}>
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-3">
        {tab === 'sync' && (
          <div className="space-y-4">
            <button type="button" onClick={() => scene()?.replay()}
              className="w-full rounded-xl bg-gold py-2.5 text-sm font-semibold text-black active:scale-[0.98]">
              Replay all in sync
            </button>

            <div className="space-y-3">
              {animations.map(({id, label}) => {
                const on = activeIds.includes(id)
                return (
                  <div key={id} className="rounded-xl border border-white/10 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm text-white/90">{label}</span>
                      <span className="flex gap-1">
                        <button type="button" className={pill(false)} onClick={() => scene()?.replay([id])}>Replay</button>
                        <button type="button" className={pill(on)} aria-pressed={on} onClick={() => onToggleAnimation(id)}>
                          {on ? 'On' : 'Off'}
                        </button>
                      </span>
                    </div>
                    <Slider label="start delay (s)" value={ANIMATIONS[id].delay ?? 0} range={RANGE.delay}
                      onChange={v => edit(() => { ANIMATIONS[id].delay = v })} />
                  </div>
                )
              })}
            </div>

            <div>
              <div className="mb-1 text-[11px] text-white/55">global speed</div>
              <div className="grid grid-cols-5 gap-1">
                {SPEEDS.map(v => (
                  <button key={v} type="button" className={pill(speed === v)} onClick={() => onSpeedChange(v)}>
                    {v === 0 ? '||' : `${v}x`}
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="space-y-3 rounded-xl border border-white/10 p-3">
              <legend className="px-1 text-[11px] tracking-[0.2em] text-gold/80">SOUND</legend>
              <Knobs obj={SOUND} onEdit={edit} />
              <div className="grid grid-cols-3 gap-1">
                {['lock', 'select', 'snap'].map(n => (
                  <button key={n} type="button" className={pill(false)} onClick={() => playSound(n)}>▶ {n}</button>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={pill(copied)} onClick={copy}>{copied ? 'Copied' : 'Copy settings'}</button>
              <button type="button" className={pill(false)} onClick={() => edit(resetTuning)}>Reset to config.js</button>
            </div>
            <p className="text-[11px] leading-relaxed text-white/40">
              Edits apply live and are kept in this browser. Copy settings and paste into
              src/config.js to make them permanent.
            </p>
          </div>
        )}

        {ANIMATIONS[tab] && (
          <div className="space-y-3">
            <button type="button" className={`w-full ${pill(false)}`} onClick={() => scene()?.replay([tab])}>
              Replay {ANIMATIONS[tab].label}
            </button>
            <Knobs obj={ANIMATIONS[tab]} onEdit={edit} />
          </div>
        )}

        {tab === 'stats' && (
          <div className="space-y-1">
            <Row label="Status" value={tracking.state} />
            <Row label="FPS" value={tracking.fps} />
            <Row label="Lead target" value={tracking.targetName} />
            <Row label="Detections" value={tracking.detectionCount} />
            <Row label="Scale" value={tracking.scale?.toFixed(3)} />
            {Object.entries(info).map(([k, v]) => (
              <Row key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : v} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
