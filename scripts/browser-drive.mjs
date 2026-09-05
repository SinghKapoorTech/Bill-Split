#!/usr/bin/env node
/**
 * Drive a real, logged-in browser from the command line via Playwright MCP over CDP.
 *
 * Prereq: launch the browser with a dedicated profile and the debug port open:
 *   /Applications/Opera.app/Contents/MacOS/Opera \
 *     --remote-debugging-port=9222 --user-data-dir="$HOME/.opera-claude-profile" \
 *     --no-first-run --no-default-browser-check
 * Then log in by hand. CDP is startup-only — you cannot attach to an already-running browser.
 *
 * Usage:
 *   node scripts/browser-drive.mjs calls '[{"name":"browser_snapshot","arguments":{}}]'
 *   node scripts/browser-drive.mjs code  'async (page) => { return await page.title(); }'
 *   node scripts/browser-drive.mjs code  --file ./my-playwright-snippet.js
 *
 * IMPORTANT: run from the repo root. Playwright MCP sandboxes file reads to roots
 * derived from its working directory, so uploads of repo files fail from elsewhere.
 */
import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const [mode, ...rest] = process.argv.slice(2);

if (!mode || !['calls', 'code', 'tools'].includes(mode)) {
  console.error('usage: browser-drive.mjs <calls|code|tools> [payload]');
  process.exit(2);
}

const proc = spawn('npx', ['-y', '@playwright/mcp@latest', '--cdp-endpoint', ENDPOINT],
  { stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '', id = 0;
const pending = new Map();
proc.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (m.id && pending.has(m.id)) { const { res } = pending.get(m.id); pending.delete(m.id); res(m); }
    } catch { /* non-JSON server chatter */ }
  }
});

const rpc = (method, params) => new Promise(res => {
  const n = ++id; pending.set(n, { res });
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
});
const call = async (name, args = {}) => {
  const r = await rpc('tools/call', { name, arguments: args });
  return { text: (r.result?.content || []).map(c => c.text || '').join('\n'), isError: !!r.result?.isError };
};

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'browser-drive', version: '1' } });
proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

if (mode === 'tools') {
  const t = await rpc('tools/list', {});
  console.log(t.result.tools.map(x => x.name).join('\n'));
} else if (mode === 'code') {
  const code = rest[0] === '--file' ? readFileSync(rest[1], 'utf8') : rest[0];
  const r = await call('browser_run_code_unsafe', { code });
  console.log(r.text.split('### Ran')[0].trim());
} else {
  // NOTE: element refs (e12, f1e34) are only valid within THIS process's snapshot.
  // Always snapshot and act in the same invocation.
  for (const c of JSON.parse(rest[0])) {
    const r = await call(c.name, c.arguments || {});
    console.log(`\n===== ${c.name} =====`);
    console.log(r.text.slice(0, c.limit || 6000));
    if (r.isError) console.log('[isError=true]');
  }
}

proc.kill();
process.exit(0);
