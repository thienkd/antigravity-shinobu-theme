'use strict';

/**
 * Bộ kiểm thử tự động Zero-Dependency cho các phân hệ KNY:
 * - F12: kny_breathing_skills.js & kny_chibi_aura.js (7 Tier 1 + 8 Tier 2)
 * - F13: kny_token_hud.js & kny_squad_raid.js (7 Tier 1 + 8 Tier 2)
 * - F14: kny_cinema_director.js & hợp đồng teardown với core.js (6 Tier 1 + 7 Tier 2)
 * - F17: Bất biến kiến trúc R3 & Tiếng Việt 100% trên cụm KNY (5 Tier 1 + 5 Tier 2)
 *
 * Chạy độc lập: node --test tests/test_kny_skills_hud_cinema.js
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENGINE_DIR = path.join(ROOT_DIR, 'engine');
const THEMES_JSON_PATH = path.join(ROOT_DIR, 'themes', 'themes.json');

const KNY_FILES = [
  'kny_semantic_icons.js',
  'kny_bio_audio.js',
  'kny_fx_modes.js',
  'kny_breathing_skills.js',
  'kny_chibi_aura.js',
  'kny_squad_raid.js',
  'kny_token_hud.js',
  'kny_cinema_director.js'
];

const MODULE_CACHE = new Map();
function readEngineFile(fileName) {
  if (!MODULE_CACHE.has(fileName)) {
    const raw = fs.readFileSync(path.join(ENGINE_DIR, fileName), 'utf8').replace(/^\uFEFF/, '');
    MODULE_CACHE.set(fileName, raw);
  }
  return MODULE_CACHE.get(fileName);
}

let THEMES_JSON_RAW = null;
function getThemesJsonRaw() {
  if (THEMES_JSON_RAW === null) {
    THEMES_JSON_RAW = fs.readFileSync(THEMES_JSON_PATH, 'utf8').replace(/^\uFEFF/, '');
  }
  return THEMES_JSON_RAW;
}

const flushMicrotasks = async (rounds = 4) => {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
};

/* ============================================================================
 * 1. ĐỒNG HỒ GIẢ LẬP (VirtualClock) & DOM/OBSERVER/CANVAS/AUDIO/FETCH SHIM
 * ============================================================================ */

function createVirtualClock(initialNowMs = 1_700_000_000_000) {
  let nowMs = initialNowMs;
  let perfMs = 1000;
  let nextTimerId = 1;
  let nextRafId = 1;

  const timeouts = new Map();
  const intervals = new Map();
  const rafs = new Map();

  function setTimeoutFn(fn, delay = 0, ...args) {
    if (typeof fn !== 'function') return 0;
    const id = nextTimerId++;
    const ms = Math.max(0, Number(delay) || 0);
    timeouts.set(id, { id, fn, args, at: nowMs + ms });
    return id;
  }

  function clearTimeoutFn(id) {
    if (id) timeouts.delete(Number(id));
  }

  function setIntervalFn(fn, interval = 0, ...args) {
    if (typeof fn !== 'function') return 0;
    const id = nextTimerId++;
    const ms = Math.max(1, Number(interval) || 1);
    intervals.set(id, { id, fn, args, interval: ms, nextAt: nowMs + ms });
    return id;
  }

  function clearIntervalFn(id) {
    if (id) intervals.delete(Number(id));
  }

  function requestAnimationFrameFn(fn) {
    if (typeof fn !== 'function') return 0;
    const id = nextRafId++;
    rafs.set(id, fn);
    return id;
  }

  function cancelAnimationFrameFn(id) {
    if (id) rafs.delete(Number(id));
  }

  function advanceBy(ms) {
    const targetNow = nowMs + Math.max(0, Number(ms) || 0);
    let safety = 0;
    while (safety < 50_000) {
      safety++;
      let earliest = null;
      for (const t of timeouts.values()) {
        if (t.at <= targetNow && (!earliest || t.at < earliest.at)) {
          earliest = { type: 'timeout', at: t.at, item: t };
        }
      }
      for (const iv of intervals.values()) {
        if (iv.nextAt <= targetNow && (!earliest || iv.nextAt < earliest.at)) {
          earliest = { type: 'interval', at: iv.nextAt, item: iv };
        }
      }
      if (!earliest) break;
      const delta = Math.max(0, earliest.at - nowMs);
      nowMs = earliest.at;
      perfMs += delta;
      if (earliest.type === 'timeout') {
        timeouts.delete(earliest.item.id);
        earliest.item.fn(...earliest.item.args);
      } else {
        const iv = earliest.item;
        if (intervals.has(iv.id)) {
          iv.nextAt = nowMs + iv.interval;
          iv.fn(...iv.args);
        }
      }
    }
    const rem = Math.max(0, targetNow - nowMs);
    nowMs = targetNow;
    perfMs += rem;
  }

  function stepRaf(frames = 1, frameMs = 16) {
    for (let i = 0; i < frames; i++) {
      nowMs += frameMs;
      perfMs += frameMs;
      const batch = Array.from(rafs.entries());
      rafs.clear();
      for (const [, fn] of batch) {
        fn(perfMs);
      }
    }
  }

  function setNowMs(nextMs) {
    const diff = nextMs - nowMs;
    nowMs = nextMs;
    if (diff > 0) perfMs += diff;
  }

  return {
    get nowMs() { return nowMs; },
    get perfMs() { return perfMs; },
    setNowMs,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    setInterval: setIntervalFn,
    clearInterval: clearIntervalFn,
    requestAnimationFrame: requestAnimationFrameFn,
    cancelAnimationFrame: cancelAnimationFrameFn,
    advanceBy,
    stepRaf,
    getStats() {
      return {
        activeTimeouts: timeouts.size,
        activeIntervals: intervals.size,
        activeRafs: rafs.size
      };
    }
  };
}

