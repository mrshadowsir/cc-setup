'use strict';
/* plugins-hub.js: Plugin Center ka backend.
   - Marketplace se saare plugins laata hai (catalog)
   - Install: ek click, Delete: ek click me PERMANENT (CLI uninstall + files + cache sab)
   - Kaun active hai, kaun OFF hai, custom plugins kaun se hain, ye sab dikhata hai
   - Sab commands claude CLI se chalte hain. Input sirf validated format me aata hai (shell injection nahi). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const CLAUDE = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const PDIR = path.join(CLAUDE, 'plugins');
const SETTINGS = path.join(CLAUDE, 'settings.json');
const KNOWN = path.join(PDIR, 'known_marketplaces.json');
const INSTALLED = path.join(PDIR, 'installed_plugins.json');
const OFFICIAL = 'claude-plugins-official';

const ID_RE = /^[A-Za-z0-9][\w.-]*@[A-Za-z0-9][\w.-]*$/;   // plugin-naam@marketplace
const NAME_RE = /^[A-Za-z0-9][\w.-]*$/;                     // marketplace naam
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;                        // owner/repo

const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wj = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };
const sid = s => String(s).replace(/\W/g, '_');
const vid = id => { const s = String(id || '').trim(); if (!ID_RE.test(s)) throw new Error('Plugin ID galat hai. Format: plugin-naam@marketplace'); return s; };
const vname = n => { const s = String(n || '').trim(); if (!NAME_RE.test(s)) throw new Error('Marketplace naam galat hai'); return s; };

function run(cmd, timeout = 120000) {
  return new Promise(res => cp.exec(cmd, { timeout, windowsHide: true, maxBuffer: 4 << 20 }, (err, out, errOut) => {
    res({ ok: !err, out: String(out || '') + String(errOut || '') });
  }));
}

/* ---------- MCP servers + recommended status (asli state se) ---------- */
const CJ = path.join(os.homedir(), '.claude.json');   // MCP (user scope) yahin likhe jate hain
const fromCmd = (cmd, re) => { const m = String(cmd || '').match(re); return m ? m[1] : ''; };
function mcpServers() {
  const j = rj(CJ, {});
  const m = j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {};
  return Object.entries(m).map(([name, v]) => ({
    name, command: [v && v.command, ...((v && v.args) || [])].filter(Boolean).join(' ') || (v && (v.url || v.type)) || '',
  }));
}
function mcpStatus() {
  return mcpServers().map(s => ({
    id: 'mcp:' + s.name, name: s.name, mkt: 'MCP', version: '', path: s.command, installedAt: '',
    enabled: true, exists: true, custom: false, state: 'active', kind: 'mcp',
  }));
}
// Recommended item (plugins.json ka cmd) asli me installed hai ya nahi. null = pata nahi (cfg fallback)
function isInstalled(pl) {
  const cmd = (pl && pl.cmd) || '';
  const mcp = fromCmd(cmd, /mcp add --scope user (\S+)/);
  if (mcp) return mcpServers().some(s => s.name === mcp);
  const pid = fromCmd(cmd, /plugin install (\S+)/);
  if (pid) return installedRaw().some(x => x.id === pid);
  const mkt = fromCmd(cmd, /marketplace add (\S+)/);
  if (mkt) return mkt.split('/').pop() in rj(KNOWN, {});
  return null;
}
async function removeMcp(name) {
  const r = await run(`claude mcp remove ${name} --scope user`, 60000);
  const j = rj(CJ, null);
  let direct = false;
  if (j && j.mcpServers && name in j.mcpServers) {
    fs.copyFileSync(CJ, CJ + '.bak');              // pehle backup
    delete j.mcpServers[name]; wj(CJ, j); direct = true;
  }
  return { ok: r.ok || direct, cli: r.ok, direct };
}

/* ---------- read state ---------- */
const settings = () => rj(SETTINGS, {});
function saveSettings(s) { wj(SETTINGS, s); }

