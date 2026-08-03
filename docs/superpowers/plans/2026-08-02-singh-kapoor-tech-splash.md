# Singh Kapoor Tech Brand Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy override:** standing project policy is that commits/pushes only happen after explicit user confirmation — never automatically. Every task below ends with `git add` (staging only), **not** `git commit`. Do not run `git commit` or `git push` at any point in this plan without asking the user first, even though staging happens per task.

**Goal:** Add a ~700ms "Singh Kapoor Tech" studio-ident splash that plays on
iOS/Android native app launch (web unaffected), replacing Divit's static
native splash with a typewriter-animated in-app component.

**Architecture:** A new self-contained `src/components/splash/` folder holds
a presentational `BrandSplash` component (CSS keyframe typewriter animation +
self-hosted font) and a `SplashGate` wrapper that shows it only on native
platforms before mounting `<App/>` in `main.tsx` — gating providers/auth
bootstrap, not just route content. Native launch screens are updated to a
flat matching color so the native→JS handoff is invisible, and `SplashScreen.hide()`
is called manually from `BrandSplash` instead of relying on a timed auto-hide.

**Tech Stack:** React 18 + TypeScript, Capacitor 7 (`@capacitor/splash-screen`,
`@capacitor/core`), plain CSS (no Tailwind, for portability to future apps),
`@capacitor/assets` (dev-only, ad hoc — not a persisted dependency, matching
existing precedent in this repo).

**Full design spec:** `docs/superpowers/specs/2026-08-02-singh-kapoor-tech-splash-design.md`

**On testing:** this repo's Vitest setup (`vitest.config.ts`) is configured
`environment: 'node'` for pure-logic tests only — no jsdom/`@testing-library/react`
is installed anywhere, and nothing in `src/` has component-level automated
tests today. Adding a new test-rendering stack solely for one splash
component would be disproportionate scope creep and inconsistent with how
this codebase actually tests things. Verification here is therefore: TypeScript
compiles clean (`npx tsc -p tsconfig.app.json --noEmit`), a manual visual QA
pass via a temporary dev-only override (Task 3, Step 4), and — because this
is native-only behavior that can't run in a plain browser — final on-device
confirmation is left to the user via Xcode/Android Studio, noted in Task 6.

---

### Task 1: Self-hosted JetBrains Mono font

**Files:**
- Create: `src/components/splash/fonts/JetBrainsMono-Medium.woff2`

- [ ] **Step 1: Create the directory and download the font file**

```bash
mkdir -p src/components/splash/fonts
curl -sL "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxTOlOV.woff2" \
  -o src/components/splash/fonts/JetBrainsMono-Medium.woff2
```

This is the "latin" subset of JetBrains Mono weight 500 (Medium) from Google
Fonts' static CDN — resolved from `fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500`
and verified during design review (21,832 bytes, valid WOFF2 v2/TrueType).
Only the latin subset is needed — the splash text is plain lowercase ASCII.

- [ ] **Step 2: Verify the file downloaded correctly**

Run: `file src/components/splash/fonts/JetBrainsMono-Medium.woff2`
Expected: `Web Open Font Format (Version 2), TrueType, length 21832, version 1.0`
(or a similar valid WOFF2 description — the important part is it must NOT
say "HTML document" or "ASCII text", which would mean the download got an
error page instead of the font).

- [ ] **Step 3: Stage**

```bash
git add src/components/splash/fonts/JetBrainsMono-Medium.woff2
```

---

### Task 2: `BrandSplash` component

**Files:**
- Create: `src/components/splash/BrandSplash.tsx`
- Create: `src/components/splash/BrandSplash.css`

- [ ] **Step 1: Write `BrandSplash.css`**

```css
/* src/components/splash/BrandSplash.css */

@font-face {
  font-family: 'JetBrains Mono Splash';
  src: url('./fonts/JetBrainsMono-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: block;
}

.brandSplash {
  position: fixed;
  inset: 0;
  background: #14161A;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.brandSplash__stack {
  display: flex;
  flex-direction: column;
}

.brandSplash__row {
  display: flex;
  align-items: center;
}

.brandSplash__type1,
.brandSplash__type2 {
  font-family: 'JetBrains Mono Splash', monospace;
  font-weight: 500;
  font-size: 23px;
  display: inline-block;
  overflow: hidden;
  white-space: pre;
  width: 0;
}

.brandSplash__type1 {
  color: #E0DED9;
  animation: brandType1 0.28s steps(12, end) forwards;
}

.brandSplash__type2 {
  color: #C1502E;
  white-space: nowrap;
  animation: brandType2 0.15s steps(4, end) 0.34s forwards;
}

.brandSplash__cursor1,
.brandSplash__cursor2 {
  width: 10px;
  height: 21px;
  margin-left: 2px;
  flex-shrink: 0;
  opacity: 0;
}

.brandSplash__cursor1 {
  background: #E0DED9;
  animation: brandBlink 0.3s steps(1) 2 forwards, brandStop 0.01s linear 0.34s forwards;
}

.brandSplash__cursor2 {
  background: #C1502E;
  animation: brandBlink 0.5s steps(1) 0.49s infinite;
}

/* 12.3ch / 4.3ch: "singh kapoor" is 12 chars, "tech" is 4 — ch units match
   the monospace character advance width exactly, so the reveal can't clip
   the last character (an earlier em-based guess did). */
@keyframes brandType1 { to { width: 12.3ch; } }
@keyframes brandType2 { to { width: 4.3ch; } }
@keyframes brandBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
@keyframes brandStop { to { opacity: 0; } }
```

