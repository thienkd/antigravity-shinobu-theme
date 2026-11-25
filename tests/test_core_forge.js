'use strict';

/**
 * Bộ kiểm thử tự động F05, F06, F07, F08 — Core Engine & AI Theme Forge
 * (`engine/core.js` và `engine/agy_theme_forge.js`)
 * Tuân thủ Zero-Dependency Node.js >= 22 (`node:test`, `node:assert/strict`, `node:vm`).
 * Chạy độc lập: `node --test tests/test_core_forge.js`
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLACEHOLDER = '/*__THEMES_PLACEHOLDER__*/{}';

function readNorm(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
}

const SECURITY_SRC = readNorm('engine/agy_security.js');
const I18N_SRC = readNorm('engine/agy_i18n.js');
const FORGE_SRC = readNorm('engine/agy_theme_forge.js');
const CORE_SRC_TEMPLATE = readNorm('engine/core.js');
const THEMES_JSON = JSON.parse(readNorm('themes/themes.json'));
const CORE_WITH_THEMES_SRC = CORE_SRC_TEMPLATE.replace(PLACEHOLDER, () => JSON.stringify(THEMES_JSON));

const FORGE_BUNDLE_SCRIPT = new vm.Script(`
  (function(__AGY_BOOT__) {
    let __AGY_PRECLEANED__ = false;
    ${SECURITY_SRC}
    ${FORGE_SRC}
    return { sec: __AGY_SEC__ };
  })(typeof __AGY_INJECT_BOOT__ !== 'undefined' ? __AGY_INJECT_BOOT__ : null);
`);

const FULL_CORE_BUNDLE_SCRIPT = new vm.Script(`
  (function(__AGY_BOOT__) {
    let __AGY_PRECLEANED__ = false;
    ${SECURITY_SRC}
    ${I18N_SRC}
    ${FORGE_SRC}
    ${CORE_WITH_THEMES_SRC}
    return { sec: __AGY_SEC__ };
  })(typeof __AGY_INJECT_BOOT__ !== 'undefined' ? __AGY_INJECT_BOOT__ : null);
`);

// ============================================================================
// HỆ THỐNG SHIM ZERO-DEPENDENCY CHO NODE VM (DOM / CSS / CANVAS / RAF / STORAGE)
// ============================================================================

function toHost(val) {
  return val === undefined ? undefined : JSON.parse(JSON.stringify(val));
}

function decodeHtmlEntities(str) {
  return String(str || '').replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|#39);/g, (_, ent) => {
    if (ent === 'amp') return '&';
    if (ent === 'lt') return '<';
    if (ent === 'gt') return '>';
    if (ent === 'quot') return '"';
    if (ent === 'apos' || ent === '#39') return "'";
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

function camelToKebab(prop) {
  return String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function kebabToCamel(prop) {
  return String(prop).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function createStyleDecl() {
  const map = new Map();
  const decl = {
    contentVisibility: 'visible',
    setProperty(name, value) {
      map.set(String(name), String(value == null ? '' : value));
    },
    getPropertyValue(name) {
      return map.get(String(name)) || '';
    },
    removeProperty(name) {
      const prev = map.get(String(name)) || '';
      map.delete(String(name));
      return prev;
    },
    get cssText() {
      const parts = [];
      for (const [k, v] of map.entries()) parts.push(`${k}: ${v}`);
      return parts.join('; ');
    },
    set cssText(raw) {
      map.clear();
      String(raw || '').split(';').forEach((part) => {
        const idx = part.indexOf(':');
        if (idx === -1) return;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) map.set(k, v);
      });
    }
  };
  return new Proxy(decl, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      return map.get(camelToKebab(prop)) || '';
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'symbol' || prop in target) {
        return Reflect.set(target, prop, value, receiver);
      }
      map.set(camelToKebab(prop), String(value == null ? '' : value));
      return true;
    },
    has(target, prop) {
      return prop in target || map.has(camelToKebab(String(prop)));
    }
  });
}

function createEventTargetMixin() {
  const listeners = new Map();
  return {
    _listeners: listeners,
    addEventListener(type, fn, opts) {
      if (typeof fn !== 'function') return;
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const once = Boolean(opts && typeof opts === 'object' && opts.once);
      const signal = opts && typeof opts === 'object' ? opts.signal : null;
      if (signal && signal.aborted) return;
      if (!listeners.has(type)) listeners.set(type, []);
      const entry = { fn, capture, once, signal, abortHandler: null };
      if (signal && typeof signal.addEventListener === 'function') {
        entry.abortHandler = () => {
          this.removeEventListener(type, fn, capture);
        };
        signal.addEventListener('abort', entry.abortHandler, { once: true });
      }
      listeners.get(type).push(entry);
    },
    removeEventListener(type, fn, opts) {
      const list = listeners.get(type);
      if (!list) return;
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].fn === fn && list[i].capture === capture) {
          if (list[i].signal && list[i].abortHandler && typeof list[i].signal.removeEventListener === 'function') {
            list[i].signal.removeEventListener('abort', list[i].abortHandler);
          }
          list.splice(i, 1);
        }
      }
    },
    dispatchEvent(evt) {
      const eventObj = (evt && typeof evt === 'object') ? evt : { type: String(evt) };
      if (!eventObj.target) eventObj.target = this;
      eventObj.defaultPrevented = false;
      eventObj._stopped = false;
      if (typeof eventObj.preventDefault !== 'function') {
        eventObj.preventDefault = () => { eventObj.defaultPrevented = true; };
      }
      if (typeof eventObj.stopPropagation !== 'function') {
        eventObj.stopPropagation = () => { eventObj._stopped = true; };
      }

      // Xây dựng chuỗi bubble từ đích lên tổ tiên
      const pathNodes = [];
      let cur = this;
      while (cur) {
        pathNodes.push(cur);
        cur = cur.parentNode || cur._ownerWindow || null;
      }

      // Capture phase (từ ngoài vào trong)
      for (let p = pathNodes.length - 1; p >= 0; p--) {
        if (eventObj._stopped) break;
        const node = pathNodes[p];
        const list = node._listeners && node._listeners.get(eventObj.type);
        if (!list) continue;
        for (const entry of list.slice()) {
          if (!entry.capture) continue;
          if (entry.once) node.removeEventListener(eventObj.type, entry.fn, entry.capture);
          eventObj.currentTarget = node;
          entry.fn.call(node, eventObj);
          if (eventObj._stopped) break;
        }
      }

      // Bubble phase (từ trong ra ngoài)
      for (let p = 0; p < pathNodes.length; p++) {
        if (eventObj._stopped) break;
        const node = pathNodes[p];
        const list = node._listeners && node._listeners.get(eventObj.type);
        if (!list) continue;
        for (const entry of list.slice()) {
          if (entry.capture) continue;
          if (entry.once) node.removeEventListener(eventObj.type, entry.fn, entry.capture);
          eventObj.currentTarget = node;
          entry.fn.call(node, eventObj);
          if (eventObj._stopped) break;
        }
      }
      return !eventObj.defaultPrevented;
    }
  };
}

// ============================================================================
// BỘ PHÂN TÍCH CSS SELECTOR NHẸ HỖ TRỢ `:scope >`, `[attr*="..."]`, `:not(...)`
// ============================================================================