function marketplaces() {
  const k = rj(KNOWN, {});
  return Object.entries(k).map(([name, v]) => {
    const dir = (v && v.installLocation) || path.join(PDIR, 'marketplaces', name);
    const cat = rj(path.join(dir, '.claude-plugin', 'marketplace.json'), null);
    const src = (v && v.source) || {};
    return {
      name, official: name === OFFICIAL, updated: (v && v.lastUpdated) || '',
      source: src.repo || src.url || src.path || src.source || '',
      plugins: cat && Array.isArray(cat.plugins) ? cat.plugins : [],
    };
  });
}

function installedRaw() {
  const j = rj(INSTALLED, {});
  const pl = j.plugins && typeof j.plugins === 'object' ? j.plugins : j;
  return Object.entries(pl).filter(([id]) => id !== 'version' && id.includes('@')).map(([id, v]) => {
    const e = Array.isArray(v) ? (v[0] || {}) : (v || {});
    return { id, path: e.installPath || '', version: e.version || '', installedAt: e.installedAt || '' };
  });
}

function countFiles(dir, limit = 500) {
  let n = 0;
  const walk = d => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (n >= limit) return;
      if (f.isDirectory()) walk(path.join(d, f.name)); else n++;
    }
  };
  try { walk(dir); } catch { /* ignore */ }
  return n;
}

function pluginStatus() {
  const en = settings().enabledPlugins || {};
  return installedRaw().map(p => {
    const [name, mkt = ''] = p.id.split('@');
    const exists = !!p.path && fs.existsSync(p.path);
    const enabled = en[p.id] !== false;
    const state = !exists ? 'missing' : !enabled ? 'off' : 'active';
    return { id: p.id, name, mkt, version: p.version, path: p.path, installedAt: p.installedAt, enabled, exists, custom: mkt !== OFFICIAL, state };
  });
}

function installedStatus() { return pluginStatus().concat(mcpStatus()); }

function catalog(installedIds) {
  return marketplaces().flatMap(m => m.plugins.map(p => {
    const id = `${p.name}@${m.name}`;
    return { id, name: p.name, mkt: m.name, desc: p.description || '', category: p.category || '', homepage: p.homepage || '', installed: installedIds.has(id) };
  }));
}

function state(ctx) {
  const inst = installedStatus();
  const ids = new Set(inst.map(p => p.id));
  const mk = marketplaces();
  return {
    marketplaces: mk.map(m => ({ name: m.name, official: m.official, source: m.source, updated: m.updated, count: m.plugins.length })),
    catalog: catalog(ids),
    installed: inst,
    running: ctx.running(),
    counts: {
      available: mk.reduce((a, m) => a + m.plugins.length, 0),
      installed: inst.length,
      active: inst.filter(p => p.state === 'active').length,
      off: inst.filter(p => p.state === 'off').length,
      missing: inst.filter(p => p.state === 'missing').length,
      custom: inst.filter(p => p.custom).length,
    },
    claudeDir: CLAUDE,
  };
}

/* ---------- write helpers ---------- */
const inside = p => { const r = path.resolve(p); return r.startsWith(path.resolve(PDIR) + path.sep); };

// Permanent delete: settings, installed list, aur files/cache sab hatao (sirf ~/.claude/plugins ke andar)
function purge(id) {
  const [name, mkt] = id.split('@');
  const removed = [];
  const s = settings();
  if (s.enabledPlugins && id in s.enabledPlugins) { delete s.enabledPlugins[id]; saveSettings(s); removed.push('settings: ' + id); }
  const j = rj(INSTALLED, null);
  if (j) {
    const holder = j.plugins && typeof j.plugins === 'object' ? j.plugins : j;
    if (id in holder) {
      const v = holder[id];
      const e = Array.isArray(v) ? (v[0] || {}) : (v || {});
      if (e.installPath && inside(e.installPath)) { fs.rmSync(e.installPath, { recursive: true, force: true }); removed.push(e.installPath); }
      delete holder[id]; wj(INSTALLED, j); removed.push('installed list');
    }
  }
  const cache = path.join(PDIR, 'cache', mkt || '', name || '');
  if (mkt && name && inside(cache) && fs.existsSync(cache)) { fs.rmSync(cache, { recursive: true, force: true }); removed.push(cache); }
  return removed;
}

