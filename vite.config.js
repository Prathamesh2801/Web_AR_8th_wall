import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mkcert from 'vite-plugin-mkcert'

// The 8th Wall engine requires a secure context (HTTPS) to access the camera.
// LAN (`npm run dev`): `mkcert` generates a locally-trusted certificate so a phone on the
// same Wi-Fi can open it (iPhone still warns unless the mkcert root CA is installed).
// Tunnel (`npm run tunnel`, scripts/tunnel.mjs): the VS Code forwarded port provides real
// HTTPS, so serve plain HTTP and let the tunnel's host and port 443 through.
const tunnel = !!process.env.TUNNEL

export default defineConfig({
  plugins: [react(), tailwindcss(), !tunnel && mkcert()],
  server: {
    host: true,  // Expose on the LAN so a phone can reach the dev server.
    port: 5173,
    strictPort: true, // the forwarded port points at 5173; another port would 502
    ...(tunnel && {allowedHosts: ['.devtunnels.ms'], hmr: {clientPort: 443}}),
  },
  // `npm run tunnel -- --preview <url>`: the production build behind the forwarded port 4173.
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    ...(tunnel && {allowedHosts: ['.devtunnels.ms']}),
  },
})
