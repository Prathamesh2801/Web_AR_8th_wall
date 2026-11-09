/**
 * `npm run tunnel -- <https://xxxx-5173.xxx.devtunnels.ms>`: dev server for a VS Code
 * forwarded port, plus a QR code of that URL for the phone.
 *
 * The tunnel serves HTTPS with a real certificate, so the dev server runs plain HTTP here
 * (no mkcert, no certificate warning on iPhone). The URL is remembered in
 * .tunnel-url.local (gitignored), so later runs need no argument.
 * In VS Code: Ports -> 5173 -> Port Visibility: Public (Private asks the phone to sign in),
 * Change Port Protocol: HTTP (the default).
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import qrcode from 'qrcode-terminal'
import {createServer} from 'vite'

const SAVED = '.tunnel-url.local'
const url = process.argv[2] ?? (existsSync(SAVED) ? readFileSync(SAVED, 'utf8').trim() : '')
if (!/^https:\/\//.test(url)) {
  console.error('Usage: npm run tunnel -- https://<your-forwarded-address>  (copy it from VS Code > Ports)')
  process.exit(1)
}
writeFileSync(SAVED, url)

process.env.TUNNEL = '1' // read by vite.config.js
const server = await createServer()
await server.listen()
console.log(`\n  Phone: ${url}\n`)
qrcode.generate(url, {small: true})