- [ ] **Step 2: Write `BrandSplash.tsx`**

```tsx
// src/components/splash/BrandSplash.tsx
import { useEffect } from "react";
import { SplashScreen } from "@capacitor/splash-screen";
import "./BrandSplash.css";

// Type animation finishes at 490ms (line 1: 0-280ms, line 2: 340-490ms).
// Hold on the resting cursor blink for a short beat so it doesn't feel
// clipped, then hand off — ~700ms total, matching the approved design.
const TOTAL_DURATION_MS = 700;

interface BrandSplashProps {
  onDone: () => void;
}

export function BrandSplash({ onDone }: BrandSplashProps) {
  useEffect(() => {
    // Native splash is a flat color matching this component's background
    // (see capacitor.config.ts), so hiding it immediately on mount is
    // invisible — no timing guess needed for a seamless handoff.
    SplashScreen.hide().catch(() => {
      // Not running under Capacitor (e.g. plain browser) — ignore.
    });

    const timer = setTimeout(onDone, TOTAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="brandSplash">
      <div className="brandSplash__stack">
        <div className="brandSplash__row">
          <span className="brandSplash__type1">singh kapoor</span>
          <span className="brandSplash__cursor1" />
        </div>
        <div className="brandSplash__row">
          <span className="brandSplash__type2">tech</span>
          <span className="brandSplash__cursor2" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors referencing `BrandSplash.tsx` (pre-existing unrelated
errors in the repo, if any, are not this task's concern — CLAUDE.md notes
lint has pre-existing issues; this check is scoped to not introducing new
ones in this file).

- [ ] **Step 4: Stage**

```bash
git add src/components/splash/BrandSplash.tsx src/components/splash/BrandSplash.css
```

---

### Task 3: `SplashGate` wrapper and wiring into `main.tsx`

**Files:**
- Create: `src/components/splash/SplashGate.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write `SplashGate.tsx`**

```tsx
// src/components/splash/SplashGate.tsx
import { useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { BrandSplash } from "./BrandSplash";

interface SplashGateProps {
  children: ReactNode;
}

/**
 * Gates `children` behind the brand splash on native platforms only.
 * Wraps the whole app (not just routes) so providers/auth listeners don't
 * start mounting until the studio ident has finished.
 */
export function SplashGate({ children }: SplashGateProps) {
  const [showSplash, setShowSplash] = useState(() => Capacitor.isNativePlatform());

  if (showSplash) {
    return <BrandSplash onDone={() => setShowSplash(false)} />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Wire it into `main.tsx`**

Modify `src/main.tsx` (currently 18 lines, full file shown — replace
entirely):

```tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./index.css";
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashGate } from "@/components/splash/SplashGate";

// Configure status bar for mobile platforms
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light }).catch(console.error);
  StatusBar.setBackgroundColor({ color: '#ffffff' }).catch(console.error);
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <SplashGate>
      <App />
    </SplashGate>
  </ErrorBoundary>
);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual visual QA in the browser (temporary override)**

The splash only shows on native (`Capacitor.isNativePlatform()` is `false`
in a plain browser), so to see it in `npm run dev` temporarily hardcode the
gate — do **not** commit this change, it's QA-only:

In `src/components/splash/SplashGate.tsx`, temporarily change:
```tsx
const [showSplash, setShowSplash] = useState(() => Capacitor.isNativePlatform());
```
to:
```tsx
const [showSplash, setShowSplash] = useState(() => true);
```
Run `npm run dev`, open `http://localhost:8080`, confirm: flat `#14161A`
background, "singh kapoor" types in off-white, "tech" types in rust below
it, cursor blinks calmly after, then it hands off to the normal
landing/dashboard after ~700ms. **Revert the hardcoded `true` back to
`Capacitor.isNativePlatform()` immediately after confirming** — this step
must not ship.

- [ ] **Step 5: Confirm the revert and stage**

