'use strict';

/**
 * Bộ kiểm thử tự động F04 — Bảo Mật & Closure Vault (`engine/agy_security.js`)
 * Tuân thủ Zero-Dependency Node.js >= 22 (`node:test`, `node:assert/strict`, `node:vm`).
 * Chạy độc lập: `node --test tests/test_security.js`
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const SECURITY_SRC = fs.readFileSync(path.join(REPO_ROOT, 'engine', 'agy_security.js'), 'utf8')
  .replace(/^\uFEFF/, '')
  .replace(/\r\n?/g, '\n');

// ============================================================================
// SHIM DOMParser & XMLSerializer THUẦN JAVASCRIPT (ZERO-DEPENDENCY)
// Phân tích cú pháp XML SVG thật: tách thẻ, thuộc tính (kể cả xlink:href),
// giải mã thực thể XML, phát hiện lỗi cú pháp (`parsererror`) và tuần tự hóa.
// ============================================================================

function decodeXmlEntities(str) {
  return String(str || '').replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, ent) => {
    if (ent === 'amp') return '&';
    if (ent === 'lt') return '<';
    if (ent === 'gt') return '>';
    if (ent === 'quot') return '"';
    if (ent === 'apos') return "'";
    if (ent.startsWith('#x') || ent.startsWith('#X')) {
      const cp = parseInt(ent.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    }
    if (ent.startsWith('#')) {
      const cp = parseInt(ent.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    }
    return _;
  });
}

function escapeXmlAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXmlText(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

class MiniXmlNode {
  constructor(nodeType, tagName = '') {
    this.nodeType = nodeType; // 1: Element, 3: Text, 4: CDATA, 7: ProcessingInstruction, 8: Comment, 9: Document
    this.tagName = tagName;
    this.attributes = [];
    this.children = [];
    this.parentNode = null;
    this._text = '';
  }

  get childNodes() {
    return this.children;
  }

  get textContent() {
    if (this.nodeType === 3 || this.nodeType === 4 || this.nodeType === 7) return this._text;
    if (this.nodeType === 8) return '';
    return this.children.map((ch) => ch.textContent).join('');
  }

  set textContent(val) {
    this._text = String(val == null ? '' : val);
  }

  getAttribute(name) {
    const found = this.attributes.find((a) => a.name === name);
    return found ? found.value : null;
  }

  setAttribute(name, value) {
    const existing = this.attributes.find((a) => a.name === name);
    if (existing) {
      existing.value = String(value);
    } else {
      this.attributes.push({ name, value: String(value) });
    }
  }

  removeAttribute(name) {
    this.attributes = this.attributes.filter((a) => a.name !== name);
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }

  querySelectorAll(selector) {
    if (selector !== '*') {
      const target = String(selector || '').toLowerCase();
      const out = [];
      const walk = (node) => {
        for (const ch of node.children) {
          if (ch.nodeType === 1) {
            if (ch.tagName.toLowerCase() === target) out.push(ch);
            walk(ch);
          }
        }
      };
      walk(this);
      return out;
    }
    const out = [];
    const walk = (node) => {
      for (const ch of node.children) {
        if (ch.nodeType === 1) {
          out.push(ch);
          walk(ch);
        }
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function parseXmlAttributes(rawAttrStr) {
  const attrs = [];
  let i = 0;
  const len = rawAttrStr.length;
  while (i < len) {
    while (i < len && /\s/.test(rawAttrStr[i])) i++;
    if (i >= len) break;
    const nameStart = i;
    while (i < len && /[^\s=/>]/.test(rawAttrStr[i])) i++;
    const name = rawAttrStr.slice(nameStart, i);
    if (!name) return null;
    while (i < len && /\s/.test(rawAttrStr[i])) i++;
    if (rawAttrStr[i] !== '=') return null;
    i++; // bỏ qua '='
    while (i < len && /\s/.test(rawAttrStr[i])) i++;
    const quote = rawAttrStr[i];
    if (quote !== '"' && quote !== "'") return null;
    i++;
    const valStart = i;
    while (i < len && rawAttrStr[i] !== quote) i++;
    if (i >= len) return null; // Chuỗi thuộc tính chưa đóng nháy
    const rawVal = rawAttrStr.slice(valStart, i);
    i++; // bỏ qua quote đóng
    attrs.push({ name, value: decodeXmlEntities(rawVal) });
  }
  return attrs;
}

class ShimDOMParser {
  parseFromString(xmlText, mimeType) {
    const doc = new MiniXmlNode(9, '#document');
    doc.documentElement = null;

    const makeErrorDoc = (msg) => {
      const errDoc = new MiniXmlNode(9, '#document');
      const root = new MiniXmlNode(1, 'parsererror');
      const txt = new MiniXmlNode(3);
      txt.textContent = msg;
      root.appendChild(txt);
      errDoc.appendChild(root);
      errDoc.documentElement = root;
      return errDoc;
    };

    if (typeof xmlText !== 'string' || !xmlText.trim()) {
      return makeErrorDoc('Tài liệu XML rỗng.');
    }

    let src = xmlText.trim();
    // Bỏ qua XML declaration & DOCTYPE/comments ở đầu nếu có
    let pos = 0;
    const stack = [];
    let rootEl = null;

    while (pos < src.length) {
      const lt = src.indexOf('<', pos);
      if (lt === -1) {
        const trailing = src.slice(pos).trim();
        if (trailing) {
          if (stack.length === 0) return makeErrorDoc('Dữ liệu văn bản nằm ngoài thẻ gốc.');
          const tNode = new MiniXmlNode(3);
          tNode.textContent = decodeXmlEntities(src.slice(pos));
          stack[stack.length - 1].appendChild(tNode);
        }
        break;
      }

      if (lt > pos) {
        const textChunk = src.slice(pos, lt);
        if (textChunk.trim()) {
          if (stack.length === 0) return makeErrorDoc('Dữ liệu văn bản trước thẻ gốc.');
          const tNode = new MiniXmlNode(3);
          tNode.textContent = decodeXmlEntities(textChunk);
          stack[stack.length - 1].appendChild(tNode);
        }
      }

      if (src.startsWith('<!--', lt)) {
        const endCmt = src.indexOf('-->', lt + 4);
        if (endCmt === -1) return makeErrorDoc('Comment XML chưa đóng.');
        const cNode = new MiniXmlNode(8, '#comment');
        cNode._text = src.slice(lt + 4, endCmt);
        (stack.length > 0 ? stack[stack.length - 1] : doc).appendChild(cNode);
        pos = endCmt + 3;
        continue;
      }

      if (src.startsWith('<?', lt)) {
        const endPi = src.indexOf('?>', lt + 2);
        if (endPi === -1) return makeErrorDoc('Processing instruction chưa đóng.');
        const piBody = src.slice(lt + 2, endPi).trim();
        const piTarget = (piBody.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/) || [])[1] || '';
        const isXmlDecl = piTarget.toLowerCase() === 'xml' && stack.length === 0 && !rootEl;
        if (!isXmlDecl) {
          const piNode = new MiniXmlNode(7, piTarget);
          piNode._text = piBody.slice(piTarget.length).trim();
          (stack.length > 0 ? stack[stack.length - 1] : doc).appendChild(piNode);
        }
        pos = endPi + 2;
        continue;
      }

      if (src.startsWith('<![CDATA[', lt)) {
        const endCd = src.indexOf(']]>', lt + 9);
        if (endCd === -1) return makeErrorDoc('CDATA chưa đóng.');
        if (stack.length > 0) {
          const cdNode = new MiniXmlNode(4, '#cdata-section');
          cdNode._text = src.slice(lt + 9, endCd);
          stack[stack.length - 1].appendChild(cdNode);
        }
        pos = endCd + 3;
        continue;
      }

      // Tìm '>' ngoài cặp dấu nháy của thuộc tính
      let gt = -1;
      let inQuote = null;
      for (let k = lt + 1; k < src.length; k++) {
        const ch = src[k];
        if (inQuote) {
          if (ch === inQuote) inQuote = null;
        } else if (ch === '"' || ch === "'") {
          inQuote = ch;
        } else if (ch === '>') {
          gt = k;
          break;
        }
      }
      if (gt === -1) return makeErrorDoc('Thẻ XML chưa đóng dấu ">".');

      const inside = src.slice(lt + 1, gt).trim();
      pos = gt + 1;

      if (!inside) return makeErrorDoc('Thẻ XML rỗng.');

      if (inside.startsWith('/')) {
        const closeName = inside.slice(1).trim();
        if (stack.length === 0) return makeErrorDoc(`Thẻ đóng </${closeName}> dư thừa.`);
        const top = stack.pop();
        if (top.tagName !== closeName) {
          return makeErrorDoc(`Thẻ đóng </${closeName}> không khớp với <${top.tagName}>.`);
        }
        continue;
      }

      const selfClosing = inside.endsWith('/');
      const tagBody = selfClosing ? inside.slice(0, -1).trim() : inside;
      const spaceIdx = tagBody.search(/\s/);
      const tagName = spaceIdx === -1 ? tagBody : tagBody.slice(0, spaceIdx);
      const attrStr = spaceIdx === -1 ? '' : tagBody.slice(spaceIdx + 1);

      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(tagName)) {
        return makeErrorDoc(`Tên thẻ không hợp lệ: ${tagName}`);
      }

      const attrs = parseXmlAttributes(attrStr);
      if (attrs === null) {
        return makeErrorDoc(`Thuộc tính không hợp lệ trong thẻ <${tagName}>.`);
      }

      const el = new MiniXmlNode(1, tagName);
      el.attributes = attrs;

      if (stack.length === 0) {
        if (rootEl) return makeErrorDoc('XML có nhiều hơn một phần tử gốc.');
        rootEl = el;
        doc.appendChild(el);
        doc.documentElement = el;
      } else {
        stack[stack.length - 1].appendChild(el);
      }

      if (!selfClosing) {
        stack.push(el);
      }
    }

    if (stack.length > 0 || !rootEl) {
      return makeErrorDoc('Thẻ XML chưa được đóng đầy đủ.');
    }
    if (mimeType && mimeType !== 'image/svg+xml' && mimeType !== 'text/xml') {
      return makeErrorDoc('MIME type không được hỗ trợ.');
    }
    return doc;
  }
}

class ShimXMLSerializer {
  serializeToString(node) {
    if (!node) return '';
    if (node.nodeType === 3) {
      return escapeXmlText(node.textContent);
    }
    if (node.nodeType === 7) {
      return `<?${node.tagName} ${node.textContent}?>`;
    }
    if (node.nodeType === 4) {
      return `<![CDATA[${node.textContent}]]>`;
    }
    if (node.nodeType !== 1) return '';
    const attrsStr = node.attributes
      .map((a) => ` ${a.name}="${escapeXmlAttr(a.value)}"`)
      .join('');
    if (node.children.length === 0) {
      return `<${node.tagName}${attrsStr}/>`;
    }
    const inner = node.children.map((ch) => this.serializeToString(ch)).join('');
    return `<${node.tagName}${attrsStr}>${inner}</${node.tagName}>`;
  }
}

/**
 * Nạp mã thật của `engine/agy_security.js` vào `node:vm` bên trong Master IIFE
 * nhận lexical `__AGY_BOOT__`, trả về `{ internalSec, window, sandbox }`.
 */
