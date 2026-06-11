// Tiny colored, timestamped logger for the live terminal.
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgPurple: '\x1b[45m',
};

const ts = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

const out = (icon, color, msg) =>
  console.log(`${C.dim}${ts()}${C.reset} ${color}${icon}${C.reset}  ${msg}`);

export const log = {
  info: (m) => out('ℹ', C.cyan, m),
  ok: (m) => out('✓', C.green, m),
  warn: (m) => out('⚠', C.yellow, m),
  err: (m) => out('✖', C.red, m),
  step: (m) => out('▸', C.magenta, m),
  bell: (m) => out('🔔', C.yellow, m),
  done: (m) => out('✨', C.green, m),
  // Progress bar that overwrites the current line
  progress: (pct, msg) => {
    const w = 40;
    const filled = Math.round((pct / 100) * w);
    const bar = '█'.repeat(filled) + '░'.repeat(w - filled);
    process.stdout.write(`\r${C.dim}${ts()}${C.reset} ${C.cyan}⏳${C.reset}  [${C.cyan}${bar}${C.reset}] ${pct.toFixed(1)}% — ${msg}`);
  },
  clearProgress: () => {
    process.stdout.write('\r\x1b[K'); // clear line
  }
};

export function banner() {
  const line = '═'.repeat(56);
  console.log(`${C.magenta}╔${line}╗`);
  console.log(`║${C.reset}${C.bold}        🌌  GalaxyVPN  —  Tester Worker  🌌            ${C.magenta}║`);
  console.log(`╚${line}╝${C.reset}`);
  console.log(`${C.dim}Real-test mode via xray-knife · Russia-side · Realtime triggers${C.reset}\n`);
}
