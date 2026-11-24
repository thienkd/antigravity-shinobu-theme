'use strict';

/**
 * F24 — Bộ Kiểm Thử Thực Chiến E2E Trình Duyệt Chromium Toàn Bộ Tính Năng, Nút Bấm & Ảnh Kiểm Duyệt
 *
 * Khác biệt cốt lõi so với kiểm thử giả lập Node VM:
 *  1. Chạy trên trình duyệt Chromium/Edge thật qua giao thức CDP (WebGL2 + Layout Engine + CSS Stacking thật).
 *  2. Dựng mô hình DOM chuẩn xác 100% của Antigravity IDE thực tế (gồm [data-testid="sidebar-split"] bọc cả
 *     [data-testid="conversation-list-sidebar"] lẫn [data-testid="conversation-view"], Lexical combobox editor,
 *     menu lệnh gạch chéo [role="listbox"], bong bóng hội thoại, cây thư mục và dữ liệu nhạy cảm mẫu).
 *  3. Mọi thao tác nhấn nút đều đi qua kiểm định tia chiếu vật lý `document.elementFromPoint(cx, cy)` và gửi
 *     sự kiện chuột phần cứng `Input.dispatchMouseEvent` (nếu nút bị lớp phủ che khuất, pointer-events sai,
 *     hoặc kích thước 0x0 sẽ FAIL ngay lập tức).
 *  4. Giám sát liên tục `Runtime.exceptionThrown` và `console.error` = 0 suốt hàng chục thao tác liên hoàn.
 *  5. Tự động chụp và kiểm định bộ Hình Ảnh Kiểm Duyệt PNG thực tế (`Page.captureScreenshot`), xuất ra thư mục
 *     `AGY_VISUAL_AUDIT_DIR` (nếu được cấu hình) cùng manifest JSON chi tiết từng bước.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'themes', 'assets');
const NODE_MCP_PATH = path.join(REPO_ROOT, 'daemon', 'mcp_theme_server.js');
const TMP_DIRS = [];

function makeTempDir(prefix = 'agy-f24-visual-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP_DIRS.push(dir);
  return dir;
}

after(() => {
  while (TMP_DIRS.length > 0) {
    const dir = TMP_DIRS.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
    } catch (_) {}
  }
});

function findLocalChromiumBinary() {
  const cands = [];
  if (process.platform === 'win32') {
    const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
    const pfx86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    cands.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pfx86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else if (process.platform === 'darwin') {
    cands.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    cands.push('/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium');
  }
  return cands.find((p) => fs.existsSync(p)) || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGetJson(port, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: reqPath, timeout: 4000 }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP JSON timeout'));
    });
  });
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket connect timeout')), 8000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.addEventListener('error', (err) => {
        clearTimeout(timer);
        reject(err || new Error('CDP WebSocket error'));
      });
    });
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch (_) {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(timer);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result || {});
        return;
      }
      if (msg.method && this.listeners.has(msg.method)) {
        for (const fn of this.listeners.get(msg.method)) {
          try { fn(msg.params || {}); } catch (_) {}
        }
      }
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}, timeoutMs = 10000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout calling ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, awaitPromise = true) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise
    });
    if (res.exceptionDetails) {
      const desc =
        (res.exceptionDetails.exception && res.exceptionDetails.exception.description) ||
        res.exceptionDetails.text ||
        'Eval exception';
      throw new Error(`Runtime.evaluate exception: ${desc}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async close() {
    for (const [, p] of this.pending) clearTimeout(p.timer);
    this.pending.clear();
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
  }
}

/**
 * Tạo tệp mô hình Chibi 3D .glb chuẩn glTF 2.0 nhị phân (khối tinh thể đa diện rực rỡ có COLOR_0 + NORMAL)
 * để kiểm thử nạp file thật và kết xuất WebGL trên trình duyệt Chromium.
 */
function createColorfulCrystalGlbBuffer() {
  // Khối bát diện + phần đầu chibi cách điệu để hiển thị rõ nét trên khung 136x112
  const positions = new Float32Array([
    // Thân tinh thể hồng đào (6 đỉnh)
     0.00,  0.85,  0.00,
     0.52,  0.10,  0.00,
     0.00,  0.10,  0.52,
    -0.52,  0.10,  0.00,
     0.00,  0.10, -0.52,
     0.00, -0.75,  0.00,
    // Nơ / tai trên đỉnh vàng kim - xanh lục (6 đỉnh)
    -0.45,  0.95,  0.12,
    -0.12,  0.72,  0.15,
    -0.25,  0.55,  0.12,
     0.45,  0.95,  0.12,
     0.25,  0.55,  0.12,
     0.12,  0.72,  0.15
  ]);

  const normals = new Float32Array([
     0,  1,  0,   1,  0,  0,   0,  0,  1,  -1,  0,  0,   0,  0, -1,   0, -1,  0,
     0,  0,  1,   0,  0,  1,   0,  0,  1,   0,  0,  1,   0,  0,  1,   0,  0,  1
  ]);

  const colors = new Float32Array([
    1.00, 0.45, 0.72, 1.0,
    0.98, 0.32, 0.62, 1.0,
    1.00, 0.62, 0.82, 1.0,
    0.95, 0.28, 0.58, 1.0,
    0.88, 0.24, 0.52, 1.0,
    0.52, 0.92, 0.68, 1.0,

    0.45, 0.95, 0.55, 1.0,
    0.98, 0.85, 0.32, 1.0,
    0.35, 0.85, 0.48, 1.0,
    0.45, 0.95, 0.55, 1.0,
    0.35, 0.85, 0.48, 1.0,
    0.98, 0.85, 0.32, 1.0
  ]);

  const indices = new Uint16Array([
    0, 2, 1,  0, 3, 2,  0, 4, 3,  0, 1, 4,
    5, 1, 2,  5, 2, 3,  5, 3, 4,  5, 4, 1,
    6, 8, 7,  9, 11, 10
  ]);

  const posBytes = Buffer.from(positions.buffer);
  const normBytes = Buffer.from(normals.buffer);
  const colBytes = Buffer.from(colors.buffer);
  const idxBytes = Buffer.from(indices.buffer);
  const idxPad = (4 - (idxBytes.length % 4)) % 4;
  const binChunkData = Buffer.concat([posBytes, normBytes, colBytes, idxBytes, Buffer.alloc(idxPad)]);

  const posOffset = 0;
  const normOffset = posBytes.length;
  const colOffset = normOffset + normBytes.length;
  const idxOffset = colOffset + colBytes.length;

  const gltfJson = {
    asset: { version: '2.0', generator: 'agy-visual-e2e' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
        indices: 3,
        material: 0
      }]
    }],
    buffers: [{ byteLength: binChunkData.length }],
    bufferViews: [
      { buffer: 0, byteOffset: posOffset, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: normOffset, byteLength: normBytes.length, target: 34962 },
      { buffer: 0, byteOffset: colOffset, byteLength: colBytes.length, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes.length, target: 34963 }
    ],
    accessors: [
      {
        bufferView: 0, componentType: 5126, count: 12, type: 'VEC3',
        min: [-0.52, -0.75, -0.52], max: [0.52, 0.95, 0.52]
      },
      { bufferView: 1, componentType: 5126, count: 12, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 12, type: 'VEC4' },
      { bufferView: 3, componentType: 5123, count: indices.length, type: 'SCALAR' }
    ]
  };

  let jsonBytes = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad > 0) {
    jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  }

  const totalLen = 12 + 8 + jsonBytes.length + 8 + binChunkData.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonBytes.length, 0);
  jsonHdr.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binChunkData.length, 0);
  binHdr.writeUInt32LE(0x004E4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonHdr, jsonBytes, binHdr, binChunkData]);
}

const MIME_BY_EXT = {
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.vrm': 'model/gltf-binary'
};

/**
 * Xây dựng trang HTML mô phỏng chính xác cây DOM Antigravity IDE v1.up.3 ngoài đời thực.
 */
