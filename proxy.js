'use strict';
/* ccs proxy: Claude Code -> (ye proxy) -> upstream.
   - Anthropic format upstream (OmniRoute, OpenRouter, Anthropic): seedha pass-through
   - OpenAI format upstream (Gemini direct, OpenAI-compatible): Anthropic <-> OpenAI translation
   - Model fail ho to request ROK li jati hai (Claude ko error nahi dikhta), user naya model chunta hai,
     phir wahi request naye model par dobara jati hai, yani kaam wahin se aage badhta hai. */
const http = require('http'), crypto = require('crypto');
const rid = () => crypto.randomBytes(8).toString('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errBody = (type, message) => ({ type: 'error', error: { type, message } });
const DROP = new Set(['$schema', '$id', 'additionalProperties', 'exclusiveMinimum', 'exclusiveMaximum', 'patternProperties', 'propertyNames', 'unevaluatedProperties']);
const clean = s => Array.isArray(s) ? s.map(clean) : s && typeof s === 'object'
  ? Object.fromEntries(Object.entries(s).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, clean(v)])) : s;

function toOpenAI(body, c) {
  const msgs = [];
  const sys = typeof body.system === 'string' ? body.system : Array.isArray(body.system) ? body.system.map(x => x.text || '').join('\n') : '';
  if (sys) msgs.push({ role: 'system', content: sys });
  for (const m of body.messages || []) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content || []);
    if (m.role === 'assistant') {
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
      const calls = blocks.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } }));
      if (text || calls.length) { const o = { role: 'assistant', content: text || null }; if (calls.length) o.tool_calls = calls; msgs.push(o); }
    } else {
      const parts = [];
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const t = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map(x => x.text || '').join('\n') : '';
          msgs.push({ role: 'tool', tool_call_id: b.tool_use_id, content: (b.is_error ? '[error] ' : '') + (t || '(empty)') });
        } else if (b.type === 'text' && b.text) parts.push({ type: 'text', text: b.text });
        else if (b.type === 'image' && b.source && b.source.type === 'base64') parts.push({ type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
      }
      if (parts.length) msgs.push({ role: 'user', content: parts.every(p => p.type === 'text') ? parts.map(p => p.text).join('\n') : parts });
    }
  }
  const o = { model: c.model, messages: msgs, stream: !!body.stream };
  if (body.max_tokens) o.max_tokens = Math.min(body.max_tokens, +c.maxOut || 16000);
  if (body.temperature != null) o.temperature = body.temperature;
  if (body.top_p != null) o.top_p = body.top_p;
  if (body.stop_sequences && body.stop_sequences.length) o.stop = body.stop_sequences.slice(0, 4);
  if (body.tools && body.tools.length) {
    o.tools = body.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: clean(t.input_schema || { type: 'object', properties: {} }) } }));
    const tc = body.tool_choice;
    if (tc) o.tool_choice = tc.type === 'any' ? 'required' : tc.type === 'tool' ? { type: 'function', function: { name: tc.name } } : tc.type === 'none' ? 'none' : 'auto';
  }
  return o;
}
const argStr = a => (typeof a === 'string' ? a : a == null ? '' : JSON.stringify(a));
const stopOf = (finish, tool) => (tool ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn');

function fromOpenAI(j, c, inTok) {
  const ch = (j.choices || [])[0] || {}, m = ch.message || {}, content = [];
  if (m.content) content.push({ type: 'text', text: m.content });
  for (const t of m.tool_calls || []) {
    let inp = {}; try { inp = JSON.parse(argStr(t.function && t.function.arguments) || '{}'); } catch { /* khali */ }
    content.push({ type: 'tool_use', id: t.id || 'call_' + rid(), name: t.function.name, input: inp });
  }
  if (!content.length) return null;
  const outChars = JSON.stringify(content).length;
  return { id: 'msg_' + rid(), type: 'message', role: 'assistant', model: c.model, content, stop_reason: stopOf(ch.finish_reason, content.some(x => x.type === 'tool_use')), stop_sequence: null,
    usage: { input_tokens: (j.usage && j.usage.prompt_tokens) || inTok, output_tokens: (j.usage && j.usage.completion_tokens) || Math.ceil(outChars / 4) } };
}

module.exports = function createProxy(D) {
  let incident = null, lastSwitch = null, lastWaiter = 0;
  const waiters = new Set(), failed = new Map();
  const json = (res, code, obj) => { if (!res.headersSent) res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const sseErr = (res, msg) => { try { res.write(`event: error\ndata: ${JSON.stringify(errBody('overloaded_error', msg))}\n\n`); } catch { /* band */ } res.end(); };

  const workingFor = (c, model) => (c.working || []).filter(m => m !== model).map(m => ({ model: m, recentlyFailed: (failed.get(m) || 0) > Date.now() - 600000 }));
  function release() { for (const w of waiters) { clearTimeout(w.t); w.ok(); } waiters.clear(); }
  function pick(model, auto) {
    const c = D.loadCfg(); const from = c.model; c.model = model; D.saveCfg(c);
    if (c.base_url && c.api_key && model) D.apply(c);
    lastSwitch = { model, from, auto: !!auto, at: Date.now() };
    incident = null; release();
    D.notify((auto ? 'Auto-switch: ' : 'Model badla: ') + model);
  }
  function retryNow() { if (incident) failed.delete(incident.model); incident = null; release(); }
  function raise(model, reason) {
    if (incident) return;
    failed.set(model, Date.now());
    incident = { id: rid(), model, reason, since: Date.now() };
    const c = D.loadCfg();
    if (c.auto) { const n = workingFor(c, model).find(x => !x.recentlyFailed); if (n) return pick(n.model, true); }
    D.notify('Model band ho gaya: ' + model + '. Dashboard me naya model chuno');
    D.onIncident(incident);
  }
  function gate(res) {
    if (!incident) return Promise.resolve();
    return new Promise((ok, no) => {
      const w = { ok, no }; waiters.add(w); lastWaiter = Date.now();
      w.t = setTimeout(() => { waiters.delete(w); no(new Error('Naya model chunne ka intezaar bahut lamba ho gaya')); }, 25 * 60000);
      res.once('close', () => { waiters.delete(w); clearTimeout(w.t); lastWaiter = Date.now(); no(new Error('closed')); });
    });
  }
  setInterval(() => { if (incident && !waiters.size && Date.now() - lastWaiter > 90000 && Date.now() - incident.since > 90000) incident = null; }, 15000).unref();

  function guard(parent, firstMs) {
    const ctl = new AbortController(); let t, timedOut = false;
    const arm = ms => { clearTimeout(t); t = setTimeout(() => { timedOut = true; ctl.abort(); }, ms); };
    parent.addEventListener('abort', () => { clearTimeout(t); ctl.abort(); });
    arm(firstMs);
    return { signal: ctl.signal, arm, clear: () => clearTimeout(t), timedOut: () => timedOut };
  }
  function failInfo(status, text, h) {
    let msg = text;
    try { const j = JSON.parse(text), e = Array.isArray(j) ? j[0] : j; msg = (e.error && (e.error.message || e.error)) || e.message || text; } catch { /* plain text */ }
    msg = String(msg).replace(/\s+/g, ' ').slice(0, 300);
    if ([400, 413, 422].includes(status) && /context|too long|too many tokens|exceed|maximum.*length|token limit/i.test(msg)) return { passthrough: true, msg: 'prompt is too long: ' + msg };
    const ra = +(h && h.get && h.get('retry-after'));
    return { retry: status === 429 || status >= 500 || status === 408, wait: ra > 0 ? Math.min(ra * 1000, 10000) : 0, msg: `HTTP ${status}: ${msg}` };
  }
  const netFail = (e, g, sig) => ({ fail: { retry: !sig.aborted || g.timedOut(), msg: g.timedOut() ? 'timeout (jawab nahi aaya)' : String(e.message || e) } });

  /* ---- Anthropic-format upstream ---- */
  async function viaAnthropic(c, body, stream, res, sig) {
    const g = guard(sig, 180000);
    let r;
    try { r = await fetch(D.upUrl(c, '/messages'), { method: 'POST', headers: D.upHeaders(c), body: JSON.stringify({ ...body, model: c.model }), signal: g.signal }); }
    catch (e) { g.clear(); return netFail(e, g, sig); }
    if (!r.ok) { g.clear(); return { fail: failInfo(r.status, await r.text().catch(() => ''), r.headers) }; }
    if (!stream) {
      try { const t = await r.text(); g.clear(); JSON.parse(t); res.writeHead(200, { 'content-type': 'application/json' }); res.end(t); return 'done'; }
      catch (e) { g.clear(); return netFail(e, g, sig); }
    }
    const reader = r.body.getReader(), dec = new TextDecoder(); let head = '', started = false, seenStop = false;
    try {
      g.arm(120000);
      for (;;) {
        const { done, value } = await reader.read(); if (done) break; g.arm(120000);
        const s = dec.decode(value, { stream: true });
        if (!started) { // pehla event dekho: gateway kabhi 200 ke saath error bhejta hai
          head += s; if (!head.includes('\n\n') && head.length < 4096) continue;
          if (/^\s*event:\s*error|"type"\s*:\s*"error"/.test(head.split('\n\n')[0])) { g.clear(); reader.cancel().catch(() => {}); return { fail: { retry: true, msg: head.slice(0, 250).replace(/\s+/g, ' ') } }; }
          started = true; res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); res.write(head); if (head.includes('message_stop')) seenStop = true; continue;
        }
        if (s.includes('message_stop')) seenStop = true;
        res.write(s);
      }
    } catch (e) { g.clear(); if (!started) return netFail(e, g, sig); if (!sig.aborted) { raise(c.model, 'stream beech me toot gayi: ' + (g.timedOut() ? 'timeout' : e.message)); sseErr(res, 'stream toot gayi'); } return 'done'; }
    g.clear();
    if (!started) return { fail: { retry: true, msg: 'khali jawab' } };
    if (!seenStop && !sig.aborted) { raise(c.model, 'stream adhuri khatam hui'); sseErr(res, 'stream adhuri'); return 'done'; }
    res.end(); return 'done';
  }

  /* ---- OpenAI-format upstream (Gemini direct etc.) ---- */
  async function viaOpenAI(c, body, stream, res, sig) {
    const o = toOpenAI(body, c), inTok = Math.ceil(JSON.stringify(body).length / 4), g = guard(sig, 180000);
    let r;
    try { r = await fetch(D.upUrl(c, '/chat/completions'), { method: 'POST', headers: D.upHeaders(c), body: JSON.stringify(o), signal: g.signal }); }
    catch (e) { g.clear(); return netFail(e, g, sig); }
    if (!r.ok) { g.clear(); return { fail: failInfo(r.status, await r.text().catch(() => ''), r.headers) }; }
    if (!stream) {
      try {
        const j = await r.json(); g.clear();
        if (j.error) return { fail: { retry: true, msg: String(j.error.message || j.error).slice(0, 250) } };
        const m = fromOpenAI(j, c, inTok); if (!m) return { fail: { retry: true, msg: 'khali jawab' } };
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(m)); return 'done';
      } catch (e) { g.clear(); return netFail(e, g, sig); }
    }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '', started = false, idx = -1, open = null, outChars = 0, finish = null, sawTool = false, usage = null;
    const send = (ev, d) => res.write(`event: ${ev}\ndata: ${JSON.stringify({ type: ev, ...d })}\n\n`);
    const begin = () => { if (started) return; started = true; res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      send('message_start', { message: { id: 'msg_' + rid(), type: 'message', role: 'assistant', model: c.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: inTok, output_tokens: 1 } } }); };
    const shut = () => { if (open) { send('content_block_stop', { index: idx }); open = null; } };
    const text = t => { begin(); if (open !== 'text') { shut(); idx++; open = 'text'; send('content_block_start', { index: idx, content_block: { type: 'text', text: '' } }); } outChars += t.length; send('content_block_delta', { index: idx, delta: { type: 'text_delta', text: t } }); };
    const tool = tc => {
      begin(); const f = tc.function || {};
      if (f.name) { shut(); idx++; open = 'tool'; sawTool = true; send('content_block_start', { index: idx, content_block: { type: 'tool_use', id: tc.id || 'call_' + rid(), name: f.name, input: {} } }); }
      const a = argStr(f.arguments);
      if (open === 'tool' && a) { outChars += a.length; send('content_block_delta', { index: idx, delta: { type: 'input_json_delta', partial_json: a } }); }
    };
    try {
      g.arm(120000);
      for (;;) {
        const { done, value } = await reader.read(); if (done) break; g.arm(120000);
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
          let j; try { j = JSON.parse(d); } catch { continue; }
          if (j.error) throw new Error(String(j.error.message || j.error));
          if (j.usage) usage = j.usage;
          const ch = (j.choices || [])[0]; if (!ch) continue;
          const dl = ch.delta || {};
          if (dl.content) text(dl.content);
          for (const tc of dl.tool_calls || []) tool(tc);
          if (ch.finish_reason) finish = ch.finish_reason;
        }
      }
    } catch (e) { g.clear(); if (!started) return netFail(e, g, sig); if (!sig.aborted) { raise(c.model, 'stream beech me toot gayi: ' + (g.timedOut() ? 'timeout' : e.message)); sseErr(res, 'stream toot gayi'); } return 'done'; }
    g.clear();
    if (!started) return { fail: { retry: true, msg: 'khali jawab' } };
    shut();
    send('message_delta', { delta: { stop_reason: stopOf(finish, sawTool), stop_sequence: null }, usage: { output_tokens: (usage && usage.completion_tokens) || Math.ceil(outChars / 4) || 1 } });
    send('message_stop', {}); res.end(); return 'done';
  }

  async function messages(req, res, body) {
    const stream = !!body.stream; let closed = false, tries = 0, last = null;
    const ctl = new AbortController(); res.on('close', () => { closed = true; ctl.abort(); });
    for (;;) {
      if (closed) return;
      try { await gate(res); } catch (e) { if (!closed) json(res, 529, errBody('overloaded_error', e.message)); return; }
      const c = D.loadCfg();
      if (c.model !== last) { tries = 0; last = c.model; }
      const r = D.ptype(c) === 'openai' ? await viaOpenAI(c, body, stream, res, ctl.signal) : await viaAnthropic(c, body, stream, res, ctl.signal);
      if (r === 'done' || closed) return;
      const f = r.fail;
      if (f.passthrough) return json(res, 400, errBody('invalid_request_error', f.msg));
      if (f.retry && tries < 2) { tries++; await sleep(f.wait || Math.min(8000, 1500 * 2 ** tries)); continue; }
      raise(c.model, f.msg);
    }
  }

  const srv = http.createServer(async (req, res) => {
    try {
      const u = req.url.split('?')[0], c0 = D.loadCfg();
      const tok = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!c0.token || tok !== c0.token) return json(res, 401, errBody('authentication_error', 'ccs token galat'));
      if (req.method === 'GET' && u === '/v1/models') return json(res, 200, { data: [{ id: c0.model, type: 'model', display_name: c0.model }] });
      if (req.method !== 'POST') return json(res, 404, errBody('not_found_error', 'nahi mila'));
      let s = ''; for await (const ch of req) { s += ch; if (s.length > 60e6) return json(res, 413, errBody('invalid_request_error', 'request bahut badi')); }
      let body; try { body = JSON.parse(s); } catch { return json(res, 400, errBody('invalid_request_error', 'JSON galat')); }
      if (u === '/v1/messages/count_tokens') return json(res, 200, { input_tokens: Math.ceil(s.length / 4) });
      if (u !== '/v1/messages') return json(res, 404, errBody('not_found_error', 'nahi mila'));
      await messages(req, res, body);
    } catch (e) { if (!res.headersSent) json(res, 529, errBody('overloaded_error', String(e.message || e))); else res.end(); }
  });
  return {
    listen: (port, cb) => srv.listen(port, '127.0.0.1', cb),
    on: (ev, fn) => srv.on(ev, fn),
    pick, retryNow,
    clear: () => { incident = null; release(); },
    info: () => { const c = D.loadCfg(); return { incident: incident && { ...incident, waiting: waiters.size, options: workingFor(c, incident.model) }, lastSwitch }; },
    markFailed: m => failed.set(m, Date.now()), isFailed: m => (failed.get(m) || 0) > Date.now() - 600000,
  };
};
module.exports.toOpenAI = toOpenAI; module.exports.fromOpenAI = fromOpenAI;
