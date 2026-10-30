#!/usr/bin/env node
'use strict';
/**
 * cc-setup v2 - Claude Code + free API gateway manager
 * Termux & Windows (bina Linux/WSL). Zero dependencies.
 *   ccs            -> smart menu
 *   ccs setup      -> one-time full setup
 *   ccs run        -> Claude chalao (gateway auto-start)
 *   ccs help       -> sab commands
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const readline = require('readline');

const IS_WIN = process.platform === 'win32';
const IS_TERMUX = (process.env.PREFIX || '').includes('com.termux');
const HOME = os.homedir();
const ROOT = __dirname;
const STATE_DIR = path.join(HOME, '.cc-setup');
const STATE_FILE = path.join(STATE_DIR, 'config.json');
const GW_LOG = path.join(STATE_DIR, 'gateway.log');
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
const CLAUDE_JSON = path.join(HOME, '.claude.json');
const MKT_DIR = path.join(HOME, '.claude', 'plugins', 'marketplaces');
const DEFAULT_JSON = path.join(STATE_DIR, 'omniroute.local.json');
const TERMUX_PIN = '2.1.112'; // last JS build of Claude Code (naye versions Termux par nahi chalte)
fs.mkdirSync(STATE_DIR, { recursive: true });

// ───────────────────────── basics ─────────────────────────
const A = (n) => (s) => `\x1b[${n}m${s}\x1b[0m`;
const C = { b: A(1), d: A(2), r: A(31), g: A(32), y: A(33), c: A(36) };
const cols = () => Math.max(30, Math.min((process.stdout.columns || 44) - 1, 60));
const clip = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log(`${C.g('✔')} ${m}`);
const bad = (m) => console.log(`${C.r('✖')} ${m}`);
const warn = (m) => console.log(`${C.y('!')} ${m}`);
const info = (m) => console.log(`${C.c('i')} ${m}`);
const clear = () => process.stdout.isTTY && process.stdout.write('\x1b[2J\x1b[H');

function readJson(p, def) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; } }
function writeJson(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function plat(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (IS_TERMUX && v.termux !== undefined) return v.termux;
  if (IS_WIN && v.win !== undefined) return v.win;
  return v.default || '';
}
function has(cmd) {
  return cp.spawnSync(IS_WIN ? `where ${cmd}` : `command -v ${cmd}`, { shell: true, stdio: 'ignore' }).status === 0;
}
const normBase = (u) => (u || '').trim().replace(/\/+$/, '').replace(/\/v1$/, '');
const isLocal = (u) => /localhost|127\.0\.0\.1/.test(u || '');
const mask = (k) => (!k ? '' : k.length <= 8 ? '****' : k.slice(0, 4) + '…' + k.slice(-3));

// ───────────────────────── state ─────────────────────────
let ST = readJson(STATE_FILE, {});
ST.profiles = ST.profiles || {};
ST.installed = ST.installed || {};
if (ST.base_url && !Object.keys(ST.profiles).length) { // v1 se migrate
  const id = ST.gateway || 'default';
  ST.profiles[id] = { base_url: ST.base_url, api_key: ST.api_key, model: ST.model, small_model: ST.small_model };
  ST.active = id;
}
const save = () => writeJson(STATE_FILE, ST);
const activeProfile = () => (ST.active && ST.profiles[ST.active] ? { id: ST.active, ...ST.profiles[ST.active] } : null);
const gateways = () => readJson(path.join(ROOT, 'providers.json'), { gateways: [] }).gateways;
const catalog = () => readJson(path.join(ROOT, 'plugins.json'), { plugins: [] }).plugins;
const currentGateway = () => gateways().find((g) => g.id === ST.gateway) || gateways().find((g) => g.id === ST.active) || null;

// ───────────────────────── input (arrow-key UI) ─────────────────────────
function withKeys(onKey) {
  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const done = (v) => {
      process.stdin.removeListener('keypress', h);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve(v);
    };
    const h = (str, key) => {
      key = key || {};
      if (key.ctrl && key.name === 'c') { process.stdout.write('\x1b[?25h\n'); process.exit(130); }
      onKey(str, key, done);
    };
    process.stdin.on('keypress', h);
  });
}
function text(q, def = '') {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${C.c('?')} ${q}${def ? C.d(` [${def}]`) : ''}: `, (a) => { rl.close(); res(a.trim() || def); });
  });
}
async function confirm(q, def = true) {
  if (!process.stdin.isTTY) { const a = (await text(`${q} (y/n)`, def ? 'y' : 'n')).toLowerCase(); return a.startsWith('y') || a === 'h'; }
  process.stdout.write(`${C.c('?')} ${q} ${C.d(def ? '[Y/n]' : '[y/N]')} `);
  const v = await withKeys((s, k, done) => {
    if (k.name === 'return') done(def);
    else if (/^[yYhH]$/.test(s || '')) done(true);
    else if (/^[nN]$/.test(s || '') || k.name === 'escape') done(false);
  });
  process.stdout.write((v ? C.g('Haan') : C.r('Nahi')) + '\n');
  return v;
}
async function pause() {
  if (!process.stdin.isTTY) return;
  process.stdout.write(C.d('\nEnter dabao...'));
  await withKeys((s, k, done) => done(true));
  process.stdout.write('\n');
}
async function plainSelect(title, items) {
  console.log('\n' + C.b(title));
  items.forEach((it, i) => console.log(`  ${i + 1}) ${it.label}`));
  return items[parseInt(await text('Number'), 10) - 1] || null;
}
async function plainMulti(title, items) {
  console.log('\n' + C.b(title));
  items.forEach((it, i) => console.log(`  ${i + 1}) ${it.label}`));
  const a = await text('Numbers (comma se, khali = koi nahi)');
  return a.split(',').map((x) => items[parseInt(x, 10) - 1]).filter(Boolean);
}

async function select(title, items, opt = {}) {
  items = items.filter(Boolean);
  if (!items.length) return null;
  if (!process.stdin.isTTY) return plainSelect(title, items);
  const n = items.length;
  let cur = Math.max(0, items.findIndex((i) => i.value === opt.current));
  let top = 0, drawn = 0;
  const vis = Math.max(4, Math.min(n, (process.stdout.rows || 24) - 6));
  const W = cols();
  const numbered = opt.numbers && n <= 9;
  const draw = () => {
    if (cur < top) top = cur;
    if (cur >= top + vis) top = cur - vis + 1;
    const out = [`${C.c('?')} ${C.b(clip(title, W - 3))}`];
    for (let i = top; i < Math.min(n, top + vis); i++) {
      const it = items[i], sel = i === cur;
      const label = clip((numbered ? `${i + 1}. ` : '') + it.label, W - 3);
      let line = (sel ? C.c('❯ ') : '  ') + (sel ? C.b(label) : it.dim ? C.d(label) : label);
      if (it.hint) { const room = W - 3 - label.length - 2; if (room > 6) line += C.d('  ' + clip(it.hint, room)); }
      out.push(line);
    }
    if (n > vis) out.push(C.d(`  ${top + 1}-${Math.min(n, top + vis)} / ${n}`));
    out.push(C.d('  ' + (opt.hint || '↑↓ chuno · Enter ok · Esc back')));
    if (drawn) process.stdout.write(`\x1b[${drawn}A`);
    process.stdout.write('\x1b[J' + out.join('\n') + '\n');
    drawn = out.length;
  };
  process.stdout.write('\x1b[?25l');
  draw();
  const res = await withKeys((s, k, done) => {
    if (k.name === 'up' || s === 'k') cur = (cur - 1 + n) % n;
    else if (k.name === 'down' || s === 'j') cur = (cur + 1) % n;
    else if (k.name === 'pageup') cur = Math.max(0, cur - vis);
    else if (k.name === 'pagedown') cur = Math.min(n - 1, cur + vis);
    else if (k.name === 'home') cur = 0;
    else if (k.name === 'end') cur = n - 1;
    else if (k.name === 'return') return done(items[cur]);
    else if (k.name === 'escape' || s === 'q') return done(null);
    else if (numbered && /^[1-9]$/.test(s || '') && Number(s) <= n) return done(items[Number(s) - 1]);
    else return;
    draw();
  });
  process.stdout.write(`\x1b[${drawn}A\x1b[J\x1b[?25h`);
  console.log(`${C.c('?')} ${C.b(title)} ${res ? C.g(res.label) : C.d('—')}`);
  return res;
}

async function multiselect(title, items) {
  if (!items.length) return [];
  if (!process.stdin.isTTY) return plainMulti(title, items);
  const n = items.length;
  const sel = items.map((i) => !!i.checked);
  let cur = 0, top = 0, drawn = 0;
  const vis = Math.max(4, Math.min(n, (process.stdout.rows || 24) - 6));
  const W = cols();
  const draw = () => {
    if (cur < top) top = cur;
    if (cur >= top + vis) top = cur - vis + 1;
    const out = [`${C.c('?')} ${C.b(clip(title, W - 3))}`];
    for (let i = top; i < Math.min(n, top + vis); i++) {
      const it = items[i];
      const label = clip(it.label, W - 5);
      let line = (i === cur ? C.c('❯ ') : '  ') + (sel[i] ? C.g('◼ ') : C.d('◻ ')) + (i === cur ? C.b(label) : label);
      if (it.hint) { const room = W - 5 - label.length - 2; if (room > 6) line += C.d('  ' + clip(it.hint, room)); }
      out.push(line);
    }
    if (n > vis) out.push(C.d(`  ${top + 1}-${Math.min(n, top + vis)} / ${n}`));
    out.push(C.d('  Space=select · a=sab · Enter=install · Esc=cancel'));
    if (drawn) process.stdout.write(`\x1b[${drawn}A`);
    process.stdout.write('\x1b[J' + out.join('\n') + '\n');
    drawn = out.length;
  };
  process.stdout.write('\x1b[?25l');
  draw();
  const res = await withKeys((s, k, done) => {
    if (k.name === 'up' || s === 'k') cur = (cur - 1 + n) % n;
    else if (k.name === 'down' || s === 'j') cur = (cur + 1) % n;
    else if (k.name === 'space' || s === ' ') sel[cur] = !sel[cur];
    else if (s === 'a') { const all = sel.every(Boolean); sel.fill(!all); }
    else if (k.name === 'return') return done(items.filter((_, i) => sel[i]));
    else if (k.name === 'escape') return done(null);
    else return;
    draw();
  });
  process.stdout.write(`\x1b[${drawn}A\x1b[J\x1b[?25h`);
  console.log(`${C.c('?')} ${C.b(title)} ${res ? C.g(res.length + ' selected') : C.d('—')}`);
  return res || [];
}

// ───────────────────────── run commands ─────────────────────────
function sh(cmd, opts = {}) {
  console.log(C.d('$ ' + cmd));
  return cp.spawnSync(cmd, { shell: true, stdio: 'inherit', ...opts }).status === 0;
}
function task(label, cmd, opts = {}) {
  return new Promise((res) => {
    const fr = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
    let i = 0, out = '', finished = false;
    const t0 = Date.now(), tty = process.stdout.isTTY;
    const tick = () => tty && process.stdout.write(`\r\x1b[K${C.c(fr[i++ % fr.length])} ${clip(label, cols() - 10)} ${C.d(Math.floor((Date.now() - t0) / 1000) + 's')}`);
    tick();
    const timer = setInterval(tick, 120);
    const ch = cp.spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd });
    const killer = setTimeout(() => { try { ch.kill(); } catch { /* */ } }, opts.timeout || 900000);
    const fin = (code) => {
      if (finished) return;
      finished = true; clearInterval(timer); clearTimeout(killer);
      if (tty) process.stdout.write('\r\x1b[K');
      res({ ok: code === 0, out });
    };
    ch.stdout.on('data', (d) => (out += d));
    ch.stderr.on('data', (d) => (out += d));
    ch.on('close', fin);
    ch.on('error', (e) => { out += String(e); fin(1); });
  });
}
async function step(label, cmd, opts = {}) {
  const r = await task(label, cmd, opts);
  if (r.ok) ok(label);
  else {
    bad(label);
    const tail = r.out.trim().split('\n').slice(-6).map((l) => '  ' + C.d(clip(l, cols() - 3))).join('\n');
    if (tail.trim()) console.log(tail);
  }
  return r.ok;
}

