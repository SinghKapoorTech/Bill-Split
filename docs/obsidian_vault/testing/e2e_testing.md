---
title: E2E Testing Guide
date: 2026-03-09
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

You need **2 terminals** running simultaneously (emulators auto-start via `global-setup.ts` if not already running):

### Terminal 1 — Dev Server (with emulators)
```bash
VITE_USE_EMULATORS=true npm run dev
```
The `VITE_USE_EMULATORS=true` flag tells the app to connect to local emulators instead of production Firebase (see [[../backend/cloud_functions|Cloud Functions]]).

> **Recommended**: Start the emulators manually in a separate terminal first (`firebase emulators:start --only auth,firestore`), then run the tests. `global-setup.ts` will detect and reuse them.

### Terminal 2 — Run Tests
```bash
# Run all tests
npx playwright test --reporter=list

# Run a single test file
npx playwright test e2e/bill-wizard.spec.ts --reporter=list

# Run with headed browser (see the browser)
npx playwright test --headed

# Run with Playwright UI mode (interactive debugging)
npx playwright test --ui
```

## How the Cold Start is Handled

The Firebase Auth Emulator has a ~20-40s cold start on the first login of a test run. To mitigate this, `global-setup.ts` performs a **warm-up login** before any tests execute:

```
global-setup runs ONCE before any tests:
  1. Start/verify emulators are running
  2. Launch a headless browser, do the full Auth popup flow
  3. Navigate to /dashboard (warms up Auth emulator + Firestore connections)
  4. Close browser → tests start with a warm emulator
```

This reduces each test's login time from ~20-40s (cold) to ~2-7s (warm).

> **Note:** Firebase Auth tokens are stored in IndexedDB, which Playwright's `storageState` cannot capture. The warm-up approach is the correct solution for Firebase + Playwright.

## Architecture

```
e2e/
├── helpers/
│   ├── auth.ts              # loginAsTestUser — Auth emulator popup flow
│   ├── bill.ts              # createStandardBill, addGuestPeopleToBill, splitEvenlyAndGoToReview
│   └── event.ts             # createEventWithMembers, createBillInEvent
├── global-setup.ts          # Start/verify emulators + warm-up login before tests
├── login.spec.ts            # Landing → Auth page → Google sign-in button UI
├── events.spec.ts           # Event CRUD (create, navigate to detail)
├── settle-bill.spec.ts      # Bill-level settlement flow (Settle + event balance update)
├── bill-wizard.spec.ts      # Full 4-step bill wizard (items → guests → split → review)
├── bill-settlement.spec.ts  # Settle + Undo settle in SplitSummary
└── dashboard-bills.spec.ts  # Dashboard structure + My Bills section load
```

### How Authentication Works in Tests

The Firebase Auth Emulator provides its own popup UI. When the app calls `signInWithPopup(auth, googleProvider)`, instead of redirecting to Google, it opens the emulator's auth page at `localhost:9099`.

The test helper (`e2e/helpers/auth.ts`) automates this:
1. Navigates to `/auth`
2. Clicks "Sign in with Google"
3. In the emulator popup: clicks **"Add new account"** → **"Auto-generate"** → **"Sign in"**
4. Waits for redirect to `/dashboard`

This creates a real Firebase Auth user in the emulator, so Firestore security rules work correctly.

Each test creates its **own fresh user** via the emulator, so tests are fully isolated.

### Key Config Files

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Test runner config — 1280×720 viewport, **90s timeout**, 1 retry, emulator-aware dev server |
| `e2e/global-setup.ts` | Starts/detects emulators + warm-up login |
| `firebase.json` → `emulators` | Emulator port configuration (auth: 9099, firestore: 8081, ui: 4000) |
| `src/config/firebase.ts` | Connects to emulators when `VITE_USE_EMULATORS=true` |

## Test Coverage

| Test File | Flow Tested | Key Assertions |
|-----------|-------------|----------------|
| `login.spec.ts` | Login UI (unauthenticated state) | Landing page → Sign In → /auth → Google button visible |
| `events.spec.ts` | [[../database/events\|Events]] CRUD | Create event → view event detail; header + button flow |
| `settle-bill.spec.ts` | Bill-level settlement | Create bill → mark settled → verify badge + event balance updates |
| `bill-wizard.spec.ts` | Full wizard flow | Items → [[../ui/add_people\|InlinePersonSearch guests]] → Split Evenly → review totals |
| `bill-settlement.spec.ts` | Settle + Undo in SplitSummary | Settle → green badge; Undo → badge disappears |
| `dashboard-bills.spec.ts` | Dashboard structure | Welcome back + My Bills + Friend Balances visible after login |

## Helpers Reference

### `auth.ts` — `loginAsTestUser(page)`
Navigates to `/auth`, does the full Firebase Auth emulator popup flow, and waits for `/dashboard`. Each call creates a fresh emulator user.

### `bill.ts`
| Helper | Description |
|---|---|
| `createStandardBill(page)` | Clicks "Standard" on dashboard → waits for bill entry page |
| `addItemsToBill(page, items)` | Adds line items (name + price) in Bill Entry step |
| `addGuestPeopleToBill(page, names)` | Types each name into `InlinePersonSearch` and selects "Add X as guest" |
| `splitEvenlyAndGoToReview(page)` | Clicks Split Evenly in Assignment step → navigates to Review |

