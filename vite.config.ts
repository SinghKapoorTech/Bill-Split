import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Native (Capacitor) loads index.html at the webview root and needs RELATIVE
  // asset paths (see commit e61a3de — fixes an Android white screen).
  // Web (Vercel) hard-loads nested routes like /join/:billId directly from the
  // server, where relative "./assets" resolve to "/join/assets/*" → the SPA
  // rewrite serves index.html (text/html) for them → module MIME error → blank
  // white page. Web therefore needs an ABSOLUTE base. Native build scripts set
  // CAPACITOR_BUILD=1 to opt into the relative base.
  base: process.env.CAPACITOR_BUILD ? './' : '/',
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [react()],
  // Strip chatty logging from production bundles. It ships into the .ipa/.apk
  // where console output lands in device logs readable by any app with log
  // access, and several call sites log UIDs and display names.
  //
  // `pure` (not `drop: ['console']`) is deliberate: dropping the whole console
  // object would also delete every `console.error` in a catch block, and the
  // app has no replacement error-reporting sink — a production ledger or
  // Firestore failure would leave no client-side evidence at all. Marking the
  // informational methods pure lets minification remove them while
  // console.error/warn survive as the diagnostic trail.
  // Revisit if a real error-reporting service is ever added.
  // Dev/beta keep everything.
  esbuild:
    mode === 'production'
      ? {
          pure: ['console.log', 'console.debug', 'console.info', 'console.trace'],
          drop: ['debugger'],
        }
      : {},
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
}));
