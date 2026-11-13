#!/usr/bin/env node
'use strict';
/* cc-setup v4: zero-dependency tool (Termux, Windows, Linux).
   - `ccs` background daemon start karta hai (dashboard + smart proxy). Terminal band ho jaye to bhi chalta rehta hai.
   - Termux par wake-lock leta hai taaki battery/sleep se na ruke. `ccs battery` se settings khulti hain.
   - `ccs stop` se sab band. */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const cp = require('child_process'), net = require('net'), crypto = require('crypto');

const WIN = process.platform === 'win32';
const TERMUX = (process.env.PREFIX || '').includes('com.termux');
const HOME = os.homedir(), DIR = path.join(HOME, '.cc-setup'), LOGS = path.join(DIR, 'logs');
const CFG = path.join(DIR, 'config.json'), PIDS = path.join(DIR, 'pids.json'), TASKS = path.join(DIR, 'tasks.json');
const PORT = +process.env.CC_PORT || 8787, PROXY_PORT = +process.env.CC_PROXY_PORT || 8788, PREVIEW_PORT = +process.env.CC_PREVIEW_PORT || 8789;
const PIN = process.env.CC_CLAUDE_VER || '2.1.112';
const REPO = process.env.CC_REPO || 'mrshadowsir/cc-setup', BRANCH = process.env.CC_BRANCH || 'main';
const FILES = ['cc.js', 'proxy.js', 'preview.js', 'apk.js', 'plugins-hub.js', 'dash.html', 'providers.json', 'plugins.json', 'package.json', 'install.sh', 'install.bat', 'README.md', 'README.html'];
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;
const CLAUDE_PKG = '@anthropic-ai/claude-code' + (TERMUX ? '@' + PIN : '');
fs.mkdirSync(LOGS, { recursive: true });

const TTY = process.stdout.isTTY;
const col = (n, s) => (TTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const G = s => col(32, s), R = s => col(31, s), Y = s => col(33, s), C = s => col(36, s), BD = s => col(1, s), DM = s => col(2, s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wj = (f, o) => { fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 2), { mode: 0o600 }); fs.renameSync(f + '.tmp', f); };
const providers = () => rj(path.join(__dirname, 'providers.json'), {});
const plugins = () => rj(path.join(__dirname, 'plugins.json'), []);
const VERSION = () => rj(path.join(__dirname, 'package.json'), {}).version || '?';
const loadCfg = () => ({ provider: 'omniroute', base_url: '', api_key: '', model: '', preset: 'normal', lastDir: '', apkDir: '', token: '', installed: {}, profiles: {}, working: [], auto: false, maxOut: 16000, autoOpen: true, filter: '', wake: true, batteryDone: false, favs: [], hubOn: [], previewDir: '', previewAuto: true, previewMode: 'static', previewDevPort: 3000, previewCmd: '', ...rj(CFG, {}) });
const expand = p => { p = String(p || '').trim(); return p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? path.join(HOME, p.slice(1)) : p; };
const saveCfg = c => wj(CFG, c);
const norm = u => String(u || '').trim().replace(/\/+$/, '');
const ptype = c => (providers()[c.provider] || {}).type || 'anthropic';
const upUrl = (c, p) => ptype(c) === 'openai' ? norm(c.base_url) + p : norm(c.base_url).replace(/\/v1$/, '') + '/v1' + p;
const upHeaders = c => {
  const k = c.api_key, h = { 'content-type': 'application/json' };
  if (!k || k === '-') return h; // bina key wale free providers
  if (ptype(c) === 'openai') h.authorization = 'Bearer ' + k;
  else if (/api\.anthropic\.com/.test(c.base_url)) { h['x-api-key'] = k; h['anthropic-version'] = '2023-06-01'; }
  else { h['x-api-key'] = k; h.authorization = 'Bearer ' + k; h['anthropic-version'] = '2023-06-01'; }
  return h;
};
const mask = k => (k ? (k.length > 8 ? k.slice(0, 4) + '…' + k.slice(-3) : '••••') : '');
const logf = n => path.join(LOGS, String(n).replace(/[^\w.-]/g, '_') + '.log');
const exec = (cmd, args = [], ms = 6000) => new Promise((res, rej) =>
  cp.exec([cmd, ...args].join(' '), { timeout: ms, windowsHide: true }, (e, out) => (e ? rej(e) : res(String(out).trim()))));
const listening = (port, host = '127.0.0.1') => new Promise(r => {
  if (!port) return r(null);
  const s = net.connect(port, host); s.setTimeout(800);
  s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); s.on('timeout', () => { s.destroy(); r(false); });
});
const dashUrl = () => `http://127.0.0.1:${PORT}/?t=${loadCfg().token}`;

