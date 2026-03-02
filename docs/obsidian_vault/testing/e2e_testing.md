---
title: E2E Testing Guide
date: 2026-03-01
tags: [testing, e2e, playwright, firebase-emulators]
---

# E2E Testing

End-to-end tests use **Playwright** with **Firebase Emulators** so all tests run against a fully local environment — no production data is ever touched.

## Prerequisites

### Java (required by Firestore Emulator)
```bash
brew install openjdk
echo 'export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
java -version  # should print openjdk version
```

### Playwright Browsers
```bash
npm install -D @playwright/test
npx playwright install chromium
```

## Running Tests

You need **3 terminals** running simultaneously:

### Terminal 1 — Firebase Emulators
```bash
firebase emulators:start --only auth,firestore
```
This starts:
- **Auth Emulator** on `localhost:9099`
- **Firestore Emulator** on `localhost:8081`
- **Emulator UI** on `localhost:4000` (optional dashboard)

### Terminal 2 — Dev Server (with emulators)
```bash
VITE_USE_EMULATORS=true npm run dev
```
The `VITE_USE_EMULATORS=true` flag tells the app to connect to local emulators instead of production Firebase (see [[../backend/cloud_functions|Cloud Functions]]).

### Terminal 3 — Run Tests
```bash
# Run all tests
npx playwright test e2e/ --reporter=list

# Run a single test file
npx playwright test e2e/bill-creation.spec.ts --reporter=list

# Run with headed browser (see the browser)
npx playwright test e2e/ --headed

# Run with Playwright UI mode (interactive debugging)
npx playwright test --ui
```

## Architecture

```
e2e/
├── helpers/
│   └── auth.ts              # Auth helper — signs in via emulator popup
├── global-setup.ts          # Detects/starts emulators before test run
├── login.spec.ts            # Landing → Auth page → Google popup
├── bill-creation.spec.ts    # Full 4-step bill wizard flow
├── events.spec.ts           # Event CRUD (create, navigate to detail)
└── settle-flow.spec.ts      # Dashboard + bill split verification
```

### How Authentication Works in Tests

The Firebase Auth Emulator provides its own popup UI. When the app calls `signInWithPopup(auth, googleProvider)`, instead of redirecting to Google, it opens the emulator's auth page at `localhost:9099`.

The test helper (`e2e/helpers/auth.ts`) automates this:
1. Navigates to `/auth`
2. Clicks "Sign in with Google"
3. In the emulator popup: clicks **"Add new account"** → **"Auto-generate"** → **"Sign in"**
4. Waits for redirect to `/dashboard`

This creates a real Firebase Auth user in the emulator, so Firestore security rules work correctly.

### Key Config Files

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Test runner config — 1280×720 viewport, 60s timeout, emulator-aware dev server |
| `firebase.json` → `emulators` | Emulator port configuration (auth: 9099, firestore: 8081, ui: 4000) |
| `src/config/firebase.ts` | Connects to emulators when `VITE_USE_EMULATORS=true` |

## Test Coverage

| Test File | Flow Tested | Steps |
|-----------|-------------|-------|
| `login.spec.ts` | Login UI | Landing page → Sign In button → Auth page → Google button → popup triggers |
| `bill-creation.spec.ts` | [[../ui/bill_entry\|Bill Entry]] → [[../ui/add_people\|People]] → [[../ui/assignment\|Assignment]] → [[../ui/review\|Review]] | Sign in → Create bill → Add 2 items → Add 2 people → Split evenly → Verify review |
| `events.spec.ts` | [[../database/events\|Events]] CRUD | Sign in → Create event → Verify card → Navigate to detail; also tests header `+` button |
| `settle-flow.spec.ts` | Dashboard + Settlement prep | Sign in → Verify dashboard; Sign in → Full bill flow → Verify per-person totals on review |

## Troubleshooting

### `java -version` fails
```
The operation couldn't be completed. Unable to locate a Java Runtime.
```
**Fix:** Install and add to PATH:
```bash
brew install openjdk
echo 'export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Emulators won't start — "Port not open"
```
Port 9099 is not open on localhost, could not start Authentication Emulator.
```
**Fix:** Previous emulator processes are still running. Kill them:
```bash
lsof -ti:9099,8081,4000 | xargs kill -9
```

### Tests timeout waiting for emulators
**Fix:** Don't rely on `global-setup.ts` to auto-start emulators. Start them manually in Terminal 1 first — the global setup will detect and reuse them.

### Auth popup doesn't open
- Ensure dev server was started with `VITE_USE_EMULATORS=true`
- Verify Auth emulator is running: `curl -s http://localhost:9099` should return a response

### Firestore permission errors
- Verify Firestore emulator is running: `curl -s http://localhost:8081` should return a response
- Verify `VITE_USE_EMULATORS=true` is set — without it the app connects to **production** Firestore

### "strict mode violation: resolved to N elements"
A Playwright selector matched multiple DOM elements (often because a toast notification contains the same text). **Fix:** Use more specific locators:
```typescript
// Bad — matches toast + table cell
page.getByText('Burger')

// Good — scoped to table cell role
page.getByRole('cell', { name: 'Burger' })

// Good — scoped to heading role
page.getByRole('heading', { name: 'Vegas Weekend' })

// Good — scoped to parent element
page.locator('tr').filter({ has: page.getByPlaceholder('Enter item name') })
```

## Debugging Failed Tests

### Playwright UI Mode (recommended)

The best way to debug. Opens an interactive app with time-travel debugging:

```bash
npx playwright test e2e/bill-creation.spec.ts --ui
```

You can:
- Step through each action one at a time
- See a DOM snapshot at every step
- View browser console logs and network requests
- See exactly what the page looked like when an assertion failed

### Setting Breakpoints with `page.pause()`

Add `await page.pause()` anywhere in a test to freeze execution and open the **Playwright Inspector**:

```typescript
test('my test', async ({ page }) => {
  await loginAsTestUser(page);

  await page.getByText('Standard Bill').click();
  await page.waitForURL(/\/bill\//);

  await page.pause(); // ← BREAKPOINT: opens Inspector

  await page.getByRole('button', { name: 'Add Item' }).click();
});
```

Run with `--headed` so you can see the browser:
```bash
npx playwright test e2e/bill-creation.spec.ts --headed
```

In the Inspector window you can:
- **Step over** actions one by one
- **Pick elements** from the page to generate selectors
- **Run locator queries** in the console to test selectors
- **Resume** execution

### Inspecting the Database Mid-Test

While a test is running (or paused at `page.pause()`), open the **Firebase Emulator UI**:

```
http://localhost:4000
```

This gives you a live dashboard:
- **Firestore tab** → browse all collections (`bills`, `events`, `users`, `friend_balances`) and their documents in real time
- **Auth tab** → see all test users that were created during the test run

You can also query the emulator via curl:
```bash
# List all documents in the 'bills' collection
curl -s "http://localhost:8081/v1/projects/divit-6d217/databases/(default)/documents/bills" | python3 -m json.tool

# List all auth users created in the emulator
curl -s "http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/divit-6d217/accounts" | python3 -m json.tool
```

### Capturing Browser Console Logs

Add a `console` listener at the top of your test to pipe all browser logs to your terminal:

```typescript
test('debug my test', async ({ page }) => {
  page.on('console', msg => console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`));

  await loginAsTestUser(page);
  // ... all console.log, console.error from React will print here
});
```

### Traces (full recording on failure)

Capture a full trace with DOM snapshots, network, console, and action timeline:

```bash
npx playwright test e2e/bill-creation.spec.ts --trace on
```

After the run, open the trace viewer:
```bash
npx playwright show-trace test-results/<test-folder>/trace.zip
```

### Watching Tests Run

There are three ways to visually watch your tests execute, each suited to different needs.

#### Headed Mode (watch a real browser)

Opens a visible Chromium window so you can watch the test interact with the app in real time:

```bash
npx playwright test e2e/ --headed
```

#### Slow Motion (control the speed)

The `SLOW_MO` environment variable adds a delay (in milliseconds) between every Playwright action, so you can follow along:

```bash
# 500ms pause between each action — good default
SLOW_MO=500 npx playwright test e2e/ --headed

# 1 second between actions — easy to read every step
SLOW_MO=1000 npx playwright test e2e/ --headed

# Normal speed (no delay)
npx playwright test e2e/ --headed
```

This is configured in `playwright.config.ts` via `launchOptions.slowMo` and reads from the `SLOW_MO` env var, so no config changes are needed to adjust speed.

#### Recorded Videos (watch later at any speed)

Every test run automatically records a `.webm` video file. Videos are saved to `test-results/<test-name>/video.webm`.

```bash
# Run tests (videos are always recorded)
npx playwright test e2e/ --reporter=list

# Open a specific video
open test-results/bill-creation-Bill-Creatio-4d243-nts-through-the-full-wizard-chromium/video.webm
```

You can play them back in **QuickTime**, **VLC**, or any video player and adjust playback speed (0.5x, 0.25x, 2x, etc.) to watch at your own pace. This is especially useful for:
- Reviewing what happened in a failed test without re-running it
- Sharing test recordings with teammates
- Watching tests that ran in headless mode (CI, background runs)

Videos are configured in `playwright.config.ts` via `video: 'on'` in the `use` block.

### Quick Reference

| What you want | How |
|---|---|
| Step through a test visually | `npx playwright test --ui` |
| Watch tests live in a browser | `npx playwright test e2e/ --headed` |
| Slow down test execution | `SLOW_MO=500 npx playwright test e2e/ --headed` |
| Watch a recorded video | Open `test-results/<test>/video.webm` in any video player |
| Pause at a specific line | Add `await page.pause()` + run with `--headed` |
| Inspect Firestore data mid-test | Open `http://localhost:4000` → Firestore tab |
| See browser console output | Add `page.on('console', ...)` listener in test |
| Full trace on failure | Run with `--trace on`, then `npx playwright show-trace` |
| Test a locator interactively | Pause with `page.pause()`, type locators in Inspector console |

## Writing New Tests

1. **Import the auth helper:**
   ```typescript
   import { loginAsTestUser } from './helpers/auth';
   ```

2. **Sign in at the start of each test:**
   ```typescript
   test('my new test', async ({ page }) => {
     await loginAsTestUser(page);
     // ... test steps
   });
   ```

3. **Prefer `getByRole()` over `getByText()`** to avoid conflicts with toast notifications.

4. **Scope form inputs** to their parent container when multiple inputs share the same placeholder:
   ```typescript
   const row = page.locator('tr').filter({ has: page.getByPlaceholder('Enter item name') });
   await row.getByPlaceholder('0.00').fill('15.00');
   ```

5. **Desktop viewport** — Tests run at 1280×720. The bill wizard's "Next"/"Back" buttons are in the `StepFooter` component which only renders on desktop (`hidden md:block`).
