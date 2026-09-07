# Known-good recipes

All verified against a live site.

## Upload N files in a fixed order

Handles: shared file input, section-decides-destination, hidden inputs, order preservation.

```js
// browser-drive.mjs code '<this>'
async (page) => {
  const files = ['/abs/01.png', '/abs/02.png'];
  let fr = null;
  for (const f of page.frames())
    if (await f.locator('input[type=file]').count().catch(() => 0)) { fr = f; break; }
  if (!fr) return 'no frame with a file input';

  // confirm the intended section is active, by its own content
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

## Delete every item in a list (hover-hidden controls)

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

## Resolve a ref by label, live

```js
// note the doubled backslashes: regex built from a JS string
const refOf = label => snap.match(
  new RegExp('textbox "' + label + '"[^\\n]*?\\[ref=(e\\d+)\\]'))?.[1];
```

## Fill many fields from a source file

Parse the values, resolve each ref from the *same* snapshot, type, then reload and verify
against character counters or equivalent indicators.

## Expand a collapsed accordion whose label contains an escaped quote

```js
const ref = snap.split('\n')
  .map(l => /button "iPhone 6\.9/.test(l) && l.match(/\[ref=(\S+?)\]/))
  .find(Boolean)?.[1];
```