function openUrl(url) {
  const tries = TERMUX ? [['termux-open-url', [url]], ['am', ['start', '-a', 'android.intent.action.VIEW', '-d', url]]]
    : WIN ? [['rundll32', ['url.dll,FileProtocolHandler', url]]] : [['xdg-open', [url]]];
  (function next(i) {
    if (i >= tries.length) return;
    try {
      const p = cp.spawn(tries[i][0], tries[i][1], { stdio: 'ignore', windowsHide: true });
      p.on('error', () => next(i + 1)); p.on('exit', c => { if (c) next(i + 1); }); p.unref();
    } catch { next(i + 1); }
  })(0);
}
function clip(t) {
  try {
    const cmd = TERMUX ? 'termux-clipboard-set' : WIN ? 'clip' : null; if (!cmd) return;
    const p = cp.spawn(cmd, [], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    p.on('error', () => {}); p.stdin.on('error', () => {}); p.stdin.end(t);
  } catch { /* ignore */ }
}

/* ---------- wake-lock (Termux): battery/sleep se na ruke ---------- */
let wakeOn = false;
function wake(on) {
  if (!TERMUX) return false;
  const r = cp.spawnSync(on ? 'termux-wake-lock' : 'termux-wake-unlock', { timeout: 3000, stdio: 'ignore' });
  wakeOn = !!on && !r.error && r.status === 0;
  return wakeOn;
}
const BATTERY_ACT = {
  optim: ['android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'],
  app: ['android.settings.APPLICATION_DETAILS_SETTINGS', '-d', 'package:com.termux'],
  autostart: ['-n', 'com.miui.securitycenter/com.miui.permcenter.autostart.AutoStartManagementActivity'],
};
function batteryOpen(which) {
  if (!TERMUX) throw new Error('Ye sirf Termux (Android) ke liye hai');
  const a = BATTERY_ACT[which]; if (!a) throw new Error('unknown');
  const args = a[0].startsWith('-') ? ['start', ...a] : ['start', '-a', ...a];
  const r = cp.spawnSync('am', args, { timeout: 8000, encoding: 'utf8' });
  if (r.error || r.status !== 0 || /Error|Exception/i.test((r.stdout || '') + (r.stderr || ''))) throw new Error('Settings nahi khuli. Haath se kholo: Settings > Apps > Termux > Battery > No restrictions');
  return true;
}
const BATTERY_TEXT = `Android battery ko kaam band karne se rokne ke liye (sirf ek baar, 1 minute):
 1. Settings > Apps > Termux > Battery  ->  "No restrictions" / "Unrestricted" chuno
    (Redmi/Xiaomi: Battery saver > Termux > "No restrictions")
 2. Redmi/Xiaomi: Settings > Apps > Permissions > Autostart > Termux ON
 3. Recent apps kholo, Termux card ko dabake pakdo, Lock (taala) dabao
 4. Termux notification me "Wake lock" dikhna chahiye (ccs khud laga deta hai)
Android 12+ par bhi process mar jaye to (advanced, PC se adb ke saath):
 adb shell "settings put global settings_enable_monitor_phantom_procs false"`;

/* ---------- process lifecycle (daemon ke andar) ---------- */
let isDaemon = false;
const svc = {};
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
function killTree(pid, force) {
  if (WIN) cp.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { /* already gone */ } }
}
const readPids = () => { const o = rj(PIDS, {}); return Array.isArray(o) ? {} : o; };
const savePids = () => {
  try { const o = readPids(), mine = Object.values(svc).filter(e => e.child).map(e => e.pid); if (mine.length) o[process.pid] = mine; else delete o[process.pid]; wj(PIDS, o); } catch { /* ignore */ }
};
function start(name, cmd, opt = {}) {
  if (svc[name] && svc[name].child) return svc[name];
  fs.writeFileSync(logf(name), '');
  const fd = fs.openSync(logf(name), 'a');
  const env = { ...process.env, ...(opt.env || {}), CC_SETUP_RUN: '1', NO_COLOR: '1', FORCE_COLOR: '0' };
  let c;
  if (WIN) c = cp.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', '"' + cmd + '"'], { cwd: opt.cwd, env, windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', fd, fd] });
  else c = cp.spawn('sh', ['-c', cmd], { cwd: opt.cwd, env, detached: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  const e = svc[name] = { child: c, pid: c.pid, started: Date.now(), cmd, port: opt.port || null, code: null, stopped: false };
  c.on('exit', code => { e.child = null; e.code = code; savePids(); if (opt.onExit) opt.onExit(code, e); });
  c.on('error', err => { e.child = null; e.code = -1; try { fs.appendFileSync(logf(name), String(err) + '\n'); } catch { /* ignore */ } });
  savePids();
  return e;
}
function stop(name) {
  const e = svc[name]; if (!e || !e.child) return false;
  e.stopped = true; killTree(e.pid, WIN);
  setTimeout(() => { if (e.child) killTree(e.pid, true); }, 3000).unref();
  return true;
}
function ours(pid) {
  if (WIN) { const o = cp.spawnSync('tasklist', ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).stdout || ''; return /cmd\.exe/i.test(o); }
  try { return fs.readFileSync(`/proc/${pid}/environ`, 'latin1').includes('CC_SETUP_RUN=1'); } catch { return false; }
}
function reap() { // purane daemon ke bache hue process saaf karo
  const o = readPids();
  for (const [owner, pids] of Object.entries(o)) {
    if (+owner === process.pid || alive(+owner)) continue;
    for (const pid of pids) { try { if (alive(pid) && ours(pid)) killTree(pid, true); } catch { /* skip */ } }
    delete o[owner];
  }
  try { wj(PIDS, o); } catch { /* ignore */ }
}
let down = false;
async function shutdown(code = 0) {
  if (down) return; down = true;
  const run = () => Object.values(svc).filter(e => e.child);
  run().forEach(e => killTree(e.pid, WIN));
  for (let t = 0; t < 25 && run().length; t++) await sleep(100);
  run().forEach(e => killTree(e.pid, true));
  try { savePids(); if (+fs.readFileSync(path.join(DIR, 'dash.pid'), 'utf8') === process.pid) fs.unlinkSync(path.join(DIR, 'dash.pid')); } catch { /* ignore */ }
  wake(false);
  process.exit(code);
}
function installSignals() {
  ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].forEach(s => { try { process.on(s, () => shutdown()); } catch { /* is OS par nahi */ } });
  process.on('uncaughtException', e => { console.error(e); shutdown(1); });
  process.on('unhandledRejection', e => console.error('[warn]', e && e.message ? e.message : e));
  process.on('exit', () => Object.values(svc).forEach(e => e.child && killTree(e.pid, true)));
  setInterval(() => { try { for (const f of fs.readdirSync(LOGS)) { const p = path.join(LOGS, f); if (fs.statSync(p).size > 2e6) fs.truncateSync(p, 0); } } catch { /* ignore */ } }, 60000).unref();
}