function splitTopLevel(str, sepChar) {
  const parts = [];
  let buf = '';
  let bracketDepth = 0;
  let parenDepth = 0;
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      buf += ch;
      if (ch === '\\' && i + 1 < str.length) {
        buf += str[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (ch === sepChar && bracketDepth === 0 && parenDepth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function tokenizeComplexSelector(sel) {
  const tokens = [];
  let buf = '';
  let bracketDepth = 0;
  let parenDepth = 0;
  let quote = null;
  let pendingSpace = false;

  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (quote) {
      buf += ch;
      if (ch === '\\' && i + 1 < sel.length) buf += strChar(sel, ++i);
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      if (pendingSpace && buf) { tokens.push(buf, ' '); buf = ''; pendingSpace = false; }
      pendingSpace = false;
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (bracketDepth === 0 && parenDepth === 0) {
      if (/\s/.test(ch)) {
        if (buf) pendingSpace = true;
        continue;
      }
      if (ch === '>') {
        if (buf) { tokens.push(buf); buf = ''; }
        pendingSpace = false;
        tokens.push('>');
        continue;
      }
    }
    if (pendingSpace) {
      if (buf) { tokens.push(buf); buf = ''; }
      tokens.push(' ');
      pendingSpace = false;
    }
    buf += ch;
  }
  if (buf) tokens.push(buf);
  return tokens;
}

function strChar(s, i) { return s[i] || ''; }

function matchCompound(el, compound, scopeEl) {
  if (!el || el.nodeType !== 1) return false;
  if (compound === '*') return true;
  if (compound === ':scope') return el === scopeEl;

  let i = 0;
  while (i < compound.length) {
    const ch = compound[i];
    if (ch === ':') {
      if (compound.startsWith(':scope', i)) {
        if (el !== scopeEl) return false;
        i += 6;
        continue;
      }
      if (compound.startsWith(':not(', i)) {
        let depth = 1;
        let j = i + 5;
        let q = null;
        while (j < compound.length && depth > 0) {
          const c = compound[j];
          if (q) {
            if (c === q) q = null;
          } else if (c === '"' || c === "'") q = c;
          else if (c === '(') depth++;
          else if (c === ')') depth--;
          j++;
        }
        const inner = compound.slice(i + 5, j - 1);
        const subSelectors = splitTopLevel(inner, ',');
        if (subSelectors.some((sub) => matchSingleSelector(el, sub, scopeEl))) return false;
        i = j;
        continue;
      }
      if (compound.startsWith(':is(', i)) {
        let depth = 1;
        let j = i + 4;
        let q = null;
        while (j < compound.length && depth > 0) {
          const c = compound[j];
          if (q) { if (c === q) q = null; }
          else if (c === '"' || c === "'") q = c;
          else if (c === '(') depth++;
          else if (c === ')') depth--;
          j++;
        }
        const inner = compound.slice(i + 4, j - 1);
        const subSelectors = splitTopLevel(inner, ',');
        if (!subSelectors.some((sub) => matchSingleSelector(el, sub, scopeEl))) return false;
        i = j;
        continue;
      }
      if (compound.startsWith(':has(', i)) {
        let depth = 1;
        let j = i + 5;
        while (j < compound.length && depth > 0) {
          if (compound[j] === '(') depth++;
          else if (compound[j] === ')') depth--;
          j++;
        }
        i = j;
        continue;
      }
      // Bỏ qua các pseudo khác
      i++;
      while (i < compound.length && /[A-Za-z0-9_-]/.test(compound[i])) i++;
      continue;
    }

    if (ch === '#') {
      i++;
      let idName = '';
      while (i < compound.length && !['.', '#', '[', ':'].includes(compound[i])) {
        if (compound[i] === '\\' && i + 1 < compound.length) i++;
        idName += compound[i++];
      }
      if (el.id !== idName) return false;
      continue;
    }

    if (ch === '.') {
      i++;
      let clsName = '';
      while (i < compound.length && !['.', '#', '[', ':'].includes(compound[i])) {
        if (compound[i] === '\\' && i + 1 < compound.length) i++;
        clsName += compound[i++];
      }
      if (!el.classList.contains(clsName)) return false;
      continue;
    }

    if (ch === '[') {
      let j = i + 1;
      let q = null;
      while (j < compound.length) {
        if (q) { if (compound[j] === q) q = null; }
        else if (compound[j] === '"' || compound[j] === "'") q = compound[j];
        else if (compound[j] === ']') break;
        j++;
      }
      const expr = compound.slice(i + 1, j).trim();
      i = j + 1;
      const opMatch = expr.match(/^([A-Za-z0-9_:-]+)\s*(\*=|\^=|\$=|=)?\s*(.*)$/);
      if (!opMatch) return false;
      const attrName = opMatch[1];
      const op = opMatch[2];
      let val = (opMatch[3] || '').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      const actual = el.getAttribute(attrName);
      if (!op) {
        if (actual === null) return false;
      } else if (op === '=') {
        if (actual !== val) return false;
      } else if (op === '*=') {
        if (actual === null || !actual.includes(val)) return false;
      } else if (op === '^=') {
        if (actual === null || !actual.startsWith(val)) return false;
      } else if (op === '$=') {
        if (actual === null || !actual.endsWith(val)) return false;
      }
      continue;
    }

    // Tag name
    let tag = '';
    while (i < compound.length && !['.', '#', '[', ':'].includes(compound[i])) {
      tag += compound[i++];
    }
    if (tag && tag !== '*' && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  }
  return true;
}

function matchSingleSelector(el, sel, scopeEl) {
  const tokens = tokenizeComplexSelector(sel.trim());
  if (tokens.length === 0) return false;

  const walk = (node, idx) => {
    if (idx < 0) return true;
    const tok = tokens[idx];
    if (!matchCompound(node, tok, scopeEl)) return false;
    if (idx === 0) return true;
    const comb = tokens[idx - 1];
    if (comb === '>') {
      return node.parentNode ? walk(node.parentNode, idx - 2) : false;
    }
    if (comb === ' ') {
      let p = node.parentNode;
      while (p && p.nodeType === 1) {
        if (walk(p, idx - 2)) return true;
        p = p.parentNode;
      }
      return false;
    }
    return false;
  };

  return walk(el, tokens.length - 1);
}

function matchesSelector(el, selectorStr, scopeEl) {
  const list = splitTopLevel(String(selectorStr || ''), ',');
  return list.some((s) => matchSingleSelector(el, s, scopeEl));
}

// ============================================================================
// HTML PARSER CHO `innerHTML` (HỖ TRỢ BẮT LỖI ATTRIBUTE BREAKOUT XSS)
// ============================================================================

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function parseHtmlAttributes(rawStr) {
  const attrs = [];
  let i = 0;
  const len = rawStr.length;
  while (i < len) {
    while (i < len && /\s/.test(rawStr[i])) i++;
    if (i >= len) break;
    const nStart = i;
    while (i < len && /[^\s=/>]/.test(rawStr[i])) i++;
    const name = rawStr.slice(nStart, i);
    if (!name) { i++; continue; }
    while (i < len && /\s/.test(rawStr[i])) i++;
    if (rawStr[i] === '=') {
      i++;
      while (i < len && /\s/.test(rawStr[i])) i++;
      const q = rawStr[i];
      if (q === '"' || q === "'") {
        i++;
        const vStart = i;
        while (i < len && rawStr[i] !== q) i++;
        const rawVal = rawStr.slice(vStart, i);
        if (i < len) i++;
        attrs.push({ name, value: decodeHtmlEntities(rawVal) });
      } else {
        const vStart = i;
        while (i < len && /[^\s>]/.test(rawStr[i])) i++;
        attrs.push({ name, value: decodeHtmlEntities(rawStr.slice(vStart, i)) });
      }
    } else {
      attrs.push({ name, value: '' });
    }
  }
  return attrs;
}

function parseHtmlIntoChildren(doc, parent, html) {
  parent.childNodes = [];
  const src = String(html || '');
  const stack = [parent];
  let pos = 0;

  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    if (lt === -1) {
      const txt = src.slice(pos);
      if (txt) stack[stack.length - 1]._appendTextRaw(decodeHtmlEntities(txt));
      break;
    }
    if (lt > pos) {
      const txt = src.slice(pos, lt);
      if (txt) stack[stack.length - 1]._appendTextRaw(decodeHtmlEntities(txt));
    }
    if (src.startsWith('<!--', lt)) {
      const endCmt = src.indexOf('-->', lt + 4);
      pos = endCmt === -1 ? src.length : endCmt + 3;
      continue;
    }
    let gt = -1;
    let q = null;
    for (let k = lt + 1; k < src.length; k++) {
      const ch = src[k];
      if (q) { if (ch === q) q = null; }
      else if (ch === '"' || ch === "'") q = ch;
      else if (ch === '>') { gt = k; break; }
    }
    if (gt === -1) break;
    const inside = src.slice(lt + 1, gt).trim();
    pos = gt + 1;
    if (!inside) continue;

    if (inside.startsWith('/')) {
      const closeTag = inside.slice(1).trim().toLowerCase();
      for (let s = stack.length - 1; s >= 1; s--) {
        if (stack[s].tagName.toLowerCase() === closeTag) {
          stack.length = s;
          break;
        }
      }
      continue;
    }

    const selfClosing = inside.endsWith('/');
    const body = selfClosing ? inside.slice(0, -1).trim() : inside;
    const sp = body.search(/\s/);
    const tagName = sp === -1 ? body : body.slice(0, sp);
    const attrStr = sp === -1 ? '' : body.slice(sp + 1);
    const el = doc.createElement(tagName);
    for (const a of parseHtmlAttributes(attrStr)) {
      el.setAttribute(a.name, a.value);
    }
    stack[stack.length - 1].appendChild(el);
    if (!selfClosing && !VOID_TAGS.has(tagName.toLowerCase())) {
      stack.push(el);
    }
  }
}

class ShimElement {
  constructor(ownerDocument, tagName) {
    Object.assign(this, createEventTargetMixin());
    this.ownerDocument = ownerDocument;
    this.nodeType = 1;
    this.tagName = String(tagName || 'div').toUpperCase();
    this._attrs = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.style = createStyleDecl();
    this.scrollTop = 0;
    this._rect = { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40 };
    this._value = '';
    this._checked = false;
    this.files = [];
    this.isContentEditable = false;
    this.focused = false;
    this.selected = false;

    const self = this;
    this.classList = {
      add(...cls) {
        const cur = new Set(self.className.split(/\s+/).filter(Boolean));
        cls.forEach((c) => { if (c) cur.add(c); });
        self.className = Array.from(cur).join(' ');
      },
      remove(...cls) {
        const cur = new Set(self.className.split(/\s+/).filter(Boolean));
        cls.forEach((c) => cur.delete(c));
        self.className = Array.from(cur).join(' ');
      },
      contains(c) {
        return self.className.split(/\s+/).filter(Boolean).includes(c);
      },
      toggle(c, force) {
        const has = this.contains(c);
        const next = force === undefined ? !has : Boolean(force);
        if (next) this.add(c);
        else this.remove(c);
        return next;
      }
    };

    this.dataset = new Proxy({}, {
      get(_, prop) {
        if (typeof prop !== 'string') return undefined;
        const val = self.getAttribute('data-' + camelToKebab(prop));
        return val === null ? undefined : val;
      },
      set(_, prop, value) {
        self.setAttribute('data-' + camelToKebab(prop), String(value));
        return true;
      },
      deleteProperty(_, prop) {
        self.removeAttribute('data-' + camelToKebab(prop));
        return true;
      },
      ownKeys() {
        const keys = [];
        for (const k of self._attrs.keys()) {
          if (k.startsWith('data-')) keys.push(kebabToCamel(k.slice(5)));
        }
        return keys;
      },
      getOwnPropertyDescriptor(_, prop) {
        const attrKey = 'data-' + camelToKebab(String(prop));
        if (!self._attrs.has(attrKey)) return undefined;
        return { configurable: true, enumerable: true, value: self._attrs.get(attrKey) };
      }
    });
  }

  get id() { return this._attrs.get('id') || ''; }
  set id(v) { this.setAttribute('id', String(v || '')); }

  get className() { return this._attrs.get('class') || ''; }
  set className(v) { this.setAttribute('class', String(v || '')); }

  get type() { return this._attrs.get('type') || 'text'; }
  set type(v) { this.setAttribute('type', String(v || '')); }

  get value() { return this._value !== '' ? this._value : (this._attrs.get('value') || ''); }
  set value(v) { this._value = String(v == null ? '' : v); }

  get checked() { return this._checked || this._attrs.has('checked'); }
  set checked(v) {
    this._checked = Boolean(v);
    if (this._checked) this._attrs.set('checked', '');
    else this._attrs.delete('checked');
  }

  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get isConnected() {
    let cur = this;
    while (cur) {
      if (this.ownerDocument && cur === this.ownerDocument.documentElement) return true;
      cur = cur.parentNode;
    }
    return false;
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 ? (this.parentNode.childNodes[idx + 1] || null) : null;
  }

  get attributes() {
    return Array.from(this._attrs.entries()).map(([name, value]) => ({ name, value }));
  }

  getAttribute(name) {
    if (name === 'style' && !this._attrs.has('style')) {
      const txt = this.style.cssText;
      return txt || null;
    }
    return this._attrs.has(name) ? this._attrs.get(name) : null;
  }

  setAttribute(name, value) {
    const k = String(name);
    const v = String(value == null ? '' : value);
    this._attrs.set(k, v);
    if (k === 'style') {
      this.style.cssText = v;
    } else if (k === 'checked') {
      this._checked = true;
    } else if (k === 'value' && this._value === '') {
      this._value = v;
    }
    if (this.ownerDocument && this.ownerDocument._notifyMutation) {
      this.ownerDocument._notifyMutation({ type: 'attributes', target: this, attributeName: k });
    }
  }

  removeAttribute(name) {
    const k = String(name);
    this._attrs.delete(k);
    if (k === 'checked') this._checked = false;
    if (this.ownerDocument && this.ownerDocument._notifyMutation) {
      this.ownerDocument._notifyMutation({ type: 'attributes', target: this, attributeName: k });
    }
  }

  hasAttribute(name) {
    return this._attrs.has(String(name));
  }

  _appendTextRaw(text) {
    const tn = { nodeType: 3, textContent: String(text), parentNode: this, parentElement: this };
    this.childNodes.push(tn);
  }

  appendChild(child) {
    if (!child) return child;
    if (child.parentNode && child.parentNode.childNodes) {
      child.parentNode.childNodes = child.parentNode.childNodes.filter((c) => c !== child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    if (this.ownerDocument && this.ownerDocument._notifyMutation) {
      this.ownerDocument._notifyMutation({ type: 'childList', target: this, addedNodes: [child], removedNodes: [] });
    }
    return child;
  }

  insertBefore(newNode, refNode) {
    if (!refNode) return this.appendChild(newNode);
    if (newNode.parentNode && newNode.parentNode.childNodes) {
      newNode.parentNode.childNodes = newNode.parentNode.childNodes.filter((c) => c !== newNode);
    }
    const idx = this.childNodes.indexOf(refNode);
    newNode.parentNode = this;
    if (idx === -1) this.childNodes.push(newNode);
    else this.childNodes.splice(idx, 0, newNode);
    if (this.ownerDocument && this.ownerDocument._notifyMutation) {
      this.ownerDocument._notifyMutation({ type: 'childList', target: this, addedNodes: [newNode], removedNodes: [] });
    }
    return newNode;
  }

  remove() {
    if (!this.parentNode) return;
    const p = this.parentNode;
    p.childNodes = p.childNodes.filter((c) => c !== this);
    this.parentNode = null;
    if (this.ownerDocument && this.ownerDocument._notifyMutation) {
      this.ownerDocument._notifyMutation({ type: 'childList', target: p, addedNodes: [], removedNodes: [this] });
    }
  }

  get textContent() {
    return this.childNodes.map((n) => (n.nodeType === 3 ? n.textContent : n.textContent)).join('');
  }

  set textContent(val) {
    this.childNodes = [];
    if (val !== '' && val != null) {
      this._appendTextRaw(String(val));
    }
  }

  get innerHTML() {
    return this.childNodes.map((n) => {
      if (n.nodeType === 3) return n.textContent;
      const attrs = Array.from(n._attrs.entries()).map(([k, v]) => ` ${k}="${v}"`).join('');
      return `<${n.tagName.toLowerCase()}${attrs}>${n.innerHTML}</${n.tagName.toLowerCase()}>`;
    }).join('');
  }

  set innerHTML(html) {
    parseHtmlIntoChildren(this.ownerDocument, this, html);
  }

  getBoundingClientRect() {
    return { ...this._rect };
  }

  matches(sel) {
    return matchesSelector(this, sel, this);
  }

  closest(sel) {
    let cur = this;
    while (cur && cur.nodeType === 1) {
      if (matchesSelector(cur, sel, cur)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const ch of node.children) {
        if (matchesSelector(ch, sel, this)) out.push(ch);
        walk(ch);
      }
    };
    walk(this);
    return out;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  focus() { this.focused = true; }
  select() { this.selected = true; }
}

// ============================================================================
// MÔI TRƯỜNG NODE VM ĐỒNG BỘ HOÀN CHỈNH (VIRTUAL CLOCK + CANVAS + DOM + FORGE/CORE)
// ============================================================================

function createTestEnv(options = {}) {
  const {
    loadCore = false,
    boot = {},
    initialStorage = {},
    canvasConfig = {},
    hasFocusInit = true,
    hiddenInit = false,
    reducedMotionInit = false,
    macPlatform = false,
    contentVisibilitySupported = true,
    setupDom = null
  } = options;

  let nowMs = 10000;
  let nextTimerId = 1;
  let nextRafId = 1;
  const timers = new Map();
  const rafQueue = new Map();
  const createdDownloads = [];
  const createdObjectUrls = new Map();
  const revokedUrls = [];
  let savedConfigCalls = [];

  const clock = {
    now: () => nowMs,
    advance(ms) {
      const target = nowMs + Math.max(0, ms);
      while (true) {
        let earliest = null;
        for (const t of timers.values()) {
          if (t.runAt <= target && (!earliest || t.runAt < earliest.runAt)) {
            earliest = t;
          }
        }
        if (!earliest) break;
        nowMs = earliest.runAt;
        if (earliest.interval > 0) {
          earliest.runAt += earliest.interval;
        } else {
          timers.delete(earliest.id);
        }
        earliest.fn();
      }
      nowMs = target;
    },
    stepRaf(count = 1, stepMs = 16.667) {
      for (let i = 0; i < count; i++) {
        nowMs += stepMs;
        const batch = Array.from(rafQueue.entries());
        rafQueue.clear();
        for (const [, fn] of batch) {
          fn(nowMs);
        }
      }
    },
    pendingRafCount: () => rafQueue.size,
    pendingTimerCount: () => timers.size
  };

  // Storage giả lập hỗ trợ QuotaExceededError
  const storageMap = new Map(Object.entries(initialStorage));
  let storageMaxChars = options.storageMaxChars || Infinity;
  const localStorageShim = {
    get length() { return storageMap.size; },
    key(i) { return Array.from(storageMap.keys())[i] || null; },
    getItem(k) { return storageMap.has(String(k)) ? storageMap.get(String(k)) : null; },
    setItem(k, v) {
      const val = String(v);
      let total = val.length;
      for (const [ek, ev] of storageMap.entries()) {
        if (ek !== String(k)) total += ev.length;
      }
      if (total > storageMaxChars) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
      storageMap.set(String(k), val);
    },
    removeItem(k) { storageMap.delete(String(k)); },
    clear() { storageMap.clear(); }
  };

  // Document & Window giả lập
  const docListeners = createEventTargetMixin();
  const winListeners = createEventTargetMixin();
  const mutationObservers = [];
  const resizeObservers = [];
  const intersectionObservers = [];

  const doc = {
    ...docListeners,
    nodeType: 9,
    hidden: hiddenInit,
    _hasFocus: hasFocusInit,
    hasFocus() { return this._hasFocus; },
    _observers: mutationObservers,
    _notifyMutation(record) {
      for (const obs of mutationObservers) {
        if (obs._active) obs._queue.push(record);
      }
    },
    flushMutations() {
      for (const obs of mutationObservers) {
        if (obs._active && obs._queue.length > 0) {
          const batch = obs._queue.splice(0, obs._queue.length);
          obs.cb(batch, obs);
        }
      }
    },
    createElement(tag) {
      const t = String(tag || 'div').toLowerCase();
      if (t === 'canvas') {
        const canvasEl = new ShimElement(doc, 'canvas');
        canvasEl.width = 300;
        canvasEl.height = 150;
        canvasEl._rgba = null;
        canvasEl.getContext = (kind) => {
          if (kind !== '2d') return null;
          if (canvasConfig.forceNull2dContext) return null;
          const drawCalls = [];
          const fillCalls = [];
          const clearCalls = [];
          canvasEl._drawCalls = drawCalls;
          canvasEl._fillCalls = fillCalls;
          canvasEl._clearCalls = clearCalls;
          return {
            filter: 'none',
            fillStyle: '#000',
            setTransform() {},
            clearRect(x, y, w, h) {
              clearCalls.push({ x, y, w, h });
            },
            fillRect(x, y, w, h) {
              fillCalls.push({ x, y, w, h, fillStyle: this.fillStyle });
            },
            drawImage(img, ...args) {
              drawCalls.push({ img, args, filter: this.filter });
              const dw = args.length >= 4 ? args[2] : (args.length === 8 ? args[6] : canvasEl.width);
              const dh = args.length >= 4 ? args[3] : (args.length === 8 ? args[7] : canvasEl.height);
              if (img && img._rgba && dw > 0 && dh > 0) {
                const out = new Uint8ClampedArray(dw * dh * 4);
                const sw = img.width || img.naturalWidth || 64;
                const sh = img.height || img.naturalHeight || 64;
                for (let y = 0; y < dh; y++) {
                  const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
                  for (let x = 0; x < dw; x++) {
                    const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
                    const sOff = (sy * sw + sx) * 4;
                    const dOff = (y * dw + x) * 4;
                    out[dOff] = img._rgba[sOff];
                    out[dOff + 1] = img._rgba[sOff + 1];
                    out[dOff + 2] = img._rgba[sOff + 2];
                    out[dOff + 3] = img._rgba[sOff + 3];
                  }
                }
                canvasEl._rgba = out;
                canvasEl._rgbaW = dw;
                canvasEl._rgbaH = dh;
              }
            },
            getImageData(sx, sy, sw, sh) {
              if (canvasEl._rgba && canvasEl._rgbaW === sw && canvasEl._rgbaH === sh) {
                return { width: sw, height: sh, data: canvasEl._rgba };
              }
              return { width: sw, height: sh, data: new Uint8ClampedArray(sw * sh * 4) };
            }
          };
        };
        canvasEl.toDataURL = (mime = 'image/png', quality = 0.92) => {
          if (canvasConfig.forceSecurityErrorOnToDataUrl) {
            const err = new Error('Tainted canvas may not be exported');
            err.name = 'SecurityError';
            throw err;
          }
          if (typeof canvasConfig.customToDataUrl === 'function') {
            return canvasConfig.customToDataUrl(mime, quality, canvasEl);
          }
          if (canvasConfig.disableWebp && mime === 'image/webp') {
            return 'data:image/png;base64,iVBORw0KGgo=';
          }
          const actualMime = (mime === 'image/webp' || mime === 'image/jpeg') ? mime : 'image/png';
          return `data:${actualMime};base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=`;
        };
        return canvasEl;
      }
      const el = new ShimElement(doc, t);
      if (t === 'a') {
        el.click = () => {
          createdDownloads.push({ href: el.href, download: el.download });
        };
      }
      return el;
    },
    getElementById(id) {
      const walk = (node) => {
        for (const ch of node.children) {
          if (ch.id === id) return ch;
          const nested = walk(ch);
          if (nested) return nested;
        }
        return null;
      };
      return walk(doc.documentElement);
    },
    querySelectorAll(sel) {
      return doc.documentElement.querySelectorAll(sel);
    },
    querySelector(sel) {
      return doc.documentElement.querySelector(sel);
    }
  };

  doc.documentElement = new ShimElement(doc, 'html');
  if (!contentVisibilitySupported) {
    doc.documentElement.style = new Proxy(doc.documentElement.style, {
      has(target, prop) {
        if (prop === 'contentVisibility') return false;
        return prop in target;
      }
    });
  }
  doc.head = new ShimElement(doc, 'head');
  doc.body = new ShimElement(doc, 'body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  // Xây dựng cấu trúc DOM IDE chuẩn (.agy-shell, sidebar, titlebar, main body, composer, user-message)
  const shell = doc.createElement('div');
  shell.className = 'agy-shell';
  shell._rect = { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 };

  const titlebar = doc.createElement('div');
  titlebar.className = '@container/titlebar';
  titlebar._rect = { left: 0, top: 0, width: 1280, height: 38, right: 1280, bottom: 38 };

  const sidebarSplit = doc.createElement('div');
  sidebarSplit.setAttribute('data-testid', 'sidebar-split');
  const sidebarPane = doc.createElement('div');
  sidebarPane.className = 'bg-sidebar';
  sidebarPane._rect = { left: 0, top: 38, width: 256, height: 682, right: 256, bottom: 720 };
  const sidebarScroll = doc.createElement('div');
  sidebarScroll.className = 'overflow-y-auto';
  const customizationsSpan = doc.createElement('span');
  customizationsSpan.textContent = 'Customizations';
  const customizationsRow = doc.createElement('button');
  customizationsRow.appendChild(customizationsSpan);
  sidebarPane.appendChild(customizationsRow);
  sidebarPane.appendChild(sidebarScroll);
  sidebarSplit.appendChild(sidebarPane);

  const mainBody = doc.createElement('div');
  mainBody.setAttribute('data-main-content-body', 'true');
  const userMsg = doc.createElement('div');
  userMsg.setAttribute('data-testid', 'user-message');
  const userBubbleFrame = doc.createElement('div');
  userBubbleFrame.className = 'agy-user-bubble-frame';
  userMsg.appendChild(userBubbleFrame);
  mainBody.appendChild(userMsg);

  const composer = doc.createElement('div');
  composer.className = 'surface-composer';
  const composerInput = doc.createElement('textarea');
  composer.appendChild(composerInput);

  shell.appendChild(titlebar);
  shell.appendChild(sidebarSplit);
  shell.appendChild(mainBody);
  shell.appendChild(composer);
  doc.body.appendChild(shell);

  if (typeof setupDom === 'function') {
    setupDom({ doc, shell, mainBody, composer, userMsg, userBubbleFrame, sidebarPane });
  }

  let reducedMotion = reducedMotionInit;
  const mediaListeners = new Set();
  const matchMediaShim = (query) => {
    const isReducedQuery = String(query).includes('prefers-reduced-motion');
    return {
      media: query,
      get matches() { return isReducedQuery ? reducedMotion : false; },
      addEventListener(evt, fn) {
        if (evt === 'change' && isReducedQuery && typeof fn === 'function') mediaListeners.add(fn);
      },
      removeEventListener(evt, fn) {
        if (evt === 'change') mediaListeners.delete(fn);
      }
    };
  };

  class ShimAbortController {
    constructor() {
      const listeners = [];
      this.signal = {
        aborted: false,
        addEventListener(evt, fn) {
          if (evt === 'abort' && typeof fn === 'function') listeners.push(fn);
        },
        removeEventListener(evt, fn) {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        }
      };
      this._listeners = listeners;
    }
    abort() {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      for (const fn of this._listeners.slice()) fn();
    }
  }

  class ShimMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this._active = false;
      this._queue = [];
      mutationObservers.push(this);
    }
    observe() { this._active = true; }
    disconnect() { this._active = false; this._queue = []; }
  }

  class ShimResizeObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = new Set();
      this.disconnected = false;
      resizeObservers.push(this);
    }
    observe(el) { this.targets.add(el); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
  }

  class ShimIntersectionObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = new Set();
      this.disconnected = false;
      intersectionObservers.push(this);
    }
    observe(el) { this.targets.add(el); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
  }

  const imageRegistry = new Map();
  class ShimImage {
    constructor() {
      this.crossOrigin = '';
      this.naturalWidth = 1920;
      this.naturalHeight = 1080;
      this.width = 1920;
      this.height = 1080;
      this._rgba = null;
      this.onload = null;
      this.onerror = null;
    }
    set src(val) {
      this._src = String(val || '');
      const reg = imageRegistry.get(this._src);
      const delay = (reg && typeof reg.delayMs === 'number') ? reg.delayMs : 0;
      setTimeoutShim(() => {
        if ((reg && reg.error) || this._src.includes('__broken_image__')) {
          if (typeof this.onerror === 'function') this.onerror(new Error('Image load error'));
          return;
        }
        if (reg) {
          this.naturalWidth = reg.width || 64;
          this.naturalHeight = reg.height || 64;
          this.width = this.naturalWidth;
          this.height = this.naturalHeight;
          this._rgba = reg.rgba || null;
        }
        if (typeof this.onload === 'function') this.onload();
      }, delay);
    }
    get src() { return this._src || ''; }
  }

  class ShimFileReader {
    readAsDataURL(file) {
      setTimeoutShim(() => {
        if (file && file._shouldFail) {
          if (typeof this.onerror === 'function') this.onerror(new Error('Read error'));
          return;
        }
        this.result = (file && file._dataUrl) || 'data:image/png;base64,AAAA';
        if (typeof this.onload === 'function') this.onload();
      }, 0);
    }
    readAsText(file) {
      setTimeoutShim(() => {
        if (file && file._shouldFail) {
          if (typeof this.onerror === 'function') this.onerror(new Error('Read error'));
          return;
        }
        this.result = (file && file._text) || '';
        if (typeof this.onload === 'function') this.onload();
      }, 0);
    }
  }

  class ShimBlob {
    constructor(parts, opts = {}) {
      this.parts = parts;
      this.text = parts.join('');
      this.type = opts.type || '';
    }
  }

  let nextBlobUrlId = 1;
  const URLShim = {
    createObjectURL(blob) {
      const url = `blob:agy-test/${nextBlobUrlId++}`;
      createdObjectUrls.set(url, blob);
      return url;
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
      createdObjectUrls.delete(url);
    }
  };

  function setTimeoutShim(fn, ms = 0) {
    const id = nextTimerId++;
    timers.set(id, { id, fn, runAt: nowMs + Math.max(0, Number(ms) || 0), interval: 0 });
    return id;
  }
  function clearTimeoutShim(id) { timers.delete(id); }
  function setIntervalShim(fn, ms = 10) {
    const id = nextTimerId++;
    const interval = Math.max(1, Number(ms) || 10);
    timers.set(id, { id, fn, runAt: nowMs + interval, interval });
    return id;
  }
  function clearIntervalShim(id) { timers.delete(id); }
  function rafShim(fn) {
    const id = nextRafId++;
    rafQueue.set(id, fn);
    return id;
  }
  function cafShim(id) { rafQueue.delete(id); }

  // Cần cả DOMParser cho normalizeSvgUrlIfNeeded
  const win = {
    ...winListeners,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    document: doc,
    localStorage: localStorageShim,
    navigator: {
      platform: macPlatform ? 'MacIntel' : 'Win32',
      userAgent: macPlatform ? 'Mozilla/5.0 (Macintosh)' : 'Mozilla/5.0 (Windows NT 10.0)',
      clipboard: { writeText: () => Promise.resolve() }
    },
    matchMedia: matchMediaShim,
    setTimeout: setTimeoutShim,
    clearTimeout: clearTimeoutShim,
    setInterval: setIntervalShim,
    clearInterval: clearIntervalShim,
    requestAnimationFrame: rafShim,
    cancelAnimationFrame: cafShim,
    performance: { now: () => nowMs },
    atob: (b64) => Buffer.from(String(b64), 'base64').toString('binary'),
    btoa: (bin) => Buffer.from(String(bin), 'binary').toString('base64'),
    Image: ShimImage,
    FileReader: ShimFileReader,
    Blob: ShimBlob,
    URL: URLShim,
    AbortController: ShimAbortController,
    MutationObserver: ShimMutationObserver,
    ResizeObserver: ShimResizeObserver,
    IntersectionObserver: ShimIntersectionObserver,
    agySaveThemeConfig(jsonStr) {
      savedConfigCalls.push(JSON.parse(jsonStr));
    },
    electronNative: {
      setTitleBarOverlay() {}
    }
  };
  doc._ownerWindow = win;
  win.window = win;
  win.globalThis = win;

  const sandbox = {
    ...win,
    __AGY_INJECT_BOOT__: {
      authToken: 'test_token_256',
      assetBase: '',
      syncFromDaemon: false,
      initialConfig: null,
      ...boot
    },
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    Math,
    Date,
    JSON,
    Promise,
    Error,
    Float64Array,
    Uint8ClampedArray,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  // Đồng bộ listeners trên sandbox để window === sandbox
  Object.assign(sandbox, winListeners);
  doc._ownerWindow = sandbox;

  const ctx = vm.createContext(sandbox);
  const bundleResult = (loadCore ? FULL_CORE_BUNDLE_SCRIPT : FORGE_BUNDLE_SCRIPT).runInContext(ctx);

  return {
    window: sandbox,
    document: doc,
    shell,
    mainBody,
    composer,
    composerInput,
    userMsg,
    userBubbleFrame,
    sidebarPane,
    localStorage: localStorageShim,
    storageMap,
    clock,
    imageRegistry,
    createdDownloads,
    createdObjectUrls,
    revokedUrls,
    savedConfigCalls,
    internalSec: bundleResult.sec,
    mutationObservers,
    resizeObservers,
    intersectionObservers,
    setStorageMaxChars(n) { storageMaxChars = n; },
    setReducedMotion(val) {
      reducedMotion = Boolean(val);
      for (const fn of mediaListeners) fn({ matches: reducedMotion });
    },
    forge: sandbox.__AGY_THEME_FORGE__,
    core: sandbox.__AGY_THEME_CORE__
  };
}

/** Tạo buffer RGBA 64x64 theo hàm tô màu (x, y) => [r, g, b, a] */
function makeRgba64(pixelFn) {
  const w = 64;
  const h = 64;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const off = (y * w + x) * 4;
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = a;
    }
  }
  return rgba;
}

// ============================================================================
// F05 — `core.js` Pre-Baked L-Glass, Split Browser Cutout, Thế Giới Trong Suốt & GPU Arbiter
// ============================================================================

describe('F05 — Pre-Baked L-Glass, Split Browser Cutout, Thế Giới Trong Suốt & GPU Arbiter (`engine/core.js`)', { concurrency: 1 }, () => {
  describe('Tier 1 — Phủ Tính Năng', { concurrency: 1 }, () => {
    it('[F05-T1-01] Pre-Baked L-Glass vẽ offscreen canvas gán --agy-l-glass-bg & giữ Zero Live Blur trên shell/sidebar/card', () => {
      const env = createTestEnv({
        loadCore: true,
        boot: { initialConfig: { themeName: '🦋 Trùng Trụ — Shinobu Kocho', glassBlur: 6, wpEnabled: true } }
      });

      env.clock.advance(50); // Cho phép Image.onload chạy
      const lGlass = env.shell.style.getPropertyValue('--agy-l-glass-bg');
      assert.ok(lGlass.startsWith('url("data:image/webp;base64,'), `Phải gán ảnh WebP pre-baked vào --agy-l-glass-bg, nhận được: ${lGlass}`);

      const styleTag = env.document.getElementById('antigravity-custom-theme-active');
      assert.ok(styleTag, 'Phải tạo thẻ <style id="antigravity-custom-theme-active">');
      const css = styleTag.textContent;
      assert.ok(css.includes('.agy-shell::before'), 'Phải có CSS cho lớp kính chữ L .agy-shell::before');
      assert.ok(css.includes('var(--agy-l-glass-bg, none)'), 'Lớp .agy-shell::before phải đọc biến --agy-l-glass-bg');
      assert.ok(css.includes('backdrop-filter: none !important'), 'Phải ép backdrop-filter: none !important (Zero Live Blur)');
      assert.equal(/backdrop-filter\s*:\s*blur\(/i.test(css), false, 'Style engine chính không được chứa rule live backdrop-filter: blur(...)');
    });

    it('[F05-T1-02] Split Browser Cutout tính toán --agy-hole-clip dạng polygon(evenodd, ...) & kích hoạt data-agy-hole-active="1"', () => {
      const env = createTestEnv({
        loadCore: true,
        setupDom({ doc, shell }) {
          doc.body.setAttribute('data-has-browser-hole', 'true');
          const hole = doc.createElement('div');
          hole.setAttribute('data-browser-hole', 'true');
          hole._rect = { left: 260, top: 40, width: 800, height: 600, right: 1060, bottom: 640 };
          shell.appendChild(hole);
        }
      });

      assert.equal(env.shell.dataset.agyHoleActive, '1', 'Phải bật data-agy-hole-active="1"');
      assert.equal(env.shell.style.getPropertyValue('--agy-sidebar-w'), '256px');
      assert.equal(env.shell.style.getPropertyValue('--agy-hdr-h'), '38px');
      const clip = env.shell.style.getPropertyValue('--agy-hole-clip');
      assert.equal(
        clip,
        'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 260px 40px, 1060px 40px, 1060px 640px, 260px 640px, 260px 40px)'
      );
      const css = env.document.getElementById('antigravity-custom-theme-active').textContent;
      assert.ok(css.includes('.agy-shell[data-agy-hole-active="1"]::after'), 'CSS phải định nghĩa lớp ::after cho cutout');
    });

    it('[F05-T1-03] Thế Giới Trong Suốt kích hoạt khi gõ sâu (>= 4 phím/giây × 2 giây liên tiếp) & hồi phục sau 2.8 giây', () => {
      const env = createTestEnv({ loadCore: true });
      assert.equal(env.window.__AGY_TRANSPARENT_WORLD__, 0);

      // Giây thứ nhất: 4 phím tại t=0, 150, 300, 450
      for (let i = 0; i < 4; i++) {
        env.window.dispatchEvent({ type: 'keydown', key: 'a', target: env.composerInput });
        if (i < 3) env.clock.advance(150);
      }
      assert.equal(env.window.__AGY_TRANSPARENT_WORLD__, 0, 'Mới gõ 1 giây chưa được kích hoạt Thế Giới Trong Suốt');

      // Sang giây thứ hai (t=1100, 1250, 1400, 1550) để đảm bảo 4 phím ở [now-2000, now-1000) và 4 phím ở [now-1000, now]
      env.clock.advance(650);
      for (let i = 0; i < 4; i++) {
        env.window.dispatchEvent({ type: 'keydown', key: 'b', target: env.composerInput });
        if (i < 3) env.clock.advance(150);
      }

      assert.equal(env.document.documentElement.dataset.agyTransparentWorld, '1', 'Đủ 4 phím/s trong 2 giây phải bật data-agy-transparent-world="1"');
      env.clock.stepRaf(40, 32);
      assert.ok(env.window.__AGY_TRANSPARENT_WORLD__ > 0.9, `RAF lerp phải đưa __AGY_TRANSPARENT_WORLD__ gần 1, thực tế=${env.window.__AGY_TRANSPARENT_WORLD__}`);
      assert.ok(env.document.documentElement.style.getPropertyValue('--agy-tw-factor'), 'Phải gán biến CSS --agy-tw-factor');

      // Ngưng gõ quá 2800ms -> tự hồi phục về 0 (hội tụ khi |diff| <= 0.004)
      env.clock.advance(2850);
      env.clock.stepRaf(120, 32);
      assert.equal(env.window.__AGY_TRANSPARENT_WORLD__, 0, 'Sau 2.8s ngưng gõ phải hồi phục về 0');
      assert.equal(env.document.documentElement.dataset.agyTransparentWorld, undefined);
    });

    it('[F05-T1-04] Thế Giới Trong Suốt kích hoạt khi cuộn diff liên tục (>= 6 mẫu trong 1.2 giây)', () => {
      const env = createTestEnv({ loadCore: true });
      for (let i = 0; i < 6; i++) {
        env.window.dispatchEvent({ type: 'wheel', target: env.mainBody });
        env.clock.advance(95);
      }
      assert.equal(env.document.documentElement.dataset.agyTransparentWorld, '1');
      env.clock.stepRaf(40, 32);
      assert.ok(env.window.__AGY_TRANSPARENT_WORLD__ > 0.9);
    });

    it('[F05-T1-05] GPU Arbiter dừng về 0 FPS sau 800ms mất focus (blur) và đánh thức ngay khi focus / mouseenter', () => {
      let renderCount = 0;
      let staticCount = 0;
      let resetClockCount = 0;
      const env = createTestEnv({
        loadCore: false,
        hasFocusInit: true
      });
      env.window.__AGY_KNY_FX_DRAWERS__ = () => ({
        render() { renderCount++; },
        drawStatic() { staticCount++; },
        resetClock() { resetClockCount++; },
        resize() {}
      });

      // Chạy core sau khi đã gắn FX drawer factory
      const coreCode = CORE_SRC_TEMPLATE.replace(PLACEHOLDER, () => JSON.stringify(THEMES_JSON));
      vm.runInContext(`(function(__AGY_BOOT__){ const __AGY_SEC__ = window.__AGY_SEC__; ${coreCode} })(window.__AGY_INJECT_BOOT__);`, vm.createContext(env.window));
      const rt = env.window.__AGY_SHINOBU_RT__;

      env.clock.stepRaf(3, 16);
      assert.ok(renderCount >= 3, 'Khi đang focus phải render nhiều frame qua RAF');
      assert.ok(rt.fxRaf > 0, 'fxRaf phải đang hoạt động');

      // Mất focus & phát blur
      env.document._hasFocus = false;
      env.window.dispatchEvent({ type: 'blur' });
      env.clock.advance(799);
      assert.equal(rt.fxFocusPaused, false, 'Trước mốc 800ms chưa được ngắt GPU');

      env.clock.advance(5);
      assert.equal(rt.fxFocusPaused, true, 'Sau 800ms blur phải bật fxFocusPaused');
      assert.equal(rt.fxRaf, 0, 'Phải hủy RAF về 0 FPS');
      assert.ok(staticCount >= 1, 'Phải vẽ 1 frame tĩnh drawStatic trước khi dừng');

      const beforeFreezeRender = renderCount;
      env.clock.stepRaf(5, 16);
      assert.equal(renderCount, beforeFreezeRender, 'Ở trạng thái 0 FPS không được gọi render thêm');

      // Đánh thức bằng mouseenter
      env.document._hasFocus = true;
      env.window.dispatchEvent({ type: 'mouseenter' });
      assert.equal(rt.fxFocusPaused, false);
      assert.equal(resetClockCount, 1, 'Phải gọi drawer.resetClock() khi đánh thức');
      assert.ok(rt.fxRaf > 0, 'Phải khôi phục RAF chạy lại');
    });

    it('[F05-T1-06] GPU Arbiter toggleFxPause tạm dừng và bật lại hiệu ứng nền lưu vào localStorage', () => {
      const env = createTestEnv({ loadCore: true });
      const rt = env.window.__AGY_SHINOBU_RT__;
      assert.equal(rt.fxPaused, false);
      assert.ok(rt.fxRaf > 0);

      const paused = rt.toggleFxPause();
      assert.equal(paused, true);
      assert.equal(env.localStorage.getItem('agy_fx_paused_v1'), '1');
      assert.equal(rt.fxRaf, 0, 'Khi pause thủ công RAF phải về 0');

      const resumed = rt.toggleFxPause();
      assert.equal(resumed, false);
      assert.equal(env.localStorage.getItem('agy_fx_paused_v1'), '0');
      assert.ok(rt.fxRaf > 0);
    });
  });

  describe('Tier 2 — Biên & Góc Khuất', () => {
    it('[F05-T2-01] Pre-Baked Glass xử lý glassBlur = 0 và fallback khi canvas tainted (SecurityError) / lỗi ảnh', () => {
      const env = createTestEnv({
        loadCore: true,
        boot: { initialConfig: { themeName: '🦋 Trùng Trụ — Shinobu Kocho', glassBlur: 0, wpEnabled: true } }
      });
      env.clock.advance(50);
      assert.equal(env.shell.style.getPropertyValue('--agy-l-glass-bg'), '', 'Khi glassBlur = 0 phải gỡ bỏ --agy-l-glass-bg');

      // Trường hợp tainted canvas ném SecurityError
      const envTainted = createTestEnv({
        loadCore: true,
        canvasConfig: { forceSecurityErrorOnToDataUrl: true },
        boot: { initialConfig: { themeName: '🦋 Trùng Trụ — Shinobu Kocho', glassBlur: 6, wpEnabled: true } }
      });
      envTainted.clock.advance(50);
      const fb = envTainted.shell.style.getPropertyValue('--agy-l-glass-bg');
      assert.ok(fb.includes('linear-gradient(') && fb.includes('url("'), `Khi SecurityError phải fallback về linear-gradient + url gốc, thực tế=${fb}`);

      // Trường hợp canvas.getContext('2d') trả về null
      const envNullCtx = createTestEnv({
        loadCore: true,
        canvasConfig: { forceNull2dContext: true },
        boot: { initialConfig: { themeName: '🦋 Trùng Trụ — Shinobu Kocho', glassBlur: 6, wpEnabled: true } }
      });
      envNullCtx.clock.advance(50);
      const fbNullCtx = envNullCtx.shell.style.getPropertyValue('--agy-l-glass-bg');
      assert.ok(
        fbNullCtx.includes('linear-gradient(') && fbNullCtx.includes('url("'),
        `Khi getContext("2d") trả null phải fallback về linear-gradient + url gốc, thực tế=${fbNullCtx}`
      );

      // Trường hợp ảnh hỏng onerror
      const envErr = createTestEnv({
        loadCore: true,
        boot: { initialConfig: { themeName: '🦋 Trùng Trụ — Shinobu Kocho', glassBlur: 6, customWp: './themes/assets/__broken_image__.png', wpEnabled: true } }
      });
      envErr.clock.advance(50);
      assert.ok(envErr.shell.style.getPropertyValue('--agy-l-glass-bg').includes('__broken_image__.png'));
    });

    it('[F05-T2-02] Pre-Baked Glass giới hạn LRU Cache tối đa 12 mục & hủy kết quả bất đồng bộ cũ bằng prebakeReqSeq', () => {
      const env = createTestEnv({ loadCore: true });
      env.clock.advance(50);
      env.window.__AGY_BLUR_CACHE__ = {};

      for (let i = 1; i <= 14; i++) {
        env.core.applyTheme({ dimming: 20 + i, glassBlur: 4, wpEnabled: true }, { skipSaveDisk: true });
        env.clock.advance(50);
      }
      const keys = Object.keys(env.window.__AGY_BLUR_CACHE__);
      assert.equal(keys.length, 12, 'LRU __AGY_BLUR_CACHE__ chỉ được giữ tối đa 12 entry');
      assert.equal(keys.some((k) => k.includes('|4px') && k.includes('0.073')), false, 'Entry cũ nhất phải bị loại bỏ');

      // Kiểm tra chống race condition prebakeReqSeq: ảnh #1 load chậm 200ms, ảnh #2 load nhanh 10ms
      env.imageRegistry.set('./themes/assets/shinobu_slow.png', { width: 100, height: 100, delayMs: 200 });
      env.imageRegistry.set('./themes/assets/shinobu_fast.png', { width: 100, height: 100, delayMs: 10 });
      env.window.__AGY_BLUR_CACHE__ = {};
      env.core.applyTheme({ customWp: './themes/assets/shinobu_slow.png', glassBlur: 5, wpEnabled: true }, { skipSaveDisk: true });
      env.core.applyTheme({ customWp: './themes/assets/shinobu_fast.png', glassBlur: 5, wpEnabled: true }, { skipSaveDisk: true });

      env.clock.advance(20); // ảnh fast hoàn thành
      const afterFastKeys = Object.keys(env.window.__AGY_BLUR_CACHE__);
      assert.equal(afterFastKeys.length, 1);
      assert.ok(afterFastKeys[0].includes('shinobu_fast.png'));

      env.clock.advance(250); // ảnh slow hoàn thành muộn -> phải bị bỏ qua
      const afterSlowKeys = Object.keys(env.window.__AGY_BLUR_CACHE__);
      assert.equal(afterSlowKeys.length, 1, 'Kết quả ảnh #1 hoàn tất sau ảnh #2 phải bị prebakeReqSeq loại bỏ');
      assert.equal(afterSlowKeys.some((k) => k.includes('shinobu_slow.png')), false);
    });

    it('[F05-T2-03] Split Browser Cutout bỏ kích hoạt khi [data-browser-hole="false"], kích thước <= 1px hoặc mất data-has-browser-hole', () => {
      let holeEl;
      const env = createTestEnv({
        loadCore: true,
        setupDom({ doc, shell }) {
          doc.body.setAttribute('data-has-browser-hole', 'true');
          holeEl = doc.createElement('div');
          holeEl.setAttribute('data-browser-hole', 'true');
          holeEl._rect = { left: 260, top: 40, width: 500, height: 400, right: 760, bottom: 440 };
          shell.appendChild(holeEl);
        }
      });
      assert.equal(env.shell.dataset.agyHoleActive, '1');

      // Co kích thước xuống <= 1px
      holeEl._rect = { left: 260, top: 40, width: 1, height: 400, right: 261, bottom: 440 };
      env.resizeObservers[0].cb();
      assert.equal(env.shell.dataset.agyHoleActive, undefined, 'Hole rộng <= 1px phải tắt cutout');
      assert.equal(env.shell.style.getPropertyValue('--agy-hole-clip'), '');

      // Phục hồi kích thước nhưng đặt data-browser-hole="false"
      holeEl._rect = { left: 260, top: 40, width: 500, height: 400, right: 760, bottom: 440 };
      holeEl.setAttribute('data-browser-hole', 'false');
      env.resizeObservers[0].cb();
      assert.equal(env.shell.dataset.agyHoleActive, undefined, '[data-browser-hole="false"] phải tắt cutout');

      // Bật lại rồi tắt trên body
      holeEl.setAttribute('data-browser-hole', 'true');
      env.resizeObservers[0].cb();
      assert.equal(env.shell.dataset.agyHoleActive, '1');
      env.document.body.removeAttribute('data-has-browser-hole');
      env.resizeObservers[0].cb();
      assert.equal(env.shell.dataset.agyHoleActive, undefined);
    });

    it('[F05-T2-04] Thế Giới Trong Suốt bỏ qua Modal / <input type="range"> và tắt tức thì khi hidden hoặc transparentWorld=false', () => {
      const env = createTestEnv({ loadCore: true });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const dimSlider = env.document.getElementById('agy-dim-slider');

      // Gõ nhanh trên input range và bên trong modal -> không được kích hoạt
      for (let i = 0; i < 10; i++) {
        env.window.dispatchEvent({ type: 'keydown', key: 'a', target: dimSlider });
        env.clock.advance(200);
      }
      assert.equal(env.document.documentElement.dataset.agyTransparentWorld, undefined, 'Thao tác trong Modal/range không được kích hoạt Thế Giới Trong Suốt');

      // Kích hoạt hợp lệ rồi ẩn tab
      for (let i = 0; i < 10; i++) {
        env.window.dispatchEvent({ type: 'keydown', key: 'a', target: env.composerInput });
        env.clock.advance(200);
      }
      env.clock.stepRaf(30, 32);
      assert.ok(env.window.__AGY_TRANSPARENT_WORLD__ > 0.5);

      env.document.hidden = true;
      env.document.dispatchEvent({ type: 'visibilitychange' });
      assert.equal(env.window.__AGY_TRANSPARENT_WORLD__, 0, 'document.hidden=true phải kéo __AGY_TRANSPARENT_WORLD__ về 0 ngay');
      assert.equal(env.document.documentElement.style.getPropertyValue('--agy-tw-factor'), '');

      // Mở lại tab, kích hoạt lại rồi tắt qua cài đặt transparentWorld: false
      env.document.hidden = false;
      env.document.dispatchEvent({ type: 'visibilitychange' });
      for (let i = 0; i < 10; i++) {
        env.window.dispatchEvent({ type: 'keydown', key: 'c', target: env.composerInput });
        env.clock.advance(200);
      }
      env.clock.stepRaf(30, 32);
      assert.ok(env.window.__AGY_TRANSPARENT_WORLD__ > 0.5);
      env.core.applyTheme({ transparentWorld: false }, { skipSaveDisk: true });
      assert.equal(env.window.__AGY_TRANSPARENT_WORLD__, 0, 'transparentWorld: false phải tắt ngay tức thì');
    });

    it('[F05-T2-05] GPU Arbiter dừng tức thì về 0 FPS khi document.hidden=true hoặc prefers-reduced-motion: reduce', () => {
      const env = createTestEnv({ loadCore: true });
      const rt = env.window.__AGY_SHINOBU_RT__;
      assert.ok(rt.fxRaf > 0);

      env.setReducedMotion(true);
      assert.equal(rt.fxRaf, 0, 'prefers-reduced-motion: reduce phải ngắt RAF về 0 FPS tức thì');

      env.setReducedMotion(false);
      assert.ok(rt.fxRaf > 0, 'Tắt reduce-motion phải phục hồi RAF');

      env.document.hidden = true;
      env.document.dispatchEvent({ type: 'visibilitychange' });
      assert.equal(rt.fxRaf, 0, 'document.hidden = true phải ngắt RAF về 0 FPS tức thì');
    });

    it('[F05-T2-06] applyTransientTheme & restoreSnapshot đổi giao diện tạm thời không làm bẩn localStorage / đĩa', () => {
      const env = createTestEnv({
        loadCore: true,
        boot: { initialConfig: { themeName: '🦋 Trùng Trụ — Shinobu Kocho', dimming: 35 } }
      });
      const beforeSavedCount = env.savedConfigCalls.length;
      const snap = env.core.captureSnapshot();
      assert.equal(snap.themeName, '🦋 Trùng Trụ — Shinobu Kocho');

      const ok = env.core.applyTransientTheme('Tanjiro');
      assert.equal(ok, true);
      assert.equal(env.core.getEffectiveState().themeName, '☀️ Tanjiro Kamado — Nhật Luân');
      assert.equal(env.core.getState().themeName, '🦋 Trùng Trụ — Shinobu Kocho', 'getState() & localStorage gốc phải giữ nguyên');
      assert.equal(env.savedConfigCalls.length, beforeSavedCount, 'applyTransientTheme không được ghi xuống đĩa');

      env.core.restoreSnapshot(snap);
      assert.equal(env.core.getEffectiveState().themeName, '🦋 Trùng Trụ — Shinobu Kocho');
      assert.equal(env.savedConfigCalls.length, beforeSavedCount, 'restoreSnapshot dùng skipSaveDisk không ghi thừa xuống đĩa');
    });

    it('[F05-T2-07] GPU Arbiter: khi !hasFocus(), mouseenter đánh thức tạm và mouseleave đưa về 0 FPS sau 800ms', () => {
      let renderCount = 0;
      let staticCount = 0;
      const env = createTestEnv({ loadCore: false, hasFocusInit: false });
      env.window.__AGY_KNY_FX_DRAWERS__ = () => ({
        render() { renderCount++; },
        drawStatic() { staticCount++; },
        resetClock() {},
        resize() {}
      });
      const coreCode = CORE_SRC_TEMPLATE.replace(PLACEHOLDER, () => JSON.stringify(THEMES_JSON));
      vm.runInContext(`(function(__AGY_BOOT__){ const __AGY_SEC__ = window.__AGY_SEC__; ${coreCode} })(window.__AGY_INJECT_BOOT__);`, vm.createContext(env.window));
      const rt = env.window.__AGY_SHINOBU_RT__;

      // Ban đầu !hasFocus() -> mouseenter đánh thức dù chưa có focus
      env.window.dispatchEvent({ type: 'mouseenter' });
      assert.equal(rt.fxFocusPaused, false);
      assert.ok(rt.fxRaf > 0, 'mouseenter khi !hasFocus() vẫn phải đánh thức RAF');
      env.clock.stepRaf(2, 16);
      assert.ok(renderCount >= 2);

      // Rời chuột trong trạng thái !hasFocus() -> sau 800ms phải quay về 0 FPS
      env.window.dispatchEvent({ type: 'mouseleave' });
      env.clock.advance(799);
      assert.equal(rt.fxFocusPaused, false, 'Trước mốc 800ms chưa được dừng GPU');
      env.clock.advance(5);
      assert.equal(rt.fxFocusPaused, true, 'Sau 800ms mouseleave khi !hasFocus() phải dừng GPU');
      assert.equal(rt.fxRaf, 0, 'fxRaf phải về 0 FPS');
      assert.ok(staticCount >= 1);
    });
  });
});

// ============================================================================
// F06 — `core.js` NPC 2 chiều, Theme Studio Modal, Teardown & Input File Reset
// ============================================================================

describe('F06 — NPC 2 Chiều, Theme Studio Modal, Teardown & Vòng Đời (`engine/core.js`)', { concurrency: 1 }, () => {
  describe('Tier 1 — Phủ Tính Năng', { concurrency: 1 }, () => {
    it('[F06-T1-01] Hộp thoại NPC 2 chiều nhận diện đủ 8 nhóm ý định + fallback cắt 46 ký tự qua submit form', () => {
      const env = createTestEnv({
        loadCore: true,
        boot: { initialConfig: { themeName: '🦋 Trùng Trụ — Shinobu Kocho' } }
      });
      env.setReducedMotion(true); // textContent gán đồng bộ không cần đợi typewriter
      const wrap = env.document.getElementById('agy-shinobu-npc-wrap');
      assert.ok(wrap, 'Phải gắn #agy-shinobu-npc-wrap vào composer');

      const form = wrap.querySelector('.agy-npc-chat-row');
      const input = wrap.querySelector('.agy-npc-chat-input');
      const userSentText = wrap.querySelector('.agy-npc-user-msg');
      const npcReplyText = wrap.querySelector('.agy-npc-dialog-text');

      const cases = [
        ['xin chào nhé', 'Moshi moshi'],
        ['hôm nay mình mệt quá', 'nghỉ ngơi'],
        ['dính bug đỏ lòm rồi', 'bug'],
        ['giao diện đẹp quá', 'khen'],
        ['bụng đói meo', 'đói'],
        ['buồn ngủ quá rồi', 'ngủ'],
        ['deadline gấp lắm', 'Bình tĩnh'],
        ['cảm ơn nhiều nha', 'Không có chi']
      ];

      for (const [msg, expectedSub] of cases) {
        input.value = msg;
        form.dispatchEvent({ type: 'submit', target: form });
        assert.equal(userSentText.textContent, msg);
        assert.ok(
          npcReplyText.textContent.toLowerCase().includes(expectedSub.toLowerCase()),
          `Input "${msg}" phải khớp nhóm chứa "${expectedSub}", nhận được: "${npcReplyText.textContent}"`
        );
      }

      // Kiểm tra fallback cắt tối đa 46 ký tự + "..."
      const longMsg = 'Một câu hỏi hoàn toàn ngẫu nhiên rất dài vượt quá giới hạn bốn mươi sáu ký tự chuẩn';
      input.value = longMsg;
      form.dispatchEvent({ type: 'submit', target: form });
      assert.ok(npcReplyText.textContent.includes(longMsg.slice(0, 46) + '...'), 'Fallback phải cắt đúng 46 ký tự + "..."');
    });

    it('[F06-T1-02] Thu gọn / mở lại hộp thoại NPC & giữ bất biến <i aria-hidden="true"></i> trong hitbox', () => {
      const env = createTestEnv({ loadCore: true });
      const rt = env.window.__AGY_SHINOBU_RT__;
      const wrap = env.document.getElementById('agy-shinobu-npc-wrap');
      const closeBtn = wrap.querySelector('[data-npc-act="close"]');
      const popover = wrap.querySelector('.agy-npc-popover');
      const badge = wrap.querySelector('.agy-npc-badge');

      closeBtn.click();
      assert.equal(rt.npcCollapsed, true);
      assert.equal(popover.style.display, 'none');
      assert.equal(badge.style.display, 'inline-flex');

      badge.click();
      assert.equal(rt.npcCollapsed, false);
      assert.equal(popover.style.display, 'flex');

      // Kiểm tra bất biến :empty của Antigravity 2.0
      const bubbleHitbox = env.userBubbleFrame.querySelector(':scope > .agy-chibi-hitbox');
      assert.ok(bubbleHitbox, 'Phải có .agy-chibi-hitbox bên trong .agy-user-bubble-frame');
      assert.ok(bubbleHitbox.children.length > 0 && bubbleHitbox.firstElementChild.tagName === 'I', 'Hitbox phải chứa <i aria-hidden="true"></i> chống :empty');
      assert.equal(bubbleHitbox.firstElementChild.getAttribute('aria-hidden'), 'true');

      const msgHitbox = env.userMsg.querySelector(':scope > .agy-yoriichi-msg-hit');
      assert.ok(msgHitbox && msgHitbox.firstElementChild && msgHitbox.firstElementChild.tagName === 'I');
    });

    it('[F06-T1-03] Theme Studio Modal mở, lọc Preset theo 5 nhóm & chọn Preset / Bubble / InputStyle', () => {
      const env = createTestEnv({ loadCore: true });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();

      const backdrop = env.document.getElementById('agy-custom-theme-modal-backdrop');
      assert.ok(backdrop);
      assert.equal(backdrop.style.display, 'flex');

      const body = env.document.getElementById('agy-theme-modal-body');
      const groups = ['royal', 'hashira', 'kamaboko', 'forged', 'classic'];
      for (const g of groups) {
        const chip = body.querySelector(`.agy-filter-chip[data-filter="${g}"]`);
        assert.ok(chip, `Phải có chip lọc nhóm ${g}`);
        chip.click();
        const cards = body.querySelectorAll('.agy-preset-card');
        const visibleCount = cards.filter((c) => c.style.display !== 'none').length;
        const matchedCount = cards.filter((c) => c.getAttribute('data-group') === g).length;
        assert.ok(matchedCount > 0, `Nhóm ${g} phải có ít nhất 1 preset`);
        assert.equal(visibleCount, matchedCount, `Khi lọc nhóm ${g}, chỉ thẻ thuộc nhóm này mới được hiển thị`);
      }

      // Chọn chip 'all' rồi bấm vào một preset khác, một bubble khác, một inputStyle khác
      body.querySelector('.agy-filter-chip[data-filter="all"]').click();
      const targetPreset = body.querySelector('.agy-preset-card[data-name*="Rengoku"]');
      targetPreset.click();
      assert.ok(env.core.getState().themeName.includes('Rengoku'));

      const targetBubble = body.querySelector('.agy-bubble-card[data-name*="Giyu"]');
      targetBubble.click();
      assert.ok(env.core.getState().bubbleName.includes('Giyu'));

      const targetInput = body.querySelector('.agy-input-card[data-style="double_gold"]');
      targetInput.click();
      assert.equal(env.core.getState().inputStyle, 'double_gold');
    });

    it('[F06-T1-04] Đồng bộ đa cửa sổ (syncFromDaemon=true) & nút Reset khôi phục mặc định', () => {
      const env = createTestEnv({
        loadCore: true,
        boot: {
          syncFromDaemon: true,
          initialConfig: {
            themeName: '🔥 Viêm Trụ — Kyojuro Rengoku',
            bubbleName: '🌊 Thủy Trụ — Giyu Tomioka',
            inputStyle: 'glass',
            dimming: 52,
            glassBlur: 9,
            masterPersona: 'shinobu',
            transparentWorld: false
          }
        },
        initialStorage: {
          agy_theme_v3: 'WLOP Cosmic',
          agy_master_persona_v1: 'inosuke'
        }
      });

      const st = env.core.getState();
      assert.equal(st.themeName, '🔥 Viêm Trụ — Kyojuro Rengoku', 'syncFromDaemon=true phải ghi đè localStorage cũ từ initialConfig');
      assert.equal(st.bubbleName, '🌊 Thủy Trụ — Giyu Tomioka');
      assert.equal(st.masterPersona, 'shinobu');
      assert.equal(st.glassBlur, 9);
      assert.equal(st.transparentWorld, false);

      // Mở Studio và bấm Reset
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      env.document.getElementById('agy-reset-btn').click();
      const afterReset = env.core.getState();
      assert.equal(afterReset.masterPersona, 'yoriichi');
      assert.equal(afterReset.inputStyle, 'sync');
      assert.equal(afterReset.transparentWorld, true);
    });

    it('[F06-T1-05] removeCustomTheme thực hiện teardown toàn diện 6 module con, observers, AC & DOM', () => {
      const env = createTestEnv({ loadCore: true });
      const tornDown = [];
      env.window.__AGY_TOKEN_HUD__ = { teardown: (o) => tornDown.push(['token', o]) };
      env.window.__AGY_SQUAD_RAID__ = { teardown: (o) => tornDown.push(['squad', o]) };
      env.window.__AGY_BIO_AUDIO__ = { teardown: (o) => tornDown.push(['audio', o]) };
      env.window.__AGY_CINEMA_DIRECTOR__ = { teardown: (o) => tornDown.push(['cinema', o]) };
      env.window.__AGY_KNY_CHIBI_AURA__ = { teardown: (o) => tornDown.push(['chibi', o]) };
      env.window.__AGY_KNY_SKILLS__ = { destroy: (o) => tornDown.push(['skills', o]) };

      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const acSignal = env.window.__AGY_SCROLL_AC__.signal;
      const modalObs = env.window.__AGY_MODAL_OBSERVER__;
      const shellRo = env.window.__AGY_SHELL_RO__;

      env.window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__({ isReinject: false });

      assert.equal(new Set(tornDown.map((x) => x[0])).size, 6, 'Phải gọi teardown/destroy đủ cả 6 module KNY');
      assert.equal(acSignal.aborted, true, 'AbortController phải được abort()');
      assert.equal(modalObs._active, false, 'MutationObserver phải được disconnect()');
      assert.equal(shellRo.disconnected, true, 'ResizeObserver phải được disconnect()');
      assert.equal(env.document.getElementById('antigravity-custom-theme-active'), null);
      assert.equal(env.document.getElementById('agy-custom-theme-modal-backdrop'), null);
      assert.equal(env.document.getElementById('agy-shinobu-npc-wrap'), null);
      assert.equal(env.document.getElementById('agy-live-fx-host'), null);
      assert.equal(env.window.__AGY_TRANSPARENT_WORLD__, 0);
    });

    it('[F06-T1-06] Chuyển đổi Master Persona độc lập trong Studio cập nhật hitbox không đổi themeName', () => {
      const env = createTestEnv({
        loadCore: true,
        boot: { initialConfig: { themeName: '🦋 Trùng Trụ — Shinobu Kocho' } }
      });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();

      const body = env.document.getElementById('agy-theme-modal-body');
      const select = body.querySelector('#agy-persona-select');
      select.value = 'shadow_monarch';
      select.dispatchEvent({ type: 'change', target: select });

      assert.equal(env.core.getState().masterPersona, 'shadow_monarch');
      assert.equal(env.core.getState().themeName, '🦋 Trùng Trụ — Shinobu Kocho', 'Đổi Persona không được làm đổi themeName');
      const hit = env.userBubbleFrame.querySelector(':scope > .agy-chibi-hitbox');
      assert.ok(hit.title.includes('Đế Vương Bóng Tối'), `Title hitbox phải đổi theo Persona mới, thực tế: ${hit.title}`);

      // Thử bấm pill nhanh sang 'giyu'
      const giyuPill = env.document.getElementById('agy-theme-modal-body').querySelector('.agy-persona-pill[data-persona="giyu"]');
      if (giyuPill) {
        giyuPill.click();
        assert.equal(env.core.getState().masterPersona, 'giyu');
      }
    });

    it('[F06-T1-07] Kiến trúc 5 Tab riêng biệt chuẩn WAI-ARIA 1.2, điều hướng phím mũi tên & giữ tab khi re-render', () => {
      const env = createTestEnv({ loadCore: true });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();

      const backdrop = env.document.getElementById('agy-custom-theme-modal-backdrop');
      assert.equal(backdrop.innerHTML.includes('transition: all'), false, 'Studio CSS không được dùng transition: all');

      const body = env.document.getElementById('agy-theme-modal-body');
      const tablist = body.querySelector('#agy-studio-tablist');
      assert.ok(tablist && tablist.getAttribute('role') === 'tablist', 'Phải có thanh điều hướng role="tablist"');

      const expectedTabs = ['themes', 'persona', 'chat', 'backdrop', 'forge'];
      const tabs = body.querySelectorAll('.agy-studio-tab');
      const panels = body.querySelectorAll('.agy-studio-tabpanel');
      assert.equal(tabs.length, 5, 'Phải có đúng 5 tab riêng biệt');
      assert.equal(panels.length, 5, 'Phải có đúng 5 tabpanel riêng biệt');

      const countVisiblePanels = () =>
        body.querySelectorAll('.agy-studio-tabpanel').filter((p) => p.style.display !== 'none').length;

      assert.equal(countVisiblePanels(), 1, 'Mặc định chỉ hiển thị đúng 1 tabpanel, không được sổ dọc tất cả');
      assert.equal(body.querySelector('#agy-tabpanel-themes').style.display, 'flex');

      for (const tabId of expectedTabs) {
        const tabBtn = body.querySelector(`#agy-tab-${tabId}`);
        assert.ok(tabBtn, `Thiếu nút tab ${tabId}`);
        tabBtn.click();
        assert.equal(countVisiblePanels(), 1, `Khi chọn tab ${tabId} chỉ được hiển thị đúng 1 panel`);
        assert.equal(body.querySelector(`#agy-tabpanel-${tabId}`).style.display, 'flex');
        assert.equal(tabBtn.getAttribute('aria-selected'), 'true');
        assert.equal(tabBtn.getAttribute('tabindex'), '0');
      }

      // Kiểm tra điều hướng bàn phím ArrowRight / End / Home
      const forgeTab = body.querySelector('#agy-tab-forge');
      forgeTab.dispatchEvent({ type: 'keydown', key: 'ArrowRight', preventDefault() {} });
      assert.equal(body.querySelector('#agy-tabpanel-themes').style.display, 'flex', 'ArrowRight ở tab cuối phải vòng về tab đầu');

      const themesTab = body.querySelector('#agy-tab-themes');
      themesTab.dispatchEvent({ type: 'keydown', key: 'ArrowRight', preventDefault() {} });
      assert.equal(body.querySelector('#agy-tabpanel-persona').style.display, 'flex', 'ArrowRight từ themes phải sang persona');

      // Đổi Persona trong tab persona -> renderThemePanels chạy lại vẫn phải giữ nguyên tab persona đang mở
      const select = body.querySelector('#agy-persona-select');
      select.value = 'rengoku';
      select.dispatchEvent({ type: 'change', target: select });
      assert.equal(
        env.document.getElementById('agy-theme-modal-body').querySelector('#agy-tabpanel-persona').style.display,
        'flex',
        'Sau khi re-render, Studio phải giữ nguyên tab persona đang mở'
      );
    });

    it('[F06-T1-08] Công tắc Bật/Tắt hai chiều (role="switch") cho Icon Người Dùng & Icon Trợ Lý AI + khôi phục ảnh riêng', () => {
      const env = createTestEnv({ loadCore: true });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__('persona');

      const body = env.document.getElementById('agy-theme-modal-body');
      const userSwitch = body.querySelector('#agy-user-av-clear');
      const agentSwitch = body.querySelector('#agy-agent-av-clear');
      assert.equal(userSwitch.getAttribute('role'), 'switch');
      assert.equal(agentSwitch.getAttribute('role'), 'switch');
      assert.equal(userSwitch.getAttribute('aria-checked'), 'true', 'Mặc định icon người dùng phải đang bật');

      const hasUserAvCss = () =>
        env.document.getElementById('antigravity-custom-theme-active').textContent.includes('[data-testid="user-message"]::after');
      assert.equal(hasUserAvCss(), true, 'Khi đang bật phải sinh CSS hiển thị icon người dùng');

      // Lần bấm 1: Tắt icon người dùng
      userSwitch.click();
      assert.equal(env.core.getState().userAvatar, 'none');
      assert.equal(userSwitch.getAttribute('aria-checked'), 'false');
      assert.equal(hasUserAvCss(), false, 'Khi tắt phải gỡ CSS icon người dùng');

      // Lần bấm 2: Bật lại icon người dùng
      userSwitch.click();
      assert.equal(env.core.getState().userAvatar, '');
      assert.equal(userSwitch.getAttribute('aria-checked'), 'true');
      assert.equal(hasUserAvCss(), true, 'Bấm lần 2 phải bật lại ngay icon người dùng');

      // Đặt ảnh đại diện riêng, sau đó Tắt rồi Bật lại -> phải khôi phục đúng ảnh riêng
      const customAv = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
      env.localStorage.setItem('agy_user_avatar_saved_v1', customAv);
      env.core.applyTheme({ userAvatar: customAv });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__('persona');

      const userSwitch2 = env.document.getElementById('agy-user-av-clear');
      userSwitch2.click(); // Tắt
      assert.equal(env.core.getState().userAvatar, 'none');
      userSwitch2.click(); // Bật lại
      assert.equal(env.core.getState().userAvatar, customAv, 'Bật lại sau khi tắt phải khôi phục đúng ảnh riêng đã lưu');

      // Bấm nút Dùng mặc định -> về lại icon Bản Ngã mà vẫn đang bật
      const resetDefBtn = env.document.getElementById('agy-user-av-reset-default');
      assert.ok(resetDefBtn && resetDefBtn.style.display !== 'none');
      resetDefBtn.click();
      assert.equal(env.core.getState().userAvatar, '');
      assert.equal(userSwitch2.getAttribute('aria-checked'), 'true');

      // Kiểm tra tương tự Bật/Tắt hai chiều cho Icon Trợ Lý AI
      const agentSwitch2 = env.document.getElementById('agy-agent-av-clear');
      assert.equal(agentSwitch2.getAttribute('aria-checked'), 'true');
      agentSwitch2.click();
      assert.equal(env.core.getState().agentAvatar, 'none');
      assert.equal(agentSwitch2.getAttribute('aria-checked'), 'false');
      agentSwitch2.click();
      assert.equal(env.core.getState().agentAvatar, '');
      assert.equal(agentSwitch2.getAttribute('aria-checked'), 'true');
    });

    it('[F06-T1-09] Gói 3A: applyDaemonDelta (<1KB), Cầu chì AGY_DOM_CONTRACTS, Tách lớp Chibi/Hạt/Bo góc & Chế độ Tập trung sâu', () => {
      const env = createTestEnv({ loadCore: true });

      // 1. Kiểm tra không còn bộ đếm NPC tự nhắc 180s gây xao nhãng
      assert.equal(env.window.__AGY_SHINOBU_RT__.remindTimer, 0, 'Không được đặt timer tự gõ chữ NPC 3 phút mặc định');

      // 2. Kiểm tra diagnoseDomContracts khỏe mạnh ở trạng thái chuẩn
      const diagOk = env.core.diagnoseDomContracts();
      assert.equal(diagOk.healthy, true);
      assert.equal(diagOk.degradedZones.length, 0);

      // 3. Tắt riêng Chibi (chibiEnabled: false) nhưng vẫn giữ inputStyle = 'double_gold' & chỉnh bubbleRadius = 18
      env.core.applyTheme({ inputStyle: 'double_gold', chibiEnabled: false, bubbleRadius: 18, fxDensity: 35 });
      assert.equal(env.core.getState().inputStyle, 'double_gold', 'Tắt Chibi không được làm mất kiểu viền double_gold');
      assert.equal(env.document.getElementById('agy-shinobu-npc-wrap'), null, 'chibiEnabled=false phải gỡ hộp thoại NPC');
      assert.equal(env.userBubbleFrame.querySelector(':scope > .agy-chibi-hitbox'), null, 'chibiEnabled=false phải gỡ hitbox trên bong bóng chat');
      assert.equal(env.window.__AGY_FX_DENSITY__, 0.35);
      const cssAfter = env.document.getElementById('antigravity-custom-theme-active').textContent;
      assert.ok(cssAfter.includes('border-radius: 18px !important;'), 'bubbleRadius=18 phải được áp vào khung chat');

      // 4. Đồng bộ nhanh qua applyDaemonDelta (<1KB) không lưu ngược lại ra đĩa (chống Ping-Pong)
      const savesBefore = env.savedConfigCalls.length;
      const okDelta = env.core.applyDaemonDelta({
        themeName: '🌊 Thủy Trụ — Giyu Tomioka',
        chibiEnabled: true,
        fxDensity: 80,
        autoFinisher: false,
        bubbleRadius: 10
      });
      assert.equal(okDelta, true);
      assert.equal(env.savedConfigCalls.length, savesBefore, 'applyDaemonDelta tuyệt đối không được gọi saveConfigSecure gây Ping-Pong');
      assert.equal(env.core.getState().themeName, '🌊 Thủy Trụ — Giyu Tomioka');
      assert.equal(env.core.getState().chibiEnabled, true);
      assert.equal(env.window.__AGY_AUTO_FINISHER__, false);
      assert.ok(env.document.getElementById('agy-shinobu-npc-wrap'), 'chibiEnabled=true qua Delta phải dựng lại NPC');

      // 5. Bấm nút Chế độ Tập trung sâu (#agy-focus-preset-btn) trong Studio
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__('backdrop');
      env.document.getElementById('agy-focus-preset-btn').click();
      const focusSt = env.core.getState();
      assert.equal(focusSt.chibiEnabled, false);
      assert.equal(focusSt.fxDensity, 20);
      assert.equal(focusSt.autoFinisher, false);
      assert.equal(focusSt.transparentWorld, true);
    });
  });

  describe('Tier 2 — Biên, Bảo Mật & Sửa Lỗi Hợp Đồng', () => {
    it('[F06-T2-01] Chống DOM XSS Attribute Breakout trong style="..." của Theme Studio Modal', () => {
      const env = createTestEnv({ loadCore: true });
      // Mở modal sau khi nạp gói theme có frameBg/primary chứa breakout qua importAgyThemeObject
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const body = env.document.getElementById('agy-theme-modal-body');
      const importText = body.querySelector('#agy-import-text');
      const importApply = body.querySelector('#agy-import-apply');
      importText.value = JSON.stringify({
        schema: 'agytheme/2.0',
        name: 'XSS_Studio_Probe',
        theme: {
          primary: '#fff" data-xss="1',
          frameBg: 'red" onclick="window.__xss=1',
          bgPosition: 'center" onmouseover="window.__xss=2',
          bg: 'rgba(0,0,0,0.8)" onfocus="window.__xss=3'
        }
      });
      importApply.click();

      const cardsWithHack = body.querySelectorAll('[onclick], [onmouseover], [onfocus], [data-xss]');
      assert.equal(cardsWithHack.length, 0, 'Theme Studio Modal tuyệt đối không được sinh thuộc tính event/XSS do breakout dấu nháy kép trong style="..."');
    });

    it('[F06-T1-10] Gói 3B: Chuyển đổi ngôn ngữ trực tiếp trên Header Studio (VI / EN / 日本語) & Hồ sơ theo Workspace', () => {
      const env = createTestEnv({ loadCore: true });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__('forge');
      const backdrop = env.document.getElementById('agy-custom-theme-modal-backdrop');
      const titleEl = backdrop.querySelector('#agy-custom-theme-modal-title');
      assert.equal(titleEl.textContent, 'Xưởng Giao Diện Tùy Biến');

      // Đổi sang Tiếng Anh qua nút EN trên Header
      const enBtn = backdrop.querySelector('.agy-lang-btn[data-lang="en"]');
      assert.ok(enBtn, 'Phải có nút chuyển ngôn ngữ EN trên Header');
      enBtn.click();
      assert.equal(titleEl.textContent, 'Theme Customizer Studio');
      assert.equal(backdrop.querySelector('#agy-tab-themes span').textContent, 'Gallery');

      // Đổi sang Tiếng Nhật qua nút 日本語
      const jaBtn = backdrop.querySelector('.agy-lang-btn[data-lang="ja"]');
      jaBtn.click();
      assert.equal(titleEl.textContent, 'カスタムテーマ工房');
      assert.equal(backdrop.querySelector('#agy-tab-forge span').textContent, '鍛冶場・設定');

      // Gắn Hồ sơ dự án ngay trong Tab 5
      env.core.applyTheme({ themeName: '🌊 Thủy Trụ — Giyu Tomioka', masterPersona: 'giyu' });
      const body = backdrop.querySelector('#agy-theme-modal-body');
      const wsInput = body.querySelector('#agy-ws-key-input');
      const wsBindBtn = body.querySelector('#agy-ws-bind-btn');
      wsInput.value = 'file:///workspace/Payments_Service';
      wsBindBtn.click();

      assert.equal(env.core.getSnapshot().activeWorkspace, 'payments_service');
      assert.equal(env.core.getSnapshot().workspaceProfiles.payments_service.themeName, '🌊 Thủy Trụ — Giyu Tomioka');

      // Đổi sang theme khác rồi bấm Áp dụng lại hồ sơ dự án
      env.core.applyTheme({ themeName: '🦋 Trùng Trụ — Shinobu Kocho', masterPersona: 'shinobu' });
      backdrop.querySelector('#agy-theme-modal-body .agy-ws-apply-btn[data-ws="payments_service"]').click();
      assert.equal(env.core.getSnapshot().themeName, '🌊 Thủy Trụ — Giyu Tomioka');
      assert.equal(env.core.getSnapshot().masterPersona, 'giyu');

      // Xóa hồ sơ dự án và quay về Tiếng Việt
      backdrop.querySelector('#agy-theme-modal-body .agy-ws-remove-btn[data-ws="payments_service"]').click();
      assert.equal(env.core.getSnapshot().workspaceProfiles.payments_service, undefined);
      backdrop.querySelector('.agy-lang-btn[data-lang="vi"]').click();
      assert.equal(titleEl.textContent, 'Xưởng Giao Diện Tùy Biến');
    });

    it('[F06-T2-02] Tuân thủ nhãn giao diện UI Studio 100% Tiếng Việt (không sót chuỗi Tiếng Anh thô)', () => {
      const env = createTestEnv({ loadCore: true });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const modalHtml = env.document.getElementById('agy-custom-theme-modal-backdrop').innerHTML;
      const sidebarBtn = env.document.getElementById('agy-custom-theme-sidebar-btn');
      const combinedText = modalHtml + '\n' + (sidebarBtn ? sidebarBtn.innerHTML : '');

      const forbiddenEnglishUiLabels = [
        'Custom Theme Studio',
        'Wallpaper, Pre-Baked Blur',
        'Custom Image',
        'Export JSON',
        'Import JSON / .agytheme',
        'Chat Avatars (User &amp; AI Agent)',
        'Corner Radius',
        'User Chat Bubble',
        'Composer Style',
        'Theme Presets',
        'Synced Ornament Frame',
        'Amber Gold Double Border',
        'Translucent Crystal Glass',
        'Minimal Clean',
        'Custom theme'
      ];

      for (const eng of forbiddenEnglishUiLabels) {
        assert.equal(
          combinedText.includes(eng),
          false,
          `Nhãn UI Studio vẫn còn sót cụm Tiếng Anh chưa Việt hóa: "${eng}"`
        );
      }
    });

    it('[F06-T2-03] coreDestroyed chặn hoàn toàn applyTheme & restoreSnapshot sau khi gọi removeCustomTheme()', () => {
      const env = createTestEnv({ loadCore: true });
      const snap = env.core.captureSnapshot();
      env.window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__({ isReinject: false });

      const saveCallsBefore = env.savedConfigCalls.length;
      env.core.applyTheme({ dimming: 50 });
      env.core.restoreSnapshot(snap);

      assert.equal(env.document.getElementById('antigravity-custom-theme-active'), null, 'applyTheme sau removeCustomTheme không được tái tạo <style>');
      assert.equal(env.document.getElementById('agy-live-fx-host'), null, 'applyTheme sau removeCustomTheme không được tái tạo <agy-live-fx>');
      assert.equal(env.document.getElementById('agy-shinobu-npc-wrap'), null, 'applyTheme sau removeCustomTheme không được tái tạo NPC');
      assert.equal(env.savedConfigCalls.length, saveCallsBefore, 'applyTheme sau removeCustomTheme không được ghi cấu hình ra đĩa');
    });

    it('[F06-T2-04] Lưu activeForgedTheme ra đĩa khi theme rèn chỉ được dùng làm bubbleName', () => {
      const env = createTestEnv({ loadCore: true });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const body = env.document.getElementById('agy-theme-modal-body');

      // Import 1 theme rèn qua Studio để có trong THEMES với isForged: true
      body.querySelector('#agy-import-text').value = JSON.stringify({
        schema: 'agytheme/2.0',
        name: 'Bong_Bong_Ren',
        theme: { primary: '#38bdf8', frameBg: '#0ea5e9', defaultDimming: 30 }
      });
      body.querySelector('#agy-import-apply').click();

      // Đổi nền chính về preset gốc (!isForged), nhưng giữ bubbleName là theme đã rèn
      env.savedConfigCalls.length = 0;
      env.core.applyTheme({
        themeName: '🦋 Trùng Trụ — Shinobu Kocho',
        bubbleName: 'Bong_Bong_Ren'
      });

      assert.ok(env.savedConfigCalls.length > 0);
      const lastDiskCfg = env.savedConfigCalls[env.savedConfigCalls.length - 1].config;
      assert.ok(
        lastDiskCfg.activeForgedTheme && lastDiskCfg.activeForgedTheme.isForged === true,
        'Khi bubbleName là theme rèn dù themeName là preset gốc, disk payload vẫn phải lưu activeForgedTheme'
      );
    });

    it('[F06-T2-05] Reset input[type=file].value = "" cho cả 5 thẻ upload/import để chọn lại cùng file vẫn kích hoạt change', () => {
      const env = createTestEnv({ loadCore: true });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();

      const ids = [
        '#agy-wp-upload',
        '#agy-forge-file',
        '#agy-user-av-upload',
        '#agy-agent-av-upload',
        '#agy-import-file'
      ];

      for (const sel of ids) {
        const inp = env.document.querySelector(sel);
        assert.ok(inp, `Phải tồn tại input ${sel}`);
        const isJson = sel === '#agy-import-file';
        inp.files = [{
          name: isJson ? 'theme.agytheme' : 'bg.png',
          size: 512,
          type: isJson ? 'application/json' : 'image/png',
          _dataUrl: 'data:image/png;base64,AAAA',
          _text: '{"themeName":"WLOP Cosmic"}'
        }];
        inp.value = 'C:\\fakepath\\same-file';
        inp.dispatchEvent({ type: 'change', target: inp });
        assert.equal(inp.value, '', `Input ${sel} phải tự reset .value = "" ngay trong/sau handler change`);
      }
    });

    it('[F06-T2-06] Dọn sạch thẻ <agy-live-fx> mồ côi khi canvas.getContext("2d") trả về null', () => {
      const env = createTestEnv({
        loadCore: true,
        canvasConfig: { forceNull2dContext: true }
      });

      assert.equal(
        env.document.getElementById('agy-live-fx-host'),
        null,
        'Khi canvas.getContext("2d") trả null, không được để lại thẻ <agy-live-fx id="agy-live-fx-host"> mồ côi trong DOM'
      );
    });

    it('[F06-T2-07] Chống XSS qua hộp thoại NPC 2 chiều & từ chối import file > 15MB hoặc JSON sai định dạng', () => {
      const env = createTestEnv({ loadCore: true });
      env.setReducedMotion(true);
      const wrap = env.document.getElementById('agy-shinobu-npc-wrap');
      const form = wrap.querySelector('.agy-npc-chat-row');
      const input = wrap.querySelector('.agy-npc-chat-input');
      const sentEl = wrap.querySelector('.agy-npc-user-msg');

      const xssStr = '<img src=x onerror="window.__npcXss=1">';
      input.value = xssStr;
      form.dispatchEvent({ type: 'submit', target: form });
      assert.equal(sentEl.children.length, 0, 'Tin nhắn người dùng trong NPC phải hiển thị dạng text thuần, không tạo thẻ HTML con');
      assert.equal(sentEl.textContent, xssStr);

      // Kiểm tra import file > 15MB & JSON mảng trong Studio
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const body = env.document.getElementById('agy-theme-modal-body');
      const importFile = body.querySelector('#agy-import-file');
      const importMsg = body.querySelector('#agy-import-msg');
      importFile.files = [{ name: 'huge.json', size: 15 * 1024 * 1024 + 5, type: 'application/json' }];
      importFile.dispatchEvent({ type: 'change', target: importFile });
      assert.ok(importMsg.textContent.includes('15MB'), `Phải báo lỗi vượt quá 15MB, thực tế: ${importMsg.textContent}`);

      body.querySelector('#agy-import-text').value = '[1, 2, 3]';
      body.querySelector('#agy-import-apply').click();
      assert.ok(importMsg.textContent.includes('JSON'), `Phải báo lỗi JSON không hợp lệ, thực tế: ${importMsg.textContent}`);
    });

    it('[F06-T2-08] Chuyển inputStyle sang "minimal" chỉ dọn NPC ở composer, giữ nguyên hitbox Persona trên bong bóng chat', () => {
      const env = createTestEnv({ loadCore: true });
      assert.ok(env.document.getElementById('agy-shinobu-npc-wrap'));
      assert.ok(env.composer.querySelector(':scope > .agy-chibi-hitbox'));

      env.core.applyTheme({ inputStyle: 'minimal' }, { skipSaveDisk: true });
      assert.equal(env.document.getElementById('agy-shinobu-npc-wrap'), null, 'Minimal phải dọn #agy-shinobu-npc-wrap');
      assert.equal(env.composer.querySelector(':scope > .agy-chibi-hitbox'), null, 'Minimal phải dọn hitbox ở composer');

      const bubbleHitbox = env.userBubbleFrame.querySelector(':scope > .agy-chibi-hitbox');
      assert.ok(bubbleHitbox, 'Minimal vẫn phải giữ lại hitbox Persona trên .agy-user-bubble-frame');
      assert.ok(bubbleHitbox.firstElementChild && bubbleHitbox.firstElementChild.tagName === 'I');
    });

    it('[F06-T2-09] Lưu và nạp lại end-to-end activeForgedBubbleTheme khi themeName và bubbleName là 2 theme rèn khác nhau', () => {
      const env1 = createTestEnv({ loadCore: true });
      env1.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const body = env1.document.getElementById('agy-theme-modal-body');

      body.querySelector('#agy-import-text').value = JSON.stringify({
        schema: 'agytheme/2.0',
        name: 'Nen_Ren_Rieng',
        theme: { primary: '#a855f7', bg: 'rgba(12, 8, 28, 0.92)', defaultDimming: 32 }
      });
      body.querySelector('#agy-import-apply').click();

      body.querySelector('#agy-import-text').value = JSON.stringify({
        schema: 'agytheme/2.0',
        name: 'Bong_Bong_Ren_Rieng',
        theme: { primary: '#38bdf8', userBubble: 'rgba(14, 165, 233, 0.88)', defaultDimming: 32 }
      });
      body.querySelector('#agy-import-apply').click();

      env1.savedConfigCalls.length = 0;
      env1.core.applyTheme({
        themeName: 'Nen_Ren_Rieng',
        bubbleName: 'Bong_Bong_Ren_Rieng'
      });

      const lastDiskCfg = env1.savedConfigCalls[env1.savedConfigCalls.length - 1].config;
      assert.ok(lastDiskCfg.activeForgedTheme && lastDiskCfg.activeForgedTheme.name === 'Nen_Ren_Rieng');
      assert.ok(lastDiskCfg.activeForgedBubbleTheme && lastDiskCfg.activeForgedBubbleTheme.name === 'Bong_Bong_Ren_Rieng');

      // Khởi tạo phiên mới chỉ có initialConfig từ đĩa (không có localStorage cũ)
      const env2 = createTestEnv({
        loadCore: true,
        boot: { syncFromDaemon: true, initialConfig: lastDiskCfg }
      });
      const st2 = env2.core.getState();
      assert.equal(st2.themeName, 'Nen_Ren_Rieng');
      assert.equal(st2.bubbleName, 'Bong_Bong_Ren_Rieng');
      const css2 = env2.document.getElementById('antigravity-custom-theme-active').textContent;
      assert.ok(css2.includes('#a855f7'), 'Phải giữ được màu nền chính của activeForgedTheme');
      assert.ok(css2.includes('rgba(14, 165, 233, 0.88)'), 'Phải nạp và áp dụng đúng userBubble từ activeForgedBubbleTheme');
    });

    it('[F06-T2-10] #agy-import-file reader.onerror báo lỗi đọc tệp & eviction agy_forged_themes_v2 khi STORAGE_CUSTOM_WP đụng QuotaExceededError', () => {
      const env = createTestEnv({ loadCore: true });
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const body = env.document.getElementById('agy-theme-modal-body');
      const importFile = body.querySelector('#agy-import-file');
      const importMsg = body.querySelector('#agy-import-msg');

      importFile.files = [{ name: 'corrupt.agytheme', size: 256, type: 'application/json', _shouldFail: true }];
      importFile.dispatchEvent({ type: 'change', target: importFile });
      env.clock.advance(10);
      assert.ok(importMsg.textContent.includes('Không thể đọc tệp'), `Phải báo lỗi đọc tệp, thực tế: ${importMsg.textContent}`);

      // Kiểm tra eviction agy_forged_themes_v2 khi lưu customWp bị QuotaExceededError
      const oldForgedMap = {
        Old_Forged_A: { primary: '#111', wallpaper: 'data:image/png;base64,' + 'A'.repeat(200) },
        Old_Forged_B: { primary: '#222', wallpaper: 'data:image/png;base64,' + 'B'.repeat(200) }
      };
      env.localStorage.setItem('agy_forged_themes_v2', JSON.stringify(oldForgedMap));
      const newWp = 'data:image/png;base64,' + 'C'.repeat(260);
      const currentTotal = Array.from(env.storageMap.values()).reduce((acc, v) => acc + v.length, 0);
      // Đủ chỗ sau khi xóa Old_Forged_A (~250 chars), nhưng thiếu chỗ trước khi xóa
      env.setStorageMaxChars(currentTotal + newWp.length - 80);

      env.core.applyTheme({ customWp: newWp, wpEnabled: true });
      assert.equal(env.localStorage.getItem('agy_custom_wp_v3'), newWp, 'Sau khi dọn theme rèn cũ phải lưu được customWp mới');
      const afterMap = JSON.parse(env.localStorage.getItem('agy_forged_themes_v2'));
      assert.equal('Old_Forged_A' in afterMap, false, 'Old_Forged_A phải bị dọn để nhường dung lượng cho STORAGE_CUSTOM_WP');
      assert.equal('Old_Forged_B' in afterMap, true);
    });

    it('[F06-T2-11] Kháng dangerous keys cho masterPersona qua Studio JSON, applyTheme() & sync/storage (không bật nhầm hitbox trên theme tối giản)', () => {
      const dangerousPersonas = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf'];
      const env = createTestEnv({
        loadCore: true,
        initialStorage: { agy_master_persona_v1: '__proto__' }
      });

      assert.equal(env.core.getState().masterPersona, 'yoriichi', 'getState() phải chặn masterPersona="__proto__" từ localStorage');

      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const body = env.document.getElementById('agy-theme-modal-body');

      // Chuyển sang theme tối giản thật (isOrnament: false, sticker: '')
      body.querySelector('#agy-import-text').value = JSON.stringify({
        schema: 'agytheme/2.0',
        name: 'Minimal_No_Sticker_Guard',
        theme: { primary: '#94a3b8', isOrnament: false, isChibiNpc: false, sticker: '' }
      });
      body.querySelector('#agy-import-apply').click();
      assert.equal(env.userBubbleFrame.querySelectorAll(':scope > .agy-chibi-hitbox').length, 0, 'Theme tối giản ban đầu không được có hitbox');

      const importText = body.querySelector('#agy-import-text');
      const importApply = body.querySelector('#agy-import-apply');

      for (const badP of dangerousPersonas) {
        importText.value = JSON.stringify({ masterPersona: badP });
        importApply.click();
        assert.equal(env.core.getState().masterPersona, 'yoriichi', `Studio JSON masterPersona="${badP}" phải fallback về yoriichi`);
        assert.equal(env.localStorage.getItem('agy_master_persona_v1'), 'yoriichi', `localStorage không được lưu "${badP}"`);
        assert.equal(
          env.userBubbleFrame.querySelectorAll(':scope > .agy-chibi-hitbox').length,
          0,
          `Studio JSON masterPersona="${badP}" không được kích hoạt nhầm .agy-chibi-hitbox trên theme tối giản`
        );

        env.core.applyTheme({ masterPersona: badP });
        assert.equal(env.core.getState().masterPersona, 'yoriichi', `applyTheme({ masterPersona: "${badP}" }) phải fallback về yoriichi`);
        assert.equal(env.localStorage.getItem('agy_master_persona_v1'), 'yoriichi');
        assert.equal(env.userBubbleFrame.querySelectorAll(':scope > .agy-chibi-hitbox').length, 0);
      }

      // Kiểm tra syncFromDaemon=true với dangerous key
      const envSync = createTestEnv({
        loadCore: true,
        boot: {
          syncFromDaemon: true,
          initialConfig: { masterPersona: 'constructor' }
        }
      });
      assert.equal(envSync.core.getState().masterPersona, 'yoriichi');
      assert.equal(envSync.localStorage.getItem('agy_master_persona_v1'), 'yoriichi');
    });
  });
});

// ============================================================================
// F07 — `agy_theme_forge.js` OKLCH 64×64 WCAG AA, Hue=0°, Manga B&W, 3 Presets & 18 Personas
// ============================================================================

describe('F07 — Lò Rèn OKLCH 64×64, WCAG AA, Hue=0°, Manga B&W, 3 Presets & 18 Personas (`engine/agy_theme_forge.js`)', { concurrency: 1 }, () => {
  describe('Tier 1 — Phủ Tính Năng', { concurrency: 1 }, () => {
    it('[F07-T1-01] Đủ 18 Master Personas (1 origin + 3 multiverse + 14 kny) & 16 chế độ FX chuẩn cấu trúc', () => {
      const env = createTestEnv({ loadCore: false });
      const { forge } = env;

      assert.equal(forge.PERSONA_LIST.length, 18, 'Phải có đúng 18 Master Personas');
      assert.equal(forge.FX_MODE_OPTIONS.length, 16, 'Phải có đúng 16 chế độ FX');

      const origin = forge.PERSONA_LIST.filter((p) => p.group === 'origin');
      const multiverse = forge.PERSONA_LIST.filter((p) => p.group === 'multiverse');
      const kny = forge.PERSONA_LIST.filter((p) => p.group === 'kny');
      assert.equal(origin.length, 1);
      assert.equal(origin[0].id, 'yoriichi');
      assert.equal(multiverse.length, 3);
      assert.equal(kny.length, 14);

      for (const p of forge.PERSONA_LIST) {
        assert.ok(p.id && p.label && p.shortLabel && p.tagLabel && p.skillId && p.ringColor && p.glowColor);
        assert.ok(p.userAvatar && p.userSticker && p.userCornerSvg, `Persona ${p.id} thiếu tài sản hình ảnh`);
      }

      assert.equal(forge.hasPersona('yoriichi'), true);
      assert.equal(forge.getPersona('khong_ton_tai').id, 'yoriichi');
    });

    it('[F07-T1-02] Đủ 3 Multiverse Presets hợp lệ, SVG vector sạch & đầy đủ hội thoại NPC', () => {
      const env = createTestEnv({ loadCore: false });
      const { forge } = env;

      assert.equal(forge.MULTIVERSE_PRESETS.length, 3);
      assert.deepEqual(toHost(forge.MULTIVERSE_PRESETS.map((m) => m.id)), ['shadow_monarch', 'six_eyes', 'great_sage']);

      for (const preset of forge.MULTIVERSE_PRESETS) {
        const built = preset.build();
        assert.ok(built.wallpaper.startsWith('data:image/svg+xml,'), `Preset ${preset.id} phải có backdrop SVG`);
        assert.ok(built.sticker.startsWith('data:image/svg+xml,'));
        assert.ok(built.cornerSvg.startsWith('data:image/svg+xml,'));
        assert.equal(built.actionSticker, '');
        assert.equal(built.npc.pills.length, 3);
        assert.ok(Array.isArray(built.npc.dialogs.welcome) && built.npc.dialogs.welcome.length > 0);
        assert.ok(built.npc.dialogs.act1 && built.npc.dialogs.act2 && built.npc.dialogs.act3);
        assert.ok(built.wcagReport.primaryContrast >= 4.6);
        assert.ok(built.wcagReport.textContrast >= 11.5);
      }
    });

    it('[F07-T1-03] Chuyển đổi vòng tròn rgbToOklch <-> oklchToRgb & Gamut Mapping kẹp RGB [0..255]', () => {
      const env = createTestEnv({ loadCore: false });
      const { forge } = env;

      const samples = [
        [239, 68, 68],
        [34, 197, 94],
        [56, 189, 248],
        [192, 132, 252],
        [255, 255, 255],
        [0, 0, 0]
      ];
      for (const [r, g, b] of samples) {
        const lch = forge.rgbToOklch(r, g, b);
        const back = forge.oklchToRgb(lch.L, lch.C, lch.h);
        assert.ok(Math.abs(back.r - r) <= 2 && Math.abs(back.g - g) <= 2 && Math.abs(back.b - b) <= 2,
          `Round-trip màu (${r},${g},${b}) bị lệch quá ngưỡng: (${back.r},${back.g},${back.b})`);
      }

      const extreme = forge.oklchToRgb(0.75, 0.38, 145);
      assert.ok(extreme.r >= 0 && extreme.r <= 255 && extreme.g >= 0 && extreme.g <= 255 && extreme.b >= 0 && extreme.b <= 255);
    });

    it('[F07-T1-04] buildOklchThemeDefinition đảm bảo ngưỡng WCAG AA/AAA & kiểm chứng độc lập bằng wcagContrast', () => {
      const env = createTestEnv({ loadCore: false });
      const { forge } = env;

      const hexToRgb = (hex) => {
        const h = hex.replace('#', '');
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
      };
      const rgbaToRgb = (str) => {
        const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
      };

      for (const hue of [30, 140, 220, 286]) {
        const th = forge.buildOklchThemeDefinition({ h1: hue, c1: 0.19, h2: (hue + 60) % 360, c2: 0.16 });
        for (const k of ['primary', 'accent', 'bg', 'frameBg', 'composerBg', 'sidebarBg', 'codeBg', 'textMain', 'textMuted', 'borderColor', 'userBubble', 'overlayRgb', 'pillBg', 'pillBorder']) {
          assert.ok(th[k], `Thiếu token OKLCH chuẩn: ${k}`);
        }
        assert.ok(th.wcagReport.primaryContrast >= 4.6);
        assert.ok(th.wcagReport.mutedContrast >= 4.7);
        assert.ok(th.wcagReport.textContrast >= 11.5);

        const codeBgRgb = rgbaToRgb(th.codeBg);
        const sidebarBgRgb = rgbaToRgb(th.sidebarBg);
        assert.ok(forge.wcagContrast(hexToRgb(th.primary), codeBgRgb) >= 4.5, 'Tương phản primary thực tế phải >= 4.5 (WCAG AA)');
        assert.ok(forge.wcagContrast(hexToRgb(th.accent), codeBgRgb) >= 4.5, 'Tương phản accent thực tế phải >= 4.5 (WCAG AA)');
        assert.ok(forge.wcagContrast(hexToRgb(th.textMain), codeBgRgb) >= 7.0, 'Tương phản textMain thực tế phải >= 7.0 (WCAG AAA)');
        assert.ok(forge.wcagContrast(hexToRgb(th.textMuted), sidebarBgRgb) >= 4.5, 'Tương phản textMuted thực tế phải >= 4.5 (WCAG AA)');
      }
    });

    it('[F07-T1-05] forgeFromWallpaperFile trích xuất đúng Hue chủ đạo & Hue nhấn từ ảnh 64×64 hai vùng màu', async () => {
      const env = createTestEnv({ loadCore: false });
      const rgba = makeRgba64((x, y) => {
        // 75% xanh lam (#1d4ed8), 25% vàng cam (#f59e0b)
        return y < 48 ? [29, 78, 216, 255] : [245, 158, 11, 255];
      });
      const wpUrl = 'data:image/png;base64,BLUEORANGE64';
      env.imageRegistry.set(wpUrl, { width: 64, height: 64, rgba });

      const promise = env.forge.forgeFromWallpaperFile(
        { name: 'blue_gold_4k.png', size: 2048, type: 'image/png', _dataUrl: wpUrl },
        { personaId: 'shinobu' }
      );
      env.clock.advance(20);
      const res = await promise;

      assert.equal(res.stats.achromatic, false);
      assert.ok(res.stats.h1 >= 240 && res.stats.h1 <= 280, `h1 phải nằm trong dải xanh lam, thực tế=${res.stats.h1}`);
      assert.ok(res.stats.h2 >= 50 && res.stats.h2 <= 95, `h2 phải nằm trong dải vàng cam, thực tế=${res.stats.h2}`);
      assert.equal(res.personaId, 'shinobu');
      assert.ok(res.theme.userAvatar.includes('shinobu_user_avatar.svg'));
      assert.ok(res.theme.npc && res.theme.npc.badgeLabel);
    });

    it('[F07-T1-06] Nhận diện ảnh Manga Trắng Đen / Đơn sắc 100% -> Silver-Slate & fxMode: "mist"', async () => {
      const env = createTestEnv({ loadCore: false });
      const rgba = makeRgba64((x, y) => {
        if ((x + y) % 3 === 0) return [0, 0, 0, 255];
        if ((x + y) % 3 === 1) return [120, 120, 120, 255];
        return [255, 255, 255, 255];
      });
      const wpUrl = 'data:image/png;base64,MANGABW64';
      env.imageRegistry.set(wpUrl, { width: 64, height: 64, rgba });

      const promise = env.forge.forgeFromWallpaperFile(
        { name: 'manga_panel.png', size: 1024, type: 'image/png', _dataUrl: wpUrl }
      );
      env.clock.advance(20);
      const res = await promise;

      assert.equal(res.stats.achromatic, true);
      assert.equal(res.fxMode, 'mist');
      assert.equal(res.theme.fxMode, 'mist');
      assert.equal(res.theme.wcagReport.achromatic, true);
      assert.ok(
        res.theme.concept.includes('Đơn Sắc Ngân Thiết') || res.theme.concept.includes('Monochrome Silver-Slate'),
        `Concept đơn sắc không khớp: ${res.theme.concept}`
      );
      assert.ok(res.theme.npc.badgeLabel.includes('Hà Trụ'));
    });

    it('[F07-T1-07] applyCompanionForFxMode gắn đúng nhân vật đồng hành & chuyển wisteria_royal -> royal_wisteria', () => {
      const env = createTestEnv({ loadCore: false });
      const royal = env.forge.applyCompanionForFxMode({}, 'wisteria_royal');
      assert.equal(royal.fxMode, 'wisteria_royal');
      assert.equal(royal.agentAvatar, '');
      assert.ok(royal.npc.badgeLabel.includes('Chúa Công'));
      assert.ok(royal.npc.dialogs.welcome.length > 0 && royal.npc.replies.greet);

      const dual = env.forge.applyCompanionForFxMode({}, 'sun_water');
      assert.ok(dual.npc.badgeLabel.includes('Tanjiro'));
    });
  });

  describe('Tier 2 — Biên & Góc Khuất', () => {
    it('[F07-T2-01] Bảo toàn giá trị Hue = 0° (h1=0, h2=0) và c1=0, c2=0 trong buildOklchThemeDefinition', () => {
      const env = createTestEnv({ loadCore: false });
      const chromaticRed = env.forge.buildOklchThemeDefinition({ h1: 0, c1: 0.20, h2: 0, c2: 0.15 });
      assert.equal(chromaticRed.wcagReport.dominantHue, 0, 'h1=0 không được fallback về 275');
      assert.equal(chromaticRed.wcagReport.accentHue, 0, 'h2=0 không được fallback về (h1+52)');
      assert.equal(chromaticRed.wcagReport.achromatic, false);
      assert.equal(chromaticRed.fxMode, 'sun');

      const zeroChroma = env.forge.buildOklchThemeDefinition({ h1: 0, c1: 0, h2: 0, c2: 0 });
      assert.equal(zeroChroma.wcagReport.dominantHue, 0);
      assert.equal(zeroChroma.wcagReport.accentHue, 0);
      assert.equal(zeroChroma.wcagReport.achromatic, true, 'c1=0 phải kích hoạt nhánh achromatic');
      assert.equal(zeroChroma.fxMode, 'mist');
    });

    it('[F07-T2-02] Cửa sổ trượt tròn 3-bucket chống tách peak tại biên 0°/360°', async () => {
      const env = createTestEnv({ loadCore: false });
      // Tạo màu đỏ thuần ~25°/355° phân bố hai bên 0°/360° (oklch L=0.62, C=0.22, h=354° và h=6°)
      const cA = env.forge.oklchToRgb(0.62, 0.22, 354);
      const cB = env.forge.oklchToRgb(0.62, 0.22, 6);
      const rgba = makeRgba64((x) => (x < 32 ? [cA.r, cA.g, cA.b, 255] : [cB.r, cB.g, cB.b, 255]));
      const wpUrl = 'data:image/png;base64,REDWRAP0_360';
      env.imageRegistry.set(wpUrl, { width: 64, height: 64, rgba });

      const p = env.forge.forgeFromWallpaperFile({ name: 'red_boundary.png', size: 1024, type: 'image/png', _dataUrl: wpUrl });
      env.clock.advance(20);
      const res = await p;

      const distToZero = Math.min(res.stats.h1, 360 - res.stats.h1);
      assert.ok(distToZero < 18, `Peak gộp qua biên 0°/360° phải nằm gần 0°/360°, thực tế=${res.stats.h1}`);
      assert.equal(res.fxMode, 'sun');
    });

    it('[F07-T2-03] Bỏ qua pixel trong suốt (alpha < 64) & ảnh toàn trong suốt rơi về achromatic mist', async () => {
      const env = createTestEnv({ loadCore: false });
      // 80% đỏ rực nhưng alpha=20 (trong suốt), 20% xanh lục đục alpha=255
      const rgbaMixed = makeRgba64((x, y) => (y < 51 ? [255, 0, 0, 20] : [34, 197, 94, 255]));
      const u1 = 'data:image/png;base64,ALPHA_MIX';
      env.imageRegistry.set(u1, { width: 64, height: 64, rgba: rgbaMixed });
      const p1 = env.forge.forgeFromWallpaperFile({ name: 'alpha.png', size: 1024, type: 'image/png', _dataUrl: u1 });
      env.clock.advance(20);
      const r1 = await p1;
      assert.ok(r1.stats.h1 >= 120 && r1.stats.h1 <= 165, `Pixel alpha < 64 phải bị bỏ qua, chỉ nhận xanh lục ~142°, thực tế=${r1.stats.h1}`);

      // Ảnh toàn trong suốt
      const rgbaTrans = makeRgba64(() => [255, 0, 0, 0]);
      const u2 = 'data:image/png;base64,ALPHA_ZERO';
      env.imageRegistry.set(u2, { width: 64, height: 64, rgba: rgbaTrans });
      const p2 = env.forge.forgeFromWallpaperFile({ name: 'empty_alpha.png', size: 1024, type: 'image/png', _dataUrl: u2 });
      env.clock.advance(20);
      const r2 = await p2;
      assert.equal(r2.stats.achromatic, true);
      assert.equal(r2.fxMode, 'mist');
    });

    it('[F07-T2-04] Kháng đầu vào NaN / chuỗi rỗng / URL độc hại trong buildOklchThemeDefinition', () => {
      const env = createTestEnv({ loadCore: false });
      const th = env.forge.buildOklchThemeDefinition({
        h1: NaN,
        c1: -5,
        h2: '',
        c2: Infinity,
        defaultDimming: 999,
        wallpaper: 'javascript:alert(1)'
      });
      assert.equal(th.wcagReport.dominantHue, 275);
      assert.equal(th.defaultDimming, 75);
      assert.equal(th.wallpaper, '');
      assert.ok(th.wcagReport.primaryContrast >= 4.6);
    });

    it('[F07-T2-05] forgeFromWallpaperFile từ chối file > 15MB, size 0, sai MIME, ảnh hỏng, reader lỗi & ctx=null', async () => {
      const env = createTestEnv({ loadCore: false });
      await assert.rejects(() => env.forge.forgeFromWallpaperFile({ name: 'a.png', size: 0, type: 'image/png' }), /15MB|trống/);
      await assert.rejects(() => env.forge.forgeFromWallpaperFile({ name: 'a.png', size: 15 * 1024 * 1024 + 1, type: 'image/png' }), /15MB/);
      await assert.rejects(() => env.forge.forgeFromWallpaperFile({ name: 'a.svg', size: 500, type: 'image/svg+xml' }), /PNG, JPEG, WebP/);

      const brokenUrl = 'data:image/png;base64,__broken_image__';
      const pImgErr = env.forge.forgeFromWallpaperFile({ name: 'bad.png', size: 500, type: 'image/png', _dataUrl: brokenUrl });
      const pReadErr = env.forge.forgeFromWallpaperFile({ name: 'fail.png', size: 500, type: 'image/png', _shouldFail: true });
      env.clock.advance(20);
      await assert.rejects(() => pImgErr, /hỏng/);
      await assert.rejects(() => pReadErr, /Không thể đọc/);

      const envNullCtx = createTestEnv({ loadCore: false, canvasConfig: { forceNull2dContext: true } });
      assert.equal(envNullCtx.forge.compressBackdropToDataUrl({ naturalWidth: 1920, naturalHeight: 1080 }), '');
    });

    it('[F07-T2-06] compressBackdropToDataUrl tự hạ bậc qua các tier nén & fallback JPEG khi thiếu WebP', () => {
      let calls = [];
      const envTier = createTestEnv({
        loadCore: false,
        canvasConfig: {
          customToDataUrl(mime, quality, canvasEl) {
            calls.push({ w: canvasEl.width, h: canvasEl.height, mime, quality });
            // Tier 1 (1920x1080) trả về > 1,150,000 ký tự để ép hạ xuống Tier 2 (1600x900)
            const len = canvasEl.width > 1600 ? 1200000 : 100;
            return `data:${mime};base64,${'A'.repeat(len)}`;
          }
        }
      });
      const out = envTier.forge.compressBackdropToDataUrl({ naturalWidth: 3840, naturalHeight: 2160 });
      assert.equal(calls.length, 2, 'Phải hạ bậc đúng sang tier 2 rồi dừng');
      assert.equal(calls[1].w, 1600);
      assert.equal(calls[1].h, 900);
      assert.ok(out.startsWith('data:image/webp;base64,'));

      const envNoWebp = createTestEnv({ loadCore: false, canvasConfig: { disableWebp: true } });
      const outJpeg = envNoWebp.forge.compressBackdropToDataUrl({ naturalWidth: 1920, naturalHeight: 1080 });
      assert.ok(outJpeg.startsWith('data:image/jpeg;base64,'), `Khi trình duyệt không hỗ trợ WebP phải fallback sang JPEG, thực tế=${outJpeg.slice(0, 40)}`);
    });

    it('[F07-T2-07] Chống tra cứu Prototype trên hasPersona/getPersona & đọc agy_master_persona_v1 từ localStorage', async () => {
      const env = createTestEnv({
        loadCore: false,
        initialStorage: { agy_master_persona_v1: 'giyu' }
      });
      assert.equal(env.forge.hasPersona('__proto__'), false);
      assert.equal(env.forge.hasPersona('constructor'), false);
      assert.equal(env.forge.hasPersona('toString'), false);
      assert.equal(env.forge.getPersona('constructor').id, 'yoriichi');

      const rgba = makeRgba64(() => [56, 189, 248, 255]);
      const u = 'data:image/png;base64,PERSONA_LS';
      env.imageRegistry.set(u, { width: 64, height: 64, rgba });
      const p = env.forge.forgeFromWallpaperFile({ name: 'test.png', size: 100, type: 'image/png', _dataUrl: u });
      env.clock.advance(20);
      const res = await p;
      assert.equal(res.personaId, 'giyu', 'Khi không truyền forgeOpts.personaId phải đọc từ localStorage agy_master_persona_v1');
    });

    it('[F07-T2-08] Chống tra cứu Prototype trên FX_COMPANION_SPECS tại applyCompanionForFxMode & buildOklchThemeDefinition', () => {
      const env = createTestEnv({ loadCore: false });
      for (const badFx of ['__proto__', 'constructor', 'prototype', 'toString']) {
        const applied = env.forge.applyCompanionForFxMode({ primary: '#ffffff', fxMode: 'sun' }, badFx);
        assert.equal(applied.fxMode, 'sun', `applyCompanionForFxMode với fxMode="${badFx}" phải fallback an toàn về "sun"`);
        assert.ok(applied.npc && Array.isArray(applied.npc.dialogs.welcome) && applied.npc.dialogs.welcome.length > 0);

        const appliedDirtyDef = env.forge.applyCompanionForFxMode({ primary: '#ffffff', fxMode: badFx });
        assert.equal(appliedDirtyDef.fxMode, 'sun', `applyCompanionForFxMode với themeDef.fxMode="${badFx}" phải fallback về "sun"`);

        const built = env.forge.buildOklchThemeDefinition({ fxMode: badFx });
        assert.equal(built.fxMode, 'sun', `buildOklchThemeDefinition với fxMode="${badFx}" phải fallback an toàn về "sun"`);
        assert.ok(built.npc && Array.isArray(built.npc.dialogs.welcome) && built.npc.dialogs.welcome.length > 0);
      }
    });
  });
});

// ============================================================================
// F08 — `agy_theme_forge.js` Định dạng .agytheme (agytheme/2.0), Prototype Guard & LRU
// ============================================================================

describe('F08 — Định Dạng .agytheme (agytheme/2.0), Prototype Guard, Giá Trị 0 & LRU (`engine/agy_theme_forge.js`)', { concurrency: 1 }, () => {
  describe('Tier 1 — Phủ Tính Năng', { concurrency: 1 }, () => {
    it('[F08-T1-01] Round-trip buildAgyThemePackage -> importAgyThemeObject chuẩn schema agytheme/2.0', () => {
      const env = createTestEnv({ loadCore: false });
      const built = env.forge.buildOklchThemeDefinition({ h1: 280, c1: 0.19, h2: 190, c2: 0.16 });
      const pkg = env.forge.buildAgyThemePackage('Đêm Tử Đằng 2.0', built, {
        masterPersona: 'shinobu',
        dimming: 42,
        glassBlur: 6,
        inputStyle: 'double_gold',
        transparentWorld: false
      });

      assert.equal(pkg.schema, 'agytheme/2.0');
      assert.equal(pkg.name, 'Đêm Tử Đằng 2.0');
      assert.equal(pkg.masterPersona, 'shinobu');
      assert.equal(pkg.settings.dimming, 42);
      assert.equal(pkg.settings.glassBlur, 6);
      assert.equal(pkg.settings.transparentWorld, false);

      const reg = {};
      const keys = [];
      const imported = env.forge.importAgyThemeObject(JSON.parse(JSON.stringify(pkg)), reg, keys);
      assert.equal(imported.name, 'Đêm Tử Đằng 2.0');
      assert.equal(imported.theme.isForged, true);
      assert.equal(imported.masterPersona, 'shinobu');
      assert.equal(imported.settings.glassBlur, 6);
      assert.equal(keys.includes('Đêm Tử Đằng 2.0'), true);
      assert.ok(reg['Đêm Tử Đằng 2.0']);
      assert.ok(env.localStorage.getItem('agy_forged_themes_v2').includes('Đêm Tử Đằng 2.0'));
    });

    it('[F08-T1-02] Tương thích ngược schema agytheme/1.0 & gói phẳng không bọc .theme', () => {
      const env = createTestEnv({ loadCore: false });
      const reg = {};
      const keys = [];
      const imp1 = env.forge.importAgyThemeObject({
        schema: 'agytheme/1.0',
        name: 'Legacy_V1',
        theme: { primary: '#f472b6', accent: '#38bdf8', textMain: '#f8fafc', textMuted: '#cbd5e1', codeBg: 'rgba(10,10,20,0.8)', composerBg: 'rgba(15,15,25,0.9)', userBubble: 'rgba(20,20,30,0.9)' }
      }, reg, keys);
      assert.equal(imp1.theme.secondary, '#38bdf8', 'Phải backfill mirror secondary từ accent');
      assert.equal(imp1.theme.aiCardBg, 'rgba(10,10,20,0.8)');

      const impFlat = env.forge.importAgyThemeObject({
        themeName: 'Flat_Theme',
        primary: '#facc15',
        accent: '#e879f9'
      }, reg, keys);
      assert.equal(impFlat.name, 'Flat_Theme');
      assert.equal(impFlat.theme.secondary, '#e879f9');
    });

    it('[F08-T1-03] hydrateIntoThemesRegistry nạp đủ 3 Multiverse Presets + localStorage + activeForgedTheme từ daemon', () => {
      const savedMap = {
        Local_Saved_Theme: { primary: '#4ade80', defaultDimming: 30 }
      };
      const env = createTestEnv({
        loadCore: false,
        initialStorage: { agy_forged_themes_v2: JSON.stringify(savedMap) },
        boot: {
          initialConfig: {
            themeName: 'Daemon_Active_Theme',
            activeForgedTheme: { name: 'Daemon_Active_Theme', primary: '#fb7185', defaultDimming: 28 }
          }
        }
      });

      const reg = {};
      const keys = [];
      env.forge.hydrateIntoThemesRegistry(reg, keys);

      for (const preset of env.forge.MULTIVERSE_PRESETS) {
        assert.ok(reg[preset.name] && reg[preset.name].isMultiversePreset, `Thiếu Multiverse Preset: ${preset.name}`);
      }
      assert.ok(reg['Local_Saved_Theme'].isForged);
      assert.ok(reg['Daemon_Active_Theme'].isForged);
      assert.ok(keys.includes('Daemon_Active_Theme'));
    });

    it('[F08-T1-04] Chuẩn hóa SVG URI (utf8 & base64 kèm Unicode) khi import gói .agytheme', () => {
      const env = createTestEnv({ loadCore: false });
      const svgUtf8 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>Điệp Phủ</title><circle cx="12" cy="12" r="8"/></svg>';
      const b64 = Buffer.from(svgUtf8, 'utf8').toString('base64');
      const reg = {};
      const imp = env.forge.importAgyThemeObject({
        schema: 'agytheme/2.0',
        name: 'Svg_Unicode',
        theme: {
          primary: '#c084fc',
          sticker: `data:image/svg+xml;base64,${b64}`,
          cornerSvg: `data:image/svg+xml,${encodeURIComponent(svgUtf8)}`
        }
      }, reg, []);

      assert.ok(imp.theme.sticker.startsWith('data:image/svg+xml,'), 'Base64 SVG phải chuẩn hóa thành percent-encoded data:image/svg+xml');
      assert.ok(imp.theme.cornerSvg.startsWith('data:image/svg+xml,'));
      assert.ok(decodeURIComponent(imp.theme.sticker).includes('Điệp Phủ'));
    });

    it('[F08-T1-05] downloadAgyThemeFile tạo slug tệp .agytheme hợp lệ & gọi URL.revokeObjectURL sau timeout', () => {
      const env = createTestEnv({ loadCore: false });
      const pkg = env.forge.buildAgyThemePackage('🌌 Vu Tru #1 (2026)!', { primary: '#c084fc' }, {});
      env.forge.downloadAgyThemeFile(pkg);

      assert.equal(env.createdDownloads.length, 1);
      assert.equal(env.createdDownloads[0].download, 'vu-tru-1-2026.agytheme');
      const blob = env.createdObjectUrls.get(env.createdDownloads[0].href);
      assert.ok(blob && JSON.parse(blob.text).schema === 'agytheme/2.0');

      env.clock.advance(1600);
      assert.equal(env.revokedUrls.includes(env.createdDownloads[0].href), true, 'Phải giải phóng ObjectURL sau 1500ms');
    });

    it('[F08-T1-06] Cơ chế LRU localStorage giới hạn tối đa 6 theme nặng (> 32KB), giữ nguyên theme nhẹ', () => {
      const env = createTestEnv({ loadCore: false });
      const reg = {};
      const keys = [];
      const heavyWp = 'data:image/png;base64,' + 'A'.repeat(40000);
      const lightWp = 'data:image/png;base64,AAAA';

      env.forge.registerThemeIntoRegistry(reg, keys, 'Light_1', { primary: '#fff', wallpaper: lightWp });
      for (let i = 1; i <= 7; i++) {
        env.forge.registerThemeIntoRegistry(reg, keys, `Heavy_${i}`, { primary: '#fff', wallpaper: heavyWp });
      }
      env.forge.registerThemeIntoRegistry(reg, keys, 'Light_2', { primary: '#fff', wallpaper: lightWp });

      const stored = JSON.parse(env.localStorage.getItem('agy_forged_themes_v2'));
      const storedKeys = Object.keys(stored);
      assert.equal(storedKeys.includes('Light_1'), true, 'Theme nhẹ phải được giữ lại');
      assert.equal(storedKeys.includes('Light_2'), true, 'Theme nhẹ phải được giữ lại');
      assert.equal(storedKeys.includes('Heavy_1'), false, 'Heavy_1 cũ nhất phải bị LRU loại bỏ');
      for (let i = 2; i <= 7; i++) {
        assert.equal(storedKeys.includes(`Heavy_${i}`), true);
      }

      // Làm mới Heavy_2 rồi thêm Heavy_8 -> Heavy_3 phải bị loại, Heavy_2 được giữ
      env.forge.registerThemeIntoRegistry(reg, keys, 'Heavy_2', { primary: '#fff', wallpaper: heavyWp });
      env.forge.registerThemeIntoRegistry(reg, keys, 'Heavy_8', { primary: '#fff', wallpaper: heavyWp });
      const stored2 = JSON.parse(env.localStorage.getItem('agy_forged_themes_v2'));
      assert.equal('Heavy_2' in stored2, true, 'Heavy_2 vừa cập nhật phải được làm mới thứ tự LRU');
      assert.equal('Heavy_3' in stored2, false, 'Heavy_3 trở thành cũ nhất phải bị loại');
    });
  });

  describe('Tier 2 — Biên & Góc Khuất', () => {
    it('[F08-T2-01] Bảo toàn giá trị 0 của glassBlur khi Export (buildAgyThemePackage) và Import', () => {
      const env = createTestEnv({ loadCore: false });
      const pkg = env.forge.buildAgyThemePackage('BlurZero', { primary: '#fff' }, { glassBlur: 0, dimming: 30 });
      assert.equal(pkg.settings.glassBlur, 0, 'buildAgyThemePackage không được ép glassBlur: 0 thành 3');

      const imported = env.forge.importAgyThemeObject({
        schema: 'agytheme/2.0',
        name: 'BlurZeroImport',
        settings: { glassBlur: 0 },
        theme: { primary: '#fff' }
      }, {}, []);
      assert.equal(imported.settings.glassBlur, 0, 'importAgyThemeObject phải giữ nguyên glassBlur: 0');
    });

    it('[F08-T2-02] Bảo toàn giá trị 0 của stickerTop và stickerRight khi chuẩn hóa & Import .agytheme', () => {
      const env = createTestEnv({ loadCore: false });
      const imported = env.forge.importAgyThemeObject({
        schema: 'agytheme/2.0',
        name: 'StickerZero',
        theme: {
          primary: '#fff',
          stickerTop: 0,
          stickerRight: 0
        }
      }, {}, []);
      assert.equal(imported.theme.stickerTop, 0, 'stickerTop: 0 không được rơi về -56');
      assert.equal(imported.theme.stickerRight, 0, 'stickerRight: 0 không được rơi về 10');
    });

    it('[F08-T2-03] Chặn tên theme Prototype Pollution (__proto__, constructor, prototype) khi Import, Register & Hydrate', () => {
      const env = createTestEnv({ loadCore: false });
      const dangerousNames = ['__proto__', 'constructor', 'prototype'];

      for (const badName of dangerousNames) {
        const reg = {};
        const keys = [];
        try {
          env.forge.importAgyThemeObject({
            schema: 'agytheme/2.0',
            name: badName,
            theme: { primary: '#ffffff' }
          }, reg, keys);
        } catch (_) {
          // Ném lỗi từ chối là hợp lệ
        }
        assert.equal(Object.prototype.hasOwnProperty.call(reg, badName), false, `reg không được sở hữu key nguy hiểm "${badName}"`);
        assert.equal(reg.primary, undefined, `Prototype của reg không được bị ô nhiễm bởi "${badName}"`);
        assert.equal(keys.includes(badName), false, `themeKeysArray không được chứa "${badName}"`);

        const reg2 = {};
        const keys2 = [];
        env.forge.registerThemeIntoRegistry(reg2, keys2, badName, { primary: '#ffffff' });
        assert.equal(Object.prototype.hasOwnProperty.call(reg2, badName), false);
        assert.equal(reg2.primary, undefined);
        assert.equal(keys2.includes(badName), false);
      }

      // Kiểm tra hydrateIntoThemesRegistry với localStorage và initialConfig độc hại
      const envHydrate = createTestEnv({
        loadCore: false,
        initialStorage: {
          agy_forged_themes_v2: '{"constructor":{"primary":"#ff0000"},"__proto__":{"primary":"#00ff00"}}'
        },
        boot: {
          initialConfig: {
            themeName: 'constructor',
            activeForgedTheme: { name: 'prototype', primary: '#123456' }
          }
        }
      });
      const regH = {};
      const keysH = [];
      envHydrate.forge.hydrateIntoThemesRegistry(regH, keysH);
      assert.equal(Object.prototype.hasOwnProperty.call(regH, 'constructor'), false, 'Hydrate không được ghi đè constructor lên reg');
      assert.equal(Object.prototype.hasOwnProperty.call(regH, 'prototype'), false, 'Hydrate không được ghi đè prototype lên reg');
      assert.equal(regH.primary, undefined, 'Hydrate không được làm ô nhiễm __proto__ lên reg');
      assert.equal(keysH.some((k) => dangerousNames.includes(k)), false);

      // Lọc dangerous keys trên masterPersona, inputStyle & fxMode tại buildAgyThemePackage và importAgyThemeObject
      for (const badKey of dangerousNames) {
        const pkgProto = env.forge.buildAgyThemePackage(
          'ProtoSettingTest',
          { primary: '#c084fc', fxMode: badKey },
          { masterPersona: badKey, inputStyle: badKey }
        );
        assert.equal(pkgProto.masterPersona, 'yoriichi', `buildAgyThemePackage phải fallback masterPersona="${badKey}" về yoriichi`);
        assert.equal(pkgProto.settings.inputStyle, 'sync', `buildAgyThemePackage phải fallback inputStyle="${badKey}" về sync`);
        assert.equal(pkgProto.theme.fxMode, undefined, `buildAgyThemePackage phải loại bỏ fxMode="${badKey}"`);

        const impProto = env.forge.importAgyThemeObject({
          schema: 'agytheme/2.0',
          name: 'ProtoSettingImport',
          masterPersona: badKey,
          settings: { inputStyle: badKey },
          theme: { primary: '#c084fc', fxMode: badKey }
        }, Object.create(null), []);
        assert.equal(impProto.masterPersona, undefined, `importAgyThemeObject phải loại bỏ masterPersona="${badKey}"`);
        assert.equal(impProto.settings.inputStyle, undefined, `importAgyThemeObject phải loại bỏ inputStyle="${badKey}"`);
        assert.equal(impProto.theme.fxMode, undefined, `importAgyThemeObject phải loại bỏ fxMode="${badKey}"`);
      }
    });

    it('[F08-T2-04] Từ chối định dạng & phiên bản schema .agytheme không hợp lệ', () => {
      const env = createTestEnv({ loadCore: false });
      assert.throws(() => env.forge.importAgyThemeObject(null, {}, []), /JSON Object/);
      assert.throws(() => env.forge.importAgyThemeObject([], {}, []), /JSON Object/);
      assert.throws(() => env.forge.importAgyThemeObject('invalid', {}, []), /JSON Object/);
      assert.throws(() => env.forge.importAgyThemeObject({ schema: 'agytheme/99.0', name: 'X', theme: {} }, {}, []), /không được hỗ trợ/);
    });

    it('[F08-T2-05] Khử độc SVG / URL / CSS độc hại lồng trong gói .agytheme khi Import', () => {
      const env = createTestEnv({ loadCore: false });
      const imp = env.forge.importAgyThemeObject({
        schema: 'agytheme/2.0',
        name: 'Dirty_Import',
        theme: {
          primary: 'red;background:url(evil)',
          wallpaper: 'javascript:alert(1)',
          sticker: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>evil()</script><circle cx="8" cy="8" r="4"/></svg>')
        }
      }, {}, []);

      assert.equal(imp.theme.primary, '');
      assert.equal(imp.theme.wallpaper, '');
      assert.equal(/<script|onload=/i.test(decodeURIComponent(imp.theme.sticker)), false);
    });

    it('[F08-T2-06] Xử lý QuotaExceededError của localStorage: tự cắt theme cũ hoặc trả quotaExceeded: true an toàn', () => {
      const env = createTestEnv({ loadCore: false, storageMaxChars: 6500 });
      const reg = {};
      const keys = [];
      const medWp = 'data:image/png;base64,' + 'B'.repeat(900);

      env.forge.registerThemeIntoRegistry(reg, keys, 'T1', { primary: '#111', wallpaper: medWp });
      const saved2 = env.forge.registerThemeIntoRegistry(reg, keys, 'T2', { primary: '#222', wallpaper: medWp });
      assert.equal(saved2.quotaExceeded, false, 'Phải tự giải phóng T1 khi đụng QuotaExceededError để lưu được T2');

      // Một mình theme mới vượt ngưỡng 6500 chars -> không sập app, trả quotaExceeded: true
      const huge = env.forge.registerThemeIntoRegistry(reg, keys, 'T3_Huge', {
        primary: '#333',
        wallpaper: 'data:image/png;base64,' + 'C'.repeat(7000)
      });
      assert.equal(huge.quotaExceeded, true);
      assert.ok(reg['T3_Huge'], 'Theme vẫn phải được đăng ký vào registry trên RAM dù localStorage đầy');
    });

    it('[F08-T2-07] Kháng dữ liệu localStorage bị hỏng JSON & chuẩn hóa defaultDimming thập phân (0..1) + kẹp biên [15..92]', () => {
      const env = createTestEnv({
        loadCore: false,
        initialStorage: { agy_forged_themes_v2: '{broken_json_here' }
      });
      const reg = {};
      const keys = [];
      assert.doesNotThrow(() => env.forge.hydrateIntoThemesRegistry(reg, keys));
      assert.equal(keys.length, 3, 'Vẫn phải nạp đủ 3 Multiverse Presets dù localStorage bị hỏng JSON');

      const iDec = env.forge.importAgyThemeObject({ schema: 'agytheme/2.0', name: 'DimDec', theme: { defaultDimming: 0.45 } }, reg, keys);
      const iLow = env.forge.importAgyThemeObject({ schema: 'agytheme/2.0', name: 'DimLow', theme: { defaultDimming: 5 } }, reg, keys);
      const iHigh = env.forge.importAgyThemeObject({ schema: 'agytheme/2.0', name: 'DimHigh', theme: { defaultDimming: 200 } }, reg, keys);

      assert.equal(iDec.theme.defaultDimming, 45);
      assert.equal(iLow.theme.defaultDimming, 15);
      assert.equal(iHigh.theme.defaultDimming, 92);
    });

    it('[F08-T2-08] Bảo toàn giá trị 0 của stickerW & stickerH khi import .agytheme và parseNumericProp xuất CSS 0px trong core.js', () => {
      const env = createTestEnv({ loadCore: true });
      const reg = {};
      const keys = [];
      const imp = env.forge.importAgyThemeObject({
        schema: 'agytheme/2.0',
        name: 'StickerZeroAll',
        theme: {
          primary: '#fff',
          isOrnament: true,
          isChibiNpc: true,
          sticker: 'data:image/png;base64,AAAA',
          stickerTop: 0,
          stickerRight: 0,
          stickerW: 0,
          stickerH: 0
        }
      }, reg, keys);

      assert.equal(imp.theme.stickerW, 0, 'stickerW: 0 không được rơi về giá trị mặc định');
      assert.equal(imp.theme.stickerH, 0, 'stickerH: 0 không được rơi về giá trị mặc định');

      // Nạp qua Studio vào core để kiểm tra CSS thực tế do parseNumericProp xuất ra
      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const body = env.document.getElementById('agy-theme-modal-body');
      body.querySelector('#agy-import-text').value = JSON.stringify({
        schema: 'agytheme/2.0',
        name: 'CoreStickerZero',
        theme: {
          primary: '#fff',
          isOrnament: true,
          isChibiNpc: true,
          sticker: 'data:image/png;base64,AAAA',
          stickerTop: 0,
          stickerRight: 0,
          stickerW: 0,
          stickerH: 0
        }
      });
      body.querySelector('#agy-import-apply').click();

      const css = env.document.getElementById('antigravity-custom-theme-active').textContent;
      const compRule = css.match(/\.surface-composer::before\s*\{([^}]*)\}/);
      assert.ok(compRule, 'Phải sinh CSS cho .surface-composer::before');
      assert.ok(compRule[1].includes('top: 0px;'), 'parseNumericProp phải xuất top: 0px');
      assert.ok(compRule[1].includes('right: 0px;'), 'parseNumericProp phải xuất right: 0px');
      assert.ok(compRule[1].includes('width: 0px;'), 'parseNumericProp phải xuất width: 0px');
      assert.ok(compRule[1].includes('height: 0px;'), 'parseNumericProp phải xuất height: 0px');

      // Kiểm tra stickerW: 0, stickerH: 0 với isOrnament: false, isChibiNpc: false (không cộng +6px thành 6px)
      body.querySelector('#agy-import-text').value = JSON.stringify({
        schema: 'agytheme/2.0',
        name: 'CoreStickerZeroPlain',
        theme: {
          primary: '#fff',
          isOrnament: false,
          isChibiNpc: false,
          sticker: 'assets/yoriichi_ornament.svg',
          stickerTop: 0,
          stickerRight: 0,
          stickerW: 0,
          stickerH: 0
        }
      });
      body.querySelector('#agy-import-apply').click();

      const cssPlain = env.document.getElementById('antigravity-custom-theme-active').textContent;
      const compRulePlain = cssPlain.match(/\.surface-composer::before\s*\{([^}]*)\}/);
      assert.ok(compRulePlain, 'Phải sinh CSS cho .surface-composer::before ở nhánh !isOrnament');
      assert.ok(compRulePlain[1].includes('width: 0px;'), `stickerW=0 (!isOrnament) phải giữ width: 0px, thực tế: ${compRulePlain[1]}`);
      assert.ok(compRulePlain[1].includes('height: 0px;'), `stickerH=0 (!isOrnament) phải giữ height: 0px, thực tế: ${compRulePlain[1]}`);
      assert.equal(compRulePlain[1].includes('width: 6px'), false, 'Không được cộng +6px khi stickerW === 0');

      // Kiểm tra stickerW: 0, stickerH: 0 với isOrnament: true, isChibiNpc: false (không cộng +8px/+2px)
      body.querySelector('#agy-import-text').value = JSON.stringify({
        schema: 'agytheme/2.0',
        name: 'CoreStickerZeroOrnNoChibi',
        theme: {
          primary: '#fff',
          isOrnament: true,
          isChibiNpc: false,
          sticker: 'assets/yoriichi_ornament.svg',
          stickerTop: 0,
          stickerRight: 0,
          stickerW: 0,
          stickerH: 0
        }
      });
      body.querySelector('#agy-import-apply').click();

      const cssOrnNoChibi = env.document.getElementById('antigravity-custom-theme-active').textContent;
      const compRuleOrnNoChibi = cssOrnNoChibi.match(/\.surface-composer::before\s*\{([^}]*)\}/);
      assert.ok(compRuleOrnNoChibi);
      assert.ok(compRuleOrnNoChibi[1].includes('width: 0px;'));
      assert.ok(compRuleOrnNoChibi[1].includes('height: 0px;'));
    });

    it('[F08-T2-09] Từ chối theme dạng Array/không hợp lệ ở importAgyThemeObject & fallback tên toàn khoảng trắng ở buildAgyThemePackage', () => {
      const env = createTestEnv({ loadCore: false });
      assert.throws(
        () => env.forge.importAgyThemeObject({ schema: 'agytheme/2.0', name: 'BadArray', theme: [1, 2, 3] }, {}, []),
        /không hợp lệ/
      );
      assert.throws(
        () => env.forge.importAgyThemeObject({ schema: 'agytheme/2.0', name: 'BadNull', theme: null }, {}, []),
        /không hợp lệ/
      );
      assert.throws(
        () => env.forge.importAgyThemeObject({ schema: 'agytheme/2.0', name: 'BadNum', theme: 123 }, {}, []),
        /không hợp lệ/
      );

      const pkgBlank = env.forge.buildAgyThemePackage('   \t  ', { primary: '#fff' }, {});
      assert.equal(pkgBlank.name, 'Giao Diện Đã Rèn', 'Tên toàn khoảng trắng phải fallback về Giao Diện Đã Rèn');

      // Kiểm tra thêm qua luồng Studio của core.js (cả khi có schema và khi thiếu schema)
      const envCore = createTestEnv({ loadCore: true });
      envCore.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const body = envCore.document.getElementById('agy-theme-modal-body');
      const importText = body.querySelector('#agy-import-text');
      const importApply = body.querySelector('#agy-import-apply');
      const importMsg = body.querySelector('#agy-import-msg');

      const badPayloads = [
        { schema: 'agytheme/2.0', name: 'BadCoreArray', theme: [1, 2, 3] },
        { name: 'NoSchemaArray', theme: [] },
        { name: 'NoSchemaNull', theme: null },
        { name: 'NoSchemaStr', theme: 'str' },
        { name: 'NoSchemaNum', theme: 123 }
      ];
      for (const payload of badPayloads) {
        importMsg.textContent = '';
        importText.value = JSON.stringify(payload);
        importApply.click();
        assert.ok(
          importMsg.textContent.includes('không hợp lệ'),
          `Studio phải báo lỗi rõ lên #agy-import-msg cho payload ${JSON.stringify(payload)}, thực tế="${importMsg.textContent}"`
        );
      }

      // Nhập standard config JSON hợp lệ qua Studio UI (không có schema và theme) phải hoạt động bình thường
      importMsg.textContent = '';
      importText.value = JSON.stringify({
        themeName: '🌊 Thủy Trụ — Giyu Tomioka',
        dimming: 52,
        glassBlur: 0,
        masterPersona: 'shinobu',
        inputStyle: 'glass',
        transparentWorld: false
      });
      importApply.click();
      assert.equal(importMsg.textContent, '', 'Standard config JSON hợp lệ không được báo lỗi trên #agy-import-msg');
      const stImported = envCore.core.getState();
      assert.equal(stImported.themeName, '🌊 Thủy Trụ — Giyu Tomioka');
      assert.equal(stImported.dimming, 52);
      assert.equal(stImported.glassBlur, 0);
      assert.equal(stImported.masterPersona, 'shinobu');
      assert.equal(stImported.inputStyle, 'glass');
      assert.equal(stImported.transparentWorld, false);
    });

    it('[F08-T2-10] Quản lý chibi3dEnabled qua Studio/Import/Reset & CSS ẩn sticker 2D khi Chibi 3D hoạt động', () => {
      const env = createTestEnv({ loadCore: true });
      const stInit = env.core.getState();
      assert.equal(stInit.chibi3dEnabled, true, 'chibi3dEnabled mặc định phải bật');

      const css = env.document.getElementById('antigravity-custom-theme-active').textContent;
      assert.ok(
        css.includes('.surface-composer[data-chibi-3d-active="1"]::before') && css.includes('opacity: 0 !important'),
        'Stylesheet phải có luật ẩn sticker 2D khi Chibi 3D hoạt động mà vẫn giữ nguyên .surface-composer::before gốc'
      );

      env.window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
      const body = env.document.getElementById('agy-theme-modal-body');
      assert.ok(body.querySelector('#agy-chibi-3d-toggle'), 'Tab Nhân vật phải có toggle #agy-chibi-3d-toggle');
      assert.ok(body.querySelector('#agy-chibi-mode-2d'), 'Phải có nút chuyển #agy-chibi-mode-2d');
      assert.ok(body.querySelector('#agy-chibi-mode-3d'), 'Phải có nút chuyển #agy-chibi-mode-3d');
      const glbInput = body.querySelector('#agy-chibi-glb-input');
      assert.ok(glbInput, 'Phải có input chọn tệp .glb/.vrm');
      assert.equal(glbInput.getAttribute('accept'), '.glb,.vrm');
      assert.ok(body.querySelector('#agy-chibi-glb-upload'), 'Phải có nút nạp tệp .glb/.vrm');
      assert.ok(body.querySelector('#agy-chibi-glb-reset'), 'Phải có nút chuyển về ảnh 2D gốc');

      body.querySelector('#agy-chibi-mode-2d').click();
      assert.equal(env.core.getState().chibi3dEnabled, false, 'Nút Chế độ 2D phải tắt chibi3dEnabled');
      body.querySelector('#agy-chibi-mode-3d').click();
      assert.equal(env.core.getState().chibi3dEnabled, true, 'Nút Chế độ 3D phải bật chibi3dEnabled');

      const toggle3d = body.querySelector('#agy-chibi-3d-toggle');
      toggle3d.checked = false;
      toggle3d.dispatchEvent({ type: 'change', target: toggle3d });
      assert.equal(env.core.getState().chibi3dEnabled, false);

      body.querySelector('#agy-reset-btn').click();
      assert.equal(env.core.getState().chibi3dEnabled, true, 'Reset mặc định phải bật lại chibi3dEnabled');
    });
  });
});

// ============================================================================
// F18 — `preview.html` Trang Xem Trước Độc Lập (Banner, View Mode, XSS URL, Lifecycle)
// ============================================================================

const PREVIEW_HTML = readNorm('preview.html');
const PREVIEW_SCRIPTS = (() => {
  const out = [];
  const re = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(PREVIEW_HTML)) !== null) {
    if (m[1] && m[1].trim()) out.push(m[1]);
  }
  return out;
})();
const PREVIEW_BODY_HTML = (() => {
  const m = PREVIEW_HTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1].replace(/<script\b[\s\S]*?<\/script>/gi, '') : '';
})();