function toKebabCase(prop) {
  return String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function toCamelCase(attr) {
  return String(attr).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function splitSelectorTopLevel(sel, sep) {
  const parts = [];
  let depthBracket = 0;
  let depthParen = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (quote) {
      if (ch === quote && sel[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === '(') depthParen++;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    else if (depthBracket === 0 && depthParen === 0 && ch === sep) {
      parts.push(sel.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(sel.slice(start));
  return parts;
}

function tokenizeComplexSelector(sel) {
  const tokens = [];
  let i = 0;
  const s = sel.trim();
  let cur = '';
  let depthBracket = 0;
  let depthParen = 0;
  let quote = '';
  while (i < s.length) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === quote && s[i - 1] !== '\\') quote = '';
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      i++;
      continue;
    }
    if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === '(') depthParen++;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);

    if (depthBracket === 0 && depthParen === 0 && (ch === '>' || ch === ' ' || ch === '\t')) {
      if (cur) {
        tokens.push({ type: 'compound', value: cur });
        cur = '';
      }
      if (ch === '>') {
        if (tokens.length && tokens[tokens.length - 1].type === 'comb' && tokens[tokens.length - 1].value === ' ') {
          tokens.pop();
        }
        tokens.push({ type: 'comb', value: '>' });
      } else {
        const prev = tokens[tokens.length - 1];
        if (prev && prev.type !== 'comb') {
          tokens.push({ type: 'comb', value: ' ' });
        }
      }
      i++;
      while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur) tokens.push({ type: 'compound', value: cur });
  return tokens;
}

function matchCompound(el, compound, scopeRoot) {
  if (!el || el.nodeType !== 1) return false;
  if (compound === '*') return true;
  if (compound === ':scope') return el === scopeRoot;
  let i = 0;
  const len = compound.length;
  while (i < len) {
    const ch = compound[i];
    if (ch === '#') {
      i++;
      let name = '';
      while (i < len && !/[.#[:\s]/.test(compound[i])) name += compound[i++];
      if (el.id !== name) return false;
    } else if (ch === '.') {
      i++;
      let cls = '';
      while (i < len && !/[.#[:\s]/.test(compound[i])) cls += compound[i++];
      if (!el.classList.contains(cls)) return false;
    } else if (ch === '[') {
      const end = compound.indexOf(']', i);
      if (end < 0) return false;
      const expr = compound.slice(i + 1, end).trim();
      i = end + 1;
      const m = expr.match(/^([a-zA-Z0-9_:-]+)(?:\s*([*^$~|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?$/);
      if (!m) return false;
      const attrName = m[1];
      const op = m[2];
      const val = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5]);
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
    } else if (ch === ':') {
      if (compound.startsWith(':scope', i)) {
        if (el !== scopeRoot) return false;
        i += 6;
      } else if (compound.startsWith(':empty', i)) {
        if (el.children.length > 0 || (el.textContent || '').length > 0) return false;
        i += 6;
      } else if (compound.startsWith(':not(', i)) {
        let depth = 1;
        let j = i + 5;
        while (j < len && depth > 0) {
          if (compound[j] === '(') depth++;
          else if (compound[j] === ')') depth--;
          j++;
        }
        const inner = compound.slice(i + 5, j - 1);
        if (matchesSelector(el, inner, scopeRoot)) return false;
        i = j;
      } else if (compound.startsWith(':has(', i)) {
        let depth = 1;
        let j = i + 5;
        while (j < len && depth > 0) {
          if (compound[j] === '(') depth++;
          else if (compound[j] === ')') depth--;
          j++;
        }
        const inner = compound.slice(i + 5, j - 1).trim();
        const normalized = inner.startsWith('>') ? `:scope ${inner}` : inner;
        if (!el.querySelector(normalized)) return false;
        i = j;
      } else {
        let p = '';
        i++;
        while (i < len && !/[.#[:\s]/.test(compound[i])) p += compound[i++];
        if (p === 'checked' && !el.checked) return false;
      }
    } else {
      let tag = '';
      while (i < len && !/[.#[:\s]/.test(compound[i])) tag += compound[i++];
      if (tag && tag !== '*' && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    }
  }
  return true;
}

function matchSingleSelector(el, sel, scopeRoot) {
  const tokens = tokenizeComplexSelector(sel);
  if (tokens.length === 0) return false;
  const last = tokens[tokens.length - 1];
  if (last.type !== 'compound' || !matchCompound(el, last.value, scopeRoot)) return false;

  function matchLeft(curEl, idx) {
    if (idx < 0) return true;
    const comb = tokens[idx];
    const targetTok = tokens[idx - 1];
    if (!comb || !targetTok) return false;
    if (comb.value === '>') {
      const p = curEl.parentElement;
      if (!p || !matchCompound(p, targetTok.value, scopeRoot)) return false;
      return matchLeft(p, idx - 2);
    }
    let p = curEl.parentElement;
    while (p) {
      if (matchCompound(p, targetTok.value, scopeRoot)) {
        if (matchLeft(p, idx - 2)) return true;
      }
      p = p.parentElement;
    }
    return false;
  }

  return matchLeft(el, tokens.length - 2);
}

function matchesSelector(el, selectorList, scopeRoot = null) {
  if (!el || el.nodeType !== 1 || typeof selectorList !== 'string') return false;
  const parts = splitSelectorTopLevel(selectorList, ',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed && matchSingleSelector(el, trimmed, scopeRoot)) return true;
  }
  return false;
}

function parseMiniHtml(ownerDocument, html) {
  const nodes = [];
  const str = String(html || '');
  let pos = 0;
  const stack = [{ children: nodes }];
  const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'line']);

  while (pos < str.length) {
    const pushText = (txt) => {
      if (!txt) return;
      const top = stack[stack.length - 1];
      const tn = ownerDocument.createTextNode(txt);
      if (top.appendChild) top.appendChild(tn);
      else top.children.push(tn);
    };
    const lt = str.indexOf('<', pos);
    if (lt < 0) {
      pushText(str.slice(pos));
      break;
    }
    if (lt > pos) {
      pushText(str.slice(pos, lt));
    }
    if (str.startsWith('<!--', lt)) {
      const endC = str.indexOf('-->', lt + 4);
      pos = endC < 0 ? str.length : endC + 3;
      continue;
    }
    const gt = str.indexOf('>', lt + 1);
    if (gt < 0) break;
    const rawTag = str.slice(lt + 1, gt).trim();
    pos = gt + 1;
    if (!rawTag) continue;
    if (rawTag.startsWith('/')) {
      const closeName = rawTag.slice(1).trim().toLowerCase();
      while (stack.length > 1) {
        const top = stack.pop();
        if (top.tagName && top.tagName.toLowerCase() === closeName) break;
      }
      continue;
    }
    const selfClosing = rawTag.endsWith('/');
    const cleanTag = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const spIdx = cleanTag.search(/\s/);
    const tagName = (spIdx < 0 ? cleanTag : cleanTag.slice(0, spIdx)).trim();
    const attrStr = spIdx < 0 ? '' : cleanTag.slice(spIdx + 1);
    const el = ownerDocument.createElement(tagName);
    const attrRe = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let m;
    while ((m = attrRe.exec(attrStr)) !== null) {
      const k = m[1];
      const v = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
      el.setAttribute(k, v);
    }
    const parent = stack[stack.length - 1];
    if (parent.appendChild) {
      parent.appendChild(el);
    } else {
      parent.children.push(el);
    }
    if (!selfClosing && !voidTags.has(tagName.toLowerCase())) {
      stack.push(el);
    }
  }
  return nodes;
}

function createKnyVmEnv(options = {}) {
  const clock = createVirtualClock(options.initialNowMs || 1_700_000_000_000);
  const mutationObservers = new Set();
  const resizeObservers = new Set();
  const intersectionObservers = new Set();
  const canvasDrawLogs = [];
  const canvasNanViolations = [];
  const fetchCalls = [];
  const sseQueue = [];
  const sseWaiters = [];
  const audioStats = {
    created: 0,
    resumed: 0,
    suspended: 0,
    closed: 0,
    maxGainScheduled: 0,
    instances: []
  };

  let reducedMotion = Boolean(options.reducedMotion);
  const matchMediaListeners = new Set();

  let sseConfig = {
    shouldFail: Boolean(options.sseShouldFail),
    status: options.sseStatus || 200
  };
  let telemetryConfig = {
    shouldFail: Boolean(options.telemetryShouldFail),
    snapshot: options.initialTelemetrySnapshot || { ok: true, contextTokens: 0, turnOutTokens: 0 }
  };

  function notifyMutations(target, type, payload) {
    for (const obs of mutationObservers) {
      obs._handleMutation(target, type, payload);
    }
  }

  class MiniEvent {
    constructor(type, init = {}) {
      this.type = String(type);
      this.bubbles = Boolean(init.bubbles);
      this.cancelable = Boolean(init.cancelable);
      this.defaultPrevented = false;
      this.cancelBubble = false;
      this.immediateStopped = false;
      this.target = null;
      this.currentTarget = null;
      this.eventPhase = 0;
      for (const k of Object.keys(init)) {
        if (!(k in this)) this[k] = init[k];
      }
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    }
    stopPropagation() {
      this.cancelBubble = true;
    }
    stopImmediatePropagation() {
      this.cancelBubble = true;
      this.immediateStopped = true;
    }
  }

  class MiniEventTarget {
    constructor() {
      this._listeners = new Map();
    }
    addEventListener(type, fn, opts) {
      if (typeof fn !== 'function') return;
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const once = Boolean(opts && typeof opts === 'object' && opts.once);
      const signal = opts && typeof opts === 'object' ? opts.signal : null;
      if (signal && signal.aborted) return;
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      const list = this._listeners.get(type);
      if (list.some((item) => item.fn === fn && item.capture === capture)) return;
      const entry = { fn, capture, once };
      list.push(entry);
      if (signal && typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', () => this.removeEventListener(type, fn, capture), { once: true });
      }
    }
    removeEventListener(type, fn, opts) {
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const list = this._listeners.get(type);
      if (!list) return;
      const idx = list.findIndex((item) => item.fn === fn && item.capture === capture);
      if (idx >= 0) list.splice(idx, 1);
    }
    _invokePhase(type, event, wantCapture) {
      const list = this._listeners.get(type);
      if (!list || list.length === 0) return;
      const snapshot = list.slice();
      for (const entry of snapshot) {
        if (entry.capture !== wantCapture) continue;
        if (event.immediateStopped) break;
        if (entry.once) this.removeEventListener(type, entry.fn, entry.capture);
        entry.fn.call(this, event);
      }
    }
    dispatchEvent(event) {
      const ev = event instanceof MiniEvent ? event : new MiniEvent(event.type || event, event);
      ev.target = this;
      const chain = [];
      let cur = this;
      while (cur) {
        chain.push(cur);
        cur = cur.parentNode || (cur === document ? windowObj : null);
      }
      // Capture: từ root xuống target
      ev.eventPhase = 1;
      for (let i = chain.length - 1; i >= 0; i--) {
        if (ev.cancelBubble) break;
        ev.currentTarget = chain[i];
        chain[i]._invokePhase(ev.type, ev, true);
      }
      // Bubble: từ target lên root
      if (!ev.cancelBubble) {
        ev.eventPhase = 3;
        const limit = ev.bubbles ? chain.length : 1;
        for (let i = 0; i < limit; i++) {
          if (ev.cancelBubble) break;
          ev.currentTarget = chain[i];
          chain[i]._invokePhase(ev.type, ev, false);
        }
      }
      ev.currentTarget = null;
      return !ev.defaultPrevented;
    }
  }

  class MiniTextNode {
    constructor(ownerDocument, text) {
      this.nodeType = 3;
      this.ownerDocument = ownerDocument;
      this.parentNode = null;
      this._data = String(text == null ? '' : text);
    }
    get textContent() { return this._data; }
    set textContent(v) { this._data = String(v == null ? '' : v); }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    cloneNode() {
      return new MiniTextNode(this.ownerDocument, this._data);
    }
  }

  class MiniElement extends MiniEventTarget {
    constructor(ownerDocument, tagName) {
      super();
      this.nodeType = 1;
      this.ownerDocument = ownerDocument;
      this.tagName = String(tagName || 'DIV').toUpperCase();
      this.parentNode = null;
      this.childNodes = [];
      this._attrs = new Map();
      this._styles = new Map();
      this._value = '';
      this.checked = false;
      this.type = '';
      this._clientWidth = 800;
      this._clientHeight = 120;
      this._rect = { left: 100, top: 600, width: 800, height: 120, right: 900, bottom: 720 };

      const self = this;
      this.classList = {
        add(...tokens) {
          const set = new Set(self.className.split(/\s+/).filter(Boolean));
          for (const t of tokens) {
            if (t) set.add(String(t));
          }
          self.className = Array.from(set).join(' ');
        },
        remove(...tokens) {
          const set = new Set(self.className.split(/\s+/).filter(Boolean));
          for (const t of tokens) set.delete(String(t));
          self.className = Array.from(set).join(' ');
        },
        contains(token) {
          return self.className.split(/\s+/).filter(Boolean).includes(String(token));
        },
        toggle(token, force) {
          const has = this.contains(token);
          const next = force !== undefined ? Boolean(force) : !has;
          if (next) this.add(token);
          else this.remove(token);
          return next;
        }
      };

      this.dataset = new Proxy({}, {
        get(_, prop) {
          if (typeof prop !== 'string') return undefined;
          const attr = 'data-' + toKebabCase(prop);
          return self._attrs.has(attr) ? self._attrs.get(attr) : undefined;
        },
        set(_, prop, val) {
          if (typeof prop === 'string') {
            self.setAttribute('data-' + toKebabCase(prop), String(val));
          }
          return true;
        },
        deleteProperty(_, prop) {
          if (typeof prop === 'string') {
            self.removeAttribute('data-' + toKebabCase(prop));
          }
          return true;
        },
        has(_, prop) {
          if (typeof prop !== 'string') return false;
          return self._attrs.has('data-' + toKebabCase(prop));
        },
        ownKeys() {
          const keys = [];
          for (const k of self._attrs.keys()) {
            if (k.startsWith('data-')) keys.push(toCamelCase(k.slice(5)));
          }
          return keys;
        },
        getOwnPropertyDescriptor(_, prop) {
          const attr = 'data-' + toKebabCase(prop);
          if (!self._attrs.has(attr)) return undefined;
          return { enumerable: true, configurable: true, value: self._attrs.get(attr) };
        }
      });

      this.style = new Proxy({
        setProperty(k, v) {
          if (v === '' || v === null || v === undefined) self._styles.delete(String(k));
          else self._styles.set(String(k), String(v));
        },
        getPropertyValue(k) {
          return self._styles.get(String(k)) || '';
        },
        removeProperty(k) {
          const prev = self._styles.get(String(k)) || '';
          self._styles.delete(String(k));
          return prev;
        }
      }, {
        get(target, prop) {
          if (prop === 'cssText') {
            return Array.from(self._styles.entries()).map(([k, v]) => `${k}: ${v}`).join('; ');
          }
          if (prop in target) return target[prop];
          if (typeof prop === 'string') {
            return self._styles.get(toKebabCase(prop)) || '';
          }
          return undefined;
        },
        set(target, prop, val) {
          if (prop === 'cssText') {
            self._styles.clear();
            for (const decl of String(val || '').split(';')) {
              const colon = decl.indexOf(':');
              if (colon > 0) {
                const k = decl.slice(0, colon).trim().toLowerCase();
                const v = decl.slice(colon + 1).trim();
                if (k && v) self._styles.set(k, v);
              }
            }
            return true;
          }
          if (typeof prop === 'string') {
            const k = toKebabCase(prop);
            if (val === '' || val === null || val === undefined) self._styles.delete(k);
            else self._styles.set(k, String(val));
          }
          return true;
        }
      });
    }

    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }

    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    }

    get firstElementChild() {
      return this.children[0] || null;
    }

    get lastElementChild() {
      const ch = this.children;
      return ch.length ? ch[ch.length - 1] : null;
    }

    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === document.documentElement || cur === document.body || cur === document) return true;
        cur = cur.parentNode;
      }
      return false;
    }

    get id() { return this._attrs.get('id') || ''; }
    set id(v) { this.setAttribute('id', String(v == null ? '' : v)); }

    get className() { return this._attrs.get('class') || ''; }
    set className(v) { this.setAttribute('class', String(v == null ? '' : v)); }

    get title() { return this._attrs.get('title') || ''; }
    set title(v) { this.setAttribute('title', String(v == null ? '' : v)); }

    get value() { return this._value; }
    set value(v) { this._value = String(v == null ? '' : v); }

    get isContentEditable() {
      return this.getAttribute('contenteditable') === 'true';
    }

    get clientWidth() { return this._clientWidth; }
    get offsetWidth() { return this._clientWidth; }
    get scrollWidth() { return this._clientWidth; }
    get clientHeight() { return this._clientHeight; }
    get offsetHeight() { return this._clientHeight; }
    get scrollHeight() { return this._clientHeight; }

    get offsetParent() {
      if (!this.isConnected) return null;
      if (this.style.display === 'none') return null;
      return this.parentElement || document.body;
    }

    getBoundingClientRect() {
      return { ...this._rect };
    }

    setAttribute(name, val) {
      const key = String(name).toLowerCase();
      this._attrs.set(key, String(val == null ? '' : val));
      if (key === 'type') this.type = String(val);
      notifyMutations(this, 'attributes', { attributeName: key });
    }

    getAttribute(name) {
      const key = String(name).toLowerCase();
      return this._attrs.has(key) ? this._attrs.get(key) : null;
    }

    hasAttribute(name) {
      return this._attrs.has(String(name).toLowerCase());
    }

    removeAttribute(name) {
      const key = String(name).toLowerCase();
      this._attrs.delete(key);
      notifyMutations(this, 'attributes', { attributeName: key });
    }

    get textContent() {
      return this.childNodes.map((n) => n.textContent).join('');
    }

    set textContent(v) {
      const removed = this.childNodes.slice();
      for (const n of removed) n.parentNode = null;
      this.childNodes = [];
      const txt = String(v == null ? '' : v);
      if (txt) {
        const tn = new MiniTextNode(this.ownerDocument, txt);
        tn.parentNode = this;
        this.childNodes.push(tn);
      }
      notifyMutations(this, 'childList', { addedNodes: this.childNodes.slice(), removedNodes: removed });
    }

    get innerHTML() {
      return this.childNodes.map((n) => {
        if (n.nodeType === 3) return n.textContent;
        const attrs = Array.from(n._attrs.entries()).map(([k, v]) => ` ${k}="${v}"`).join('');
        return `<${n.tagName.toLowerCase()}${attrs}>${n.innerHTML}</${n.tagName.toLowerCase()}>`;
      }).join('');
    }

    set innerHTML(html) {
      const removed = this.childNodes.slice();
      for (const n of removed) n.parentNode = null;
      this.childNodes = [];
      const parsed = parseMiniHtml(this.ownerDocument, html);
      for (const n of parsed) {
        n.parentNode = this;
        this.childNodes.push(n);
      }
      notifyMutations(this, 'childList', { addedNodes: parsed, removedNodes: removed });
    }

    appendChild(node) {
      if (!node) return node;
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.childNodes.push(node);
      notifyMutations(this, 'childList', { addedNodes: [node], removedNodes: [] });
      return node;
    }

    insertBefore(node, refNode) {
      if (!refNode) return this.appendChild(node);
      if (node.parentNode) node.parentNode.removeChild(node);
      const idx = this.childNodes.indexOf(refNode);
      node.parentNode = this;
      if (idx < 0) this.childNodes.push(node);
      else this.childNodes.splice(idx, 0, node);
      notifyMutations(this, 'childList', { addedNodes: [node], removedNodes: [] });
      return node;
    }

    removeChild(node) {
      const idx = this.childNodes.indexOf(node);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        node.parentNode = null;
        notifyMutations(this, 'childList', { addedNodes: [], removedNodes: [node] });
      }
      return node;
    }

    replaceChild(newNode, oldNode) {
      const idx = this.childNodes.indexOf(oldNode);
      if (idx < 0) return oldNode;
      if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
      oldNode.parentNode = null;
      newNode.parentNode = this;
      this.childNodes[idx] = newNode;
      notifyMutations(this, 'childList', { addedNodes: [newNode], removedNodes: [oldNode] });
      return oldNode;
    }

    replaceWith(newNode) {
      if (!this.parentNode) return;
      this.parentNode.replaceChild(newNode, this);
    }

    append(...nodes) {
      for (const n of nodes) {
        if (typeof n === 'string') this.appendChild(this.ownerDocument.createTextNode(n));
        else this.appendChild(n);
      }
    }

    prepend(...nodes) {
      const first = this.childNodes[0] || null;
      for (const n of nodes) {
        const node = typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n;
        this.insertBefore(node, first);
      }
    }

    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }

    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
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
      const walk = (node) => {
        for (const ch of node.children) {
          if (matchesSelector(ch, sel, this)) return ch;
          const found = walk(ch);
          if (found) return found;
        }
        return null;
      };
      return walk(this);
    }

    focus() {}
    blur() {}
    click() {
      this.dispatchEvent(new MiniEvent('click', { bubbles: true, cancelable: true }));
    }

    cloneNode(deep = false) {
      const copy = this.ownerDocument.createElement(this.tagName.toLowerCase());
      for (const [k, v] of this._attrs.entries()) copy._attrs.set(k, v);
      for (const [k, v] of this._styles.entries()) copy._styles.set(k, v);
      if (deep) {
        for (const ch of this.childNodes) copy.appendChild(ch.cloneNode(true));
      }
      return copy;
    }

    getContext(kind) {
      if (this.tagName !== 'CANVAS' || kind !== '2d') return null;
      if (this._ctx2d) return this._ctx2d;
      const checkNums = (op, vals) => {
        for (const v of vals) {
          if (typeof v === 'number' && Number.isNaN(v)) {
            canvasNanViolations.push({ op, vals });
          }
        }
      };
      const mkGrad = () => ({ addColorStop() {} });
      this._ctx2d = {
        canvas: this,
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        shadowBlur: 0,
        shadowColor: 'transparent',
        font: '12px sans-serif',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        save() {},
        restore() {},
        setTransform(a, b, c, d, e, f) {
          checkNums('setTransform', [a, b, c, d, e, f]);
          canvasDrawLogs.push('setTransform');
        },
        resetTransform() {},
        translate(x, y) { checkNums('translate', [x, y]); },
        rotate(a) { checkNums('rotate', [a]); },
        scale(x, y) { checkNums('scale', [x, y]); },
        clearRect(x, y, w, h) {
          checkNums('clearRect', [x, y, w, h]);
          canvasDrawLogs.push('clearRect');
        },
        fillRect(x, y, w, h) { checkNums('fillRect', [x, y, w, h]); },
        strokeRect(x, y, w, h) { checkNums('strokeRect', [x, y, w, h]); },
        beginPath() {},
        closePath() {},
        moveTo(x, y) { checkNums('moveTo', [x, y]); },
        lineTo(x, y) { checkNums('lineTo', [x, y]); },
        bezierCurveTo(a, b, c, d, e, f) { checkNums('bezierCurveTo', [a, b, c, d, e, f]); },
        quadraticCurveTo(a, b, c, d) { checkNums('quadraticCurveTo', [a, b, c, d]); },
        arc(x, y, r, s, e) {
          checkNums('arc', [x, y, r, s, e]);
          canvasDrawLogs.push('arc');
        },
        arcTo(a, b, c, d, r) { checkNums('arcTo', [a, b, c, d, r]); },
        ellipse(x, y, rx, ry, rot, s, e) { checkNums('ellipse', [x, y, rx, ry, rot, s, e]); },
        rect(x, y, w, h) { checkNums('rect', [x, y, w, h]); },
        roundRect(x, y, w, h, r) { checkNums('roundRect', [x, y, w, h, r]); },
        fill() { canvasDrawLogs.push('fill'); },
        stroke() { canvasDrawLogs.push('stroke'); },
        clip() {},
        fillText() {},
        strokeText() {},
        measureText(t) { return { width: String(t || '').length * 7 }; },
        setLineDash() {},
        drawImage(img, ...args) {
          checkNums('drawImage', args);
          canvasDrawLogs.push('drawImage');
        },
        createLinearGradient(a, b, c, d) { checkNums('createLinearGradient', [a, b, c, d]); return mkGrad(); },
        createRadialGradient(a, b, c, d, e, f) { checkNums('createRadialGradient', [a, b, c, d, e, f]); return mkGrad(); },
        createPattern() { return {}; },
        getImageData(x, y, w, h) {
          const len = Math.max(1, Math.floor(w) * Math.floor(h) * 4);
          return { width: w, height: h, data: new Uint8ClampedArray(len) };
        },
        putImageData() {}
      };
      return this._ctx2d;
    }
  }

  const document = new MiniEventTarget();
  document.nodeType = 9;
  document.hidden = Boolean(options.documentHidden);
  document._focused = options.documentFocused !== undefined ? Boolean(options.documentFocused) : true;
  document.hasFocus = () => document._focused;
  document.createElement = (tag) => new MiniElement(document, tag);
  document.createElementNS = (_, tag) => new MiniElement(document, tag);
  document.createTextNode = (txt) => new MiniTextNode(document, txt);

  document.documentElement = document.createElement('html');
  document.documentElement.parentNode = document;
  document.head = document.createElement('head');
  document.body = document.createElement('body');
  document.documentElement.appendChild(document.head);
  document.documentElement.appendChild(document.body);

  document.querySelector = (sel) => document.documentElement.querySelector(sel);
  document.querySelectorAll = (sel) => document.documentElement.querySelectorAll(sel);
  document.getElementById = (id) => document.documentElement.querySelector(`#${id}`);

  class MockMutationObserver {
    constructor(cb) {
      this._cb = cb;
      this._targets = [];
      this._records = [];
      mutationObservers.add(this);
    }
    observe(target, opts = {}) {
      this._targets.push({ target, opts });
    }
    disconnect() {
      this._targets = [];
      this._records = [];
    }
    takeRecords() {
      const r = this._records.slice();
      this._records = [];
      return r;
    }
    _handleMutation(target, type, payload) {
      for (const entry of this._targets) {
        if (entry.target === target || (entry.opts.subtree && entry.target.contains(target))) {
          if (type === 'childList' && entry.opts.childList) {
            this._records.push({ type: 'childList', target, ...payload });
          } else if (type === 'attributes' && entry.opts.attributes) {
            this._records.push({ type: 'attributes', target, ...payload });
          }
        }
      }
    }
    _flush() {
      if (this._records.length === 0) return;
      const batch = this.takeRecords();
      this._cb(batch, this);
    }
  }

  class MockResizeObserver {
    constructor(cb) {
      this._cb = cb;
      this._targets = new Set();
      resizeObservers.add(this);
    }
    observe(target) {
      this._targets.add(target);
    }
    unobserve(target) {
      this._targets.delete(target);
    }
    disconnect() {
      this._targets.clear();
    }
  }

  class MockIntersectionObserver {
    constructor(cb) { this._cb = cb; intersectionObservers.add(this); }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class MockImage {
    constructor() {
      this._src = '';
      this.complete = true;
      this.naturalWidth = 256;
      this.naturalHeight = 256;
      this.width = 256;
      this.height = 256;
      this.onload = null;
      this.onerror = null;
    }
    get src() { return this._src; }
    set src(v) {
      this._src = String(v || '');
      if (typeof this.onload === 'function') {
        clock.setTimeout(() => {
          if (typeof this.onload === 'function') this.onload();
        }, 0);
      }
    }
  }

  class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.destination = { _isDest: true };
      audioStats.created++;
      audioStats.instances.push(this);
    }
    resume() {
      audioStats.resumed++;
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      audioStats.suspended++;
      this.state = 'suspended';
      return Promise.resolve();
    }
    close() {
      audioStats.closed++;
      this.state = 'closed';
      return Promise.resolve();
    }
    createBuffer(channels, len, sr) {
      const data = new Float32Array(len);
      return { sampleRate: sr, getChannelData: () => data };
    }
    createBufferSource() {
      return { buffer: null, loop: false, connect() {}, start() {}, stop() {} };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {}
      };
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        Q: { setValueAtTime() {} },
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}
      };
    }
    createGain() {
      const g = {
        gain: {
          value: 1,
          setValueAtTime(v) {
            if (v > audioStats.maxGainScheduled && v <= 0.5) {
              // Ghi nhận riêng trường hợp dest là audioCtx.destination khi connect()
            }
            g._lastSetGain = v;
          },
          linearRampToValueAtTime(v) { g._lastRampGain = v; },
          exponentialRampToValueAtTime() {},
          setTargetAtTime() {},
          cancelScheduledValues() {}
        },
        connect(dest) {
          if (dest && dest._isDest && typeof g._lastSetGain === 'number') {
            audioStats.maxGainScheduled = Math.max(audioStats.maxGainScheduled, g._lastSetGain);
          }
        }
      };
      return g;
    }
  }

  class MockAbortController {
    constructor() {
      this.signal = new MiniEventTarget();
      this.signal.aborted = false;
    }
    abort() {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      this.signal.dispatchEvent(new MiniEvent('abort'));
    }
  }

  const encoder = new TextEncoder();
  function fetchShim(url, opts = {}) {
    const urlStr = String(url);
    fetchCalls.push({ url: urlStr, headers: opts.headers || {} });

    if (urlStr.includes('/__events')) {
      if (sseConfig.shouldFail) {
        return Promise.resolve({ ok: false, status: sseConfig.status || 500, body: null });
      }
      const sig = opts.signal;
      return Promise.resolve({
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              read() {
                if (sig && sig.aborted) {
                  return Promise.resolve({ done: true, value: undefined });
                }
                if (sseQueue.length > 0) {
                  const chunk = sseQueue.shift();
                  return Promise.resolve({ done: false, value: encoder.encode(chunk) });
                }
                return new Promise((resolve) => {
                  const waiter = { resolve };
                  sseWaiters.push(waiter);
                  if (sig) {
                    sig.addEventListener('abort', () => {
                      const idx = sseWaiters.indexOf(waiter);
                      if (idx >= 0) sseWaiters.splice(idx, 1);
                      resolve({ done: true, value: undefined });
                    }, { once: true });
                  }
                });
              },
              cancel() {
                return Promise.resolve();
              }
            };
          }
        }
      });
    }

    if (urlStr.includes('/__telemetry')) {
      if (telemetryConfig.shouldFail) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ ok: false }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => telemetryConfig.snapshot
      });
    }

    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }

  const localStore = new Map();
  const sessionStore = new Map();
  const mkStorage = (map) => ({
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    clear: () => { map.clear(); }
  });

  const OriginalDate = Date;
  function FakeDate(...args) {
    if (!(this instanceof FakeDate)) {
      return new OriginalDate(clock.nowMs).toString();
    }
    if (args.length === 0) return new OriginalDate(clock.nowMs);
    return new OriginalDate(...args);
  }
  FakeDate.now = () => clock.nowMs;
  FakeDate.parse = OriginalDate.parse;
  FakeDate.UTC = OriginalDate.UTC;
  FakeDate.prototype = OriginalDate.prototype;

  const navigatorShim = {
    platform: options.platform || 'Win32',
    userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    userActivation: {
      hasBeenActive: Boolean(options.userGestureActive),
      isActive: Boolean(options.userGestureActive)
    }
  };

  const windowObj = new MiniEventTarget();
  Object.assign(windowObj, {
    document,
    navigator: navigatorShim,
    location: { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1' },
    innerWidth: options.innerWidth || 1280,
    innerHeight: options.innerHeight || 800,
    devicePixelRatio: 1,
    localStorage: mkStorage(localStore),
    sessionStorage: mkStorage(sessionStore),
    performance: { now: () => clock.perfMs },
    Date: FakeDate,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    requestAnimationFrame: clock.requestAnimationFrame,
    cancelAnimationFrame: clock.cancelAnimationFrame,
    MutationObserver: MockMutationObserver,
    ResizeObserver: MockResizeObserver,
    IntersectionObserver: MockIntersectionObserver,
    Image: MockImage,
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    AbortController: MockAbortController,
    fetch: fetchShim,
    TextDecoder,
    TextEncoder,
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    CSS: { supports: () => true },
    getComputedStyle: (el) => (el && el.style ? el.style : {}),
    matchMedia: (q) => ({
      matches: q.includes('prefers-reduced-motion') ? reducedMotion : false,
      media: q,
      addEventListener(type, fn) {
        if (type === 'change' && typeof fn === 'function') matchMediaListeners.add(fn);
      },
      removeEventListener(type, fn) {
        if (type === 'change') matchMediaListeners.delete(fn);
      },
      addListener(fn) { if (typeof fn === 'function') matchMediaListeners.add(fn); },
      removeListener(fn) { matchMediaListeners.delete(fn); }
    })
  });

  const sandbox = windowObj;
  Object.assign(sandbox, {
    console,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Uint8Array,
    Uint8ClampedArray,
    Float32Array,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    __AGY_BOOT__: {
      authToken: options.authToken || 'test-token-256bit',
      assetBase: options.assetBase || 'http://127.0.0.1:49999/',
      syncFromDaemon: options.syncFromDaemon !== false
    }
  });
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);

  function loadModule(fileName, transform) {
    let code = readEngineFile(fileName);
    if (typeof transform === 'function') code = transform(code);
    vm.runInContext(code, context, { filename: fileName });
  }

  function loadModules(list) {
    for (const item of list) {
      if (item === 'core.js') {
        loadModule('core.js', (src) =>
          src.replace('/*__THEMES_PLACEHOLDER__*/{}', getThemesJsonRaw())
        );
      } else {
        loadModule(item);
      }
    }
  }

  function loadBundleRound(list) {
    const parts = list.map((item) => {
      let src = readEngineFile(item);
      if (item === 'core.js') {
        src = src.replace('/*__THEMES_PLACEHOLDER__*/{}', getThemesJsonRaw());
      }
      return `// === ${item} ===\n${src}`;
    });
    const wrapped = `(() => {\n${parts.join('\n')}\n})();`;
    vm.runInContext(wrapped, context, { filename: 'bundle_round.js' });
  }

  function buildStandardIdeDom() {
    const shell = document.createElement('div');
    shell.className = 'agy-shell';
    const mainBody = document.createElement('div');
    mainBody.setAttribute('data-main-content-body', 'true');

    const bubbleFrame = document.createElement('div');
    bubbleFrame.className = 'agy-user-bubble-frame';
    const msgText = document.createElement('div');
    msgText.textContent = 'Xin chào Kiếm Sĩ';
    bubbleFrame.appendChild(msgText);
    mainBody.appendChild(bubbleFrame);

    const composer = document.createElement('div');
    composer.className = 'surface-composer';
    composer._clientWidth = 800;
    composer._rect = { left: 100, top: 620, width: 800, height: 110, right: 900, bottom: 730 };

    const editor = document.createElement('textarea');
    composer.appendChild(editor);

    const sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.setAttribute('aria-label', 'Gửi tin nhắn');
    composer.appendChild(sendBtn);

    const hitbox = document.createElement('button');
    hitbox.className = 'agy-chibi-hitbox';
    hitbox._rect = { left: 820, top: 580, width: 56, height: 56, right: 876, bottom: 636 };
    hitbox.innerHTML = '<i aria-hidden="true"></i>';
    composer.appendChild(hitbox);

    const npcWrap = document.createElement('div');
    npcWrap.id = 'agy-shinobu-npc-wrap';
    const pills = document.createElement('div');
    pills.className = 'agy-npc-pills';
    const chatOpen = document.createElement('button');
    chatOpen.dataset.npcAct = 'chat-open';
    pills.appendChild(chatOpen);
    const popover = document.createElement('div');
    popover.className = 'agy-npc-popover';
    const chatRow = document.createElement('div');
    chatRow.className = 'agy-npc-chat-row';
    popover.appendChild(chatRow);
    npcWrap.appendChild(pills);
    npcWrap.appendChild(popover);

    shell.appendChild(mainBody);
    shell.appendChild(composer);
    document.body.appendChild(shell);
    document.body.appendChild(npcWrap);

    return { shell, mainBody, bubbleFrame, composer, editor, sendBtn, hitbox, npcWrap };
  }

  return {
    sandbox,
    document,
    clock,
    localStorage: sandbox.localStorage,
    sessionStorage: sandbox.sessionStorage,
    MiniEvent,
    loadModule,
    loadModules,
    loadBundleRound,
    buildStandardIdeDom,
    canvasDrawLogs,
    canvasNanViolations,
    fetchCalls,
    audioStats,
    pushSseSnapshot(obj) {
      const payload = `data: ${JSON.stringify(obj)}\n\n`;
      if (sseWaiters.length > 0) {
        const w = sseWaiters.shift();
        w.resolve({ done: false, value: encoder.encode(payload) });
      } else {
        sseQueue.push(payload);
      }
    },
    setSseConfig(cfg) { Object.assign(sseConfig, cfg); },
    setTelemetryConfig(cfg) { Object.assign(telemetryConfig, cfg); },
    triggerResize(el, width, height = 110) {
      el._clientWidth = width;
      el._clientHeight = height;
      el._rect = { ...el._rect, width, height, right: el._rect.left + width, bottom: el._rect.top + height };
      for (const ro of resizeObservers) {
        if (ro._targets.has(el)) {
          ro._cb([{ target: el, contentRect: { width, height } }]);
        }
      }
    },
    flushMutations() {
      for (const mo of mutationObservers) {
        mo._flush();
      }
    },
    setReducedMotion(val) {
      reducedMotion = Boolean(val);
      for (const fn of matchMediaListeners) {
        fn({ matches: reducedMotion, media: '(prefers-reduced-motion: reduce)' });
      }
    },
    setUserGestureActive(val) {
      navigatorShim.userActivation.hasBeenActive = Boolean(val);
      navigatorShim.userActivation.isActive = Boolean(val);
    }
  };
}

function attachBioAudioSpy(env) {
  const calls = {
    setSwordSfxEnabled: [],
    onTelemetry: [],
    playNichirinSheathe: [],
    closePopover: 0,
    openPopover: 0,
    toggle: 0
  };
  let enabled = true;
  env.sandbox.__AGY_BIO_AUDIO__ = {
    getPrefs: () => ({ swordSfx: true, enabled }),
    setSwordSfxEnabled: (v) => calls.setSwordSfxEnabled.push(v),
    onTelemetry: (t) => calls.onTelemetry.push(t),
    playNichirinSheathe: (o) => calls.playNichirinSheathe.push(o),
    closePopover: () => { calls.closePopover++; },
    openPopover: () => { calls.openPopover++; },
    toggle: () => { enabled = !enabled; calls.toggle++; return enabled; },
    isEnabled: () => enabled
  };
  return calls;
}

/* ============================================================================
 * SUITE 1 — F12: KỸ NĂNG HƠI THỞ & CHIBI AURA (7 Tier 1 + 7 Tier 2)
 * ============================================================================ */