/* ---------- claude settings ---------- */
const BIG = { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16000', BASH_DEFAULT_TIMEOUT_MS: '600000', BASH_MAX_TIMEOUT_MS: '1800000' };
function apply(c) {
  const dir = path.join(HOME, '.claude'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'settings.json'), s = rj(f, {});
  if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
  const m = c.model, big = c.preset === 'big';
  const env = { ...(s.env || {}), ANTHROPIC_BASE_URL: PROXY_URL, ANTHROPIC_AUTH_TOKEN: c.token, ANTHROPIC_MODEL: m,
    ANTHROPIC_DEFAULT_SONNET_MODEL: m, ANTHROPIC_DEFAULT_OPUS_MODEL: m, ANTHROPIC_DEFAULT_HAIKU_MODEL: m, ANTHROPIC_SMALL_FAST_MODEL: m,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', API_TIMEOUT_MS: '1800000' };
  if (TERMUX) env.DISABLE_AUTOUPDATER = '1';
  for (const k of Object.keys(BIG)) { if (big) env[k] = BIG[k]; else delete env[k]; }
  s.env = env;
  s.permissions = s.permissions || {};
  if (big) s.permissions.defaultMode = 'acceptEdits'; else if (s.permissions.defaultMode === 'acceptEdits') delete s.permissions.defaultMode;
  fs.writeFileSync(f, JSON.stringify(s, null, 2), { mode: 0o600 });
  const cj = path.join(HOME, '.claude.json'), o = rj(cj, {}); o.hasCompletedOnboarding = true; fs.writeFileSync(cj, JSON.stringify(o, null, 2));
}
const claudeEnv = c => { const e = { ...process.env }; if (c.base_url) { e.ANTHROPIC_BASE_URL = PROXY_URL; e.ANTHROPIC_AUTH_TOKEN = c.token; if (c.model) e.ANTHROPIC_MODEL = c.model; } return e; };

const cache = {};
function cached(key, ttl, fn) {
  const c = cache[key];
  if (c && Date.now() - c.t < ttl) return c.v;
  if (!c || !c.busy) { cache[key] = { v: c ? c.v : null, t: c ? c.t : 0, busy: true }; fn().then(v => { cache[key] = { v, t: Date.now() }; }, () => { cache[key] = { v: null, t: Date.now() }; }); }
  return c ? c.v : null;
}

/* ---------- gateway calls ---------- */
async function listModels(filter, max, cc) {
  const c = cc || loadCfg(); if (!c.base_url) throw new Error('Pehle base URL save karo');
  if (c.base_url.includes('{')) throw new Error('URL me {account_id} apni asli ID se badlo');
  const r = await fetch(upUrl(c, '/models'), { headers: upHeaders(c), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('Models list nahi mili (HTTP ' + r.status + ')');
  const j = await r.json(), f = String(filter || '').toLowerCase();
  const ids = (j.data || j.models || []).map(x => String(x.id || x.name || x).replace(/^models\//, '')).filter(Boolean);
  return ids.filter(i => !f || i.toLowerCase().includes(f)).slice(0, max || 30);
}
async function testModel(model, cc) {
  const c = cc || loadCfg(), t0 = Date.now(), oa = ptype(c) === 'openai';
  try {
    const r = await fetch(upUrl(c, oa ? '/chat/completions' : '/messages'), { method: 'POST', headers: upHeaders(c), signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ model, max_tokens: oa ? 64 : 16, messages: [{ role: 'user', content: 'hi' }] }) });
    const j = await r.json().catch(() => ({})), e = Array.isArray(j) ? j[0] : j;
    if (r.ok && (j.content || j.choices)) return { ok: true, ms: Date.now() - t0 };
    return { ok: false, err: String((e.error && (e.error.message || e.error)) || 'HTTP ' + r.status) };
  } catch (e) { return { ok: false, err: e.name === 'TimeoutError' ? 'timeout' : e.message }; }
}
function updateWorking(m, ok) {
  const c = loadCfg(), w = (c.working || []).filter(x => x !== m); if (ok) w.unshift(m); c.working = w.slice(0, 20); saveCfg(c);
}

/* ---------- Hub: har provider ki key/models alag se sambhalo ---------- */
const credsFor = (c, id) => (id === c.provider ? c : { ...(c.profiles[id] || {}) });
const provCfg = (c, P, id) => { const cr = credsFor(c, id), d = P[id] || {}; return { provider: id, base_url: cr.base_url || d.base_url || '', api_key: cr.api_key || d.def_key || '' }; };
const hubOn = (c, id) => id === c.provider || !!credsFor(c, id).api_key || (c.hubOn || []).includes(id);
function switchProv(c, P, id) {
  c.profiles[c.provider] = { base_url: c.base_url, api_key: c.api_key, model: c.model, working: c.working };
  const pr = c.profiles[id] || {};
  c.provider = id; c.base_url = pr.base_url || P[id].base_url || ''; c.api_key = pr.api_key || ''; c.model = pr.model || ''; c.working = pr.working || [];
  if (!P[id].cmd) stop('gateway');
  if (proxy) proxy.clear();
}
function updateWorkingFor(id, m, ok) {
  const c = loadCfg(); if (id === c.provider) return updateWorking(m, ok);
  const pr = c.profiles[id] = c.profiles[id] || {}, w = (pr.working || []).filter(x => x !== m); if (ok) w.unshift(m); pr.working = w.slice(0, 20); saveCfg(c);
}
const modelCache = {};
async function hubModels(c, P, id, force) {
  const cf = provCfg(c, P, id), key = cf.base_url + '|' + mask(cf.api_key), hit = modelCache[id];
  if (!force && hit && hit.key === key && Date.now() - hit.t < 120000) return hit.models;
  const models = await listModels('', 5000, cf);
  modelCache[id] = { key, t: Date.now(), models }; return models;
}

/* ---------- OmniRoute: dashboard se install / start ---------- */
const OMNI_PORT = 20128;
const NODE_MAJOR = parseInt(process.versions.node, 10);
const omniNodeOk = NODE_MAJOR === 22 || (NODE_MAJOR >= 24 && NODE_MAJOR < 27); // OmniRoute ka engines: >=22 <23 || >=24 <27
const omniVersion = () => cached('omni', 60000, () => new Promise(res => cp.exec('npm ls -g omniroute --depth=0 --json', { timeout: 25000, windowsHide: true }, (e, out) => {
  try { const j = JSON.parse(String(out || '{}')); res((j.dependencies && j.dependencies.omniroute && j.dependencies.omniroute.version) || ''); } catch { res(''); }
})));
let proxy = null, pv = null;
async function probe() {
  const c = loadCfg(); let cand = [...(c.working || [])];
  try { for (const m of await listModels(c.filter || '', 14)) if (!cand.includes(m)) cand.push(m); } catch { /* working hi sahi */ }
  cand = cand.filter(m => m !== c.model && !(proxy && proxy.isFailed(m))).slice(0, 12);
  const ok = [];
  for (let i = 0; i < cand.length; i += 3) {
    const rs = await Promise.all(cand.slice(i, i + 3).map(async m => ({ m, r: await testModel(m) })));
    for (const x of rs) { updateWorking(x.m, x.r.ok); if (x.r.ok) ok.push(x.m); }
  }
  return ok;
}
function notify(msg) { if (TERMUX) cp.spawn('termux-notification', ['--title', 'ccs', '--content', msg], { stdio: 'ignore' }).on('error', () => {}).unref(); }
function onIncident() { if (TERMUX && loadCfg().autoOpen !== false) openUrl(dashUrl()); }

/* ---------- doctor ---------- */
async function doctor() {
  const out = [], add = (name, ok, msg, fix) => out.push({ name, ok, msg: String(msg), fix: ok ? '' : fix || '' });
  const nv = parseInt(process.versions.node, 10);
  add('Node.js', nv >= 18, process.version, 'Node 18+ install karo');
  const g = await exec('git', ['--version']).catch(() => null);
  add('Git', !!g, g || 'nahi mila', TERMUX ? 'pkg install git' : 'winget install Git.Git');
  const v = await exec('claude', ['--version'], 10000).catch(() => null);
  add('Claude Code', !!v, v || 'install nahi hai', 'Dashboard me Install dabao, ya: ccs install');
  const c = loadCfg(), gp = providers()[c.provider] || {};
  add('URL aur API key', !!(c.base_url && c.api_key), c.base_url && c.api_key ? gp.name || c.provider : 'save nahi hai', 'Home me URL aur key daalke Save karo');
  add('Model', !!c.model, c.model || 'chuna nahi', 'Models tab se model chuno');
  if (gp.port) { const up = await listening(gp.port); add('Gateway', up, up ? 'port ' + gp.port + ' chalu' : 'band hai', 'Home me Start dabao'); }
  if (c.base_url && c.api_key) {
    try { const m = await listModels('', 500); add('Gateway reply', true, m.length + ' models mile'); }
    catch (e) { add('Gateway reply', false, e.message, 'URL aur key check karo, gateway chalu hai?'); }
    if (c.model) { const t = await testModel(c.model); add('Model test', t.ok, t.ok ? (t.ms / 1000).toFixed(1) + 's' : t.err, 'Models tab se dusra model chuno'); }
  }
  const sf = rj(path.join(HOME, '.claude', 'settings.json'), {});
  add('Smart proxy', !!(await listening(PROXY_PORT)), 'port ' + PROXY_PORT, 'ccs chalao');
  add('Claude settings', !!(sf.env && String(sf.env.ANTHROPIC_BASE_URL).includes(String(PROXY_PORT))), sf.env && sf.env.ANTHROPIC_BASE_URL ? sf.env.ANTHROPIC_BASE_URL : 'nahi lagi', 'Home me Save dabao (URL, key, model ke baad)');
  if (TERMUX) {
    add('Wake-lock', wakeOn, wakeOn ? 'ON (background me chalega)' : 'OFF', 'ccs chalao ya Home me Wake-lock ON karo');
    add('Battery fix', !!c.batteryDone, c.batteryDone ? 'ho gaya' : 'baaki hai', 'Terminal me: ccs battery');
  }
  return out;
}

/* ---------- tasks (claude -p) ---------- */
const CLAUDE_MD = `# Kaam ke niyam
- Pehle poora task samjho, phir TODO.md me chhote steps likho aur ek-ek karke poore karo.
- Har step ke baad chalao/test karo. Fail ho to ruk ke fix karo, aage mat badho.
- Bade file ko ek saath mat likho; chhote hisso me banao.
- Koi step adhura ho to TODO.md me likho kahan ruke the, taaki dobara chalane par wahin se shuru ho.
- Aakhir me batao kya bana, kya nahi bana, aur kaise chalana hai.
`;
const brief = i => String((i && (i.command || i.file_path || i.path || i.pattern || i.url || i.description)) || '').slice(0, 100);
function fmtLine(line) {
  let j; try { j = JSON.parse(line); } catch { return line; }
  if (j.type === 'assistant' && j.message && Array.isArray(j.message.content))
    return j.message.content.map(x => (x.type === 'text' ? x.text : x.type === 'tool_use' ? '▸ ' + x.name + ' ' + brief(x.input) : '')).filter(Boolean).join('\n');
  if (j.type === 'result') return '\n' + (j.is_error ? '✘ Error: ' : '✔ Khatam: ') + (j.result || j.subtype || '');
  if (j.type === 'system' && j.subtype === 'init') return '— shuru (model: ' + (j.model || '?') + ')';
  return '';
}
const setTask = (id, patch) => { const t = rj(TASKS, []), x = t.find(k => k.id === id); if (x) { Object.assign(x, patch); wj(TASKS, t); } };
async function runTask(b) {
  const dir = path.resolve(HOME, expand(b.dir));
  if (b.create && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Folder nahi mila: ' + dir);
  const prompt = String(b.prompt || '').trim(); if (!prompt) throw new Error('Pehle task likho');
  if (Object.keys(svc).some(k => k.startsWith('task-') && svc[k].child)) throw new Error('Ek task pehle se chal raha hai. Pehle use roko');
  if (!(await exec('claude', ['--version'], 10000).catch(() => null))) throw new Error('Claude Code install nahi hai. Home se Install karo');
  const c = loadCfg(); c.lastDir = dir;
  if (c.previewAuto !== false && c.previewDir !== dir) { c.previewDir = dir; if (pv) pv.setDir(dir); } // preview usi folder ka dikhao jisme kaam ho raha hai
  saveCfg(c);
  const id = Date.now().toString(36), pf = path.join(DIR, 'prompt-' + id + '.txt');
  fs.writeFileSync(pf, prompt);
  const md = path.join(dir, 'CLAUDE.md'); if (b.claudemd && !fs.existsSync(md)) fs.writeFileSync(md, CLAUDE_MD);
  const flags = ['-p', '--output-format', 'stream-json', '--verbose', b.auto ? '--dangerously-skip-permissions' : '--permission-mode acceptEdits'];
  if (b.cont) flags.push('--continue');
  const name = 'task-' + id;
  const t = rj(TASKS, []); t.push({ id, dir, prompt: prompt.slice(0, 160), started: Date.now(), status: 'running' }); wj(TASKS, t.slice(-20));
  start(name, `claude ${flags.join(' ')} < "${pf}"`, { cwd: dir, env: claudeEnv(c),
    onExit: (code, e) => { setTask(id, { status: e.stopped ? 'stopped' : code === 0 ? 'done' : 'failed', ended: Date.now() }); try { fs.unlinkSync(pf); } catch { /* ignore */ } } });
  return { ok: true, id };
}
function taskLog(id) {
  const raw = tail('task-' + id, 150000);
  return raw.split('\n').map(fmtLine).filter(Boolean).join('\n').slice(-20000);
}
function tail(name, bytes = 20000) {
  try {
    const f = logf(name), st = fs.statSync(f), len = Math.min(st.size, bytes), buf = Buffer.alloc(len), fd = fs.openSync(f, 'r');
    fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
    return buf.toString('utf8').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split('\n').slice(-(bytes > 20000 ? 2000 : 150)).join('\n');
  } catch { return ''; }
}

/* ---------- APK + plugin helpers ---------- */
const apkCmd = args => `node "${path.join(__dirname, 'apk.js')}" ` + args.map(a => JSON.stringify(String(a))).join(' ');
const SKILL = `---
name: apk-build
description: Build Android APK files with the ccs tool. Use when the user asks to make, build, package or compile an APK or an Android app (new app, web app to APK, or an existing Gradle project).
---

# APK build (ccs)

Naya app (web folder se):
- \`ccs apk new NAAM --web FOLDER\` banata hai ~/apk-projects/NAAM (FOLDER me index.html hona chahiye). --web na do to starter page milta hai.
- Pehle app/src/main/assets/www/ me HTML/CSS/JS likho/badlo. Native logic ke liye app/src/main/java/... me MainActivity.java.

APK banana:
- \`ccs apk cloud PROJECT_FOLDER\`: GitHub Actions par build (Termux par yahi use karo, SDK nahi chahiye). Pehle ek baar \`gh auth login\` hona chahiye.
- \`ccs apk local PROJECT_FOLDER\`: sirf tab jab JDK 17, Gradle aur ANDROID_HOME maujood ho (Windows/PC).
- Output: PROJECT_FOLDER/apk-out/*.apk. Termux par APK ~/storage/downloads me bhi copy hoti hai.

Niyam:
- Build fail ho to log padho, code theek karo, dobara chalao. Har fix ke baad build karo.
- Existing Android project ho to bas \`ccs apk cloud\` chalao: workflow khud add hota hai.
- Debug APK banti hai (signed with debug key), Play Store release ke liye nahi.
`;
async function apkSetup() {
  const d = path.join(HOME, '.claude', 'skills', 'apk-build'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'), SKILL);
  console.log('[ok] Claude ko APK skill mil gayi: ' + path.join(d, 'SKILL.md'));
  if (TERMUX) { try { cp.execSync('pkg install -y gh git', { stdio: 'inherit' }); } catch { console.log('[!] gh install nahi hua. Haath se: pkg install gh'); } }
  else if (WIN) console.log('GitHub CLI chahiye (cloud build ke liye): winget install GitHub.cli');
  else console.log('GitHub CLI (gh) install karo (cloud build ke liye)');
  console.log('Agla step (ek baar): gh auth login');
}

/* ---------- update ---------- */
async function update(log = console.log) {
  const before = VERSION(), q = JSON.stringify(__dirname);
  if (fs.existsSync(path.join(__dirname, '.git'))) {
    log('[*] git se naya version la raha hu…');
    try { log(await exec('git', ['-C', q, 'pull', '--ff-only'], 90000)); }
    catch { log('[*] seedha pull nahi hua, force update…'); log(await exec('git', ['-C', q, 'fetch', '--depth', '1', 'origin', BRANCH], 90000)); log(await exec('git', ['-C', q, 'reset', '--hard', 'FETCH_HEAD'], 30000)); }
  } else {
    log('[*] GitHub se files download ho rahi hain…');
    let n = 0;
    for (const f of FILES) {
      try {
        const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${f}`, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) { log('  - ' + f + ': nahi mili (HTTP ' + r.status + ')'); continue; }
        const t = path.join(__dirname, f + '.new'); fs.writeFileSync(t, Buffer.from(await r.arrayBuffer())); fs.renameSync(t, path.join(__dirname, f)); n++; log('  ok ' + f);
      } catch (e) { log('  - ' + f + ': ' + e.message); }
    }
    if (!n) throw new Error('Koi file download nahi hui. Internet check karo.');
  }
  log('[ok] Version: ' + before + ' -> ' + VERSION());
}
function respawn() {
  try { const c = cp.spawn(process.execPath, [__filename, 'delayed-start'], { detached: true, stdio: 'ignore', windowsHide: true }); c.unref(); } catch { /* ignore */ }
  shutdown(0);
}

/* ---------- dashboard API ---------- */
async function state() {
  const c = loadCfg(), P = providers(), gp = P[c.provider] || {};
  const bat = TERMUX ? cached('bat', 120000, async () => JSON.parse(await exec('termux-battery-status', [], 3000))) : null;
  const ver = cached('claude', 300000, () => exec('claude', ['--version'], 10000));
  const run = Object.keys(svc).find(k => k.startsWith('task-') && svc[k].child);
  let logs = []; try { logs = fs.readdirSync(LOGS).filter(f => f.endsWith('.log')).map(f => ({ n: f.slice(0, -4), t: fs.statSync(path.join(LOGS, f)).mtimeMs })).sort((a, b) => b.t - a.t).map(x => x.n); } catch { /* ignore */ }
  return {
    version: VERSION(), repo: REPO,
    cfg: { provider: c.provider, base_url: c.base_url, key: c.api_key === '-' ? 'bina key' : mask(c.api_key), model: c.model, preset: c.preset, lastDir: c.lastDir || HOME, apkDir: c.apkDir || '', auto: !!c.auto, working: (c.working || []).length, type: ptype(c), batteryDone: !!c.batteryDone, wake: c.wake !== false },
    wake: { supported: TERMUX, on: wakeOn },
    proxy: proxy ? proxy.info() : { incident: null, lastSwitch: null },
    providers: Object.fromEntries(Object.entries(P).map(([k, v]) => { const cr = credsFor(c, k);
      return [k, { name: v.name, base_url: v.base_url, url: cr.base_url || v.base_url || '', hasCmd: !!v.cmd, hint: v.hint || '', group: v.group || 'other', key_url: v.key_url || '', limits: v.limits || '', card: v.card || '', note: v.note || '',
        keyless: v.def_key === '-', key: cr.api_key && cr.api_key !== '-' ? mask(cr.api_key) : '', on: hubOn(c, k), active: k === c.provider, models: v.models || [], filter: v.filter || '', type: v.type || 'anthropic' }]; })),
    gateway: { hasCmd: !!gp.cmd, up: await listening(gp.port), running: !!(svc.gateway && svc.gateway.child) || (gp.port === OMNI_PORT && !!(svc.omni && svc.omni.child)) },
    omni: { version: omniVersion(), checked: !!(cache.omni && cache.omni.t), up: await listening(OMNI_PORT), running: !!(svc.omni && svc.omni.child), installing: !!(svc['job-omniroute'] && svc['job-omniroute'].child), nodeOk: omniNodeOk, node: process.version, port: OMNI_PORT, active: c.provider === 'omniroute' },
    claude: { version: ver, checked: !!(cache.claude && cache.claude.t), pinned: TERMUX ? PIN : null, installing: !!(svc['job-claude'] && svc['job-claude'].child) },
    plugins: plugins().map(p => ({ id: p.id, name: p.name, desc: p.desc, note: p.note, rec: !!p.rec, hasCmd: !!p.cmd, installed: !!c.installed[p.id],
      job: svc['job-' + p.id] ? (svc['job-' + p.id].child ? 'running' : (svc['job-' + p.id].code ? 'failed' : '')) : '' })),
    apk: { running: !!(svc['job-apk'] && svc['job-apk'].child) },
    tasks: rj(TASKS, []).reverse().slice(0, 12), runningTask: run ? run.slice(5) : null, logs,
    platform: TERMUX ? 'Termux' : WIN ? 'Windows' : process.platform, uptime: Math.round(process.uptime()),
    sys: { free: os.freemem(), total: os.totalmem(), load: os.loadavg()[0], battery: bat },
  };
}
const pluginsHub = require('./plugins-hub.js');
async function route(u, b) {
  const p = u.pathname.slice(5), c = loadCfg(), P = providers();
  switch (p) {
    case 'state': return state();
    case 'config': {
      if (b.provider && P[b.provider] && b.provider !== c.provider) switchProv(c, P, b.provider);
      if (typeof b.auto === 'boolean') c.auto = b.auto;
      if (typeof b.batteryDone === 'boolean') c.batteryDone = b.batteryDone;
      if (typeof b.wake === 'boolean') { c.wake = b.wake; if (TERMUX) wake(b.wake); }
      if (typeof b.base_url === 'string') c.base_url = norm(b.base_url);
      if (b.api_key) c.api_key = String(b.api_key).trim();
      if (typeof b.model === 'string') c.model = b.model.trim();
      if (b.preset === 'normal' || b.preset === 'big') c.preset = b.preset;
      saveCfg(c);
      const ready = !!(c.base_url && c.api_key && c.model);
      if (ready) apply(c);
      return { ok: true, applied: ready };
    }
    case 'svc': {
      const gp = P[c.provider] || {};
      if (b.op === 'start') {
        if (!gp.cmd) throw new Error('Is provider ko local gateway nahi chahiye');
        if (await listening(gp.port)) throw new Error('Port ' + gp.port + ' pehle se chalu hai');
        start('gateway', gp.cmd, { port: gp.port });
      } else { stop('gateway'); if (c.provider === 'omniroute') stop('omni'); }
      return { ok: true };
    }
    case 'logs': return { text: tail(u.searchParams.get('name') || 'gateway') };
    case 'models': { const f = u.searchParams.get('filter') || ''; c.filter = f; saveCfg(c); return { models: await listModels(f, +u.searchParams.get('max')), working: c.working }; }
    case 'test': { const r = await testModel(b.model); updateWorking(b.model, r.ok); return r; }
    case 'hub/models': {
      const want = u.searchParams.get('provider') || 'all', force = u.searchParams.get('force') === '1';
      const ids = (want === 'all' ? Object.keys(P).filter(k => hubOn(c, k) || (k === 'omniroute')) : [want]).filter(k => P[k]);
      const groups = await Promise.all(ids.map(async id => {
        const d = P[id], g = { id, name: d.name, ok: true, err: '', models: [], suggested: false };
        try {
          if (id === 'omniroute' && !(await listening(OMNI_PORT))) return null; // band hai to chup-chaap chhodo (OmniRoute tab me Start milega)
          g.models = await hubModels(c, P, id, force);
        } catch (e) {
          g.ok = false; g.err = e.name === 'TimeoutError' ? 'timeout' : (e.message || String(e));
          if (d.models && d.models.length) { g.models = d.models; g.suggested = true; }
        }
        return g;
      }));
      const working = {}; for (const id of ids) working[id] = (id === c.provider ? c.working : (c.profiles[id] || {}).working) || [];
      return { groups: groups.filter(Boolean), working, favs: c.favs || [], active: { provider: c.provider, model: c.model, url: c.base_url } };
    }
    case 'hub/use': {
      const id = String(b.provider || c.provider), m = String(b.model || '').trim();
      if (!P[id]) throw new Error('Provider nahi mila'); if (!m) throw new Error('Model ka naam chahiye');
      const cr = credsFor(c, id), base = cr.base_url || P[id].base_url || '', key = cr.api_key || P[id].def_key || '';
      if (!base) throw new Error('Pehle ' + P[id].name + ' ka URL daalo');
      if (base.includes('{')) throw new Error('URL me {account_id} apni asli ID se badlo (Free APIs tab)');
      if (!key) throw new Error(P[id].name + ' ki API key pehle save karo (Free APIs tab)');
      if (id !== c.provider) switchProv(c, P, id);
      c.base_url = base; c.api_key = key; c.model = m; saveCfg(c); apply(c);
      return { ok: true, applied: true };
    }
    case 'hub/save': {
      const id = String(b.provider || ''); if (!P[id]) throw new Error('Provider nahi mila');
      const patch = {};
      if (typeof b.base_url === 'string' && b.base_url.trim()) patch.base_url = norm(b.base_url);
      if (b.api_key) patch.api_key = String(b.api_key).trim();
      if (!Object.keys(patch).length) throw new Error('Key ya URL likho');
      if (patch.base_url && patch.base_url.includes('{')) throw new Error('URL me {account_id} ki jagah apni asli Account ID likho');
      if (id === c.provider) Object.assign(c, patch); else c.profiles[id] = { ...(c.profiles[id] || {}), ...patch };
      c.hubOn = Array.from(new Set([...(c.hubOn || []), id])); delete modelCache[id]; saveCfg(c);
      if (id === c.provider && c.base_url && c.api_key && c.model) apply(c);
      return { ok: true };
    }
    case 'hub/clear': {
      const id = String(b.provider || ''); if (!P[id]) throw new Error('Provider nahi mila');
      if (id === c.provider) c.api_key = ''; else if (c.profiles[id]) c.profiles[id].api_key = '';
      c.hubOn = (c.hubOn || []).filter(x => x !== id); delete modelCache[id]; saveCfg(c); return { ok: true };
    }
    case 'hub/toggle': {
      const id = String(b.provider || ''); if (!P[id]) throw new Error('Provider nahi mila');
      const on = new Set(c.hubOn || []); if (b.on) on.add(id); else on.delete(id); c.hubOn = [...on]; saveCfg(c); return { ok: true };
    }
    case 'hub/check': {
      const id = String(b.provider || ''); if (!P[id]) throw new Error('Provider nahi mila');
      try { const m = await hubModels(c, P, id, true); return { ok: true, count: m.length }; }
      catch (e) { return { ok: false, err: e.name === 'TimeoutError' ? 'timeout (internet ya URL check karo)' : (e.message || String(e)) }; }
    }
    case 'hub/test': {
      const id = String(b.provider || c.provider), m = String(b.model || '').trim(); if (!P[id]) throw new Error('Provider nahi mila'); if (!m) throw new Error('Model ka naam chahiye');
      const r = await testModel(m, provCfg(c, P, id)); updateWorkingFor(id, m, r.ok); return r;
    }
    case 'hub/fav': {
      const k = String(b.key || '').slice(0, 200); if (!k.includes('|')) throw new Error('galat key');
      const f = new Set(c.favs || []); if (f.has(k)) f.delete(k); else f.add(k); c.favs = [...f].slice(-200); saveCfg(c); return { ok: true, on: f.has(k) };
    }
    case 'omni/install': {
      if (svc['job-omniroute'] && svc['job-omniroute'].child) throw new Error('Install pehle se chal raha hai');
      start('job-omniroute', 'npm install -g omniroute', { onExit: () => { delete cache.omni; } }); return { ok: true };
    }
    case 'omni/start': {
      if (await listening(OMNI_PORT)) throw new Error('Port ' + OMNI_PORT + ' pehle se chalu hai');
      const have = omniVersion() || (cache.omni && cache.omni.v);
      start('omni', have ? 'omniroute' : 'npx -y omniroute', { port: OMNI_PORT }); return { ok: true };
    }
    case 'omni/stop': stop('omni'); return { ok: true };
    case 'omni/use': {
      if (c.provider !== 'omniroute') switchProv(c, P, 'omniroute');
      if (!c.base_url) c.base_url = P.omniroute.base_url; if (!c.api_key) c.api_key = P.omniroute.def_key;
      c.hubOn = Array.from(new Set([...(c.hubOn || []), 'omniroute'])); saveCfg(c);
      if (c.model) apply(c);
      return { ok: true, needModel: !c.model };
    }
    case 'incident/pick': { const m = String(b.model || '').trim(); if (!m) throw new Error('Model ka naam chahiye'); proxy.pick(m); return { ok: true }; }
    case 'incident/retry': proxy.retryNow(); return { ok: true };
    case 'incident/probe': return { options: await probe() };
    case 'doctor': return { checks: await doctor() };
    case 'battery/open': batteryOpen(String(b.which || 'optim')); return { ok: true };
    case 'claude/install': start('job-claude', 'npm i -g ' + CLAUDE_PKG, { onExit: () => { delete cache.claude; } }); return { ok: true };
    case 'plugin/install': {
      const pl = plugins().find(x => x.id === b.id);
      if (!pl || !pl.cmd) throw new Error('Is plugin ka command plugins.json me nahi hai');
      start('job-' + pl.id, pl.cmd.replace(/\{DIR\}/g, __dirname), { cwd: __dirname, onExit: code => { if (code === 0) { const k = loadCfg(); k.installed[pl.id] = true; saveCfg(k); } } });
      return { ok: true };
    }
    case 'plugin/run': {
      const cmd = String(b.cmd || '').trim();
      if (!/^(claude|npx|npm|pip|python|python3|pkg)\s/.test(cmd)) throw new Error('Command claude, npx, npm, pip ya pkg se shuru hona chahiye');
      start('job-custom', cmd, { cwd: __dirname }); return { ok: true };
    }
    case 'apk/new': {
      if (svc['job-apk'] && svc['job-apk'].child) throw new Error('APK ka kaam pehle se chal raha hai');
      const name = String(b.name || '').trim();
      if (!/^[\w-]{1,40}$/.test(name)) throw new Error('Naam me sirf English akshar, number, - ya _ (40 tak)');
      const base = path.join(HOME, 'apk-projects'); fs.mkdirSync(base, { recursive: true });
      const args = ['new', name, '--out', base]; if (b.web && String(b.web).trim()) args.push('--web', String(b.web).trim());
      c.apkDir = path.join(base, name); saveCfg(c);
      start('job-apk', apkCmd(args)); return { ok: true, dir: c.apkDir };
    }
    case 'apk/build': {
      if (svc['job-apk'] && svc['job-apk'].child) throw new Error('APK ka kaam pehle se chal raha hai');
      const dir = path.resolve(String(b.dir || c.apkDir || '').trim() || '.');
      if (!fs.existsSync(dir)) throw new Error('Folder nahi mila: ' + dir);
      c.apkDir = dir; saveCfg(c);
      start('job-apk', apkCmd([b.mode === 'local' ? 'local' : 'cloud', dir]), { cwd: dir }); return { ok: true };
    }
    case 'update': {
      if (Object.keys(svc).some(k => k.startsWith('task-') && svc[k].child)) throw new Error('Task chal raha hai. Pehle use roko, phir update karo');
      const lf = logf('job-update'); fs.writeFileSync(lf, '');
      const log = m => { try { fs.appendFileSync(lf, m + '\n'); } catch { /* ignore */ } };
      update(log).then(() => { log('[ok] Dashboard dobara chalu ho raha hai… 5 second baad page reload karo'); setTimeout(respawn, 1500); }, e => log('[!] ' + (e.message || e)));
      return { ok: true };
    }
    case 'preview/state': {
      if (!pv) throw new Error('Preview chalu nahi hua');
      pv.touch(); const i = pv.info(); let suggest = [];
      if (i.ok) { const pj = rj(path.join(i.dir, 'package.json'), null); if (pj && pj.scripts) suggest = ['dev', 'start', 'serve', 'preview'].filter(k => pj.scripts[k]).map(k => 'npm run ' + k); }
      const dv = svc['preview-dev'], dp = c.previewDevPort;
      return { ...i, port: PREVIEW_PORT, mode: c.previewMode, devPort: dp, cmd: c.previewCmd, auto: c.previewAuto !== false, suggest, home: HOME, lastDir: c.lastDir || '',
        dev: { running: !!(dv && dv.child), up: !!((await listening(dp)) || (await listening(dp, '::1'))) } };
    }
    case 'preview/set': {
      if (!pv) throw new Error('Preview chalu nahi hua');
      if (typeof b.dir === 'string') {
        if (!b.dir.trim()) throw new Error('Folder ka path likho');
        const d = path.resolve(HOME, expand(b.dir));
        if (!fs.existsSync(d)) { if (b.create) fs.mkdirSync(d, { recursive: true }); else throw new Error('Folder nahi mila: ' + d + ' (naya banana ho to "Naya folder" dabao)'); }
        if (!fs.statSync(d).isDirectory()) throw new Error('Ye folder nahi hai: ' + d);
        if (c.previewDir !== d) { c.previewDir = d; pv.setDir(d); }
      }
      if (b.mode === 'static' || b.mode === 'dev') c.previewMode = b.mode;
      if (b.devPort !== undefined && b.devPort !== '') {
        const n = +b.devPort; if (!(n > 0 && n < 65536)) throw new Error('Port galat hai (1 se 65535)');
        if ([PORT, PROXY_PORT, PREVIEW_PORT].includes(n)) throw new Error('Ye port ccs ka hai, dusra chuno');
        c.previewDevPort = n;
      }
      if (typeof b.cmd === 'string') c.previewCmd = b.cmd.trim();
      if (typeof b.auto === 'boolean') c.previewAuto = b.auto;
      saveCfg(c); return { ok: true };
    }
    case 'preview/dev': {
      if (b.op === 'stop') { stop('preview-dev'); return { ok: true }; }
      const cmd = String(b.cmd || c.previewCmd || '').trim();
      if (!/^(npm|npx|pnpm|yarn|bun|node|deno|python3?|php)\s/.test(cmd) || /[;&|`$<>\n\r]/.test(cmd)) throw new Error('Command npm/npx/pnpm/yarn/node/python/php se shuru ho aur ; & | $ na ho (jaise: npm run dev)');
      if (!c.previewDir || !fs.existsSync(c.previewDir)) throw new Error('Pehle project folder lagao');
      if (svc['preview-dev'] && svc['preview-dev'].child) throw new Error('Dev server pehle se chal raha hai');
      c.previewCmd = cmd; saveCfg(c);
      start('preview-dev', cmd, { cwd: c.previewDir, port: c.previewDevPort }); return { ok: true };
    }
    case 'task/run': return runTask(b);
    case 'task/stop': Object.keys(svc).filter(k => k.startsWith('task-')).forEach(stop); return { ok: true };
    case 'task/log': { const id = String(u.searchParams.get('id') || '').replace(/\W/g, ''); return { text: taskLog(id), running: !!(svc['task-' + id] && svc['task-' + id].child) }; }
    case 'stopall': Object.keys(svc).forEach(stop); return { ok: true };
    case 'quit': setTimeout(() => shutdown(), 200); return { ok: true };
    default: {
      if (p.startsWith('mp/')) {
        const mctx = { start, running: () => Object.keys(svc).filter(k => k.startsWith('job-mp-') && svc[k].child).map(k => k.slice(7)), log: (n, t) => { try { fs.appendFileSync(logf(n), t + '\n'); } catch { /* ignore */ } } };
        const r = await pluginsHub.route(p.slice(3), b, mctx);
        if (r !== undefined) return r;
      }
      throw new Error('unknown: ' + p);
    }
  }
}

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#18c7ff"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="url(#g)"/><text x="48" y="62" font-family="sans-serif" font-size="44" font-weight="700" text-anchor="middle" fill="#fff">cc</text></svg>';
const MANIFEST = JSON.stringify({ name: 'ccs', short_name: 'ccs', start_url: '/', display: 'standalone', background_color: '#0b1020', theme_color: '#7c5cff', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] });

async function daemon() {
  isDaemon = true; installSignals(); reap();
  const cfg = loadCfg(); if (!cfg.token) { cfg.token = crypto.randomBytes(8).toString('hex'); saveCfg(cfg); }
  if (await listening(PORT)) { console.log('daemon pehle se chalu hai'); process.exit(0); }
  const srv = http.createServer(async (req, res) => {
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return send(403, {});
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') return send(200, fs.readFileSync(path.join(__dirname, 'dash.html'), 'utf8'), 'text/html; charset=utf-8');
    if (u.pathname === '/manifest.json') return send(200, MANIFEST, 'application/manifest+json');
    if (u.pathname === '/icon.svg') return send(200, ICON, 'image/svg+xml');
    if (!u.pathname.startsWith('/api/')) return send(404, {});
    if (req.headers['x-t'] !== loadCfg().token) return send(401, { error: 'Token galat. Terminal me likho: ccs  (naya link khulega)' });
    let body = {};
    if (req.method === 'POST') { let s = ''; for await (const ch of req) { s += ch; if (s.length > 262144) return send(413, {}); } try { body = JSON.parse(s || '{}'); } catch { /* empty */ } }
    try { send(200, await route(u, body)); } catch (e) { send(200, { error: e.message || String(e) }); }
  });
  srv.on('error', e => { console.log('[!] Dashboard start nahi hua: ' + e.message); process.exit(1); });
  if (await listening(PROXY_PORT)) console.log(`[!] Proxy port ${PROXY_PORT} busy hai. CC_PROXY_PORT badlo.`);
  else {
    proxy = require(path.join(__dirname, 'proxy.js'))({ loadCfg, saveCfg, apply, ptype, upUrl, upHeaders, notify, onIncident });
    proxy.on('error', e => console.log('[!] Proxy start nahi hua: ' + e.message));
    proxy.listen(PROXY_PORT);
  }
  pv = require(path.join(__dirname, 'preview.js'))();
  { const d0 = cfg.previewDir || cfg.lastDir || ''; if (d0 && fs.existsSync(d0)) pv.setDir(d0); }
  pv.listen(PREVIEW_PORT, e => { if (e) console.log(`[!] Preview port ${PREVIEW_PORT} busy hai (${e.message}). CC_PREVIEW_PORT badlo.`); });
  srv.listen(PORT, '127.0.0.1', () => {
    try { fs.writeFileSync(path.join(DIR, 'dash.pid'), String(process.pid)); } catch { /* ignore */ }
    if (TERMUX && cfg.wake !== false) wake(true);
    console.log(`ccs daemon ready v${VERSION()} port ${PORT} wake=${wakeOn}`);
  });
}

/* ---------- CLI (client) ---------- */
async function ensureDaemon() {
  if (await listening(PORT)) return false;
  const out = fs.openSync(logf('daemon'), 'a');
  const c = cp.spawn(process.execPath, ['--max-old-space-size=256', __filename, 'daemon'], { detached: true, stdio: ['ignore', out, out], windowsHide: true, env: { ...process.env } });
  c.unref(); fs.closeSync(out);
  for (let i = 0; i < 80; i++) { if (await listening(PORT)) return true; await sleep(150); }
  throw new Error('Dashboard start nahi hua. Log dekho: ' + logf('daemon'));
}
async function stopDaemon() {
  let pid = 0; try { pid = +fs.readFileSync(path.join(DIR, 'dash.pid'), 'utf8'); } catch { /* nahi hai */ }
  if (pid && alive(pid)) { try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ } }
  for (let i = 0; i < 40 && (await listening(PORT)); i++) await sleep(150);
  if (pid && alive(pid)) killTree(pid, true);
  reap(); if (TERMUX) cp.spawnSync('termux-wake-unlock', { timeout: 2000, stdio: 'ignore' });
}
const api = (p, b) => fetch(`http://127.0.0.1:${PORT}/api/${p}`, { method: b ? 'POST' : 'GET', headers: { 'x-t': loadCfg().token, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined, signal: AbortSignal.timeout(120000) }).then(r => r.json());

async function main() {
  const cfg = loadCfg(); if (!cfg.token) { cfg.token = crypto.randomBytes(8).toString('hex'); saveCfg(cfg); }
  const fresh = await ensureDaemon();
  const url = dashUrl();
  console.log('\n' + BD(C('  ⚡ ccs v' + VERSION())) + '  ' + (fresh ? G('chalu ho gaya') : G('pehle se chalu hai')) + (TERMUX ? DM('  (background me, wake-lock ON)') : ''));
  console.log('  Dashboard: ' + BD(url));
  if (!process.argv.includes('--no-open')) { openUrl(url); clip(url); console.log(DM('  Browser khul raha hai (na khule to upar ka link copy karke browser me dalo; link copy bhi ho gaya)')); }
  if (TERMUX && !loadCfg().batteryDone) console.log(Y('\n  🔋 Ek baar zaroor: ') + BD('ccs battery') + Y('  (battery restriction hatane ke liye, 1 minute)'));
  if (TTY) await menu(); else console.log();
}

async function menu() {
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(r => rl.question(q, r));
  const line = () => console.log(DM('  ' + '─'.repeat(40)));
  for (;;) {
    const s = await api('state').catch(() => null);
    if (!s || s.error) { console.log(R('  Dashboard se baat nahi ho pa rahi. Likho: ccs restart')); rl.close(); return; }
    line();
    console.log('  Claude: ' + (s.claude.version ? G(s.claude.version) : R('install nahi')) + '   Model: ' + (s.cfg.model ? G(s.cfg.model) : R('nahi chuna')) + '   Key: ' + (s.cfg.key ? G('ok') : R('nahi')));
    console.log(C('   1') + ' Claude chalao        ' + C('2') + ' Dashboard kholo');
    console.log(C('   3') + ' Model chuno          ' + C('4') + ' Key / Provider daalo');
    console.log(C('   5') + ' Sab check (doctor)   ' + C('6') + ' Battery fix');
    console.log(C('   7') + ' APK banao            ' + C('8') + ' Update (naya version)');
    console.log(C('   9') + ' Sab band karo        ' + C('0') + ' Bahar (ccs chalta rahega)');
    const ch = (await ask('  Number likho: ')).trim();
    if (ch === '0' || ch === 'q' || ch === '') { rl.close(); return; }
    if (ch === '1') { rl.close(); return runClaude([]); }
    if (ch === '2') { openUrl(dashUrl()); console.log('  ' + dashUrl()); }
    else if (ch === '3') await menuModel(ask);
    else if (ch === '4') await menuKey(ask, s);
    else if (ch === '5') { console.log('  check ho raha hai…'); (await doctor()).forEach(x => console.log('  ' + (x.ok ? G('[ok] ') : R('[!!] ')) + x.name + ': ' + x.msg + (x.fix ? Y('\n       fix: ' + x.fix) : ''))); }
    else if (ch === '6') await menuBattery(ask);
    else if (ch === '7') {
      const name = (await ask('  App ka naam (English, jaise MeraApp): ')).trim(); if (!name) continue;
      const web = (await ask('  Web folder (Enter = starter page): ')).trim();
      const base = path.join(HOME, 'apk-projects'); fs.mkdirSync(base, { recursive: true });
      const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'apk.js'), 'new', name, '--out', base, ...(web ? ['--web', web] : [])], { stdio: 'inherit' });
      if (r.status === 0 && (await ask('  Abhi cloud build karu? (h/n): ')).trim().toLowerCase().startsWith('h'))
        cp.spawnSync(process.execPath, [path.join(__dirname, 'apk.js'), 'cloud', path.join(base, name)], { stdio: 'inherit' });
    }
    else if (ch === '8') { try { await update(m => console.log('  ' + m)); console.log('  Dobara ccs chalao: ccs restart'); } catch (e) { console.log(R('  ' + e.message)); } }
    else if (ch === '9') { rl.close(); await stopDaemon(); console.log('  sab band.'); return; }
  }
}
async function menuModel(ask) {
  const c = loadCfg(); const f = (await ask(`  Filter (Enter = "${c.filter || 'free'}"): `)).trim() || c.filter || 'free';
  const r = await api('models?filter=' + encodeURIComponent(f) + '&max=20');
  if (r.error) { console.log(R('  ' + r.error)); return; }
  if (!r.models.length) { console.log(Y('  Koi model nahi mila. Filter badlo.')); return; }
  r.models.forEach((m, i) => console.log('  ' + C(String(i + 1).padStart(2)) + ' ' + ((r.working || []).includes(m) ? Y('★ ') : '  ') + m));
  for (;;) {
    const a = (await ask('  Number = lagao, t3 = test, Enter = wapas: ')).trim(); if (!a) return;
    const test = a[0] === 't', m = r.models[(parseInt(test ? a.slice(1) : a, 10) || 0) - 1];
    if (!m) { console.log(Y('  Sahi number likho')); continue; }
    if (test) { console.log('  test ho raha hai…'); const t = await api('test', { model: m }); console.log('  ' + (t.ok ? G('chalta hai ' + (t.ms / 1000).toFixed(1) + 's') : R(String(t.err).slice(0, 80)))); }
    else { const k = await api('config', { model: m }); console.log('  ' + (k.error ? R(k.error) : G('Model lag gaya: ' + m))); return; }
  }
}
async function menuKey(ask, s) {
  const P = Object.entries(s.providers);
  P.forEach(([k, v], i) => console.log('  ' + C(String(i + 1)) + ' ' + v.name + (k === s.cfg.provider ? G('  (abhi)') : '')));
  const n = parseInt((await ask('  Provider number (Enter = wahi): ')).trim(), 10);
  if (n >= 1 && n <= P.length) await api('config', { provider: P[n - 1][0] });
  const s2 = await api('state'), hint = s2.providers[s2.cfg.provider].hint; if (hint) console.log(DM('  ' + hint));
  const url = (await ask(`  Base URL (Enter = ${s2.cfg.base_url || 'wahi'}): `)).trim();
  const key = (await ask('  API key (Enter = wahi): ')).trim();
  const r = await api('config', { ...(url ? { base_url: url } : {}), ...(key ? { api_key: key } : {}) });
  console.log('  ' + (r.error ? R(r.error) : G('Save ho gaya') + (r.applied ? '' : Y('. Ab model chuno (3)'))));
}
async function menuBattery(ask) {
  console.log('\n' + BATTERY_TEXT.split('\n').map(l => '  ' + l).join('\n') + '\n');
  if (!TERMUX) { console.log(Y('  Windows par bas PC ko sleep me mat jane do (Power settings > Sleep: Never).')); return; }
  wake(true); console.log(G('  Wake-lock ON kar diya.'));
  for (const [k, t] of [['optim', 'Battery optimization list'], ['app', 'Termux app info'], ['autostart', 'Autostart (Redmi/Xiaomi)']]) {
    if (!(await ask(`  ${t} kholu? (h/n): `)).trim().toLowerCase().startsWith('h')) continue;
    try { batteryOpen(k); await ask('  Setting karke wapas Termux me aao, phir Enter dabao… '); } catch (e) { console.log(Y('  ' + e.message)); }
  }
  if ((await ask('  Sab kar liya? (h/n): ')).trim().toLowerCase().startsWith('h')) { await api('config', { batteryDone: true }); console.log(G('  Badhiya! Ab ccs background me bina ruke chalega.')); }
}

async function runClaude(args) {
  await ensureDaemon();
  const c = loadCfg(), gp = providers()[c.provider] || {};
  if (gp.cmd && !(await listening(gp.port))) {
    await api('svc', { op: 'start' }).catch(() => {});
    process.stdout.write(`[*] ${gp.name} start ho raha hai`);
    for (let i = 0; i < 120 && !(await listening(gp.port)); i++) { process.stdout.write('.'); await sleep(1000); }
    console.log();
  }
  console.log(DM(`[ccs] model fail ho to dashboard kholo: ${dashUrl()}`));
  process.on('SIGINT', () => {});
  const ch = cp.spawn('claude', args, { stdio: 'inherit', env: claudeEnv(c), shell: WIN });
  ch.on('error', () => { console.log(R('[!] claude nahi mila. Likho: ccs install')); process.exit(1); });
  ch.on('exit', code => process.exit(code || 0));
}

const [cmd, ...rest] = process.argv.slice(2);
const run = p => p.catch(e => { console.log(R('[!] ' + (e.message || e))); process.exit(1); });
if (!cmd || cmd === 'dash' || cmd === '--no-open') run(main());
else if (cmd === 'daemon') run(daemon());
else if (cmd === 'menu') run(ensureDaemon().then(() => (TTY ? menu() : null)));
else if (cmd === 'claude') run(runClaude(rest));
else if (cmd === 'install') { try { cp.execSync('npm i -g ' + CLAUDE_PKG, { stdio: 'inherit' }); console.log(G('[ok] Claude Code install ho gaya')); } catch { process.exit(1); } }
else if (cmd === 'doctor') run(doctor().then(r => { r.forEach(x => console.log((x.ok ? G('[ok] ') : R('[!!] ')) + x.name + ': ' + x.msg + (x.fix ? '\n     fix: ' + x.fix : ''))); process.exit(r.every(x => x.ok) ? 0 : 1); }));
else if (cmd === 'stop') run(stopDaemon().then(() => { console.log('sab band.'); process.exit(0); }));
else if (cmd === 'restart') run(stopDaemon().then(() => main()));
else if (cmd === 'delayed-start') run((async () => { for (let i = 0; i < 60 && (await listening(PORT)); i++) await sleep(250); await ensureDaemon(); process.exit(0); })());
else if (cmd === 'status') run((async () => { const up = await listening(PORT); console.log('dashboard:', up ? G('chalu') : R('band')); if (up) { const s = await api('state'); console.log('version: ' + s.version + ' | model: ' + (s.cfg.model || '-') + ' | wake-lock: ' + (s.wake.on ? 'ON' : 'OFF')); } process.exit(0); })());
else if (cmd === 'update') run(update().then(async () => { if (await listening(PORT)) { console.log('Dobara chalu kar raha hu…'); await stopDaemon(); await ensureDaemon(); } process.exit(0); }));
else if (cmd === 'battery') run((async () => {
  const w = rest[0];
  if (w === 'done') { const c = loadCfg(); c.batteryDone = true; saveCfg(c); console.log(G('Theek hai, yaad rakh liya.')); process.exit(0); }
  if (TERMUX && ['optim', 'app', 'autostart'].includes(w)) { wake(true); try { batteryOpen(w); console.log(G('Settings khul gayi.')); } catch (e) { console.log(Y(e.message)); } process.exit(0); }
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  await menuBattery(q => new Promise(r => rl.question(q, r))); rl.close(); process.exit(0);
})());
else if (cmd === 'apk') cp.spawn(process.execPath, [path.join(__dirname, 'apk.js'), ...rest], { stdio: 'inherit' }).on('exit', c => process.exit(c || 0));
else if (cmd === 'apk-setup') run(apkSetup());
else console.log(`ccs               dashboard + menu chalu (background me)
ccs claude        Claude Code chalao
ccs menu          terminal menu
ccs install       Claude Code install
ccs update        naya version laao
ccs battery       battery restriction hatao (Termux)
ccs apk ...       APK banao (ccs apk help)
ccs doctor        sab check
ccs status | restart | stop`);
