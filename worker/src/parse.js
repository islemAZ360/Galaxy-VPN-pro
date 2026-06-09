import { createHash } from 'node:crypto';

const SCHEMES = ['vless://', 'vmess://', 'trojan://', 'ss://', 'ssr://', 'hysteria2://', 'hy2://', 'tuic://'];

function looksLikeConfig(line) {
  return SCHEMES.some((s) => line.startsWith(s));
}

// A subscription file may be plain text OR base64 of the whole list. Handle both.
function maybeDecodeBase64(text) {
  const trimmed = text.trim();
  if (looksLikeConfig(trimmed.split(/\s+/)[0] || '')) return text; // already plain
  // try base64 decode of the entire blob
  try {
    const decoded = Buffer.from(trimmed.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (SCHEMES.some((s) => decoded.includes(s))) return decoded;
  } catch { /* ignore */ }
  return text;
}

export function hashConfig(uri) {
  return createHash('sha256').update(uri).digest('hex');
}

// Extract unique config URIs from raw text.
export function extractConfigs(text) {
  const decoded = maybeDecodeBase64(text);
  const out = new Map(); // hash -> uri
  for (let line of decoded.split(/\r?\n/)) {
    line = line.trim();
    if (!looksLikeConfig(line)) continue;
    out.set(hashConfig(line), line);
  }
  return [...out.values()];
}

export const PROTOCOL_OF = (uri) => (uri.split('://')[0] || '').toLowerCase();
