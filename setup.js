#!/usr/bin/env node
'use strict';
/**
 * cc-setup - Claude Code + free API gateway installer
 * Termux aur Windows (bina Linux/WSL) dono par chalta hai. Zero dependencies.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const readline = require('readline');

const IS_WIN = process.platform === 'win32';
const IS_TERMUX = (process.env.PREFIX || '').includes('com.termux');
const HOME = os.homedir();
const STATE_DIR = path.join(HOME, '.cc-setup');
const STATE_FILE = path.join(STATE_DIR, 'config.json');
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
const CLAUDE_JSON = path.join(HOME, '.claude.json');
fs.mkdirSync(STATE_DIR, { recursive: true });

const C = {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
};

// ---------- helpers ----------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));
async function yn(q, def = true) {
  const a = (await ask(`${q} [${def ? 'Y/n' : 'y/N'}]: `)).toLowerCase();
  if (!a) return def;
  return ['y', 'yes', 'h', 'haan', 'ha'].includes(a);
}
async function pick(title, items, label) {
  console.log('\n' + C.b(title));
  items.forEach((it, i) => console.log(`  ${i + 1}) ${label(it)}`));
  for (;;) {
    const n = parseInt(await ask('Number chuno: '), 10);
    if (n >= 1 && n <= items.length) return items[n - 1];
  }
}
function readJson(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function plat(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (IS_TERMUX && v.termux !== undefined) return v.termux;
  if (IS_WIN && v.win !== undefined) return v.win;
  return v.default || '';
}
function sh(cmd, silent = false) {
  console.log(C.d('$ ' + cmd));
  return cp.spawnSync(cmd, { shell: true, stdio: silent ? 'ignore' : 'inherit' }).status === 0;
}
function has(cmd) {
  return cp.spawnSync(IS_WIN ? `where ${cmd}` : `command -v ${cmd}`, { shell: true, stdio: 'ignore' }).status === 0;
}
const state = () => readJson(STATE_FILE, {});
const saveState = (patch) => writeJson(STATE_FILE, { ...state(), ...patch });
const normBase = (u) => (u || '').trim().replace(/\/+$/, '').replace(/\/v1$/, '');

async function http(url, opt = {}, ms = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal }); } finally { clearTimeout(t); }
}
const headers = (key) => ({
  'x-api-key': key,
  authorization: 'Bearer ' + key,
  'anthropic-version': '2023-06-01',
  'content-type': 'application/json',
});

// ---------- Claude Code settings ----------
function applyClaudeEnv({ base_url, api_key, model, small_model }) {
  const s = readJson(SETTINGS, {});
  if (fs.existsSync(SETTINGS) && !fs.existsSync(SETTINGS + '.bak')) fs.copyFileSync(SETTINGS, SETTINGS + '.bak');
  s.env = s.env || {};
  if (base_url) s.env.ANTHROPIC_BASE_URL = normBase(base_url);
  if (api_key) { s.env.ANTHROPIC_AUTH_TOKEN = api_key; delete s.env.ANTHROPIC_API_KEY; }
  if (model) {
    s.env.ANTHROPIC_MODEL = model;
    s.env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
    s.env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
    const small = small_model || model;
    s.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = small;
    s.env.ANTHROPIC_SMALL_FAST_MODEL = small;
  }
  writeJson(SETTINGS, s);
  // login/onboarding skip karne ke liye (third-party gateway ke saath)
  const cj = readJson(CLAUDE_JSON, {});
  if (!cj.hasCompletedOnboarding) { cj.hasCompletedOnboarding = true; writeJson(CLAUDE_JSON, cj); }
  console.log(C.g('✔ Claude settings update: ') + SETTINGS);
}

// ---------- Step 1: gateway ----------
async function portUp(base) {
  try { await http(base, {}, 3000); return true; } catch { return false; }
}
async function startGateway(g) {
  const cmd = plat(g.start);
  if (!cmd) return;
  if (await portUp(g.base_url)) { console.log(C.g('✔ Gateway pehle se chal raha hai')); return; }
  const log = path.join(STATE_DIR, 'gateway.log');
  const out = fs.openSync(log, 'a');
  console.log(C.d('$ ' + cmd + '   (background, log: ' + log + ')'));
  const child = cp.spawn(cmd, { shell: true, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  process.stdout.write('Gateway start hone ka wait (max 120s) ');
  for (let i = 0; i < 60; i++) {
    if (await portUp(g.base_url)) { console.log(C.g('\n✔ Gateway up: ' + g.base_url)); return; }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(C.r('\n✖ Gateway up nahi hua. Log dekho: ' + log));
}
async function stepGateway() {
  const list = readJson(path.join(__dirname, 'providers.json'), { gateways: [] }).gateways;
  const g = await pick('Provider / Gateway chuno', list, (x) => x.name);
  const patch = { gateway: g.id };
  if (g.base_url) patch.base_url = g.base_url;
  if (g.default_key && !state().api_key) patch.api_key = g.default_key;
  saveState(patch);
  const ins = plat(g.install);
  if (ins) console.log(sh(ins) ? C.g('✔ Install ho gaya') : C.r('✖ Install fail - upar ka error dekho'));
  if (plat(g.start) && (await yn('Gateway abhi background me start karu?'))) await startGateway(g);
  if (g.after) console.log(C.y('ℹ ' + g.after));
  return g;
}

// ---------- Step 2: Claude Code ----------
async function stepClaude() {
  if (has('claude')) {
    console.log(C.g('✔ Claude Code pehle se installed hai'));
    sh('claude --version');
    return true;
  }
  if (!sh('npm install -g @anthropic-ai/claude-code')) {
    console.log(C.r('✖ Install fail hua.'));
    if (IS_TERMUX) console.log(C.y('Termux par naye version me native binary issue ho sakta hai. Purana version try kar sakte ho.'));
    const v = await ask('Specific version daalo (jaise 1.0.128) ya Enter = skip: ');
    if (v && sh(`npm install -g @anthropic-ai/claude-code@${v}`)) return true;
    return false;
  }
  console.log(C.g('✔ Claude Code installed'));
  return true;
}

// ---------- Step 3: API setup ----------
async function stepApi() {
  const st = state();
  const mode = await pick('API kaise set karni hai?', [
    { id: 'manual', n: 'Manual - URL + API key khud daalo' },
    { id: 'json', n: 'Local JSON file se load karo' },
    { id: 'gw', n: 'Selected gateway ka default URL use karo (sirf key daalo)' },
  ], (x) => x.n);

  let base = st.base_url || '';
  let key = st.api_key || '';
  let model = st.model || '';

  if (mode.id === 'json') {
    const p = await ask('JSON file ka path: ');
    let j = readJson(p.replace(/^~/, HOME), null);
    if (!j) { console.log(C.r('✖ File padh nahi paya / JSON galat hai')); return; }
    if (j.env) j = j.env;
    base = j.base_url || j.ANTHROPIC_BASE_URL || base;
    key = j.api_key || j.ANTHROPIC_AUTH_TOKEN || j.ANTHROPIC_API_KEY || key;
    model = j.model || j.ANTHROPIC_MODEL || model;
  } else {
    if (mode.id === 'manual' || !base) base = (await ask(`Base URL [${base || 'https://...'}]: `)) || base;
    key = (await ask(`API key [${key ? 'Enter = purani rakho' : 'khali = dummy'}]: `)) || key || 'dummy';
    model = (await ask(`Model naam [${model || 'baad me test karke chunenge'}]: `)) || model;
  }
  if (!base) { console.log(C.r('✖ Base URL chahiye')); return; }
  saveState({ base_url: normBase(base), api_key: key, model });
  applyClaudeEnv({ base_url: base, api_key: key, model });
}

// ---------- Step 4: plugins ----------
function findSkills(dir, depth) {
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) return [dir];
  if (depth === 0) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') out.push(...findSkills(path.join(dir, e.name), depth - 1));
  }
  return out;
}
function gitInstall(p) {
  if (!has('git')) { console.log(C.r('✖ git nahi mila')); return false; }
  const dest = path.join(STATE_DIR, 'repos', p.id);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const ok = fs.existsSync(dest) ? sh(`git -C "${dest}" pull --ff-only`) : sh(`git clone --depth 1 ${p.repo} "${dest}"`);
  if (!ok) return false;
  const mj = path.join(dest, '.claude-plugin', 'marketplace.json');
  if (fs.existsSync(mj)) {
    const m = readJson(mj, {});
    if (!sh(`claude plugin marketplace add "${dest}"`)) return false;
    let all = true;
    for (const pl of m.plugins || []) all = sh(`claude plugin install ${pl.name}@${m.name}`) && all;
    return all;
  }
  const skills = findSkills(dest, 3);
  if (!skills.length) { console.log(C.y('Skill structure nahi mila. README dekho: ' + dest)); return false; }
  const target = path.join(HOME, '.claude', 'skills');
  fs.mkdirSync(target, { recursive: true });
  for (const s of skills) {
    fs.cpSync(s, path.join(target, path.basename(s)), { recursive: true, force: true });
    console.log(C.g('  + skill: ') + path.basename(s));
  }
  return true;
}
async function stepPlugins() {
  if (!has('claude')) console.log(C.y('⚠ claude command nahi mili - pehle Step 2 chalao. Phir bhi try karta hu.'));
  const list = readJson(path.join(__dirname, 'plugins.json'), { plugins: [] }).plugins;
  for (const p of list) {
    console.log('\n' + C.b(p.name) + '\n  ' + p.desc);
    if (!(await yn('Install karu?', false))) continue;
    let ok = false;
    if (p.repo) ok = gitInstall(p);
    else for (const alt of p.try || []) { if (alt.every((cmd) => sh(cmd))) { ok = true; break; } }
    console.log(ok ? C.g('✔ ' + p.id + ' done') : C.r('✖ ' + p.id + ' fail (manual: README dekho)'));
    if (ok && p.note) console.log(C.y('ℹ ' + p.note));
  }
}

// ---------- Step 5: model tester ----------
async function listModels(base, key) {
  for (const u of [`${base}/v1/models`, `${base}/models`]) {
    try {
      const r = await http(u, { headers: headers(key) }, 20000);
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
      method: 'POST', headers: headers(key),
      body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Say hi' }] }),
    }, 45000);
    const ms = Date.now() - t;
    if (!r.ok) {
      const body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 70);
      return { model, ok: false, ms, err: `HTTP ${r.status} ${body}` };
    }
    const j = await r.json().catch(() => ({}));
    const ok = Array.isArray(j.content) && j.content.length > 0;
    return { model, ok, ms, err: ok ? '' : 'empty reply' };
  } catch (e) {
    return { model, ok: false, ms: Date.now() - t, err: e.name === 'AbortError' ? 'timeout' : String(e.message || e).slice(0, 70) };
  }
}
async function stepModels() {
  let st = state();
  if (!st.base_url) { console.log(C.y('Pehle API set karte hain.')); await stepApi(); st = state(); if (!st.base_url) return; }
  const base = normBase(st.base_url), key = st.api_key || 'dummy';
  console.log(C.d('Models list la raha hu: ' + base));
  let models = await listModels(base, key);
  if (!models.length) console.log(C.y('Auto list nahi mili.'));
  else console.log(`${models.length} models mile.`);
  const extra = await ask('Extra model naam (comma se alag) ya Enter: ');
  if (extra) models = [...new Set([...extra.split(',').map((s) => s.trim()).filter(Boolean), ...models])];
  const filt = (await ask('Filter (jaise "free" ya "claude") ya Enter = sab: ')).toLowerCase();
  if (filt) models = models.filter((m) => m.toLowerCase().includes(filt));
  const lim = parseInt(await ask('Max kitne test karu? [30]: '), 10) || 30;
  models = models.slice(0, lim);
  if (!models.length) { console.log(C.r('Test karne ko koi model nahi.')); return; }

  console.log(`\n${models.length} models test ho rahe hain...\n`);
  const results = [];
  let idx = 0;
  const worker = async () => {
    while (idx < models.length) {
      const m = models[idx++];
      const r = await testModel(base, key, m);
      results.push(r);
      console.log(r.ok ? `${C.g('✔')} ${m} ${C.d(r.ms + 'ms')}` : `${C.r('✖')} ${m} ${C.d(r.err)}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  const good = results.filter((r) => r.ok).sort((a, b) => a.ms - b.ms);
  if (!good.length) { console.log(C.r('\nKoi model kaam nahi kar raha. Key/URL/gateway check karo.')); return; }
  console.log(C.g(`\n${good.length} model working.`));
  const main = await pick('MAIN model chuno (tez -> slow)', good, (r) => `${r.model}  ${C.d(r.ms + 'ms')}`);
  let small = main;
  if (good.length > 1 && (await yn('Haiku/small-fast model alag chunna hai?', false))) {
    small = await pick('SMALL model chuno', good, (r) => `${r.model}  ${C.d(r.ms + 'ms')}`);
  }
  saveState({ model: main.model, small_model: small.model });
  applyClaudeEnv({ base_url: base, api_key: key, model: main.model, small_model: small.model });
  console.log(C.g(`✔ Set: ${main.model}${small !== main ? ' (small: ' + small.model + ')' : ''}`));
}

// ---------- main ----------
async function launch() {
  console.log(C.b('\nClaude Code start ho raha hai...'));
  cp.spawnSync('claude', { shell: true, stdio: 'inherit' });
}
async function runAll() {
  const g = await stepGateway();
  await stepClaude();
  if (g && g.id !== 'ccr') await stepApi();
  else if (g) {
    saveState({ base_url: g.base_url, api_key: g.default_key });
    applyClaudeEnv({ base_url: g.base_url, api_key: g.default_key });
  }
  await stepPlugins();
  if (await yn('\nModels test karke working wala set karu?')) await stepModels();
  if (await yn('Ab Claude Code chalau?', false)) await launch();
}

const STEPS = {
  all: runAll, gateway: stepGateway, claude: stepClaude, api: stepApi,
  plugins: stepPlugins, models: stepModels, launch,
};

(async () => {
  console.log(C.b('\n=== cc-setup: Claude Code + Free API Gateway ===') + C.d(`  [${IS_TERMUX ? 'Termux' : IS_WIN ? 'Windows' : process.platform}]`));
  if (parseInt(process.versions.node, 10) < 18) { console.log(C.r('Node 18+ chahiye.')); process.exit(1); }
  const arg = process.argv[2];
  if (arg && STEPS[arg]) { await STEPS[arg](); rl.close(); return; }
  for (;;) {
    const m = await pick('Kya karna hai?', [
      ['all', 'Sab kuch (full setup)'],
      ['gateway', '1. Gateway/Provider install + start'],
      ['claude', '2. Claude Code install'],
      ['api', '3. API / JSON config set karo'],
      ['plugins', '4. Plugins (ek-ek poochhega)'],
      ['models', '5. Models test karo + working set karo'],
      ['launch', '6. Claude Code chalao'],
      ['exit', 'Exit'],
    ], (x) => x[1]);
    if (m[0] === 'exit') break;
    await STEPS[m[0]]();
  }
  rl.close();
})().catch((e) => { console.error(e); process.exit(1); });