async function setEnabled(id, on) {
  const r = await run(`claude plugin ${on ? 'enable' : 'disable'} ${id}`, 60000);
  if (!r.ok) { // CLI na chale to settings me seedha likh do
    const s = settings(); s.enabledPlugins = s.enabledPlugins || {}; s.enabledPlugins[id] = !!on; saveSettings(s);
  }
  return r.ok;
}

function skills() {
  const dir = path.join(CLAUDE, 'skills');
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; }
  return names.map(n => {
    const t = (() => { try { return fs.readFileSync(path.join(dir, n, 'SKILL.md'), 'utf8'); } catch { return ''; } })();
    const desc = (t.match(/^description:\s*(.+)$/m) || [])[1] || '';
    return { name: n, desc: desc.slice(0, 240), ok: !!t };
  });
}

/* ---------- Recommended: health, setup, problem fix ---------- */
const WIN = process.platform === 'win32';
const TERMUX = (process.env.PREFIX || '').includes('com.termux');
const MKT_REPO = { 'claude-plugins-official': 'anthropics/claude-plugins-official', 'thedotmack': 'thedotmack/claude-mem' };
const PLJ = () => rj(path.join(__dirname, 'plugins.json'), []);

function onPath(bin) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = WIN ? ['', '.exe', '.cmd', '.bat'] : [''];
  return dirs.some(d => exts.some(e => { try { fs.accessSync(path.join(d, bin + e)); return true; } catch { return false; } }));
}

// Kaunse tools (binaries) is item ko chahiye
function needs(pl) {
  const cmd = pl.cmd || '';
  const out = [];
  if (/^claude\b|\bclaude plugin\b|\bclaude mcp\b/.test(cmd)) out.push('claude');
  if (/\bnpx\b/.test(cmd)) out.push('npx');
  if (/\buvx\b/.test(cmd)) out.push('uvx');
  if (/^python\b/.test(cmd)) out.push('python');
  if (pl.id === 'claude-mem') out.push('bun');
  if (pl.id === 'apk-builder') out.push('gh');
  if (pl.id === 'pc-playwright') out.push('npx');
  return [...new Set(out)];
}

// Tool na mile to install ka command (Termux / Windows / Linux ke hisaab se)
function toolCmd(bin, ctx) {
  if (bin === 'uvx' || bin === 'uv') return 'python -m pip install -U uv';
  if (bin === 'bun') return 'npm install -g bun';
  if (bin === 'claude') return 'npm install -g ' + (ctx.claudePkg || '@anthropic-ai/claude-code');
  if (bin === 'gh') return TERMUX ? 'pkg install -y gh' : WIN ? 'winget install GitHub.cli' : null;
  if (bin === 'npx') return TERMUX ? 'pkg install -y nodejs-lts' : null;
  if (bin === 'python') return TERMUX ? 'pkg install -y python' : null;
  return null;
}