// ───────────────────────── http ─────────────────────────
async function http(url, opt = {}, ms = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal }); } finally { clearTimeout(t); }
}
const hdrs = (key) => ({ 'x-api-key': key, authorization: 'Bearer ' + key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
async function portUp(base) { try { await http(base, {}, 2500); return true; } catch { return false; } }

// ───────────────────────── Claude settings / profiles ─────────────────────────
const MODEL_KEYS = ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL'];
function patchSettings(fn) {
  const s = readJson(SETTINGS, {});
  if (fs.existsSync(SETTINGS) && !fs.existsSync(SETTINGS + '.bak')) fs.copyFileSync(SETTINGS, SETTINGS + '.bak');
  s.env = s.env || {};
  fn(s.env);
  writeJson(SETTINGS, s);
}
function applyProfile(p) {
  patchSettings((env) => {
    env.ANTHROPIC_BASE_URL = normBase(p.base_url);
    env.ANTHROPIC_AUTH_TOKEN = p.api_key || 'dummy';
    delete env.ANTHROPIC_API_KEY;
    MODEL_KEYS.forEach((k) => delete env[k]);
    if (p.model) {
      const small = p.small_model || p.model;
      env.ANTHROPIC_MODEL = p.model;
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = p.model;
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = p.model;
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = small;
      env.ANTHROPIC_SMALL_FAST_MODEL = small;
    }
    if (IS_TERMUX) env.DISABLE_AUTOUPDATER = '1';
  });
  const cj = readJson(CLAUDE_JSON, {});
  if (!cj.hasCompletedOnboarding) { cj.hasCompletedOnboarding = true; writeJson(CLAUDE_JSON, cj); }
}
function syncJson(p) {
  if (p && p.json) writeJson(p.json, { base_url: p.base_url, api_key: p.api_key, model: p.model || '' });
}
function setProfile(id, patch, activate = true) {
  ST.profiles[id] = { ...(ST.profiles[id] || {}), ...patch };
  syncJson(ST.profiles[id]);
  if (activate) { ST.active = id; applyProfile(ST.profiles[id]); }
  save();
}
function useDefault() {
  patchSettings((env) => {
    ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', ...MODEL_KEYS].forEach((k) => delete env[k]);
    if (IS_TERMUX) env.DISABLE_AUTOUPDATER = '1';
  });
  ST.active = null; save();
  ok('Default Claude mode: gateway settings hata di (profiles saved hain).');
}

// ───────────────────────── System prep ─────────────────────────
function fixGit() {
  if (!has('git')) return;
  const cur = cp.spawnSync('git', ['config', '--global', '--get-all', 'url.https://github.com/.insteadOf'], { encoding: 'utf8' }).stdout || '';
  for (const from of ['git@github.com:', 'ssh://git@github.com/']) {
    if (!cur.includes(from)) cp.spawnSync('git', ['config', '--global', '--add', 'url.https://github.com/.insteadOf', from], { stdio: 'ignore' });
  }
  // SSH host-key error (Termux me openssh ho to) se bachne ke liye
  if (has('ssh-keyscan')) {
    const dir = path.join(HOME, '.ssh'), kh = path.join(dir, 'known_hosts');
    try {
      fs.mkdirSync(dir, { recursive: true });
      const have = fs.existsSync(kh) ? fs.readFileSync(kh, 'utf8') : '';
      if (!have.includes('github.com')) {
        const r = cp.spawnSync('ssh-keyscan', ['-t', 'ed25519,rsa,ecdsa', 'github.com'], { encoding: 'utf8', timeout: 20000 });
        if (r.stdout) fs.appendFileSync(kh, r.stdout);
      }
    } catch { /* ignore */ }
  }
}
async function stepPrep() {
  header('System taiyari');
  if (IS_TERMUX) {
    info('Termux: update + upgrade (kuch minute lag sakte hain)');
    const before = process.version;
    const a = sh('pkg update -y -o Dpkg::Options::=--force-confold');
    const b = sh('pkg upgrade -y -o Dpkg::Options::=--force-confold -o Dpkg::Options::=--force-confdef');
    const c = sh('pkg install -y nodejs-lts git curl');
    if (!(a && b && c)) warn('Kuch step fail hua. Mirror issue ho to: termux-change-repo');
    const nv = cp.spawnSync('node -v', { shell: true, encoding: 'utf8' }).stdout.trim();
    if (nv && nv !== before) warn(`Node upgrade hua (${before} → ${nv}). Tool band karke dobara chalao: ccs`);
    if (!ST.tipRedmi) {
      console.log('\n' + C.y('Redmi/MIUI tip:') + ' Settings → Apps → Termux → Battery saver = "No restrictions", Autostart ON,');
      console.log('recent apps me Termux ko lock karo. Warna gateway background me band ho jata hai.\n');
      ST.tipRedmi = true; save();
    }
  } else if (IS_WIN) {
    ok(`node ${process.version}`);
    const wg = (id, label) => task(label, `winget upgrade -e --id ${id} --accept-source-agreements --accept-package-agreements`).then((r) => {
      (r.ok || /no (available|applicable|installed)/i.test(r.out)) ? ok(`${label} (latest)`) : warn(`${label} fail ho sakta hai: manually update karo`);
    });
    if (!has('winget')) warn('winget nahi mila (Windows App Installer). Node / Git manually update karo.');
    else {
      if (!has('git')) await step('Git install (winget)', 'winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements');
      else ok('git ready');
      if (await confirm('Node.js + Git latest par upgrade karun? (winget)', true)) {
        await wg('OpenJS.NodeJS.LTS', 'Node.js upgrade');
        if (has('git')) await wg('Git.Git', 'Git upgrade');
        info('Upgrade ke baad terminal band karke dobara kholo, phir ccs chalao.');
      }
    }
  } else {
    ok(`node ${process.version}`);
    has('git') ? ok('git ready') : warn('git install karo');
  }
  fixGit();
  ok('GitHub HTTPS fix (SSH host-key error nahi aayega)');
}

async function ensureShortcut() {
  if (has('ccs')) { ok('Shortcut `ccs` pehle se hai'); return; }
  const r = await step('Shortcut `ccs` bana raha hu (npm link)', 'npm link', { cwd: ROOT });
  if (r && has('ccs')) ok('Ab kahin se bhi sirf `ccs` likho');
  else if (r) info('Terminal band karke dobara kholo, phir `ccs` chalega');
}

// ───────────────────────── Claude Code ─────────────────────────
let CV;
function claudeVersion() {
  const r = cp.spawnSync('claude --version', { shell: true, encoding: 'utf8', timeout: 20000 });
  return r.status === 0 ? (r.stdout || '').trim().split('\n')[0] || null : null;
}
const cv = (refresh) => { if (refresh || CV === undefined) CV = claudeVersion(); return CV; };
async function stepClaude() {
  const v = cv(true);
  if (v) {
    ok(`Claude Code ready: ${v}`);
    if (IS_TERMUX) patchSettings((e) => { e.DISABLE_AUTOUPDATER = '1'; });
    return true;
  }
  const ver = IS_TERMUX ? '@' + TERMUX_PIN : '';
  if (IS_TERMUX) info(`Termux: ${TERMUX_PIN} install hoga (naye versions yahan nahi chalte, auto-update band rahega)`);
  let good = (await step(`Claude Code install ${ver}`, `npm install -g @anthropic-ai/claude-code${ver}`)) && !!cv(true);
  if (!good) {
    bad('Claude Code chal nahi raha.');
    const v2 = await text('Koi aur version try karna hai? (Enter = skip)');
    if (v2) good = (await step(`Claude Code @${v2}`, `npm install -g @anthropic-ai/claude-code@${v2}`)) && !!cv(true);
  }
  if (good) { ok(`Claude Code ready: ${cv()}`); if (IS_TERMUX) patchSettings((e) => { e.DISABLE_AUTOUPDATER = '1'; }); }
  return good;
}

// ───────────────────────── Plugins ─────────────────────────
function pyCmd() { for (const c of IS_WIN ? ['py', 'python'] : ['python3', 'python']) if (has(c)) return c; return null; }
async function ensurePython() {
  let py = pyCmd();
  if (py) return py;
  if (IS_TERMUX) { await step('Python install', 'pkg install -y python python-pip || pkg install -y python'); return pyCmd(); }
  if (IS_WIN && has('winget')) {
    await step('Python install (winget)', 'winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements');
    py = pyCmd();
    if (!py) warn('Terminal band karke dobara kholo, phir ye step chalao.');
    return py;
  }
  warn('Python install karo (python.org)');
  return null;
}
function findSkills(dir, depth) {
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) return [dir];
  if (depth === 0) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') out.push(...findSkills(path.join(dir, e.name), depth - 1));
  }
  return out;
}
async function gitSkills(p) {
  if (!p.repo || !has('git')) return false;
  const dest = path.join(STATE_DIR, 'repos', p.id);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const good = fs.existsSync(dest) ? await step(`${p.name}: update`, `git -C "${dest}" pull --ff-only`) : await step(`${p.name}: clone`, `git clone --depth 1 ${p.repo} "${dest}"`);
  if (!good) return false;
  const skills = findSkills(dest, 3);
  if (!skills.length) { warn('SKILL.md nahi mila. Repo README dekho: ' + dest); return false; }
  const target = path.join(HOME, '.claude', 'skills');
  fs.mkdirSync(target, { recursive: true });
  const names = [];
  for (const s of skills) {
    const nm = path.basename(s);
    fs.cpSync(s, path.join(target, nm), { recursive: true, force: true });
    names.push(nm);
  }
  ok(`${names.length} skill(s) copy hue`);
  ST.installed[p.id] = { type: 'skills', skills: names }; save();
  return true;
}
function readMarketplace(name) { return readJson(path.join(MKT_DIR, name, '.claude-plugin', 'marketplace.json'), null); }
async function installMarketplace(p) {
  const add = await task(`${p.name}: marketplace add`, `claude plugin marketplace add ${p.slug}`);
  const already = /already/i.test(add.out);
  if (!add.ok && !already) {
    bad(`${p.name}: marketplace add fail`);
    console.log(C.d(clip(add.out.trim().split('\n').slice(-3).join(' | '), cols() * 2)));
    return p.repo ? gitSkills(p) : false;
  }
  const name = (add.out.match(/added marketplace:\s*([^\s(]+)/i) || [])[1] || p.market || p.id;
  ok(`${p.name}: marketplace "${name}" added`);
  const mk = readMarketplace(name) || {};
  const list = (mk.plugins || []).map((x) => ({ label: x.name, value: x.name, hint: (x.description || '').replace(/\s+/g, ' '), checked: false }));
  let chosen = [];
  if (p.plugins) chosen = p.plugins;
  else if (p.all) chosen = list.map((x) => x.value);
  else if (list.length === 1) chosen = [list[0].value];
  else if (list.length > 1) chosen = (await multiselect(`${p.name}: kaun se plugins lagau?`, list)).map((x) => x.value);
  const done = [];
  for (const pl of chosen) if (await step(`plugin: ${pl}`, `claude plugin install ${pl}@${name}`)) done.push(pl);
  if (chosen.length && !done.length) return false;
  ST.installed[p.id] = { type: 'marketplace', market: name, plugins: done }; save();
  return true;
}
async function installPipMcp(p) {
  const py = await ensurePython();
  if (!py) return false;
  if (!(await step(`${p.name}: pip install`, `${py} -m pip install "${p.pip}"`))) return false;
  if (!(await step(`${p.name}: Claude me MCP register`, `claude mcp add -s user ${p.mcp.name} -- ${p.mcp.cmd}`))) return false;
  ST.installed[p.id] = { type: 'mcp', mcp: p.mcp.name }; save();
  return true;
}
async function installPlugin(p) {
  console.log('\n' + C.b(p.name) + C.d(`  ${p.by || ''} · ${p.tag || ''}`));
  const w = plat(p.warn);
  if (w) warn(w);
  let good = false;
  if (p.kind === 'marketplace') good = await installMarketplace(p);
  else if (p.kind === 'pip-mcp') good = await installPipMcp(p);
  else if (p.kind === 'skills-repo') good = await gitSkills(p);
  good ? ok(`${p.name} ready`) : bad(`${p.name} install nahi hua`);
  return good;
}
async function uninstallPlugin(id) {
  const e = ST.installed[id];
  if (!e) return;
  if (e.type === 'marketplace') {
    for (const pl of e.plugins || []) await step(`remove ${pl}`, `claude plugin uninstall ${pl}@${e.market}`);
    if (await confirm(`Marketplace "${e.market}" bhi hata du?`, false)) await step('marketplace remove', `claude plugin marketplace remove ${e.market}`);
  } else if (e.type === 'mcp') {
    await step(`MCP remove ${e.mcp}`, `claude mcp remove ${e.mcp} -s user`);
  } else if (e.type === 'skills') {
    for (const s of e.skills || []) { try { fs.rmSync(path.join(HOME, '.claude', 'skills', s), { recursive: true, force: true }); } catch { /* */ } }
    ok('skills hata di');
  }
  delete ST.installed[id]; save();
}
async function needClaude() {
  if (cv()) return true;
  bad('Claude Code chal nahi raha. Plugins Claude ke andar hi lagte hain.');
  return (await confirm('Abhi Claude Code install karun?')) && (await stepClaude());
}
async function pluginChecklist() {
  if (!(await needClaude())) return;
  const items = catalog().filter((p) => !ST.installed[p.id]).map((p) => ({
    label: `${p.name} [${p.tag || '?'}]`, value: p, hint: p.desc, checked: false,
  }));
  if (!items.length) { ok('Catalog ke sab plugins installed hain.'); return; }
  const chosen = await multiselect('Kaun se plugins/skills install karun?', items);
  for (const it of chosen) await installPlugin(it.value);
}
async function menuPlugins() {
  for (;;) {
    clear(); header('Plugins & Skills');
    const inst = Object.keys(ST.installed);
    console.log(C.d('Installed: ') + (inst.length ? inst.join(', ') : C.d('koi nahi')) + '\n');
    const s = await select('Kya karna hai?', [
      { label: 'Install karo (checklist)', value: 'install' },
      { label: 'Hatao / uninstall', value: 'remove', hint: `${inst.length} installed` },
      { label: 'Apna GitHub plugin/skill add karo', value: 'custom', hint: 'owner/repo' },
      { label: '← Back', value: 'back' },
    ], { numbers: true });
    if (!s || s.value === 'back') return;
    if (s.value === 'install') { await pluginChecklist(); await pause(); }
    if (s.value === 'remove') {
      if (!inst.length) { warn('Kuch installed nahi'); await pause(); continue; }
      if (!(await needClaude())) { await pause(); continue; }
      const picks = await multiselect('Kaun sa hatau?', inst.map((id) => ({ label: id, value: id })));
      for (const it of picks) await uninstallPlugin(it.value);
      await pause();
    }
    if (s.value === 'custom') {
      if (!(await needClaude())) { await pause(); continue; }
      const slug = (await text('GitHub repo (owner/repo)')).replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
      if (/^[\w.-]+\/[\w.-]+$/.test(slug)) {
        await installPlugin({ id: slug.replace('/', '__'), name: slug, by: slug.split('/')[0], tag: 'custom', kind: 'marketplace', slug, repo: `https://github.com/${slug}` });
      } else bad('Format galat: owner/repo likho');
      await pause();
    }
  }
}

// ───────────────────────── Gateway ─────────────────────────
async function startGateway(g) {
  const cmd = plat(g.start);
  if (!cmd) return true;
  if (await portUp(g.base_url)) { ok('Gateway pehle se chal raha hai'); return true; }
  if (IS_TERMUX) cp.spawnSync('termux-wake-lock', { shell: true, stdio: 'ignore' });
  const out = fs.openSync(GW_LOG, 'a');
  const ch = cp.spawn(cmd, { shell: true, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  ch.unref();
  ST.gwPid = ch.pid; save();
  const fr = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  const t0 = Date.now();
  for (let i = 0; i < 100; i++) {
    process.stdout.write(`\r\x1b[K${C.c(fr[i % 10])} Gateway start ho raha hai ${C.d(Math.floor((Date.now() - t0) / 1000) + 's (pehli baar slow ho sakta hai)')}`);
    if (await portUp(g.base_url)) { process.stdout.write('\r\x1b[K'); ok(`Gateway up: ${g.base_url}`); return true; }
    await sleep(2000);
  }
  process.stdout.write('\r\x1b[K');
  bad('Gateway up nahi hua. Log ke last lines:');
  try { fs.readFileSync(GW_LOG, 'utf8').trim().split('\n').slice(-6).forEach((l) => console.log('  ' + C.d(clip(l, cols() - 3)))); } catch { /* */ }
  return false;
}
async function stopGateway(g) {
  if (ST.gwPid) {
    try { IS_WIN ? cp.spawnSync(`taskkill /PID ${ST.gwPid} /T /F`, { shell: true, stdio: 'ignore' }) : process.kill(-ST.gwPid, 'SIGTERM'); } catch { /* */ }
  }
  if (!IS_WIN && g && g.proc) cp.spawnSync('pkill', ['-f', g.proc], { stdio: 'ignore' });
  await sleep(1500);
  (await portUp(g.base_url)) ? warn('Abhi bhi chal raha hai (manually band karo)') : ok('Gateway band');
}
function openUrl(u) {
  const cmd = IS_TERMUX ? 'termux-open-url' : IS_WIN ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  cp.spawnSync(`${cmd} ${u}`, { shell: true, stdio: 'ignore' });
}
async function installGateway() {
  const g = (await select('Provider / Gateway chuno', gateways().map((x) => ({ label: x.name, value: x, hint: x.hint })), { numbers: true }))?.value;
  if (!g) return;
  const ins = plat(g.install);
  if (ins && !(await step(`${g.id} install`, ins))) {
    if (!(await confirm('Install fail hua. Phir bhi profile bana du?', false))) return;
  }
  let base = g.base_url || '', key = g.default_key || '';
  if (g.needs_key || !base) {
    if (!base) base = await text('Base URL (Anthropic-compatible, jaise https://host/api)');
    key = await text('API key');
  }
  const id = g.id === 'custom' ? await text('Profile ka naam', 'custom') : g.id;
  ST.gateway = g.id;
  setProfile(id, { base_url: normBase(base), api_key: key || 'dummy' });
  ok(`Profile "${id}" active ho gaya`);
  if (g.id === 'omniroute' && (await confirm('Default JSON file bana du? (model/key yahin save hoga)', true))) {
    const f = (await text('JSON path (Enter = default)', DEFAULT_JSON)).replace(/^~/, HOME);
    setProfile(id, { json: f });
    ok(`JSON ready: ${f}`);
  }
  if (plat(g.start) && (await confirm('Gateway abhi start karun?'))) await startGateway(g);
  if (g.after) info(g.after);
}
async function menuGateway() {
  for (;;) {
    clear(); header('Gateway');
    const g = currentGateway(), p = activeProfile();
    if (g && plat(g.start)) console.log(`${C.d('Current  ')}${g.id}  ${(await portUp(g.base_url)) ? C.g('● running') : C.r('○ stopped')}\n`);
    else if (p) console.log(`${C.d('Current  ')}${p.id}  ${C.d(p.base_url)}\n`);
    const s = await select('Kya karna hai?', [
      { label: 'Gateway install / badlo', value: 'install' },
      g && plat(g.start) && { label: 'Start / Restart', value: 'start' },
      g && plat(g.start) && { label: 'Stop', value: 'stop' },
      g && g.dashboard && { label: 'Dashboard kholo', value: 'dash', hint: g.dashboard },
      g && plat(g.start) && { label: 'Log dekho', value: 'log' },
      { label: '← Back', value: 'back' },
    ], { numbers: true });
    if (!s || s.value === 'back') return;
    if (s.value === 'install') await installGateway();
    if (s.value === 'start') { if (await portUp(g.base_url)) await stopGateway(g); await startGateway(g); }
    if (s.value === 'stop') await stopGateway(g);
    if (s.value === 'dash') { console.log(g.dashboard); openUrl(g.dashboard); }
    if (s.value === 'log') { try { fs.readFileSync(GW_LOG, 'utf8').trim().split('\n').slice(-15).forEach((l) => console.log(C.d(clip(l, cols())))); } catch { warn('Log khali hai'); } }
    await pause();
  }
}

// ───────────────────────── API / Models ─────────────────────────
async function listModels(base, key) {
  for (const u of [`${base}/v1/models`, `${base}/models`]) {
    try {
      const r = await http(u, { headers: hdrs(key) }, 20000);
      if (!r.ok) continue;
      const j = await r.json();
      const arr = j.data || j.models || (Array.isArray(j) ? j : []);
      const ids = arr.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
      if (ids.length) return ids;
    } catch { /* next */ }
  }
  return [];
}
async function testModel(base, key, model) {
  const t = Date.now();
  try {
    const r = await http(`${base}/v1/messages`, {
      method: 'POST', headers: hdrs(key),
      body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Say hi' }] }),
    }, 45000);
    const ms = Date.now() - t;
    if (!r.ok) return { model, ok: false, ms, err: `HTTP ${r.status} ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 60)}` };
    const j = await r.json().catch(() => ({}));
    const good = Array.isArray(j.content) && j.content.length > 0;
    return { model, ok: good, ms, err: good ? '' : 'empty reply' };
  } catch (e) {
    return { model, ok: false, ms: Date.now() - t, err: e.name === 'AbortError' ? 'timeout' : String(e.cause?.code || e.message || e).slice(0, 60) };
  }
}
async function needProfile() {
  const p = activeProfile();
  if (p) return p;
  warn('Abhi koi API profile active nahi hai.');
  if (await confirm('Gateway/API profile abhi banau?')) { await installGateway(); return activeProfile(); }
  return null;
}
async function ensureUp(p) {
  const g = currentGateway();
  if (isLocal(p.base_url) && g && plat(g.start) && !(await portUp(p.base_url))) {
    warn('Local gateway band hai.');
    if (await confirm('Start karun?')) return startGateway(g);
    return false;
  }
  return true;
}
async function modelTest() {
  const p = await needProfile();
  if (!p || !(await ensureUp(p))) return;
  const base = normBase(p.base_url), key = p.api_key || 'dummy';
  info('Models ki list la raha hu...');
  let models = await listModels(base, key);
  models.length ? ok(`${models.length} models mile`) : warn('Auto list nahi mili (naam khud daal sakte ho)');
  const extra = await text('Extra model naam (comma se) ya Enter');
  if (extra) models = [...new Set([...extra.split(',').map((s) => s.trim()).filter(Boolean), ...models])];
  const filt = (await text('Filter (jaise free / claude / glm) ya Enter')).toLowerCase();
  if (filt) models = models.filter((m) => m.toLowerCase().includes(filt));
  const lim = parseInt(await text('Max kitne test karun', '30'), 10) || 30;
  models = models.slice(0, lim);
  if (!models.length) { bad('Test karne ko koi model nahi'); return; }

  const results = [];
  let idx = 0, okc = 0;
  const bar = () => process.stdout.write(`\r\x1b[K${C.c('⠿')} Testing ${results.length}/${models.length}  ${C.g('✔' + okc)} ${C.r('✖' + (results.length - okc))}`);
  bar();
  const worker = async () => {
    while (idx < models.length) {
      const r = await testModel(base, key, models[idx++]);
      results.push(r); if (r.ok) okc++;
      bar();
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  process.stdout.write('\r\x1b[K');
  const good = results.filter((r) => r.ok).sort((a, b) => a.ms - b.ms);
  const fails = results.filter((r) => !r.ok);
  ok(`${good.length} working, ${fails.length} fail`);
  if (fails.length) { const e = fails[0]; console.log(C.d(`  jaise: ${clip(e.model, 24)} → ${clip(e.err, cols() - 32)}`)); }
  if (!good.length) { bad('Koi model nahi chala. Key / URL / gateway check karo (Health check chalao).'); return; }
  const main = (await select('MAIN model chuno (tez → slow)', good.map((r) => ({ label: r.model, value: r, hint: r.ms + 'ms' }))))?.value;
  if (!main) return;
  let small = main;
  if (good.length > 1 && (await confirm('Small/haiku model alag chunna hai?', false))) {
    small = (await select('SMALL model chuno', good.map((r) => ({ label: r.model, value: r, hint: r.ms + 'ms' }))))?.value || main;
  }
  setProfile(p.id, { model: main.model, small_model: small.model });
  ok(`Model set: ${main.model}${small !== main ? ' (small: ' + small.model + ')' : ''}`);
}
async function customModel() {
  const p = await needProfile();
  if (!p) return;
  const m = await text('Apne model ka exact naam');
  if (!m) return;
  const sm = await text('Small/fast model', m);
  setProfile(p.id, { model: m, small_model: sm });
  ok(`Custom model set: ${m}`);
  if (await ensureUp(p)) {
    const t = await testModel(normBase(p.base_url), p.api_key || 'dummy', m);
    t.ok ? ok(`Test pass (${t.ms}ms)`) : warn(`Test fail: ${t.err}. Naam / gateway check karo.`);
  }
}
async function modelChoice() {
  const s = await select('Model kaise set karna hai?', [
    { label: 'Test karke working model chuno', value: 'test' },
    { label: 'Apna custom model naam daalo', value: 'custom' },
    { label: 'Skip', value: 'skip' },
  ], { numbers: true });
  if (!s) return;
  if (s.value === 'test') await modelTest();
  if (s.value === 'custom') await customModel();
}
async function importJson() {
  const f = (await text('JSON file ka path (Enter = default)', DEFAULT_JSON)).replace(/^~/, HOME);
  if (!fs.existsSync(f)) {
    const p = activeProfile();
    writeJson(f, { base_url: p ? p.base_url : 'http://localhost:20128', api_key: p ? p.api_key : 'omniroute', model: p ? p.model || '' : '' });
    ok(`Default JSON bana di: ${f}`);
    info('Isme base_url / api_key / model badal sakte ho, phir ye option dobara chalao.');
  }
  let j = readJson(f, null);
  if (!j) { bad('JSON galat hai: ' + f); return; }
  if (j.env) j = j.env;
  const base = j.base_url || j.ANTHROPIC_BASE_URL, key = j.api_key || j.ANTHROPIC_AUTH_TOKEN || j.ANTHROPIC_API_KEY;
  if (!base) { bad('base_url nahi mila'); return; }
  const id = await text('Profile ka naam', f === DEFAULT_JSON ? 'omniroute' : 'imported');
  setProfile(id, { base_url: normBase(base), api_key: key || 'dummy', model: j.model || j.ANTHROPIC_MODEL || undefined, json: f });
  ok(`Profile "${id}" import + active (JSON sync: ${f})`);
}
async function menuApi() {
  for (;;) {
    clear(); header('API / Profile / Model');
    const p = activeProfile();
    if (p) console.log(`${C.d('Active   ')}${C.b(p.id)}\n${C.d('URL      ')}${p.base_url}\n${C.d('Key      ')}${mask(p.api_key)}\n${C.d('Model    ')}${p.model || C.d('auto')}\n`);
    else console.log(C.d('Active   Default Claude (koi profile nahi)\n'));
    const ids = Object.keys(ST.profiles);
    const s = await select('Kya karna hai?', [
      { label: 'Model: test karke chuno', value: 'test' },
      { label: 'Model: custom naam daalo', value: 'custom' },
      { label: 'Naya profile (manual URL + key)', value: 'new' },
      { label: 'JSON file se profile import', value: 'json' },
      ids.length > 1 && { label: 'Profile badlo', value: 'switch', hint: ids.join(', ') },
      ids.length > 0 && { label: 'Profile hatao', value: 'del' },
      { label: '← Back', value: 'back' },
    ], { numbers: true });
    if (!s || s.value === 'back') return;
    if (s.value === 'test') await modelTest();
    if (s.value === 'custom') await customModel();
    if (s.value === 'json') await importJson();
    if (s.value === 'new') {
      const id = await text('Profile ka naam', 'my-api');
      const base = await text('Base URL (Anthropic-compatible)');
      const key = await text('API key');
      const model = await text('Model naam (optional)');
      if (base) { setProfile(id, { base_url: normBase(base), api_key: key || 'dummy', model: model || undefined }); ok(`Profile "${id}" active`); }
    }
    if (s.value === 'switch') {
      const pick = await select('Kaun sa profile?', ids.map((i) => ({ label: i, value: i, hint: ST.profiles[i].model || '' })), { current: ST.active });
      if (pick) { setProfile(pick.value, {}); ok(`Active: ${pick.value}`); }
    }
    if (s.value === 'del') {
      const pick = await select('Kaun sa hatau?', ids.map((i) => ({ label: i, value: i })));
      if (pick) { delete ST.profiles[pick.value]; if (ST.active === pick.value) useDefault(); save(); ok('Hata diya'); }
    }
    await pause();
  }
}

// ───────────────────────── Doctor / launch / maint ─────────────────────────
async function doctor() {
  header('Health check');
  const nodeMajor = parseInt(process.versions.node, 10);
  nodeMajor >= 18 ? ok(`Node ${process.version}`) : bad(`Node ${process.version} (18+ chahiye)`);
  has('git') ? ok('git') : bad('git nahi mila');
  const v = cv(true);
  v ? ok(`Claude Code ${v}`) : bad(`Claude Code chal nahi raha → "Full setup" ya Claude install chalao${IS_TERMUX ? ` (Termux: ${TERMUX_PIN} chahiye)` : ''}`);
  const env = (readJson(SETTINGS, {}).env) || {};
  if (IS_TERMUX) env.DISABLE_AUTOUPDATER === '1' ? ok('Auto-update band (Termux safe)') : warn('DISABLE_AUTOUPDATER set nahi → Claude Code update hokar tut sakta hai');
  const p = activeProfile();
  if (!p) { info('Default Claude mode (koi gateway profile active nahi)'); return; }
  ok(`Profile: ${p.id} → ${p.base_url}`);
  if (env.ANTHROPIC_BASE_URL && normBase(env.ANTHROPIC_BASE_URL) !== normBase(p.base_url)) warn('settings.json ka URL profile se alag hai → Profile badlo se dobara apply karo');
  if (isLocal(p.base_url)) {
    if (!(await portUp(p.base_url))) { bad('Local gateway band hai → Gateway menu → Start'); return; }
    ok('Gateway chal raha hai');
  }
  const base = normBase(p.base_url), key = p.api_key || 'dummy';
  const models = await listModels(base, key);
  models.length ? ok(`${models.length} models list me`) : warn('Models list nahi mili (key / endpoint check karo)');
  const m = p.model || models[0];
  if (!m) { warn('Model set nahi. API menu → Model'); return; }
  const t = await testModel(base, key, m);
  if (t.ok) ok(`Model "${m}" kaam kar raha hai (${t.ms}ms)`);
  else {
    bad(`Model "${m}" fail: ${t.err}`);
    if (/401|403/.test(t.err)) info('API key galat / expire hai.');
    else if (/404/.test(t.err)) info('Model ka naam ya endpoint galat. API menu → Model test.');
    else if (/ECONNREFUSED|fetch failed|timeout/i.test(t.err)) info('Gateway tak pahunch nahi pa raha / slow hai.');
    else info('Doosra model try karo (API menu → test karke chuno).');
  }
}
async function launch(args = []) {
  if (!cv(true)) {
    bad('Claude Code nahi mila.');
    if (!(await confirm('Abhi install karun?')) || !(await stepClaude())) return;
  }
  const p = activeProfile(), g = currentGateway();
  if (p && g && plat(g.start) && isLocal(p.base_url) && !(await portUp(p.base_url))) {
    info('Gateway band tha, start kar raha hu...');
    await startGateway(g);
  }
  clear();
  cp.spawnSync(['claude', ...args].join(' '), { shell: true, stdio: 'inherit' });
}
async function selfUpdate() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) { warn('Ye git clone nahi hai. Update ke liye: git clone se install karo.'); return; }
  const good = await step('Tool update (git pull)', `git -C "${ROOT}" pull --ff-only`);
  if (good) info('Naya version agli baar se chalega. Tool dobara kholo.');
}
async function menuMaint() {
  for (;;) {
    clear(); header('Maintenance');
    const s = await select('Kya karna hai?', [
      { label: IS_TERMUX ? 'System update + upgrade (pkg)' : 'System check', value: 'prep' },
      { label: 'Tool update (git pull)', value: 'update' },
      { label: 'Shortcut `ccs` banao', value: 'short' },
      { label: 'Default Claude pe wapas (gateway hatao)', value: 'reset' },
      { label: '← Back', value: 'back' },
    ], { numbers: true });
    if (!s || s.value === 'back') return;
    if (s.value === 'prep') await stepPrep();
    if (s.value === 'update') await selfUpdate();
    if (s.value === 'short') await ensureShortcut();
    if (s.value === 'reset') useDefault();
    await pause();
  }
}

// ───────────────────────── full setup & menu ─────────────────────────
async function fullSetup() {
  header('Full setup (ek baar)');
  if (await confirm(IS_TERMUX ? 'Pehle system update + upgrade karun? (recommended)' : 'System check karun?', true)) await stepPrep();
  else fixGit();
  console.log();
  const good = await stepClaude();
  if (good) { console.log(); await pluginChecklist(); }
  else if (!(await confirm('Claude Code ready nahi. Phir bhi aage badhein?', false))) return;
  console.log();
  if (await confirm('Gateway / API set karna hai? (No = default Claude hi rahega)', true)) {
    await installGateway();
    if (activeProfile() && (await confirm('Ab model set karun?', true))) await modelChoice();
  }
  console.log();
  await ensureShortcut();
  console.log('\n' + C.g('✔ Setup complete.') + C.d(' Aage ke badlav ke liye bas `ccs` chalao.'));
  if (await confirm('Claude abhi chalau?', false)) await launch();
}
function header(sub) {
  const w = Math.min(cols(), 44);
  const line = (t, f) => console.log(C.c('│') + f(t.padEnd(w - 2)) + C.c('│'));
  console.log(C.c('╭' + '─'.repeat(w - 2) + '╮'));
  line('  ◆ CC-SETUP', C.b);
  line('  Claude Code + Free API Gateway', C.d);
  console.log(C.c('╰' + '─'.repeat(w - 2) + '╯'));
  if (sub) console.log(C.b(sub) + '\n');
}
async function mainMenu() {
  for (;;) {
    clear(); header();
    process.stdout.write(C.d('status check...'));
    const v = cv(true), p = activeProfile();
    const up = p && isLocal(p.base_url) ? ((await portUp(p.base_url)) ? C.g(' ● up') : C.r(' ○ down')) : '';
    process.stdout.write('\r\x1b[K');
    const row = (k, val) => console.log(C.d(k.padEnd(9)) + val);
    row('Claude', v ? C.g('✔ ' + v) : C.r('✖ chal nahi raha'));
    row('API', p ? `${p.id}${up}` : C.d('Default Claude'));
    if (p) row('Model', p.model || C.d('auto'));
    const inst = Object.keys(ST.installed);
    row('Plugins', inst.length ? clip(inst.join(', '), cols() - 10) : C.d('koi nahi'));
    console.log();
    const s = await select('Kya karna hai?', [
      { label: 'Full setup (ek baar me sab)', value: 'setup' },
      { label: 'Claude chalao', value: 'run', hint: 'gateway auto-start' },
      { label: 'Plugins & Skills', value: 'plugins' },
      { label: 'Gateway (OmniRoute etc.)', value: 'gateway' },
      { label: 'API / Profile / Model', value: 'api' },
      { label: 'Health check', value: 'doctor' },
      { label: 'Maintenance / Update', value: 'maint' },
      { label: 'Exit', value: 'exit' },
    ], { numbers: true, hint: '↑↓ ya number · Enter' });
    if (!s || s.value === 'exit') break;
    if (s.value === 'setup') { clear(); await fullSetup(); await pause(); }
    if (s.value === 'run') await launch();
    if (s.value === 'plugins') await menuPlugins();
    if (s.value === 'gateway') await menuGateway();
    if (s.value === 'api') await menuApi();
    if (s.value === 'doctor') { clear(); await doctor(); await pause(); }
    if (s.value === 'maint') await menuMaint();
  }
  console.log(C.d('Bye! Dobara kholne ke liye: ccs  (ya bash install.sh)'));
}

const HELP = `
${C.b('cc-setup')}  (ccs)
  ccs             smart menu
  ccs setup       ek baar ka full setup
  ccs run         Claude chalao (gateway auto-start)
  ccs claude      Claude Code install/check
  ccs plugins     plugins & skills manager
  ccs gateway     gateway manager
  ccs api         profile / model manager
  ccs models      models test karke chuno
  ccs doctor      health check
  ccs update      tool update (git pull)
  ccs prep        system update + upgrade
  ccs reset       default Claude pe wapas
`;
const CMDS = {
  menu: mainMenu, setup: fullSetup, run: () => launch(process.argv.slice(3)), launch: () => launch(process.argv.slice(3)),
  claude: async () => { header('Claude Code'); await stepClaude(); }, plugins: menuPlugins, gateway: menuGateway,
  api: menuApi, models: modelTest, doctor, update: selfUpdate, prep: stepPrep, reset: async () => useDefault(), shortcut: ensureShortcut,
};

(async () => {
  if (parseInt(process.versions.node, 10) < 18) { console.log(C.r('Node 18+ chahiye.')); process.exit(1); }
  const arg = process.argv[2];
  if (arg === 'help' || arg === '--help' || arg === '-h') { console.log(HELP); return; }
  await (CMDS[arg] || mainMenu)();
  process.exit(0);
})().catch((e) => { process.stdout.write('\x1b[?25h'); console.error(e); process.exit(1); });
