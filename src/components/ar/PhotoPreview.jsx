import {useState} from 'react'

import {EXPERIENCE} from '../../config'

/*
 * The captured photo, full screen, with Save / Share / retake.
 * Save is a download (Android: Downloads/Gallery; iOS: Files). Share opens the native
 * share sheet with the image, which on iOS is also where "Save Image" to Photos lives.
 */
const FILE_NAME = EXPERIENCE.photoName

export const PhotoPreview = ({photo, onClose}) => {
  const [note, setNote] = useState(null)
  const flash = (text) => { setNote(text); setTimeout(() => setNote(null), 1600) }

  const share = async () => {
    try {
      const blob = await (await fetch(photo)).blob()
      const file = new File([blob], FILE_NAME, {type: 'image/jpeg'})
      if (navigator.canShare?.({files: [file]})) await navigator.share({files: [file]})
      else flash('Sharing not supported here, use Save')
    } catch (err) {
      if (err?.name !== 'AbortError') flash('Could not share')
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 animate-[fadeUp_0.25s_ease-out] bg-black">
      <img src={photo} alt={`Your ${EXPERIENCE.brand} AR photo`} className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-1.5 rounded-[2rem] border-[3px] border-white/90" />

      <button
        type="button"
        aria-label="Retake"
        onClick={onClose}
        className="absolute left-5 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-lg text-white"
        style={{top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)'}}
      >
        ✕
      </button>

      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 bg-linear-to-b from-transparent to-black/80 px-6 pt-16"
        style={{paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)'}}
      >
        {note && <div role="status" className="rounded-full bg-black/60 px-4 py-2 text-xs font-semibold text-white">{note}</div>}
        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          <a
            href={photo}
            download={FILE_NAME}
            onClick={() => flash('✓ Saved')}
            className="flex h-13 items-center justify-center rounded-full border border-white/30 bg-white/15 text-[15px] font-bold text-white active:scale-95"
          >
            ↓ Save
          </a>
          <button
            type="button"
            onClick={share}
            className="h-13 rounded-full bg-gold text-[15px] font-bold text-black active:scale-95"
          >
            Share ↗
          </button>
        </div>
      </div>
    </div>
  )
}
