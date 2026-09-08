import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mkcert from 'vite-plugin-mkcert'

// The 8th Wall engine requires a secure context (HTTPS) to access the camera.
// `mkcert` generates a locally-trusted certificate so the app can be opened on a
// physical phone over the LAN, which is the only way to test a real bottle.
export default defineConfig({
  plugins: [react(), tailwindcss(), mkcert()],
  server: {
    host: true,  // Expose on the LAN so a phone can reach the dev server.
    port: 5173,
  },
})