describe('F12: Kỹ năng Hơi Thở & Chibi Aura (kny_breathing_skills.js & kny_chibi_aura.js)', () => {
  let env = null;
  afterEach(() => {
    if (env) {
      try { env.sandbox.__AGY_KNY_CHIBI_AURA__?.teardown(); } catch (_) {}
      try { env.sandbox.__AGY_KNY_SKILLS__?.destroy(); } catch (_) {}
      env = null;
    }
  });

  // --- Tier 1 ---
  it('F12-T1-01: Phủ đủ 15 nhân vật × 4 thức = 60 Thức Hơi Thở hợp lệ', () => {
    env = createKnyVmEnv();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js']);
    const api = env.sandbox.__AGY_KNY_SKILLS__;
    assert.equal(api.CHARACTER_IDS.length, 15, 'Phải có đúng 15 nhân vật trong CHARACTER_IDS');
    const all = api.getAllSkills();
    assert.equal(all.length, 60, 'Tổng số Thức Hơi Thở phải bằng 60 (15 × 4)');

    for (const cid of api.CHARACTER_IDS) {
      const list = api.getSkillsForCharacter(cid);
      assert.equal(list.length, 4, `Nhân vật ${cid} phải có đúng 4 thức`);
      for (const sk of list) {
        assert.ok(sk.id && sk.nameVi && sk.kanji && sk.breathingName && sk.voiceLine && sk.vfxType, `Thức ${sk.id} thiếu trường mô tả`);
        assert.ok(sk.primaryColor && sk.sfxElement && Number(sk.durationMs) > 0, `Thức ${sk.id} thiếu thông số VFX/SFX`);
      }
    }
  });

  it('F12-T1-02: Bấm trực tiếp Chibi trên .surface-composer xoay vòng 4 thức 0->1->2->3->0 và nhảy ra sân khấu', () => {
    env = createKnyVmEnv();
    const { composer, hitbox, npcWrap } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;

    const themeCfg = { primary: '#c084fc', secondary: '#22d3ee', fxMode: 'wisteria' };
    aura.mountChibiAura(composer, themeCfg, 'shinobu');
    aura.mountSkillTriggerUi(composer, npcWrap, themeCfg, 'shinobu');

    hitbox.addEventListener('click', () => {
      aura.castNextComboSkill({ originEl: hitbox, sourceFrameEl: composer, fromChibiClick: true });
    });

    const expectedNames = skillsApi.getSkillsForCharacter('shinobu').map((s) => s.nameVi);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      hitbox.click();
      const title = env.document.querySelector('agy-skill-vfx .agy-kny-title').textContent;
      const kanji = env.document.querySelector('agy-skill-vfx .agy-kny-kanji-bg').textContent;
      assert.ok(kanji.length > 0, 'Kanji nền phải được hiển thị trên <agy-skill-vfx>');
      assert.equal(env.document.querySelector('agy-skill-vfx').style.display, 'block', 'Sân khấu <agy-skill-vfx> phải mở khi bấm Chibi');
      assert.equal(composer.dataset.chibiOutOnStage, '1', 'Peeker phải ẩn (chibiOutOnStage="1") khi Chibi đang nhảy ra sân khấu');
      seen.push(title);
      env.clock.advanceBy(3200);
      env.clock.stepRaf(2);
      env.clock.advanceBy(500);
    }
    assert.deepEqual(seen, [expectedNames[0], expectedNames[1], expectedNames[2], expectedNames[3], expectedNames[0]], 'Chu kỳ xoay thức phải là 0 -> 1 -> 2 -> 3 -> 0');
  });

  it('F12-T1-03: Khung hành động 5 pha & hạ cánh hồi góc 420ms không phát sinh tọa độ NaN', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js']);
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;

    const res = skillsApi.castSkill('shinobu', 0, { composerEl: composer, durationMs: 2500 });
    assert.equal(res.ok, true);
    assert.equal(composer.dataset.chibiOutOnStage, '1');

    // Pha launch (p < 0.15)
    env.clock.stepRaf(5, 16);
    assert.equal(composer.dataset.chibiOutOnStage, '1');

    // Pha hit-stop / micro-shake (p ~ 0.38 -> ~950ms)
    env.clock.advanceBy(870);
    env.clock.stepRaf(2, 16);
    assert.ok(env.canvasDrawLogs.length > 0, 'Phải có lệnh vẽ Canvas 2D trong pha hành động');

    // Pha hồi góc (p >= 0.96 -> ~2420ms)
    env.clock.advanceBy(1490);
    env.clock.stepRaf(2, 16);
    assert.equal(composer.dataset.chibiOutOnStage, undefined, 'Phải xóa chibiOutOnStage khi bắt đầu hồi góc');
    assert.equal(composer.dataset.chibiLanding, '1', 'Phải bật chibiLanding="1" khi đáp xuống góc');

    // Hoàn tất 100% và qua cửa sổ hạ cánh 420ms
    env.clock.advanceBy(100);
    env.clock.stepRaf(2, 16);
    assert.equal(env.document.querySelector('agy-skill-vfx').style.display, 'none', 'Overlay phải ẩn sau khi hết chiêu');
    env.clock.advanceBy(450);
    assert.equal(composer.dataset.chibiLanding, undefined, 'chibiLanding phải tự xóa sau 420ms');
    assert.equal(env.canvasNanViolations.length, 0, `Không được có tọa độ NaN trên canvas: ${JSON.stringify(env.canvasNanViolations)}`);
  });

  it('F12-T1-04: Render đủ 16 chế độ hào quang nguyên tố trên <agy-chibi-aura> 162×84 không NaN', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;

    const modes = [
      'royal_wisteria', 'wisteria', 'water', 'flame', 'sound', 'mist',
      'love', 'serpent', 'wind', 'stone', 'sun_water', 'nezuko',
      'thunder', 'beast', 'sun', 'moon'
    ];
    for (const mode of modes) {
      aura.mountChibiAura(composer, { fxMode: mode, primary: '#a855f7', secondary: '#38bdf8' }, null);
      const host = env.document.querySelector('agy-chibi-aura');
      assert.ok(host, `Thiếu <agy-chibi-aura> cho chế độ ${mode}`);
      assert.equal(host.dataset.auraMode, mode, `dataset.auraMode phải là ${mode}`);
      const canvas = host.querySelector('canvas');
      assert.equal(canvas.width, 162, 'Chiều rộng canvas aura phải là 162');
      assert.equal(canvas.height, 84, 'Chiều cao canvas aura phải là 84');
      env.clock.stepRaf(3, 16);
    }
    assert.equal(env.canvasNanViolations.length, 0, `Phát hiện NaN khi vẽ 16 aura mode: ${JSON.stringify(env.canvasNanViolations)}`);
  });

  it('F12-T1-05: Surge hào quang 2x trong 1800ms & tích hợp Drawer "Các Thức" trong #agy-shinobu-npc-wrap', () => {
    env = createKnyVmEnv();
    const { composer, npcWrap } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;
    const cfg = { fxMode: 'flame', primary: '#ef4444', secondary: '#facc15' };

    aura.mountChibiAura(composer, cfg, 'rengoku');
    aura.mountSkillTriggerUi(composer, npcWrap, cfg, 'rengoku');

    const pill = npcWrap.querySelector('.agy-npc-skill-pill');
    assert.ok(pill, 'Phải gắn nút .agy-npc-skill-pill trong #agy-shinobu-npc-wrap');
    assert.ok(pill.textContent.includes('Các Thức'), 'Nhãn nút trong NPC wrap phải là "Các Thức"');
    const items = npcWrap.querySelectorAll('.agy-skill-item-btn');
    assert.equal(items.length, 4, 'Drawer phải có đúng 4 nút thức');

    items[2].click();
    const host = env.document.querySelector('agy-chibi-aura');
    assert.equal(host.dataset.auraSurge, '1', 'Bấm xuất chiêu phải kích hoạt data-aura-surge="1"');
    assert.ok(env.document.querySelector('agy-skill-vfx .agy-kny-title').textContent.length > 0);

    env.clock.advanceBy(1850);
    assert.equal(host.dataset.auraSurge, undefined, 'data-aura-surge phải tự tắt sau 1800ms');
  });

  it('F12-T1-06: Bất biến R3 trong Chibi Aura — xóa #agy-chibi-skill-bar & giữ <i aria-hidden="true"></i> trên bubble', () => {
    env = createKnyVmEnv();
    const { composer, bubbleFrame, npcWrap } = env.buildStandardIdeDom();
    const oldBar = env.document.createElement('div');
    oldBar.id = 'agy-chibi-skill-bar';
    env.document.body.appendChild(oldBar);

    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;
    aura.mountChibiAura(composer, { fxMode: 'water' }, 'giyu');
    aura.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'water' }, 'giyu');

    assert.equal(env.document.getElementById('agy-chibi-skill-bar'), null, '#agy-chibi-skill-bar cũ phải bị xóa sạch');
    const wave = bubbleFrame.querySelector(':scope > .agy-user-chibi-aura-wave');
    assert.ok(wave, 'Phải gắn .agy-user-chibi-aura-wave vào .agy-user-bubble-frame');
    assert.ok(wave.children.length > 0 && wave.children[0].tagName === 'I' && wave.children[0].getAttribute('aria-hidden') === 'true',
      'Wave con của .agy-user-bubble-frame bắt buộc chứa <i aria-hidden="true"></i>');
  });

  it('F12-T1-07: Đồng bộ tắt/bật kiếm âm agy_kny_sfx_muted giữa 2 module và __AGY_BIO_AUDIO__', () => {
    env = createKnyVmEnv();
    const bioSpy = attachBioAudioSpy(env);
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;
    const skills = env.sandbox.__AGY_KNY_SKILLS__;

    aura.setSfxMuted(true);
    assert.equal(env.localStorage.getItem('agy_kny_sfx_muted'), '1', 'localStorage phải lưu agy_kny_sfx_muted="1"');
    assert.equal(skills.isSoundMuted(), true, 'kny_breathing_skills phải phản ánh trạng thái tắt kiếm âm');
    assert.deepEqual(bioSpy.setSwordSfxEnabled.slice(-1), [false], 'Phải đồng bộ setSwordSfxEnabled(false) tới __AGY_BIO_AUDIO__');

    aura.setSfxMuted(false);
    assert.equal(env.localStorage.getItem('agy_kny_sfx_muted'), '0');
    assert.equal(skills.isSoundMuted(), false);
    assert.deepEqual(bioSpy.setSwordSfxEnabled.slice(-1), [true]);
  });

  // --- Tier 2 ---
  it('F12-T2-01: Đồng nhất ánh xạ nhân vật "moon" giữa kny_chibi_aura.js và kny_breathing_skills.js', () => {
    env = createKnyVmEnv();
    const { composer, npcWrap } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;

    const meta = aura.resolveCharacterMeta({ fxMode: 'moon' });
    assert.equal(
      skillsApi.resolveCharacterId('moon'),
      meta.charId,
      `Ánh xạ "moon" giữa kny_chibi_aura (${meta.charId}) và kny_breathing_skills (${skillsApi.resolveCharacterId('moon')}) phải đồng nhất`
    );

    // Hợp đồng đồng nhất: nhân vật và chiêu thức hiển thị trên UI phải khớp 100% chiêu thực thi bởi kny_breathing_skills
    aura.mountChibiAura(composer, { fxMode: 'moon' });
    aura.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'moon' });
    const uiFormTag = npcWrap.querySelector('.agy-skill-form-tag').textContent;
    const uiSkillVi = npcWrap.querySelector('.agy-skill-vi').textContent;
    const uiExpectedName = `${uiFormTag}: ${uiSkillVi}`;

    const executed = skillsApi.castSkill('moon', 0, { composerEl: composer });
    assert.equal(executed.ok, true);
    assert.equal(executed.charId, meta.charId, 'charId thực thi phải khớp meta.charId của Chibi Aura');
    assert.equal(
      executed.skill.nameVi,
      uiExpectedName,
      `Lệch ánh xạ "moon" giữa 2 module: UI hiển thị "${uiExpectedName}" nhưng kny_breathing_skills.castSkill('moon', 0) lại tung "${executed.skill.nameVi}" (charId="${executed.charId}")`
    );
  });

  it('F12-T2-02: Bảo vệ Autoplay Policy — playSkillSfx phải kiểm tra user-gesture trước khi tạo/resume AudioContext', () => {
    env = createKnyVmEnv({ userGestureActive: false });
    env.sandbox.__AGY_AUDIO_UNLOCKED__ = false;
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js']);
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;

    const blockedResult = skillsApi.playSkillSfx('water');
    assert.equal(blockedResult, false, 'Khi chưa có user gesture hợp lệ, playSkillSfx phải trả false');
    assert.equal(env.audioStats.created, 0, 'Không được khởi tạo AudioContext khi chưa có user gesture');
    assert.equal(env.audioStats.resumed, 0, 'Không được gọi AudioContext.resume() khi chưa có user gesture');

    // Sau khi có cử chỉ người dùng hợp lệ
    env.setUserGestureActive(true);
    env.sandbox.__AGY_AUDIO_UNLOCKED__ = true;
    const allowedResult = skillsApi.playSkillSfx('water');
    assert.equal(allowedResult, true, 'Khi đã có user gesture, playSkillSfx phải phát thành công');
    assert.ok(env.audioStats.maxGainScheduled <= 0.12, `Master gain ${env.audioStats.maxGainScheduled} vượt giới hạn <= 0.12`);
  });

  it('F12-T2-03: Phải hủy el.__agyLandingTimer và xóa data-chibi-landing khi destroy() trong cửa sổ 420ms hạ cánh', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js']);
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;

    skillsApi.castSkill('giyu', 0, { composerEl: composer, durationMs: 2500 });
    // Tiến tới p >= 0.96 để triggerCornerReturn(false) tạo __agyLandingTimer (420ms)
    env.clock.advanceBy(2430);
    env.clock.stepRaf(2, 16);
    assert.equal(composer.dataset.chibiLanding, '1', 'Trước khi destroy, chibiLanding phải đang ở trạng thái hạ cánh');
    assert.ok(composer.__agyLandingTimer, 'Trước khi destroy, el.__agyLandingTimer phải tồn tại');

    // Gọi destroy() ngay trong cửa sổ 420ms
    skillsApi.destroy();
    assert.equal(Boolean(composer.__agyLandingTimer), false, 'el.__agyLandingTimer phải bị clear về 0/falsy khi destroy()');
    assert.equal(composer.dataset.chibiLanding, undefined, 'data-chibi-landing phải được xóa ngay khi destroy()');
    assert.equal(env.clock.getStats().activeTimeouts, 0, 'Không được còn timeout rò rỉ sau destroy()');
  });

  it('F12-T2-04: Tôn trọng prefers-reduced-motion và GPU Arbiter fxFocusPaused', () => {
    env = createKnyVmEnv({ reducedMotion: true });
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js']);
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;

    const res = skillsApi.castSkill('tanjiro', 0, { composerEl: composer });
    assert.equal(res.reducedMotion, true, 'castSkill phải nhận biết reducedMotion');
    assert.equal(composer.dataset.chibiOutOnStage, undefined, 'Khi reduced-motion bật, không ẩn peeker');
    env.clock.stepRaf(2, 16); // Xả rAF banner 1 khung của castSkill

    aura.mountChibiAura(composer, { fxMode: 'sun_water' });
    assert.equal(env.clock.getStats().activeRafs, 0, 'mountChibiAura không được chạy rAF nền khi prefers-reduced-motion bật');

    // Tắt reduced-motion và kiểm tra GPU Arbiter fxFocusPaused
    env.setReducedMotion(false);
    aura.mountChibiAura(composer, { fxMode: 'flame' });
    assert.ok(env.clock.getStats().activeRafs > 0, 'Khi tắt reduced-motion, aura phải chạy rAF');
    env.sandbox.__AGY_SHINOBU_RT__ = { fxFocusPaused: true };
    aura.resumeOrPauseAura();
    assert.equal(env.document.body.dataset.agyFxPaused, '1', 'GPU Arbiter pause phải đặt data-agy-fx-paused="1"');
    assert.equal(env.clock.getStats().activeRafs, 0, 'rAF aura phải dừng ngay khi fxFocusPaused = true');
  });

  it('F12-T2-05: Cooldown 12000ms cho triggerFinisher và cô lập peeker khi composerEl === null', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;

    const r1 = aura.triggerFinisher({ charId: 'yoriichi' });
    assert.equal(r1.ok, true, 'Lần gọi triggerFinisher đầu tiên phải thành công');

    env.clock.advanceBy(5000);
    const r2 = aura.triggerFinisher({ charId: 'yoriichi' });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'cooldown', 'Gọi lại trước 12s phải trả lý do cooldown');

    env.clock.advanceBy(7005);
    const r3 = aura.triggerFinisher({ charId: 'yoriichi' });
    assert.equal(r3.ok, true, 'Sau >= 12000ms phải mở khóa triggerFinisher');

    skillsApi.castSkill('yoriichi', 3, { composerEl: null });
    assert.equal(composer.dataset.chibiOutOnStage, undefined, 'Truyền composerEl: null tuyệt đối không được ẩn peeker Chibi góc phải');
  });

  it('F12-T2-06: Stress spam 20 lần castSkill + đổi 16 aura mode rồi teardown không rò rỉ DOM/timer/rAF', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    const { composer, npcWrap } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;

    const ids = skillsApi.CHARACTER_IDS;
    for (let i = 0; i < 20; i++) {
      const cid = ids[i % ids.length];
      aura.mountChibiAura(composer, { fxMode: cid === 'ubuyashiki' ? 'royal_wisteria' : 'wisteria' }, cid);
      aura.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'wisteria' }, cid);
      skillsApi.castSkill(cid, i % 4, { composerEl: composer });
      env.clock.stepRaf(2, 16);
    }
    assert.equal(env.document.querySelectorAll('agy-chibi-aura').length, 1, 'Không được nhân đôi <agy-chibi-aura>');
    assert.equal(env.document.querySelectorAll('agy-skill-vfx').length, 1, 'Không được nhân đôi <agy-skill-vfx>');

    env.clock.advanceBy(10); // Hoàn tất các MockImage.onload giả lập
    aura.teardown();
    skillsApi.destroy();
    assert.equal(env.document.querySelectorAll('agy-chibi-aura, agy-skill-vfx').length, 0, 'Sau teardown phải dọn hết DOM host');
    const st = env.clock.getStats();
    assert.equal(st.activeTimeouts, 0, 'Không còn timeout sau teardown');
    assert.equal(st.activeIntervals, 0, 'Không còn interval sau teardown');
    assert.equal(st.activeRafs, 0, 'Không còn rAF sau teardown');
  });

  it('F12-T2-07: Đầu vào sai/biên (charId không tồn tại, index âm/tràn, isChibiNpc: false) xử lý an toàn', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js']);
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;

    const bad = skillsApi.castSkill('nhan_vat_khong_ton_tai', 0);
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'unknown_character_or_skill');

    const neg = skillsApi.castSkill('zenitsu', -5, { composerEl: null });
    assert.equal(neg.ok, true);
    assert.equal(neg.skill.id, skillsApi.getSkillsForCharacter('zenitsu')[0].id, 'Index âm phải clamp an toàn về Thức 1');

    const over = skillsApi.castSkill('zenitsu', 99, { composerEl: null });
    assert.equal(over.ok, true);
    assert.equal(over.skill.id, skillsApi.getSkillsForCharacter('zenitsu')[3].id, 'Index tràn phải clamp an toàn về Thức 4');

    aura.mountChibiAura(composer, { fxMode: 'thunder' }, 'zenitsu');
    assert.ok(env.document.querySelector('agy-chibi-aura'));
    aura.mountChibiAura(composer, { isChibiNpc: false }, 'zenitsu');
    assert.equal(env.document.querySelector('agy-chibi-aura'), null, 'Khi isChibiNpc === false phải tự teardown aura');
  });

  it('F12-T2-08: Khi drawer Các Thức đang mở, gọi lại mountSkillTriggerUi() (uiMatches) phải dựng lại .agy-skill-list ngay', () => {
    env = createKnyVmEnv();
    const { composer, npcWrap } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;

    aura.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'wisteria' }, 'shinobu');
    const pill = npcWrap.querySelector('.agy-npc-skill-pill');
    pill.click(); // Mở drawer Các Thức

    const oldList = npcWrap.querySelector('.agy-skill-list');
    assert.ok(oldList, 'Phải có .agy-skill-list sau khi mở drawer');
    oldList.dataset.staleMarker = '1';

    // Gọi lại mountSkillTriggerUi cùng composer & charId khi drawer đang mở
    aura.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'wisteria' }, 'shinobu');
    const newList = npcWrap.querySelector('.agy-skill-list');
    assert.ok(newList, 'Drawer đang mở phải còn .agy-skill-list');
    assert.equal(newList.dataset.staleMarker, undefined, '.agy-skill-list phải được dựng lại mới khi uiMatches và drawer đang mở');
  });
});

/* ============================================================================
 * SUITE 2 — F13: TOKEN HUD, HÁCH ĐAO & QUÂN ĐOÀN CỬU TRỤ (7 Tier 1 + 7 Tier 2)
 * ============================================================================ */

