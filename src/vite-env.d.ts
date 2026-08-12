/// <reference types="vite/client" />

// Only declare variables the client actually reads. Anything listed here that
// is also set in `.env` gets INLINED into the shipped bundle by Vite, so a
// declaration for an unused secret is a standing leak waiting for someone to
// populate it — which is exactly why VITE_GEMINI_API_KEY was removed. Gemini is
// called server-side only, via the `analyzeBill` Cloud Function.
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_USE_EMULATORS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
