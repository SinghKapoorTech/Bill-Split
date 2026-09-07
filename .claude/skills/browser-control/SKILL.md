---
name: browser-control
description: >
  Read and act on pages in the user's real, logged-in browser — fill in form fields, click,
  select from dropdowns, upload/attach files, and drag images onto dropzones. Use when the
  user says "fill this out in my browser", "fill in this form for me", "click that",
  "upload this file to the site", "log in and then do X on this page", or points at a URL
  and asks for changes to be made there. Drives Opera/Chrome/Chromium via Playwright MCP
  over CDP. Do NOT use for App Store Connect metadata when the app-store-connect skill is
  configured — that path is an API and is strictly more reliable.
---

# Driving the user's real browser

Playwright MCP over CDP, against a browser the user launched with a debug port and logged
into by hand.

Runs on macOS, Windows and Linux. The launch step is the only part that ever differed by
OS, and it now lives in `scripts/browser-launch.mjs` as data rather than in prose — the
script finds the browser, launches it with the right flags, and waits for CDP. Everything
downstream is identical everywhere, because it is just HTTP to `127.0.0.1:9222`.

Verified end-to-end on **macOS** (Opera 135 / Chromium 151): launch → CDP → drive → real
page load. The **Windows and Linux binary paths have not been run** — they are the
standard install locations, and if one is wrong the script fails immediately, prints every
path it checked, and tells you to set `BROWSER_PATH`. Add the working path to `CANDIDATES`
the first time you hit it.

## Where this skill lives — installing it on another machine

This copy, in the repo, is **canonical**. It is self-contained: `SKILL.md`, both scripts,
and `references/recipes.md`. It works as-is for anyone who has the repo checked out.

To also make it available **outside this project** on a machine, copy it into the global
skills directory:

```bash
# macOS / Linux
mkdir -p ~/.claude/skills
cp -R .claude/skills/browser-control ~/.claude/skills/
```

```powershell
# Windows
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills"
Copy-Item -Recurse -Force .claude\skills\browser-control "$env:USERPROFILE\.claude\skills\"
```

Re-run that after editing here, or the global copy drifts. Nothing syncs it automatically,
and the global copy is not backed up by anything — this repo is the only durable home.

Requirements on a new machine: **Node** (for both scripts) and network access on first run
(the driver fetches Playwright MCP via `npx`). No MCP server registration, no Playwright
install, no other setup.

`scripts/browser-drive.mjs` also exists at the repo root for direct CLI use, documented by
`docs/browser-automation.md`. The skill keeps its own copy so it stays self-contained when
installed globally. Check they have not drifted:

```bash
diff .claude/skills/browser-control/scripts/browser-drive.mjs scripts/browser-drive.mjs
```

## Read this first — credential exposure

**Accessibility snapshots return form field _values_, including passwords in plaintext.**
Snapshotting a login page pulls credentials into the model context, the terminal
scrollback, and the session transcript on disk.

- When the user says they will log in, **wait for them to confirm they are past the login
  screen** before any snapshot.
- Never snapshot a page displaying a credential, payment, or similarly sensitive form.
- If it happens anyway: say so immediately, do **not** echo the value, tell the user which
  files hold it (`~/.claude/projects/*/<session>.jsonl` and scrollback), and recommend
  rotating the secret.

## Preflight

CDP is **startup-only** — you cannot attach to an already-running browser.

```bash
node <skill>/scripts/browser-launch.mjs
```

That is the whole launch step on every platform. It:

- exits early and changes nothing if CDP is already answering;
- finds Opera, then Chrome, Edge, Brave or Chromium, at the standard install path for
  the current OS (Opera on Windows lives under `LOCALAPPDATA\Programs`, **not** Program
  Files — the usual reason a hand-written Windows command fails);
- launches with a dedicated profile and waits up to 30s for the port to answer;
- fails loudly with every path it checked if no browser is found.

```bash
node <skill>/scripts/browser-launch.mjs --dry-run          # show the plan, launch nothing
node <skill>/scripts/browser-launch.mjs --browser chrome   # force a specific browser
BROWSER_PATH="/path/to/binary" node <skill>/scripts/browser-launch.mjs
```

Env: `CDP_PORT` (default 9222), `BROWSER_PATH`, `BROWSER_PROFILE_DIR`
(default `~/.claude-browser-profile`).

**Then the user logs in by hand.** Wait for them to confirm they are past the login screen.