function loadSecurityInVm(options = {}) {
  const {
    boot = { authToken: 'tok_secret_256bit_demo', assetBase: 'http://127.0.0.1:43210/assets', syncFromDaemon: true, initialConfig: null },
    windowProps = {},
    withDomParser = true
  } = options;

  const win = { ...windowProps };
  const sandbox = {
    window: win,
    atob: (b64) => Buffer.from(String(b64), 'base64').toString('binary'),
    btoa: (bin) => Buffer.from(String(bin), 'binary').toString('base64'),
    __AGY_INJECT_BOOT__: boot,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Math,
    JSON,
    encodeURIComponent,
    decodeURIComponent
  };
  if (withDomParser) {
    sandbox.DOMParser = ShimDOMParser;
    sandbox.XMLSerializer = ShimXMLSerializer;
  }

  const ctx = vm.createContext(sandbox);
  const wrapped = `
    (function(__AGY_BOOT__) {
      ${SECURITY_SRC}
      return __AGY_SEC__;
    })(typeof __AGY_INJECT_BOOT__ !== 'undefined' ? __AGY_INJECT_BOOT__ : null);
  `;
  const internalSec = vm.runInContext(wrapped, ctx);
  return { internalSec, window: win, sandbox, ctx };
}

function toHost(val) {
  return val === undefined ? undefined : JSON.parse(JSON.stringify(val));
}

// ============================================================================
// BỘ KIỂM THỬ F04 — `agy_security.js`
// ============================================================================