describe('F13: Token HUD, Rèn Hách Đao, Echo Banner & Quân Đoàn Cửu Trụ', () => {
  let env = null;
  afterEach(() => {
    if (env) {
      try { env.sandbox.__AGY_TOKEN_HUD__?.teardown(); } catch (_) {}
      try { env.sandbox.__AGY_SQUAD_RAID__?.teardown(); } catch (_) {}
      env = null;
    }
  });

  // --- Tier 1 ---
  it('F13-T1-01: HUD 3 tầng Responsive (<620px compact="1", <440px compact="2", >=620px đầy đủ)', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;

    const bar = hud.mountTokenHud(composer, {});
    env.triggerResize(composer, 700);
    assert.equal(bar.dataset.compact, undefined, '700px không được đặt compact');

    env.triggerResize(composer, 520);
    assert.equal(bar.dataset.compact, '1', '520px (<620px) phải bật data-compact="1"');
    assert.equal(composer.dataset.agyCompact, '1');

    env.triggerResize(composer, 380);
    assert.equal(bar.dataset.compact, '2', '380px (<440px) phải bật data-compact="2"');
    assert.equal(composer.dataset.agyCompact, '2');

    env.triggerResize(composer, 680);
    assert.equal(bar.dataset.compact, undefined, 'Phóng lại >=620px phải xóa data-compact');
    assert.equal(composer.dataset.agyCompact, undefined);
  });

  it('F13-T1-02: Chu trình Rèn Hách Đao 0% -> 100%, thanh SVG .agy-nichirin-heat-rect & data-agy-red-blade="1"', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const bar = hud.mountTokenHud(composer, {});
    const bladeBtn = bar.querySelector('.agy-nichirin-pill');
    const heatRect = bladeBtn.querySelector('.agy-nichirin-heat-rect');
    assert.ok(heatRect, 'SVG Hách Đao phải có .agy-nichirin-heat-rect');
    assert.equal(bladeBtn.dataset.tier, 'black', 'Khởi đầu phải ở tier black');
    assert.equal(env.document.documentElement.dataset.agyRedBlade, undefined);

    hud.setBladeBonusHeat(50);
    assert.equal(bladeBtn.dataset.tier, 'ember', '50% phải chuyển sang tier ember');

    hud.setBladeBonusHeat(100);
    assert.equal(bladeBtn.dataset.tier, 'red', '100% phải chuyển sang tier red');
    assert.equal(env.document.documentElement.dataset.agyRedBlade, '1', 'Khi >=75% phải đặt html[data-agy-red-blade="1"]');
    assert.equal(heatRect.getAttribute('width'), '33.0', 'Thanh nhiệt SVG tại 100% phải đạt width="33.0"');
    assert.ok(bladeBtn.textContent.includes('赫刀'), 'Nhãn Hách Đao phải hiển thị chữ Hán 赫刀 khi rực đỏ');

    hud.setBladeBonusHeat(20);
    assert.equal(env.document.documentElement.dataset.agyRedBlade, undefined, 'Hạ <75% phải xóa data-agy-red-blade');
  });

  it('F13-T1-03: Crisis-to-Slash & Phản Đòn 「滅」 khi slashSeq tăng (bỏ qua baseline đầu tiên)', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    const bioSpy = attachBioAudioSpy(env);
    let finisherCalls = 0;
    env.sandbox.__AGY_TRIGGER_FINISHER__ = () => { finisherCalls++; return { ok: true }; };
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    hud.mountTokenHud(composer, {});

    // Snapshot đầu tiên (baseline slashSeq=3): KHÔNG nổ phản đòn giả
    hud.ingestTelemetrySnapshot({
      ok: true, cid: 'cid-1', contextTokens: 10000, turnOutTokens: 500,
      turnSteps: 2, isWorking: true, crisisState: true, slashSeq: 3
    });
    assert.equal(composer.dataset.agyCrisis, '1', 'crisisState=true phải gắn data-agy-crisis="1"');
    assert.equal(finisherCalls, 0, 'Lần đồng bộ đầu tiên không được nổ phản đòn giả');
    assert.equal(env.document.getElementById('agy-metsu-victory-overlay'), null);

    // Snapshot tiếp theo tăng slashSeq -> 4
    hud.ingestTelemetrySnapshot({
      ok: true, cid: 'cid-1', contextTokens: 12000, turnOutTokens: 800,
      turnSteps: 3, isWorking: false, crisisState: false, slashSeq: 4, slashReason: 'bug_slashed'
    });
    assert.equal(composer.dataset.agyCrisis, undefined, 'Sau khi chém lỗi phải gỡ data-agy-crisis');
    assert.ok(hud.getBladeBonusHeat() >= 25, 'Phải cộng +25% bladeBonusHeat khi chém lỗi');
    assert.equal(finisherCalls, 1, 'Phải kích hoạt __AGY_TRIGGER_FINISHER__ khi slashSeq tăng');
    assert.equal(bioSpy.playNichirinSheathe.length, 1, 'Phải gọi playNichirinSheathe khi diệt lỗi');
    const overlay = env.document.getElementById('agy-metsu-victory-overlay');
    assert.ok(overlay, 'Phải hiện dấu ấn chiến thắng #agy-metsu-victory-overlay');
    assert.ok(overlay.textContent.includes('「滅」 ÁC QUỶ DIỆT SÁT'));
  });

  it('F13-T1-04: Echo Banner #agy-yoriichi-msg-echo hiện khi nhấn Enter & click Gửi, đóng bằng ✕ hoặc Escape', () => {
    env = createKnyVmEnv();
    const { composer, editor, sendBtn } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    hud.mountTokenHud(composer, {});

    // Giả lập React xóa editor ở bubble phase sau khi capture listener chạy
    editor.addEventListener('keydown', () => { editor.value = ''; }, false);
    editor.value = 'Diệt sạch lỗi ngay!';
    editor.dispatchEvent(new env.MiniEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    const echo = env.document.getElementById('agy-yoriichi-msg-echo');
    assert.ok(echo, 'Phải tạo #agy-yoriichi-msg-echo');
    assert.equal(echo.dataset.visible, '1', 'Nhấn Enter phải bật data-visible="1"');
    assert.ok(echo.querySelector('.agy-echo-hdr').textContent.includes('Khai Tổ Hỏa Thần vừa truyền lệnh'));
    assert.equal(echo.querySelector('.agy-echo-text').textContent, 'Diệt sạch lỗi ngay!');

    echo.querySelector('.agy-echo-close').click();
    assert.equal(echo.dataset.visible, undefined, 'Bấm nút đóng phải ẩn Echo Banner');

    editor.value = 'Lệnh qua nút gửi';
    sendBtn.click();
    assert.equal(echo.dataset.visible, '1');
    assert.equal(echo.querySelector('.agy-echo-text').textContent, 'Lệnh qua nút gửi');

    env.document.dispatchEvent(new env.MiniEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(echo.dataset.visible, undefined, 'Bấm Escape phải ẩn Echo Banner');
  });

  it('F13-T1-05: Quân Đoàn Cửu Trụ đồng bộ activeSubagents & recentCompletedSubagents (ấn 「完」 -> thu kiếm)', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js']);
    const squad = env.sandbox.__AGY_SQUAD_RAID__;

    squad.mount(composer, 'giyu');
    squad.sync({
      cid: 'c1',
      activeSubagents: [
        { cid: 'sub-1', typeName: 'research', role: 'Phân tích mã nguồn', stepCount: 2 },
        { cid: 'sub-2', typeName: 'browser', role: 'Kiểm định CDP', stepCount: 3 }
      ],
      recentCompletedSubagents: []
    });

    const host = env.document.querySelector('agy-hashira-squad');
    assert.ok(host);
    assert.equal(host.dataset.active, '1');
    const units = host.querySelectorAll('.agy-squad-unit-wrap');
    assert.equal(units.length, 2, 'Phải hiện đúng 2 Đại Trụ đang tác chiến');
    assert.ok(units.every((u) => !u.querySelector('.agy-squad-name').textContent.includes('Giyu')), 'Hero Quân Đoàn không được trùng hero host (Giyu)');

    // Chuyển sub-1 sang hoàn tất
    squad.sync({
      cid: 'c1',
      activeSubagents: [{ cid: 'sub-2', typeName: 'browser', role: 'Kiểm định CDP', stepCount: 4 }],
      recentCompletedSubagents: [{ cid: 'sub-1', typeName: 'research', role: 'Phân tích mã nguồn', stepCount: 3 }]
    });
    const doneUnit = host.querySelector('.agy-squad-unit-wrap[data-state="completed"]');
    assert.ok(doneUnit, 'Subagent hoàn tất phải chuyển data-state="completed"');
    assert.ok(doneUnit.textContent.includes('「完」 HOÀN TẤT'), 'Phải gắn ấn 「完」 HOÀN TẤT');

    // Sau 2200ms bắt đầu retreating, sau +520ms bị gỡ khỏi DOM
    env.clock.advanceBy(2250);
    assert.equal(doneUnit.dataset.retreating, '1');
    env.clock.advanceBy(550);
    assert.equal(host.querySelectorAll('.agy-squad-unit-wrap').length, 1, 'Đơn vị hoàn tất phải thu kiếm khỏi DOM sau 2200+520ms');
  });

  it('F13-T1-06: Định danh mặc định Tsugikuni Yoriichi & tương tác nút Chuông Kagura / Mặt Nạ Cáo trên HUD', () => {
    env = createKnyVmEnv();
    const bioSpy = attachBioAudioSpy(env);
    let shieldToggleCount = 0;
    let panelOpenCount = 0;
    env.sandbox.__AGY_CINEMA_DIRECTOR__ = {
      openPanel: () => { panelOpenCount++; },
      togglePrivacyShield: () => { shieldToggleCount++; },
      isPrivacyShieldActive: () => shieldToggleCount % 2 === 1,
      isShowcaseRunning: () => false
    };
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const bar = hud.mountTokenHud(composer, {}, '');

    const yoriBtn = bar.querySelector('.agy-yoriichi-crest-btn');
    assert.ok(yoriBtn.title.includes('Khai Tổ Vũ Điệu Hỏa Thần (Tsugikuni Yoriichi)'), 'Định danh mặc định trên HUD phải là Tsugikuni Yoriichi');

    // Click nút ngữ cảnh mở popover -> phải đóng popover Bio Audio
    bar.querySelector('.agy-tok-ctx-pill').click();
    assert.equal(bar.dataset.open, '1');
    assert.ok(bioSpy.closePopover >= 1, 'Mở popover HUD phải đóng popover Bio Audio');

    const kaguraBtn = bar.querySelector('.agy-kagura-bell-btn');
    kaguraBtn.dispatchEvent(new env.MiniEvent('click', { bubbles: true, shiftKey: true }));
    assert.equal(bioSpy.toggle, 1, 'Shift+Click Chuông Kagura phải bật/tắt Bio Audio');

    const cinemaBtn = bar.querySelector('.agy-cinema-mask-btn');
    cinemaBtn.click();
    assert.equal(panelOpenCount, 1, 'Click Mặt Nạ Cáo phải mở panel Cinema Director');
    cinemaBtn.dispatchEvent(new env.MiniEvent('click', { bubbles: true, shiftKey: true }));
    cinemaBtn.dispatchEvent(new env.MiniEvent('contextmenu', { bubbles: true, cancelable: true }));
    assert.equal(shieldToggleCount, 2, 'Shift+Click và Chuột phải Mặt Nạ Cáo phải bật/tắt Khiên Che Mật');
  });

  it('F13-T1-07: Luồng SSE /__events kèm X-Agy-Token từ __AGY_SEC__ & fallback /__telemetry khi SSE 500', async () => {
    env = createKnyVmEnv({ authToken: 'secret-256-token' });
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const bar = hud.mountTokenHud(composer, {});

    await flushMicrotasks();
    const sseCall = env.fetchCalls.find((c) => c.url.includes('/__events'));
    assert.ok(sseCall, 'Phải mở kết nối SSE /__events');
    assert.equal(sseCall.headers['X-Agy-Token'], 'secret-256-token', 'Header X-Agy-Token phải truyền đúng token từ closure __AGY_SEC__');

    env.pushSseSnapshot({ ok: true, cid: 'cid-sse', contextTokens: 12345, turnOutTokens: 450, isWorking: false });
    await flushMicrotasks(8);
    env.clock.stepRaf(50, 16);
    assert.equal(bar.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent, '12.3K', 'Snapshot SSE phải cập nhật ngay lên HUD');

    // Kiểm tra nhánh fallback /__telemetry khi SSE trả 500
    env.sandbox.__AGY_TOKEN_HUD__.teardown();
    env.fetchCalls.length = 0;
    env.setSseConfig({ shouldFail: true, status: 500 });
    env.setTelemetryConfig({
      shouldFail: false,
      snapshot: { ok: true, cid: 'cid-fb', contextTokens: 54321, turnOutTokens: 200, isWorking: false }
    });
    const bar2 = hud.mountTokenHud(composer, {});
    await flushMicrotasks(8);
    env.clock.stepRaf(50, 16);
    const fbCall = env.fetchCalls.find((c) => c.url.includes('/__telemetry'));
    assert.ok(fbCall, 'Khi SSE 500 phải gọi fallback /__telemetry');
    assert.equal(fbCall.headers['X-Agy-Token'], 'secret-256-token');
    assert.equal(bar2.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent, '54.3K');
  });

  // --- Tier 2 ---
  it('F13-T2-01: pollTimer PHẢI tự dừng và không gọi fetch khi barEl.isConnected === false', async () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const bar = hud.mountTokenHud(composer, {});
    await flushMicrotasks();

    // Mô phỏng React unmount .surface-composer khỏi DOM mà không kịp gọi teardown()
    composer.remove();
    assert.equal(bar.isConnected, false, 'Sau khi unmount composer, bar.isConnected phải là false');
    const callsBefore = env.fetchCalls.length;

    env.clock.advanceBy(5000);
    await flushMicrotasks();
    assert.equal(
      env.fetchCalls.length,
      callsBefore,
      'pollTimer vẫn gọi fetch sau khi barEl.isConnected === false (thiếu guard kiểm tra state.barEl.isConnected trong pollTimer)'
    );
    assert.equal(
      env.clock.getStats().activeIntervals,
      0,
      'pollTimer phải tự clearInterval khi barEl bị gỡ khỏi DOM'
    );
  });

  it('F13-T2-02: teardown() của kny_token_hud & kny_squad_raid phải dọn sạch toàn bộ DOM, timer ngắn & listener', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    attachBioAudioSpy(env);
    env.sandbox.__AGY_CINEMA_DIRECTOR__ = {
      openPanel: () => {},
      togglePrivacyShield: () => {},
      isPrivacyShieldActive: () => false,
      isShowcaseRunning: () => false
    };
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const squad = env.sandbox.__AGY_SQUAD_RAID__;

    const bar = hud.mountTokenHud(composer, {});
    hud.castYoriichiSunBreathing();
    hud.showUserMessageEcho('Kiểm tra dọn dẹp');
    bar.querySelector('.agy-kagura-bell-btn').click();
    bar.querySelector('.agy-cinema-mask-btn').click();
    squad.triggerVictoryStamp({ slashSeq: 9 });

    assert.ok(env.document.querySelector('.agy-kasugai-crow-flyby'), 'Trước teardown phải có .agy-kasugai-crow-flyby');
    hud.teardown();

    assert.equal(env.document.getElementById('agy-token-context-bar'), null);
    assert.equal(env.document.getElementById('agy-yoriichi-msg-echo'), null);
    assert.equal(env.document.querySelector('agy-hashira-squad'), null);
    assert.equal(env.document.getElementById('agy-metsu-victory-overlay'), null);
    assert.equal(env.document.querySelector('.agy-kasugai-crow-flyby'), null);

    const st = env.clock.getStats();
    assert.equal(
      st.activeTimeouts + st.activeIntervals + st.activeRafs,
      0,
      `teardown() vẫn để sót timer/rAF: timeouts=${st.activeTimeouts}, intervals=${st.activeIntervals}, rafs=${st.activeRafs} (cần dọn các timer ngắn trong kny_token_hud và crow timer trong kny_squad_raid)`
    );
  });

  it('F13-T2-03: CSS trong kny_squad_raid.js phải tôn trọng @media (prefers-reduced-motion)', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js']);
    env.sandbox.__AGY_SQUAD_RAID__.mount(composer, 'shinobu');

    const styleEl = env.document.getElementById('antigravity-kny-squad-raid-style');
    assert.ok(styleEl, 'Phải chèn #antigravity-kny-squad-raid-style');
    const css = styleEl.textContent;
    const hasMediaRule = /@media\s*\(\s*prefers-reduced-motion\s*:\s*(?:no-preference|reduce)\s*\)/i.test(css);
    assert.ok(
      hasMediaRule,
      'CSS của kny_squad_raid.js thiếu @media (prefers-reduced-motion: no-preference | reduce) cho agySquadBeacon, agyUnitAuraBreathe và các animation chuyển động'
    );
  });

  it('F13-T2-04: Nhãn phụ trong HUD & Popover (#agy-token-context-bar) phải 100% Tiếng Việt', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const bar = hud.mountTokenHud(composer, {});

    bar.querySelector('.agy-tok-ctx-pill').click();
    hud.ingestTelemetrySnapshot({
      ok: true, cid: 'cid-vi', contextTokens: 20000, cacheReadTokens: 5000,
      turnOutTokens: 1200, turnSteps: 2, totalOutTokens: 3000, modelName: '', isWorking: false
    });
    env.clock.stepRaf(5, 16);

    const txt = bar.textContent;
    const forbidden = [];
    if (/\bcache\b/i.test(txt)) forbidden.push('cache');
    if (/\btok\b/i.test(txt)) forbidden.push('tok');
    if (/SSE\s*<30ms/i.test(txt)) forbidden.push('SSE <30ms');
    if (/Antigravity Agent/i.test(txt)) forbidden.push('Antigravity Agent');
    assert.deepEqual(
      forbidden,
      [],
      `HUD/Popover vẫn còn nhãn phụ tiếng Anh chưa Việt hóa: ${forbidden.join(', ')} (nội dung: "${txt}")`
    );
  });

  it('F13-T2-05: Chống XSS trong Echo Banner & Kasugai Intel; stopSimulation cô lập với unit thật', () => {
    env = createKnyVmEnv();
    const { composer, editor } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const squad = env.sandbox.__AGY_SQUAD_RAID__;
    hud.mountTokenHud(composer, {});
    squad.mount(composer, 'shinobu');

    const xssPayload = '<img src=x onerror=alert(1)><script>window.__PWNED__=1</script>';
    editor.value = xssPayload;
    editor.dispatchEvent(new env.MiniEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const echo = env.document.getElementById('agy-yoriichi-msg-echo');
    assert.equal(echo.querySelectorAll('img, script').length, 0, 'Echo Banner không được parse HTML XSS');
    assert.equal(echo.querySelector('.agy-echo-text').textContent, xssPayload);

    squad.sync({
      cid: 'c-xss',
      activeSubagents: [{ cid: 'real-1', typeName: 'research', role: xssPayload, lastTool: xssPayload, stepCount: 1 }],
      recentCompletedSubagents: []
    });
    const host = env.document.querySelector('agy-hashira-squad');
    assert.equal(host.querySelectorAll('img, script').length, 0, 'Kasugai Intel không được parse HTML XSS');

    // Chạy mô phỏng rồi dừng mô phỏng: unit thật real-1 phải còn nguyên
    squad.simulateRaid({ durationMs: 3000 });
    env.clock.advanceBy(600);
    squad.stopSimulation();
    const remaining = host.querySelectorAll('.agy-squad-unit-wrap');
    assert.equal(remaining.length, 1, 'stopSimulation() chỉ được xóa unit mô phỏng isSim, phải giữ lại unit thật');
  });

  it('F13-T2-06: Bảo vệ IME, Shift+Enter, [role="listbox"] đang mở & chống bắt nhầm nút nội bộ HUD trong Echo Capture', () => {
    env = createKnyVmEnv();
    const { composer, editor, hitbox } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const bar = hud.mountTokenHud(composer, {});

    const isEchoVisible = () => {
      const el = env.document.getElementById('agy-yoriichi-msg-echo');
      return Boolean(el && el.dataset.visible === '1');
    };

    editor.value = 'Đang gõ tiếng Việt';
    editor.dispatchEvent(new env.MiniEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    assert.equal(isEchoVisible(), false, 'Không được bật Echo khi đang gõ IME (isComposing)');

    editor.dispatchEvent(new env.MiniEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
    assert.equal(isEchoVisible(), false, 'Không được bật Echo khi keyCode === 229');

    editor.dispatchEvent(new env.MiniEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    assert.equal(isEchoVisible(), false, 'Không được bật Echo khi nhấn Shift+Enter');

    const listbox = env.document.createElement('div');
    listbox.setAttribute('role', 'listbox');
    env.document.body.appendChild(listbox);
    editor.dispatchEvent(new env.MiniEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(isEchoVisible(), false, 'Không được bật Echo khi popup [role="listbox"] đang mở');
    listbox.remove();

    // Click nút nội bộ HUD hoặc hitbox có type submit/aria tương đồng cũng không bật Echo
    hitbox.setAttribute('aria-label', 'send');
    hitbox.click();
    assert.equal(isEchoVisible(), false, 'Click .agy-chibi-hitbox không được kích hoạt Echo Banner');
    const yoriBtn = bar.querySelector('.agy-yoriichi-crest-btn');
    yoriBtn.setAttribute('data-testid', 'send');
    yoriBtn.click();
    assert.equal(isEchoVisible(), false, 'Click nút bên trong HUD không được kích hoạt Echo Banner');
  });

  it('F13-T2-07: Đổi cid reset state & đóng SSE cũ; bão 15 subagent phân bổ 13 hero đầu không trùng', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const squad = env.sandbox.__AGY_SQUAD_RAID__;
    hud.mountTokenHud(composer, {});

    hud.ingestTelemetrySnapshot({
      ok: true, cid: 'uuid-1', contextTokens: 10000, turnOutTokens: 300,
      crisisState: true, slashSeq: 2
    });
    hud.setBladeBonusHeat(60);
    assert.equal(composer.dataset.agyCrisis, '1');

    // Chuyển sang cid mới uuid-2
    hud.ingestTelemetrySnapshot({
      ok: true, cid: 'uuid-2', contextTokens: 100, turnOutTokens: 0,
      crisisState: false, slashSeq: 0
    });
    assert.equal(hud.getBladeBonusHeat(), 0, 'Đổi cid phải reset bladeBonusHeat về 0');
    assert.equal(composer.dataset.agyCrisis, undefined, 'Đổi cid phải xóa crisisState cũ');

    // Bão 15 subagents cùng lúc
    const swarm = Array.from({ length: 15 }, (_, i) => ({
      cid: `swarm-${i}`,
      typeName: ['research', 'design', 'browser', 'self'][i % 4],
      role: `Đặc vụ ${i}`,
      stepCount: 1
    }));
    squad.sync({ cid: 'uuid-2', activeSubagents: swarm, recentCompletedSubagents: [] });
    const units = env.document.querySelectorAll('agy-hashira-squad .agy-squad-unit-wrap');
    assert.equal(units.length, 15);
    const first13Heroes = units.slice(0, 13).map((u) => u.querySelector('.agy-squad-name').textContent);
    assert.equal(new Set(first13Heroes).size, 13, '13 subagent đầu tiên phải nhận 13 Đại Trụ khác nhau hoàn toàn');
  });

  it('F13-T2-08: cidEpoch không drop fetch cidB khi cidA đang in-flight, chặn snapshot trễ & squad tự mount lại khi composer tách DOM', async () => {
    const cidA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const cidB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let resolveFetchA = null;
    let fetchBCount = 0;

    env = createKnyVmEnv({ authToken: 'secret-256-token' });
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const squad = env.sandbox.__AGY_SQUAD_RAID__;

    env.sandbox.fetch = (url) => {
      const u = String(url);
      if (u.includes('/__events')) {
        return new Promise(() => {});
      }
      if (u.includes(encodeURIComponent(cidA))) {
        return new Promise((resolve) => {
          resolveFetchA = () => resolve({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, cid: cidA, contextTokens: 98765, turnOutTokens: 500, isWorking: false })
          });
        });
      }
      if (u.includes(encodeURIComponent(cidB))) {
        fetchBCount++;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, cid: cidB, contextTokens: 12000, turnOutTokens: 50, isWorking: false })
      });
    };

    env.sandbox.location.pathname = `/c/${cidA}`;
    const bar = hud.mountTokenHud(composer, {});
    await flushMicrotasks(8);
    assert.ok(typeof resolveFetchA === 'function', 'Phải đang có request __telemetry cho cidA bay dở');

    // Chuyển nhanh sang cidB trong khi cidA đang in-flight -> fetch(cidB) phải chạy ngay (không bị drop vì fetchInFlight)
    env.sandbox.location.pathname = `/c/${cidB}`;
    env.clock.advanceBy(900);
    await flushMicrotasks(8);
    assert.ok(fetchBCount >= 1, 'Chuyển sang cidB phải fetch __telemetry(cidB) ngay dù cidA đang in-flight');
    env.clock.stepRaf(30, 16);
    assert.equal(bar.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent, '12.0K');

    // Response cũ của cidA mới trả về trễ -> phải bị cidEpoch chặn, không ghi đè dữ liệu cidB
    resolveFetchA();
    await flushMicrotasks(8);
    env.clock.stepRaf(30, 16);
    assert.equal(bar.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent, '12.0K', 'Response trễ từ cidA không được ghi đè lên HUD sau khi chuyển sang cidB');

    // Kiểm tra squad.sync() khi composer cũ bị tách DOM & composer mới xuất hiện
    squad.mount(composer, 'shinobu');
    composer.remove();
    const newComposer = env.document.createElement('div');
    newComposer.className = 'surface-composer';
    env.document.body.appendChild(newComposer);
    squad.sync({
      cid: cidB,
      activeSubagents: [{ cid: 'sub-reattach', typeName: 'research', role: 'Kiểm tra attach', stepCount: 1 }],
      recentCompletedSubagents: []
    });
    const reattached = newComposer.querySelector('agy-hashira-squad');
    assert.ok(reattached && reattached.isConnected, 'Khi composer cũ bị tách DOM, squad phải tự mount lại vào composer mới');

    // Kiểm tra trường hợp composer cũ bị tách DOM và tạm thời chưa có composer thay thế
    newComposer.remove();
    squad.sync({
      cid: cidB,
      activeSubagents: [
        { cid: 'sub-reattach', typeName: 'research', role: 'Kiểm tra attach', stepCount: 2 },
        { cid: 'sub-pending', typeName: 'browser', role: 'Chờ composer mới', stepCount: 1 }
      ],
      recentCompletedSubagents: []
    });
    assert.equal(reattached.isConnected, false, 'Squad cũ phải bị tháo khỏi node detached khi DOM chưa có composer mới');
    assert.equal(reattached.querySelectorAll('.agy-squad-unit-wrap').length, 1, 'Không được tạo DOM unit mới gắn vào node đã detached');

    const thirdComposer = env.document.createElement('div');
    thirdComposer.className = 'surface-composer';
    env.document.body.appendChild(thirdComposer);
    squad.sync({
      cid: cidB,
      activeSubagents: [
        { cid: 'sub-reattach', typeName: 'research', role: 'Kiểm tra attach', stepCount: 2 },
        { cid: 'sub-pending', typeName: 'browser', role: 'Chờ composer mới', stepCount: 1 }
      ],
      recentCompletedSubagents: []
    });
    const reattached3 = thirdComposer.querySelector('agy-hashira-squad');
    assert.ok(reattached3 && reattached3.isConnected, 'Khi composer mới mount lại, squad phải phục hồi sạch sẽ');
    assert.equal(reattached3.querySelectorAll('.agy-squad-unit-wrap').length, 2, 'Cả unit cũ lẫn unit mới phải hiển thị đầy đủ trên composer mới');
  });

  it('F13-T2-09 [LEAK-HUD-SSE]: Ngắt/hủy controller.abort() và reader.cancel() khi thoát sớm hoặc detach composer giữa stream SSE', async () => {
    const cid1 = '11111111-1111-4111-8111-111111111111';
    env = createKnyVmEnv({ authToken: 'secret-sse-token' });
    const { composer } = env.buildStandardIdeDom();

    let abortCalls = 0;
    let readerCancelCalls = 0;
    let bodyCancelCalls = 0;
    const OrigAbortController = env.sandbox.AbortController;
    env.sandbox.AbortController = class SpyAbortController extends OrigAbortController {
      abort() {
        abortCalls++;
        return super.abort();
      }
    };
    const origFetch = env.sandbox.fetch;
    env.sandbox.fetch = async (url, opts) => {
      const res = await origFetch(url, opts);
      if (String(url).includes('/__events') && res && res.body && typeof res.body.getReader === 'function') {
        const origGetReader = res.body.getReader.bind(res.body);
        res.body.getReader = () => {
          const reader = origGetReader();
          const origCancel = reader.cancel ? reader.cancel.bind(reader) : () => Promise.resolve();
          reader.cancel = (...args) => {
            readerCancelCalls++;
            return origCancel(...args);
          };
          return reader;
        };
      }
      return res;
    };

    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    env.sandbox.location.pathname = `/c/${cid1}`;
    const bar = hud.mountTokenHud(composer, {});
    await flushMicrotasks(8);

    // Đẩy 1 chunk hợp lệ trước để đảm bảo stream đã mở reader.read()
    env.pushSseSnapshot({ ok: true, cid: cid1, contextTokens: 4200, turnOutTokens: 100, isWorking: false });
    await flushMicrotasks(8);
    env.clock.stepRaf(20, 16);
    assert.equal(bar.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent, '4.20K');

    // Detach composer khỏi DOM (bar.isConnected === false) rồi đẩy tiếp 1 chunk SSE
    composer.remove();
    assert.equal(bar.isConnected, false);
    env.pushSseSnapshot({ ok: true, cid: cid1, contextTokens: 99000, turnOutTokens: 800, isWorking: true });
    await flushMicrotasks(8);

    assert.ok(abortCalls >= 1, 'Khi barEl bị detach giữa SSE stream phải gọi controller.abort()');
    assert.ok(readerCancelCalls >= 1, 'Khi barEl bị detach giữa SSE stream phải gọi reader.cancel()');
    assert.equal(bar.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent, '4.20K', 'Không được ingest dữ liệu stale sau khi detach');

    // Nhánh 2: thoát sớm ngay khi fetch('/__events') vừa resolve sau lúc composer đã bị gỡ
    let resolvePendingSse = null;
    env.sandbox.fetch = (url) => {
      if (String(url).includes('/__events')) {
        return new Promise((resolve) => {
          resolvePendingSse = () => resolve({
            ok: true,
            status: 200,
            body: {
              cancel() {
                bodyCancelCalls++;
                return Promise.resolve();
              },
              getReader() {
                return { read: async () => ({ done: true }), cancel: async () => {} };
              }
            }
          });
        });
      }
      return origFetch(url);
    };
    const cid2 = '22222222-2222-4222-8222-222222222222';
    const { composer: composer2 } = env.buildStandardIdeDom();
    env.sandbox.location.pathname = `/c/${cid2}`;
    const abortBeforeEarly = abortCalls;
    hud.mountTokenHud(composer2, {});
    await flushMicrotasks(4);
    assert.ok(typeof resolvePendingSse === 'function');
    composer2.remove();
    resolvePendingSse();
    await flushMicrotasks(8);
    assert.ok(abortCalls > abortBeforeEarly, 'Thoát sớm sau fetch() khi detach DOM phải gọi controller.abort()');
    assert.ok(bodyCancelCalls >= 1, 'Thoát sớm sau fetch() phải gọi res.body.cancel() nếu có');
  });

  it('F13-T2-10 [SESSION-ISOLATION]: Chống rò rỉ Subagent & Token xuyên phiên (Sidebar [data-cascade-id], /launchpad New Conversation & Split-View 2 cột)', async () => {
    const cidSessionA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    const cidSessionB = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    env = createKnyVmEnv({ authToken: 'secret-isolation-token' });

    // Xây dựng DOM thực tế có Sidebar bên trái chứa danh sách lịch sử [data-cascade-id] của Phiên A & B
    const sidebar = env.document.createElement('aside');
    sidebar.setAttribute('data-sidebar', 'true');
    const histItemA = env.document.createElement('div');
    histItemA.setAttribute('data-cascade-id', cidSessionA);
    sidebar.appendChild(histItemA);
    const histItemB = env.document.createElement('div');
    histItemB.setAttribute('data-cascade-id', cidSessionB);
    sidebar.appendChild(histItemB);
    env.document.body.appendChild(sidebar);

    const { composer, mainBody, bubbleFrame } = env.buildStandardIdeDom();
    // Mở màn hình New Conversation (/launchpad) trống tin nhắn -> KHÔNG ĐƯỢC lấy nhầm cidSessionA trên Sidebar hay gọi cid=latest!
    bubbleFrame.remove();
    env.sandbox.location.pathname = '/launchpad';

    env.setUserGestureActive(true);
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_bio_audio.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const squad = env.sandbox.__AGY_SQUAD_RAID__;
    const bio = env.sandbox.__AGY_BIO_AUDIO__;
    bio.toggle(); // bật Bio Audio để giám sát không nổ chuông Koto giả khi đổi phiên!
    const bar = hud.mountTokenHud(composer, {});
    await flushMicrotasks(6);

    assert.equal(
      env.fetchCalls.length,
      0,
      'Màn hình phiên mới /launchpad không được mở SSE hay gọi /__telemetry hút nhầm phiên đang chạy ở tab khác'
    );
    assert.equal(bar.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent, '0');

    // Chuyển sang Phiên A (/c/cidSessionA) có 158.4K token, workStateItems và 2 Subagents đang chạy
    env.sandbox.location.pathname = `/c/${cidSessionA}`;
    env.clock.advanceBy(900);
    await flushMicrotasks(8);
    assert.ok(
      env.fetchCalls.some((c) => c.url.includes(encodeURIComponent(cidSessionA))),
      'Chuyển sang Phiên A phải kết nối đúng cidSessionA'
    );

    hud.ingestTelemetrySnapshot({
      ok: true,
      cid: cidSessionA,
      contextTokens: 158400,
      turnTokens: 50031,
      outputTokens: 200000,
      turnSteps: 4,
      isWorking: true,
      workStateItems: [{ task: 'Nhiệm vụ của Phiên A', status: 'doing' }],
      activeSubagents: [
        { cid: 'sub-a-1', typeName: 'research', role: 'Trinh sát Phiên A', stepCount: 3 },
        { cid: 'sub-a-2', typeName: 'browser', role: 'Kiểm thử Phiên A', stepCount: 2 }
      ],
      recentCompletedSubagents: []
    });
    env.clock.stepRaf(40, 16);
    bar.querySelector('.agy-tok-ctx-pill').click(); // mở Popover kiểm tra cả chi tiết bên trong
    assert.equal(bar.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent, '158.4K');
    assert.equal(
      env.document.querySelectorAll('agy-hashira-squad .agy-squad-unit-wrap').length,
      2,
      'Phiên A phải hiển thị đúng 2 Đại Trụ Subagent'
    );
    assert.ok(bar.textContent.includes('Nhiệm vụ của Phiên A'), 'Popover Phiên A phải hiển thị tiến độ nhiệm vụ');

    // Người dùng bấm New Conversation quay về /launchpad (explicitCid trở thành rỗng!) -> PHẢI xóa ngay lập tức token & subagent của Phiên A!
    const callsBeforeNewConv = env.fetchCalls.length;
    env.sandbox.location.pathname = '/launchpad';
    env.clock.advanceBy(900);
    await flushMicrotasks(6);

    assert.equal(
      bar.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent,
      '0',
      'Chuyển từ Phiên A sang Phiên Mới (/launchpad) phải xóa ngay số token 158.4K của Phiên A về 0'
    );
    assert.equal(
      bar.querySelector('.agy-tok-turn-pill .agy-tok-num').textContent,
      '+0',
      'Token lượt của Phiên A phải về +0 trong Phiên Mới'
    );
    assert.equal(
      env.document.querySelectorAll('agy-hashira-squad .agy-squad-unit-wrap').length,
      0,
      'Toàn bộ Subagent của Phiên A phải bị gỡ sạch khỏi Phiên Mới'
    );
    assert.equal(
      bar.textContent.includes('Nhiệm vụ của Phiên A'),
      false,
      'workStateItems của Phiên A không được rò rỉ sang Popover của Phiên Mới'
    );
    assert.equal(
      env.fetchCalls.length,
      callsBeforeNewConv,
      'Khi về /launchpad không được gọi thêm cid=latest'
    );

    // Gói dữ liệu trễ từ Phiên A cố lọt vào khi đang ở /launchpad -> phải bị chặn đứng 100%
    hud.ingestTelemetrySnapshot({
      ok: true,
      cid: cidSessionA,
      contextTokens: 199000,
      activeSubagents: [{ cid: 'sub-a-late', typeName: 'research', role: 'Gói trễ', stepCount: 5 }]
    });
    squad.sync({
      cid: cidSessionA,
      activeSubagents: [{ cid: 'sub-a-late', typeName: 'research', role: 'Gói trễ', stepCount: 5 }],
      recentCompletedSubagents: []
    });
    assert.equal(bar.querySelector('.agy-tok-ctx-pill .agy-tok-num').textContent, '0');
    assert.equal(env.document.querySelectorAll('agy-hashira-squad .agy-squad-unit-wrap').length, 0);

    // Split-View 2 cột mở song song: Cột 1 (cidSessionA) và Cột 2 (cidSessionB), URL cửa sổ vẫn giữ /c/cidSessionA
    const paneA = env.document.createElement('div');
    paneA.setAttribute('data-cascade-id', cidSessionA);
    mainBody.appendChild(paneA);
    paneA.appendChild(composer);

    const paneB = env.document.createElement('div');
    paneB.setAttribute('data-cascade-id', cidSessionB);
    const composerB = env.document.createElement('div');
    composerB.className = 'surface-composer';
    composerB._clientWidth = 600;
    composerB._rect = { left: 700, top: 620, width: 600, height: 110, right: 1300, bottom: 730 };
    const editorB = env.document.createElement('textarea');
    composerB.appendChild(editorB);
    paneB.appendChild(composerB);
    mainBody.appendChild(paneB);

    // URL đang ở cidSessionA nhưng người dùng focus vào ô chat Cột 2 (composerB - cidSessionB)
    env.sandbox.location.pathname = `/c/${cidSessionA}`;
    env.document.activeElement = editorB;
    editorB.dispatchEvent(new env.MiniEvent('focusin', { bubbles: true }));
    await flushMicrotasks(8);

    const activeBar = env.document.getElementById('agy-token-context-bar');
    assert.equal(activeBar.parentElement, composerB, 'Khi focus sang Cột 2 trong Split-View, HUD phải gắn sang composerB');
    assert.ok(
      env.fetchCalls.some((c) => c.url.includes(encodeURIComponent(cidSessionB))),
      'Cột 2 phải lấy đúng cidSessionB của chính paneB chứ không bị window.location (cidSessionA) ghi đè'
    );

    // Chuyển sang cidSessionB có turnFinishedSeq = 15 & slashSeq = 4 cao hơn phiên trước -> KHÔNG ĐƯỢC nổ chuông Koto hay tiếng kiếm giả!
    const oscBeforeSwitchB = env.audioStats.oscillatorsStarted;
    hud.ingestTelemetrySnapshot({
      ok: true,
      cid: cidSessionB,
      contextTokens: 2000,
      turnTokens: 80,
      turnFinishedSeq: 15,
      slashSeq: 4,
      isWorking: false,
      activeSubagents: [],
      recentCompletedSubagents: []
    });
    assert.equal(
      env.audioStats.oscillatorsStarted,
      oscBeforeSwitchB,
      'Chuyển sang phiên cũ có turnFinishedSeq/slashSeq cao hơn không được phát tiếng chuông Koto hay tiếng kiếm giả'
    );
  });

  it('F13-T2-11 [COMPACT-MANUAL]: Click Nhật Luân Kiếm gửi /compact (textarea/Send, fallback Enter, contenteditable+slash) & bảo vệ nháp/AI bận', () => {
    env = createKnyVmEnv();
    const { composer, editor, sendBtn } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const bar = hud.mountTokenHud(composer, {});
    const bladeBtn = bar.querySelector('.agy-nichirin-pill');

    const sentPayloads = [];
    sendBtn.addEventListener('click', () => {
      sentPayloads.push(editor.value);
      editor.value = '';
    });

    // 1. Bảo vệ nháp đang gõ dở -> KHÔNG được ghi đè hoặc gửi /compact
    editor.value = 'Tin nhắn đang soạn dở';
    bladeBtn.click();
    assert.equal(editor.value, 'Tin nhắn đang soạn dở', 'Không được ghi đè nội dung nháp trong ô chat');
    assert.equal(sentPayloads.length, 0);
    const echo = env.document.getElementById('agy-yoriichi-msg-echo');
    assert.ok(echo.querySelector('.agy-echo-text').textContent.includes('nháp'));

    // 2. Bảo vệ khi AI đang bận (isWorking = true)
    editor.value = '';
    const cidWork = 'cccccccc-3333-4333-8333-cccccccccccc';
    env.sandbox.location.pathname = `/c/${cidWork}`;
    env.clock.advanceBy(900);
    hud.ingestTelemetrySnapshot({ ok: true, cid: cidWork, contextTokens: 50000, isWorking: true });
    bladeBtn.click();
    assert.equal(editor.value, '', 'Không được điền /compact khi AI đang xử lý');
    assert.equal(sentPayloads.length, 0);

    // 3. Khi rảnh & ô chat trống: bấm thanh kiếm -> điền /compact và gửi qua sendBtn
    hud.ingestTelemetrySnapshot({ ok: true, cid: cidWork, contextTokens: 50000, isWorking: false });
    bladeBtn.click();
    assert.equal(editor.value, '/compact', 'Click thanh kiếm phải điền /compact vào ô chat');
    assert.equal(bladeBtn.dataset.compacting, '1', 'Phải bật data-compacting="1" trong lúc gửi');
    assert.ok(echo.querySelector('.agy-echo-text').textContent.includes('Đang nén phiên (/compact)'));

    env.clock.advanceBy(210);
    assert.deepEqual(sentPayloads, ['/compact'], 'Sau 200ms phải kích hoạt nút gửi với /compact');
    assert.ok(
      echo.querySelector('.agy-echo-text').textContent.includes('Đang nén phiên (/compact)'),
      'Không được ghi đè Echo tiếng Việt bằng chuỗi /compact thô'
    );
    env.clock.advanceBy(700);
    assert.equal(bladeBtn.dataset.compacting, undefined, 'Sau 860ms phải tắt data-compacting');
    assert.equal(hud.getCompactState().inFlight, false);

    // 4. Fallback Enter khi composer không có nút Send
    env.clock.advanceBy(4100); // hết cooldown manual 4000ms
    sendBtn.remove();
    const enterEvents = [];
    editor.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        enterEvents.push(editor.value);
        editor.value = '';
      }
    });
    bladeBtn.click();
    assert.equal(editor.value, '/compact');
    env.clock.advanceBy(210);
    assert.deepEqual(enterEvents, ['/compact'], 'Khi thiếu nút Send phải fallback gửi bằng phím Enter');
    env.clock.advanceBy(700);

    // 5. Hỗ trợ [contenteditable="true"] + Slash popup [role="listbox"]
    const { composer: ceComp } = env.buildStandardIdeDom();
    const oldTextarea = ceComp.querySelector('textarea');
    oldTextarea.remove();
    const ceEditor = env.document.createElement('div');
    ceEditor.setAttribute('contenteditable', 'true');
    ceComp.insertBefore(ceEditor, ceComp.firstElementChild);

    const ceSendBtn = ceComp.querySelector('button[aria-label="Gửi tin nhắn"]');
    const cePayloads = [];
    ceSendBtn.addEventListener('click', () => {
      cePayloads.push(ceEditor.textContent);
      ceEditor.textContent = '';
    });

    const slashMenu = env.document.createElement('div');
    slashMenu.setAttribute('role', 'listbox');
    const compactOpt = env.document.createElement('div');
    compactOpt.setAttribute('role', 'option');
    compactOpt.setAttribute('data-value', 'compact');
    compactOpt.textContent = '/compact';
    let optClicks = 0;
    compactOpt.addEventListener('click', () => {
      optClicks++;
      slashMenu.remove();
    });
    slashMenu.appendChild(compactOpt);
    env.document.body.appendChild(slashMenu);

    const bar2 = hud.mountTokenHud(ceComp, {});
    const bladeBtn2 = bar2.querySelector('.agy-nichirin-pill');
    bladeBtn2.click();
    assert.equal(ceEditor.textContent, '/compact', 'Phải điền /compact vào [contenteditable="true"]');

    env.clock.advanceBy(210);
    assert.equal(optClicks, 1, 'Khi có menu slash [role="listbox"] mở, bước 200ms phải chọn option /compact');
    env.clock.advanceBy(270);
    assert.deepEqual(cePayloads, ['/compact'], 'Sau khi chọn option slash mà editor còn /compact, bước 460ms phải gửi qua nút Send');
    env.clock.advanceBy(450);
    assert.equal(hud.getCompactState().inFlight, false);
  });

  it('F13-T2-12 [COMPACT-AUTO-DISABLED]: Tự động nén 380K bị tắt cứng (kể cả khi localStorage cũ = \'1\'), không tự bắn /compact và không bật compactReady', () => {
    env = createKnyVmEnv();
    const { composer, editor, sendBtn } = env.buildStandardIdeDom();
    env.localStorage.setItem('agy_auto_compact_380k_v1', '1');
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const cidLive = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
    env.sandbox.location.pathname = `/c/${cidLive}`;

    const bar = hud.mountTokenHud(composer, {});
    const bladeBtn = bar.querySelector('.agy-nichirin-pill');

    const autoSent = [];
    sendBtn.addEventListener('click', () => {
      autoSent.push(editor.value);
      editor.value = '';
    });

    assert.equal(hud.isAutoCompactEnabled(), false, 'Phải ép tắt cứng tự động nén dù localStorage cũ lưu "1"');
    assert.equal(env.localStorage.getItem('agy_auto_compact_380k_v1'), '0', 'Phải tự ghi đè localStorage về "0"');
    assert.equal(bladeBtn.dataset.autoCompact, '0', 'Nút thanh kiếm phải có data-auto-compact="0"');

    // Tăng dần ngữ cảnh qua 200K -> 382K -> 395K -> 410K dù AI rảnh & ô chat trống -> tuyệt đối không tự bắn
    hud.ingestTelemetrySnapshot({ ok: true, cid: cidLive, contextTokens: 200000, turnCount: 1, stepCount: 2, isWorking: false });
    hud.ingestTelemetrySnapshot({ ok: true, cid: cidLive, contextTokens: 382000, turnCount: 2, stepCount: 4, isWorking: true });
    hud.ingestTelemetrySnapshot({ ok: true, cid: cidLive, contextTokens: 395000, turnCount: 2, stepCount: 5, isWorking: false });
    hud.ingestTelemetrySnapshot({ ok: true, cid: cidLive, contextTokens: 410000, turnCount: 3, stepCount: 6, isWorking: false });
    env.clock.advanceBy(5000);

    assert.equal(autoSent.length, 0, 'Vượt 380K không được tự động gửi /compact');
    assert.equal(bladeBtn.dataset.compactReady, undefined, 'Không được bật data-compact-ready="1"');
    assert.equal(hud.getCompactState().enabled, false);
    assert.equal(hud.getCompactState().pending, false);

    const autoRes = hud.triggerCompact({ source: 'auto' });
    assert.equal(autoRes.ok, false, 'Gọi trực tiếp source="auto" phải bị từ chối');
    assert.equal(autoRes.reason, 'disabled', 'Gọi trực tiếp source="auto" phải trả về reason="disabled"');
    assert.equal(hud.setAutoCompactEnabled(true, { silent: true }), false, 'setAutoCompactEnabled(true) vẫn phải trả về false');
    env.clock.advanceBy(3000);
    assert.equal(autoSent.length, 0, 'Sau khi gọi setAutoCompactEnabled(true) vẫn không được tự bắn /compact');
  });

  it('F13-T2-13 [COMPACT-MANUAL-POPOVER-CLEANUP]: Shift+Click không bật tự nén, nén tay hoạt động, Popover Tiếng Việt 100% & teardown sạch timer', () => {
    env = createKnyVmEnv();
    const { composer, editor, sendBtn } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const cid = 'ffffffff-6666-4666-8666-ffffffffffff';
    env.sandbox.location.pathname = `/c/${cid}`;

    const bar = hud.mountTokenHud(composer, {});
    const bladeBtn = bar.querySelector('.agy-nichirin-pill');

    const sent = [];
    sendBtn.addEventListener('click', () => {
      sent.push(editor.value);
      editor.value = '';
    });

    assert.equal(hud.isAutoCompactEnabled(), false, 'Mặc định phải tắt tự động nén');
    assert.equal(bladeBtn.dataset.autoCompact, '0');

    // Shift+Click mở Popover (không bật lại tự nén) & contextmenu không bật tự nén
    bladeBtn.dispatchEvent(new env.MiniEvent('click', { bubbles: true, shiftKey: true }));
    assert.equal(hud.isAutoCompactEnabled(), false, 'Shift+Click không được bật lại tự nén');
    assert.equal(bar.dataset.open, '1', 'Shift+Click trên thanh kiếm mở Popover xem thông số');
    bladeBtn.dispatchEvent(new env.MiniEvent('contextmenu', { bubbles: true, cancelable: true }));
    assert.equal(hud.isAutoCompactEnabled(), false, 'Chuột phải không được bật lại tự nén');
    assert.equal(env.localStorage.getItem('agy_auto_compact_380k_v1'), '0');

    // Đạt 400K: không tự bắn, nhưng click thường vào thanh kiếm vẫn nén tay thành công
    hud.ingestTelemetrySnapshot({ ok: true, cid, contextTokens: 400000, isWorking: false });
    env.clock.advanceBy(2500);
    assert.equal(sent.length, 0, 'Khi đạt 400K không được tự động gửi /compact');
    assert.equal(bladeBtn.dataset.compactReady, undefined);

    bladeBtn.click();
    env.clock.advanceBy(950);
    assert.deepEqual(sent, ['/compact'], 'Click thường vào thanh kiếm vẫn kích tay gửi /compact được');

    // Kiểm tra Popover Tiếng Việt 100% sạch từ cấm
    const ctxBtn = bar.querySelector('.agy-tok-ctx-pill');
    if (bar.dataset.open !== '1') ctxBtn.click();
    assert.equal(bar.dataset.open, '1');
    const popTxt = bar.textContent;
    assert.ok(popTxt.includes('Nén phiên (/compact):'), 'Popover phải hiển thị hàng trạng thái Nén phiên (/compact)');
    assert.ok(popTxt.includes('Tự động nén: Đã tắt'), 'Popover phải hiển thị rõ Tự động nén: Đã tắt');
    assert.equal(/\b(?:cache|tok)\b|SSE\s*<30ms|Antigravity Agent/i.test(popTxt), false, 'Popover phải 100% Tiếng Việt sạch từ cấm');

    // Mount mới, bấm nén tay rồi teardown() giữa lúc compactStepTimers đang chờ -> 0 timer rò rỉ
    hud.teardown();
    const { composer: comp2 } = env.buildStandardIdeDom();
    const bar2 = hud.mountTokenHud(comp2, {});
    bar2.querySelector('.agy-nichirin-pill').click();
    env.clock.advanceBy(100);
    hud.teardown();
    const st2 = env.clock.getStats();
    assert.equal(st2.activeTimeouts + st2.activeIntervals + st2.activeRafs, 0, 'teardown() giữa compactStepTimers không được sót timer');
  });

  it('F13-T2-14 [COMPACT-AUDIT-HARDENING]: Chống nhầm nút HTML5 submit, popup fixed offsetParent=null, chống double-send, không tự nén khi re-mount/visible & silent-failure khi nén tay', () => {
    env = createKnyVmEnv();
    const { composer, editor, sendBtn } = env.buildStandardIdeDom();

    // 1. Nút decoy đứng trước nút Send thật: mô phỏng HTML5 default button.type === 'submit' (không có attr type="submit")
    const attachDecoyBtn = env.document.createElement('button');
    attachDecoyBtn.type = 'submit';
    attachDecoyBtn.setAttribute('aria-label', 'Attach file');
    let decoyClicks = 0;
    attachDecoyBtn.addEventListener('click', () => { decoyClicks++; });
    composer.insertBefore(attachDecoyBtn, sendBtn);

    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const cid = '99999999-9999-4999-8999-999999999999';
    env.sandbox.location.pathname = `/c/${cid}`;
    const bar = hud.mountTokenHud(composer, {});
    const bladeBtn = bar.querySelector('.agy-nichirin-pill');

    // Chống gửi đúp khi Send là async (disable nút ngay tại click, nhưng >460ms mới xóa editor)
    let sendClicks = 0;
    let enterFallbacks = 0;
    sendBtn.addEventListener('click', () => {
      sendClicks++;
      sendBtn.disabled = true; // IPC đang chạy
    });
    editor.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') enterFallbacks++;
    });

    bladeBtn.click();
    env.clock.advanceBy(500);
    assert.equal(decoyClicks, 0, 'Không được click nhầm nút Attach có HTML5 default type=submit');
    assert.equal(sendClicks, 1, 'Phải click đúng nút Send thật');
    assert.equal(enterFallbacks, 0, 'Khi nút Send đã chuyển sang disabled (async IPC), bước 460ms KHÔNG được bắn Enter gây gửi đúp');

    // Dọn editor như khi IPC async hoàn tất trước 860ms
    editor.value = '';
    sendBtn.disabled = false;
    env.clock.advanceBy(450);
    assert.equal(hud.getCompactState().failed, false);

    // 2. Popup position: fixed (Radix wrapper) có offsetParent === null nhưng rect > 0
    env.clock.advanceBy(4100);
    const fixedPopper = env.document.createElement('div');
    fixedPopper.setAttribute('data-radix-popper-content-wrapper', '');
    fixedPopper._rect = { left: 100, top: 300, width: 220, height: 140, right: 320, bottom: 440 };
    Object.defineProperty(fixedPopper, 'offsetParent', { get: () => null, configurable: true });
    const fixedOpt = env.document.createElement('div');
    fixedOpt.setAttribute('role', 'option');
    fixedOpt.setAttribute('data-value', 'compact');
    fixedOpt.textContent = '/compact';
    let fixedOptClicks = 0;
    fixedOpt.addEventListener('click', () => {
      fixedOptClicks++;
      fixedPopper.remove();
    });
    fixedPopper.appendChild(fixedOpt);
    env.document.body.appendChild(fixedPopper);

    // Đẩy ngữ cảnh 388K không tự bắn -> khi kích tay phải tìm thấy và click đúng option dù offsetParent === null
    hud.ingestTelemetrySnapshot({ ok: true, cid, contextTokens: 100000, isWorking: false });
    hud.ingestTelemetrySnapshot({ ok: true, cid, contextTokens: 388000, isWorking: false });
    env.clock.advanceBy(2000);
    assert.equal(sendClicks, 1, 'Đạt 388K không được tự bắn');

    sendBtn.addEventListener('click', () => {
      editor.value = '';
      sendBtn.disabled = false;
    });
    bladeBtn.click();
    env.clock.advanceBy(210);
    assert.equal(fixedOptClicks, 1, 'findVisibleSlashCompactOption phải thấy được popup position:fixed (offsetParent=null)');
    env.clock.advanceBy(750);
    assert.equal(sendClicks, 2);

    // 3. Re-mount composer & tab ẩn -> hiện ở 395K tuyệt đối không tự bắn /compact
    composer.remove();
    const { composer: compSplit, editor: edSplit, sendBtn: sendSplit } = env.buildStandardIdeDom();
    let splitSends = 0;
    sendSplit.addEventListener('click', () => { splitSends++; edSplit.value = ''; });
    const barSplit = hud.mountTokenHud(compSplit, {});
    env.document.hidden = true;
    hud.ingestTelemetrySnapshot({ ok: true, cid, contextTokens: 395000, turnCount: 5, stepCount: 10, isWorking: false });
    env.clock.advanceBy(2500);
    env.document.hidden = false;
    env.document.dispatchEvent(new env.MiniEvent('visibilitychange'));
    env.clock.advanceBy(2500);
    assert.equal(splitSends, 0, 'Re-mount và chuyển tab từ ẩn sang hiện ở 395K tuyệt đối không tự bắn /compact');
    assert.ok(barSplit.isConnected);

    // 4. Silent-failure khi kích tay trên composer không có nút Send
    compSplit.remove();
    const { composer: stuckComp, editor: stuckEd } = env.buildStandardIdeDom();
    stuckComp.querySelector('button[aria-label="Gửi tin nhắn"]').remove();
    const barStuck = hud.mountTokenHud(stuckComp, {});
    const bladeBtnStuck = barStuck.querySelector('.agy-nichirin-pill');
    bladeBtnStuck.click();
    env.clock.advanceBy(900);
    assert.equal(stuckEd.value, '/compact', 'Khi kích tay mà thiếu nút Send phải giữ /compact trong ô chat');
    assert.equal(hud.getCompactState().failed, true, 'Khi /compact còn kẹt trong ô chat sau 860ms phải đánh dấu failed=true');
    assert.equal(hud.getCompactState().disarmed, false);
    barStuck.querySelector('.agy-tok-ctx-pill').click();
    assert.ok(barStuck.textContent.includes('Cần nhấn Enter để hoàn tất /compact'), 'Popover phải báo rõ trạng thái cần nhấn Enter');
  });

  it('F13-T2-15 [COMPACT-LEXICAL-ASYNC]: Chống nhân 4 (/compact/compact...) trên Lexical async, chọn option aria-activedescendant, khóa an toàn exact-match & single fallback paste', async () => {
    env = createKnyVmEnv();
    const { composer, editor, sendBtn } = env.buildStandardIdeDom();
    editor.remove();

    const ceEditor = env.document.createElement('div');
    ceEditor.setAttribute('contenteditable', 'true');
    ceEditor.setAttribute('role', 'combobox');
    ceEditor.setAttribute('aria-autocomplete', 'list');
    ceEditor.setAttribute('aria-expanded', 'false');
    ceEditor.setAttribute('data-lexical-editor', 'true');
    composer.insertBefore(ceEditor, sendBtn);

    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const cid = 'aaaaaaaa-1234-4123-8123-aaaaaaaaaaaa';
    env.sandbox.location.pathname = `/c/${cid}`;
    const bar = hud.mountTokenHud(composer, {});
    const bladeBtn = bar.querySelector('.agy-nichirin-pill');

    // Bộ đếm mô phỏng Lexical: mỗi sự kiện chèn mà bị kích hoạt sẽ nối chuỗi như ngoài đời thật
    let execCalls = 0;
    let beforeInputCalls = 0;
    let pasteCalls = 0;
    let sendClicks = 0;
    let enterCount = 0;
    const sentPayloads = [];
    let execMode = 'async_append';

    class MockDataTransfer {
      constructor() { this._map = new Map(); }
      setData(k, v) { this._map.set(String(k), String(v)); }
      getData(k) { return this._map.get(String(k)) || ''; }
    }
    class MockClipboardEvent extends env.MiniEvent {
      constructor(type, init = {}) {
        super(type, init);
        this.clipboardData = init.clipboardData || new MockDataTransfer();
      }
    }
    env.sandbox.DataTransfer = MockDataTransfer;
    env.sandbox.ClipboardEvent = MockClipboardEvent;

    let activePopup = null;
    let activeOptClicks = 0;

    ceEditor.addEventListener('beforeinput', (ev) => {
      beforeInputCalls++;
      if (execMode === 'async_append' && ev && ev.data) {
        ceEditor.textContent += ev.data;
      }
    });
    ceEditor.addEventListener('paste', (ev) => {
      pasteCalls++;
      const txt = ev && ev.clipboardData ? ev.clipboardData.getData('text/plain') : '';
      if (txt) ceEditor.textContent += txt;
    });
    ceEditor.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') enterCount++;
    });
    sendBtn.addEventListener('click', () => {
      sendClicks++;
      sentPayloads.push(ceEditor.textContent);
      ceEditor.textContent = '';
    });

    env.document.execCommand = (cmd, ui, val) => {
      if (cmd !== 'insertText') return false;
      execCalls++;
      if (execMode === 'async_append') {
        queueMicrotask(() => {
          ceEditor.textContent += String(val || '');
        });
        return false; // Lexical gọi preventDefault() -> execCommand trả về false đồng bộ!
      }
      if (execMode === 'async_with_menu') {
        queueMicrotask(() => {
          ceEditor.textContent += String(val || '');
          activePopup = env.document.createElement('div');
          activePopup.id = 'lex-menu';
          activePopup.setAttribute('role', 'listbox');
          const opt = env.document.createElement('div');
          opt.id = 'lex-opt-compact';
          opt.setAttribute('role', 'option');
          const s1 = env.document.createElement('span');
          s1.textContent = '/compact';
          const s2 = env.document.createElement('span');
          s2.textContent = 'Tóm tắt phiên';
          opt.appendChild(s1);
          opt.appendChild(s2);
          opt.addEventListener('click', () => {
            activeOptClicks++;
            ceEditor.textContent = '';
            ceEditor.setAttribute('aria-expanded', 'false');
            ceEditor.removeAttribute('aria-controls');
            ceEditor.removeAttribute('aria-activedescendant');
            if (activePopup) activePopup.remove();
          });
          activePopup.appendChild(opt);
          env.document.body.appendChild(activePopup);
          ceEditor.setAttribute('aria-expanded', 'true');
          ceEditor.setAttribute('aria-controls', 'lex-menu');
          ceEditor.setAttribute('aria-activedescendant', 'lex-opt-compact');
        });
        return false;
      }
      if (execMode === 'corrupted_duplicate') {
        queueMicrotask(() => {
          ceEditor.textContent = '/compact/compact';
        });
        return false;
      }
      if (execMode === 'noop') {
        return false;
      }
      return false;
    };

    // Kịch bản A: Lexical async chèn đúng 1 lần, không rơi sang beforeinput/paste/textContent
    bladeBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(ceEditor.textContent, '/compact', 'Microtask Lexical chỉ được chèn đúng 1 lần /compact');
    env.clock.advanceBy(80);
    assert.equal(ceEditor.textContent, '/compact', 'Ở mốc 70ms khi đã có /compact thì không được chèn thêm fallback');
    assert.equal(execCalls, 1, 'Chỉ gọi execCommand đúng 1 lần');
    assert.equal(beforeInputCalls, 0, 'Không được bắn thêm beforeinput làm nhân đôi chuỗi');
    assert.equal(pasteCalls, 0, 'Không được bắn thêm paste làm nhân đôi chuỗi');

    env.clock.advanceBy(130); // vượt mốc 200ms
    assert.deepEqual(sentPayloads, ['/compact'], 'Phải gửi duy nhất 1 lệnh /compact');
    env.clock.advanceBy(700);
    assert.equal(hud.getCompactState().inFlight, false);
    assert.equal(hud.getCompactState().failed, false);

    // Kịch bản B: Combobox aria-expanded + aria-activedescendant + span ghép sát (<span>/compact</span><span>Tóm tắt phiên</span>)
    env.clock.advanceBy(4100);
    execMode = 'async_with_menu';
    bladeBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    env.clock.advanceBy(210);
    assert.equal(activeOptClicks, 1, 'Phải nhận diện & click đúng option #lex-opt-compact qua aria-activedescendant & span con');
    assert.equal(sendClicks, 1, 'Option slash đã xử lý xong thì không được bấm nhầm nút Send thêm lần nữa');
    env.clock.advanceBy(700);
    assert.equal(hud.getCompactState().failed, false);
    assert.equal(hud.getCompactState().inFlight, false);

    // Kịch bản C: Hard Exact-Command Safety Guard chặn đứng chuỗi bị lặp (/compact/compact)
    env.clock.advanceBy(4100);
    execMode = 'corrupted_duplicate';
    bladeBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    env.clock.advanceBy(950);
    assert.equal(sendClicks, 1, 'Khi text khác /compact (vd /compact/compact), tuyêt đối không được bấm Send');
    assert.equal(enterCount, 0, 'Khi text khác /compact, tuyệt đối không được gửi Enter');
    assert.equal(hud.getCompactState().failed, true, 'Phải đánh dấu failed=true khi chặn lệnh lỗi');
    const echoText = env.document.querySelector('#agy-yoriichi-msg-echo .agy-echo-text').textContent;
    assert.ok(echoText.includes('không khớp /compact'), 'Phải báo Echo cảnh báo tiếng Việt khi chặn lệnh sai');

    // Kịch bản D: Single fallback paste ở T=70ms khi execCommand hoàn toàn không chèn gì
    ceEditor.textContent = '';
    env.clock.advanceBy(4100);
    execMode = 'noop';
    bladeBtn.click();
    await Promise.resolve();
    assert.equal(ceEditor.textContent, '', 'Trước 70ms khi execCommand noop thì ô chat vẫn trống');
    env.clock.advanceBy(80);
    assert.equal(pasteCalls, 1, 'Ở mốc 70ms phải kích hoạt đúng 1 lần fallback paste');
    assert.equal(ceEditor.textContent, '/compact', 'Fallback paste phải điền đúng 1 chuỗi /compact');
    env.clock.advanceBy(820);
    assert.deepEqual(sentPayloads, ['/compact', '/compact'], 'Sau fallback paste phải gửi chính xác 1 lệnh /compact');
    assert.equal(hud.getCompactState().failed, false);
  });
});

