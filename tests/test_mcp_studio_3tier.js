'use strict';

/**
 * Bộ kiểm thử 3 tầng toàn diện F22 — Antigravity Theme Studio MCP App & SEP-1865 Bridge:
 * - Tầng 1 (Unit, Schema, Inline Script AST & 0ms Pre-Hydration):
 *   Kiểm chứng giao thức MCP (2026-01-26 / 2025-06-18), cú pháp vm.Script cho <script> nhúng,
 *   và dựng DOM 0ms ngay khi nạp HTML chưa cần vòng lặp postMessage.
 * - Tầng 2 (Edge Cases, Security XSS/CSS Injection, SEP-1865 Bridge & Node <-> Rust Parity):
 *   Kiểm chứng --font-sans > 160 ký tự, color-mix(...), chặn CSS/XSS injection, ping/pong,
 *   timeout dọn dẹp pending RPC, và đối xứng 100% giữa Node MCP Server và Rust Binary.
 * - Tầng 3 (Real Browser CDP E2E Execution):
 *   Chạy Chromium/Edge thật với Cross-Origin Isolated Sandbox Iframe + CSP nghiêm ngặt y hệt
 *   Antigravity Host, bắt Runtime.exceptionThrown === 0 và thao tác click/slider thật đầu-cuối.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const NODE_MCP_PATH = path.join(REPO_ROOT, 'daemon', 'mcp_theme_server.js');
const RUST_BIN_NAME = process.platform === 'win32' ? 'agy-theme.exe' : 'agy-theme';
const RUST_BIN_PATH = path.join(REPO_ROOT, 'rust', 'target', 'release', RUST_BIN_NAME);

const TMP_DIRS = [];

function makeTempDir(prefix = 'agy-test-f22-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP_DIRS.push(dir);
  return dir;
}

after(() => {
  while (TMP_DIRS.length > 0) {
    const dir = TMP_DIRS.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 80 });
    } catch (_) {}
  }
});

function findLocalChromiumBinary() {
  const envCandidates = [];
  if (process.platform === 'win32') {
    const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
    const pfx86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    envCandidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pfx86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else if (process.platform === 'darwin') {
    envCandidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    envCandidates.push('/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium');
  }
  return envCandidates.find((p) => fs.existsSync(p)) || null;
}

function sendMcpBatch(binCmd, binArgs, requests, useContentLength = false, customEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binCmd, binArgs, {
      cwd: REPO_ROOT,
      env: { ...process.env, PLUGIN_ROOT: REPO_ROOT, AGY_SKIP_DAEMON_SPAWN: '1', ...customEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    const responses = [];
    const expectedIds = requests.filter((r) => r.id !== undefined).length;
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      reject(new Error(`MCP batch timeout (${responses.length}/${expectedIds}) for ${binCmd}`));
    }, 12000);

    let rawBuf = Buffer.alloc(0);
    const parseOut = () => {
      if (useContentLength) {
        while (rawBuf.length > 0) {
          const sep = rawBuf.indexOf('\r\n\r\n');
          if (sep === -1) break;
          const hdr = rawBuf.subarray(0, sep).toString('ascii');
          const m = hdr.match(/Content-Length:\s*(\d+)/i);
          if (!m) break;
          const len = parseInt(m[1], 10);
          if (rawBuf.length < sep + 4 + len) break;
          const body = rawBuf.subarray(sep + 4, sep + 4 + len).toString('utf8');
          rawBuf = rawBuf.subarray(sep + 4 + len);
          responses.push(JSON.parse(body));
        }
      } else {
        while (rawBuf.length > 0) {
          const nl = rawBuf.indexOf(0x0a);
          if (nl === -1) break;
          const line = rawBuf.subarray(0, nl).toString('utf8').trim();
          rawBuf = rawBuf.subarray(nl + 1);
          if (line) responses.push(JSON.parse(line));
        }
      }
      if (responses.length >= expectedIds) {
        clearTimeout(timer);
        try { child.stdin.end(); } catch (_) {}
      }
    };

    child.stdout.on('data', (c) => {
      rawBuf = Buffer.concat([rawBuf, c]);
      parseOut();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(responses);
    });

    for (const req of requests) {
      const json = JSON.stringify(req);
      if (useContentLength) {
        const bLen = Buffer.byteLength(json, 'utf8');
        child.stdin.write(`Content-Length: ${bLen}\r\n\r\n${json}`);
      } else {
        child.stdin.write(`${json}\n`);
      }
    }
    if (expectedIds === 0) {
      clearTimeout(timer);
      try { child.stdin.end(); } catch (_) {}
    }
  });
}

/**
 * Xây dựng môi trường DOM tối giản trong V8 VM để chạy trực tiếp <script> của Studio HTML,
 * kiểm thử Tầng 1 (0ms Pre-Hydration) và Tầng 2 (SEP-1865 postMessage Bridge & CSS/XSS Security).
 */
