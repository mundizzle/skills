// Show a Markdown file in this terminal pane, GitHub-style, as kitty-protocol images in normal scrollback.
// Redraws when the file changes or the pane is resized. Keys: r redraw, q quit.
// Usage: node mdview.mjs <file.md> | --notes [--print]
//   --notes  open this folder's notes file (see notesPath below); --print only prints its path.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, watch, readdirSync, existsSync, readFileSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const real = (p) => { try { return realpathSync(p); } catch { return p; } };
const tilde = (p) => (p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p);

// Notes location, by folder. In a git repository the base is the primary checkout, so every worktree
// shares one file; elsewhere it is the current folder. ~/.config/mdview/config.json may set:
//   { "notes": { "repo": ".scratch/notes.md", "other": "~/notes.md", "paths": { "~/Projects/X": "docs/notes.md" } } }
// "paths" keys are folders; the longest one containing the base (or the current folder) wins.
// A relative value is resolved against the base.
function notesPath() {
  let cfg = {};
  const cfgFile = join(homedir(), '.config/mdview/config.json');
  if (existsSync(cfgFile)) cfg = JSON.parse(readFileSync(cfgFile, 'utf8')).notes ?? {};
  let base = real(process.cwd()), inRepo = false;
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (basename(common) === '.git') { base = dirname(common); inRepo = true; }
  } catch {}
  const within = (dir, p) => p === dir || p.startsWith(dir + '/');
  const hit = Object.entries(cfg.paths ?? {}).map(([k, v]) => [real(resolve(tilde(k))), v])
    .filter(([k]) => within(k, base) || within(k, real(process.cwd()))).sort((a, b) => b[0].length - a[0].length)[0];
  const value = tilde(hit?.[1] ?? (inRepo ? cfg.repo ?? '.scratch/notes.md' : cfg.other ?? '~/notes.md'));
  return { path: isAbsolute(value) ? value : join(base, value), base };
}

const argv = process.argv.slice(2);
let file;
if (argv[0] === '--notes') {
  const n = notesPath();
  file = n.path;
  if (argv.includes('--print')) { console.log(file); process.exit(0); }
  if (!existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `# ${basename(n.base)} notes\n`); }
} else if (argv[0]) file = resolve(argv[0]);
else { console.error('Usage: node mdview.mjs <file.md> | --notes [--print]'); process.exit(1); }
const RENDER = process.env.MDVIEW_RENDER ?? join(homedir(), '.claude/skills/md-to-html/render.mjs');
const work = mkdtempSync(join(tmpdir(), 'mdview-'));
const STRIP = 8;          // rows per placement; Rex drops most of an image placed taller than the screen
const CHUNK = 12 * STRIP; // rows per screenshot, so a long document never exceeds Chrome's capture limit

// --- terminal ---
const out = (s) => process.stdout.write(s);
process.stdin.setRawMode(true); process.stdin.resume();
let inb = '';
const ask = async (seq, re, ms = 600) => {
  inb = ''; out(seq);
  for (const end = Date.now() + ms; Date.now() < end;) {
    const m = inb.match(re); if (m) return m;
    await new Promise((r) => setTimeout(r, 15));
  }
  return null;
};
const status = (s) => out(`\x1b[2K\r\x1b[2m${s}\x1b[0m`);