```bash
git diff src/components/splash/SplashGate.tsx
```
Expected: diff is empty (confirms the QA hardcode was reverted before
staging — if it's not empty, fix it before proceeding).

```bash
git add src/components/splash/SplashGate.tsx src/main.tsx
```

---

### Task 4: Update `capacitor.config.ts`

**Files:**
- Modify: `capacitor.config.ts:15-19`

- [ ] **Step 1: Replace the `SplashScreen` block**

Current (`capacitor.config.ts:15-19`):
```ts
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0D0D0D",
      showSpinner: false,
    },
```

New:
```ts
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#14161A",
      showSpinner: false,
    },
```

`launchShowDuration` is removed because it's meaningless once
`launchAutoHide: false` is set — the plugin no longer auto-hides on a timer
at all; `BrandSplash` calls `SplashScreen.hide()` explicitly instead (Task 2).
`backgroundColor` changes from Divit's `#0D0D0D` to the splash's `#14161A` so
native and JS layers match exactly during handoff.

- [ ] **Step 2: Stage**

```bash
git add capacitor.config.ts
```

---

### Task 5: Regenerate native splash screen assets

**Files:**
- Modify: `assets/splash.png`
- Modify: `assets/splash-dark.png`
- Modify (generated): `ios/App/App/Assets.xcassets/Splash.imageset/*.png`
- Modify (generated): `android/app/src/main/res/drawable*/splash.png`

There is no automated pipeline for this in the repo (confirmed: no
`@capacitor/assets` dependency, no config file, no npm script — it was run
ad hoc previously, per commit `d6c8a5b`). This task follows the same ad hoc
pattern: regenerate once, commit the binary outputs.

- [ ] **Step 1: Generate flat-color 2732×2732 source images**

`@capacitor/assets` Custom Mode requires `assets/splash.png` and
`assets/splash-dark.png` to be at least 2732×2732px. Both should be the same
flat `#14161A` (the splash is always dark regardless of OS light/dark mode,
matching `BrandSplash`'s background exactly, so there's no seam):

```bash
python3 -c "
import struct, zlib

def write_solid_png(path, size, rgb):
    w = h = size
    r, g, b = rgb
    row = bytes([r, g, b]) * w
    raw = (b'\x00' + row) * h
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    with open(path, 'wb') as f:
        f.write(sig)
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', idat))
        f.write(chunk(b'IEND', b''))

write_solid_png('assets/splash.png', 2732, (0x14, 0x16, 0x1A))
write_solid_png('assets/splash-dark.png', 2732, (0x14, 0x16, 0x1A))
print('done')
"
```

This is a minimal pure-stdlib PNG encoder (verified during design review to
produce valid PNG output readable by standard tools) — no Pillow/ImageMagick
dependency needed for a single flat color fill.

- [ ] **Step 2: Verify the images**

Run: `file assets/splash.png assets/splash-dark.png`
Expected: both report `PNG image data, 2732 x 2732, 8-bit/color RGB, non-interlaced`.

- [ ] **Step 3: Run `@capacitor/assets` to regenerate native resources**

```bash
npx @capacitor/assets generate --ios --android
```

Expected: output listing generated files for both `ios/App/App/Assets.xcassets/Splash.imageset/`
and `android/app/src/main/res/drawable*/` — no errors. This overwrites the
existing Divit "D" mark splash images with the new flat color.

- [ ] **Step 4: Spot-check one generated file per platform**

```bash
file "ios/App/App/Assets.xcassets/Splash.imageset/Default@2x~universal~anyany.png"
file "android/app/src/main/res/drawable/splash.png"
```
Expected: both are valid PNGs (not zero-byte, not an error message).

- [ ] **Step 5: Stage**

```bash
git add assets/splash.png assets/splash-dark.png \
  ios/App/App/Assets.xcassets/Splash.imageset/ \
  android/app/src/main/res/drawable*/splash.png
```

---

### Task 6: Final verification and handoff

**Files:** none (verification only)

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: clean (no errors introduced by this feature).

- [ ] **Step 2: Confirm web is unaffected**

Run `npm run dev`, open `http://localhost:8080` in a plain browser (no
hardcoded override this time — `SplashGate.tsx` should be back to
`Capacitor.isNativePlatform()` per Task 3 Step 5). Expected: landing page
loads immediately, no splash, no console errors about `@capacitor/splash-screen`
or the missing font (the `@font-face` rule simply won't be exercised since
`BrandSplash` never mounts on web).

- [ ] **Step 3: Note what still needs a real device/simulator**

This plan cannot verify actual native behavior (the `SplashScreen.hide()`
timing, the native launch image, on-device font rendering) without Xcode
(iOS — not available on Windows) or an Android emulator/device. Leave this
as an explicit note for the user: after these changes are committed, run
`npm run build:mobile` (Android) and inspect via Android Studio, or transfer
to a Mac for `npm run ios`, to confirm the handoff looks seamless on-device.

- [ ] **Step 4: Ask the user before any commit**

Per the commit policy override at the top of this plan: all changes are
staged (`git add`) but nothing has been committed. Summarize what's staged
(`git status`) and ask the user to confirm before running `git commit`.
