import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import App from './App.jsx'
import {preloadAssets} from './assets'
import {BRAND, EXPERIENCE} from './config'
import './index.css'
import './pwa'
import './fullscreen'

// Start downloading every effect's files now, while the start screen is up (assets.js).
preloadAssets()

document.title = `${EXPERIENCE.brand} ${EXPERIENCE.product} AR`
// Brand colours: Tailwind v4 utilities read these variables at runtime (text-gold,
// bg-teal/15...), so overriding them re-themes the whole UI with no rebuild.
for (const [token, value] of Object.entries({gold: BRAND.theme?.accent, teal: BRAND.theme?.teal})) {
  if (value) document.documentElement.style.setProperty(`--color-${token}`, value)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
