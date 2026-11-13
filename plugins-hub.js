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

function installedStatus() {
  const en = settings().enabledPlugins || {};
  return installedRaw().map(p => {
    const [name, mkt = ''] = p.id.split('@');
    const exists = !!p.path && fs.existsSync(p.path);
    const enabled = en[p.id] !== false;
    const state = !exists ? 'missing' : !enabled ? 'off' : 'active';
    return { id: p.id, name, mkt, version: p.version, path: p.path, installedAt: p.installedAt, enabled, exists, custom: mkt !== OFFICIAL, state };
  });
}

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
      return { ok: true, count: list.length, msg: (b.on ? 'Sab ON' : 'Sab OFF') + ' kiye (' + list.length + ')' };
    }

    case 'health': {
      const rows = installedStatus().map(p => ({
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

    default: return undefined; // cc.js ko pata chale ki route nahi mila
  }
}

module.exports = { route };