function createPreviewEnv(options = {}) {
  const {
    loadSecurity = false,
    engineStubs = {},
    hiddenInit = false,
    initialStorage = {}
  } = options;

  let nowMs = 10000;
  let nextTimerId = 1;
  let nextRafId = 1;
  const timers = new Map();
  const rafQueue = new Map();

  const clock = {
    now: () => nowMs,
    advance(ms) {
      const target = nowMs + Math.max(0, ms);
      while (true) {
        let earliest = null;
        for (const t of timers.values()) {
          if (t.runAt <= target && (!earliest || t.runAt < earliest.runAt)) {
            earliest = t;
          }
        }
        if (!earliest) break;
        nowMs = earliest.runAt;
        if (earliest.interval > 0) {
          earliest.runAt += earliest.interval;
        } else {
          timers.delete(earliest.id);
        }
        earliest.fn();
      }
      nowMs = target;
    },
    stepRaf(count = 1, stepMs = 16.667) {
      for (let i = 0; i < count; i++) {
        nowMs += stepMs;
        const batch = Array.from(rafQueue.entries());
        rafQueue.clear();
        for (const [, fn] of batch) fn(nowMs);
      }
    },
    pendingTimerCount: () => timers.size
  };

  const storageMap = new Map(Object.entries(initialStorage));
  const localStorageShim = {
    get length() { return storageMap.size; },
    key(i) { return Array.from(storageMap.keys())[i] || null; },
    getItem(k) { return storageMap.has(String(k)) ? storageMap.get(String(k)) : null; },
    setItem(k, v) { storageMap.set(String(k), String(v)); },
    removeItem(k) { storageMap.delete(String(k)); },
    clear() { storageMap.clear(); }
  };

  const docListeners = createEventTargetMixin();
  const winListeners = createEventTargetMixin();
  const mutationObservers = [];

  const doc = {
    ...docListeners,
    nodeType: 9,
    hidden: hiddenInit,
    _observers: mutationObservers,
    _notifyMutation(record) {
      for (const obs of mutationObservers) {
        if (obs._active) obs._queue.push(record);
      }
    },
    flushMutations() {
      for (const obs of mutationObservers) {
        if (obs._active && obs._queue.length > 0) {
          const batch = obs._queue.splice(0, obs._queue.length);
          obs.cb(batch, obs);
        }
      }
    },
    createElement(tag) {
      return new ShimElement(doc, String(tag || 'div').toLowerCase());
    },
    getElementById(id) {
      const walk = (node) => {
        for (const ch of node.children) {
          if (ch.id === id) return ch;
          const nested = walk(ch);
          if (nested) return nested;
        }
        return null;
      };
      return walk(doc.documentElement);
    },
    querySelectorAll(sel) {
      return doc.documentElement.querySelectorAll(sel);
    },
    querySelector(sel) {
      return doc.documentElement.querySelector(sel);
    }
  };

  doc.documentElement = new ShimElement(doc, 'html');
  doc.head = new ShimElement(doc, 'head');
  doc.body = new ShimElement(doc, 'body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.body.innerHTML = PREVIEW_BODY_HTML;

  class ShimMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this._active = false;
      this._queue = [];
      mutationObservers.push(this);
    }
    observe() { this._active = true; }
    disconnect() { this._active = false; this._queue = []; }
  }

  class ShimEvent {
    constructor(type) {
      this.type = String(type);
    }
  }

  function setTimeoutShim(fn, ms = 0) {
    const id = nextTimerId++;
    timers.set(id, { id, fn, runAt: nowMs + Math.max(0, Number(ms) || 0), interval: 0 });
    return id;
  }
  function clearTimeoutShim(id) { timers.delete(id); }
  function setIntervalShim(fn, ms = 10) {
    const id = nextTimerId++;
    const interval = Math.max(1, Number(ms) || 10);
    timers.set(id, { id, fn, runAt: nowMs + interval, interval });
    return id;
  }
  function clearIntervalShim(id) { timers.delete(id); }
  function rafShim(fn) {
    const id = nextRafId++;
    rafQueue.set(id, fn);
    return id;
  }
  function cafShim(id) { rafQueue.delete(id); }

  const sandbox = {
    ...winListeners,
    document: doc,
    localStorage: localStorageShim,
    Event: ShimEvent,
    MutationObserver: ShimMutationObserver,
    setTimeout: setTimeoutShim,
    clearTimeout: clearTimeoutShim,
    setInterval: setIntervalShim,
    clearInterval: clearIntervalShim,
    requestAnimationFrame: rafShim,
    cancelAnimationFrame: cafShim,
    atob: (b64) => Buffer.from(String(b64), 'base64').toString('binary'),
    btoa: (bin) => Buffer.from(String(bin), 'binary').toString('base64'),
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    RegExp,
    Math,
    Date,
    JSON,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  Object.assign(sandbox, winListeners);
  doc._ownerWindow = sandbox;

  if (engineStubs.applyThemeSpy) sandbox.__ANTIGRAVITY_APPLY_CUSTOM_THEME__ = engineStubs.applyThemeSpy;
  if (engineStubs.openModal) sandbox.__ANTIGRAVITY_OPEN_THEME_MODAL__ = engineStubs.openModal;
  if (engineStubs.core) sandbox.__AGY_THEME_CORE__ = engineStubs.core;
  if (engineStubs.squadRaid) sandbox.__AGY_SQUAD_RAID__ = engineStubs.squadRaid;
  if (engineStubs.tokenHud) sandbox.__AGY_TOKEN_HUD__ = engineStubs.tokenHud;
  if (engineStubs.cinemaDirector) sandbox.__AGY_CINEMA_DIRECTOR__ = engineStubs.cinemaDirector;
  if (engineStubs.bioAudio) sandbox.__AGY_BIO_AUDIO__ = engineStubs.bioAudio;

  const ctx = vm.createContext(sandbox);
  if (loadSecurity) {
    vm.runInContext(`(function(__AGY_BOOT__){ ${SECURITY_SRC} })(null);`, ctx);
  }

  return {
    window: sandbox,
    document: doc,
    localStorage: localStorageShim,
    clock,
    mutationObservers,
    runScript1() {
      vm.runInContext(PREVIEW_SCRIPTS[0], ctx);
    },
    runScript2() {
      vm.runInContext(PREVIEW_SCRIPTS[1], ctx);
    },
    extractSafeUrlFn() {
      const s2 = PREVIEW_SCRIPTS[1];
      const start = s2.indexOf('function isSafePreviewImageUrl(u)');
      const end = s2.indexOf('function extractCssRuleUrl(', start);
      const fnCode = s2.slice(start, end);
      vm.runInContext(`${fnCode}; window.__testIsSafePreviewImageUrl = isSafePreviewImageUrl;`, ctx);
      return sandbox.__testIsSafePreviewImageUrl;
    }
  };
}

