import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Native (Capacitor) loads index.html at the webview root and needs RELATIVE
  // asset paths (see commit e61a3de — fixes an Android white screen).
  // Web (Vercel) hard-loads nested routes like /join/:billId directly from the
  // server, where relative "./assets" resolve to "/join/assets/*" → the SPA
  // rewrite serves index.html (text/html) for them → module MIME error → blank
  // white page. Web therefore needs an ABSOLUTE base. Native build scripts set
  // CAPACITOR_BUILD=1 to opt into the relative base.
  base: process.env.CAPACITOR_BUILD ? "./" : "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));
