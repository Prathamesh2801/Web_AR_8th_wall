import { NUTRIENTS } from "../../ar/nutrientData";

/**
 * StartScreen.jsx
 *
 * The first thing a user sees, for two reasons:
 *  1. UX — explaining before the camera prompt makes people far less likely to deny it.
 *  2. TECHNICAL — iOS Safari grants the camera only inside a user gesture, so the
 *     engine is started from this button's click handler.
 *
 * Layout: a full-height column — brand at the top, copy in the flexible middle, the
 * button pinned to the bottom (`mt-auto`), so the call to action is on screen on every
 * phone. If a very short screen can't fit it all, the page scrolls instead of clipping.
 */
const STEPS = [
  "Allow camera access when asked",
  "Hold the bottle upright, about 30 cm away",
  "Turn it slowly, then try the effects",
];

export const StartScreen = ({ onStart, unsupportedReason }) => (
  <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-neutral-950">
    {/* Gold light from above, the bottle's deep teal from below. */}
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{
        background:
          "radial-gradient(90% 50% at 50% -5%, rgba(255,212,90,0.13), transparent 70%)," +
          "radial-gradient(100% 55% at 50% 108%, rgba(14,107,94,0.38), transparent 70%)",
      }}
    />

    <div
      className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-7"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.75rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
      }}
    >
      <p className="text-[11px] font-semibold tracking-[0.32em] text-white/55">
        SUPRADYN <span className="text-gold">NATURALS</span>
      </p>

      <main className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-[2.75rem] font-semibold leading-[1.02] tracking-tight text-white">
          See what&apos;s
          <br />
          inside.
        </h1>
        <p className="mt-4 max-w-[19rem] text-[15px] leading-relaxed text-white/60">
          Point your camera at the bottle and its {NUTRIENTS.length} nutrients
          come to life around it.
        </p>

        <ol className="mt-9 divide-y divide-white/10 border-y border-white/10">
          {STEPS.map((text, i) => (
            <li key={text} className="flex items-baseline gap-4 py-3.5">
              <span className="text-xs font-semibold tabular-nums text-gold">
                0{i + 1}
              </span>
              <span className="text-[15px] text-white/80">{text}</span>
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
            className="w-full mb-6 rounded-full bg-gold py-4 text-base font-semibold text-neutral-950 shadow-[0_10px_40px_-10px] shadow-gold/60 transition active:scale-[0.98]"
          >
            Start camera
          </button>
        </div>
      )}
    </div>
  </div>
);