### `event.ts`
| Helper | Description |
|---|---|
| `createEventWithMembers(page, name, description, members)` | Creates event via Events page, adds members by email, returns event URL |
| `createBillInEvent(page, items, guestNames)` | Starts bill from event detail, adds items + guests, splits evenly. Returns on Review step |

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
**Fix:** Start emulators manually first (`firebase emulators:start --only auth,firestore`), then run tests. The global setup will detect and reuse them instead of trying to auto-start.

### Auth popup doesn't open
- Ensure dev server was started with `VITE_USE_EMULATORS=true`
- Verify Auth emulator is running: `curl -s http://localhost:9099` should return a response

### Firestore permission errors
- Verify Firestore emulator is running: `curl -s http://localhost:8081` should return a response
- Verify `VITE_USE_EMULATORS=true` is set — without it the app connects to **production** Firestore

### "strict mode violation: resolved to N elements"
A Playwright selector matched multiple DOM elements. **Fix:** Use more specific locators:
```typescript
// Bad — matches toast + heading
page.getByText('Vegas Weekend')

// Good — scoped to heading role
page.getByRole('heading', { name: 'Vegas Weekend' })

// Good — scoped to parent card
page.locator('.rounded-xl').filter({ hasText: 'Charlie' })
```

## Debugging Failed Tests

### Playwright UI Mode (recommended)

The best way to debug. Opens an interactive app with time-travel debugging:

```bash
npx playwright test e2e/bill-wizard.spec.ts --ui
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

  await page.goto('/events');
  await page.pause(); // ← BREAKPOINT: opens Inspector

  // ...
});
```

Run with `--headed` so you can see the browser:
```bash
npx playwright test e2e/bill-wizard.spec.ts --headed
```

### Inspecting the Database Mid-Test

While a test is running (or paused at `page.pause()`), open the **Firebase Emulator UI**:

```
http://localhost:4000
```

This gives you a live dashboard:
- **Firestore tab** → browse all collections (`bills`, `events`, `users`, `friend_balances`) and their documents in real time
- **Auth tab** → see all test users that were created during the test run

### Capturing Browser Console Logs

Add a `console` listener at the top of your test to pipe all browser logs to your terminal:

```typescript
test('debug my test', async ({ page }) => {
  page.on('console', msg => console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`));

  await loginAsTestUser(page);
  // ... all console.log, console.error from React will print here
});
```

### Watching Tests Run

#### Headed Mode (watch a real browser)

Opens a visible Chromium window so you can watch the test interact with the app in real time:

```bash
npx playwright test --headed
```

#### Slow Motion (control the speed)

The `SLOW_MO` environment variable adds a delay (in milliseconds) between every Playwright action:

```bash
# 500ms pause between each action — good default
SLOW_MO=500 npx playwright test --headed

# 1 second between actions — easy to read every step
SLOW_MO=1000 npx playwright test --headed
```

#### Recorded Videos (watch later at any speed)

Every test run automatically records a `.webm` video file. Videos are saved to `test-results/<test-name>/video.webm`:

```bash
# Run tests (videos are always recorded)
npx playwright test --reporter=list

# Open a specific video
open test-results/bill-wizard-Bill-Wizard-3fd62-ignment-via-the-full-wizard-chromium/video.webm
```

### Quick Reference

| What you want | How |
|---|---|
| Step through a test visually | `npx playwright test --ui` |
| Watch tests live in a browser | `npx playwright test --headed` |
| Slow down test execution | `SLOW_MO=500 npx playwright test --headed` |
| Watch a recorded video | Open `test-results/<test>/video.webm` in any video player |
| Pause at a specific line | Add `await page.pause()` + run with `--headed` |
| Inspect Firestore data mid-test | Open `http://localhost:4000` → Firestore tab |
| See browser console output | Add `page.on('console', ...)` listener in test |

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

3. **For tests that create events or bills, use the shared helpers:**
   ```typescript
   import { createEventWithMembers, createBillInEvent } from './helpers/event';

   test('bill in event', async ({ page }) => {
     await loginAsTestUser(page);
     await createEventWithMembers(page, 'My Trip', 'description', ['friend@example.com']);
     await createBillInEvent(page, [{ name: 'Hotel', price: '100.00' }], ['Alice']);
     // now on Review step
   });
   ```

4. **Prefer `getByRole()` over `getByText()`** to avoid conflicts with toast notifications.

5. **Scope card locators** to `.rounded-xl` containers for SplitSummary person rows:
   ```typescript
   const personCard = page.locator('.rounded-xl').filter({ hasText: 'Alice' }).first();
   await personCard.getByRole('button', { name: 'Settle' }).click();
   ```

6. **Desktop viewport** — Tests run at 1280×720. The bill wizard's "Next"/"Back" buttons are in the `StepFooter` component which only renders on desktop (`hidden md:block`).

7. **Long-running tests** — The global 90s timeout covers auth + event creation. If your test does multiple complex flows, consider increasing with `test.setTimeout(120000)`.