async function healthOf(pl, ctx) {
  const id = pl.id, name = pl.name || id, desc = pl.desc || '';
  if (!pl.cmd) return { id, name, desc, status: 'manual', installed: false, checks: [{ name: 'Setup', ok: false, msg: 'Auto install nahi. Custom tab se manual chalao' }] };
  const checks = [];
  const add = (n, ok, okMsg, badMsg) => checks.push({ name: n, ok: !!ok, msg: ok ? okMsg : badMsg });
  for (const b of needs(pl)) add('Tool: ' + b, onPath(b), 'mil gaya', 'nahi mila (Fix se install hoga)');
  const mcp = fromCmd(pl.cmd, /mcp add --scope user (\S+)/);
  const pid = fromCmd(pl.cmd, /plugin install (\S+)/);
  const mkt = fromCmd(pl.cmd, /marketplace add (\S+)/);
  let installed = false;
  if (mcp) {
    installed = mcpServers().some(x => x.name === mcp);
    add('MCP config', installed, 'config me hai', 'config me nahi');
  } else if (pid) {
    const mName = pid.split('@')[1];
    const known = mName in rj(KNOWN, {});
    add('Marketplace ' + mName, known, 'jud gaya', 'nahi juda');
    const inst = installedRaw().find(x => x.id === pid);
    installed = !!inst;
    add('Plugin installed', installed, 'installed hai', 'installed nahi');
    if (inst) {
      const enabled = (settings().enabledPlugins || {})[pid] !== false;
      add('Enabled', enabled, 'ON hai', 'OFF hai (Fix se ON hoga)');
      const files = !!inst.path && fs.existsSync(inst.path) && countFiles(inst.path, 1) > 0;
      add('Files', files, 'files maujood', 'files gayab (Fix se reinstall hoga)');
    }
  } else if (mkt) {
    installed = mkt.split('/').pop() in rj(KNOWN, {});
    add('Marketplace', installed, 'jud gaya', 'nahi juda');
  } else if (id === 'headroom') {
    const r = await run('python -m pip show headroom-ai', 20000);
    installed = r.ok && /Name:/.test(r.out);
    add('Python package', installed, 'installed hai', 'installed nahi');
  } else {
    installed = !!ctx.cfgInstalled(id);
    add('Install', installed, 'installed hai', 'installed nahi');
  }
  if (id === 'pc-playwright') {
    const d = path.join(os.homedir(), WIN ? 'AppData/Local/ms-playwright' : '.cache/ms-playwright');
    add('Browser (chromium)', fs.existsSync(d), 'browser mila', 'browser nahi (Fix se install hoga)');
  }
  const ok = checks.every(c => c.ok);
  return { id, name, desc, status: ok ? 'ok' : 'bad', installed, checks };
}

// Kaun se steps chahiye: sel(name) se filter, aur sirf wahi jo asal me fail hain
function planSteps(pl, h, ctx, sel) {
  const steps = [];
  const fail = n => h.checks.some(c => c.name === n && !c.ok);
  const want = n => sel(n) && fail(n);
  for (const b of needs(pl)) {
    if (want('Tool: ' + b)) { const t = toolCmd(b, ctx); if (t) steps.push(t); }
  }
  const mcp = fromCmd(pl.cmd, /mcp add --scope user (\S+)/);
  const pid = fromCmd(pl.cmd, /plugin install (\S+)/);
  const mkt = fromCmd(pl.cmd, /marketplace add (\S+)/);
  if (mcp) {
    if (want('MCP config')) steps.push(pl.cmd);
  } else if (pid) {
    const mName = pid.split('@')[1];
    if (want('Marketplace ' + mName) && MKT_REPO[mName]) steps.push(`claude plugin marketplace add ${MKT_REPO[mName]}`);
    if (want('Plugin installed')) steps.push(`claude plugin install ${pid}`);
    if (want('Enabled')) steps.push(`claude plugin enable ${pid}`);
    if (want('Files')) steps.push(`claude plugin uninstall ${pid}`, `claude plugin install ${pid}`);
  } else if (mkt) {
    if (want('Marketplace')) steps.push(pl.cmd);
  } else if (pl.cmd) {
    const own = h.checks.find(c => !c.ok && ['Python package', 'Install'].includes(c.name));
    if (own && sel(own.name)) steps.push(pl.cmd.replace(/\{DIR\}/g, __dirname));
  }
  if (pl.id === 'pc-playwright' && want('Browser (chromium)')) steps.push('npx -y playwright install chromium');
  return steps;
}

// Fix option ka selector
function selFor(key) {
  if (!key || key === 'all' || key === 'reinstall') return () => true;
  if (key === 'tools') return n => n.startsWith('Tool: ');
  if (key.startsWith('check:')) { const nm = key.slice(6); return n => n === nm; }
  return () => false;
}

// Reinstall se pehle purana saaf karo (MCP config / plugin files + settings)
async function cleanupForReinstall(pl) {
  const mcp = fromCmd(pl.cmd, /mcp add --scope user (\S+)/);
  const pid = fromCmd(pl.cmd, /plugin install (\S+)/);
  if (mcp) await removeMcp(vname(mcp));
  if (pid) { vid(pid); await run(`claude plugin uninstall ${pid}`, 120000); purge(pid); }
}