describe('F04 — Bảo Mật, Closure Vault & Sanitizer (`engine/agy_security.js`)', () => {

  describe('Tier 1 — Phủ Tính Năng Cơ Bản', () => {
    it('[F04-T1-01] Closure Vault cô lập token, xóa 3 legacy globals & đóng băng 12 API công khai trên window.__AGY_SEC__', () => {
      const { internalSec, window } = loadSecurityInVm({
        boot: {
          authToken: 'secret_token_256_abc',
          assetBase: 'http://127.0.0.1:45678/assets',
          syncFromDaemon: true,
          initialConfig: { themeName: 'Shinobu', dimming: 35 }
        },
        windowProps: {
          __AGY_ASSET_BASE__: 'http://legacy.local/assets',
          __AGY_INITIAL_CONFIG__: { themeName: 'Legacy' },
          __AGY_AUTH_TOKEN__: 'legacy_leaked_token'
        }
      });

      // 3 biến legacy phải bị xóa hoàn toàn khỏi window
      assert.equal('__AGY_ASSET_BASE__' in window, false, 'Phải xóa window.__AGY_ASSET_BASE__');
      assert.equal('__AGY_INITIAL_CONFIG__' in window, false, 'Phải xóa window.__AGY_INITIAL_CONFIG__');
      assert.equal('__AGY_AUTH_TOKEN__' in window, false, 'Phải xóa window.__AGY_AUTH_TOKEN__');

      // Kiểm tra bề mặt công khai bị đóng băng và không rò rỉ token
      const pub = window.__AGY_SEC__;
      assert.ok(pub, 'Phải gắn window.__AGY_SEC__');
      assert.equal(Object.isFrozen(pub), true, 'window.__AGY_SEC__ phải bị Object.freeze');
      const expectedPubKeys = [
        'getAssetBase', 'getInitialConfig', 'isSyncFromDaemon', 'escapeHtml',
        'isDangerousKey', 'stripProtoKeys', 'sanitizeCssUrl', 'sanitizeCssValue',
        'sanitizeSvgMarkup', 'sanitizeThemeDefinition', 'sanitizeConfigObject', 'resolveAssetUrl'
      ].sort();
      assert.deepEqual(Object.keys(pub).sort(), expectedPubKeys, 'publicSecApi phải gồm đúng 12 phương thức an toàn không chứa secret API');
      assert.equal(pub.getAuthToken, undefined, 'Không được lộ getAuthToken trên window.__AGY_SEC__');
      assert.equal(pub.authHeaders, undefined, 'Không được lộ authHeaders trên window.__AGY_SEC__');
      assert.equal(pub.saveConfigSecure, undefined, 'Không được lộ saveConfigSecure trên window.__AGY_SEC__');

      // Kiểm tra API nội bộ trong lexical closure hoạt động đúng và authHeaders không mutate object truyền vào
      assert.equal(internalSec.getAuthToken(), 'secret_token_256_abc');
      assert.equal(pub.getAssetBase(), 'http://127.0.0.1:45678/assets');
      assert.equal(pub.isSyncFromDaemon(), true);
      const extra = { Accept: 'application/json' };
      const headers = internalSec.authHeaders(extra);
      assert.equal(headers['X-Agy-Token'], 'secret_token_256_abc');
      assert.equal(headers.Accept, 'application/json');
      assert.equal('X-Agy-Token' in extra, false, 'authHeaders không được làm biến đổi object extra đầu vào');
    });

    it('[F04-T1-02] saveConfigSecure làm sạch cấu hình & đóng gói token gửi binding window.agySaveThemeConfig', () => {
      let capturedJson = null;
      const { internalSec, window } = loadSecurityInVm({
        boot: { authToken: 'cdp_token_999', assetBase: '', syncFromDaemon: false },
        windowProps: {
          agySaveThemeConfig(jsonStr) {
            capturedJson = jsonStr;
          }
        }
      });

      const dirtyCfg = JSON.parse('{"themeName":"  Shinobu  ","dimming":0.4,"glassBlur":6,"customWp":"javascript:alert(1)","__proto__":{"polluted":true},"extraTrash":"ignored"}');
      const ok = internalSec.saveConfigSecure(dirtyCfg);
      assert.equal(ok, true, 'saveConfigSecure phải trả về true khi binding hoạt động');
      assert.equal(typeof capturedJson, 'string');

      const parsed = JSON.parse(capturedJson);
      assert.equal(parsed.__agyToken, 'cdp_token_999');
      assert.equal(parsed.config.themeName, 'Shinobu');
      assert.equal(parsed.config.dimming, 40, 'dimming dạng 0..1 phải quy đổi sang phần trăm');
      assert.equal(parsed.config.glassBlur, 6);
      assert.equal(parsed.config.customWp, '', 'URL nguy hiểm trong config phải bị xóa sạch');
      assert.equal(parsed.config.extraTrash, undefined, 'Trường lạ không nằm trong schema phải bị loại');

      // Khi thiếu binding trả về false
      delete window.agySaveThemeConfig;
      assert.equal(internalSec.saveConfigSecure({ dimming: 30 }), false, 'Thiếu agySaveThemeConfig phải trả false');
    });

    it('[F04-T1-03] escapeHtml & sanitizeCssValue xử lý chính xác các đầu vào hợp lệ', () => {
      const { internalSec } = loadSecurityInVm();
      assert.equal(
        internalSec.escapeHtml(`<div class="a" data-x='b'>&</div>`),
        '&lt;div class=&quot;a&quot; data-x=&#39;b&#39;&gt;&amp;&lt;/div&gt;'
      );
      assert.equal(internalSec.escapeHtml(0), '0', 'Số 0 phải giữ nguyên thành "0"');
      assert.equal(internalSec.escapeHtml(false), 'false', 'Boolean false phải giữ thành "false"');
      assert.equal(internalSec.escapeHtml(null), '', 'null phải trả về chuỗi rỗng');

      assert.equal(internalSec.sanitizeCssValue('#c084fc'), '#c084fc');
      assert.equal(internalSec.sanitizeCssValue('rgba(192, 132, 252, 0.45)'), 'rgba(192, 132, 252, 0.45)');
      assert.equal(internalSec.sanitizeCssValue('linear-gradient(135deg, #111 0%, #c084fc 100%)'), 'linear-gradient(135deg, #111 0%, #c084fc 100%)');
      assert.equal(internalSec.sanitizeCssValue(0), '0');
      assert.equal(internalSec.sanitizeCssValue(12), '12');
      assert.equal(internalSec.sanitizeCssValue('', '#fallback'), '#fallback');
      assert.equal(internalSec.sanitizeCssValue(null, '#fallback'), '#fallback');
    });

    it('[F04-T1-04] sanitizeCssUrl & resolveAssetUrl chấp nhận đúng các URL local daemon, relative & data URI sạch', () => {
      const { internalSec } = loadSecurityInVm({
        boot: { authToken: 't', assetBase: 'http://127.0.0.1:43210/' }
      });

      assert.equal(
        internalSec.sanitizeCssUrl('http://127.0.0.1:43210/assets/shinobu.webp?v=abcd1234'),
        'http://127.0.0.1:43210/assets/shinobu.webp?v=abcd1234'
      );
      assert.equal(internalSec.sanitizeCssUrl('./themes/assets/logo.png'), './themes/assets/logo.png');
      assert.equal(
        internalSec.sanitizeCssUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      );

      const cleanSvgUri = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5"/></svg>');
      assert.equal(internalSec.sanitizeCssUrl(cleanSvgUri), cleanSvgUri);

      // resolveAssetUrl khi có _assetBase
      assert.equal(internalSec.resolveAssetUrl('assets/yoriichi_avatar.jpg'), 'http://127.0.0.1:43210/assets/yoriichi_avatar.jpg');
      assert.equal(internalSec.resolveAssetUrl('themes/assets/shinobu.svg'), 'http://127.0.0.1:43210/assets/shinobu.svg');

      // resolveAssetUrl khi _assetBase rỗng
      const { internalSec: secNoBase } = loadSecurityInVm({ boot: { authToken: '', assetBase: '' } });
      assert.equal(secNoBase.resolveAssetUrl('assets/yoriichi_avatar.jpg'), './themes/assets/yoriichi_avatar.jpg');
      assert.equal(secNoBase.resolveAssetUrl('none'), '');
    });

    it('[F04-T1-05] sanitizeSvgMarkup với DOMParser & XMLSerializer giữ nguyên SVG sạch & loại bỏ BOM', () => {
      const { internalSec } = loadSecurityInVm({ withDomParser: true });
      const rawSvg = '\uFEFF<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="grad1"><stop offset="0%" stop-color="#fff"/></linearGradient></defs><path d="M0 0 L10 10" fill="url(#grad1)"/><use href="#grad1"/><image href="data:image/png;base64,AAAA"/></svg>';
      const out = internalSec.sanitizeSvgMarkup(rawSvg);

      assert.ok(out.startsWith('<svg'), 'Đầu ra phải bắt đầu trực tiếp bằng <svg (đã bỏ BOM)');
      assert.ok(!out.includes('\uFEFF'), 'Không còn ký tự BOM');
      assert.ok(out.includes('linearGradient'), 'Phải giữ lại linearGradient');
      assert.ok(out.includes('href="#grad1"'), 'Phải giữ lại local fragment #grad1');
      assert.ok(out.includes('data:image/png;base64,AAAA'), 'Phải giữ lại raster base64 an toàn');
    });

    it('[F04-T1-06] stripProtoKeys loại bỏ khóa __proto__, constructor, prototype ở nhiều tầng lồng nhau', () => {
      const { internalSec, sandbox } = loadSecurityInVm();
      const malicious = JSON.parse('{"ok":1,"__proto__":{"isAdmin":true},"nested":{"constructor":{"prototype":{"hacked":true}},"prototype":{"x":2},"safe":"yes"},"arr":[{"__proto__":{"bad":1},"val":42}]}');
      const cleaned = internalSec.stripProtoKeys(malicious);

      assert.equal(cleaned.ok, 1);
      assert.equal(cleaned.nested.safe, 'yes');
      assert.equal(cleaned.arr[0].val, 42);
      assert.equal(Object.prototype.hasOwnProperty.call(cleaned, '__proto__'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(cleaned.nested, 'constructor'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(cleaned.nested, 'prototype'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(cleaned.arr[0], '__proto__'), false);
      assert.equal(({}).isAdmin, undefined, 'Object.prototype không bị ô nhiễm');
      assert.equal(vm.runInNewContext('({}).hacked', sandbox), undefined);
    });

    it('[F04-T1-07] sanitizeThemeDefinition & sanitizeConfigObject chuẩn hóa đầy đủ trường hợp lệ', () => {
      const { internalSec } = loadSecurityInVm();
      const th = internalSec.sanitizeThemeDefinition({
        primary: '#c084fc',
        accent: '#5eead4',
        secondary: '#38bdf8',
        wallpaper: './themes/assets/bg.jpg',
        isOrnament: true,
        isForged: true,
        concept: 'Tử Đằng Đêm Trăng',
        fxMode: 'wisteria_royal!',
        defaultDimming: 0.4,
        glassAlpha: 0.65,
        stickerW: 140,
        stickerH: 64,
        stickerTop: -56,
        stickerRight: 0,
        unknownKey: 'drop_me'
      });

      assert.equal(th.primary, '#c084fc');
      assert.equal(th.secondary, '#38bdf8');
      assert.equal(th.wallpaper, './themes/assets/bg.jpg');
      assert.equal(th.isOrnament, true);
      assert.equal(th.fxMode, 'wisteria_royal', 'fxMode phải lọc bỏ ký tự ngoài [a-zA-Z0-9_-]');
      assert.equal(th.defaultDimming, 40, '0.4 phải chuẩn hóa thành 40');
      assert.equal(th.glassAlpha, 0.65);
      assert.equal(th.stickerRight, 0, 'Giá trị 0 hợp lệ của stickerRight phải được giữ nguyên');
      assert.equal(th.unknownKey, undefined);

      const cfg = internalSec.sanitizeConfigObject({
        themeName: '  Shinobu  ',
        bubbleName: '  Yoriichi  ',
        inputStyle: 'double_gold',
        masterPersona: 'shadow_monarch',
        dimming: 45,
        glassBlur: 0,
        avatarSize: 36,
        avatarRadius: 0,
        wpEnabled: true,
        transparentWorld: false,
        userAvatar: 'none',
        activeForgedTheme: { name: 'Vũ Trụ Tím', primary: '#c084fc', defaultDimming: 30 }
      });

      assert.equal(cfg.themeName, 'Shinobu');
      assert.equal(cfg.glassBlur, 0, 'glassBlur = 0 phải được giữ nguyên');
      assert.equal(cfg.avatarRadius, 0, 'avatarRadius = 0 phải được giữ nguyên');
      assert.equal(cfg.userAvatar, 'none');
      assert.equal(cfg.transparentWorld, false);
      assert.equal(cfg.activeForgedTheme.isForged, true);
      assert.equal(cfg.activeForgedTheme.name, 'Vũ Trụ Tím');
    });

    it('[F04-T1-08] sanitizeThemeDefinition bảo toàn cấu trúc object theo danh mục của npc.dialogs & npc.replies', () => {
      const { internalSec } = loadSecurityInVm();
      const th = internalSec.sanitizeThemeDefinition({
        primary: '#facc15',
        npc: {
          title: 'Trùng Trụ Shinobu',
          badgeLabel: '🦋 Shinobu',
          placeholder: 'Nhắn gì đó...',
          pills: [{ key: 'act1', label: '✨ Cổ vũ' }],
          dialogs: {
            welcome: ['Chào bạn!', 'Hôm nay thế nào?'],
            crisis: ['Bình tĩnh xử lý lỗi nhé!'],
            slash: 'Chém sạch bug!'
          },
          replies: {
            greet: 'Moshi moshi~',
            bug: ['Gửi log vào đây nhé!', 'Kiểm tra stack trace nào!']
          }
        }
      });

      assert.equal(Array.isArray(th.npc.dialogs), false, 'npc.dialogs dạng object phải giữ nguyên cấu trúc object theo danh mục');
      assert.deepEqual(toHost(th.npc.dialogs.welcome), ['Chào bạn!', 'Hôm nay thế nào?']);
      assert.deepEqual(toHost(th.npc.dialogs.crisis), ['Bình tĩnh xử lý lỗi nhé!']);
      assert.deepEqual(toHost(th.npc.dialogs.slash), ['Chém sạch bug!'], 'Chuỗi đơn trong danh mục dialogs phải được chuẩn hóa thành mảng 1 phần tử');
      assert.equal(th.npc.replies.greet, 'Moshi moshi~');
      assert.deepEqual(toHost(th.npc.replies.bug), ['Gửi log vào đây nhé!', 'Kiểm tra stack trace nào!']);

      // Trường hợp legacy: dialogs truyền vào là Array -> quy về { welcome: [...] }
      const thArr = internalSec.sanitizeThemeDefinition({
        npc: { dialogs: ['Dòng 1', 'Dòng 2'] }
      });
      assert.deepEqual(toHost(thArr.npc.dialogs), { welcome: ['Dòng 1', 'Dòng 2'] });
    });
  });

  describe('Tier 2 — Biên, Góc Khuất & Tấn Công Bảo Mật Nâng Cao', () => {
    it('[F04-T2-01] sanitizeCssValue chặn XSS Attribute Breakout (" và \') cùng CSS Injection & giới hạn 260 ký tự', () => {
      const { internalSec } = loadSecurityInVm();
      const vectors = [
        'red" onclick="alert(1)',
        "#fff' onmouseover='alert(1)",
        '1px solid red; background:url(javascript:alert(1))',
        'expression(alert(1))',
        '@import "https://evil.test/x.css"',
        'url(https://evil.test/bg.png)',
        '/*comment*/red',
        'javascript:alert(1)',
        'rgb(0,0,0)<script>',
        '{color:red}',
        'a'.repeat(261)
      ];

      for (const payload of vectors) {
        assert.equal(
          internalSec.sanitizeCssValue(payload, '__SAFE_FB__'),
          '__SAFE_FB__',
          `sanitizeCssValue phải chặn và trả fallback cho payload nguy hiểm: ${payload.slice(0, 60)}`
        );
      }
      assert.equal(internalSec.sanitizeCssValue('a'.repeat(260), '__SAFE_FB__'), 'a'.repeat(260), 'Chuỗi đúng biên 260 ký tự phải được chấp nhận');
    });

    it('[F04-T2-02] sanitizeCssUrl chặn SVG XSS nâng cao (<style>@import, <use href=https>, <set attributeName=onmouseover>, <audio/video/canvas>) & URL ngoài', () => {
      const { internalSec } = loadSecurityInVm();
      const svgBase64 = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
      const svgPlain = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

      const badUrls = [
        svgBase64('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        svgPlain('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>'),
        svgBase64('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'),
        svgPlain('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"></a></svg>'),
        svgBase64('<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.test/x.css);</style></svg>'),
        svgPlain('<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.test/x.svg#a"/></svg>'),
        svgBase64('<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="onmouseover" to="alert(1)"/></svg>'),
        svgPlain('<svg xmlns="http://www.w3.org/2000/svg"><audio src="x"/></svg>'),
        svgPlain('<svg xmlns="http://www.w3.org/2000/svg"><video src="x"/></svg>'),
        svgPlain('<svg xmlns="http://www.w3.org/2000/svg"><canvas/></svg>'),
        'data:text/html,<script>alert(1)</script>',
        'https://evil.com/assets/a.png',
        'http://localhost:43210/assets/a.png',
        'http://127.0.0.1:43210/assets/../../etc/passwd',
        'assets/../../../secret.txt',
        'javascript:alert(1)'
      ];

      for (const url of badUrls) {
        assert.equal(
          internalSec.sanitizeCssUrl(url),
          '',
          `sanitizeCssUrl phải từ chối URL/SVG nguy hiểm: ${url.slice(0, 90)}`
        );
      }
    });

    it('[F04-T2-03] sanitizeSvgMarkup tước bỏ triệt để thẻ/thuộc tính độc hại (<style>@import, <set attributeName=onmouseover>, <use xlink:href=https>) & kiểm tra biên XML', () => {
      const { internalSec } = loadSecurityInVm({ withDomParser: true });

      const dirtySvg = [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">',
        '<script>alert(1)</script>',
        '<foreignObject><body>bad</body></foreignObject>',
        '<iframe src="https://evil.test"></iframe>',
        '<object data="x"></object><embed src="x"/>',
        '<audio src="x"></audio><video src="x"></video><canvas></canvas>',
        '<style>@import url("https://evil.test/x.css");</style>',
        '<set attributeName="onmouseover" to="alert(1)"/>',
        '<animate attributeName="href" values="javascript:alert(1)"/>',
        '<use xlink:href="https://evil.test/x.svg#bad"/>',
        '<a href="&#x6a;avascript:alert(1)"><circle cx="16" cy="16" r="8" onclick="evil()"/></a>',
        '</svg>'
      ].join('');

      const clean = internalSec.sanitizeSvgMarkup(dirtySvg);
      assert.ok(clean.startsWith('<svg'), 'Phải trả về cây <svg> đã làm sạch phần tử an toàn (<circle>)');
      assert.equal(/<script|<foreignobject|<iframe|<object|<embed|<audio|<video|<canvas/i.test(clean), false, 'Không được còn thẻ cấm');
      assert.equal(/\son[a-z]+\s*=/i.test(clean), false, 'Không được còn thuộc tính sự kiện on*');
      assert.equal(/javascript:/i.test(clean), false, 'Không được còn javascript: URI');
      assert.equal(/(?:href|xlink:href)=["']https?:\/\//i.test(clean), false, 'Không được còn href/xlink:href trỏ ra ngoài');
      assert.equal(/@import/i.test(clean), false, 'Không được còn <style>@import</style> trong SVG');
      assert.equal(/attributeName="on/i.test(clean), false, 'Không được còn <set>/<animate> gán sự kiện on*');

      // Các ca biên trả về rỗng
      assert.equal(internalSec.sanitizeSvgMarkup('<svg><g></svg>'), '', 'XML hỏng (parsererror) phải trả về rỗng');
      assert.equal(internalSec.sanitizeSvgMarkup('<div><svg/></div>'), '', 'Root không phải <svg> phải trả về rỗng');
      assert.equal(internalSec.sanitizeSvgMarkup('<svg>' + 'a'.repeat(1024 * 1024 + 10) + '</svg>'), '', 'SVG vượt quá 1MB phải trả về rỗng');
    });

    it('[F04-T2-04] sanitizeSvgMarkup nhánh fallback khi môi trường thiếu DOMParser', () => {
      const { internalSec } = loadSecurityInVm({ withDomParser: false });
      const good = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>';
      assert.equal(internalSec.sanitizeSvgMarkup(good), good);
      assert.equal(internalSec.sanitizeSvgMarkup('<svg onload="alert(1)"></svg>'), '');
      assert.equal(internalSec.sanitizeSvgMarkup('<svg><script>x()</script></svg>'), '');
      assert.equal(internalSec.sanitizeSvgMarkup('<svg><a href="javascript:alert(1)"></a></svg>'), '');
    });

    it('[F04-T2-05] stripProtoKeys giới hạn mảng tối đa 200 phần tử & xử lý biên độ sâu đệ quy an toàn', () => {
      const { internalSec } = loadSecurityInVm();
      const bigArr = Array.from({ length: 250 }, (_, i) => ({ idx: i }));
      const cleanedArr = internalSec.stripProtoKeys(bigArr);
      assert.equal(cleanedArr.length, 200, 'Mảng phải bị cắt đúng tối đa 200 phần tử');
      assert.equal(cleanedArr[199].idx, 199);

      // Tạo object lồng 8 tầng có __proto__ ở tầng thứ 8 (depth = 7)
      let deep8 = JSON.parse('{"__proto__":{"p":1},"leaf":"ok"}');
      for (let i = 0; i < 7; i++) {
        deep8 = { child: deep8 };
      }
      const res8 = internalSec.stripProtoKeys(deep8);
      let cursor = res8;
      for (let i = 0; i < 7; i++) cursor = cursor.child;
      assert.equal(cursor.leaf, 'ok');
      assert.equal(Object.prototype.hasOwnProperty.call(cursor, '__proto__'), false, 'Tại depth <= 8 khóa __proto__ vẫn phải bị lọc');

      // Vượt ngưỡng depth > 8 không ném RangeError / stack overflow
      let deep15 = { val: 'bottom' };
      for (let i = 0; i < 15; i++) deep15 = { next: deep15 };
      assert.doesNotThrow(() => internalSec.stripProtoKeys(deep15));
    });

    it('[F04-T2-06] Giới hạn số lượng danh mục, dòng, độ dài chuỗi & lọc key trong sanitizeNpcDialogs, sanitizeNpcReplies và pills', () => {
      const { internalSec } = loadSecurityInVm();
      const manyDialogs = {};
      for (let i = 0; i < 20; i++) {
        manyDialogs[`cat_${i}!@#`] = Array.from({ length: 20 }, (__, j) => `Dòng_${j}_` + 'x'.repeat(350));
      }
      manyDialogs['!!!'] = ['Key chỉ toàn ký tự đặc biệt phải bị bỏ qua'];

      const manyReplies = {};
      for (let i = 0; i < 30; i++) {
        manyReplies[`rep_${i}`] = Array.from({ length: 15 }, () => 'y'.repeat(350));
      }

      const manyPills = Array.from({ length: 12 }, (_, i) => ({ key: `p_${i}!`, label: `Nhãn ${i}` }));

      const th = internalSec.sanitizeThemeDefinition({
        npc: {
          dialogs: manyDialogs,
          replies: manyReplies,
          pills: manyPills
        }
      });

      const dialogKeys = Object.keys(th.npc.dialogs);
      assert.equal(dialogKeys.length, 16, 'npc.dialogs chỉ được giữ tối đa 16 danh mục');
      assert.equal(dialogKeys.includes('cat_0'), true, 'Tên key danh mục phải bỏ ký tự đặc biệt');
      assert.equal(th.npc.dialogs.cat_0.length, 16, 'Mỗi danh mục dialogs chỉ giữ tối đa 16 dòng');
      assert.equal(th.npc.dialogs.cat_0[0].length, 280, 'Mỗi dòng dialog cắt tối đa 280 ký tự');

      assert.equal(Object.keys(th.npc.replies).length, 24, 'npc.replies chỉ được giữ tối đa 24 keys');
      assert.equal(th.npc.replies.rep_0.length, 12, 'Mỗi key replies dạng mảng chỉ giữ tối đa 12 dòng');
      assert.equal(th.npc.replies.rep_0[0].length, 280, 'Mỗi dòng reply cắt tối đa 280 ký tự');

      assert.equal(th.npc.pills.length, 8, 'npc.pills chỉ giữ tối đa 8 phần tử');
      assert.equal(th.npc.pills[0].key, 'p_0');
    });

    it('[F04-T2-07] Giá trị biên số học, NaN/Infinity & kiểu dữ liệu sai trong sanitizeThemeDefinition & sanitizeConfigObject', () => {
      const { internalSec } = loadSecurityInVm();

      assert.equal(internalSec.sanitizeThemeDefinition([]), null, 'rawTheme là mảng phải trả null');
      assert.equal(internalSec.sanitizeThemeDefinition(null), null, 'rawTheme null phải trả null');
      assert.deepEqual(toHost(internalSec.sanitizeConfigObject([])), {}, 'rawCfg là mảng phải trả {}');

      const thLow = internalSec.sanitizeThemeDefinition({ defaultDimming: 0.05, stickerTop: -200, stickerRight: -10 });
      assert.equal(thLow.defaultDimming, 15, '0.05 -> 5 và clamp lên biên dưới 15');
      assert.equal(thLow.stickerTop, -110, 'stickerTop < -110 phải clamp về -110');
      assert.equal(thLow.stickerRight, 0, 'stickerRight < 0 phải clamp về 0');

      const thNaN = internalSec.sanitizeThemeDefinition({ defaultDimming: NaN, stickerW: Infinity });
      assert.equal(thNaN.defaultDimming, 36, 'NaN defaultDimming fallback về 36');
      assert.equal(thNaN.stickerW, undefined, 'Infinity stickerW phải bị bỏ qua');

      const thHigh = internalSec.sanitizeThemeDefinition({ defaultDimming: 999, stickerTop: 99, stickerRight: 99 });
      assert.equal(thHigh.defaultDimming, 92);
      assert.equal(thHigh.stickerTop, 24);
      assert.equal(thHigh.stickerRight, 64);

      const cfg = internalSec.sanitizeConfigObject({
        masterPersona: '!!!@@@',
        glassBlur: -5,
        dimming: 999,
        avatarSize: 5,
        avatarRadius: 120
      });
      assert.equal(cfg.masterPersona, 'yoriichi', 'masterPersona sau lọc rỗng phải fallback về yoriichi');
      assert.equal(cfg.glassBlur, 0);
      assert.equal(cfg.dimming, 92);
      assert.equal(cfg.avatarSize, 22);
      assert.equal(cfg.avatarRadius, 50);
    });

    it('[F04-T2-08] Biên Closure Vault khi __AGY_BOOT__ null/sai kiểu & agySaveThemeConfig ném ngoại lệ', () => {
      const { internalSec, window } = loadSecurityInVm({
        boot: { authToken: 12345, assetBase: null, syncFromDaemon: 0, initialConfig: ['invalid'] },
        windowProps: {
          agySaveThemeConfig() {
            throw new Error('IPC error');
          }
        }
      });

      assert.equal(internalSec.getAuthToken(), '', 'authToken không phải string phải fallback thành rỗng');
      assert.equal(window.__AGY_SEC__.getAssetBase(), '');
      assert.deepEqual(toHost(window.__AGY_SEC__.getInitialConfig()), {}, 'initialConfig là Array phải được sanitize thành {}');
      assert.deepEqual(toHost(internalSec.authHeaders({ 'X-Test': '1' })), { 'X-Test': '1' }, 'Token rỗng không được gắn header X-Agy-Token');
      assert.equal(internalSec.saveConfigSecure({ dimming: 40 }), false, 'saveConfigSecure phải bắt lỗi binding và trả false');
    });

    it('[F04-T2-09] Không đọc boot.token kiểu cũ & chống ghi đè Object.freeze trên window.__AGY_SEC__', () => {
      const { internalSec, window, sandbox } = loadSecurityInVm({
        boot: { token: 'legacy_only_token' } // cố tình thiếu authToken
      });
      assert.equal(internalSec.getAuthToken(), '', 'Chỉ đọc boot.authToken, không chấp nhận boot.token');

      vm.runInNewContext(`
        try { window.__AGY_SEC__.getAuthToken = function() { return 'hacked'; }; } catch (_) {}
        try { window.__AGY_SEC__.escapeHtml = function(x) { return x; }; } catch (_) {}
      `, vm.createContext(sandbox));
      assert.equal(window.__AGY_SEC__.getAuthToken, undefined, 'Không thể gắn thêm hàm lên window.__AGY_SEC__ đã đóng băng');
      assert.equal(window.__AGY_SEC__.escapeHtml('<'), '&lt;', 'Không thể thay thế hàm sanitizer trên window.__AGY_SEC__');
    });

    it('[F04-T2-10] Chặn kỹ thuật né bộ lọc SVG/CSS bằng comment (/**/) & hàm image-set / cross-fade / element', () => {
      const { internalSec } = loadSecurityInVm({ withDomParser: true });
      const { internalSec: secFallback } = loadSecurityInVm({ withDomParser: false });
      const svgBase64 = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

      const bypassCases = [
        '<svg xmlns="http://www.w3.org/2000/svg"><style>@im/**/port "https://evil.test/x.css";</style><circle r="5"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{background:u/**/rl(https://evil.test/leak)}</style><circle r="5"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><rect style="width:expr/**/ession(alert(1))"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{background-image:image-set("https://evil.test/x.png" 1x)}</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><rect style="background-image:-webkit-image-set(\'https://evil.test/x.png\' 1x)"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{background-image:cross-fade(url(https://evil.test/a.png), url(#ok))}</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{background:element(#x)}</style></svg>'
      ];

      for (const svg of bypassCases) {
        assert.equal(internalSec.sanitizeCssUrl(svgBase64(svg)), '', `sanitizeCssUrl phải chặn SVG CSS bypass: ${svg}`);
        assert.equal(secFallback.sanitizeCssUrl(svgBase64(svg)), '', `Fallback sanitizeCssUrl phải chặn SVG CSS bypass: ${svg}`);
        const cleanedDom = internalSec.sanitizeSvgMarkup(svg);
        assert.equal(/@im|u\/\*\*\/rl|expr\/\*\*\/ession|image-set|cross-fade|element\(/i.test(cleanedDom), false, `sanitizeSvgMarkup (DOM) không được giữ payload nguy hiểm: ${cleanedDom}`);
        assert.equal(secFallback.sanitizeSvgMarkup(svg), '', `sanitizeSvgMarkup (fallback) phải từ chối SVG chứa CSS nguy hiểm: ${svg}`);
      }
    });

    it('[F04-T2-11] Nhánh fallback (withDomParser=false) chặn thuộc tính chứa dấu > nhằm ẩn onclick & từ chối thẻ lỗi', () => {
      const { internalSec } = loadSecurityInVm({ withDomParser: false });
      assert.equal(
        internalSec.sanitizeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><rect data-x="1>2" onclick="alert(1)"/></svg>'),
        '',
        'Dấu > trong thuộc tính data-x="1>2" không được cắt ngang trình quét làm lọt onclick'
      );
      assert.equal(
        internalSec.sanitizeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><style data-x="1>2">@im/**/port "x";</style></svg>'),
        '',
        'Thẻ <style> có thuộc tính chứa > vẫn phải bị kiểm tra CSS bên trong'
      );
      assert.equal(
        internalSec.sanitizeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><rect data-x="unclosed/></svg>'),
        '',
        'Thuộc tính không đóng dấu nháy phải fail-closed trả về rỗng'
      );
      const validWithGt = '<svg xmlns="http://www.w3.org/2000/svg"><rect data-label="a>b" width="10" height="10"/></svg>';
      assert.equal(internalSec.sanitizeSvgMarkup(validWithGt), validWithGt, 'Thuộc tính an toàn chứa > hợp lệ vẫn phải được giữ nguyên');
    });

    it('[F04-T2-12] Chặn <?xml-stylesheet ...?> & mọi Processing Instruction lạ trong SVG, giữ XML declaration hợp lệ', () => {
      const { internalSec } = loadSecurityInVm({ withDomParser: true });
      const { internalSec: secFallback } = loadSecurityInVm({ withDomParser: false });

      const evilPi = '<?xml-stylesheet href="https://evil.test/x.xsl"?><svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>';
      const evilPiUrl = `data:image/svg+xml,${encodeURIComponent(evilPi)}`;
      const evilPiB64 = `data:image/svg+xml;base64,${Buffer.from(evilPi, 'utf8').toString('base64')}`;

      assert.equal(internalSec.sanitizeSvgMarkup(evilPi), '');
      assert.equal(secFallback.sanitizeSvgMarkup(evilPi), '');
      assert.equal(internalSec.sanitizeCssUrl(evilPiUrl), '');
      assert.equal(secFallback.sanitizeCssUrl(evilPiB64), '');

      const validDecl = '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="2"/></svg>';
      assert.ok(internalSec.sanitizeSvgMarkup(validDecl).includes('<circle'));
      assert.equal(secFallback.sanitizeSvgMarkup(validDecl), validDecl);
    });

    it('[F04-T2-13] sanitizeConfigObject xử lý activeForgedBubbleTheme (hợp lệ, null, và từ chối tên __proto__)', () => {
      const { internalSec } = loadSecurityInVm();
      const validCfg = internalSec.sanitizeConfigObject({
        bubbleName: 'Bong_Bong_Rieng',
        activeForgedBubbleTheme: {
          name: 'Bong_Bong_Rieng',
          primary: '#38bdf8',
          frameBg: 'rgba(15, 23, 42, 0.85)',
          wallpaper: 'javascript:alert(1)'
        }
      });
      assert.ok(validCfg.activeForgedBubbleTheme);
      assert.equal(validCfg.activeForgedBubbleTheme.name, 'Bong_Bong_Rieng');
      assert.equal(validCfg.activeForgedBubbleTheme.isForged, true);
      assert.equal(validCfg.activeForgedBubbleTheme.primary, '#38bdf8');
      assert.equal(validCfg.activeForgedBubbleTheme.wallpaper, '');

      const nullCfg = internalSec.sanitizeConfigObject({ activeForgedBubbleTheme: null });
      assert.equal(nullCfg.activeForgedBubbleTheme, null);

      const protoCfg = internalSec.sanitizeConfigObject({
        activeForgedBubbleTheme: { name: '__proto__', primary: '#ff0000' }
      });
      assert.equal(protoCfg.activeForgedBubbleTheme, undefined, 'activeForgedBubbleTheme có tên __proto__ phải bị từ chối');
    });

    it('[F04-T2-14] sanitizeCssUrl xử lý double-encoded SVG & UTF-8 multibyte base64 SVG', () => {
      const { internalSec } = loadSecurityInVm();
      const doubleEvil = 'data:image/svg+xml,' + encodeURIComponent(encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>x()</script></svg>'));
      assert.equal(internalSec.sanitizeCssUrl(doubleEvil), '', 'SVG double-encoded chứa XSS phải bị chặn');

      const utf8Svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>Điệp Phủ Nhật Luân 🦋</title><circle cx="8" cy="8" r="4"/></svg>';
      const b64Utf8 = `data:image/svg+xml;base64,${Buffer.from(utf8Svg, 'utf8').toString('base64')}`;
      assert.equal(internalSec.sanitizeCssUrl(b64Utf8), b64Utf8, 'SVG base64 UTF-8 multibyte sạch phải được chấp nhận');
    });

    it('[F04-T2-15] Lọc đầy đủ DANGEROUS_KEYS (hasOwnProperty, toString, __defineGetter__) trong stripProtoKeys, config & npc.pills', () => {
      const { internalSec } = loadSecurityInVm();
      const dirtyObj = JSON.parse('{"hasOwnProperty":"bad","toString":"bad","__defineGetter__":"bad","ok":1}');
      const cleanObj = internalSec.stripProtoKeys(dirtyObj);
      assert.deepEqual(Object.keys(cleanObj), ['ok'], 'stripProtoKeys phải loại bỏ hasOwnProperty, toString, __defineGetter__');
      assert.equal(typeof cleanObj.hasOwnProperty, 'function');

      const cleanCfg = internalSec.sanitizeConfigObject({
        themeName: 'hasOwnProperty',
        bubbleName: '__defineGetter__'
      });
      assert.equal(cleanCfg.themeName, undefined);
      assert.equal(cleanCfg.bubbleName, undefined);

      const cleanTheme = internalSec.sanitizeThemeDefinition({
        npc: {
          pills: [
            { key: 'hasOwnProperty', label: 'Xấu 1' },
            { key: 'toString', label: 'Xấu 2' },
            { key: '__defineGetter__', label: 'Xấu 3' },
            { key: 'act1', label: 'Hợp lệ' }
          ]
        }
      });
      assert.deepEqual(toHost(cleanTheme.npc.pills), [{ key: 'act1', label: 'Hợp lệ' }]);
    });

    it('[F04-T2-16] Chặn Comment Attribute Smuggling (data-a="<!--"...data-b="-->") & PI/CDATA ở cả DOMParser lẫn fallback', () => {
      const { internalSec: secDom } = loadSecurityInVm({ withDomParser: true });
      const { internalSec: secNoDom } = loadSecurityInVm({ withDomParser: false });
      const svgBase64 = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

      const smugglePayloads = [
        '<svg xmlns="http://www.w3.org/2000/svg" data-a="<!--"><script>alert(1)</script><rect data-b="-->"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" data-a="<!--"><rect onload="alert(1)" data-b="-->"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" data-a="<!--"><style>@import "https://evil.test/x.css";</style><rect data-b="-->"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" data-a="<!--"><?xml-stylesheet href="https://evil.test/x.xsl"?><rect data-b="-->"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style><!--</style><script>alert(1)</script><style>--></style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><text><![CDATA[<script>alert(1)</script>]]></text></svg>'
      ];

      for (const payload of smugglePayloads) {
        assert.equal(secNoDom.sanitizeSvgMarkup(payload), '', `Fallback phải chặn Comment Smuggling/CDATA/PI: ${payload}`);
        assert.equal(secNoDom.sanitizeCssUrl(svgBase64(payload)), '', `Fallback sanitizeCssUrl phải chặn: ${payload}`);

        const domOut = secDom.sanitizeSvgMarkup(payload);
        assert.equal(/<script|onload=|@import|<\?xml-stylesheet|<!\[CDATA\[/i.test(domOut), false, `DOMParser không được để lọt payload: ${domOut}`);
        assert.equal(secDom.sanitizeCssUrl(svgBase64(payload)), '', `DOMParser sanitizeCssUrl phải chặn: ${payload}`);
      }

      // Kiểm tra SVG sạch có comment XML thật ngoài thẻ vẫn hoạt động an toàn
      const cleanWithComments = '<!-- Hoa van sach --><svg xmlns="http://www.w3.org/2000/svg"><!-- vong tron --><circle cx="8" cy="8" r="4"/></svg>';
      const outDom = secDom.sanitizeSvgMarkup(cleanWithComments);
      const outNoDom = secNoDom.sanitizeSvgMarkup(cleanWithComments);
      assert.ok(outDom.includes('<circle') && !outDom.includes('<!--'));
      assert.ok(outNoDom.includes('<circle') && !outNoDom.includes('<!--'));
    });

    it('[F04-T2-17] Chặn CSS4 image(), -moz-element(), cross-fade(), ngoặc ) lệch & isDangerousKey cho inputStyle/masterPersona/fxMode', () => {
      const { internalSec: secDom } = loadSecurityInVm({ withDomParser: true });
      const { internalSec: secNoDom } = loadSecurityInVm({ withDomParser: false });
      const svgBase64 = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

      const svgCss4Image = '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{background-image:image("https://evil.test/leak.png")}</style><circle r="5"/></svg>';
      assert.equal(secDom.sanitizeCssUrl(svgBase64(svgCss4Image)), '');
      assert.equal(secNoDom.sanitizeCssUrl(svgBase64(svgCss4Image)), '');
      assert.equal(secDom.sanitizeSvgMarkup(svgCss4Image).includes('image('), false);
      assert.equal(secNoDom.sanitizeSvgMarkup(svgCss4Image), '');

      // Kiểm tra sanitizeCssValue
      const badCssValues = [
        'image("https://evil.test/x.png")',
        '-moz-element(#x)',
        'element(#x)',
        'cross-fade(url(x), red)',
        '-webkit-image-set("x" 1x)',
        'red)',
        'rgba(1, 2, 3))',
        'linear-gradient(180deg, #111, #222'
      ];
      for (const badVal of badCssValues) {
        assert.equal(secDom.sanitizeCssValue(badVal, '__SAFE__'), '__SAFE__', `sanitizeCssValue phải chặn: ${badVal}`);
      }
      assert.equal(secDom.sanitizeCssValue('linear-gradient(135deg, rgba(192,132,252,0.5), #0f172a)', '__SAFE__'), 'linear-gradient(135deg, rgba(192,132,252,0.5), #0f172a)');

      // Kiểm tra isDangerousKey cho inputStyle, masterPersona, fxMode
      const badCfg = secDom.sanitizeConfigObject({
        inputStyle: '__proto__',
        masterPersona: 'constructor'
      });
      assert.equal(badCfg.inputStyle, undefined, 'inputStyle nguy hiểm phải bị loại bỏ');
      assert.equal(badCfg.masterPersona, 'yoriichi', 'masterPersona nguy hiểm phải fallback về yoriichi');

      const badTheme = secDom.sanitizeThemeDefinition({
        fxMode: '__proto__'
      });
      assert.equal(badTheme.fxMode, undefined, 'fxMode nguy hiểm phải bị loại bỏ');

      const badTheme2 = secDom.sanitizeThemeDefinition({
        fxMode: 'hasOwnProperty'
      });
      assert.equal(badTheme2.fxMode, undefined, 'fxMode là hasOwnProperty phải bị loại bỏ');
    });
  });
});
