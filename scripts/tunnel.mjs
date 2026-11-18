/**
 * `npm run tunnel -- <https://xxxx-5173.xxx.devtunnels.ms>`: dev server for a VS Code
 * forwarded port, plus a QR code of that URL for the phone.
 *
 * The tunnel serves HTTPS with a real certificate, so the dev server runs plain HTTP here
 * (no mkcert, no certificate warning on iPhone). The URL is remembered in
 * .tunnel-url.local (gitignored), so later runs need no argument.
 * In VS Code: Ports -> 5173 -> Port Visibility: Public (Private asks the phone to sign in),
 * Change Port Protocol: HTTP (the default).
 *
 * `npm run tunnel -- --preview <https://xxxx-4173...>`: the same for the PRODUCTION build
 * (vite build, then vite preview on 4173): what to test the iOS home-screen app with.
 * Plain `npm run preview` behind a tunnel shows a white page: without TUNNEL it serves
 * mkcert HTTPS, which the HTTP-forwarding tunnel can't talk to (and blocks the host).
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import qrcode from 'qrcode-terminal'
import {build, createServer, preview} from 'vite'

const args = process.argv.slice(2)
const isPreview = args.includes('--preview')
const SAVED = isPreview ? '.tunnel-preview-url.local' : '.tunnel-url.local' // ports differ
const url = args.find(a => a !== '--preview') ?? (existsSync(SAVED) ? readFileSync(SAVED, 'utf8').trim() : '')
if (!/^https:\/\//.test(url)) {
  console.error('Usage: npm run tunnel -- [--preview] https://<your-forwarded-address>  (copy it from VS Code > Ports)')
  process.exit(1)
}
writeFileSync(SAVED, url)

process.env.TUNNEL = '1' // read by vite.config.js
if (isPreview) {
  await build()
  await preview()
} else {
  const server = await createServer()
  await server.listen()
}
console.log(`\n  Phone: ${url}\n`)
qrcode.generate(url, {small: true})
