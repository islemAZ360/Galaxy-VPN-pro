#!/usr/bin/env node
// Quick sanity check for the REAL Gemini classification (worker/src/gemini.js).
//
// Run this on a few configs you can verify by hand BEFORE trusting a full
// re-check. It uses the exact same pipeline the worker does (fast batched
// egress-country pass, then a precise per-config probe for unknowns).
//
// Usage:
//   node --env-file-if-exists=.env scripts/gemini-probe-test.mjs "vless://..." "vmess://..."
//   node --env-file-if-exists=.env scripts/gemini-probe-test.mjs --file some-configs.txt
//
// Verdicts:
//   country-XX   → exit IP is in country XX, a Gemini-supported region (KEEP)
//   available    → precise probe confirmed Gemini works (KEEP)
//   blocked-XX   → exit IP is in unsupported country XX (Gemini won't work)
//   dead         → server didn't connect at all
//   probe-error  → connected but the Gemini request failed (treated as no)
//   no-binary    → xray-knife not found (set XRAY_KNIFE_PATH)
//
// If everything is "dead"/"probe-error", your xray-knife "proxy" flags may
// differ — override XRAY_KNIFE_PROXY_ARGS / GEMINI_PROXY_SCHEME (see .env.example).
import { readFile } from 'node:fs/promises';
import { classifyGeminiPool } from '../src/gemini.js';

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

console.log(`Classifying ${uris.length} config(s) for REAL Gemini availability…\n`);
const results = await classifyGeminiPool(uris, {
  onProgress: (pct, label) => process.stdout.write(`\r  ${pct.toFixed(0)}% — ${label}            `),
});
console.log('\n');

let ok = 0;
for (const r of results) {
  const mark = r.ok ? '✅' : '❌';
  if (r.ok) ok++;
  const short = r.uri.length > 60 ? r.uri.slice(0, 57) + '…' : r.uri;
  console.log(`${mark}  [${r.verdict.padEnd(14)}]  ${short}`);
}
console.log(`\n${ok}/${uris.length} actually reach Gemini.`);
process.exit(0);