describe('F18 — Trang Xem Trước Độc Lập (`preview.html`)', { concurrency: 1 }, () => {
  describe('Tier 1 — Phủ Tính Năng', { concurrency: 1 }, () => {
    it('[F18-T1-01] Banner thiếu dist/theme_payload.js (Script 1): Zero Live Blur, Tiếng Việt 100% & nút đóng', () => {
      const env = createPreviewEnv();
      env.runScript1();

      const banner = env.document.getElementById('agy-build-missing-banner');
      assert.ok(banner, 'Phải tạo #agy-build-missing-banner khi thiếu __ANTIGRAVITY_APPLY_CUSTOM_THEME__');
      assert.equal(/backdrop-filter/i.test(banner.style.cssText || ''), false, 'Banner không được dùng backdrop-filter');
      assert.equal(/backdrop-filter/i.test(banner.getAttribute('style') || ''), false);
      assert.equal((PREVIEW_HTML.match(/backdrop-filter/gi) || []).length, 0, 'Toàn bộ preview.html không được chứa backdrop-filter');

      assert.ok(banner.textContent.includes('Chưa tìm thấy gói biên dịch'));
      assert.ok(banner.textContent.includes('npm run build'));

      const closeBtn = banner.querySelector('button[aria-label="Đóng thông báo"]');
      assert.ok(closeBtn);
      closeBtn.click();
      assert.equal(env.document.getElementById('agy-build-missing-banner'), null);
    });

    it('[F18-T1-02] Chuyển View (welcome <-> chat), tháo/khôi phục projStrip & gọi apply theme đúng 1 lần', () => {
      const applyThemeCalls = [];
      const resizeEvents = [];
      const env = createPreviewEnv({
        engineStubs: {
          applyThemeSpy: (...args) => applyThemeCalls.push(args)
        }
      });
      env.window.addEventListener('resize', (e) => resizeEvents.push(e));
      env.runScript2();

      const welcomeView = env.document.getElementById('welcome-view');
      const chatView = env.document.getElementById('chat-split-view');
      const slotWelcome = env.document.getElementById('composer-slot-welcome');
      const slotChat = env.document.getElementById('composer-slot-chat');
      const composer = env.document.getElementById('shared-composer');
      const projStrip = env.document.getElementById('composer-project-strip');
      const btnChat = env.document.getElementById('btn-view-chat');
      const btnWelcome = env.document.getElementById('btn-view-welcome');

      assert.notEqual(welcomeView.style.display, 'none');
      assert.equal(projStrip.parentElement, composer);
      assert.equal(composer.parentElement, slotWelcome);

      btnChat.click();
      env.clock.advance(5);
      assert.equal(welcomeView.style.display, 'none');
      assert.equal(chatView.style.display, 'flex');
      assert.equal(projStrip.parentElement, null, 'Khi sang chat view phải tháo projStrip khỏi DOM');
      assert.equal(composer.parentElement, slotChat);
      assert.equal(applyThemeCalls.length, 1);
      assert.deepEqual(toHost(applyThemeCalls[0][1]), { skipSaveDisk: true });
      assert.equal(resizeEvents.length, 1, 'Chuyển mode phải bắn sự kiện resize');

      btnWelcome.click();
      env.clock.advance(5);
      assert.equal(chatView.style.display, 'none');
      assert.equal(welcomeView.style.display, 'flex');
      assert.equal(projStrip.parentElement, composer);
      assert.equal(composer.firstElementChild, projStrip);
      assert.equal(projStrip.style.display, 'flex');
      assert.equal(composer.parentElement, slotWelcome);
    });

    it('[F18-T1-03] Fallback tên theme (Ubuyashiki) & Showcase Ornament động (Thường / Góc Khung / Tối giản)', () => {
      const env = createPreviewEnv();
      env.runScript2();

      const breadcrumb = env.document.getElementById('top-breadcrumb');
      const showcaseImg = env.document.getElementById('showcase-svg-img');
      const showcaseFile = env.document.getElementById('showcase-breadcrumb-file');
      const showcaseEmpty = env.document.getElementById('showcase-empty-note');
      const showcasePill = env.document.getElementById('showcase-tab-pill');
      const showcaseHint = env.document.getElementById('showcase-hint-label');

      // Case A: Không có style engine, core hay localStorage
      assert.ok(breadcrumb.textContent.startsWith('👑 Gia Đình Chúa Công (Ubuyashiki)'));
      assert.equal(breadcrumb.textContent.includes('Shinobu Wisteria'), false);
      assert.equal(showcaseImg.getAttribute('src'), './themes/assets/shinobu_ornament.svg');

      // Case B: Chèn style với .surface-composer::before từ daemon loopback
      const styleEl = env.document.createElement('style');
      styleEl.id = 'antigravity-custom-theme-active';
      styleEl.textContent = '.surface-composer::before { background-image: url("http://127.0.0.1:41234/assets/rengoku_ornament.svg?v=7"); }';
      env.document.head.appendChild(styleEl);
      env.document.flushMutations();

      assert.equal(showcaseImg.style.display, 'block');
      assert.equal(showcaseImg.getAttribute('src'), 'http://127.0.0.1:41234/assets/rengoku_ornament.svg?v=7');
      assert.equal(showcaseFile.textContent, 'rengoku_ornament.svg');
      assert.equal(showcaseEmpty.style.display, 'none');

      // Case C: Chỉ còn .surface-composer::after (Góc Khung)
      styleEl.textContent = '.surface-composer::after { background-image: url("./themes/assets/corner.svg"); }';
      env.document.flushMutations();
      assert.equal(showcaseImg.style.width, 'min(52%, 220px)');
      assert.ok(showcasePill.textContent.includes('💠'));
      assert.ok(showcaseHint.textContent.includes('Hoa văn Góc Khung SVG'));

      // Case D: Chế độ tối giản không ornament
      styleEl.textContent = '.surface-composer::before, .surface-composer::after { display: none !important; }';
      env.document.flushMutations();
      assert.equal(showcaseImg.style.display, 'none');
      assert.equal(showcaseImg.getAttribute('src'), null);
      assert.equal(showcaseEmpty.style.display, 'block');
      assert.equal(showcasePill.textContent, '✨ Tối giản (Không Ornament)');
      assert.equal(showcaseFile.textContent, 'không-ornament');
    });

    it('[F18-T1-04] Thanh công cụ nhanh v2.0 & Chu kỳ mô phỏng AI Reasoning 1.4s + Hủy giữa chừng', () => {
      const raidCalls = [];
      const heatCalls = [];
      const telemetrySnaps = [];
      let showcaseCalls = 0;
      let shieldOn = false;
      let trailerOn = false;

      const env = createPreviewEnv({
        engineStubs: {
          squadRaid: { simulateRaid: (p) => raidCalls.push(p) },
          tokenHud: {
            setBladeBonusHeat: (v) => heatCalls.push(v),
            ingestTelemetrySnapshot: (s) => telemetrySnaps.push(s)
          },
          cinemaDirector: {
            startShowcase: () => { showcaseCalls++; trailerOn = true; },
            togglePrivacyShield: () => { shieldOn = !shieldOn; },
            isPrivacyShieldActive: () => shieldOn,
            isShowcaseRunning: () => trailerOn
          }
        }
      });
      env.runScript2();

      env.document.getElementById('btn-demo-squad').click();
      assert.equal(raidCalls.length, 1);
      assert.equal(raidCalls[0].count, 5);
      assert.equal(raidCalls[0].subagents.length, 5);
      assert.ok(raidCalls[0].subagents.every((s) => s.isSim === true));
      assert.equal(heatCalls[heatCalls.length - 1], 96);
      env.clock.advance(6500);
      assert.equal(heatCalls[heatCalls.length - 1], 0);

      env.document.getElementById('btn-demo-trailer').click();
      env.document.getElementById('btn-demo-shield').click();
      assert.equal(showcaseCalls, 1);
      assert.equal(env.document.getElementById('btn-demo-trailer').textContent, '⏹️ Dừng Trailer');
      assert.equal(env.document.getElementById('btn-demo-shield').textContent, '🛡️ Đang Bật Khiên');

      const promptInput = env.document.getElementById('main-prompt-input');
      const sendBtn = env.document.getElementById('main-send-btn');
      const chatList = env.document.getElementById('demo-chat-list');

      promptInput.value = 'Kiểm tra Hách Đao';
      promptInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false });

      const bubbles = chatList.querySelectorAll('.agy-user-bubble-frame > .agy-user-bubble');
      assert.equal(bubbles[bubbles.length - 1].textContent, 'Kiểm tra Hách Đao');
      assert.equal(sendBtn.classList.contains('is-stopping'), true);
      assert.equal(sendBtn.getAttribute('data-testid'), 'input-cancel-button');
      assert.equal(telemetrySnaps[0].isWorking, true);
      assert.equal(telemetrySnaps[0].cid, 'preview-local');
      assert.equal(heatCalls[heatCalls.length - 1], 78);

      env.clock.advance(650);
      assert.equal(heatCalls[heatCalls.length - 1], 100);

      env.clock.advance(750);
      const lastResp = chatList.querySelectorAll('[data-testid="agent-response"]').pop();
      assert.equal(lastResp.firstElementChild.textContent, 'Đã xử lý trong 1.4s • Hách Đao hoàn tất ▸');
      const lastSnap = telemetrySnaps[telemetrySnaps.length - 1];
      assert.equal(lastSnap.isWorking, false);
      assert.equal(lastSnap.turnFinishedSeq, 2);

      env.clock.advance(1200);
      assert.equal(heatCalls[heatCalls.length - 1], 0);

      // Gửi prompt thứ 2 và bấm nút dừng ở 300ms
      promptInput.value = 'Hủy giữa chừng';
      promptInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false });
      env.clock.advance(300);
      sendBtn.click();
      const abortedResp = chatList.querySelectorAll('[data-testid="agent-response"]').pop();
      assert.equal(abortedResp.firstElementChild.textContent, 'Đã dừng suy luận ▸');
      assert.equal(telemetrySnaps[telemetrySnaps.length - 1].turnFinishedSeq, 2, 'Hủy giữa chừng không được tăng turnFinishedSeq');
      assert.equal(sendBtn.textContent, '↑');
    });

    it('[F18-T1-05] Việt hóa nhãn giao diện, giữ hook DOM bắt buộc, Bất biến R3, LF & 0% PII trên preview.html', () => {
      const legacyStrings = [
        '1. Welcome',
        'Custom Theme Studio',
        '+ New Conversation',
        'Welcome back!',
        'Worked for 4m',
        'Live Preview v2.0',
        'Local Checkout',
        'Ask anything',
        'Shinobu Wisteria'
      ];
      for (const s of legacyStrings) {
        assert.equal(PREVIEW_HTML.includes(s), false, `preview.html vẫn còn nhãn cũ chưa Việt hóa: "${s}"`);
      }

      const env = createPreviewEnv();
      const sidebarBtns = env.document.querySelectorAll('aside button');
      assert.ok(sidebarBtns.some((b) => b.textContent.includes('Customizations')), 'Phải giữ hook DOM Customizations cho core.js');
      assert.ok(env.document.querySelector('[aria-label="Select Environment"]'), 'Phải giữ hook aria-label="Select Environment"');

      const frames = env.document.querySelectorAll('.agy-user-bubble-frame');
      assert.ok(frames.length > 0);
      for (const f of frames) {
        assert.ok(
          f.children.length > 0 && f.children.every((c) => c.children.length > 0 || c.textContent.trim().length > 0),
          'Mọi phần tử con trực tiếp của .agy-user-bubble-frame không được ở trạng thái :empty'
        );
      }
      assert.equal(env.document.getElementById('agy-chibi-skill-bar'), null);

      const rawPreview = fs.readFileSync(path.join(REPO_ROOT, 'preview.html'), 'utf8');
      assert.equal(rawPreview.includes('\r\n'), false, 'preview.html phải dùng 100% LF');
      assert.equal(/([A-Za-z]:\\Users\\|\/Users\/|\/home\/|@gmail\.com|@outlook\.com|@yahoo\.com)/i.test(rawPreview), false, 'preview.html không được chứa PII');
    });
  });

  describe('Tier 2 — Biên, Bảo Mật XSS & Vòng Đời', { concurrency: 1 }, () => {
    it('[F18-T2-01] isSafePreviewImageUrl chấp nhận đầy đủ URL ảnh hợp lệ', () => {
      const env = createPreviewEnv({ loadSecurity: true });
      const isSafe = env.extractSafeUrlFn();
      const validUrls = [
        'assets/shinobu_ornament.svg',
        './themes/assets/ubuyashiki_ornament.svg?v=2026',
        'http://127.0.0.1:45678/assets/bg.webp?v=1',
        'https://127.0.0.1:8443/assets/avatar.png',
        'data:image/png;base64,iVBORw0KGgo=',
        'data:image/jpeg;base64,/9j/4AAQ',
        'data:image/webp;base64,UklGRg==',
        'data:image/gif;base64,R0lGODlh',
        'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="2"/></svg>')
      ];
      for (const u of validUrls) {
        assert.equal(isSafe(u), true, `URL hợp lệ phải được chấp nhận: ${u}`);
      }
    });

    it('[F18-T2-02] isSafePreviewImageUrl & extractCssRuleUrl chặn XSS, CSS Injection, Scheme lạ & Path Traversal', () => {
      const env = createPreviewEnv({ loadSecurity: true });
      const isSafe = env.extractSafeUrlFn();
      const badUrls = [
        'javascript:alert(1)',
        'JAVASCRIPT:alert(1)',
        'vbscript:msgbox(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'https://evil.com/assets/x.png',
        'http://localhost:3000/assets/x.png',
        'http://127.0.0.1:3000/secret/x.png',
        '//evil.com/assets/x.png',
        './themes/assets/../../secret.svg',
        'assets/../x.png',
        'http://127.0.0.1:8080/assets/../x.svg',
        'assets/x.svg")',
        'assets/x.svg;background:red',
        'assets/x.svg\nalert(1)',
        'assets/x.svg<>`{}',
        '',
        '   ',
        null,
        undefined,
        123,
        {}
      ];
      for (const u of badUrls) {
        assert.equal(isSafe(u), false, `URL nguy hiểm phải bị chặn: ${String(u)}`);
      }

      // Kiểm tra defense-in-depth khi thiếu window.__AGY_SEC__
      const envNoSec = createPreviewEnv({ loadSecurity: false });
      const isSafeNoSec = envNoSec.extractSafeUrlFn();
      const svgB64 = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s, 'utf8').toString('base64');
      assert.equal(isSafeNoSec('data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%3E%3C/svg%3E'), false, 'Thiếu __AGY_SEC__ vẫn phải chặn SVG onload');
      assert.equal(isSafeNoSec('data:image/svg+xml,%253Csvg%253E%253Cscript%253Ealert(1)%253C/script%253E%253C/svg%253E'), false, 'Thiếu __AGY_SEC__ vẫn phải chặn SVG double-encoded');

      // 6 vector Vòng 1 + các biến thể Vòng 2 (custom XLink prefix, src=, CSS3 hex escape, ký tự điều khiển) khi thiếu __AGY_SEC__
      const noSecBadSvgs = [
        '<svg xmlns="http://www.w3.org/2000/svg"><style>@im/**/port "https://evil.test/x.css";</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:u/**/rl(https://evil.test/leak)}</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="onload" to="alert(1)"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.test/a.svg#x"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#x09;script:alert(1)"><rect width="10" height="10"/></a></svg>',
        '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "https://evil.test/xxe">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink"><use x:href="https://evil.test/a.svg#x"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:ns1="http://www.w3.org/1999/xlink"><image ns1:href="https://evil.test/leak.png" width="10" height="10"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink"><filter id="f"><feImage x:href="https://evil.test/leak.png"/></filter></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><image src="https://evil.test/leak.png" width="10" height="10"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><filter id="f"><feImage src="https://evil.test/leak.png"/></filter></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{background-image:\\69mage("https://evil.test/leak.png")}</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>@\\69mport "https://evil.test/x.css";</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:\\75rl(https://evil.test/leak.png)}</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:\\000075 rl(https://evil.test/leak.png)}</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>@&#x5c;69mport "https://evil.test/x.css";</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{background:image&#x01;("https://evil.test/leak.png")}</style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{behavior&#x01;:url(#x)}</style></svg>',
        // Vector Vòng 3: XML NCName prefix chứa dấu chấm `.` hoặc Unicode, và thẻ SVG 1.1 tải tài nguyên ngoài
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h.1="http://www.w3.org/1999/xhtml"><h.1:script>alert(1)</h.1:script></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h.1="http://www.w3.org/2000/svg"><h.1:foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></h.1:foreignObject></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x.1="http://www.w3.org/1999/xlink"><use x.1:href="https://evil.test/a.svg#x"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s.1="http://www.w3.org/2000/svg"><s.1:image href="https://evil.test/leak.png" width="10" height="10"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s.1="http://www.w3.org/2000/svg"><s.1:use href="https://evil.test/a.svg#x"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s.1="http://www.w3.org/2000/svg"><s.1:style><!--</s.1:style><h.1:script xmlns:h.1="http://www.w3.org/1999/xhtml">alert(1)</h.1:script>--></s.1:style></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:α="http://www.w3.org/1999/xhtml"><α:script>alert(1)</α:script></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:α="http://www.w3.org/1999/xlink"><image α:href="https://evil.test/leak.png"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x.1="http://www.w3.org/1999/xlink"><rect x.1:attributeName="onload" width="10" height="10"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><cursor xlink:href="https://evil.test/leak.png"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><font-face-uri xlink:href="https://evil.test/font.svg#f"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><color-profile name="c" xlink:href="https://evil.test/c.icc"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><tref xlink:href="https://evil.test/t.svg#t"/></svg>'
      ];
      for (const badSvg of noSecBadSvgs) {
        assert.equal(isSafeNoSec(svgB64(badSvg)), false, `Nhánh thiếu __AGY_SEC__ (base64) phải chặn vector SVG/CSS/SMIL: ${badSvg}`);
        assert.equal(isSafeNoSec('data:image/svg+xml,' + encodeURIComponent(badSvg)), false, `Nhánh thiếu __AGY_SEC__ (utf8) phải chặn vector SVG/CSS/SMIL: ${badSvg}`);
      }
      assert.equal(
        isSafeNoSec('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink"><use x:href="https://evil.test/a.svg#x"/></svg>')),
        false,
        'Nhánh thiếu __AGY_SEC__ (utf8) phải chặn x:href ngoài trên <use>'
      );
      assert.equal(
        isSafeNoSec('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><style>@&#x5c;69mport "https://evil.test/x.css";</style></svg>')),
        false,
        'Nhánh thiếu __AGY_SEC__ (utf8) phải chặn &#x5c; CSS escape'
      );

      assert.equal(isSafeNoSec(svgB64('<svg version="1.1" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="2"/></svg>')), true, 'SVG sạch có version="1.1" vẫn phải hợp lệ');
      assert.equal(
        isSafeNoSec(svgB64('<!-- clean comment --><svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink"><defs><linearGradient id="offset"><stop offset="0%" stop-color="#fff"/></linearGradient></defs><path class="set-1" d="M0 0" fill="url(#offset)"/><use x:href="#offset"/><image src="data:image/png;base64,AAAA"/><filter id="f"><feImage x:href="#offset"/></filter></svg>')),
        true,
        'SVG sạch có comment XML ngoài thẻ, id="offset", class="set-1", linearGradient, url(#offset), x:href="#offset" và raster src base64 vẫn phải hợp lệ khi thiếu __AGY_SEC__'
      );

      // Kiểm thử tích hợp DOM với <style id="antigravity-custom-theme-active"> độc hại
      env.runScript2();
      const badStyle = env.document.createElement('style');
      badStyle.id = 'antigravity-custom-theme-active';
      badStyle.textContent = [
        '.surface-composer::before { background-image: url("data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%3E%3C/svg%3E"); }',
        '.agy-user-bubble-frame::before { background-image: url("javascript:alert(1)"); }'
      ].join('\n');
      env.document.head.appendChild(badStyle);
      env.document.flushMutations();

      assert.equal(env.document.getElementById('showcase-svg-img').getAttribute('src'), null);
      assert.equal(env.document.getElementById('showcase-empty-note').style.display, 'block');
    });

    it('[F18-T2-03] Dọn & khôi phục interval 800ms theo visibilitychange (chống nhân đôi timer)', () => {
      let shieldCheckCalls = 0;
      const env = createPreviewEnv({
        engineStubs: {
          cinemaDirector: {
            isPrivacyShieldActive: () => { shieldCheckCalls++; return false; },
            isShowcaseRunning: () => false
          }
        }
      });
      env.runScript2();
      const baseCalls = shieldCheckCalls;

      env.document.hidden = true;
      env.document.dispatchEvent({ type: 'visibilitychange' });
      const afterHideCalls = shieldCheckCalls;
      env.clock.advance(4000);
      assert.equal(shieldCheckCalls, afterHideCalls, 'Khi document.hidden = true interval 800ms phải ngừng chạy');

      env.document.hidden = false;
      env.document.dispatchEvent({ type: 'visibilitychange' });
      env.document.dispatchEvent({ type: 'visibilitychange' });
      assert.equal(shieldCheckCalls, afterHideCalls + 2, 'Mỗi sự kiện hiện tab đồng bộ ngay 1 lần');
      const beforeInterval = shieldCheckCalls;
      env.clock.advance(850);
      assert.equal(shieldCheckCalls, beforeInterval + 1, 'Sau 850ms chỉ được chạy đúng 1 nhịp interval (không nhân đôi)');
      assert.ok(baseCalls >= 1);
    });

    it('[F18-T2-04] Dọn toàn diện Observer, Timer & Listener khi pagehide và beforeunload', () => {
      for (const evtName of ['pagehide', 'beforeunload']) {
        const heatCalls = [];
        const telemCalls = [];
        const env = createPreviewEnv({
          engineStubs: {
            tokenHud: {
              setBladeBonusHeat: (v) => heatCalls.push(v),
              ingestTelemetrySnapshot: (s) => telemCalls.push(s)
            }
          }
        });
        env.runScript2();

        env.document.getElementById('btn-demo-squad').click();
        const promptInput = env.document.getElementById('main-prompt-input');
        promptInput.value = 'Lifecycle Test';
        promptInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false });
        env.clock.advance(5);

        const heatCountBefore = heatCalls.length;
        const telemCountBefore = telemCalls.length;
        env.window.dispatchEvent({ type: evtName });

        assert.equal(env.mutationObservers.every((o) => o._active === false), true, `${evtName}: mọi MutationObserver phải disconnect`);
        assert.equal(env.clock.pendingTimerCount(), 0, `${evtName}: mọi timer/interval phải được clear`);
        assert.equal((env.window._listeners.get('storage') || []).length, 0);
        assert.equal((env.window._listeners.get('pagehide') || []).length, 0);
        assert.equal((env.window._listeners.get('beforeunload') || []).length, 0);
        assert.equal((env.document._listeners.get('visibilitychange') || []).length, 0);

        env.clock.advance(10000);
        assert.equal(heatCalls.length, heatCountBefore);
        assert.equal(telemCalls.length, telemCountBefore);
      }
    });

    it('[F18-T2-05] Hành vi biên trong UI Demo (modeChanged=false, IME composition, prompt rỗng, demoPendingRespEl detached)', () => {
      const applyCalls = [];
      const env = createPreviewEnv({
        engineStubs: {
          applyThemeSpy: (...args) => applyCalls.push(args)
        }
      });
      env.runScript2();

      // Bấm welcome khi đang ở welcome -> modeChanged=false -> không gọi applyTheme
      env.document.getElementById('btn-view-welcome').click();
      assert.equal(applyCalls.length, 0);

      const promptInput = env.document.getElementById('main-prompt-input');
      const chatList = env.document.getElementById('demo-chat-list');
      const initBubbleCount = chatList.querySelectorAll('.agy-user-bubble').length;

      promptInput.value = '   ';
      promptInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false });
      assert.equal(chatList.querySelectorAll('.agy-user-bubble').length, initBubbleCount);

      promptInput.value = 'Đang gõ bộ gõ Tiếng Việt';
      promptInput.dispatchEvent({ type: 'keydown', key: 'Enter', isComposing: true });
      promptInput.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 229 });
      assert.equal(chatList.querySelectorAll('.agy-user-bubble').length, initBubbleCount);

      // Gửi prompt hợp lệ rồi gỡ demoPendingRespEl trước 1400ms
      promptInput.value = 'Test detached';
      promptInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false });
      const resps = chatList.querySelectorAll('[data-testid="agent-response"]');
      resps[resps.length - 1].remove();

      assert.doesNotThrow(() => env.clock.advance(1400));
      const sendBtn = env.document.getElementById('main-send-btn');
      assert.equal(sendBtn.textContent, '↑');
      assert.equal(sendBtn.classList.contains('is-stopping'), false);
    });
  });
});