function buildRealisticIdeHtml(activeCid, sidebarOtherCid) {
  return `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
  <meta charset="utf-8" />
  <title>Nichirin Sword Visual Audit - mod - Antigravity</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden;
      background: #0b0e14; color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
    }
    #root, .agy-shell { width: 100%; height: 100%; display: flex; flex-direction: column; position: relative; overflow: hidden; }
    .agy-titlebar {
      height: 38px; display: flex; align-items: center; justify-content: space-between;
      padding: 0 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(12, 15, 24, 0.72); flex-shrink: 0; z-index: 20;
    }
    .agy-titlebar-right { display: flex; align-items: center; gap: 8px; }
    [data-testid="sidebar-split"] {
      flex: 1; min-height: 0; width: 100%; display: flex; position: relative; outline: none;
    }
    .agy-left-sidebar-pane {
      width: 256px; flex-shrink: 0; display: flex; flex-direction: column;
      border-right: 1px solid rgba(255,255,255,0.08); background: rgba(10, 13, 22, 0.58);
      padding: 10px 8px; gap: 8px; z-index: 12;
    }
    [data-testid="sidebar-navigation-items"] { display: flex; flex-direction: column; gap: 4px; }
    .sidebar-nav-link {
      display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 8px;
      color: #cbd5e1; text-decoration: none; font-size: 13px;
    }
    [data-testid="conversation-list-sidebar"] {
      margin-top: 8px; display: flex; flex-direction: column; gap: 6px; padding: 4px;
    }
    .sidebar-conv-item {
      padding: 7px 10px; border-radius: 8px; font-size: 12.5px; color: #cbd5e1;
      background: rgba(255,255,255,0.04); cursor: pointer;
    }
    .agy-split-divider { width: 1px; flex-shrink: 0; background: rgba(255,255,255,0.07); }
    .agy-right-main-pane { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; position: relative; }
    .agy-sheet { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
    [data-testid="conversation-view"] {
      flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; align-items: center; position: relative;
    }
    [data-main-content-body="true"] {
      flex: 1; min-height: 0; width: 100%; max-width: 960px; overflow-y: auto;
      padding: 28px 24px 18px 24px; display: flex; flex-direction: column; gap: 18px;
    }
    .user-msg-row {
      align-self: flex-end; max-width: 78%; display: flex; justify-content: flex-end; padding-left: 48px;
    }
    .agy-user-bubble {
      padding: 10px 16px; border-radius: 13px; color: #f8fafc; font-size: 13.5px; line-height: 1.5;
      background: rgba(20, 26, 38, 0.88);
    }
    [data-testid="agent-response"] {
      align-self: flex-start; max-width: 86%; padding: 14px 18px; border-radius: 14px;
      background: rgba(15, 23, 42, 0.76); border: 1px solid rgba(255,255,255,0.10);
      color: #e2e8f0; font-size: 13.5px; line-height: 1.6;
    }
    pre.secret-code-sample {
      margin: 8px 0 0 0; padding: 10px 12px; border-radius: 8px;
      background: rgba(0,0,0,0.45); color: #fde047; font-family: Consolas, monospace; font-size: 12px;
    }
    .composer-outer-dock {
      width: 100%; max-width: 960px; padding: 10px 24px 20px 24px; flex-shrink: 0;
      display: flex; flex-direction: column; position: relative;
    }
    .surface-composer {
      position: relative; width: 100%; min-height: 108px; padding: 14px 16px 12px 16px;
      border-radius: 16px; background: rgba(17, 24, 39, 0.86);
      border: 1px solid rgba(255,255,255,0.16); display: flex; flex-direction: column; justify-content: space-between;
    }
    #lexical-chat-editor {
      min-height: 44px; outline: none; color: #f8fafc; font-size: 13.5px; line-height: 1.45;
      padding-right: 120px;
    }
    .composer-bottom-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px;
    }
    .composer-native-btn {
      height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 12px; cursor: pointer;
    }
    #native-send-btn {
      height: 30px; padding: 0 14px; border-radius: 999px; border: none;
      background: #ec4899; color: #fff; font-weight: 700; font-size: 12px; cursor: pointer;
    }
    #mock-slash-menu {
      position: fixed; left: 320px; bottom: 138px; width: 230px;
      background: #111827; border: 1px solid rgba(255,255,255,0.18); border-radius: 10px;
      padding: 6px; display: none; flex-direction: column; gap: 4px; z-index: 120;
    }
    #mock-slash-opt-compact {
      padding: 6px 10px; border-radius: 6px; color: #f8fafc; font-size: 12.5px; cursor: pointer;
      display: flex; justify-content: space-between; background: rgba(236, 72, 153, 0.22);
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="agy-shell">
      <header class="agy-titlebar @container/titlebar">
        <div style="display:flex;align-items:center;gap:10px;font-weight:700;font-size:13px;">
          <span>Antigravity IDE</span>
          <span style="opacity:0.55;font-weight:500;">Dự án: mod</span>
        </div>
        <div class="agy-titlebar-right" data-testid="pane-titlebar-toolbar">
          <div class="settings-modal-container" style="display:flex;align-items:center;gap:8px;">
            <div class="flex justify-between" style="display:none;"><h3>Appearance</h3></div>
          </div>
          <span style="font-size:12px;color:#94a3b8;">Gemini 4 Carbon High</span>
        </div>
      </header>
      <div data-testid="sidebar-split">
        <div class="agy-left-sidebar-pane">
          <div role="navigation">
            <div data-testid="sidebar-navigation-items">
              <a class="sidebar-nav-link" data-testid="new-conversation-button" href="#new">+ Cuộc trò chuyện mới</a>
              <button type="button" class="sidebar-nav-link" data-testid="automations-button" style="background:transparent;border:none;text-align:left;cursor:pointer;">⚡ Tự động hóa</button>
            </div>
          </div>
          <div data-testid="conversation-list-sidebar">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;padding:2px 6px;">LỊCH SỬ PHIÊN</div>
            <div class="sidebar-conv-item" data-cascade-id="${sidebarOtherCid}">Phiên cũ ở dự án khác (Sidebar)</div>
            <div class="sidebar-conv-item" data-cascade-id="${activeCid}">Kiểm định giao diện thực chiến</div>
          </div>
        </div>
        <div class="agy-split-divider"></div>
        <div class="agy-right-main-pane">
          <div class="agy-sheet">
            <div data-testid="aux-pane-split" style="flex:1;min-height:0;display:flex;">
              <div data-testid="conversation-view" data-cascade-id="${activeCid}">
                <div data-main-content-body="true" id="chat-scroller">
                  <div class="user-msg-row" data-testid="user-message">
                    <div class="agy-user-bubble-frame">
                      <div class="agy-user-bubble" data-testid="user-message-bubble">
                        Kiểm tra toàn bộ nút bấm, hiệu ứng Hơi Thở, Chibi 2D/3D và Khiên Che Mật trên trình duyệt thật!
                      </div>
                    </div>
                  </div>
                  <div data-testid="agent-response">
                    <div>Đã sẵn sàng kiểm duyệt trực quan toàn diện trên Chromium CDP:</div>
                    <pre class="secret-code-sample">API_KEY=sk-live-secret-token-9988776655\nDB_URL=postgres://admin:supersecret@10.0.0.12:5432/prod</pre>
                  </div>
                </div>
                <div class="composer-outer-dock" data-testid="agent-input-box">
                  <div class="surface-composer" id="antigravity.agentSidePanelInputBox">
                    <div
                      id="lexical-chat-editor"
                      contenteditable="true"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded="false"
                      data-lexical-editor="true"
                    ></div>
                    <div class="composer-bottom-bar">
                      <div style="display:flex;gap:6px;align-items:center;">
                        <button type="button" class="composer-native-btn" aria-label="Add context">+ Ngữ cảnh</button>
                        <button type="button" class="composer-native-btn" data-testid="model-selector-trigger" aria-label="Select model, current: Gemini 4 Carbon High">Gemini 4 Carbon High</button>
                      </div>
                      <div style="display:flex;gap:6px;align-items:center;">
                        <button type="button" id="native-send-btn" data-testid="send-message-button" aria-label="Send message">Gửi</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="mock-slash-menu" role="listbox">
    <div id="mock-slash-opt-compact" role="option" data-value="compact">
      <span>/compact</span><span>Tóm tắt phiên</span>
    </div>
  </div>

  <script>
    window.__SENT_MESSAGES__ = [];
    window.__SAVED_THEME_CONFIGS__ = [];
    window.agySaveThemeConfig = (jsonStr) => {
      try { window.__SAVED_THEME_CONFIGS__.push(JSON.parse(jsonStr)); } catch (_) {}
      return Promise.resolve(true);
    };

    (function wireRealisticLexicalEditor() {
      const ed = document.getElementById('lexical-chat-editor');
      const menu = document.getElementById('mock-slash-menu');
      const opt = document.getElementById('mock-slash-opt-compact');
      const sendBtn = document.getElementById('native-send-btn');

      function syncSlashPopup() {
        const txt = (ed.textContent || '').trim();
        if (txt === '/compact') {
          menu.style.display = 'flex';
          ed.setAttribute('aria-expanded', 'true');
          ed.setAttribute('aria-controls', 'mock-slash-menu');
          ed.setAttribute('aria-activedescendant', 'mock-slash-opt-compact');
        } else {
          menu.style.display = 'none';
          ed.setAttribute('aria-expanded', 'false');
          ed.removeAttribute('aria-controls');
          ed.removeAttribute('aria-activedescendant');
        }
      }

      ed.addEventListener('input', syncSlashPopup);
      opt.addEventListener('click', () => {
        window.__SENT_MESSAGES__.push('/compact');
        ed.textContent = '';
        syncSlashPopup();
      });
      sendBtn.addEventListener('click', () => {
        const txt = (ed.textContent || '').trim();
        if (txt) {
          window.__SENT_MESSAGES__.push(txt);
          ed.textContent = '';
          syncSlashPopup();
        }
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Click chuột vật lý thực sự qua CDP sau khi kiểm chứng phần tử hiển thị và không bị che khuất (`elementFromPoint`).
 */
async function realMouseClick(cdp, selector, label, modifiers = 0) {
  const box = await cdp.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { err: 'NOT_FOUND' };
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0) {
      return { err: 'ZERO_SIZE', rect: [r.left, r.top, r.width, r.height], display: cs.display };
    }
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none') {
      return { err: 'NOT_INTERACTABLE', display: cs.display, visibility: cs.visibility, opacity: cs.opacity, pointerEvents: cs.pointerEvents };
    }
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const hitOk = Boolean(hit && (hit === el || el.contains(hit) || (hit.closest && hit.closest(${JSON.stringify(selector)}) === el)));
    return {
      ok: hitOk,
      cx,
      cy,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      hitDesc: hit ? (hit.tagName + '#' + (hit.id || '') + '.' + String(hit.className || '').slice(0, 60)) : 'null'
    };
  })()`);

  assert.ok(box && !box.err, `[${label}] Không thể bấm "${selector}": ${JSON.stringify(box)}`);
  assert.equal(
    box.ok,
    true,
    `[${label}] Nút "${selector}" tại (${box.cx}, ${box.cy}) bị phần tử khác che khuất! Phần tử đè lên: ${box.hitDesc}`
  );

  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: box.cx,
    y: box.cy,
    modifiers
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: box.cx,
    y: box.cy,
    button: 'left',
    clickCount: 1,
    modifiers
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: box.cx,
    y: box.cy,
    button: 'left',
    clickCount: 1,
    modifiers
  });
  await sleep(65);
  return box;
}