function mountStudioHtmlInVm(htmlText) {
  const scriptMatches = [...htmlText.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scriptMatches.length, 1, 'Studio HTML phải có đúng 1 khối <script> tự thân');
  const scriptSource = scriptMatches[0][1];

  // Kiểm tra cú pháp nghiêm ngặt bằng vm.Script trước khi chạy
  const compiled = new vm.Script(scriptSource, { filename: 'studio_app_vm.js' });

  const rootStyleMap = new Map();
  const elementsById = new Map();
  const langButtons = [];

  class FakeElement {
    constructor(tag, id = '') {
      this.tagName = String(tag || 'div').toUpperCase();
      this.id = id;
      this.className = '';
      this.type = '';
      this.value = '';
      this.placeholder = '';
      this.title = '';
      this.selected = false;
      this._textContent = '';
      this.children = [];
      this.attributes = new Map();
      this.listeners = new Map();
      this.style = {
        display: '',
        backgroundColor: '',
        fontSize: '',
        color: '',
        setProperty: (k, v) => { rootStyleMap.set(k, String(v)); },
        getPropertyValue: (k) => rootStyleMap.get(k) || ''
      };
    }
    get textContent() {
      if (this.children.length === 0) return this._textContent;
      return this._textContent + this.children.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this._textContent = String(v ?? '');
      if (v === '') this.children = [];
    }
    get options() {
      return this.children;
    }
    setAttribute(k, v) {
      this.attributes.set(String(k), String(v));
    }
    getAttribute(k) {
      return this.attributes.has(String(k)) ? this.attributes.get(String(k)) : null;
    }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    async dispatch(type, evPatch = {}) {
      const list = this.listeners.get(type) || [];
      for (const fn of list) {
        await fn({ target: this, currentTarget: this, ...evPatch });
      }
    }
  }

  const knownIds = [
    'cdp-badge', 'refresh-btn', 'doctor-box', 'doc-title', 'doctor-msg', 'doctor-fix-btn',
    'ctrl-lbl', 'persona-sel', 'ai-tone-sel', 'focus-btn', 'chibi-btn',
    'dim-lbl', 'dimming-val', 'dimming-range', 'fx-lbl', 'fx-val', 'fx-range',
    'lang-lbl', 'toast', 'ws-lbl', 'ws-input', 'ws-bind-btn', 'ws-list',
    'gal-lbl', 'themes-grid'
  ];
  for (const id of knownIds) {
    const el = new FakeElement('div', id);
    if (id === 'ai-tone-sel') {
      for (const mode of ['subtle', 'roleplay', 'off']) {
        const opt = new FakeElement('option');
        opt.value = mode;
        el.appendChild(opt);
      }
    }
    elementsById.set(id, el);
  }
  for (const code of ['vi', 'en', 'ja']) {
    const lb = new FakeElement('button');
    lb.className = 'lang-btn';
    lb.setAttribute('data-lang', code);
    langButtons.push(lb);
  }

  const docRoot = new FakeElement('html');
  docRoot.lang = 'vi';
  const docListeners = new Map();
  const winListeners = new Map();
  const postedToParent = [];

  const parentWin = {
    postMessage: (msg, targetOrigin) => {
      postedToParent.push({ msg, targetOrigin });
    }
  };
  const topWin = { isTopRelay: true };

  const documentObj = {
    documentElement: docRoot,
    visibilityState: 'visible',
    getElementById: (id) => elementsById.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: (sel) => (sel === '.lang-btn' ? langButtons : []),
    addEventListener: (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    }
  };

  const windowObj = {
    parent: parentWin,
    top: topWin,
    document: documentObj,
    addEventListener: (type, fn) => {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    }
  };

  const ctx = vm.createContext({
    window: windowObj,
    document: documentObj,
    setTimeout,
    clearTimeout,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Promise,
    Error
  });

  compiled.runInContext(ctx);

  const emitHostMessage = async (data, source = parentWin) => {
    const list = winListeners.get('message') || [];
    for (const fn of list) {
      await fn({ data, source, origin: 'https://127.0.0.1:50000' });
    }
  };

  return {
    ctx,
    elementsById,
    langButtons,
    rootStyleMap,
    postedToParent,
    parentWin,
    topWin,
    emitHostMessage
  };
}

function connectCdpSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      host: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13'
      }
    });
    req.on('upgrade', (_, socket) => {
      let idSeq = 1;
      const pending = new Map();
      const listeners = new Map();
      let buf = Buffer.alloc(0);
      let chunks = [];
      let collecting = false;

      socket.on('data', (c) => {
        buf = Buffer.concat([buf, c]);
        while (buf.length >= 2) {
          const fin = (buf[0] & 0x80) !== 0;
          const op = buf[0] & 0x0f;
          let len = buf[1] & 0x7f;
          let off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const fd = buf.slice(off, off + len);
          buf = buf.slice(off + len);
          if (op === 0x01) { chunks = [fd]; collecting = !fin; }
          else if (op === 0x00 && collecting) { chunks.push(fd); if (fin) collecting = false; }
          if (!collecting && chunks.length > 0) {
            const str = Buffer.concat(chunks).toString('utf8');
            chunks = [];
            try {
              const msg = JSON.parse(str);
              if (msg.id && pending.has(msg.id)) {
                const p = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
                else p.resolve(msg.result);
              } else if (msg.method && listeners.has(msg.method)) {
                for (const fn of listeners.get(msg.method)) fn(msg.params);
              }
            } catch (_) {}
          }
        }
      });

      const send = (method, params = {}) => {
        const id = idSeq++;
        return new Promise((res, rej) => {
          pending.set(id, { resolve: res, reject: rej });
          const payload = Buffer.from(JSON.stringify({ id, method, params }), 'utf8');
          const mask = crypto.randomBytes(4);
          let hdr;
          if (payload.length < 126) {
            hdr = Buffer.alloc(6);
            hdr[0] = 0x81; hdr[1] = 0x80 | payload.length; mask.copy(hdr, 2);
          } else if (payload.length < 65536) {
            hdr = Buffer.alloc(8);
            hdr[0] = 0x81; hdr[1] = 0x80 | 126; hdr.writeUInt16BE(payload.length, 2); mask.copy(hdr, 4);
          } else {
            hdr = Buffer.alloc(14);
            hdr[0] = 0x81; hdr[1] = 0x80 | 127; hdr.writeBigUInt64BE(BigInt(payload.length), 2); mask.copy(hdr, 10);
          }
          const masked = Buffer.alloc(payload.length);
          for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
          socket.write(Buffer.concat([hdr, masked]));
        });
      };

      const on = (method, fn) => {
        if (!listeners.has(method)) listeners.set(method, []);
        listeners.get(method).push(fn);
      };

      resolve({ send, on, close: () => socket.destroy() });
    });
    req.on('error', reject);
    req.end();
  });
}

class LiveStdioMcp {
  constructor(binCmd, binArgs, env) {
    this.proc = spawn(binCmd, binArgs, {
      cwd: REPO_ROOT,
      env: { ...process.env, PLUGIN_ROOT: REPO_ROOT, AGY_SKIP_DAEMON_SPAWN: '1', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    this.seq = 1;
    this.pending = new Map();
    this.buf = '';
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      this.buf += chunk;
      let idx;
      while ((idx = this.buf.indexOf('\n')) !== -1) {
        const line = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
            else p.resolve(msg.result);
          }
        } catch (_) {}
      }
    });
  }
  request(method, params = {}) {
    const id = this.seq++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  close() {
    try { this.proc.stdin.end(); } catch (_) {}
    try { this.proc.kill(); } catch (_) {}
  }
}

