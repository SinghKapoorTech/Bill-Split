# Singh Kapoor Tech brand splash — design

## Goal

Show a brief studio-identity splash ("Singh Kapoor Tech") on native app launch,
before the app's own content (Dashboard / MobileAuth) appears — the same role
a production-company ident plays before a film. It must be trivially portable:
the studio will ship more apps later, and this same treatment should drop into
each one unchanged.

**In scope:** iOS and Android native builds only.
**Out of scope:** the web deployment (`bill-split-lemon.vercel.app`) — no
splash there, per explicit instruction. Divit's own app icon/branding is
unaffected; this is a separate, preceding beat, not a replacement for Divit's
identity within the app itself.

## Visual design

- **Background:** flat `#14161A` (near-black, no gradient/glow/shimmer —
  deliberately not Divit's `#0D0D0D`/gold palette, so the studio mark reads as
  its own identity independent of any one app's colors).
- **Typography:** JetBrains Mono, weight 500 (Medium), self-hosted `.woff2`
  (no CDN — see Architecture).
- **Copy, typed in two lines:**
  - Line 1 — `singh kapoor` — `#E0DED9` (off-white)
  - Line 2 — `tech` — `#C1502E` (rust accent)
  - All lowercase, space-separated (not `singh_kapoor` — the underscore read
    as too literal/gamer-y in review).
- **Reference points** (pulled from real examples during design, not
  guesswork): Dribbble's Devolver Digital shot — flat color field, confident
  wordmark, zero effects — and UX Planet's splash screen guidance: one color
  field plus name/mark, subtle motion, nothing more. This directly replaced an
  earlier pass that used a radial-glow background and spaced-out uppercase
  system font, which read as generic/AI-templated.

## Motion spec

A genuine character-by-character typewriter effect, not a fade/slide-in.
Timings below are final, already trimmed once for pacing:

| Beat | Start | Duration | Detail |
|---|---|---|---|
| Type "singh kapoor" | 0ms | 280ms | `steps(12, end)`, width-reveal in `ch` units (12.3ch) — **use `ch`, not `em`**; an `em`-based guess clipped the last character during design review |
| Cursor blinks after line 1 | 0ms → 340ms | — | then forced to hidden (`opacity: 0`) exactly as line 2 starts |
| Type "tech" | 340ms | 150ms | `steps(4, end)`, width-reveal 4.3ch |
| Resting cursor blink | 490ms onward | 500ms period, infinite | calm terminal-cursor blink; this is idle state, not part of the timed entrance |

Total typed entrance: **~490ms**. After that, hold on the resting blink for a
short beat (~200ms) so it doesn't feel clipped, then hand off — **~700ms total
before the app becomes visible**, matching the original 0.5–1s target.

The component must render this itself in JS — native iOS/Android launch
screens are static images and cannot animate. The reference mockups (built
during design review) live at:
`C:\Users\aakaa\AppData\Local\Temp\claude\...\scratchpad\skt-splash-typing-v4.html`
(session scratchpad — not committed; implementation should port the CSS
keyframes/timings from there, not re-derive them).

## Architecture

### Component placement

New component wraps `<App />` in `src/main.tsx`, **not** inserted inside
`RootRoute` in `App.tsx`. Rationale (confirmed by reading the current boot
flow): wrapping at the `main.tsx` level blocks mounting of every provider
(`AuthProvider`, `QueryClientProvider`, `BillSessionProvider`, `ThemeProvider`,
`BrowserRouter`) until the splash finishes, so the Firebase auth listener and
everything downstream only starts after the studio ident is done — a clean,
fully decoupled gate rather than a route-level flag that races against
already-mounted providers.

`main.tsx` renders outside any component, so it cannot use the `usePlatform()`
hook (that's `App.tsx`-only). Gate directly with `Capacitor.isNativePlatform()`
— `main.tsx` already does exactly this for the `StatusBar` calls (`src/main.tsx:9`).
On web, render `<App />` immediately with no gate at all.

Suggested location, self-contained for portability to future apps — copy the
whole folder, nothing else to wire up beyond dropping it into `main.tsx`:

```
src/components/splash/
  BrandSplash.tsx          # the component
  BrandSplash.css          # plain CSS (not Tailwind utilities — stays
                            # portable to apps that don't use Tailwind)
  fonts/
    JetBrainsMono-Medium.woff2
```

### Native splash handoff (avoiding a visible seam)

Current `capacitor.config.ts` (`SplashScreen` block) uses the default
`launchAutoHide: true` with `launchShowDuration: 2000` — the native splash
just times out on its own after 2s, unrelated to when the WebView is actually
ready. For a seamless handoff to the in-app animation:

1. Set `launchAutoHide: false` in `capacitor.config.ts`.
2. Call `SplashScreen.hide()` as the very first effect in `BrandSplash`, on
   mount, before starting the type animation. This removes the timing-guess
   problem entirely — the native splash disappears the instant the WebView
   can paint, regardless of device speed.
3. Regenerate the native static splash images (`assets/splash.png`,
   `assets/splash-dark.png` → `ios/App/App/Assets.xcassets/Splash.imageset/*`,
   `android/app/src/main/res/drawable*/splash.png`) as **flat `#14161A`, no
   logo/mark** — since it's static, any icon would just flash and disappear
   before the typing starts; a plain matching color field makes the native→JS
   handoff invisible. Update `capacitor.config.ts`'s
   `SplashScreen.backgroundColor` to `#14161A` to match.
4. **No repeatable pipeline exists for step 3** — confirmed there's no
   `@capacitor/assets` dependency, no config file, and no npm script in this
   repo. It was previously run ad hoc via `npx @capacitor/assets generate`
   (per commit `d6c8a5b`) and the binary outputs committed directly. The
   implementation plan should do the same: run it once, commit the generated
   assets, same as last time — not a new automated step.

### Font bundling

No precedent for self-hosted fonts in this repo — the existing font (Outfit)
is loaded via a Google Fonts CDN `@import` in `src/index.css:5`. That's fine
for the main app (network available by the time it matters) but wrong for a
splash that must render at cold boot with zero network dependency. Self-host
a single JetBrains Mono Medium `.woff2` under
`src/components/splash/fonts/`, referenced via a relative `url()` in
`BrandSplash.css` and a scoped `@font-face`. Vite bundles anything under
`src/` (hashed into `dist/assets/`), and since Capacitor just copies the full
`dist/` output into the native WebView bundle (`webDir: "dist"`,
`capacitor.config.ts:5`), no separate native font registration is needed —
this is 100% WebView-rendered, same as the rest of the app.

### Sequencing / handoff to the app

`BrandSplash` owns its own internal timeline (per Motion spec above) and
calls an `onDone` callback after the ~700ms total. `main.tsx` renders
`BrandSplash` first (native only) and swaps to `<App />` once `onDone` fires —
a simple local `useState` flag in a small wrapper component, no routing
involved. This is intentionally decoupled from auth/data readiness: it's a
fixed-duration ident, not a loading screen (matches existing UX — `RootRoute`
already shows its own `LoadingScreen` while auth resolves, downstream of
this).

## Open questions / verify during implementation

- **Possible background flash**: between `SplashScreen.hide()` firing and
  `BrandSplash`'s first paint, the WebView's default background (likely
  white) could flash for a frame. Not solved here — verify on-device after
  building; if visible, the fix is a body/`#root` background rule scoped to
  native builds (there's a `CAPACITOR_BUILD` env var already used for mobile
  builds — `package.json`'s `build:mobile` script — that could gate this at
  build time if needed).
- Font file itself (the actual `.woff2` bytes) still needs to be sourced —
  not included in this design doc.
