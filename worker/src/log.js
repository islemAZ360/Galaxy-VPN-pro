// Truecolor, aligned, galaxy-themed logger for the live worker terminal.
// (Windows Terminal / modern conhost support 24-bit color; start-worker.bat
//  enables VT processing, so these render correctly.)

const e = (n) => `\x1b[${n}m`;
const reset = e(0);
const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bg = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;

export const C = {
  reset,
  bold: e(1),
  dim: e(2),
  italic: e(3),
  violet: fg(167, 139, 250),
  magenta: fg(232, 121, 249),
  cyan: fg(56, 211, 238),
  green: fg(74, 222, 128),
  emerald: fg(16, 185, 129),
  amber: fg(251, 191, 36),
  red: fg(248, 113, 113),
  gray: fg(148, 163, 184),
  white: fg(248, 250, 252),
  bgRed: bg(220, 38, 38) + fg(255, 255, 255),
  bgGreen: bg(22, 163, 74) + fg(255, 255, 255),
  bgAmber: bg(217, 119, 6) + fg(255, 255, 255),
  bgViolet: bg(124, 58, 237) + fg(255, 255, 255),
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

export const ts = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const GUTTER = `${C.gray}│${C.reset}`;

// Auto-colorize numbers and keywords to make the console extremely readable and beautiful
function highlight(msg) {
  if (typeof msg !== 'string') return String(msg);
  let s = msg;
  // Numbers (only if not preceded by # so we don't mess up IDs)
  s = s.replace(/(?<!#)\b(\d+)\b/g, `${C.cyan}${C.bold}$1${C.reset}`);
  // Specific keywords
  s = s.replace(/\b(Wi-Fi|WIFI|LTE|Gemini|GitHub|Supabase|VPN)\b/gi, (match) => {
    const m = match.toLowerCase();
    if (m === 'wifi' || m === 'wi-fi') return `${C.cyan}${C.bold}${match}${C.reset}`;
    if (m === 'lte') return `${C.amber}${C.bold}${match}${C.reset}`;
    if (m === 'gemini') return `${C.magenta}${C.bold}${match}${C.reset}`;
    if (m === 'vpn') return `${C.red}${C.bold}${match}${C.reset}`;
    return `${C.violet}${C.bold}${match}${C.reset}`;
  });
  return s;
}

const out = (icon, iconColor, textColor, msg) => {
  process.stdout.write('\r\x1b[K'); // clear any live progress line first
  const hlMsg = textColor ? highlight(msg) : msg;
  console.log(`${C.gray}${ts()}${C.reset} ${GUTTER} ${iconColor}${icon}${C.reset}  ${textColor}${hlMsg}${C.reset}`);
};

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let frame = 0;
let lastProgress = -1;

export const log = {
  info: (m) => out('•', C.cyan, C.gray, m), // Dim grey for text, cyan for icon/keywords
  ok: (m) => out('✓', C.emerald, C.green, m), // Bright green
  warn: (m) => out('▲', C.amber, C.amber, m),
  err: (m) => out('✗', C.red, C.red + C.bold, m),
  step: (m) => {
    console.log('');
    out('▸', C.violet, C.violet + C.bold, m);
  },
  bell: (m) => out('◆', C.amber, C.amber + C.bold, m),
  done: (m) => {
    console.log('');
    out('✦', C.magenta, C.magenta + C.bold, m);
  },

  // Beautiful bordered panel for major alerts (VPN on/off)
  panel: (title, lines, color) => {
    console.log('');
    const w = 65;
    const pad = (s, len) => {
      // strip ANSI to count visible length
      const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
      const space = Math.max(0, len - visible.length);
      return s + ' '.repeat(space);
    };
    
    console.log(`  ${C.gray}╭${'─'.repeat(w)}╮${C.reset}`);
    console.log(`  ${C.gray}│ ${color}${C.bold}${pad(highlight(title), w - 2)}${C.reset} ${C.gray}│${C.reset}`);
    console.log(`  ${C.gray}├${'─'.repeat(w)}┤${C.reset}`);
    for (const line of lines) {
      console.log(`  ${C.gray}│ ${color}${pad(highlight(line), w - 2)}${C.reset} ${C.gray}│${C.reset}`);
    }
    console.log(`  ${C.gray}╰${'─'.repeat(w)}╯${C.reset}`);
    console.log('');
  },

  // Animated countdown
  countdown: async (seconds) => {
    const isCI = process.env.CI || !process.stdout.isTTY;
    if (isCI) {
      log.info(`Waiting ${seconds}s...`);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      return;
    }
    for (let i = seconds; i > 0; i--) {
      process.stdout.write(`\r${C.gray}${ts()}${C.reset} ${GUTTER} ${C.amber}⏳${C.reset}  ${C.amber}Waiting ${i}s...${C.reset}\x1b[K`);
      await new Promise(r => setTimeout(r, 1000));
    }
    process.stdout.write('\r\x1b[K');
  },

  // Smooth gradient progress bar with an animated spinner; overwrites its line.
  progress: (pct, msg) => {
    const p = Math.max(0, Math.min(100, pct));
    const isCI = process.env.CI || !process.stdout.isTTY;
    
    if (isCI) {
      if (p === 0) lastProgress = -1;
      const rounded = Math.floor(p / 10) * 10;
      if (rounded > lastProgress) {
        out('▸', C.cyan, C.gray, `Progress: ${rounded.toString().padStart(3, ' ')}%  ${msg}`);
        lastProgress = rounded;
      }
      return;
    }

    const w = 28;
    const filled = Math.round((p / 100) * w);
    const bar = gradient(filled, '━') + `${C.gray}${'━'.repeat(w - filled)}${C.reset}`;
    const spin = SPIN[frame++ % SPIN.length];
    
    // Highlight message
    const hlMsg = highlight(msg);

    process.stdout.write(
      `\r${C.gray}${ts()}${C.reset} ${GUTTER} ${C.cyan}${spin}${C.reset} ${bar} ` +
        `${C.white}${C.bold}${p.toFixed(0).padStart(3)}%${C.reset}  ${C.gray}${hlMsg}${C.reset}\x1b[K`
    );
  },
  clearProgress: () => {
    const isCI = process.env.CI || !process.stdout.isTTY;
    if (!isCI) process.stdout.write('\r\x1b[K');
  },
};

export function banner() {
  const rule = gradient(65, '━');
  console.log('');
  console.log('  ' + rule);
  console.log(
    `  ${C.bold}${C.white}🌌 GalaxyVPN${C.reset}  ${C.gray}•${C.reset}  ` +
      `${C.bgViolet} Tester Worker ${C.reset}`
  );
  console.log(
    `  ${C.gray}Real-test via xray-knife  •  Russia-side  •  Realtime triggers${C.reset}`
  );
  console.log('  ' + rule);
  console.log('');
}