async function runRealBrowserE2eForBackend(chromeBin, binCmd, binArgs, tmpDir) {
  // Dựng mock CDP endpoint 127.0.0.1 tạm thời để cdpHealthy === true trong môi trường cô lập
  const mockCdpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ id: 'mock-1', type: 'page', title: 'Antigravity', url: 'https://127.0.0.1:1/' }]));
  });
  await new Promise((r) => mockCdpServer.listen(0, '127.0.0.1', r));
  const mockCdpPort = mockCdpServer.address().port;

  const cfgPath = path.join(tmpDir, 'theme_config.json');
  const bakPath = path.join(tmpDir, 'backup.json');
  const pidPath = path.join(tmpDir, 'daemon.pid');
  const portPath = path.join(tmpDir, 'DevToolsActivePort');

  fs.writeFileSync(pidPath, String(process.pid), 'utf8');
  fs.writeFileSync(portPath, `${mockCdpPort}\n/devtools/browser/mock\n`, 'utf8');
  fs.writeFileSync(cfgPath, JSON.stringify({
    themeName: '🎋 Nezuko Kamado — Hồng Liên',
    masterPersona: 'yoriichi',
    aiPersonaMode: 'subtle',
    dimming: 28,
    fxDensity: 100,
    chibiEnabled: true,
    focusMode: false,
    uiLang: 'vi',
    activeWorkspace: 'demo-api'
  }, null, 2), 'utf8');

  const mcp = new LiveStdioMcp(binCmd, binArgs, {
    AGY_CONFIG_PATH: cfgPath,
    AGY_BACKUP_CONFIG_PATH: bakPath,
    AGY_PID_FILE: pidPath,
    AGY_DEVTOOLS_PORT_FILE: portPath
  });

  await mcp.request('initialize', { protocolVersion: '2026-01-26' });
  const resRead = await mcp.request('resources/read', { uri: 'ui://agy-theme/studio.html' });
  const initialToolRes = await mcp.request('tools/call', { name: 'open_theme_studio', arguments: {} });

  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'">`;
  const appHtmlWithCsp = resRead.contents[0].text.replace('<head>', '<head>' + cspMeta);

  const appServer = http.createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(appHtmlWithCsp);
  });
  await new Promise((r) => appServer.listen(0, '127.0.0.1', r));
  const appPort = appServer.address().port;

  const hostServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/mcp-call') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const result = await mcp.request('tools/call', parsed);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: -32603, message: String(err.message || err) } }));
        }
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;background:#070708;">
<iframe id="mcp-frame" style="width:100vw;height:100vh;border:0;" sandbox="allow-scripts allow-same-origin" src="http://127.0.0.1:${appPort}/studio.html"></iframe>
<script>
  const INITIAL_RES = ${JSON.stringify(initialToolRes).replace(/</g, '\\u003c')};
  const frame = document.getElementById('mcp-frame');
  window.addEventListener('message', async (ev) => {
    const msg = ev.data;
    if (!msg || msg.jsonrpc !== '2.0') return;
    if (msg.method === 'ui/initialize') {
      frame.contentWindow.postMessage({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2026-01-26',
          hostCapabilities: { openLinks: {}, serverTools: {} },
          hostInfo: { name: 'Antigravity', version: '1.0.0' },
          hostContext: {
            theme: 'dark',
            styles: {
              variables: {
                '--color-background-primary': '#070708',
                '--color-background-secondary': '#131317',
                '--color-background-info': 'color-mix(in srgb, #6a9fcb 15%, transparent)',
                '--font-sans': '"Google Sans Flex", "Google Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Noto Sans CJK JP", "Apple Color Emoji"'
              }
            }
          }
        }
      }, '*');
    } else if (msg.method === 'ui/notifications/initialized') {
      frame.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: {} } }, '*');
      frame.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: INITIAL_RES }, '*');
    } else if (msg.method === 'tools/call') {
      const r = await fetch('/mcp-call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg.params) }).then(x => x.json());
      frame.contentWindow.postMessage({ jsonrpc: '2.0', id: msg.id, ...(r.error ? { error: r.error } : { result: r.result }) }, '*');
    }
  });
