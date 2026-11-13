'use strict';
/* Live preview server (zero-dependency).
   - Project folder ko 127.0.0.1:PORT par serve karta hai
   - File badalte hi browser/iframe apne aap reload (CSS ho to bina reload ke style badal jata hai)
   - Page ke console.log / errors dashboard tak bhejta hai */
const http = require('http'), fs = require('fs'), path = require('path');

const MIME = { '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.md': 'text/plain', '.xml': 'text/xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.pdf': 'application/pdf', '.wasm': 'application/wasm', '.map': 'application/json', '.webmanifest': 'application/manifest+json' };
const TEXTY = /^(text\/|application\/json|image\/svg|application\/manifest|text\/xml)/;
const IGN = new Set(['node_modules', '.git', '.gradle', 'apk-out', '.next', '.cache', '__pycache__', '.venv', 'venv', '.idea', '.vscode']);
const SKIP_FILE = /(\.log|\.swp|\.swx|\.tmp|~)$/i;
const MAX_FILES = 6000;

/* Ye script har HTML page me jodi jati hai: live reload + console capture */
const CLIENT = String.raw`<script data-ccs-preview>(function(){try{
var P=function(t,a){try{parent.postMessage({ccs:1,t:t,a:a},'*')}catch(e){}};
['log','info','warn','error'].forEach(function(k){var o=console[k];console[k]=function(){var a=[].slice.call(arguments).map(function(x){try{return typeof x==='string'?x:(x instanceof Error?(x.stack||x.message):JSON.stringify(x))}catch(e){return String(x)}}).join(' ');P('c',[k,a.slice(0,600)]);return o.apply(console,arguments)}});
addEventListener('error',function(e){P('c',['error',(e.message||'error')+(e.filename?' ('+String(e.filename).split('/').pop()+':'+e.lineno+')':'')])});
addEventListener('unhandledrejection',function(e){P('c',['error','Promise: '+((e.reason&&e.reason.message)||e.reason)])});
addEventListener('message',function(e){if(e.data&&e.data.ccs==='reload')location.reload()});
var css=function(){[].forEach.call(document.querySelectorAll('link[rel=stylesheet]'),function(l){var u=l.href.replace(/([?&])_ccs=\d+&?/,'$1').replace(/[?&]$/,'');l.href=u+(u.indexOf('?')<0?'?':'&')+'_ccs='+Date.now()})};
var es=new EventSource('/__ccs/events');
es.onmessage=function(m){var d={};try{d=JSON.parse(m.data)}catch(e){}if(d.type!=='change')return;var f=d.files||[];if(f.length&&f.every(function(x){return /\.css$/i.test(x)})){css();P('r',['css'])}else{location.reload()}};
P('l',[location.pathname+location.search]);
}catch(e){}})();</script>`;

const PAGE = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;padding:28px 20px;background:#0b1020;color:#eef2ff;font:16px/1.6 system-ui,sans-serif}h1{font-size:20px;margin:0 0 10px}p{color:#9aa7d0}a{color:#18c7ff;display:block;padding:6px 0;text-decoration:none;word-break:break-all}code{background:#1b2442;padding:2px 6px;border-radius:6px}</style></head><body>${body}</body></html>`;
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