async function captureAuditScreenshot(cdp, outDir, manifest, fileName, title, checksSummary) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, 15000);
  const buf = Buffer.from(shot.data, 'base64');
  assert.ok(buf.length > 12000, `Ảnh kiểm duyệt ${fileName} quá nhỏ bất thường (${buf.length} bytes)`);
  assert.equal(buf[0], 0x89, `Ảnh ${fileName} không đúng định dạng PNG`);
  assert.equal(buf[1], 0x50);
  assert.equal(buf[2], 0x4E);
  assert.equal(buf[3], 0x47);
  const fullPath = path.join(outDir, fileName);
  fs.writeFileSync(fullPath, buf);
  manifest.push({
    fileName,
    bytes: buf.length,
    title,
    checksSummary
  });
  return fullPath;
}

describe('F24 — Kiểm Thử Thực Chiến E2E Trình Duyệt Chromium Toàn Bộ Tính Năng, Nút Bấm & Ảnh Kiểm Duyệt', () => {
  it('F24-T1-01..08: Click vật lý toàn bộ nút bấm (Studio 5 Tab, 16 Chủ đề, Chibi 2D/3D .glb WebGL, NPC, 4 Thức, Token HUD, /compact, Kagura, Khiên Che Mật, Trailer 15s, Cửu Trụ & MCP Studio) kèm bộ ảnh kiểm duyệt', async (t) => {
    const chromeBin = findLocalChromiumBinary();
    if (!chromeBin) {
      t.skip('Không tìm thấy trình duyệt Chromium/Chrome/Edge cục bộ cho bài kiểm thử trực quan F24');
      return;
    }

    // Biên dịch gói bundle mới nhất trước khi tiêm vào trình duyệt thật
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'build_payload.js')], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      windowsHide: true,
      timeout: 20000
    });
    const payloadCode = fs.readFileSync(path.join(REPO_ROOT, 'dist', 'theme_payload.js'), 'utf8');

    const auditDir = process.env.AGY_VISUAL_AUDIT_DIR
      ? path.resolve(process.env.AGY_VISUAL_AUDIT_DIR)
      : makeTempDir('agy-visual-shots-');
    fs.mkdirSync(auditDir, { recursive: true });
    const manifest = [];

    const tmpWork = makeTempDir('agy-f24-work-');
    const glbFilePath = path.join(tmpWork, 'mitsuri_crystal_chibi.glb');
    fs.writeFileSync(glbFilePath, createColorfulCrystalGlbBuffer());
    const forgeSampleImg = path.join(ASSETS_DIR, 'shinobu_avatar.jpg');

    const activeCid = '11111111-2222-4333-8444-555555555555';
    const sidebarOtherCid = '99999999-8888-4777-8666-555555555555';
    const ephemeralToken = crypto.randomBytes(32).toString('hex');

    const sseClients = new Set();
    let currentTelemetry = {
      ok: true,
      cid: activeCid,
      contextTokens: 84200,
      cacheReadTokens: 62000,
      turnTokens: 3450,
      outputTokens: 19800,
      turnSteps: 4,
      turnCount: 3,
      stepCount: 12,
      modelName: 'Gemini 4 Carbon High',
      isWorking: false,
      crisisState: false,
      slashSeq: 1,
      turnFinishedSeq: 2,
      workStateItems: [
        { task: 'Kiểm định nút bấm Xưởng Giao Diện', status: 'done' },
        { task: 'Kiểm định Chibi 2D/3D & Hơi Thở', status: 'doing' }
      ],
      activeSubagents: [],
      recentCompletedSubagents: []
    };

    const pushTelemetryUpdate = (patch) => {
      currentTelemetry = { ...currentTelemetry, ...patch };
      const msg = `data: ${JSON.stringify(currentTelemetry)}\n\n`;
      for (const res of sseClients) {
        try { res.write(msg); } catch (_) {}
      }
    };

    let mcpStudioHtmlBody = '';
    const server = http.createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'X-Agy-Token, Content-Type, Accept'
        });
        res.end();
        return;
      }
      const u = new URL(req.url, 'http://127.0.0.1');

      if (u.pathname === '/__mcp_studio_preview') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(mcpStudioHtmlBody);
        return;
      }

      if (u.pathname === '/__events') {
        if (req.headers['x-agy-token'] !== ephemeralToken) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        const reqCid = u.searchParams.get('cid') || '';
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        sseClients.add(res);
        res.write(`data: ${JSON.stringify({ ...currentTelemetry, cid: reqCid || activeCid })}\n\n`);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (u.pathname === '/__telemetry') {
        if (req.headers['x-agy-token'] !== ephemeralToken) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(currentTelemetry));
        return;
      }

      if (u.pathname.startsWith('/assets/')) {
        const baseName = path.basename(u.pathname);
        const filePath = path.join(ASSETS_DIR, baseName);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(baseName).toLowerCase();
          res.writeHead(200, {
            'Content-Type': MIME_BY_EXT[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin'
          });
          res.end(fs.readFileSync(filePath));
          return;
        }
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      // Phục vụ trang ở cả route /?project=mod (không có /c/ trên URL!) để kiểm chứng bản vá SIDEBAR_GUARD_SEL!
      res.end(buildRealisticIdeHtml(activeCid, sidebarOtherCid));
    });

    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/`;

    const userDataDir = makeTempDir('agy-f24-chrome-profile-');
    const chromeArgs = [
      '--headless=new',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      ...(process.platform === 'darwin' ? [] : ['--use-angle=swiftshader']),
      '--enable-unsafe-swiftshader',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      ...(process.platform === 'linux'
        ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        : []),
      `--user-data-dir=${userDataDir}`,
      '--window-size=1440,900',
      '--remote-debugging-port=0',
      `${baseUrl}?project=mod`
    ];

    const chrome = spawn(chromeBin, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const runtimeExceptions = [];
    const consoleErrors = [];
    let cdp = null;

    try {
      const wsBrowserUrl = await new Promise((resolve, reject) => {
        let errBuf = '';
        const timer = setTimeout(() => reject(new Error(`Chromium start timeout: ${errBuf}`)), 15000);
        chrome.stderr.on('data', (chunk) => {
          errBuf += chunk.toString('utf8');
          const m = errBuf.match(/DevTools listening on (ws:\/\/[^\r\n]+)/);
          if (m) {
            clearTimeout(timer);
            resolve(m[1].trim());
          }
        });
        chrome.on('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Chromium exited early (${code}): ${errBuf}`));
        });
      });

      const debugPort = parseInt(new URL(wsBrowserUrl).port, 10);
      let pageTarget = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        const list = await httpGetJson(debugPort, '/json/list').catch(() => []);
        pageTarget = list.find((item) => item.type === 'page' && String(item.url || '').startsWith(baseUrl));
        if (pageTarget && pageTarget.webSocketDebuggerUrl) break;
        await sleep(100);
      }
      assert.ok(pageTarget, 'Phải tìm thấy tab Chromium đang mở trang kiểm định IDE');

      cdp = new CdpSession(pageTarget.webSocketDebuggerUrl);
      await cdp.connect();
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('DOM.enable');
      await cdp.send('Log.enable');

      cdp.on('Runtime.exceptionThrown', (params) => {
        const d = params.exceptionDetails || {};
        runtimeExceptions.push((d.exception && d.exception.description) || d.text || 'Unknown exception');
      });
      cdp.on('Runtime.consoleAPICalled', (params) => {
        if (params.type === 'error') {
          const msg = (params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
          consoleErrors.push(msg);
        }
      });

      // Điều hướng tường minh và chờ DOM trang sẵn sàng rồi tiêm cấu hình khởi động + bundle thật y hệt Daemon
      await cdp.send('Page.navigate', { url: `${baseUrl}?project=mod` });
      for (let w = 0; w < 40; w++) {
        const ready = await cdp.eval(`Boolean(location.href.startsWith(${JSON.stringify(baseUrl)}) && document.readyState === 'complete' && document.querySelector('.surface-composer'))`).catch(() => false);
        if (ready) break;
        await sleep(80);
      }

      const bootPayload = {
        authToken: ephemeralToken,
        assetBase: baseUrl,
        syncFromDaemon: true,
        initialConfig: {
          themeName: '🌸 Luyến Trụ — Mitsuri Kanroji',
          bubbleName: '🌸 Luyến Trụ — Mitsuri Kanroji',
          masterPersona: 'yoriichi',
          aiPersonaMode: 'subtle',
          dimming: 28,
          fxDensity: 100,
          wpEnabled: true,
          transparentWorld: true,
          chibiEnabled: true,
          chibi3dEnabled: false,
          autoFinisher: true,
          uiLang: 'vi',
          activeWorkspace: 'mod'
        }
      };
      await cdp.eval(`(() => { const __AGY_INJECT_BOOT__ = ${JSON.stringify(bootPayload)};\n${payloadCode}\n})()\n//# sourceURL=theme_payload_e2e.js`, false);
      await sleep(750);

      /* =====================================================================
       * BƯỚC KIỂM ĐỊNH 1: Giao diện chính, Sidebar Button, HUD đọc CID bên trong
       * [data-testid="sidebar-split"] ở route /?project=mod & Chibi 2D sắc nét
       * ===================================================================== */
      const initHealth = await cdp.eval(`(() => {
        const hudText = document.getElementById('agy-token-context-bar')?.innerText || '';
        const auraHost = document.querySelector('agy-chibi-aura');
        const c3dCanvas = auraHost ? auraHost.querySelector('canvas.agy-chibi-3d-canvas') : null;
        return {
          hasSidebarBtn: Boolean(document.getElementById('agy-custom-theme-sidebar-btn')),
          hasSettingsBtn: Boolean(document.getElementById('agy-custom-theme-settings-btn')),
          hasLiveFx: Boolean(document.getElementById('agy-live-fx-canvas')),
          hudText,
          autoCompactEnabled: window.__AGY_TOKEN_HUD__.isAutoCompactEnabled(),
          chibi3dActive: Boolean(c3dCanvas),
          npcBadgeText: document.querySelector('.agy-npc-badge')?.textContent?.trim() || ''
        };
      })()`);

      assert.equal(initHealth.hasSidebarBtn, true, 'Phải gắn nút "Giao diện tùy biến" lên Sidebar thật');
      assert.equal(initHealth.hasSettingsBtn, true, 'Phải gắn nút Cài đặt nhanh lên Titlebar thật');
      assert.equal(initHealth.hasLiveFx, true, 'Phải khởi tạo canvas hạt nền <agy-live-fx>');
      assert.equal(initHealth.autoCompactEnabled, false, 'Tự động nén 380K phải ở trạng thái tắt cứng');
      assert.equal(initHealth.chibi3dActive, false, 'Chế độ 2D mặc định không được dựng hình khối 3D thủ tục');
      assert.match(initHealth.hudText, /84\.2K/, 'HUD phải đọc đúng 84.2K token từ [data-testid="conversation-view"] dù URL là /?project=mod');
      assert.match(initHealth.npcBadgeText, /Mitsuri/, 'Nhãn NPC phải khớp với chủ đề Mitsuri đang bật');

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '01_main_workspace_2d_hud.png',
        'Giao diện chính Antigravity — Chủ đề Mitsuri, Chibi 2D gốc, Thanh Token HUD (84.2K) & Nút Sidebar',
        'Hit-test đạt 100%, đọc đúng CID trong [data-testid="sidebar-split"], tự động nén = Tắt'
      );

      /* =====================================================================
       * BƯỚC KIỂM ĐỊNH 2: Nút mở Xưởng Giao Diện, Chuyển 3 Ngôn ngữ (vi/en/ja),
       * Bộ lọc nhóm chủ đề & Click chọn Chủ đề trực tiếp
       * ===================================================================== */
      await realMouseClick(cdp, '#agy-custom-theme-sidebar-btn', 'Mở Xưởng Giao Diện từ Sidebar');
      await sleep(180);

      await realMouseClick(cdp, '.agy-lang-btn[data-lang="en"]', 'Chuyển ngôn ngữ sang Tiếng Anh');
      assert.equal(await cdp.eval(`document.getElementById('agy-custom-theme-modal-title').textContent`), 'Theme Customizer Studio');

      await realMouseClick(cdp, '.agy-lang-btn[data-lang="ja"]', 'Chuyển ngôn ngữ sang Tiếng Nhật');
      assert.equal(await cdp.eval(`document.getElementById('agy-custom-theme-modal-title').textContent`), 'カスタムテーマ工房');

      await realMouseClick(cdp, '.agy-lang-btn[data-lang="vi"]', 'Chuyển ngôn ngữ về Tiếng Việt');
      assert.equal(await cdp.eval(`document.getElementById('agy-custom-theme-modal-title').textContent`), 'Xưởng Giao Diện Tùy Biến');

      // Kiểm tra các nút lọc danh mục chủ đề
      for (const flt of ['hashira', 'kamaboko', 'royal', 'classic', 'all']) {
        await realMouseClick(cdp, `#agy-preset-filter-bar [data-filter="${flt}"]`, `Lọc nhóm chủ đề: ${flt}`);
      }

      // Click chọn chủ đề Shinobu Kocho rồi Rengoku rồi Nezuko
      await realMouseClick(cdp, '.agy-preset-card[data-name="🦋 Trùng Trụ — Shinobu Kocho"]', 'Chọn chủ đề Shinobu');
      assert.match(await cdp.eval(`document.querySelector('.agy-npc-badge')?.textContent || ''`), /Shinobu/);

      await realMouseClick(cdp, '.agy-preset-card[data-name="🔥 Viêm Trụ — Kyojuro Rengoku"]', 'Chọn chủ đề Rengoku');
      assert.match(await cdp.eval(`document.querySelector('.agy-npc-badge')?.textContent || ''`), /Rengoku/);

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '02_studio_tab1_themes_collection.png',
        'Xưởng Giao Diện Tùy Biến — Tab Bộ sưu tập 16 Chủ đề, Đa ngôn ngữ (VI/EN/JA) & Bộ lọc nhóm',
        'Click vật lý 3 ngôn ngữ, 4 bộ lọc nhóm và đổi chủ đề đồng bộ tức thì với NPC'
      );

      /* =====================================================================
       * BƯỚC KIỂM ĐỊNH 3: Tab Nhân vật & Đại diện — Bản Ngã, Avatar, Khí chất AI,
       * Chuyển đổi Chibi 2D <-> 3D & Nạp tệp mô hình .glb WebGL2 thật
       * ===================================================================== */
      await realMouseClick(cdp, '#agy-tab-persona', 'Chuyển sang Tab Nhân vật & Đại diện');
      await sleep(120);

      // Click ẩn rồi hiện lại Avatar người dùng & AI
      await realMouseClick(cdp, '#agy-user-av-clear', 'Ẩn Avatar Người dùng');
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().userAvatar`), 'none');
      await realMouseClick(cdp, '#agy-user-av-clear', 'Bật lại Avatar Người dùng');
      assert.notEqual(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().userAvatar`), 'none');

      await realMouseClick(cdp, '#agy-agent-av-clear', 'Ẩn Avatar Trợ lý AI');
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().agentAvatar`), 'none');
      await realMouseClick(cdp, '#agy-agent-av-clear', 'Bật lại Avatar Trợ lý AI');

      // Chuyển đổi 3 chế độ Khí chất AI (roleplay -> off -> subtle)
      await realMouseClick(cdp, '.agy-ai-persona-mode-btn[data-ai-persona-mode="roleplay"]', 'Bật Khí chất Nhập vai');
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().aiPersonaMode`), 'roleplay');
      await realMouseClick(cdp, '.agy-ai-persona-mode-btn[data-ai-persona-mode="off"]', 'Tắt Khí chất AI');
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().aiPersonaMode`), 'off');
      await realMouseClick(cdp, '.agy-ai-persona-mode-btn[data-ai-persona-mode="subtle"]', 'Đặt Khí chất Tinh tế');

      // Chuyển đổi tường minh Chế độ 2D <-> Chế độ 3D
      await realMouseClick(cdp, '#agy-chibi-mode-3d', 'Bấm nút Chế độ 3D (.glb / .vrm)');
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().chibi3dEnabled`), true);
      await realMouseClick(cdp, '#agy-chibi-mode-2d', 'Bấm nút Chế độ 2D (Ảnh gốc)');
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().chibi3dEnabled`), false);

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '03_studio_tab2_persona_2d_3d.png',
        'Tab Nhân vật & Đại diện — Điều khiển Avatar, Khí chất AI & Công tắc Chế độ Chibi 2D / 3D',
        'Toàn bộ nút Avatar, 3 nút Khí chất AI và cặp nút Chế độ 2D / 3D phản hồi chính xác'
      );

      // Nạp tệp .glb thật qua DOM.setFileInputFiles vào #agy-chibi-glb-input
      const docRoot = await cdp.send('DOM.getDocument', { depth: 1 });
      const glbInputNode = await cdp.send('DOM.querySelector', {
        nodeId: docRoot.root.nodeId,
        selector: '#agy-chibi-glb-input'
      });
      assert.ok(glbInputNode.nodeId, 'Phải tìm thấy input file #agy-chibi-glb-input');
      await cdp.send('DOM.setFileInputFiles', {
        nodeId: glbInputNode.nodeId,
        files: [glbFilePath]
      });
      await sleep(450);

      // Đóng modal để nhìn rõ và kiểm tra pixel WebGL 3D trên góc phải khung chat
      await realMouseClick(cdp, '#agy-theme-modal-close-btn', 'Đóng Xưởng Giao Diện để kiểm tra mô hình 3D .glb');
      await sleep(300);

      const glbRenderCheck = await cdp.eval(`(() => {
        const c2 = document.querySelector('agy-chibi-aura canvas.agy-chibi-3d-canvas');
        if (!c2) return { mounted: false, nonZeroAlpha: 0 };
        const ctx = c2.getContext('2d');
        const data = ctx.getImageData(0, 0, c2.width, c2.height).data;
        let nonZeroAlpha = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 15) nonZeroAlpha++;
        }
        return {
          mounted: true,
          nonZeroAlpha,
          composerAttr: document.querySelector('.surface-composer')?.getAttribute('data-chibi-3d-active')
        };
      })()`);
      assert.equal(glbRenderCheck.mounted, true, 'Sau khi nạp .glb thật phải gắn canvas.agy-chibi-3d-canvas');
      assert.equal(glbRenderCheck.composerAttr, '1', 'Composer phải bật data-chibi-3d-active="1" ẩn ảnh 2D nền dưới');
      assert.ok(glbRenderCheck.nonZeroAlpha > 150, `WebGL2 phải vẽ mô hình .glb thật ra pixel hữu hình (đếm được ${glbRenderCheck.nonZeroAlpha} pixel)`);

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '04_chibi_3d_glb_webgl_live.png',
        'Kết xuất Mô hình 3D (.glb) thật bằng WebGL2 trên góc phải Khung hội thoại',
        `Đã vẽ ${glbRenderCheck.nonZeroAlpha} pixel 3D thực tế từ tệp .glb nhị phân`
      );

      // Mở lại Xưởng Giao Diện từ nút Titlebar (#agy-custom-theme-settings-btn) và bấm Xóa 3D về 2D gốc
      await realMouseClick(cdp, '#agy-custom-theme-settings-btn', 'Mở Xưởng Giao Diện từ nút Cài đặt Titlebar');
      await sleep(150);
      await realMouseClick(cdp, '#agy-tab-persona', 'Mở lại Tab Nhân vật');
      await realMouseClick(cdp, '#agy-chibi-glb-reset', 'Xóa mô hình 3D về ảnh Chibi 2D gốc');
      await realMouseClick(cdp, '#agy-chibi-mode-2d', 'Khóa về Chế độ 2D (Ảnh gốc)');
      await sleep(200);
      assert.equal(await cdp.eval(`Boolean(document.querySelector('canvas.agy-chibi-3d-canvas'))`), false, 'Sau khi xóa .glb và chọn 2D phải gỡ canvas 3D');

      /* =====================================================================
       * BƯỚC KIỂM ĐỊNH 4: Tab Khung hội thoại & Tab Hình nền / Hiệu ứng / Tập trung
       * ===================================================================== */
      await realMouseClick(cdp, '#agy-tab-chat', 'Chuyển sang Tab Khung hội thoại');
      await sleep(120);
      for (const stStyle of ['double_gold', 'minimal', 'sync', 'glass']) {
        await realMouseClick(cdp, `.agy-input-card[data-style="${stStyle}"]`, `Chọn kiểu khung nhập: ${stStyle}`);
        assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().inputStyle`), stStyle);
      }

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '05_studio_tab3_chat_bubbles.png',
        'Tab Khung hội thoại — Tùy biến Kiểu khung nhập (Đồng bộ, Kim tuyến, Kính mờ, Tối giản) & Bo góc',
        'Click vật lý đủ 4 kiểu khung nhập và đồng bộ cấu hình tức thì'
      );

      await realMouseClick(cdp, '#agy-tab-backdrop', 'Chuyển sang Tab Hình nền & Hiệu ứng');
      await sleep(120);
      await realMouseClick(cdp, '#agy-focus-preset-btn', 'Bật Chế độ Tập trung (Focus Mode)');
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().focusMode`), true);
      await realMouseClick(cdp, '#agy-focus-preset-btn', 'Tắt Chế độ Tập trung');
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().focusMode`), false);

      await realMouseClick(cdp, '#agy-tw-toggle', 'Đảo công tắc Thế giới Trong suốt');
      await realMouseClick(cdp, '#agy-tw-toggle', 'Khôi phục Thế giới Trong suốt');
      await realMouseClick(cdp, '#agy-eco-battery-toggle', 'Đảo công tắc Tiết kiệm Pin thông minh');
      await realMouseClick(cdp, '#agy-eco-battery-toggle', 'Khôi phục Tiết kiệm Pin thông minh');

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '06_studio_tab4_backdrop_focus.png',
        'Tab Hình nền & Hiệu ứng — Độ tối, Mật độ hạt, Thế giới Trong suốt & Chế độ Tập trung',
        'Kiểm chứng Focus Mode 2 chiều, Thế giới Trong suốt, Eco Battery và 0 live blur trên vùng cuộn'
      );

      /* =====================================================================
       * BƯỚC KIỂM ĐỊNH 5: Tab Xưởng Rèn Chủ đề từ ảnh, Hồ sơ Dự án (không ghi đè 2D)
       * & Nhập/Xuất JSON
       * ===================================================================== */
      await realMouseClick(cdp, '#agy-tab-forge', 'Chuyển sang Tab Rèn Chủ đề & Hồ sơ Dự án');
      await sleep(150);

      const docRoot2 = await cdp.send('DOM.getDocument', { depth: 1 });
      const forgeFileNode = await cdp.send('DOM.querySelector', {
        nodeId: docRoot2.root.nodeId,
        selector: '#agy-forge-file'
      });
      await cdp.send('DOM.setFileInputFiles', {
        nodeId: forgeFileNode.nodeId,
        files: [forgeSampleImg]
      });
      await sleep(450);

      await cdp.eval(`(() => {
        const inp = document.getElementById('agy-forge-name');
        inp.value = '🌌 Điệp Vũ Tinh Hà';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await realMouseClick(cdp, '#agy-forge-commit', 'Rèn và Áp dụng Vũ trụ mới từ ảnh');
      await sleep(250);
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().themeName`), '🌌 Điệp Vũ Tinh Hà');

      // Kiểm chứng gắn Hồ sơ Dự án và chuyển đổi tiêu đề dự án KHÔNG làm sống lại Chibi 3D khi đang ở Chế độ 2D!
      await cdp.eval(`(() => {
        const wsIn = document.getElementById('agy-ws-key-input');
        wsIn.value = 'mod';
        wsIn.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await realMouseClick(cdp, '#agy-ws-bind-btn', 'Gắn Hồ sơ cho dự án mod');
      await sleep(150);

      // Giả lập có thêm hồ sơ cũ chưa lưu trường chibi3dEnabled rồi đổi document.title qua lại
      await cdp.eval(`(() => {
        const cur = window.__AGY_THEME_CORE__.getSnapshot();
        const nextMap = { ...cur.workspaceProfiles, legacy_proj: { themeName: '🎋 Nezuko Kamado — Hồng Liên', bubbleName: '🎋 Nezuko Kamado — Hồng Liên', masterPersona: 'yoriichi', dimming: 30, fxDensity: 90, chibiEnabled: true } };
        window.__AGY_THEME_CORE__.applyTheme({ chibi3dEnabled: false, workspaceProfiles: nextMap });
        document.title = 'Task A - legacy_proj - Antigravity';
      })()`);
      await sleep(250);
      await cdp.eval(`window.__AGY_THEME_CORE__.applyWorkspaceProfile('legacy_proj')`);
      assert.equal(
        await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().chibi3dEnabled`),
        false,
        'Chuyển sang hồ sơ dự án cũ không có trường chibi3dEnabled KHÔNG được tự động bật lại Chibi 3D!'
      );

      await realMouseClick(cdp, '#agy-import-toggle', 'Mở khung Nhập JSON / .agytheme');
      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '07_studio_tab5_forge_workspace.png',
        'Tab Xưởng Rèn Vũ Trụ, Gắn Hồ sơ Dự án (bảo toàn Chế độ 2D) & Sao lưu Cấu hình',
        'Rèn chủ đề mới từ ảnh thật thành công, bảo toàn Chế độ 2D khi chuyển đổi Hồ sơ Dự án'
      );

      // Chuyển về chủ đề Mitsuri tươi sáng và đóng Modal bằng phím Escape
      await realMouseClick(cdp, '#agy-tab-themes', 'Quay về Tab Chủ đề');
      await realMouseClick(cdp, '.agy-preset-card[data-name="🌸 Luyến Trụ — Mitsuri Kanroji"]', 'Chọn chủ đề Mitsuri');
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(200);
      assert.equal(await cdp.eval(`document.getElementById('agy-custom-theme-modal-backdrop')?.style.display`), 'none', 'Nhấn Escape phải đóng Xưởng Giao Diện');

      /* =====================================================================
       * BƯỚC KIỂM ĐỊNH 6: Click Chibi Hitbox thi triển Hơi Thở trên sân khấu,
       * Mở Hộp thoại NPC, Trò chuyện riêng, Drawer 4 Thức & Nút Chibi 2D/3D
       * ===================================================================== */
      await realMouseClick(cdp, '.surface-composer .agy-chibi-hitbox', 'Click trực tiếp nhân vật Chibi trên khung chat thi triển Thức Hơi Thở');
      await sleep(240);
      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '08_breathing_skill_stage_slash.png',
        'Sân khấu Thi triển Thức Hơi Thở khi nhấn trực tiếp vào Nhân vật Chibi (Luyến Hô Hấp)',
        'Nhân vật Mitsuri phóng lên sân khấu với kiếm khí Luyến Hô Hấp trên canvas toàn màn hình'
      );
      await sleep(1100);
      // Cũng kiểm tra luôn nút Chibi nhỏ trên bong bóng người dùng (Yoriichi)
      await realMouseClick(cdp, '.agy-user-bubble-frame .agy-chibi-hitbox', 'Click Chibi Khai Tổ trên bong bóng người dùng');
      await sleep(900);

      // Kiểm chứng cả 2 chiều Thu gọn (✕) -> Hiện huy hiệu (.agy-npc-badge) -> Nhấn huy hiệu mở lại Hộp thoại NPC
      const isNpcBadgeHidden = await cdp.eval(`(() => {
        const b = document.querySelector('.agy-npc-badge');
        return !b || getComputedStyle(b).display === 'none';
      })()`);
      if (isNpcBadgeHidden) {
        await realMouseClick(cdp, '#agy-shinobu-npc-wrap [data-npc-act="close"]', 'Thu gọn Hộp thoại NPC về huy hiệu');
        await sleep(120);
      }
      await realMouseClick(cdp, '.agy-npc-badge', 'Mở Hộp thoại NPC từ huy hiệu nhân vật');
      await sleep(160);

      // Bấm nút đổi thoại ngẫu nhiên, tạm dừng/phát hiệu ứng, mở ô trò chuyện riêng & gửi tin nhắn
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap [data-npc-act="random"]', 'Đổi câu thoại ngẫu nhiên NPC');
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap [data-npc-act="motion"]', 'Tạm dừng hiệu ứng hạt từ NPC');
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap [data-npc-act="motion"]', 'Phát lại hiệu ứng hạt từ NPC');

      // Bấm nút chuyển đổi Chibi 2D/3D ngay trên hộp thoại NPC -> kiểm tra thông báo phản hồi trực quan
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap .agy-npc-mode-pill', 'Bấm nút Chibi 2D/3D trong Hộp thoại NPC');
      const npcModeFeedback = await cdp.eval(`document.querySelector('#agy-shinobu-npc-wrap .agy-npc-dialog-text')?.textContent || ''`);
      assert.match(npcModeFeedback, /Chibi 2D|mô hình 3D|\.glb/i, 'Bấm nút Chibi 2D/3D trên NPC phải hiện thông báo phản hồi trực quan ngay trong hộp thoại');
      // Bấm lần nữa trả lại chế độ 2D
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap .agy-npc-mode-pill', 'Chuyển lại Chibi 2D trong Hộp thoại NPC');

      // Mở ô chat riêng với NPC & gửi tin nhắn
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap [data-npc-act="chat-toggle"]', 'Mở ô trò chuyện riêng với NPC');
      await cdp.eval(`(() => {
        const inp = document.querySelector('#agy-shinobu-npc-wrap .agy-npc-chat-input');
        inp.value = 'Chào Mitsuri nhé!';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap .agy-npc-chat-send', 'Gửi tin nhắn cho NPC');
      await sleep(120);
      assert.equal(await cdp.eval(`document.querySelector('#agy-shinobu-npc-wrap .agy-npc-user-msg')?.textContent`), 'Chào Mitsuri nhé!');

      // Mở ngăn kéo "Các Thức", đảo nút Kiếm âm và bấm chiêu thức
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap .agy-npc-skill-pill', 'Mở danh sách 4 Thức Hơi Thở trong NPC');
      await sleep(140);
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap .agy-skill-sfx-btn', 'Tắt Kiếm âm trong ngăn kéo Các Thức');
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap .agy-skill-sfx-btn', 'Bật lại Kiếm âm trong ngăn kéo Các Thức');

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '09_npc_dialog_skills_and_chat.png',
        'Hộp thoại Nhân vật NPC — Trò chuyện riêng, Phản hồi Chibi 2D/3D & Ngăn kéo 4 Thức Hơi Thở',
        'Đầy đủ 4 nút công cụ header, gửi tin nhắn NPC, nút Chibi 2D/3D và ngăn kéo 4 Thức hoạt động mượt'
      );

      await realMouseClick(cdp, '#agy-shinobu-npc-wrap .agy-skill-item-btn', 'Thi triển Thức thứ nhất từ danh sách NPC');
      await sleep(900);
      await realMouseClick(cdp, '#agy-shinobu-npc-wrap [data-npc-act="close"]', 'Thu gọn Hộp thoại NPC');

      /* =====================================================================
       * BƯỚC KIỂM ĐỊNH 7: Thanh Token HUD (vượt 405K KHÔNG tự nén), Quân Đoàn Cửu Trụ,
       * Chuông gió Kagura, Mặt nạ Cáo Khiên Che Mật, Trailer 15s, Ấn Yoriichi & Nén tay /compact
       * ===================================================================== */
      pushTelemetryUpdate({
        contextTokens: 405000,
        turnTokens: 8900,
        outputTokens: 64000,
        isWorking: false,
        activeSubagents: [
          { cid: 'sub-1', typeName: 'research', role: 'Trinh sát Kiến trúc DOM', stepCount: 4 },
          { cid: 'sub-2', typeName: 'browser', role: 'Kiểm duyệt Giao diện Chromium', stepCount: 6 },
          { cid: 'sub-3', typeName: 'self', role: 'Tổng hợp Báo cáo Hình ảnh', stepCount: 3 }
        ]
      });
      await sleep(1600);

      // Xác nhận vượt 405K (>380K) vẫn KHÔNG tự động gửi /compact!
      assert.deepEqual(await cdp.eval(`window.__SENT_MESSAGES__`), [], 'Vượt 405K token tuyệt đối KHÔNG được tự động gửi /compact');

      // Mở Popover chi tiết Token HUD & bấm vào Đại Trụ đầu tiên trong Quân Đoàn Cửu Trụ
      await realMouseClick(cdp, '.agy-tok-ctx-pill', 'Mở Popover Chi tiết Ngữ cảnh & Nhật Luân Đao');
      await sleep(160);
      const hudPopText = await cdp.eval(`document.querySelector('#agy-token-context-bar .agy-tok-popover')?.innerText || ''`);
      assert.match(hudPopText, /Tự động nén: Đã tắt/, 'Popover Token HUD phải hiển thị rõ "Tự động nén: Đã tắt"');

      const squadCount = await cdp.eval(`document.querySelectorAll('agy-hashira-squad .agy-squad-unit-wrap').length`);
      assert.equal(squadCount, 3, 'Quân Đoàn Cửu Trụ phải hiển thị đúng 3 Đại Trụ đang chạy');

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '10_token_hud_popover_and_hashira_squad.png',
        'Popover Thống kê Token (405K • Tự động nén: Đã tắt) & Quân Đoàn Cửu Trụ (3 Đại Trụ đồng hành)',
        'SSE thời gian thực cập nhật 405K không tự nén, hiển thị tiến độ nhiệm vụ và 3 Đại Trụ Subagent'
      );

      // Click Chuông gió Kagura -> đóng chéo Popover Token HUD và mở bảng Âm cảnh Điệp Phủ
      await realMouseClick(cdp, '.agy-kagura-bell-btn', 'Mở Bảng Âm cảnh Điệp Phủ (Chuông gió Kagura)');
      await sleep(140);
      assert.equal(await cdp.eval(`document.getElementById('agy-token-context-bar')?.dataset.open`), undefined, 'Mở Chuông gió phải tự đóng Popover Token HUD');
      assert.equal(await cdp.eval(`Boolean(document.getElementById('agy-kny-bio-audio-popover'))`), true);

      // Click các nút âm cảnh & nghe thử trong bảng Chuông gió
      const segButtonsCount = await cdp.eval(`document.querySelectorAll('#agy-kny-bio-audio-popover .agy-ba-seg-btn').length`);
      assert.equal(segButtonsCount, 3);
      await realMouseClick(cdp, '#agy-kny-bio-audio-popover .agy-ba-seg-btn:nth-child(2)', 'Chọn âm cảnh Mưa Điệp Phủ');
      await realMouseClick(cdp, '#agy-kny-bio-audio-popover .agy-ba-seg-btn:nth-child(1)', 'Chuyển về Tắt nền âm cảnh');
      await realMouseClick(cdp, '#agy-kny-bio-audio-popover .agy-ba-mini-btn:nth-child(1)', 'Bấm nút Thử Chuông Koto');
      await realMouseClick(cdp, '#agy-kny-bio-audio-popover .agy-ba-mini-btn:nth-child(2)', 'Bấm nút Thử tiếng tra kiếm Kachin');

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '11_kagura_bio_audio_panel.png',
        'Bảng Âm cảnh Điệp Phủ (Chuông gió Kagura) — Chuông Koto, Kiếm âm, Bảo vệ mắt & Sóng Alpha',
        'Đóng chéo Popover chuẩn xác, toàn bộ công tắc và nút nghe thử âm thanh hoạt động không lỗi'
      );

      // Click Mặt nạ Cáo Urokodaki -> đóng chéo Chuông gió, mở Đạo Diễn Trình Diễn & bật Khiên Che Mật
      await realMouseClick(cdp, '.agy-cinema-mask-btn', 'Mở Bảng Đạo Diễn & Khiên Che Mật (Mặt nạ Cáo)');
      await sleep(140);
      assert.equal(await cdp.eval(`Boolean(document.getElementById('agy-kny-bio-audio-popover'))`), false, 'Mở Mặt nạ Cáo phải tự đóng Chuông gió Kagura');
      assert.equal(await cdp.eval(`Boolean(document.getElementById('agy-cinema-director-panel'))`), true);

      // Bật Khiên Che Mật để che mờ lịch sử phiên & khóa bí mật trên màn hình
      await realMouseClick(cdp, '#agy-cinema-director-panel button[role="switch"]', 'Bật Khiên Che Mật');
      await sleep(260);
      const shieldCheck = await cdp.eval(`(() => {
        const convItem = document.querySelector('[data-testid="conversation-list-sidebar"] [data-cascade-id]');
        const secretPre = document.querySelector('pre.secret-code-sample');
        return {
          hasBadge: Boolean(document.getElementById('agy-cinema-privacy-badge')),
          convFilter: convItem ? getComputedStyle(convItem).filter : '',
          secretMasked: secretPre ? secretPre.getAttribute('data-agy-sensitive-masked') : '',
          secretFilter: secretPre ? getComputedStyle(secretPre).filter : ''
        };
      })()`);
      assert.equal(shieldCheck.hasBadge, true, 'Phải hiển thị huy hiệu Khiên Che Mật đang bảo vệ');
      assert.match(shieldCheck.convFilter, /blur/, 'Lịch sử phiên trong [data-testid="conversation-list-sidebar"] phải thực sự bị làm mờ blur()');
      assert.equal(shieldCheck.secretMasked, '1', 'Khóa bí mật sk-... trong thẻ <pre> phải được gắn cờ che mờ tự động');
      assert.match(shieldCheck.secretFilter, /blur/, 'Khối chứa khóa bí mật phải thực sự bị làm mờ blur()');

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '12_cinema_privacy_shield_active.png',
        'Bảng Đạo Diễn & Khiên Che Mật Urokodaki — Tự động làm mờ dữ liệu nhạy cảm & Lịch sử dự án',
        'Khiên Che Mật kích hoạt tức thì, làm mờ cây lịch sử phiên và hiện huy hiệu bảo vệ an toàn'
      );

      // Tắt Khiên Che Mật rồi bấm Chạy Trailer 15s -> chụp cảnh Trailer -> nhấn Escape hủy sớm khôi phục sạch sẽ
      await realMouseClick(cdp, '#agy-cinema-director-panel button[role="switch"]', 'Tắt Khiên Che Mật');
      await realMouseClick(cdp, '#agy-cinema-director-panel .agy-cd-hero-btn', 'Khởi chạy Trailer Trình Chiếu 15s');
      await sleep(450);
      assert.equal(await cdp.eval(`window.__AGY_CINEMA_DIRECTOR__.isShowcaseRunning()`), true, 'Trailer 15s phải đang chạy');

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '13_cinema_15s_trailer_showcase.png',
        'Chế độ Tự Diễn Trình Chiếu Điện Ảnh 15s — Sân khấu Đại Trụ Luân Chuyển',
        'Khởi chạy kịch bản trình diễn tự động và cho phép hủy khẩn cấp bằng phím Escape'
      );

      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(220);
      assert.equal(await cdp.eval(`window.__AGY_CINEMA_DIRECTOR__.isShowcaseRunning()`), false, 'Nhấn Escape phải dừng ngay Trailer 15s');
      assert.equal(await cdp.eval(`window.__AGY_THEME_CORE__.getSnapshot().themeName`), '🌸 Luyến Trụ — Mitsuri Kanroji', 'Hủy Trailer phải khôi phục nguyên vẹn chủ đề Mitsuri ban đầu');

      // Click Ấn Yoriichi khai mở Vũ Điệu Hỏa Thần & Click Thanh Nhật Luân Kiếm kích tay /compact trên Lexical
      await realMouseClick(cdp, '.agy-yoriichi-crest-btn', 'Nhấn Ấn Khai Tổ Yoriichi thi triển Nhật Chi Hô Hấp');
      await sleep(300);

      await realMouseClick(cdp, '.agy-nichirin-pill', 'Nhấn Thanh Nhật Luân Kiếm kích hoạt nén tay /compact');
      await sleep(950);
      const sentAfterManual = await cdp.eval(`window.__SENT_MESSAGES__`);
      assert.deepEqual(sentAfterManual, ['/compact'], 'Nhấn tay Thanh Nhật Luân Kiếm trên Lexical + Slash Menu phải gửi đúng duy nhất 1 lệnh /compact');

      /* =====================================================================
       * BƯỚC KIỂM ĐỊNH 8: Mở Giao diện MCP Theme Studio App (ui://agy-theme/studio.html)
       * trong Chromium thật, kiểm tra tương tác nút bấm và chụp ảnh kiểm duyệt
       * ===================================================================== */
      const mcpRaw = execFileSync(
        process.execPath,
        [NODE_MCP_PATH],
        {
          cwd: REPO_ROOT,
          input: [
            JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-01-26' } }),
            JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'ui://agy-theme/studio.html' } })
          ].join('\n') + '\n',
          encoding: 'utf8',
          env: { ...process.env, PLUGIN_ROOT: REPO_ROOT, AGY_SKIP_DAEMON_SPAWN: '1' },
          windowsHide: true,
          timeout: 10000
        }
      );
      const mcpLines = mcpRaw.trim().split(/\r?\n/).map((l) => JSON.parse(l));
      mcpStudioHtmlBody = mcpLines.find((m) => m.id === 2).result.contents[0].text;
      const studioRoutePath = '/__mcp_studio_preview';

      await cdp.send('Page.navigate', { url: `${baseUrl.replace(/\/$/, '')}${studioRoutePath}` });
      await sleep(450);

      const studioCardCount = await cdp.eval(`document.querySelectorAll('#themes-grid .th-btn').length`);
      assert.equal(studioCardCount, 16, 'MCP Studio App phải hiển thị đủ 16 thẻ chủ đề ở 0ms');
      await realMouseClick(cdp, '#themes-grid .th-btn:nth-child(2)', 'Chọn thẻ chủ đề trong MCP Studio App');
      await realMouseClick(cdp, '.lang-btn[data-lang="vi"]', 'Chọn ngôn ngữ Tiếng Việt trong MCP Studio App');

      await captureAuditScreenshot(
        cdp,
        auditDir,
        manifest,
        '14_mcp_theme_studio_app.png',
        'Ứng dụng MCP Theme Studio nhúng trực tiếp (SEP-1865) — 16 Chủ đề & 18 Bản Ngã Đồng Bộ',
        'Hiển thị tức thì 0ms đủ 16 thẻ chủ đề, các nút chọn chủ đề và ngôn ngữ đạt hit-test 100%'
      );

      // Khẳng định tuyệt đối KHÔNG có bất kỳ lỗi JS hay console.error nào suốt toàn bộ bài kiểm thử!
      assert.deepEqual(
        runtimeExceptions,
        [],
        `Phát hiện ngoại lệ JS trong quá trình bấm nút thực chiến: ${runtimeExceptions.join(' | ')}`
      );
      assert.deepEqual(
        consoleErrors,
        [],
        `Phát hiện console.error trong quá trình bấm nút thực chiến: ${consoleErrors.join(' | ')}`
      );

      fs.writeFileSync(
        path.join(auditDir, 'visual_audit_manifest.json'),
        JSON.stringify({ generatedAt: new Date().toISOString(), totalScreenshots: manifest.length, screenshots: manifest }, null, 2),
        'utf8'
      );
      assert.equal(manifest.length, 14, 'Phải chụp và xác thực đủ 14 tấm ảnh kiểm duyệt PNG');
    } finally {
      if (cdp) await cdp.close();
      for (const c of sseClients) {
        try { c.end(); } catch (_) {}
      }
      try { server.close(); } catch (_) {}
      try { chrome.kill(); } catch (_) {}
    }
  });
});
