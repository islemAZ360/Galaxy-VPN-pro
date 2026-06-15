// Truecolor, aligned, galaxy-themed logger for the live worker terminal.
// (Windows Terminal / modern conhost support 24-bit color; start-worker.bat
//  enables VT processing, so these render correctly.)

const e = (n) => `\x1b[${n}m`;
const reset = e(0);
const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;

const C = {
  reset,
  bold: e(1),
  dim: e(2),
  violet: fg(167, 139, 250),
  magenta: fg(232, 121, 249),
  cyan: fg(56, 211, 238),
  green: fg(74, 222, 128),
  amber: fg(251, 191, 36),
  red: fg(248, 113, 113),
  gray: fg(122, 124, 148),
  white: fg(236, 237, 248),
};

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

// Smooth multi-stop gradient (violet → magenta → cyan) across `w` characters.
function gradient(w, char) {
  const stops = [
    [167, 139, 250],
    [232, 121, 249],
    [56, 211, 238],
  ];
  let s = '';
  for (let i = 0; i < w; i++) {
    const t = w > 1 ? i / (w - 1) : 0;
    const seg = t * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(seg));
    const f = seg - k;
    const a = stops[k];
    const b = stops[k + 1];
    s += fg(lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)) + char;
  }
  return s + C.reset;
}

const ts = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const GUTTER = `${C.gray}│${C.reset}`;

const out = (icon, color, msg) => {
  process.stdout.write('\r\x1b[K'); // clear any live progress line first
  console.log(`${C.gray}${ts()}${C.reset} ${GUTTER} ${color}${icon}${C.reset} ${msg}`);
};

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let frame = 0;

export const log = {
  info: (m) => out('•', C.cyan, m),
  ok: (m) => out('✓', C.green, m),
  warn: (m) => out('▲', C.amber, m),
  err: (m) => out('✗', C.red, m),
  step: (m) => out('▸', C.violet, `${C.white}${m}${C.reset}`),
  bell: (m) => out('◆', C.amber, m),
  done: (m) => out('✦', C.magenta, `${C.bold}${C.white}${m}${C.reset}`),

  // Smooth gradient progress bar with an animated spinner; overwrites its line.
  progress: (pct, msg) => {
    const p = Math.max(0, Math.min(100, pct));
    const w = 28;
    const filled = Math.round((p / 100) * w);
    const bar = gradient(filled, '█') + `${C.gray}${'░'.repeat(w - filled)}${C.reset}`;
    const spin = SPIN[frame++ % SPIN.length];
    process.stdout.write(
      `\r${C.gray}${ts()}${C.reset} ${GUTTER} ${C.cyan}${spin}${C.reset} ${bar} ` +
        `${C.white}${C.bold}${p.toFixed(0).padStart(3)}%${C.reset} ${C.dim}${msg}${C.reset}\x1b[K`
    );
  },
  clearProgress: () => {
    process.stdout.write('\r\x1b[K');
  },
};

export function banner() {
  const rule = gradient(58, '━');
  console.log('');
  console.log('  ' + rule);
  console.log(
    `  ${C.bold}${C.white}🌌  GalaxyVPN${C.reset}  ${C.gray}·${C.reset}  ` +
      `${C.violet}${C.bold}Tester Worker${C.reset}`
  );
  console.log(
    `  ${C.dim}Real-test via xray-knife  ·  Russia-side  ·  Realtime triggers${C.reset}`
  );
  console.log('  ' + rule);
  console.log('');
}