To check by hand instead, or from a shell with no Node:

```bash
curl -s http://127.0.0.1:9222/json/version    # already up?
```

A **dedicated `--user-data-dir` is required**, not optional: Chromium 136+ ignores the
debug port on the default profile dir, and Opera/Brave/Vivaldi inherit that. It also
limits blast radius — the profile should hold only the logins being automated. The
launcher always passes one; do not "simplify" it away.

If the launcher reports the port never answered, the usual cause is that the same browser
is already running against that profile directory. Quit it fully, or point
`BROWSER_PROFILE_DIR` somewhere fresh.

## Driving it

Use `scripts/browser-drive.mjs` from this skill directory. **Run it from the project root**
— Playwright MCP sandboxes file reads to roots derived from the working directory, so
uploads fail with `outside allowed roots` from elsewhere.

```bash
node <skill>/scripts/browser-drive.mjs tools
node <skill>/scripts/browser-drive.mjs calls '[{"name":"browser_snapshot","arguments":{}}]'
node <skill>/scripts/browser-drive.mjs code  'async (page) => { return await page.title(); }'
```

No MCP server registration is needed — the script fetches Playwright MCP on demand via
`npx -y @playwright/mcp@latest`. It requires Node and network access on first run, and
honors `CDP_ENDPOINT` if the browser is on a non-default port or host.

Prefer the accessibility snapshot for targeting — it gives stable `ref`s. Fall back to
`code` mode (raw Playwright) whenever ref-based targeting fights you.

## Traps — every one of these cost real time in practice

1. **Refs are per-process.** `e234` / `f1e66` are valid only inside the snapshot that
   produced them. Snapshot and act **in the same invocation**; resolve refs by *label*,
   never hardcode across calls.
2. **Tab state doesn't persist.** A fresh process defaults to tab 0 regardless of what the
   browser shows, and `browser_tabs select` fails unless `list` ran first in that session.
   Simplest fix: keep the automation browser to one tab.
3. **Snapshot text escapes quotes.** The tree renders `button "iPhone 6.9\" Display"`, so
   `/button "iPhone 6\.9[^"]*Display"/` never matches — `[^"]*` stops at the backslash.
   Test line-substrings instead of spanning quotes.
4. **"First match after a heading" is often a different section.** Verify the section by
   its own content (a dimension hint, a label) before acting inside it.
5. **Never regex-test a truncated string.** `.slice(0,50)` then testing for a marker
   produces false negatives. Truncate only for display.
6. **Prefix matches bite.** `"Delete"` also matches a usually-disabled `"Delete All"`, so
   clicks silently do nothing. Use `exact: true`.
7. **Hover-revealed controls time out.** They resolve as locators but fail actionability.
   Bypass with `await locator.evaluate(el => el.click())`.
8. **Non-ASCII doesn't survive shell → argv → RegExp.** Use plain markers, or build the
   regex inside the script.
9. **Check tool schemas before calling.** e.g. `browser_drag` takes
   `startElement`/`startTarget`/`endElement`/`endTarget`, not `element`/`target`.
10. **SPAs need 10–15s to hydrate.** A 4s wait can return only nav and footer, which reads
    as "the fields are empty" when they simply had not rendered.
11. **Verify by reload, not by the call returning OK.** A tool result means the call was
    accepted, not that the value stuck. Reload and read values back; check counters and
    counts. Silent failures are the norm, not the exception.
12. **Paths in `code` mode must be absolute and native.** `setInputFiles` takes OS-native
    paths — a POSIX path fails on Windows. Build them with `path.resolve()` rather than
    string-concatenating, if this is ever run cross-platform.

## File uploads

Both work, and drops are indistinguishable from a human drag (`isTrusted: true`):

- `browser_file_upload` — click the trigger first, then supply `paths` while the file
  chooser modal is open.
- `browser_drop` — with `paths`, onto a dropzone.
- `setInputFiles` in `code` mode — works even on **hidden** inputs, which sidesteps
  visibility problems entirely. This is the most reliable option.

**Upload one file at a time when order matters.** Batch uploads land in *completion* order,
not filename order. Also watch for a **single shared file input** per page whose
destination depends on which section/accordion is expanded.

See `references/recipes.md` for known-good code.

## Scope

Not for: App Store Connect metadata when `app-store-connect` is configured (REST API,
deterministic, no session expiry). Use this only for the web-only screens there, or for
sites with no API.