// ============================================================================
// F25 — Canon Character Soul Conversation Engine v3.2 (19 Cá Thể Nguyên Tác)
// ============================================================================

describe('F25 — Hệ Thống Hội Thoại Cá Thể Hóa Nhân Vật Chuẩn Nguyên Tác (`engine/core.js` & `themes/themes.json`)', { concurrency: 1 }, () => {
  it('[F25-T1-01] 15 nhân vật Kimetsu no Yaiba + 3 Đa Vũ Trụ phân định rõ 18 charId riêng biệt, aura riêng & chip gợi ý không trùng lặp', () => {
    const env = createTestEnv({ loadCore: true });
    const presetCharPairs = [
      ['👑 Gia Đình Chúa Công (Ubuyashiki)', 'ubuyashiki'],
      ['🦋 Trùng Trụ — Shinobu Kocho', 'shinobu'],
      ['🌊 Thủy Trụ — Giyu Tomioka', 'giyu'],
      ['🔥 Viêm Trụ — Kyojuro Rengoku', 'rengoku'],
      ['💎 Âm Trụ — Tengen Uzui', 'uzui'],
      ['🌫️ Hà Trụ — Muichiro Tokito', 'muichiro'],
      ['🌸 Luyến Trụ — Mitsuri Kanroji', 'mitsuri'],
      ['🐍 Xà Trụ — Obanai Iguro', 'obanai'],
      ['🌪️ Phong Trụ — Sanemi Shinazugawa', 'sanemi'],
      ['📿 Nham Trụ — Gyomei Himejima', 'gyomei'],
      ['☀️ Tanjiro Kamado — Nhật Luân', 'tanjiro'],
      ['🎋 Nezuko Kamado — Hồng Liên', 'nezuko'],
      ['⚡ Zenitsu Agatsuma — Lôi Minh', 'zenitsu'],
      ['🐗 Inosuke Hashibira — Dã Thú', 'inosuke'],
      ['🌌 Đế Vương Bóng Tối', 'shadow_monarch'],
      ['♾️ Vô Lượng Không Xứ', 'six_eyes'],
      ['🔥 Hắc Thần Đại Thánh', 'great_sage']
    ];

    const seenAuras = new Set();
    const seenIdentityReplies = new Set();

    for (const [themeName, expectedCharId] of presetCharPairs) {
      env.core.applyTheme({ themeName, bubbleName: themeName, masterPersona: 'yoriichi' }, { skipSaveDisk: true });
      const meta = env.core.getNpcSoulMeta();
      assert.equal(meta.charId, expectedCharId, `Theme "${themeName}" phải ánh xạ đúng charId="${expectedCharId}"`);
      assert.equal(seenAuras.has(meta.aura), false, `Aura "${meta.aura}" của ${expectedCharId} phải độc nhất`);
      seenAuras.add(meta.aura);
      assert.ok(meta.chips.length >= 3, `Nhân vật ${expectedCharId} phải có ít nhất 3 chip gợi ý chủ đề cá nhân`);

      const idRes = env.core.converseWithNpc('Bạn là ai? Kể về bản thân đi!');
      assert.equal(idRes.charId, expectedCharId);
      assert.equal(idRes.intent, 'identity');
      assert.equal(seenIdentityReplies.has(idRes.reply), false, `Câu tự giới thiệu của ${expectedCharId} phải là cá thể độc lập không trùng lặp`);
      seenIdentityReplies.add(idRes.reply);
    }
  });

  it('[F25-T1-02] Chuẩn đại từ & chi tiết nguyên tác đặc trưng: Giyu (xưng Tôi, Sake Daikon, không bị ghét), Nezuko (thức tỉnh không nói lắp), Muichiro (không giả quên), Sanemi (Ohagi)', () => {
    const env = createTestEnv({ loadCore: true });

    // 1. Giyu Tomioka: xưng Tôi, cá hồi hầm củ cải, bị trêu "bị ghét" phản bác đúng nguyên tác
    env.core.applyTheme({ themeName: '🌊 Thủy Trụ — Giyu Tomioka', bubbleName: '🌊 Thủy Trụ — Giyu Tomioka' }, { skipSaveDisk: true });
    const giyuFood = env.core.converseWithNpc('Giyu thích ăn món gì nhất?').reply;
    assert.match(giyuFood, /cá hồi hầm củ cải/i);
    const giyuTease = env.core.converseWithNpc('Sao anh bị ghét thế?').reply;
    assert.match(giyuTease, /không.*bị.*ghét/i);
    const giyuGreet = env.core.converseWithNpc('Chào Giyu nhé!').reply;
    assert.equal(/\bta\b/i.test(giyuGreet), false, 'Giyu nguyên tác xưng Tôi, không dùng đại từ cổ trang "ta"');

    // 2. Nezuko Kamado: giọng thức tỉnh dưới ánh dương (Bộc Huyết, Konpeito), không còn chuỗi kịch bản ngoặc đơn cũ
    env.core.applyTheme({ themeName: '🎋 Nezuko Kamado — Hồng Liên', bubbleName: '🎋 Nezuko Kamado — Hồng Liên' }, { skipSaveDisk: true });
    const nezukoGreet = env.core.converseWithNpc('Chào Nezuko nha!').reply;
    assert.equal(nezukoGreet.includes('(Nezuko'), false, 'Nezuko thức tỉnh không dùng kịch bản đóng mở ngoặc thô cứng');
    assert.equal(nezukoGreet.includes('Chào... bạn...'), false, 'Nezuko thức tỉnh không nói lắp ngắt dấu ba chấm cũ');
    assert.match(env.core.converseWithNpc('Huyết Quỷ Thuật Bộc Huyết hoạt động thế nào?').reply, /Bộc Huyết|lửa hồng/i);

    // 3. Muichiro Tokito: thức tỉnh trong trẻo (Vô Hạn, củ cải hầm tương miso), không giả quên
    env.core.applyTheme({ themeName: '🌫️ Hà Trụ — Muichiro Tokito', bubbleName: '🌫️ Hà Trụ — Muichiro Tokito' }, { skipSaveDisk: true });
    const muiFood = env.core.converseWithNpc('Muichiro thích ăn gì?').reply;
    assert.match(muiFood, /củ cải hầm tương miso|Furofuki Daikon/i);
    const muiTease = env.core.converseWithNpc('Cậu hay đãng trí thế').reply;
    assert.match(muiTease, /nhớ/i);

    // 4. Sanemi Shinazugawa: thích bánh Ohagi đậu đỏ & thương em trai Genya
    env.core.applyTheme({ themeName: '🌪️ Phong Trụ — Sanemi Shinazugawa', bubbleName: '🌪️ Phong Trụ — Sanemi Shinazugawa' }, { skipSaveDisk: true });
    assert.match(env.core.converseWithNpc('Nghe đồn anh thích ăn bánh Ohagi hả?').reply, /Ohagi/i);
    assert.match(env.core.converseWithNpc('Anh nghĩ sao về em trai Genya?').reply, /Genya.*em trai/i);
  });

  it('[F25-T1-03] Thích ứng quan hệ 2 chiều với Master Persona (Chúa Công Ubuyashiki & cặp Chemistry nguyên tác Obanai <-> Mitsuri, Zenitsu <-> Nezuko)', () => {
    const env = createTestEnv({ loadCore: true });
    env.setReducedMotion(true);

    // Sanemi & Obanai khi gặp Chúa Công (masterPersona = ubuyashiki) phải cung kính tuyệt đối
    env.core.applyTheme({
      themeName: '🌪️ Phong Trụ — Sanemi Shinazugawa',
      bubbleName: '🌪️ Phong Trụ — Sanemi Shinazugawa',
      masterPersona: 'ubuyashiki'
    }, { skipSaveDisk: true });
    const sanemiToLord = env.core.converseWithNpc('Chào Sanemi').reply;
    assert.match(sanemiToLord, /Chúa Công/i, `Sanemi gặp Chúa Công phải thưa kính cẩn, thực tế: ${sanemiToLord}`);
    const wrapLord = env.document.getElementById('agy-shinobu-npc-wrap');
    assert.match(wrapLord.querySelector('.agy-npc-soul-text').textContent, /Chúa Công/);

    // Obanai khi gặp Mitsuri (masterPersona = mitsuri) phải dịu dàng chu đáo khác hẳn bình thường
    env.core.applyTheme({
      themeName: '🐍 Xà Trụ — Obanai Iguro',
      bubbleName: '🐍 Xà Trụ — Obanai Iguro',
      masterPersona: 'mitsuri'
    }, { skipSaveDisk: true });
    const obanaiToMitsuri = env.core.converseWithNpc('Chào anh Iguro!').reply;
    assert.match(obanaiToMitsuri, /Kanroji.*trà mật ong|bánh ngọt/i);
    const obanaiTiredMitsuri = env.core.converseWithNpc('Em hơi mệt quá...').reply;
    assert.match(obanaiTiredMitsuri, /Kanroji/i);

    // Zenitsu khi gặp Nezuko (masterPersona = nezuko)
    env.core.applyTheme({
      themeName: '⚡ Zenitsu Agatsuma — Lôi Minh',
      bubbleName: '⚡ Zenitsu Agatsuma — Lôi Minh',
      masterPersona: 'nezuko'
    }, { skipSaveDisk: true });
    const zenToNezuko = env.core.converseWithNpc('Gặp bug khó rồi!').reply;
    assert.match(zenToNezuko, /Nezuko-chan.*Hỏa Lôi Thần/i);
  });

  it('[F25-T1-04] Tương tác chéo nhắc tên nhân vật khác, đọc số liệu Live HUD, chống lặp câu & bấm Chip gợi ý trên Popover', () => {
    const env = createTestEnv({ loadCore: true });
    env.setReducedMotion(true);

    // Dựng giả lập thanh Token HUD để kiểm tra intent `status` đọc số liệu thật
    const hudBar = env.document.createElement('div');
    hudBar.id = 'agy-token-context-bar';
    hudBar.innerHTML = '<span class="agy-tok-ctx-val">128.4K</span><svg><rect class="agy-nichirin-heat-rect" width="24.75"></rect></svg>';
    env.document.body.appendChild(hudBar);
    env.document.documentElement.setAttribute('data-agy-ai-working', '1');

    env.core.applyTheme({
      themeName: '🦋 Trùng Trụ — Shinobu Kocho',
      bubbleName: '🦋 Trùng Trụ — Shinobu Kocho',
      masterPersona: 'giyu'
    }, { skipSaveDisk: true });

    // 1. Hỏi chéo về Sabito khi đang ở Giyu và hỏi về Giyu khi đang ở Shinobu
    const shinobuAboutGiyu = env.core.converseWithNpc('Shinobu nghĩ sao về anh Tomioka Giyu?');
    assert.equal(shinobuAboutGiyu.intent, 'mention');
    assert.equal(shinobuAboutGiyu.mentionedId, 'giyu');
    assert.match(shinobuAboutGiyu.reply, /Tomioka/);

    // 2. Đọc trực tiếp số liệu 128.4K token và 75% độ rực thanh kiếm từ DOM thật
    const statusRes = env.core.converseWithNpc('Chẩn đoán tình hình ngữ cảnh hiện tại giúp mình');
    assert.equal(statusRes.intent, 'status');
    assert.match(statusRes.reply, /128\.4K token/);
    assert.match(statusRes.reply, /75%/);
    assert.match(statusRes.reply, /AI đang suy luận/);

    // 3. Chống lặp câu liên tiếp ở cùng 1 intent đa biến thể
    const b1 = env.core.converseWithNpc('Đoạn code này bị crash lỗi null rồi!').reply;
    const b2 = env.core.converseWithNpc('Lại dính lỗi exception nữa rồi!').reply;
    assert.notEqual(b1, b2, 'Hai lượt báo bug liên tiếp không được lặp lại y hệt cùng 1 câu trả lời');

    // 4. Mở khung chat riêng trên UI, kiểm tra dải `.agy-npc-topic-chips` hiện ra & bấm chip cập nhật đúng `.agy-npc-user-msg` + `.agy-npc-turn-badge`
    const wrap = env.document.getElementById('agy-shinobu-npc-wrap');
    const chatToggle = wrap.querySelector('[data-npc-act="chat-toggle"]');
    chatToggle.click();
    const chipsWrap = wrap.querySelector('.agy-npc-topic-chips');
    assert.equal(chipsWrap.style.display, 'flex', 'Khi mở khung chat riêng phải hiển thị dải chip gợi ý cá nhân hóa');
    const firstChip = wrap.querySelector('.agy-npc-topic-chip');
    assert.ok(firstChip, 'Phải có nút .agy-npc-topic-chip');
    firstChip.click();

    const sentMsgText = wrap.querySelector('.agy-npc-user-msg').textContent;
    assert.ok(sentMsgText.length > 5, 'Bấm chip gợi ý phải điền đúng câu hỏi vào .agy-npc-user-msg');
    assert.equal(wrap.querySelector('.agy-npc-turn-badge').getAttribute('data-show'), '1');
    assert.match(wrap.querySelector('.agy-npc-turn-badge').textContent, /^Lượt \d+$/);
  });
});
