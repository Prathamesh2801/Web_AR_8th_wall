/**
 * Home-screen app files for one brand: icons + web app manifest, from the brand file.
 *
 *   npm run generate-pwa -- <brand>     -> public/brands/<brand>/app/*
 *
 * Icon source = brand.app.icon (a file in public/brands/<brand>/). A transparent logo is
 * centred on brand.app.iconBackground; a photo is cover-cropped to a square. Outputs:
 *   icon-192.png, icon-512.png   Android / desktop install (purpose "any")
 *   icon-maskable-512.png        Android adaptive icon: art inside the 80% safe circle
 *   apple-touch-icon.png         iOS / iPadOS home screen, 180 px, OPAQUE (iOS fills
 *                                transparency with black)
 *   manifest.webmanifest         start_url + id carry ?brand=, so each brand installs as
 *                                its own app
 * src/pwa.js links these at runtime for the active brand. Re-run after changing the icon.
 */
import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import sharp from 'sharp'

const id = process.argv[2]
if (!id) {
  console.error('usage: npm run generate-pwa -- <brand>')
  process.exit(1)
}
const {default: brand} = await import(`../src/brands/${id}/brand.js`)
const app = brand.app
if (!app?.icon) {
  console.error(`src/brands/${id}/brand.js has no app.icon`)
  process.exit(1)
}

const dir = join('public/brands', id)
const out = join(dir, 'app')
mkdirSync(out, {recursive: true})
const src = join(dir, app.icon)
const bg = app.iconBackground ?? '#0a0a0a'
const meta = await sharp(src).metadata()
const isLogo = meta.hasAlpha

/** The art at `size`, its content filling `fill` of it, on the brand background. */
const icon = async (size, fill, file) => {
  const inner = Math.round(size * fill)
  const art = isLogo
    ? await sharp(src).resize(inner, inner, {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).toBuffer()
    : await sharp(src).resize(inner, inner, {fit: 'cover', position: 'attention'}).toBuffer()
  await sharp({create: {width: size, height: size, channels: 4, background: bg}})
    .composite([{input: art, gravity: 'center'}])
    .flatten({background: bg})
    .png()
    .toFile(join(out, file))
}

// A logo keeps a margin; a photo fills the square (its own margin would look like a frame).
await icon(192, isLogo ? 0.86 : 1, 'icon-192.png')
await icon(512, isLogo ? 0.86 : 1, 'icon-512.png')
await icon(512, isLogo ? 0.62 : 1, 'icon-maskable-512.png') // Android crops to a circle
await icon(180, isLogo ? 0.8 : 1, 'apple-touch-icon.png')

const {brand: name, product} = brand.experience
const base = `/brands/${id}/app`
const manifest = {
  id: `/?brand=${id}`,
  name: `${name} ${product} AR`,
  short_name: app.shortName ?? name,
  description: brand.experience.headline,
  start_url: `/?brand=${id}`,
  scope: '/',
  // Android reads display_override: fullscreen (no status bar, the camera fills the
  // screen). iOS ignores display_override and has no fullscreen: give it standalone
  // explicitly rather than rely on its fallback.
  display: 'standalone',
  display_override: ['fullscreen'],
  orientation: 'portrait',
  background_color: '#0a0a0a',
  theme_color: '#0a0a0a',
  icons: [
    {src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any'},
    {src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any'},
    {src: `${base}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable'},
  ],
}
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`${out}: 4 icons + manifest.webmanifest (${isLogo ? 'logo' : 'photo'} source)`)