async function runSteps(pl, key, ctx) {
  if (ctx.running().includes(sid(pl.id))) throw new Error('Ye pehle se chal raha hai. Logs dekho');
  let steps;
  if (key === 'reinstall') {
    await cleanupForReinstall(pl);
    const h = await healthOf(pl, ctx);
    steps = planSteps(pl, h, ctx, selFor('reinstall'));
  } else {
    const h = await healthOf(pl, ctx);
    steps = planSteps(pl, h, ctx, selFor(key));
  }
  if (!steps.length) return { ok: true, msg: 'Is option me kuch karne ko nahi (sab theek hai)' };
  ctx.start('job-mp-' + sid(pl.id), steps.join(' && '), {
    cwd: os.homedir(), onExit: code => { if (code === 0) { ensureMcpFile(pl); ctx.mark(pl.id); } },
  });
  return { ok: true, msg: `${key === 'all' ? 'Fix' : 'Fix option'} shuru (${steps.length} step). Logs me job-mp dekho`, steps: steps.length };
}

// Ek item ke saare fix options (sirf wahi jo problem ke hisaab se relevant hain)
async function optionsFor(pl, ctx) {
  const h = await healthOf(pl, ctx);
  if (h.status === 'manual') return { status: h.status, checks: h.checks, options: [] };
  const opts = [];
  const prev = key => planSteps(pl, h, ctx, selFor(key)).join(' && ');
  const bad = h.checks.filter(c => !c.ok);
  if (bad.length) {
    opts.push({ key: 'all', label: '🔧 Sab problem ek saath fix karo', preview: prev('all') });
    if (bad.some(c => c.name.startsWith('Tool: '))) opts.push({ key: 'tools', label: '🧰 Sirf tools install karo', preview: prev('tools') });
    for (const c of bad) opts.push({ key: 'check:' + c.name, label: '🎯 Sirf: ' + c.name, preview: prev('check:' + c.name) });
  }
  opts.push({ key: 'reinstall', label: '♻️ Poora reinstall (purana hata kar fresh)', preview: 'Purana hatega, phir naya setup' });
  opts.push({ key: 'copy', label: '📋 Manual command copy karo', cmd: planSteps(pl, h, ctx, selFor('reinstall')).join(' && ') || pl.cmd });
  opts.push({ key: 'logs', label: '📜 Logs dekho' });
  return { status: h.status, checks: h.checks, options: opts };
}


/* ---------- self-heal + diagnostics ---------- */
const HEAL = new Map();   // id -> { n, t }  (auto-fix retry limit)

// MCP entry config me nahi hai to seedha ~/.claude.json me likho (cmd se)
function ensureMcpFile(pl) {
  const mcp = fromCmd(pl.cmd, /mcp add --scope user (\S+)/);
  if (!mcp) return false;
  const j = rj(CJ, {});
  j.mcpServers = j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {};
  if (j.mcpServers[mcp]) return true;
  const after = String(pl.cmd).split(' -- ')[1];
  if (!after) return false;
  const [command, ...args] = after.trim().split(/\s+/);
  if (fs.existsSync(CJ)) fs.copyFileSync(CJ, CJ + '.bak');
  j.mcpServers[mcp] = { type: 'stdio', command, args, env: {} };
  wj(CJ, j);
  return true;
}

// Wanted items (dashboard se install hue) ko check karo; problem ho to fix. Ek tick me ek item.
async function autoHeal(ctx) {
  if (ctx.running().length) return { ok: true, msg: 'Pehle se job chal raha hai' };
  const wanted = new Set(ctx.wanted());
  for (const pl of PLJ()) {
    if (!pl.cmd || !wanted.has(pl.id)) continue;
    if (fromCmd(pl.cmd, /mcp add --scope user (\S+)/)) ensureMcpFile(pl);
    const h = await healthOf(pl, ctx);
    if (h.status === 'ok') continue;
    const a = HEAL.get(pl.id) || { n: 0, t: 0 };
    if (Date.now() - a.t > 3600000) a.n = 0;
    if (a.n >= 3) { ctx.log('job-mp-autoheal', `[skip] ${pl.name}: 1 ghante me 3 baar fix ho chuka, ab manual Fix options dekho`); continue; }
    a.n++; a.t = Date.now(); HEAL.set(pl.id, a);
    ctx.log('job-mp-autoheal', `[autoheal] ${pl.name}: problem mila, fix ${a.n}/3`);
    try { await runSteps(pl, 'all', ctx); } catch (e) { ctx.log('job-mp-autoheal', '[!] ' + (e.message || e)); }
    return { ok: true, msg: 'Auto-heal: ' + pl.name };
  }
  return { ok: true, msg: 'Sab wanted items theek hain' };
}