</script></body></html>`);
  });
  await new Promise((r) => hostServer.listen(0, '127.0.0.1', r));
  const hostPort = hostServer.address().port;

  const userDataDir = makeTempDir('agy-f22-chrome-');
  const chromeArgs = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    ...(process.platform === 'linux'
      ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      : []),
    `--user-data-dir=${userDataDir}`,
    '--window-size=900,900',
    '--remote-debugging-port=0',
    `http://127.0.0.1:${hostPort}/`
  ];
  const chrome = spawn(chromeBin, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  const exceptions = [];
  let pageCdp = null;
  let frameCdp = null;
  try {
    const wsBrowserUrl = await new Promise((resolve, reject) => {
      let errBuf = '';
      const t = setTimeout(() => reject(new Error('Browser DevTools start timeout')), 15000);
      chrome.stderr.setEncoding('utf8');
      chrome.stderr.on('data', (chunk) => {
        errBuf += chunk;
        const m = errBuf.match(/DevTools listening on (ws:\/\/[^\r\n]+)/);
        if (m) { clearTimeout(t); resolve(m[1]); }
      });
    });

    const cdpPort = Number(new URL(wsBrowserUrl).port);
    const listTargets = () => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: cdpPort, path: '/json/list', headers: { Connection: 'close' } }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve(JSON.parse(raw)));
      }).on('error', reject);
    });

    await new Promise((r) => setTimeout(r, 700));
    const initialTargets = await listTargets();
    const pageTarget = initialTargets.find((t) => t.type === 'page' && t.url.includes(`127.0.0.1:${hostPort}`));
    assert.ok(pageTarget, 'Phải tìm thấy trang Host trong trình duyệt');

    const frameContexts = [];
    pageCdp = await connectCdpSocket(pageTarget.webSocketDebuggerUrl);
    pageCdp.on('Runtime.executionContextCreated', (p) => {
      if (p && p.context) frameContexts.push(p.context);
    });
    pageCdp.on('Runtime.exceptionThrown', (p) => {
      exceptions.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'page-exception');
    });
    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');

    frameContexts.length = 0;
    await pageCdp.send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 950));

    const liveTargets = await listTargets();
    const liveFrame = liveTargets.find((t) => t.id !== pageTarget.id && t.url && t.url.includes('studio.html'));
    let evalOpts = {};
    let targetCdp = pageCdp;
    if (liveFrame && liveFrame.webSocketDebuggerUrl) {
      frameCdp = await connectCdpSocket(liveFrame.webSocketDebuggerUrl);
      frameCdp.on('Runtime.exceptionThrown', (p) => {
        exceptions.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'iframe-live-exception');
      });
      await frameCdp.send('Runtime.enable');
      targetCdp = frameCdp;
    } else {
      let childFrame = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const tree = await pageCdp.send('Page.getFrameTree');
        const found = (tree.frameTree?.childFrames || []).find((cf) => cf.frame && cf.frame.url && cf.frame.url.includes('studio.html'));
        if (found) { childFrame = found.frame; break; }
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(childFrame, 'Phải tìm thấy child frame Studio đã nạp studio.html');
      const iw = await pageCdp.send('Page.createIsolatedWorld', { frameId: childFrame.id, worldName: 'agy_e2e' });
      evalOpts = { contextId: iw.executionContextId };
    }

    // Thực thi chuỗi tương tác người dùng thật bên trong iframe Studio
    const e2eEval = await targetCdp.send('Runtime.evaluate', {
      ...evalOpts,
      expression: `(async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 40; i++) {
          if (document.getElementById('themes-grid')?.children?.length > 0 && document.documentElement.style.getPropertyValue('--font-sans')) break;
          await wait(50);
        }
        const initSnap = {
          badge: document.getElementById('cdp-badge')?.textContent,
          gridCount: document.getElementById('themes-grid')?.children?.length,
          personaCount: document.getElementById('persona-sel')?.children?.length,
          fontVarLen: document.documentElement.style.getPropertyValue('--font-sans')?.length
        };

        // 1. Đổi ngôn ngữ sang Tiếng Anh
        document.querySelector('.lang-btn[data-lang="en"]').click();
        await wait(250);
        const enHeader = document.getElementById('ctrl-lbl')?.textContent;

        // 2. Click đổi chủ đề sang Shinobu
        const shinobuBtn = Array.from(document.querySelectorAll('.th-btn')).find(b => b.textContent.includes('Shinobu'));
        shinobuBtn.click();
        await wait(250);

        // 3. Đổi Bản Ngã sang six_eyes
        const pSel = document.getElementById('persona-sel');
        pSel.value = 'six_eyes';
        pSel.dispatchEvent(new Event('change'));
        await wait(250);

        // 4. Chỉnh thanh kéo Độ tối nền (48%) và Mật độ hạt (65%)
        const dimEl = document.getElementById('dimming-range');
        dimEl.value = '48';
        dimEl.dispatchEvent(new Event('input'));
        dimEl.dispatchEvent(new Event('change'));
        await wait(200);

        const fxEl = document.getElementById('fx-range');
        fxEl.value = '65';
        fxEl.dispatchEvent(new Event('input'));
        fxEl.dispatchEvent(new Event('change'));
        await wait(200);

        // 5. Gắn hồ sơ dự án billing-svc
        const wsIn = document.getElementById('ws-input');
        wsIn.value = 'billing-svc';
        document.getElementById('ws-bind-btn').click();
        await wait(250);

        return {
          initSnap,
          enHeader,
          activeCard: document.querySelector('.th-btn[aria-pressed="true"] .th-name')?.textContent,
          dimLabel: document.getElementById('dimming-val')?.textContent,
          fxLabel: document.getElementById('fx-val')?.textContent,
          wsChipCount: document.querySelectorAll('.ws-chip').length,
          toastText: document.getElementById('toast')?.textContent
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (e2eEval.exceptionDetails) {
      throw new Error('E2E iframe eval exception: ' + JSON.stringify(e2eEval.exceptionDetails));
    }

    const savedCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return {
      exceptions,
      ui: e2eEval.result?.value,
      savedCfg
    };
  } finally {
    if (frameCdp) { try { frameCdp.close(); } catch (_) {} }
    if (pageCdp) { try { pageCdp.close(); } catch (_) {} }
    try { chrome.kill(); } catch (_) {}
    appServer.close();
    hostServer.close();
    mockCdpServer.close();
    mcp.close();
  }
}

describe('F22 — Bộ Kiểm Thử 3 Tầng: Antigravity Theme Studio MCP App & SEP-1865 Bridge', () => {
  describe('Tầng 1 — Đơn vị, Hợp đồng Giao thức, Cú pháp AST Script Nhúng & 0ms Pre-Hydration', () => {
    it('F22-T1-01: Đàm phán chuẩn protocolVersion 2026-01-26 / 2025-06-18 và xuất resource < 10 MiB sạch ký tự', async () => {
      const tmp = makeTempDir('agy-f22-t1-');
      const env = {
        AGY_CONFIG_PATH: path.join(tmp, 'cfg.json'),
        AGY_BACKUP_CONFIG_PATH: path.join(tmp, 'bak.json'),
        AGY_PID_FILE: path.join(tmp, 'daemon.pid'),
        AGY_DEVTOOLS_PORT_FILE: path.join(tmp, 'DevToolsActivePort')
      };
      const res = await sendMcpBatch(
        process.execPath,
        [NODE_MCP_PATH],
        [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-01-26' } },
          { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } },
          { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
          { jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'ui://agy-theme/studio.html' } }
        ],
        false,
        env
      );

      assert.equal(res[0].result.protocolVersion, '2026-01-26', 'Phải đàm phán trực tiếp bản 2026-01-26 của Antigravity Host');
      assert.equal(res[1].result.protocolVersion, '2025-06-18', 'Bản lạ phải fallback an toàn về 2025-06-18');

      const studioTool = res[2].result.tools.find((t) => t.name === 'open_theme_studio');
      assert.ok(studioTool);
      assert.deepEqual(studioTool._meta.ui.visibility, ['model', 'app']);
      assert.equal(studioTool._meta['com.google.antigravity/ui'].entrypoints.length, 2);

      const content = res[3].result.contents[0];
      assert.equal(content.mimeType, 'text/html;profile=mcp-app');
      const byteLen = Buffer.byteLength(content.text, 'utf8');
      assert.ok(byteLen > 5000 && byteLen < 10 * 1024 * 1024, `Kích thước resource không hợp lệ: ${byteLen}`);
      assert.equal(content.text.includes('__AGY_STUDIO_INITIAL_STATE__'), false, 'Placeholder trạng thái ban đầu phải được thay thế hoàn toàn');
    });

    it('F22-T1-02: Thẻ <script> nhúng trong ui://agy-theme/studio.html biên dịch vm.Script sạch 100% và Pre-Hydrate đủ 16 chủ đề + 18 Bản Ngã ở 0ms', async () => {
      const tmp = makeTempDir('agy-f22-pre-');
      const pidFile = path.join(tmp, 'daemon.pid');
      fs.writeFileSync(pidFile, String(process.pid), 'utf8');
      const cfgFile = path.join(tmp, 'cfg.json');
      fs.writeFileSync(cfgFile, JSON.stringify({
        themeName: '🔥 Viêm Trụ — Kyojuro Rengoku',
        masterPersona: 'rengoku',
        aiPersonaMode: 'roleplay',
        dimming: 42,
        fxDensity: 85,
        chibiEnabled: false,
        uiLang: 'ja'
      }), 'utf8');

      const res = await sendMcpBatch(
        process.execPath,
        [NODE_MCP_PATH],
        [{ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'ui://agy-theme/studio.html' } }],
        true,
        {
          AGY_CONFIG_PATH: cfgFile,
          AGY_BACKUP_CONFIG_PATH: path.join(tmp, 'bak.json'),
          AGY_PID_FILE: pidFile,
          AGY_DEVTOOLS_PORT_FILE: path.join(tmp, 'no_port')
        }
      );

      const html = res[0].result.contents[0].text;
      // Gắn trong V8 VM CHƯA gửi bất kỳ postMessage nào từ Host -> kiểm chứng 0ms Pre-Hydration!
      const vmApp = mountStudioHtmlInVm(html);

      assert.equal(vmApp.elementsById.get('themes-grid').children.length, 16, 'Phải dựng ngay 16 nút chủ đề ở 0ms');
      assert.equal(vmApp.elementsById.get('persona-sel').children.length, 18, 'Phải dựng ngay 18 Bản Ngã ở 0ms');
      assert.equal(vmApp.elementsById.get('dimming-val').textContent, '42%');
      assert.equal(vmApp.elementsById.get('fx-val').textContent, '85%');
      assert.equal(vmApp.elementsById.get('chibi-btn').getAttribute('aria-pressed'), 'false');
      assert.equal(vmApp.elementsById.get('ctrl-lbl').textContent, 'クイック操作・化身・AIトーン', 'Ngôn ngữ ja phải dịch ngay từ 0ms');

      const activeBtn = vmApp.elementsById.get('themes-grid').children.find((b) => b.getAttribute('aria-pressed') === 'true');
      assert.ok(activeBtn && activeBtn.textContent.includes('Rengoku'), 'Thẻ Rengoku phải được đánh dấu active');
      assert.equal(vmApp.postedToParent[0].msg.method, 'ui/initialize', 'App phải lập tức gửi ui/initialize lên Host');
      assert.equal(vmApp.postedToParent[0].msg.params.protocolVersion, '2026-01-26');
    });
  });

  describe('Tầng 2 — Trường hợp biên, Bảo mật CSS/XSS, Cầu nối SEP-1865 & Đối xứng Node <-> Rust', () => {
    it('F22-T2-01: Cầu nối SEP-1865 nhận trọn --font-sans > 160 ký tự + color-mix, chặn đứng CSS injection, trả lời ping và từ chối nguồn frame lạ', async () => {
      const tmp = makeTempDir('agy-f22-sec-');
      const res = await sendMcpBatch(
        process.execPath,
        [NODE_MCP_PATH],
        [{ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'ui://agy-theme/studio.html' } }],
        false,
        {
          AGY_CONFIG_PATH: path.join(tmp, 'cfg.json'),
          AGY_BACKUP_CONFIG_PATH: path.join(tmp, 'bak.json'),
          AGY_PID_FILE: path.join(tmp, 'daemon.pid'),
          AGY_DEVTOOLS_PORT_FILE: path.join(tmp, 'no_port')
        }
      );

      const vmApp = mountStudioHtmlInVm(res[0].result.contents[0].text);
      const initReqId = vmApp.postedToParent[0].msg.id;
      const longFontStack = '"Google Sans Flex", "Google Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans CJK JP", "Apple Color Emoji", sans-serif';
      assert.ok(longFontStack.length > 165, 'Chuỗi font kiểm thử phải dài hơn 165 ký tự');

      // 1. Trả lời ui/initialize kèm cả biến hợp lệ dài > 165 ký tự lẫn các payload tấn công CSS
      await vmApp.emitHostMessage({
        jsonrpc: '2.0',
        id: initReqId,
        result: {
          protocolVersion: '2026-01-26',
          hostContext: {
            styles: {
              variables: {
                '--font-sans': longFontStack,
                '--color-background-info': 'color-mix(in srgb, #6a9fcb 15%, transparent)',
                '--evil-url': 'url(https://attacker.invalid/leak)',
                '--evil-semi': '#000; background: red',
                '--evil-brace': '#000 } body { display: none',
                '--evil-backslash': 'rgb(0,0,0)\\',
                '--evil-expr': 'expression(alert(1))',
                'not-a-css-var': '#ffffff'
              }
            }
          }
        }
      });

      assert.equal(vmApp.rootStyleMap.get('--font-sans'), longFontStack, 'Phải chấp nhận --font-sans dài > 160 ký tự');
      assert.equal(vmApp.rootStyleMap.get('--color-background-info'), 'color-mix(in srgb, #6a9fcb 15%, transparent)');
      assert.equal(vmApp.rootStyleMap.has('--evil-url'), false);
      assert.equal(vmApp.rootStyleMap.has('--evil-semi'), false);
      assert.equal(vmApp.rootStyleMap.has('--evil-brace'), false);
      assert.equal(vmApp.rootStyleMap.has('--evil-backslash'), false);
      assert.equal(vmApp.rootStyleMap.has('--evil-expr'), false);
      assert.equal(vmApp.rootStyleMap.has('not-a-css-var'), false);

      // Xác nhận App gửi ui/notifications/initialized rồi gọi open_theme_studio
      assert.equal(vmApp.postedToParent[1].msg.method, 'ui/notifications/initialized');
      assert.equal(vmApp.postedToParent[2].msg.method, 'tools/call');

      // 2. Host gửi ping -> App phải trả lời pong
      await vmApp.emitHostMessage({ jsonrpc: '2.0', id: 777, method: 'ping', params: {} });
      const pong = vmApp.postedToParent.find((x) => x.msg && x.msg.id === 777);
      assert.ok(pong, 'App phải phản hồi gói tin JSON-RPC ping từ Host');
      assert.equal(JSON.stringify(pong.msg.result), '{}');

      // 3. Nguồn frame lạ (cross-iframe giả mạo) gửi tool-result -> phải bị chặn hoàn toàn
      const spoofSource = { spoofed: true };
      await vmApp.emitHostMessage({
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: {
          structuredContent: {
            cdp: { cdpHealthy: true, daemonPid: 99999 },
            activeConfig: { themeName: 'SPOOFED', uiLang: 'en' },
            themes: [{ name: 'ONLY_ONE_SPOOF', concept: '', primary: '#000' }],
            personas: []
          }
        }
      }, spoofSource);
      assert.equal(vmApp.elementsById.get('themes-grid').children.length, 16, 'Không được nhận tool-result từ nguồn frame lạ');

      // 4. Nguồn window.top hợp lệ gửi tool-result -> cập nhật chuẩn xác
      await vmApp.emitHostMessage({
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: {
          structuredContent: {
            cdp: { cdpHealthy: true, daemonPid: 4242 },
            activeConfig: { themeName: 'Midnight Obsidian', uiLang: 'en', dimming: 55, fxDensity: 40, chibiEnabled: true },
            themes: [{ name: 'Midnight Obsidian', concept: 'Clean', primary: '#a78bfa' }],
            personas: [{ id: 'yoriichi', label: 'Architect' }]
          }
        }
      }, vmApp.topWin);
      assert.equal(vmApp.elementsById.get('cdp-badge').textContent, 'CDP Live • PID 4242');
      assert.equal(vmApp.elementsById.get('themes-grid').children.length, 1);
    });

    it('F22-T2-02: Chặn triệt để XSS thoát thẻ </script> khi tên chủ đề rèn chứa mã độc trong INITIAL_STATE', async () => {
      const tmp = makeTempDir('agy-f22-xss-');
      const cfgFile = path.join(tmp, 'cfg.json');
      const xssPayload = '</script><script>window.__XSS_PWNED__ = true;</script>';
      fs.writeFileSync(cfgFile, JSON.stringify({
        themeName: xssPayload,
        activeForgedTheme: { name: xssPayload, primary: '#ff00aa' },
        activeWorkspace: '</script><img src=x onerror=alert(1)>'
      }), 'utf8');

      const res = await sendMcpBatch(
        process.execPath,
        [NODE_MCP_PATH],
        [{ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'ui://agy-theme/studio.html' } }],
        false,
        {
          AGY_CONFIG_PATH: cfgFile,
          AGY_BACKUP_CONFIG_PATH: path.join(tmp, 'bak.json'),
          AGY_PID_FILE: path.join(tmp, 'daemon.pid'),
          AGY_DEVTOOLS_PORT_FILE: path.join(tmp, 'no_port')
        }
      );

      const html = res[0].result.contents[0].text;
      assert.equal(html.includes('</script><script>'), false, 'Không được xuất chuỗi </script> thô ra HTML');
      const vmApp = mountStudioHtmlInVm(html);
      assert.equal(vmApp.ctx.window.__XSS_PWNED__, undefined, 'Mã độc XSS tuyệt đối không được thực thi');
    });

    it('F22-T2-03: Đối xứng 100% giữa Node MCP Server và Rust MCP Server (agy-theme mcp-server) trên mọi công cụ và HTML Studio', async (t) => {
      if (!fs.existsSync(RUST_BIN_PATH)) {
        t.skip('Chưa biên dịch bản release Rust agy-theme để đối chiếu parity');
        return;
      }

      const runScenario = async (cmd, args) => {
        const tmp = makeTempDir('agy-f22-par-');
        const env = {
          AGY_CONFIG_PATH: path.join(tmp, 'cfg.json'),
          AGY_BACKUP_CONFIG_PATH: path.join(tmp, 'bak.json'),
          AGY_PID_FILE: path.join(tmp, 'daemon.pid'),
          AGY_DEVTOOLS_PORT_FILE: path.join(tmp, 'no_port')
        };
        return sendMcpBatch(
          cmd,
          args,
          [
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-01-26' } },
            { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'ui://agy-theme/studio.html' } },
            { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'switch_theme', arguments: { themeQuery: 'giyu', dimming: 50, fxDensity: 75, chibiEnabled: false, uiLang: 'en' } } },
            { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'bind_workspace_profile', arguments: { action: 'bind', workspace: 'payments-api', themeQuery: 'shinobu', personaQuery: 'shinobu' } } },
            { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'bind_workspace_profile', arguments: { action: 'apply', workspace: 'payments-api' } } },
            { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'bind_workspace_profile', arguments: { action: 'remove', workspace: 'payments-api' } } }
          ],
          true,
          env
        );
      };

      const nodeRes = await runScenario(process.execPath, [NODE_MCP_PATH]);
      const rustRes = await runScenario(RUST_BIN_PATH, ['mcp-server']);

      assert.deepEqual(rustRes[0], nodeRes[0], 'Phản hồi initialize 2026-01-26 phải trùng khớp 100%');
      assert.equal(rustRes[1].result.contents[0].text, nodeRes[1].result.contents[0].text, 'HTML Studio xuất từ Rust và Node phải trùng khớp từng byte 100%');
      assert.deepEqual(rustRes[2].result, nodeRes[2].result, 'Kết quả switch_theme phải trùng khớp 100%');
      assert.deepEqual(rustRes[3].result, nodeRes[3].result, 'Kết quả bind_workspace_profile(bind) kèm studio phải trùng khớp 100%');
      assert.deepEqual(rustRes[4].result, nodeRes[4].result, 'Kết quả bind_workspace_profile(apply) kèm studio phải trùng khớp 100%');
      assert.deepEqual(rustRes[5].result, nodeRes[5].result, 'Kết quả bind_workspace_profile(remove) kèm studio phải trùng khớp 100%');
    });

    it('F22-T2-04: Chống Subagent ghi đè activeWorkspace, ưu tiên liveWorkspace từ tiêu đề cửa sổ CDP và tự cập nhật ô #ws-input khi đổi tab dự án', async () => {
      const { execFileSync } = require('node:child_process');
      const tmp = makeTempDir('agy-f22-ws-sync-');
      const cfgFile = path.join(tmp, 'cfg.json');
      const bakFile = path.join(tmp, 'bak.json');
      const pidFile = path.join(tmp, 'daemon.pid');
      const portFile = path.join(tmp, 'DevToolsActivePort');

      fs.writeFileSync(pidFile, String(process.pid), 'utf8');
      fs.writeFileSync(cfgFile, JSON.stringify({
        themeName: '🎋 Nezuko Kamado — Hồng Liên',
        activeWorkspace: 'mod',
        workspaceProfiles: {
          'other-proj': {
            themeName: '🌊 Thủy Trụ — Giyu Tomioka',
            bubbleName: '🌊 Thủy Trụ — Giyu Tomioka',
            masterPersona: 'giyu',
            dimming: 40,
            fxDensity: 90,
            chibiEnabled: true
          }
        }
      }, null, 2), 'utf8');

      // 1. Tạo thư mục giả lập Subagent (.system_generated/messages/m1.json)
      const subBrain = path.join(tmp, 'sub_brain', '.system_generated');
      fs.mkdirSync(path.join(subBrain, 'logs'), { recursive: true });
      fs.mkdirSync(path.join(subBrain, 'messages'), { recursive: true });
      fs.writeFileSync(path.join(subBrain, 'messages', 'msg_parent.json'), '{"sender":"parent"}', 'utf8');
      const subTranscript = path.join(subBrain, 'logs', 'transcript.jsonl');
      fs.writeFileSync(subTranscript, '', 'utf8');

      const subHookPayload = JSON.stringify({
        conversationId: '00000000-0000-4000-8000-000000000088',
        transcriptPath: subTranscript,
        workspacePaths: ['file:///workspace/other-proj'],
        hookEventName: 'SessionStart'
      });

      const hookEnv = {
        ...process.env,
        AGY_CONFIG_PATH: cfgFile,
        AGY_BACKUP_CONFIG_PATH: bakFile,
        AGY_PID_FILE: pidFile,
        AGY_SKIP_DAEMON_SPAWN: '1'
      };

      execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'session_start_hook.js')], {
        cwd: REPO_ROOT,
        input: subHookPayload,
        env: hookEnv,
        windowsHide: true
      });
      assert.equal(JSON.parse(fs.readFileSync(cfgFile, 'utf8')).activeWorkspace, 'mod', 'Node SessionStart không được để Subagent ghi đè activeWorkspace');

      if (fs.existsSync(RUST_BIN_PATH)) {
        execFileSync(RUST_BIN_PATH, ['session-start-hook'], {
          cwd: REPO_ROOT,
          input: subHookPayload,
          env: hookEnv,
          windowsHide: true
        });
        assert.equal(JSON.parse(fs.readFileSync(cfgFile, 'utf8')).activeWorkspace, 'mod', 'Rust SessionStart không được để Subagent ghi đè activeWorkspace');
      }

      // 2. Giả sử file config cũ đang bị lệch thành "1_youtube_1", nhưng cửa sổ CDP thật đang mở dự án "mod"
      fs.writeFileSync(cfgFile, JSON.stringify({
        themeName: '🎋 Nezuko Kamado — Hồng Liên',
        activeWorkspace: '1_youtube_1'
      }, null, 2), 'utf8');

      const mockCdp = http.createServer((_, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          { id: 'blank-1', type: 'page', title: 'Launchpad - Antigravity', url: 'https://127.0.0.1:50000/launchpad' },
          { id: 'main-mod', type: 'page', title: 'Rust Anything Repo Installation And Rewrite - mod - Antigravity', url: 'https://127.0.0.1:50000/c/123' }
        ]));
      });
      await new Promise((r) => mockCdp.listen(0, '127.0.0.1', r));
      fs.writeFileSync(portFile, `${mockCdp.address().port}\n/devtools/browser/x\n`, 'utf8');

      try {
        const mcpEnv = {
          AGY_CONFIG_PATH: cfgFile,
          AGY_BACKUP_CONFIG_PATH: bakFile,
          AGY_PID_FILE: pidFile,
          AGY_DEVTOOLS_PORT_FILE: portFile
        };
        const nodeStudio = await sendMcpBatch(
          process.execPath,
          [NODE_MCP_PATH],
          [
            { jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'ui://agy-theme/studio.html' } },
            { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'open_theme_studio', arguments: {} } }
          ],
          false,
          mcpEnv
        );
        assert.equal(nodeStudio[1].result.structuredContent.cdp.liveWorkspace, 'mod');
        assert.equal(nodeStudio[1].result.structuredContent.activeConfig.activeWorkspace, 'mod');

        if (fs.existsSync(RUST_BIN_PATH)) {
          const rustStudio = await sendMcpBatch(
            RUST_BIN_PATH,
            ['mcp-server'],
            [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'open_theme_studio', arguments: {} } }],
            false,
            mcpEnv
          );
          assert.equal(rustStudio[0].result.structuredContent.cdp.liveWorkspace, 'mod');
          assert.equal(rustStudio[0].result.structuredContent.activeConfig.activeWorkspace, 'mod');
        }

        // 3. Kiểm chứng DOM #ws-input tự động nhảy từ "1_youtube_1" sang "mod" khi chuyển tab dự án, nhưng tôn trọng khi người dùng tự gõ tay
        const vmApp = mountStudioHtmlInVm(nodeStudio[0].result.contents[0].text);
        const wsIn = vmApp.elementsById.get('ws-input');
        assert.equal(wsIn.value, 'mod');

        await vmApp.emitHostMessage({
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: {
            structuredContent: {
              cdp: { cdpHealthy: true, daemonPid: 12084, liveWorkspace: '1_youtube_1' },
              activeConfig: { themeName: '🎋 Nezuko Kamado — Hồng Liên', activeWorkspace: '1_youtube_1', uiLang: 'vi' },
              themes: [],
              personas: []
            }
          }
        });
        assert.equal(wsIn.value, '1_youtube_1', 'Ô #ws-input phải tự đồng bộ khi chuyển sang dự án 1_youtube_1');

        await vmApp.emitHostMessage({
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: {
            structuredContent: {
              cdp: { cdpHealthy: true, daemonPid: 12084, liveWorkspace: 'mod' },
              activeConfig: { themeName: '🎋 Nezuko Kamado — Hồng Liên', activeWorkspace: 'mod', uiLang: 'vi' },
              themes: [],
              personas: []
            }
          }
        });
        assert.equal(wsIn.value, 'mod', 'Ô #ws-input phải lập tức đổi về mod khi quay lại dự án mod');

        // Người dùng chủ động gõ tay tên dự án tùy chỉnh -> render nền không được ghi đè mất chữ đang gõ
        wsIn.value = 'my-custom-draft';
        await wsIn.dispatch('input');
        await vmApp.emitHostMessage({
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: {
            structuredContent: {
              cdp: { cdpHealthy: true, daemonPid: 12084, liveWorkspace: '1_youtube_1' },
              activeConfig: { themeName: '🎋 Nezuko Kamado — Hồng Liên', activeWorkspace: '1_youtube_1', uiLang: 'vi' },
              themes: [],
              personas: []
            }
          }
        });
        assert.equal(wsIn.value, 'my-custom-draft', 'Không được xóa nội dung người dùng đang tự gõ tay');
      } finally {
        mockCdp.close();
      }
    });
  });

  describe('Tầng 3 — Kiểm thử E2E Trình duyệt Thật qua CDP (Cross-Origin Isolated Sandbox Iframe + CSP)', () => {
    it('F22-T3-01: Chạy trình duyệt Chromium thật nạp Cross-Origin Iframe với CSP nghiêm ngặt và thao tác Click/Slider đầu-cuối đạt 0 ngoại lệ trên cả Node & Rust', async (t) => {
      const chromeBin = findLocalChromiumBinary();
      if (!chromeBin) {
        t.skip('Không tìm thấy trình duyệt Chromium/Edge cục bộ cho kiểm thử Tầng 3');
        return;
      }

      // 1. E2E trên Node MCP Server
      const nodeOut = await runRealBrowserE2eForBackend(chromeBin, process.execPath, [NODE_MCP_PATH], makeTempDir('agy-f22-e2e-node-'));
      assert.deepEqual(nodeOut.exceptions, [], `Phát hiện lỗi JS runtime trên Node Studio: ${nodeOut.exceptions.join('; ')}`);
      assert.equal(nodeOut.ui.initSnap.gridCount, 16);
      assert.equal(nodeOut.ui.initSnap.personaCount, 18);
      assert.ok(nodeOut.ui.initSnap.badge.includes('CDP Live • PID'));
      assert.ok(nodeOut.ui.initSnap.fontVarLen > 140, 'Biến --font-sans của Host phải được nạp vào iframe thật');
      assert.equal(nodeOut.ui.enHeader, 'Quick Controls, Persona & AI Tone');
      assert.ok(nodeOut.ui.activeCard.includes('Shinobu'));
      assert.equal(nodeOut.ui.dimLabel, '48%');
      assert.equal(nodeOut.ui.fxLabel, '65%');
      assert.equal(nodeOut.ui.wsChipCount, 1);
      assert.equal(nodeOut.savedCfg.themeName, '🦋 Trùng Trụ — Shinobu Kocho');
      assert.equal(nodeOut.savedCfg.masterPersona, 'six_eyes');
      assert.equal(nodeOut.savedCfg.dimming, 48);
      assert.equal(nodeOut.savedCfg.fxDensity, 65);
      assert.equal(nodeOut.savedCfg.uiLang, 'en');
      assert.ok(nodeOut.savedCfg.workspaceProfiles['billing-svc']);

      // 2. E2E trên Rust MCP Server (nếu đã build binary)
      if (fs.existsSync(RUST_BIN_PATH)) {
        const rustOut = await runRealBrowserE2eForBackend(chromeBin, RUST_BIN_PATH, ['mcp-server'], makeTempDir('agy-f22-e2e-rust-'));
        assert.deepEqual(rustOut.exceptions, [], `Phát hiện lỗi JS runtime trên Rust Studio: ${rustOut.exceptions.join('; ')}`);
        assert.equal(rustOut.ui.initSnap.gridCount, 16);
        assert.equal(rustOut.ui.initSnap.personaCount, 18);
        assert.ok(rustOut.ui.activeCard.includes('Shinobu'));
        assert.equal(rustOut.savedCfg.themeName, '🦋 Trùng Trụ — Shinobu Kocho');
        assert.equal(rustOut.savedCfg.masterPersona, 'six_eyes');
        assert.equal(rustOut.savedCfg.dimming, 48);
        assert.equal(rustOut.savedCfg.fxDensity, 65);
      }
    });
  });
});
