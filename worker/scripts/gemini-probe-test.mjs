#!/usr/bin/env node
// Quick sanity check for the REAL Gemini probe (worker/src/gemini.js).
//
// Run this on ONE OR TWO configs you can verify by hand BEFORE trusting a full
// re-check. It spins up the local proxy exactly the way the worker does and
// tells you the verdict for each config.
//
// Usage:
//   node --env-file-if-exists=.env scripts/gemini-probe-test.mjs "vless://..." "vmess://..."
//   node --env-file-if-exists=.env scripts/gemini-probe-test.mjs --file some-configs.txt
//
// Verdicts:
//   available      → tunnel lands in a Gemini-supported region (KEEP)
//   blocked        → "User location is not supported" (Gemini will NOT work)
//   prefilter-XX   → skipped: egress country XX is in the blocked list
//   proxy-not-up   → xray-knife didn't open the local proxy (check flags below)
//   spawn-error    → xray-knife binary not found / failed to start
//   probe-error / unknown → transient or non-geo error
//
// If you get proxy-not-up / spawn-error for everything, your xray-knife version
// likely uses different "proxy" flags — override in .env:
//   XRAY_KNIFE_PROXY_ARGS=proxy -c {URI} --inbound socks5://127.0.0.1:{PORT}
//   GEMINI_PROXY_SCHEME=socks5         # or: http
import { readFile } from 'node:fs/promises';
import { geminiCheckAll } from '../src/gemini.js';

const argv = process.argv.slice(2);
let uris = [];
const fileIdx = argv.indexOf('--file');
if (fileIdx >= 0) {
  const text = await readFile(argv[fileIdx + 1], 'utf8');
  uris = text.split(/\r?\n/).map((s) => s.trim()).filter((s) => /:\/\//.test(s));
} else {
  uris = argv.filter((a) => /:\/\//.test(a));
}

if (uris.length === 0) {
  console.error('No config URIs given. Pass them as arguments or use --file <path>.');
  process.exit(1);
}

console.log(`Probing ${uris.length} config(s) for REAL Gemini availability…\n`);
const results = await geminiCheckAll(uris, { concurrency: Math.min(4, uris.length) });

let ok = 0;
for (const r of results) {
  const mark = r.ok ? '✅' : '❌';
  if (r.ok) ok++;
  const short = r.uri.length > 60 ? r.uri.slice(0, 57) + '…' : r.uri;
  console.log(`${mark}  [${r.verdict.padEnd(14)}]  ${short}`);
}
console.log(`\n${ok}/${uris.length} actually reach Gemini.`);
process.exit(0);