/* ============================================================================
 * SUITE 3 — F14: MẶT NẠ CÁO UROKODAKI, KHIÊN CHE MẬT & TRAILER 15s (6 + 6)
 * ============================================================================ */

describe('F14: Mặt Nạ Cáo Urokodaki, Khiên Che Mật & Đạo Diễn Trailer 15s', () => {
  let env = null;
  afterEach(() => {
    if (env) {
      try { env.sandbox.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__?.({ isReinject: false }); } catch (_) {}
      try { env.sandbox.__AGY_CINEMA_DIRECTOR__?.teardown({ isReinject: false }); } catch (_) {}
      try { env.sandbox.__AGY_TOKEN_HUD__?.teardown(); } catch (_) {}
      try { env.sandbox.__AGY_SQUAD_RAID__?.teardown(); } catch (_) {}
      try { env.sandbox.__AGY_KNY_SKILLS__?.destroy(); } catch (_) {}
      env = null;
    }
  });

  // --- Tier 1 ---
  it('F14-T1-01: Mặt nạ Cáo Urokodaki — Click mở/đóng Panel, Shift+Click/Chuột phải bật tắt nhanh Khiên Che Mật', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    const bar = hud.mountTokenHud(composer, {});
    const maskBtn = bar.querySelector('.agy-cinema-mask-btn');

    maskBtn.click();
    assert.ok(env.document.getElementById('agy-cinema-director-panel'), 'Click Mặt Nạ Cáo phải mở #agy-cinema-director-panel');
    maskBtn.click();
    assert.equal(env.document.getElementById('agy-cinema-director-panel'), null, 'Click lại Mặt Nạ Cáo phải đóng panel');

    maskBtn.dispatchEvent(new env.MiniEvent('click', { bubbles: true, shiftKey: true }));
    assert.equal(dir.isPrivacyShieldActive(), true, 'Shift+Click phải bật Khiên Che Mật');
    assert.equal(env.document.documentElement.dataset.agyPrivacyShield, '1');
    assert.equal(maskBtn.dataset.active, '1');
    assert.ok(env.document.getElementById('agy-cinema-privacy-badge'));

    maskBtn.dispatchEvent(new env.MiniEvent('contextmenu', { bubbles: true, cancelable: true }));
    assert.equal(dir.isPrivacyShieldActive(), false, 'Chuột phải phải tắt Khiên Che Mật');
    assert.equal(env.document.documentElement.dataset.agyPrivacyShield, undefined);
    assert.equal(maskBtn.dataset.active, undefined);
  });

  it('F14-T1-02: Phím tắt Alt+Shift+P che node nhạy cảm & bỏ qua panel/HUD; công tắc Che Nghiêm Ngặt', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    const secretCode = env.document.createElement('code');
    secretCode.textContent = 'http://localhost:3000/api?key=sk-abc1234567890abcdef12345';
    env.document.body.appendChild(secretCode);

    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js']);
    const bar = env.sandbox.__AGY_TOKEN_HUD__.mountTokenHud(composer, {});
    const hudCode = env.document.createElement('code');
    hudCode.textContent = 'http://127.0.0.1:49999/safe';
    bar.appendChild(hudCode);

    env.sandbox.dispatchEvent(new env.MiniEvent('keydown', { code: 'KeyP', key: 'P', altKey: true, shiftKey: true, cancelable: true }));
    assert.equal(env.sandbox.__AGY_CINEMA_DIRECTOR__.isPrivacyShieldActive(), true);
    assert.equal(secretCode.dataset.agySensitiveMasked, '1', 'Node chứa secret/localhost ngoài HUD phải được gắn data-agy-sensitive-masked="1"');
    assert.equal(hudCode.dataset.agySensitiveMasked, undefined, 'Node nằm trong HUD không được bị che');

    // Mở panel và bật công tắc strictRedact (switch thứ 2 trong panel)
    env.sandbox.__AGY_CINEMA_DIRECTOR__.openPanel(bar.querySelector('.agy-cinema-mask-btn'));
    const panel = env.document.getElementById('agy-cinema-director-panel');
    const switches = panel.querySelectorAll('button[role="switch"]');
    assert.ok(switches.length >= 2, 'Panel phải có công tắc Khiên Che Mật và Che Nghiêm Ngặt');
    switches[1].click();
    assert.equal(switches[1].getAttribute('aria-checked'), 'true');
    assert.equal(env.document.documentElement.dataset.agyPrivacyStrict, '1', 'Bật strictRedact phải đặt data-agy-privacy-strict="1"');
    const savedPrefs = JSON.parse(env.localStorage.getItem('agy_kny_cinema_prefs'));
    assert.equal(savedPrefs.strictRedact, true);
  });

  it('F14-T1-03: Phím tắt Alt+Shift+C chạy Trailer 15s (4 Hồi) và bảo toàn nguyên vẹn customWp & bladeBonusHeat', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    const bioSpy = attachBioAudioSpy(env);
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js', 'core.js']);

    const core = env.sandbox.__AGY_THEME_CORE__;
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;

    core.applyTheme({ themeName: 'Midnight Obsidian', bubbleName: 'Midnight Obsidian', customWp: 'data:image/png;base64,AAAA' });
    hud.mountTokenHud(composer, {});
    hud.setBladeBonusHeat(35);

    env.sandbox.dispatchEvent(new env.MiniEvent('keydown', { code: 'KeyC', key: 'C', altKey: true, shiftKey: true, cancelable: true }));
    assert.equal(dir.isShowcaseRunning(), true, 'Alt+Shift+C phải khởi chạy Trailer 15s');

    // Hồi I (20ms -> Shinobu)
    env.clock.advanceBy(50);
    assert.ok(env.document.getElementById('agy-cinema-stage-banner').textContent.includes('CẢNH I'));
    assert.ok(core.getEffectiveState().themeName.includes('Shinobu'));

    // Hồi II (4000ms -> 5 Hashira + Red Blade 100%)
    env.clock.advanceBy(4000);
    assert.ok(env.document.getElementById('agy-cinema-red-blade-crest'), 'Hồi II phải hiện huy hiệu Đỏ Hách Đao');
    assert.equal(hud.getBladeBonusHeat(), 100, 'Hồi II phải nung bladeBonusHeat lên 100%');

    // Hồi III (8000ms -> Yoriichi)
    env.clock.advanceBy(4000);
    assert.ok(env.document.getElementById('agy-cinema-stage-banner').textContent.includes('CẢNH III'));
    assert.ok(env.document.querySelector('agy-skill-vfx .agy-kny-sub').textContent.includes('Yoriichi'));

    // Hồi IV (13000ms -> Ấn 「滅」 + tra kiếm)
    env.clock.advanceBy(5000);
    assert.ok(env.document.getElementById('agy-cinema-metsu-seal'), 'Hồi IV phải đóng ấn 「滅」');
    assert.ok(bioSpy.playNichirinSheathe.some((o) => o && o.force === true), 'Hồi IV phải gọi playNichirinSheathe({ force: true })');

    // Kết thúc 15000ms -> khôi phục nguyên vẹn
    env.clock.advanceBy(2100);
    assert.equal(dir.isShowcaseRunning(), false);
    assert.equal(core.getState().themeName, 'Midnight Obsidian', 'Theme gốc phải được bảo toàn sau Trailer');
    assert.equal(core.getState().customWp, 'data:image/png;base64,AAAA', 'customWp phải được bảo toàn 100%');
    assert.equal(hud.getBladeBonusHeat(), 35, 'bladeBonusHeat ban đầu (35) phải được khôi phục');
    assert.equal(env.document.getElementById('agy-cinema-stage-banner'), null);
    assert.equal(env.document.getElementById('agy-cinema-metsu-seal'), null);
    assert.equal(env.document.getElementById('agy-cinema-red-blade-crest'), null);
  });

  it('F14-T1-04: Hủy Trailer giữa chừng bằng Escape khôi phục theme, customWp, nhiệt Hách Đao & Khiên', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js', 'core.js']);

    const core = env.sandbox.__AGY_THEME_CORE__;
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;

    core.applyTheme({ themeName: 'Midnight Obsidian', customWp: 'data:image/png;base64,BBBB' });
    hud.mountTokenHud(composer, {});
    hud.setBladeBonusHeat(25);
    assert.equal(dir.isPrivacyShieldActive(), false);

    dir.startShowcase();
    env.clock.advanceBy(4500); // Giữa Hồi II, autoShield đang tự bật
    assert.equal(dir.isPrivacyShieldActive(), true);

    env.sandbox.dispatchEvent(new env.MiniEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(dir.isShowcaseRunning(), false, 'Phím Escape phải hủy Trailer ngay');
    assert.equal(core.getState().customWp, 'data:image/png;base64,BBBB');
    assert.equal(hud.getBladeBonusHeat(), 25);
    assert.equal(dir.isPrivacyShieldActive(), false, 'Hủy bằng Escape phải trả Khiên về đúng trạng thái false ban đầu');
  });

  it('F14-T1-05: Tùy chọn keepShieldAfter giữ Khiên sau 15s nhưng Escape hủy sớm vẫn trả Khiên về false', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    env.localStorage.setItem('agy_kny_cinema_prefs', JSON.stringify({ strictRedact: false, autoShield: true, keepShieldAfter: true }));
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js', 'core.js']);
    env.sandbox.__AGY_TOKEN_HUD__.mountTokenHud(composer, {});
    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;

    dir.startShowcase();
    env.clock.advanceBy(15100);
    assert.equal(dir.isPrivacyShieldActive(), true, 'keepShieldAfter=true phải giữ Khiên bật sau khi Trailer chạy hết 15s');

    dir.togglePrivacyShield(false);
    dir.startShowcase();
    env.clock.advanceBy(5000);
    env.sandbox.dispatchEvent(new env.MiniEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(dir.isPrivacyShieldActive(), false, 'Dù keepShieldAfter=true, bấm Escape hủy sớm vẫn phải trả Khiên về false');
  });

  it('F14-T1-06: Độc quyền Popover — mở Panel Cinema Director tự đóng Popover Bio Audio & Token HUD', () => {
    env = createKnyVmEnv();
    const bioSpy = attachBioAudioSpy(env);
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    const bar = hud.mountTokenHud(composer, {});

    bar.querySelector('.agy-tok-ctx-pill').click();
    assert.equal(bar.dataset.open, '1', 'Popover Token HUD đang mở');

    dir.openPanel(bar.querySelector('.agy-cinema-mask-btn'));
    assert.ok(env.document.getElementById('agy-cinema-director-panel'));
    assert.equal(bar.dataset.open, undefined, 'Mở Cinema Panel phải đóng popover Token HUD');
    assert.ok(bioSpy.closePopover >= 1, 'Mở Cinema Panel phải gọi closePopover() của Bio Audio');
  });

  // --- Tier 2 ---
  it('F14-T2-01: Giữ nguyên trạng thái Khiên Che Mật & strictRedact liền mạch qua isReinject: true', () => {
    env = createKnyVmEnv();
    env.localStorage.setItem('agy_kny_cinema_prefs', JSON.stringify({ strictRedact: true, autoShield: true, keepShieldAfter: false }));
    env.loadModules(['agy_security.js', 'kny_cinema_director.js']);
    const dir1 = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    dir1.togglePrivacyShield(true);
    assert.equal(env.document.documentElement.dataset.agyPrivacyShield, '1');
    assert.equal(env.document.documentElement.dataset.agyPrivacyStrict, '1');

    // Giai đoạn hot-reload
    dir1.destroy({ isReinject: true });
    assert.equal(env.document.documentElement.dataset.agyPrivacyShield, '1', 'destroy({ isReinject: true }) không được xóa data-agy-privacy-shield');
    assert.ok(env.document.getElementById('antigravity-kny-cinema-director-style'), 'destroy({ isReinject: true }) phải giữ thẻ style để không nháy màn hình');

    // Nạp lại module lần 2
    env.loadModule('kny_cinema_director.js');
    const dir2 = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    assert.equal(dir2.isPrivacyShieldActive(), true, 'Bản nạp lại phải tự động khôi phục isPrivacyShieldActive() === true');
    assert.ok(env.document.getElementById('agy-cinema-privacy-badge'), 'Bản nạp lại phải dựng lại badge Khiên Che Mật');
  });

  it('F14-T2-02: Hợp đồng Teardown core.js ↔ kny_cinema_director.js — KHÔNG gây zombie resurrection khi gỡ theme giữa Trailer 15s', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    attachBioAudioSpy(env);
    const { composer } = env.buildStandardIdeDom();
    env.loadModules([
      'agy_security.js',
      'kny_semantic_icons.js',
      'kny_bio_audio.js',
      'kny_fx_modes.js',
      'kny_breathing_skills.js',
      'kny_chibi_aura.js',
      'kny_squad_raid.js',
      'kny_token_hud.js',
      'kny_cinema_director.js',
      'core.js'
    ]);

    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    env.sandbox.__AGY_TOKEN_HUD__.mountTokenHud(composer, {});
    dir.startShowcase();
    env.clock.advanceBy(4500); // Đang giữa Hồi II Trailer 15s
    assert.equal(dir.isShowcaseRunning(), true);

    // Gỡ bỏ toàn phần theme giữa lúc Trailer đang chạy
    env.sandbox.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__({ isReinject: false });

    assert.equal(dir.isShowcaseRunning(), false, 'Sau teardown toàn phần, isShowcaseRunning() phải là false');
    assert.equal(
      env.document.getElementById('antigravity-custom-theme-active'),
      null,
      'Phát hiện Zombie Resurrection: #antigravity-custom-theme-active bị tái tạo sau removeCustomTheme({ isReinject: false }) do core.js/kny_cinema_director.js thiếu guard coreDestroyed'
    );
    assert.equal(
      env.document.getElementById('agy-token-context-bar'),
      null,
      'Phát hiện Zombie Resurrection: #agy-token-context-bar bị tái tạo sau removeCustomTheme giữa Trailer 15s'
    );
    assert.equal(env.document.getElementById('agy-cinema-stage-banner'), null);
    assert.equal(env.document.getElementById('agy-cinema-red-blade-crest'), null);

    // Tua thêm 12s để kiểm chứng không có timer ẩn nào dựng lại DOM
    env.clock.advanceBy(12000);
    assert.equal(env.document.getElementById('antigravity-custom-theme-active'), null, 'Không được tái tạo style sau 12s');
    assert.equal(env.document.getElementById('agy-token-context-bar'), null, 'Không được tái tạo HUD sau 12s');
  });

  it('F14-T2-03: Hủy Trailer bằng Escape trong vùng ranh giới 14.55s–15.0s vẫn bảo toàn customWp & theme gốc', () => {
    env = createKnyVmEnv({ userGestureActive: true });
    attachBioAudioSpy(env);
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js', 'core.js']);

    const core = env.sandbox.__AGY_THEME_CORE__;
    core.applyTheme({ themeName: 'Midnight Obsidian', customWp: 'data:image/png;base64,CCCC' });
    env.sandbox.__AGY_TOKEN_HUD__.mountTokenHud(composer, {});

    env.sandbox.__AGY_CINEMA_DIRECTOR__.startShowcase();
    // Tiến qua mốc 14550ms (14.55s) nhưng chưa tới 15000ms
    env.clock.advanceBy(14650);
    assert.equal(env.sandbox.__AGY_CINEMA_DIRECTOR__.isShowcaseRunning(), true);

    env.sandbox.dispatchEvent(new env.MiniEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(env.sandbox.__AGY_CINEMA_DIRECTOR__.isShowcaseRunning(), false);
    assert.equal(core.getState().themeName, 'Midnight Obsidian');
    assert.equal(core.getState().customWp, 'data:image/png;base64,CCCC', 'Hủy trong khoảng 14.55s-15.0s không được làm mất customWp');
  });

  it('F14-T2-04: Bảo vệ IME và quy tắc macOS Option+Shift trong vùng editable cho phím tắt Alt+Shift+P/C', () => {
    env = createKnyVmEnv({ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' });
    const { editor } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_cinema_director.js']);
    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;

    // IME đang gõ -> bỏ qua
    env.sandbox.dispatchEvent(new env.MiniEvent('keydown', { code: 'KeyP', key: 'P', altKey: true, shiftKey: true, isComposing: true }));
    assert.equal(dir.isPrivacyShieldActive(), false, 'Không được bật Shield khi IME isComposing === true');

    // macOS trong textarea với Alt+Shift+P -> phải bỏ qua để gõ ∏
    editor.dispatchEvent(new env.MiniEvent('keydown', { code: 'KeyP', key: 'P', altKey: true, shiftKey: true, bubbles: true }));
    assert.equal(dir.isPrivacyShieldActive(), false, 'Trên macOS trong vùng editable, Alt+Shift+P không được cướp phím');

    // Nhưng Ctrl+Alt+Shift+P trong textarea trên macOS vẫn hoạt động
    editor.dispatchEvent(new env.MiniEvent('keydown', { code: 'KeyP', key: 'P', ctrlKey: true, altKey: true, shiftKey: true, bubbles: true }));
    assert.equal(dir.isPrivacyShieldActive(), true, 'Ctrl+Alt+Shift+P trên macOS vẫn phải hoạt động trong textarea');
  });

  it('F14-T2-05: MutationObserver Shield quét node mới thêm sau 120ms debounce & destroy({ isReinject: false }) dọn sạch tài nguyên', () => {
    env = createKnyVmEnv();
    env.loadModules(['agy_security.js', 'kny_cinema_director.js']);
    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    dir.togglePrivacyShield(true);

    const lateNode = env.document.createElement('code');
    lateNode.textContent = 'http://127.0.0.1:9999/secret-endpoint';
    env.document.body.appendChild(lateNode);
    env.flushMutations();
    env.clock.advanceBy(150);
    assert.equal(lateNode.dataset.agySensitiveMasked, '1', 'Node nhạy cảm thêm động phải được quét sau debounce 120ms');

    dir.destroy({ isReinject: false });
    assert.equal(env.document.documentElement.dataset.agyPrivacyShield, undefined);
    assert.equal(env.document.documentElement.dataset.agyPrivacyStrict, undefined);
    assert.equal(lateNode.dataset.agySensitiveMasked, undefined);
    assert.equal(env.document.getElementById('antigravity-kny-cinema-director-style'), null);
    assert.equal(env.document.getElementById('agy-cinema-privacy-badge'), null);
    const st = env.clock.getStats();
    assert.equal(st.activeIntervals, 0, 'destroy({ isReinject: false }) phải dừng toàn bộ interval');
    assert.equal(st.activeTimeouts, 0, 'destroy({ isReinject: false }) phải dừng toàn bộ timeout');
  });

  it('F14-T2-06: Nút dự phòng #agy-cinema-hud-btn tự nhường chỗ cho HUD chính & chịu lỗi localStorage JSON hỏng', () => {
    env = createKnyVmEnv();
    env.localStorage.setItem('agy_kny_cinema_prefs', '{json_hong_khong_parse_duoc');
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js']);

    env.sandbox.__AGY_TOKEN_HUD__.mountTokenHud(composer, {});
    env.clock.advanceBy(1600);
    assert.equal(env.document.getElementById('agy-cinema-hud-btn'), null, 'Không được tạo trùng #agy-cinema-hud-btn khi HUD đã có nút Mặt Nạ Cáo');
    assert.equal(env.document.querySelectorAll('[data-agy-cinema-trigger="1"]').length, 1);
  });

  it('F14-T2-07: CSS ấn 「滅」 tôn trọng @media (prefers-reduced-motion: no-preference) & reinject riêng lẻ giữ nguyên hợp đồng', () => {
    const cleanupVm = (vmEnv) => {
      if (!vmEnv) return;
      try { vmEnv.sandbox.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__?.({ isReinject: false }); } catch (_) {}
      try { vmEnv.sandbox.__AGY_TOKEN_HUD__?.teardown(); } catch (_) {}
      try { vmEnv.sandbox.__AGY_CINEMA_DIRECTOR__?.teardown({ isReinject: false }); } catch (_) {}
    };

    // Kịch bản 1: Reinject riêng lẻ giữa Hồi III có HUD khi trước showcase Khiên Che Mật đang TẮT (autoShield: true mặc định)
    env = createKnyVmEnv({ userGestureActive: true });
    attachBioAudioSpy(env);
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js', 'core.js']);

    const core = env.sandbox.__AGY_THEME_CORE__;
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    core.applyTheme({
      themeName: 'Midnight Obsidian',
      bubbleName: 'Midnight Obsidian',
      customWp: 'data:image/png;base64,REINJECT_ISOLATED_WP'
    });
    hud.mountTokenHud(composer, {});
    hud.setBladeBonusHeat(30);

    const styleEl = env.document.getElementById('antigravity-kny-cinema-director-style');
    assert.ok(styleEl, 'Phải chèn #antigravity-kny-cinema-director-style');
    const css = styleEl.textContent;
    assert.ok(
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)\s*\{[\s\S]*#agy-cinema-metsu-seal\s*\{[\s\S]*animation\s*:/i.test(css),
      'Animation của #agy-cinema-metsu-seal phải nằm trong @media (prefers-reduced-motion: no-preference)'
    );

    assert.equal(dir.isPrivacyShieldActive(), false, 'Trước showcase Khiên Che Mật đang TẮT');
    // Chạy trailer tới Hồi III (đã qua transient theme, autoShield bật tạm Khiên & bladeBonusHeat = 100) rồi reinject riêng lẻ kny_cinema_director.js
    dir.startShowcase();
    env.clock.advanceBy(8200);
    assert.equal(hud.getBladeBonusHeat(), 100);
    assert.equal(dir.isPrivacyShieldActive(), true, 'Trong Trailer autoShield: true tự bật tạm Khiên Che Mật');
    assert.notEqual(core.getEffectiveState().themeName, 'Midnight Obsidian', 'Giữa Hồi III theme hiệu lực phải đang là transient theme của Trailer');
    assert.equal(core.getEffectiveState().customWp, '', 'Giữa Hồi III transient theme tạm ẩn customWp');

    // Nạp lại riêng lẻ kny_cinema_director.js giống hot-reload (IIFE tự gọi destroy({ isReinject: true }) trên bản cũ)
    env.loadModule('kny_cinema_director.js');
    const dir2 = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    assert.equal(dir2.isShowcaseRunning(), false, 'Sau reinject riêng lẻ, isShowcaseRunning() của instance mới phải là false');
    assert.equal(hud.getBladeBonusHeat(), 30, 'Reinject riêng lẻ cinema_director khi HUD còn sống phải khôi phục bladeBonusHeat về 30');
    assert.equal(core.getEffectiveState().themeName, 'Midnight Obsidian', 'Reinject riêng lẻ cinema_director phải khôi phục themeName hiệu lực về theme gốc');
    assert.equal(core.getEffectiveState().customWp, 'data:image/png;base64,REINJECT_ISOLATED_WP', 'Reinject riêng lẻ cinema_director phải khôi phục customWp hiệu lực về hình nền gốc');
    assert.equal(core.getState().themeName, 'Midnight Obsidian');
    assert.equal(core.getState().customWp, 'data:image/png;base64,REINJECT_ISOLATED_WP');
    assert.equal(dir2.isPrivacyShieldActive(), false, 'Khi trước showcase Khiên đang TẮT (autoShield: true), reinject không được làm kẹt BẬT Khiên Che Mật');
    assert.equal(env.document.documentElement.dataset.agyPrivacyShield, undefined, 'data-agy-privacy-shield phải được xóa khi trước showcase Khiên đang TẮT');
    cleanupVm(env);

    // Kịch bản 2: Reinject riêng lẻ giữa Trailer khi KHÔNG có #agy-token-context-bar (chưa mount HUD)
    env = createKnyVmEnv({ userGestureActive: true });
    attachBioAudioSpy(env);
    env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_squad_raid.js', 'kny_cinema_director.js', 'core.js']);

    const coreNoHud = env.sandbox.__AGY_THEME_CORE__;
    const dirNoHud1 = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    coreNoHud.applyTheme({
      themeName: 'Midnight Obsidian',
      bubbleName: 'Midnight Obsidian',
      customWp: 'data:image/png;base64,NO_HUD_ISOLATED_WP'
    });
    assert.equal(env.document.getElementById('agy-token-context-bar'), null, 'Xác nhận chưa mount #agy-token-context-bar');

    dirNoHud1.startShowcase();
    env.clock.advanceBy(4500);
    assert.notEqual(coreNoHud.getEffectiveState().themeName, 'Midnight Obsidian', 'Giữa Trailer (không HUD) đang chạy transient theme');
    assert.equal(coreNoHud.getEffectiveState().customWp, '');

    env.loadModule('kny_cinema_director.js');
    const dirNoHud2 = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    assert.equal(dirNoHud2.isShowcaseRunning(), false);
    assert.equal(coreNoHud.getEffectiveState().themeName, 'Midnight Obsidian', 'Không có HUD vẫn phải khôi phục themeName hiệu lực gốc khi reinject');
    assert.equal(coreNoHud.getEffectiveState().customWp, 'data:image/png;base64,NO_HUD_ISOLATED_WP', 'Không có HUD vẫn phải khôi phục customWp hiệu lực gốc khi reinject');
    assert.equal(dirNoHud2.isPrivacyShieldActive(), false, 'Không có HUD và trước showcase Khiên TẮT -> sau reinject Khiên phải là false');
    assert.equal(env.document.documentElement.dataset.agyPrivacyShield, undefined);
    cleanupVm(env);

    // Kịch bản 3: Reinject riêng lẻ giữa Trailer khi trước showcase Khiên Che Mật đang BẬT -> vẫn giữ Khiên Che Mật
    env = createKnyVmEnv({ userGestureActive: true });
    attachBioAudioSpy(env);
    env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_squad_raid.js', 'kny_cinema_director.js', 'core.js']);

    const coreShieldOn = env.sandbox.__AGY_THEME_CORE__;
    const dirShieldOn1 = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    coreShieldOn.applyTheme({
      themeName: 'Midnight Obsidian',
      bubbleName: 'Midnight Obsidian',
      customWp: 'data:image/png;base64,SHIELD_ON_ISOLATED_WP'
    });
    dirShieldOn1.togglePrivacyShield(true);
    assert.equal(dirShieldOn1.isPrivacyShieldActive(), true);
    assert.equal(env.document.documentElement.dataset.agyPrivacyShield, '1');

    dirShieldOn1.startShowcase();
    env.clock.advanceBy(4500);
    env.loadModule('kny_cinema_director.js');
    const dirShieldOn2 = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    assert.equal(dirShieldOn2.isShowcaseRunning(), false);
    assert.equal(coreShieldOn.getEffectiveState().themeName, 'Midnight Obsidian');
    assert.equal(coreShieldOn.getEffectiveState().customWp, 'data:image/png;base64,SHIELD_ON_ISOLATED_WP');
    assert.equal(dirShieldOn2.isPrivacyShieldActive(), true, 'Trước showcase Khiên đang BẬT -> sau reinject giữa Trailer phải giữ Khiên BẬT');
    assert.equal(env.document.documentElement.dataset.agyPrivacyShield, '1');
    assert.ok(env.document.getElementById('agy-cinema-privacy-badge'), 'Phải dựng lại badge Khiên Che Mật khi giữ Khiên');
  });

  it('F14-T2-08 [BUG-HUD-01/02]: hud.teardown() hoặc composer.remove() giữa Trailer không được ghi ngược dataset.agyRedBlade thành "1"', () => {
    // Kịch bản 1A (PROBE-2B): hud.teardown() ở mốc 2000ms giữa startShowcase() (không có core.js tự mount lại)
    env = createKnyVmEnv({ userGestureActive: true });
    attachBioAudioSpy(env);
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js']);

    const hud1 = env.sandbox.__AGY_TOKEN_HUD__;
    const dir1 = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    hud1.mountTokenHud(composer, {});
    dir1.startShowcase();
    env.clock.advanceBy(2000);
    hud1.teardown();
    assert.equal(env.document.getElementById('agy-token-context-bar'), null);
    assert.equal(env.document.documentElement.dataset.agyRedBlade, undefined);

    // Advance qua Hồi II (4000ms) -> 4500ms: không được ghi lại dataset.agyRedBlade
    env.clock.advanceBy(2500);
    assert.equal(env.document.documentElement.dataset.agyRedBlade, undefined, 'Sau hud.teardown() giữa Trailer, dataset.agyRedBlade không được bật lại');
    hud1.setBladeBonusHeat(100);
    assert.equal(env.document.documentElement.dataset.agyRedBlade, undefined, 'Gọi trực tiếp setBladeBonusHeat(100) sau teardown không được ghi dataset.agyRedBlade');
    dir1.stopShowcase(false);

    // Kịch bản 1B (đủ core.js): hud.teardown() ở mốc 3500ms ngay trước Hồi II (4000ms)
    try { env.sandbox.__AGY_CINEMA_DIRECTOR__?.teardown({ isReinject: false }); } catch (_) {}
    env = createKnyVmEnv({ userGestureActive: true });
    attachBioAudioSpy(env);
    const { composer: composer1b } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js', 'core.js']);
    const hud1b = env.sandbox.__AGY_TOKEN_HUD__;
    const dir1b = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    hud1b.mountTokenHud(composer1b, {});
    dir1b.startShowcase();
    env.clock.advanceBy(3500);
    hud1b.teardown();
    env.clock.advanceBy(1000);
    assert.equal(env.document.documentElement.dataset.agyRedBlade, undefined, 'Sau hud.teardown() ở 3500ms (có core.js), Hồi II 4000ms không được ghi dataset.agyRedBlade');
    dir1b.stopShowcase(false);

    // Kịch bản 2 (PROBE-12, đủ core.js): composer.remove() (detach khỏi DOM) ở mốc 1000ms giữa startShowcase()
    try { env.sandbox.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__?.({ isReinject: false }); } catch (_) {}
    try { env.sandbox.__AGY_CINEMA_DIRECTOR__?.teardown({ isReinject: false }); } catch (_) {}
    env = createKnyVmEnv({ userGestureActive: true });
    attachBioAudioSpy(env);
    const { composer: composer2 } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js', 'kny_squad_raid.js', 'kny_token_hud.js', 'kny_cinema_director.js', 'core.js']);

    const hud2 = env.sandbox.__AGY_TOKEN_HUD__;
    const dir2 = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    const bar2 = hud2.mountTokenHud(composer2, {});
    dir2.startShowcase();
    env.clock.advanceBy(1000);
    composer2.remove();
    assert.equal(bar2.isConnected, false);

    // Advance qua Hồi II (4000ms) -> 4500ms và hết Trailer (15200ms)
    env.clock.advanceBy(3500);
    assert.equal(env.document.documentElement.dataset.agyRedBlade, undefined, 'Khi HUD bị detach khỏi DOM giữa Trailer, dataset.agyRedBlade không được ghi thành 1');
    hud2.setBladeBonusHeat(100);
    assert.equal(env.document.documentElement.dataset.agyRedBlade, undefined, 'Gọi setBladeBonusHeat(100) khi HUD detached không được ghi dataset.agyRedBlade');
    env.clock.advanceBy(10700);
    assert.equal(env.document.documentElement.dataset.agyRedBlade, undefined);
  });
});

/* ============================================================================
 * SUITE 4 — F17: BẤT BIẾN KIẾN TRÚC R3 (PHẦN KNY) (5 Tier 1 + 5 Tier 2)
 * ============================================================================ */

describe('F17: Bất biến kiến trúc R3 & Tiếng Việt 100% (Phần KNY)', () => {
  let env = null;
  afterEach(() => {
    if (env) {
      try { env.sandbox.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__?.({ isReinject: false }); } catch (_) {}
      try { env.sandbox.__AGY_BIO_AUDIO__?.teardown(); } catch (_) {}
      try { env.sandbox.__AGY_TOKEN_HUD__?.teardown(); } catch (_) {}
      try { env.sandbox.__AGY_KNY_CHIBI_AURA__?.teardown(); } catch (_) {}
      try { env.sandbox.__AGY_CINEMA_DIRECTOR__?.teardown({ isReinject: false }); } catch (_) {}
      env = null;
    }
  });

  // --- Tier 1 ---
  it('F17-T1-01: Mọi phần tử con trực tiếp gắn vào .agy-user-bubble-frame phải có <i aria-hidden="true"></i> (không khớp :empty)', () => {
    env = createKnyVmEnv();
    const { composer, bubbleFrame } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_chibi_aura.js', 'core.js']);

    env.sandbox.__AGY_KNY_CHIBI_AURA__.mountChibiAura(composer, { fxMode: 'sun' }, 'yoriichi');
    const directChildren = bubbleFrame.children;
    assert.ok(directChildren.length >= 2, '.agy-user-bubble-frame phải có ít nhất phần tử nội dung + wave/hitbox');

    for (const child of directChildren) {
      if (child.classList.contains('agy-user-chibi-aura-wave') || child.classList.contains('agy-chibi-hitbox')) {
        assert.ok(child.children.length > 0, `Phần tử ${child.className} gắn vào .agy-user-bubble-frame không được :empty`);
        const iconChild = child.children.find((c) => c.tagName === 'I' && c.getAttribute('aria-hidden') === 'true');
        assert.ok(iconChild, `Phần tử ${child.className} phải chứa <i aria-hidden="true"></i>`);
      }
    }
  });

  it('F17-T1-02: Định danh mặc định là Kiếm Sĩ Đầu Tiên Tsugikuni Yoriichi (Khai Tổ Vũ Điệu Hỏa Thần)', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_breathing_skills.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const skillsApi = env.sandbox.__AGY_KNY_SKILLS__;

    const bar = hud.mountTokenHud(composer, {}, '');
    const crest = bar.querySelector('.agy-yoriichi-crest-btn');
    assert.ok(crest.title.includes('Khai Tổ Vũ Điệu Hỏa Thần (Tsugikuni Yoriichi)'));
    assert.ok(crest.getAttribute('aria-label').includes('Khai Tổ Vũ Điệu Hỏa Thần'));

    hud.showUserMessageEcho('Lệnh thử');
    const echoHdr = env.document.querySelector('#agy-yoriichi-msg-echo .agy-echo-hdr');
    assert.ok(echoHdr.textContent.includes('Khai Tổ Hỏa Thần vừa truyền lệnh'));

    const yoriSkills = skillsApi.getSkillsForCharacter('yoriichi');
    assert.ok(yoriSkills[0].breathingName.includes('Khai Tổ Vũ Điệu Hỏa Thần — Tsugikuni Yoriichi'));
  });

  it('F17-T1-03: Tuyệt đối không tồn tại #agy-chibi-skill-bar sau khi mountSkillTriggerUi()', () => {
    env = createKnyVmEnv();
    const { composer, npcWrap } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_chibi_aura.js']);
    env.sandbox.__AGY_KNY_CHIBI_AURA__.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'wisteria' }, 'shinobu');

    assert.equal(env.document.getElementById('agy-chibi-skill-bar'), null, '#agy-chibi-skill-bar không bao giờ được tạo ra');
    assert.ok(npcWrap.querySelector('.agy-npc-skill-pill'), 'Chỉ được gắn pill "Các Thức" bên trong #agy-shinobu-npc-wrap');
  });

  it('F17-T1-04: Không lộ PII hoặc đường dẫn máy local trong cả 8 tệp engine/kny_*.js', () => {
    const rawUser = (() => {
      try { return String(os.userInfo().username || '').trim(); } catch (_) { return ''; }
    })();
    const escapedUser = rawUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const piiPatterns = [
      /[A-Za-z]:(?:\\|\/){1,2}Users(?:\\|\/){1,2}(?!\.\.\.)[^\s"'`]+/i,
      /\/Users\/(?!\.\.\.)[a-z0-9._-]+/i,
      /\/home\/(?!\.\.\.)[a-z0-9._-]+/i,
      /[a-z0-9._-]+@[a-z0-9.-]+/i
    ];
    if (escapedUser.length >= 3) {
      piiPatterns.push(
        new RegExp(`[A-Za-z]:(?:\\\\|\\/){1,2}${escapedUser}(?:\\\\|\\/|\\b)`, 'i'),
        new RegExp(`\\/(?:Users|home)\\/${escapedUser}\\b`, 'i'),
        new RegExp(`(?:^|[^a-z0-9_])${escapedUser}[a-z0-9._-]*@[a-z0-9.-]+`, 'i')
      );
      if (rawUser.length >= 4 && !/^(user|admin|root|test|guest|runner|ubuntu|vscode|codespace|node|dev|administrator|system)$/i.test(rawUser)) {
        piiPatterns.push(new RegExp(`(?:^|[^a-z0-9_])${escapedUser}[a-z0-9._-]*\\b`, 'i'));
      }
    }
    const violations = [];
    for (const fileName of KNY_FILES) {
      const content = readEngineFile(fileName);
      for (const re of piiPatterns) {
        const m = content.match(re);
        if (m) {
          violations.push(`${fileName}: khớp mẫu PII "${m[0]}"`);
        }
      }
    }
    assert.deepEqual(violations, [], `Phát hiện rò rỉ PII/đường dẫn local: ${violations.join('; ')}`);
  });

  it('F17-T1-05: Giao diện các module KNY phải tuân thủ 100% Tiếng Việt (không sót nhãn tiếng Anh phụ)', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules([
      'agy_security.js',
      'kny_semantic_icons.js',
      'kny_bio_audio.js',
      'kny_squad_raid.js',
      'kny_token_hud.js',
      'kny_cinema_director.js'
    ]);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const dir = env.sandbox.__AGY_CINEMA_DIRECTOR__;
    const bar = hud.mountTokenHud(composer, {});

    // Mở Popover HUD & Panel Cinema Director để kiểm tra toàn bộ text UI hiển thị
    bar.querySelector('.agy-tok-ctx-pill').click();
    hud.ingestTelemetrySnapshot({
      ok: true, cid: 'vi-check', contextTokens: 10000, cacheReadTokens: 2000,
      turnOutTokens: 500, totalOutTokens: 900, modelName: '', isWorking: false
    });
    env.clock.stepRaf(3, 16);
    const hudTxt = bar.textContent;

    dir.openPanel(bar.querySelector('.agy-cinema-mask-btn'));
    const panelTxt = env.document.getElementById('agy-cinema-director-panel').textContent;

    // Kiểm tra nút fallback #agy-cinema-hud-btn của Cinema Director khi HUD chưa có trigger
    bar.querySelector('.agy-cinema-mask-btn').remove();
    env.clock.advanceBy(1600);
    const autoBtnTxt = env.document.getElementById('agy-cinema-hud-btn')?.textContent || '';

    const combined = `${hudTxt}\n${panelTxt}\n${autoBtnTxt}`;
    const englishLeftovers = [];
    if (/Showcase/i.test(combined)) englishLeftovers.push('Showcase');
    if (/Strict Redact/i.test(combined)) englishLeftovers.push('Strict Redact');
    if (/SSE\s*<30ms/i.test(combined)) englishLeftovers.push('SSE <30ms');
    if (/\bcache\b/i.test(combined)) englishLeftovers.push('cache');
    if (/\btok\b/i.test(combined)) englishLeftovers.push('tok');
    if (/Antigravity Agent/i.test(combined)) englishLeftovers.push('Antigravity Agent');

    assert.deepEqual(
      englishLeftovers,
      [],
      `Vẫn còn nhãn phụ tiếng Anh trên giao diện KNY: ${englishLeftovers.join(', ')}`
    );
  });

  // --- Tier 2 ---
  it('F17-T2-01: Dọn sạch #agy-chibi-skill-bar có sẵn trong DOM ở mọi nhánh mountSkillTriggerUi()', () => {
    env = createKnyVmEnv();
    const { composer, npcWrap } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;

    const injectGarbageBar = () => {
      const g = env.document.createElement('div');
      g.id = 'agy-chibi-skill-bar';
      g.innerHTML = '<button>Hơi Thở</button>';
      env.document.body.appendChild(g);
    };

    // Nhánh 1: mount mới
    injectGarbageBar();
    aura.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'wisteria' }, 'shinobu');
    assert.equal(env.document.getElementById('agy-chibi-skill-bar'), null, 'Nhánh mount mới phải xóa #agy-chibi-skill-bar');

    // Nhánh 2: fast-path gọi lại cùng composer & charId
    injectGarbageBar();
    aura.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'wisteria' }, 'shinobu');
    assert.equal(env.document.getElementById('agy-chibi-skill-bar'), null, 'Nhánh fast-path phải xóa #agy-chibi-skill-bar');

    // Nhánh 3: isChibiNpc === false
    injectGarbageBar();
    aura.mountSkillTriggerUi(composer, npcWrap, { isChibiNpc: false }, 'shinobu');
    assert.equal(env.document.getElementById('agy-chibi-skill-bar'), null, 'Nhánh isChibiNpc:false phải xóa #agy-chibi-skill-bar');
  });

  it('F17-T2-02: Tự phục hồi <i aria-hidden="true"></i> khi phần tử trong .agy-user-bubble-frame bị làm rỗng hoặc thêm bubble mới', () => {
    env = createKnyVmEnv();
    const { composer, mainBody, bubbleFrame } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_chibi_aura.js']);
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;

    aura.mountChibiAura(composer, { fxMode: 'water' }, 'giyu');
    const wave1 = bubbleFrame.querySelector(':scope > .agy-user-chibi-aura-wave');
    wave1.innerHTML = ''; // Cố tình làm rỗng để thử bẫy CSS :empty
    assert.equal(wave1.children.length, 0);

    // Kích hoạt đồng bộ lại
    aura.mountChibiAura(composer, { fxMode: 'water' }, 'giyu');
    assert.ok(wave1.children.length > 0 && wave1.children[0].tagName === 'I', 'Phải tự phục hồi <i aria-hidden="true"></i> cho wave bị làm rỗng');

    // Thêm bubble thứ 2 động và đẩy MutationObserver + rAF
    const bubble2 = env.document.createElement('div');
    bubble2.className = 'agy-user-bubble-frame';
    mainBody.appendChild(bubble2);
    env.flushMutations();
    env.clock.stepRaf(2, 16);
    const wave2 = bubble2.querySelector(':scope > .agy-user-chibi-aura-wave');
    assert.ok(wave2 && wave2.children.length > 0 && wave2.children[0].getAttribute('aria-hidden') === 'true',
      'Bubble mới thêm động phải được tự gắn wave kèm <i aria-hidden="true"></i>');
  });

  it('F17-T2-03: Giữ vững định danh Yoriichi khi themeCfg thiếu/rỗng personaSkillId và personaLabel', () => {
    env = createKnyVmEnv();
    const { composer } = env.buildStandardIdeDom();
    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_chibi_aura.js', 'kny_squad_raid.js', 'kny_token_hud.js']);
    const hud = env.sandbox.__AGY_TOKEN_HUD__;
    const aura = env.sandbox.__AGY_KNY_CHIBI_AURA__;

    const bar = hud.mountTokenHud(composer, { primary: '#ffffff', personaSkillId: '', personaLabel: '' }, '');
    const crest = bar.querySelector('.agy-yoriichi-crest-btn');
    assert.ok(crest.title.includes('Khai Tổ Vũ Điệu Hỏa Thần (Tsugikuni Yoriichi)'));

    const meta = aura.resolveCharacterMeta({}, 'tsugikuni');
    assert.equal(meta.charId, 'yoriichi', 'Alias tsugikuni phải luôn phân giải về yoriichi');
  });

  it('F17-T2-04: Toàn bộ bất biến R3 ổn định qua >= 5 lần tái nạp (reinject = 5) liên tiếp trong Node VM', () => {
    env = createKnyVmEnv();
    const { composer, bubbleFrame, npcWrap } = env.buildStandardIdeDom();

    for (let round = 1; round <= 5; round++) {
      // Mô phỏng chu kỳ preclean trước khi nạp lại
      if (env.sandbox.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__) {
        env.sandbox.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__({ isReinject: true });
      }
      env.loadBundleRound([
        'agy_security.js',
        'kny_semantic_icons.js',
        'kny_bio_audio.js',
        'kny_fx_modes.js',
        'kny_breathing_skills.js',
        'kny_chibi_aura.js',
        'kny_squad_raid.js',
        'kny_token_hud.js',
        'agy_theme_forge.js',
        'kny_cinema_director.js',
        'core.js'
      ]);
      assert.ok(
        env.sandbox.__AGY_THEME_FORGE__ &&
        Array.isArray(env.sandbox.__AGY_THEME_FORGE__.PERSONA_LIST) &&
        env.sandbox.__AGY_THEME_FORGE__.PERSONA_LIST.length === 18,
        `Lượt ${round}: __AGY_THEME_FORGE__ phải nạp đủ 18 personas`
      );
      assert.ok(
        env.sandbox.__AGY_THEME_CORE__ &&
        typeof env.sandbox.__AGY_THEME_CORE__.getThemeKeys === 'function' &&
        env.sandbox.__AGY_THEME_CORE__.getThemeKeys().length === 19,
        `Lượt ${round}: __AGY_THEME_CORE__ phải hydrate đủ 19 themes`
      );
      env.sandbox.__AGY_KNY_CHIBI_AURA__.mountChibiAura(composer, { fxMode: 'wisteria' }, 'shinobu');
      env.sandbox.__AGY_KNY_CHIBI_AURA__.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'wisteria' }, 'shinobu');
      env.sandbox.__AGY_TOKEN_HUD__.mountTokenHud(composer, {}, '');

      assert.equal(env.document.getElementById('agy-chibi-skill-bar'), null, `Lượt ${round}: Không được có #agy-chibi-skill-bar`);
      assert.equal(env.document.querySelectorAll('#agy-token-context-bar').length, 1, `Lượt ${round}: Không được nhân đôi HUD`);
      assert.equal(env.document.querySelectorAll('agy-chibi-aura').length, 1, `Lượt ${round}: Không được nhân đôi <agy-chibi-aura>`);
      for (const ch of bubbleFrame.children) {
        if (ch.classList.contains('agy-user-chibi-aura-wave') || ch.classList.contains('agy-chibi-hitbox')) {
          assert.ok(ch.children.length > 0, `Lượt ${round}: Child ${ch.className} không được :empty`);
        }
      }
    }
    const crest = env.document.querySelector('.agy-yoriichi-crest-btn');
    assert.ok(crest && crest.title.includes('Tsugikuni Yoriichi'));
  });

  it('F17-T2-05: <agy-circadian-veil> & #agy-kny-dawn-glow-layer (02:00 & 06:00) luôn có <i aria-hidden="true"></i> bảo vệ', () => {
    // Khung giờ đêm khuya 02:00
    const nightMs = new Date(2026, 10, 22, 2, 0, 0).getTime();
    env = createKnyVmEnv({ initialNowMs: nightMs });
    env.buildStandardIdeDom();
    const fxHost = env.document.createElement('agy-live-fx');
    fxHost.id = 'agy-live-fx-host';
    env.document.querySelector('.agy-shell').appendChild(fxHost);

    env.loadModules(['agy_security.js', 'kny_semantic_icons.js', 'kny_bio_audio.js']);
    const veil = env.document.getElementById('agy-kny-circadian-veil');
    assert.ok(veil, 'Lúc 02:00 phải dựng <agy-circadian-veil>');
    assert.ok(veil.children.length > 0 && veil.children[0].tagName === 'I' && veil.children[0].getAttribute('aria-hidden') === 'true',
      '<agy-circadian-veil> phải có <i aria-hidden="true"></i> bên trong');

    // Khung giờ bình minh 06:00
    const dawnMs = new Date(2026, 10, 22, 6, 0, 0).getTime();
    env.clock.setNowMs(dawnMs);
    env.clock.advanceBy(61_000); // Kích hoạt timer kiểm tra circadian 60s
    const dawnLayer = env.document.getElementById('agy-kny-dawn-glow-layer');
    assert.ok(dawnLayer, 'Lúc 06:00 phải dựng #agy-kny-dawn-glow-layer');
    assert.ok(dawnLayer.children.length > 0 && dawnLayer.children[0].tagName === 'I' && dawnLayer.children[0].getAttribute('aria-hidden') === 'true',
      '#agy-kny-dawn-glow-layer phải có <i aria-hidden="true"></i> bên trong');
  });
});