// Asli state: file, Claude CLI ka output, paths, sab ek jagah
async function diag(ctx) {
  const j = rj(CJ, null);
  const cli = await run('claude mcp list', 30000);
  const cliP = await run('claude plugin list', 30000);
  return {
    home: os.homedir(),
    configDir: CLAUDE,
    claudeJson: { path: CJ, exists: !!j, mcpServers: j && j.mcpServers ? Object.keys(j.mcpServers) : [] },
    pluginsDir: fs.existsSync(PDIR) ? fs.readdirSync(PDIR) : [],
    knownMarketplaces: Object.keys(rj(KNOWN, {})),
    installedPlugins: installedRaw().map(p => p.id),
    wanted: ctx.wanted(),
    running: ctx.running(),
    cliMcpList: cli.out.trim().slice(0, 1500),
    cliPluginList: cliP.out.trim().slice(0, 1500),
  };
}

/* ---------- routes (p = path after 'mp/') ---------- */
async function route(p, b, ctx) {
  b = b || {};
  switch (p) {
    case 'state': return state(ctx);

    case 'install': {
      const id = vid(b.id);
      if (ctx.running().includes(sid(id))) throw new Error('Ye plugin pehle se install ho raha hai');
      ctx.start('job-mp-' + sid(id), `claude plugin install ${id}`, { cwd: os.homedir() });
      return { ok: true };
    }

    case 'uninstall': {
      if (String(b.id || '').startsWith('mcp:')) {
        const nm = vname(String(b.id).slice(4));
        const r = await removeMcp(nm);
        return { ok: r.ok, msg: r.ok ? `MCP "${nm}" permanently hata diya` : 'MCP hata nahi paya. Logs dekho' };
      }
      const id = vid(b.id);
      const r = await run(`claude plugin uninstall ${id}`, 120000);
      const removed = purge(id);
      const gone = !installedRaw().some(x => x.id === id);
      return { ok: gone, msg: gone ? `"${id}" permanently delete ho gaya (${removed.length} cheezein saaf)` : 'Delete adhoora raha. Logs dekho', cli: r.out.slice(-300) };
    }

    case 'toggle': {
      const id = vid(b.id);
      const ok = await setEnabled(id, !!b.on);
      return { ok: true, cli: ok };
    }

    case 'bulk': {
      const s = settings(); s.enabledPlugins = s.enabledPlugins || {};
      const list = installedRaw();
      for (const p of list) s.enabledPlugins[p.id] = !!b.on;
      saveSettings(s);
      if (!list.length) return { ok: true, count: 0, msg: 'Koi plugin nahi hai. MCP servers ka ON/OFF nahi hota (unhe Delete kar sakte ho)' };
      return { ok: true, count: list.length, msg: (b.on ? 'Sab ON' : 'Sab OFF') + ' kiye (' + list.length + ' plugins)' };
    }

    case 'health': {
      const rows = installedStatus().filter(p => p.kind !== 'mcp').map(p => ({
        id: p.id, state: p.state,
        files: p.exists ? countFiles(p.path) : 0,
        ok: p.exists && countFiles(p.path, 1) > 0,
        msg: !p.exists ? 'Files gayab. Reinstall ya Delete karo' : !p.enabled ? 'Files theek, par OFF hai' : 'Theek chal raha hai',
      }));
      return { rows };
    }

    case 'mkt/add': {
      const repo = String(b.repo || '').trim();
      if (!REPO_RE.test(repo)) throw new Error('Repo owner/repo format me likho, jaise anthropics/claude-plugins-official');
      ctx.start('job-mp-mkt', `claude plugin marketplace add ${repo}`, {});
      return { ok: true };
    }

    case 'mkt/update': {
      ctx.start('job-mp-mkt', 'claude plugin marketplace update', {});
      return { ok: true };
    }

    case 'mkt/remove': {
      const name = vname(b.name);
      if (name === OFFICIAL) throw new Error('Official marketplace hatana allowed nahi');
      const r = await run(`claude plugin marketplace remove ${name}`, 60000);
      return { ok: r.ok, msg: r.ok ? 'Marketplace hata diya' : 'Hata nahi paya: ' + r.out.slice(-200) };
    }

    case 'skills': return { skills: skills() };

    case 'export': {
      return {
        app: 'cc-setup plugin backup', version: 1, date: new Date().toISOString(),
        marketplaces: marketplaces().filter(m => !m.official).map(m => ({ name: m.name, source: m.source })),
        plugins: installedRaw().map(p => p.id),
      };
    }

    case 'restore': {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(x => String(x)).filter(x => ID_RE.test(x));
      if (!ids.length) throw new Error('Backup file me koi valid plugin ID nahi mili');
      const markets = (Array.isArray(b.markets) ? b.markets : []).filter(m => m && REPO_RE.test(String(m.source || '')) && NAME_RE.test(String(m.name || '')));
      ctx.log('job-mp-restore', `[restore] ${markets.length} marketplace + ${ids.length} plugins ka install shuru`);
      (async () => {
        for (const m of markets) {
          const r = await run(`claude plugin marketplace add ${m.source}`, 180000);
          ctx.log('job-mp-restore', (r.ok ? '[ok] marketplace ' : '[!] marketplace fail ') + m.name);
        }
        for (const id of ids) {
          const r = await run(`claude plugin install ${id}`, 180000);
          ctx.log('job-mp-restore', (r.ok ? '[ok] ' : '[!] fail ') + id);
        }
        ctx.log('job-mp-restore', '[done] restore khatam');
      })();
      return { ok: true, count: ids.length, markets: markets.length };
    }

    case 'rec/uninstall': {
      const list = rj(path.join(__dirname, 'plugins.json'), []);
      const pl = list.find(x => x.id === b.id);
      if (!pl) throw new Error('Ye item plugins.json me nahi hai');
      const mcp = fromCmd(pl.cmd, /mcp add --scope user (\S+)/);
      const pid = fromCmd(pl.cmd, /plugin install (\S+)/);
      let msg;
      if (mcp) {
        const r = await removeMcp(vname(mcp));
        if (!r.ok) throw new Error('MCP hata nahi paya. Logs dekho');
        msg = `${mcp} MCP hata diya`;
      } else if (pid) {
        vid(pid);
        await run(`claude plugin uninstall ${pid}`, 120000);
        const rem = purge(pid);
        msg = `${pid} permanently delete ho gaya (${rem.length} cheezein)`;
      } else {
        msg = 'Ye item automatic delete nahi hota. Status reset kar diya';
      }
      return { ok: true, msg, clearCfg: b.id };
    }

    case 'rec/health': {
      const rows = [];
      for (const pl of PLJ()) rows.push(await healthOf(pl, ctx));
      return { rows, running: ctx.running() };
    }
    case 'rec/options': {
      const pl = PLJ().find(x => x.id === b.id);
      if (!pl) throw new Error('Ye item plugins.json me nahi hai');
      return optionsFor(pl, ctx);
    }
    case 'rec/setup':
    case 'rec/fix': {
      const pl = PLJ().find(x => x.id === b.id);
      if (!pl) throw new Error('Ye item plugins.json me nahi hai');
      return runSteps(pl, b.key || 'all', ctx);
    }

    case 'diag': return diag(ctx);
    case 'heal': return autoHeal(ctx);
    default: return undefined; // cc.js ko pata chale ki route nahi mila
  }
}

module.exports = { route, isInstalled, autoHeal };
