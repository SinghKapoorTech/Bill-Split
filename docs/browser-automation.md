# Driving a real browser from Claude Code

How to let Claude read and act on pages in your **actual, logged-in browser** — filling
forms, clicking, selecting, and uploading files. Everything here was verified end-to-end
on macOS against Opera 135 (Chromium 151) on 2026-09-05.

## Why this setup

The requirement was "use my real browser with my sessions, and be able to attach files."
Off-the-shelf **Playwright MCP over CDP** does all of it. Nothing needed to be built —
no extension, no Tampermonkey script, no native messaging host.

Options that were considered and rejected:

| Approach | Why not |
|---|---|
| Tampermonkey userscript | Cannot produce `isTrusted: true` events; CDP can. Also can't reach `chrome.debugger`. |
| Tampermonkey (read) + `chrome.debugger` (write) | `chrome.debugger` is an extension API a userscript can't call, so it's two installs — and two element-identity spaces to reconcile. |
| MV3 extension + `chrome.debugger` | Just CDP with a yellow banner and an extension to maintain. |
| Native messaging host | Only needed to get file bytes past the extension sandbox. No extension → not needed. |
| `chrome-devtools-mcp` (Google) | **No file-drop tool** and silently fails on Opera. Do not use it for this. |
| Claude Code's built-in `--chrome` | Bridge is gated by a *server-side* flag that refuses non-Chrome browsers. Unusable in Opera regardless of local permissions. Revisit if Chrome is installed. |

## Setup

CDP is **startup-only** — you cannot attach to an already-running browser. Launch a
dedicated profile (keeps your everyday browser untouched and limits blast radius):

```bash
/Applications/Opera.app/Contents/MacOS/Opera \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.opera-claude-profile" \
  --no-first-run --no-default-browser-check
```

Then **log in by hand**. Chromium 136+ ignores the debug port on the *default* profile
dir, and Opera inherits that — hence the separate `--user-data-dir`.

Verify: `curl -s http://127.0.0.1:9222/json/version`

Drive it with `scripts/browser-drive.mjs`, or register the MCP server permanently:

```bash
claude mcp add playwright --scope user \
  -- npx -y @playwright/mcp@latest --cdp-endpoint http://127.0.0.1:9222
```

## Verified capabilities

- `DOM.setFileInputFiles` fills a real `<input type=file>`.
- `Input.dispatchDragEvent` drops files onto a dropzone, and the resulting event has
  **`isTrusted: true`** — indistinguishable from a human drag, so `isTrusted` checks
  don't defeat it.
- Logged-in sessions survive a profile copy (cookies decrypt via the login Keychain,
  which is keyed to the app, not the profile path).

## Mistakes made in practice (each one cost 15+ minutes)

These are real failures from the first session, not hypotheticals. Read them before
writing selector logic.

**Element refs are per-process.** A ref like `e234` or `f1e66` is only valid inside the
snapshot that produced it. Snapshot and act **in the same invocation**, or you get
`Ref not found`. Resolve refs by *label* from the live snapshot; never hardcode.

**Tab state doesn't persist across invocations.** A fresh MCP process defaults to tab 0
regardless of which tab the browser shows, and `browser_tabs select` fails unless `list`
ran first in the same session to populate the registry. Simplest fix: keep the automation
browser to **one tab**.

**Snapshot text escapes quotes — plain regexes silently fail.** The tree renders
`button "iPhone 6.9\" Display"`. A pattern like `/button "iPhone 6\.9[^"]*Display"/`
never matches, because `[^"]*` stops at the backslash-quote. The click silently never
fired and the accordion never expanded. Match on a line-substring test instead:

```js
const ref = snap.split('\n')
  .map(l => /button "iPhone 6\.9/.test(l) && l.match(/\[ref=(\S+?)\]/))
  .find(Boolean)?.[1];
```