// --- headless Chrome over CDP, kept open between redraws ---
const profile = mkdtempSync(join(tmpdir(), 'mdview-chrome-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank']);
const wsUrl = await new Promise((ok, bad) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) ok(m[0]); });
  chrome.on('exit', () => bad(new Error('chrome exited: ' + buf)));
});
const ws = new WebSocket(wsUrl);
await new Promise((ok) => (ws.onopen = ok));
let id = 0; const pending = new Map(); let waiters = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.bad(new Error(m.error.message)) : p.ok(m.result); }
  else if (m.method) waiters = waiters.filter((w) => (w.name === m.method ? (w.ok(m), false) : true));
};
const send = (method, params = {}, sessionId) => new Promise((ok, bad) => { pending.set(++id, { ok, bad }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (m, p) => send(m, p, sessionId);
await cdp('Page.enable');

const quit = () => {
  out('\x1b_Ga=d,d=A,q=2\x1b\\\x1b[2J\x1b[3J\x1b[H');
  try { ws.close(); chrome.kill(); } catch {}
  rmSync(work, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true });
  process.stdin.setRawMode(false); process.exit(0);
};

// --- draw ---
let run = 0, busy = false, again = false;
async function draw() {
  if (busy) { again = true; return; }
  busy = true;
  try {
    const t0 = Date.now();
    const cols = process.stdout.columns;
    const cell = await ask('\x1b[16t', /\x1b\[6;(\d+);(\d+)t/);
    if (!cell) throw new Error('terminal did not report its cell size');
    const ch = +cell[1], cw = +cell[2];
    const bgm = await ask('\x1b]11;?\x07', /\]11;rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i);
    const rgb = bgm ? bgm.slice(1, 4).map((h) => parseInt(h.slice(0, 2), 16)) : [13, 17, 23];
    const scheme = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] < 128 ? 'dark' : 'light';
    const bg = `rgb(${rgb.join(',')})`;
    const scale = ch >= 28 ? 2 : 1;                // Retina cells are about 38 px tall
    const W = cols * cw, cssW = W / scale, rowCss = ch / scale;

    // GitHub's Markdown styles, fitted to the pane: no file header, no outer margin, the terminal's background.
    const css = join(work, 'pane.css'), html = join(work, 'doc.html');
    writeFileSync(css, `body { padding: 0 !important; background: ${bg} !important; }
.file { border: 0 !important; border-radius: 0; max-width: none; }
.file-header { display: none; }
.markdown-body { padding: 12px 24px 24px; background: ${bg}; }`);
    execFileSync(process.execPath, [RENDER, file, html, '--css', css], { stdio: ['ignore', 'ignore', 'pipe'] });

    await cdp('Emulation.setDeviceMetricsOverride', { width: cssW, height: 800, deviceScaleFactor: scale, mobile: false });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    const loaded = new Promise((ok) => waiters.push({ name: 'Page.loadEventFired', ok }));
    await cdp('Page.navigate', { url: 'file://' + html });
    await loaded;
    await cdp('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => 1)', awaitPromise: true });
    const { cssContentSize } = await cdp('Page.getLayoutMetrics');
    const rows = Math.ceil(cssContentSize.height / rowCss);
    await cdp('Runtime.evaluate', { expression: `document.body.style.minHeight = '${rows * rowCss}px'` });

    for (const f of readdirSync(work)) if (f.endsWith('.png')) rmSync(join(work, f));
    run++;
    const shots = [];
    for (let r = 0; r < rows; r += CHUNK) {
      const n = Math.min(CHUNK, rows - r);
      const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: r * rowCss, width: cssW, height: n * rowCss, scale: 1 } });
      const png = join(work, `${run}-${r}.png`);
      writeFileSync(png, Buffer.from(data, 'base64'));
      shots.push({ png, n });
    }

    let seq = '\x1b_Ga=d,d=A,q=2\x1b\\\x1b[2J\x1b[3J\x1b[H';
    shots.forEach(({ png, n }, i) => {
      seq += `\x1b_Ga=t,f=100,t=f,i=${i + 1},q=2;${Buffer.from(png).toString('base64')}\x1b\\`;
      for (let r = 0; r < n; r += STRIP) {
        const k = Math.min(STRIP, n - r);
        seq += `\x1b_Ga=p,i=${i + 1},q=2,x=0,y=${r * ch},w=${W},h=${k * ch},c=${cols},r=${k},C=1\x1b\\` + '\n'.repeat(k);
      }
    });
    out(seq);
    status(`${basename(file)} · ${rows} rows · ${scheme} · ${Date.now() - t0} ms · r redraw · q quit`);
    writeFileSync(join(dirname(work), 'mdview-last.json'), JSON.stringify({ file, cols, cw, ch, scale, W, rows, scheme, bg, shots: shots.length, ms: Date.now() - t0 }));
  } catch (e) {
    status(`mdview: ${String(e.stderr ?? e.message).trim().split('\n').pop()}`);
  }
  busy = false;
  if (again) { again = false; draw(); }
}

let timer;
const soon = () => { clearTimeout(timer); timer = setTimeout(draw, 150); };
process.stdin.on('data', (d) => {
  const s = d.toString('latin1'); inb += s;
  if (s === 'q' || s === '\x03') quit();
  if (s === 'r') soon();
});
process.stdout.on('resize', soon);
watch(dirname(file), (_, name) => { if (name === basename(file)) soon(); }); // the directory, so an editor's atomic save is seen
process.on('SIGTERM', quit); process.on('SIGHUP', quit);
draw();
