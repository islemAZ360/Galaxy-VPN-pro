import { createHash } from 'node:crypto';

const SCHEMES = ['vless://'];

export function looksLikeConfig(line) {
  if (!line.startsWith('vless://')) return false;
  try {
    const qIdx = line.indexOf('?');
    if (qIdx < 0) return false; // Missing query params
    const hIdx = line.indexOf('#');
    const queryStr = line.slice(qIdx + 1, hIdx >= 0 ? hIdx : undefined);
    const params = new URLSearchParams(queryStr);
    
    const type = (params.get('type') || 'tcp').toLowerCase();
    const security = (params.get('security') || '').toLowerCase();
    
    if (type !== 'tcp' && type !== 'grpc' && type !== 'ws') return false;
    if (security !== 'reality') return false;
    
    return true;
  } catch {
    return false;
  }
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

export function stripRemark(uri) {
  const scheme = (uri.split('://')[0] || '').toLowerCase();
  try {
    if (scheme === 'vmess') {
      const json = JSON.parse(Buffer.from(uri.slice('vmess://'.length), 'base64').toString('utf8'));
      delete json.ps;
      return 'vmess://' + Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
    }
    const hashIdx = uri.indexOf('#');
    return hashIdx >= 0 ? uri.slice(0, hashIdx) : uri;
  } catch {
    return uri;
  }
}

export function hashConfig(uri) {
  return createHash('sha256').update(uri).digest('hex');
}

// Extract unique config URIs from raw text.
export function extractConfigs(text) {
  const decoded = maybeDecodeBase64(text);
  const out = new Map(); // true_identity_hash -> uri
  for (let line of decoded.split(/\r?\n/)) {
    line = line.trim();
    
    // Postgres strict JSONB/Text safety: strip literal null bytes and \u0000 escape sequences
    // which cause "unsupported Unicode escape sequence" during Supabase upsert.
    // Also remove unpaired surrogates or weird escapes if any.
    line = line.replace(/\0/g, '').replace(/\\u0000/g, '');
    
    // Some configs might have invisible unicode chars or unpaired surrogates in remarks
    // A broader sanitize for \uXXXX where it's a null or unpaired surrogate
    line = line.replace(/\\uD[89A-F][0-9A-F]{2}/i, ''); // Strip high surrogates not followed by low
    
    if (!looksLikeConfig(line)) continue;
    // Deduplicate by core server identity, ignoring the remark
    out.set(hashConfig(stripRemark(line)), line);
  }
  return [...out.values()];
}

export const PROTOCOL_OF = (uri) => (uri.split('://')[0] || '').toLowerCase();