module.exports = function createPreview() {
  let dir = '', real = '', snap = null, ver = 0, changes = [], lastTouch = 0, watcher = null, kickT = null, srv = null, listening = false;
  const clients = new Set();

  function scan() {
    const m = new Map(); let n = 0;
    (function walk(d, rel) {
      let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (n > MAX_FILES) return;
        if (e.name.startsWith('.')) continue;
        if (e.isDirectory()) { if (!IGN.has(e.name)) walk(path.join(d, e.name), rel + e.name + '/'); }
        else if (e.isFile() && !SKIP_FILE.test(e.name)) { n++; try { const s = fs.statSync(path.join(d, e.name)); m.set(rel + e.name, s.mtimeMs + ':' + s.size); } catch { /* gayab ho gayi */ } }
      }
    })(real, '');
    return m;
  }
  function broadcast(o) {
    const msg = 'data: ' + JSON.stringify(o) + '\n\n';
    for (const r of clients) { try { r.write(msg); } catch { clients.delete(r); } }
  }
  function tick() {
    if (!real) return;
    if (!clients.size && Date.now() - lastTouch > 20000) return; // koi dekh nahi raha to scan mat karo
    const m = scan();
    if (!snap) { snap = m; return; }
    const ch = [];
    for (const [k, v] of m) { const o = snap.get(k); if (o === undefined) ch.push({ f: k, k: '+' }); else if (o !== v) ch.push({ f: k, k: '~' }); }
    for (const k of snap.keys()) if (!m.has(k)) ch.push({ f: k, k: '-' });
    snap = m;
    if (!ch.length) return;
    ver++; const t = Date.now();
    for (const c of ch.slice().reverse()) changes.unshift({ ...c, t });
    changes = changes.slice(0, 40);
    broadcast({ type: 'change', files: ch.map(c => c.f), v: ver });
  }
  const kick = () => { clearTimeout(kickT); kickT = setTimeout(tick, 120); };
  function closeWatch() { if (watcher) { try { watcher.close(); } catch { /* ignore */ } watcher = null; } }
  function setDir(d) {
    closeWatch();
    dir = d ? path.resolve(d) : '';
    try { real = dir ? fs.realpathSync(dir) : ''; } catch { real = ''; }
    changes = []; ver++;
    snap = real ? scan() : null;
    if (real) {
      try { watcher = fs.watch(real, { recursive: true }, (ev, fn) => { if (fn && /(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(String(fn))) return; kick(); }); watcher.on('error', () => {}); }
      catch { /* recursive watch nahi hai, 1 second ki polling kaam karegi */ }
    }
    broadcast({ type: 'change', files: [], v: ver });
  }
  setInterval(tick, 1000).unref();
  setInterval(() => { for (const r of clients) { try { r.write(': ka\n\n'); } catch { clients.delete(r); } } }, 20000).unref();

  const inject = html => { const i = html.search(/<\/body>(?![\s\S]*<\/body>)/i); return i < 0 ? html + CLIENT : html.slice(0, i) + CLIENT + html.slice(i); };
  function sendHtml(res, code, html) { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(inject(html)); }

  function handle(req, res) {
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__ccs/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 1500\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (!real) return sendHtml(res, 200, PAGE('Preview', '<h1>Preview taiyar hai</h1><p>Dashboard ke Preview tab me project folder chuno. Folder lagte hi ye page apne aap badal jayega.</p>'));
    let rel; try { rel = decodeURIComponent(u.pathname); } catch { res.writeHead(400); return res.end(); }
    if (rel.includes('\0') || rel.split(/[\\/]/).some(s => s.startsWith('.') && s !== '' && s !== '.')) return sendHtml(res, 404, PAGE('404', '<h1>404</h1><p>Ye file nahi dikhai ja sakti.</p>'));
    let f = path.join(real, rel), st = null;
    const inside = p => { try { const r = fs.realpathSync(p); return r === real || r.startsWith(real + path.sep); } catch { return false; } };
    try { st = fs.statSync(f); } catch { st = null; }
    if (st && !inside(f)) return sendHtml(res, 403, PAGE('403', '<h1>403</h1><p>Folder ke bahar ki file nahi dikhai ja sakti.</p>'));
    if (st && st.isDirectory()) {
      const idx = ['index.html', 'index.htm'].map(n => path.join(f, n)).find(p => fs.existsSync(p));
      if (idx) { f = idx; st = fs.statSync(f); }
      else {
        const ents = fs.readdirSync(f, { withFileTypes: true }).filter(e => !e.name.startsWith('.') && !IGN.has(e.name));
        const base = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/';
        const links = ents.map(e => `<a href="${escH(base + encodeURIComponent(e.name))}${e.isDirectory() ? '/' : ''}">${e.isDirectory() ? '📁' : '📄'} ${escH(e.name)}</a>`).join('');
        const empty = !ents.length && path.resolve(f) === real;
        return sendHtml(res, 200, PAGE('Folder', empty
          ? '<h1>⏳ Folder abhi khali hai</h1><p>Jaise hi <code>index.html</code> ban jayegi ye page apne aap reload hoga. Kuch karne ki zarurat nahi.</p>'
          : `<h1>📂 ${escH(rel)}</h1><p>Yahan <code>index.html</code> nahi hai. File chuno:</p>${links}`));
      }
    }
    if (!st) { // SPA fallback: React/Vue routes (/about) bhi chalein
      const idx = path.join(real, 'index.html');
      if (!path.extname(rel) && fs.existsSync(idx)) { f = idx; st = fs.statSync(f); }
      else return sendHtml(res, 404, PAGE('404', `<h1>404</h1><p><code>${escH(rel)}</code> nahi mili. File banne par ye page apne aap reload hoga.</p>`));
    }
    const ext = path.extname(f).toLowerCase(), type = MIME[ext] || 'application/octet-stream';
    if (type === 'text/html' && st.size < 8e6) {
      let html; try { html = fs.readFileSync(f, 'utf8'); } catch { res.writeHead(500); return res.end(); }
      return sendHtml(res, 200, html);
    }
    const hdr = { 'content-type': TEXTY.test(type) ? type + '; charset=utf-8' : type, 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
    const rg = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (rg && (rg[1] || rg[2])) {
      let s = rg[1] ? +rg[1] : st.size - +rg[2], e = rg[1] && rg[2] ? +rg[2] : st.size - 1;
      if (s > e || s >= st.size) { res.writeHead(416, { 'content-range': 'bytes */' + st.size }); return res.end(); }
      e = Math.min(e, st.size - 1);
      res.writeHead(206, { ...hdr, 'content-range': `bytes ${s}-${e}/${st.size}`, 'content-length': e - s + 1 });
      return fs.createReadStream(f, { start: s, end: e }).on('error', () => res.destroy()).pipe(res);
    }
    res.writeHead(200, { ...hdr, 'content-length': st.size });
    fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
  }

  return {
    setDir,
    touch() { lastTouch = Date.now(); },
    listen(port, cb) {
      srv = http.createServer((req, res) => { try { handle(req, res); } catch { try { res.writeHead(500); res.end(); } catch { /* ignore */ } } });
      srv.on('error', e => { listening = false; if (cb) cb(e); });
      srv.listen(port, '127.0.0.1', () => { listening = true; if (cb) cb(null); });
    },
    info() {
      const pages = snap ? [...snap.keys()].filter(k => /\.html?$/i.test(k)).slice(0, 40) : [];
      return { dir, ok: !!real, ver, clients: clients.size, changes: changes.slice(0, 20), pages, files: snap ? snap.size : 0, hasIndex: !!(snap && (snap.has('index.html') || snap.has('index.htm'))), listening };
    },
  };
};