**"First match after a heading" is not the same section.** Taking the first
`button "Choose File"` after the 6.9" label grabbed the *collapsed neighbour's* button
(6.5"), and the upload was rejected for wrong dimensions. **Verify the section by its own
content** — e.g. confirm the slot's dimension hint says `1320` — before acting on it.

**Don't regex-test a truncated string.** Extracting a label with `.slice(0, 50)` and then
testing it for `1320` produced a false "no target found" — the dimension text sat past
character 50. Test the full text; truncate only for display.

**Prefix matches bite.** `button "Delete"` also matches `button "Delete All"`, which is
usually disabled — so nine clicks did nothing and looked like the page ignoring us. Use
`exact: true`.

**Hover-revealed controls time out.** Buttons that only appear on hover resolve as
locators but fail Playwright's actionability check (`Timeout 30000ms exceeded`). Bypass:

```js
await locator.evaluate(el => el.click());
```

**Non-ASCII characters don't survive shell → argv → RegExp.** Passing `2064\s*×\s*2752`
as a shell argument produced a pattern that never matched. Use plain numeric markers
(`2064`) or build the regex inside the script.

**Check tool schemas before calling.** `browser_drag` takes
`startElement`/`startTarget`/`endElement`/`endTarget` — not `element`/`target`. Dump
`tools/list` once rather than guessing parameter names.

**SPAs need long waits.** ASC hydration took 10–15s; a 4s wait returned only nav and
footer, which reads as "the fields are empty" when they simply hadn't rendered.

**`timeout` is not on macOS by default.** Don't wrap commands in it.

## Known-good recipes

**Upload N files in a fixed order.** Batch uploads land in *completion* order, not
filename order. Upload one at a time, and note there may be a single shared file input
whose destination depends on which section is expanded. `setInputFiles` works on hidden
inputs, so visibility problems disappear:

```js
// via browser_run_code_unsafe
async (page) => {
  const files = ['/abs/01.png', '/abs/02.png'];
  let fr = null;
  for (const f of page.frames())
    if (await f.locator('input[type=file]').count().catch(() => 0)) { fr = f; break; }
  if (!fr) return 'no frame with a file input';

  // make sure the right section is active — verify by its own content
  const text = async () => (await fr.evaluate(() => document.body.innerText)) || '';
  if (!/1320/.test(await text())) {
    const btn = fr.getByRole('button', { name: /6\.9/ }).first();
    if (await btn.count()) { await btn.evaluate(el => el.click()); await page.waitForTimeout(3500); }
  }
  if (!/1320/.test(await text())) return 'wrong section still active';

  const input = fr.locator('input[type=file]').first();
  for (const f of files) { await input.setInputFiles(f); await page.waitForTimeout(6000); }
  return 'ok';
}
```

**Delete every item in a list** (hover-hidden controls, exact name):

```js
async (page) => {
  let n = 0;
  for (let i = 0; i < 15; i++) {
    const btns = page.getByRole('button', { name: 'Delete', exact: true });
    if (await btns.count() === 0) break;
    await btns.first().evaluate(el => el.click());
    n++; await page.waitForTimeout(2000);
  }
  return 'deleted=' + n;
}
```

**Fill fields by label, resolved live.** Never hardcode refs across calls:

```js
// note the doubled backslashes: this is a regex built from a JS string
const refOf = label => snap.match(
  new RegExp('textbox "' + label + '"[^\\n]*?\\[ref=(e\\d+)\\]'))?.[1];
```

**Always verify by reload, not by the write succeeding.** A tool returning `OK` means the
call was accepted, not that the value stuck. Reload the page, read the values back, and
check any character-counter / count indicators. Two real bugs — an upload rejected for
dimensions, and nine deletes that did nothing — reported success and only showed up on
re-read.

## Security

**Accessibility snapshots include field _values_, including passwords in plaintext.**
Snapshotting a login page pulls the credentials into the model's context and the session
transcript. Rule: **log in first, confirm you're past the login screen, then snapshot.**
This happened once in practice and required a password rotation.

Give the automation profile only the logins it needs. A dedicated profile is all-or-nothing
per site, but far better than exposing every session in your daily browser.

## Focus stealing

Routine CDP operations (snapshot, click, navigate, tab select) do **not** raise the
browser window — measured across five operation types, the browser was never frontmost
afterward. What does grab focus is the initial launch and file-chooser clicks. For fully
background operation, log in headful, quit, then relaunch with `--headless=new` against
the same `--user-data-dir`; the session persists in the profile.
