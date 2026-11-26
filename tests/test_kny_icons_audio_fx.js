'use strict';

/**
 * Bộ kiểm thử tự động các phân hệ KNY: Icons, Bio-Audio & FX Modes (E2E_M3)
 * Bao phủ:
 *  - F09: engine/kny_semantic_icons.js (6 Tier 1 + 6 Tier 2)
 *  - F10: engine/kny_bio_audio.js      (6 Tier 1 + 6 Tier 2)
 *  - F11: engine/kny_fx_modes.js       (6 Tier 1 + 6 Tier 2)
 * Tổng cộng: 36 ca kiểm thử độc lập, zero-dependency, chạy trực tiếp qua node:vm.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ICONS_SRC = fs.readFileSync(path.join(ROOT_DIR, 'engine', 'kny_semantic_icons.js'), 'utf8');
const BIO_AUDIO_SRC = fs.readFileSync(path.join(ROOT_DIR, 'engine', 'kny_bio_audio.js'), 'utf8');
const FX_MODES_SRC = fs.readFileSync(path.join(ROOT_DIR, 'engine', 'kny_fx_modes.js'), 'utf8');

const RealDate = Date;

/* ============================================================================
 * 1. HẠ TẦNG GIẢ LẬP NODE VM + FAKE CLOCK + MINI DOM + WEBAUDIO SPY + CANVAS2D SPY
 * ============================================================================ */

function toKebabAttr(prop) {
  return 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function toCamelDataset(attrName) {
  return String(attrName)
    .replace(/^data-/, '')
    .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

/**
 * EventTarget giả lập chuẩn W3C: phân biệt rõ cờ capture khi đăng ký và gỡ bỏ listener.
 */
class FakeEventTarget {
  constructor() {
    this._listeners = [];
  }

  _normalizeCapture(options) {
    if (typeof options === 'boolean') return options;
    if (options && typeof options === 'object') return Boolean(options.capture);
    return false;
  }

  addEventListener(type, listener, options) {
    if (typeof listener !== 'function') return;
    const capture = this._normalizeCapture(options);
    const exists = this._listeners.some(
      (item) => item.type === type && item.fn === listener && item.capture === capture
    );
    if (!exists) {
      this._listeners.push({ type, fn: listener, capture });
    }
  }

  removeEventListener(type, listener, options) {
    const capture = this._normalizeCapture(options);
    this._listeners = this._listeners.filter(
      (item) => !(item.type === type && item.fn === listener && item.capture === capture)
    );
  }

  dispatchEvent(event) {
    const ev = event && typeof event === 'object' ? event : { type: String(event || '') };
    if (!ev.target) ev.target = this;
    if (typeof ev.stopPropagation !== 'function') {
      ev.stopPropagation = () => { ev._stopped = true; };
    }
    if (typeof ev.preventDefault !== 'function') {
      ev.preventDefault = () => { ev.defaultPrevented = true; };
    }
    const snapshot = this._listeners.filter((item) => item.type === ev.type);
    for (let i = 0; i < snapshot.length; i++) {
      if (ev._stopped) break;
      snapshot[i].fn.call(this, ev);
    }
    return !ev.defaultPrevented;
  }

  getListenerCount(type) {
    if (!type) return this._listeners.length;
    return this._listeners.filter((item) => item.type === type).length;
  }
}

function matchesSimpleSelector(el, selector) {
  if (!el || !selector) return false;
  const sel = String(selector).trim();
  if (!sel) return false;

  // Hỗ trợ danh sách selector ngăn cách bởi dấu phẩy
  if (sel.includes(',')) {
    return sel.split(',').some((part) => matchesSimpleSelector(el, part));
  }

  // Hỗ trợ selector dạng tag[attr="val"] hoặc #id hoặc .class hoặc [attr="val"]
  const parts = sel.split(/\s+/).filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (!matchesSingleCompound(el, lastPart)) return false;
  if (parts.length === 1) return true;

  // Kiểm tra tổ tiên ngược lên nếu có nhiều cấp
  let cur = el.parentElement;
  let idx = parts.length - 2;
  while (cur && idx >= 0) {
    if (parts[idx] === '>') {
      idx--;
      continue;
    }
    if (matchesSingleCompound(cur, parts[idx])) {
      idx--;
    }
    cur = cur.parentElement;
  }
  return idx < 0;
}

function matchesSingleCompound(el, token) {
  let rest = token.trim();
  if (!rest) return false;

  // Kiểm tra [attr="val"] hoặc [attr]
  const attrMatches = [];
  rest = rest.replace(/\[([^\]]+)\]/g, (_, inside) => {
    attrMatches.push(inside);
    return '';
  });

  // Kiểm tra #id
  const idMatch = rest.match(/#([A-Za-z0-9_-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1]) return false;
    rest = rest.replace(idMatch[0], '');
  }

  // Kiểm tra .class
  const classMatches = rest.match(/\.[A-Za-z0-9_-]+/g) || [];
  for (const cm of classMatches) {
    const cls = cm.slice(1);
    const list = String(el.className || '').split(/\s+/).filter(Boolean);
    if (!list.includes(cls)) return false;
    rest = rest.replace(cm, '');
  }

  // Phần còn lại là tagName
  if (rest && rest !== '*') {
    if (String(el.tagName || '').toLowerCase() !== rest.toLowerCase()) return false;
  }

  for (const cond of attrMatches) {
    const eqIdx = cond.indexOf('=');
    if (eqIdx === -1) {
      if (!el.hasAttribute(cond.trim())) return false;
    } else {
      const k = cond.slice(0, eqIdx).trim();
      const v = cond.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (el.getAttribute(k) !== v) return false;
    }
  }
  return true;
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.id = '';
    this.className = '';
    this.type = '';
    this.title = '';
    this.textContent = '';
    this._innerHTML = '';
    this.parentElement = null;
    this.children = [];
    this._attrs = new Map();
    this._rect = { left: 100, top: 100, right: 180, bottom: 130, width: 80, height: 30 };

    const styleStore = Object.create(null);
    this.style = new Proxy(styleStore, {
      set(target, prop, value) {
        if (prop === 'cssText') {
          target.cssText = String(value || '');
          return true;
        }
        target[prop] = String(value);
        return true;
      },
      get(target, prop) {
        return target[prop] || '';
      }
    });

    const elRef = this;
    this.dataset = new Proxy(Object.create(null), {
      get(_, prop) {
        if (typeof prop !== 'string') return undefined;
        return elRef._attrs.get(toKebabAttr(prop));
      },
      set(_, prop, val) {
        if (typeof prop !== 'string') return true;
        elRef._attrs.set(toKebabAttr(prop), String(val));
        return true;
      },
      deleteProperty(_, prop) {
        if (typeof prop !== 'string') return true;
        elRef._attrs.delete(toKebabAttr(prop));
        return true;
      },
      ownKeys() {
        const keys = [];
        for (const k of elRef._attrs.keys()) {
          if (k.startsWith('data-')) keys.push(toCamelDataset(k));
        }
        return keys;
      },
      getOwnPropertyDescriptor(_, prop) {
        if (typeof prop === 'string' && elRef._attrs.has(toKebabAttr(prop))) {
          return { enumerable: true, configurable: true, value: elRef._attrs.get(toKebabAttr(prop)) };
        }
        return undefined;
      }
    });
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = String(val || '');
    if (this._innerHTML === '') {
      this.children = [];
    }
  }

  get lastElementChild() {
    return this.children.length > 0 ? this.children[this.children.length - 1] : null;
  }

  get isConnected() {
    let cur = this;
    while (cur) {
      if (cur === this.ownerDocument.documentElement) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  setAttribute(name, value) {
    const k = String(name);
    const v = String(value);
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = v;
    this._attrs.set(k, v);
  }

  getAttribute(name) {
    const k = String(name);
    if (k === 'id' && this.id) return this.id;
    if (k === 'class' && this.className) return this.className;
    return this._attrs.has(k) ? this._attrs.get(k) : null;
  }

  hasAttribute(name) {
    const k = String(name);
    if (k === 'id' && this.id) return true;
    if (k === 'class' && this.className) return true;
    return this._attrs.has(k);
  }

  removeAttribute(name) {
    const k = String(name);
    if (k === 'id') this.id = '';
    if (k === 'class') this.className = '';
    this._attrs.delete(k);
  }

  appendChild(child) {
    if (!child) return child;
    if (child.parentElement) {
      const idx = child.parentElement.children.indexOf(child);
      if (idx !== -1) child.parentElement.children.splice(idx, 1);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx !== -1) this.parentElement.children.splice(idx, 1);
    this.parentElement = null;
  }

  contains(target) {
    let cur = target;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (let i = 0; i < node.children.length; i++) {
        const ch = node.children[i];
        if (matchesSimpleSelector(ch, selector)) results.push(ch);
        walk(ch);
      }
    };
    walk(this);
    return results;
  }

  getBoundingClientRect() {
    return { ...this._rect };
  }
}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.hidden = false;
    this._focused = true;
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  hasFocus() {
    return Boolean(this._focused);
  }

  createElement(tag) {
    return new FakeElement(tag, this);
  }

  createElementNS(_ns, tag) {
    return new FakeElement(tag, this);
  }

  getElementById(id) {
    if (!id) return null;
    const walk = (node) => {
      for (let i = 0; i < node.children.length; i++) {
        const ch = node.children[i];
        if (ch.id === id) return ch;
        const found = walk(ch);
        if (found) return found;
      }
      return null;
    };
    return walk(this.documentElement);
  }

  querySelector(selector) {
    if (matchesSimpleSelector(this.documentElement, selector)) return this.documentElement;
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    const list = [];
    if (matchesSimpleSelector(this.documentElement, selector)) list.push(this.documentElement);
    return list.concat(this.documentElement.querySelectorAll(selector));
  }
}

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); }
  };
}

class FakeAudioParam {
  constructor(initialValue = 0) {
    this.value = initialValue;
    this.history = [];
  }

  setValueAtTime(value, startTime) {
    this.value = value;
    this.history.push({ method: 'setValueAtTime', args: [value, startTime] });
  }

  linearRampToValueAtTime(value, endTime) {
    this.value = value;
    this.history.push({ method: 'linearRampToValueAtTime', args: [value, endTime] });
  }

  exponentialRampToValueAtTime(value, endTime) {
    this.value = value;
    this.history.push({ method: 'exponentialRampToValueAtTime', args: [value, endTime] });
  }

  cancelScheduledValues(cancelTime) {
    this.history.push({ method: 'cancelScheduledValues', args: [cancelTime] });
  }

  cancelAndHoldAtTime(cancelTime) {
    this.history.push({ method: 'cancelAndHoldAtTime', args: [cancelTime] });
  }
}

function createAudioSpyClass(telemetry, audioOpts = {}) {
  return class FakeAudioContext extends FakeEventTarget {
    constructor(opts) {
      super();
      this.options = opts || {};
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.state = audioOpts.initialState || 'suspended';
      this.destination = { kind: 'destination' };
      this.resumeCount = 0;
      this.suspendCount = 0;
      this.closeCount = 0;
      this._deferredResume = null;
      telemetry.contexts.push(this);
    }

    resume() {
      this.resumeCount += 1;
      if (this.state === 'closed') {
        return Promise.reject(new Error('AudioContext đã đóng'));
      }
      if (audioOpts.rejectResume && !this._allowResumeAfterReject) {
        return Promise.reject(new Error('Autoplay blocked'));
      }
      if (audioOpts.hangResume) {
        return new Promise((resolve) => {
          this._deferredResume = () => {
            this.state = 'running';
            resolve();
          };
        });
      }
      this.state = 'running';
      return Promise.resolve();
    }

    suspend() {
      this.suspendCount += 1;
      if (this.state !== 'closed') {
        this.state = 'suspended';
      }
      return Promise.resolve();
    }

    close() {
      this.closeCount += 1;
      this.state = 'closed';
      return Promise.resolve();
    }

    createGain() {
      const node = {
        kind: 'gain',
        gain: new FakeAudioParam(1),
        connectedTo: [],
        disconnected: false,
        connect(dest) { this.connectedTo.push(dest); return dest; },
        disconnect() { this.disconnected = true; }
      };
      telemetry.gains.push(node);
      return node;
    }

    createBiquadFilter() {
      const node = {
        kind: 'biquadFilter',
        type: 'lowpass',
        frequency: new FakeAudioParam(350),
        Q: new FakeAudioParam(1),
        connectedTo: [],
        disconnected: false,
        connect(dest) { this.connectedTo.push(dest); return dest; },
        disconnect() { this.disconnected = true; }
      };
      telemetry.filters.push(node);
      return node;
    }

    createOscillator() {
      const node = {
        kind: 'oscillator',
        type: 'sine',
        frequency: new FakeAudioParam(440),
        startedAt: null,
        stoppedAt: null,
        onended: null,
        connectedTo: [],
        disconnected: false,
        connect(dest) { this.connectedTo.push(dest); return dest; },
        disconnect() { this.disconnected = true; },
        start(when = 0) { this.startedAt = when; },
        stop(when = 0) { this.stoppedAt = when; }
      };
      telemetry.oscillators.push(node);
      return node;
    }

    createBuffer(channels, length, sampleRate) {
      const chs = Array.from({ length: channels }, () => new Float32Array(length));
      const buf = {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData(idx) { return chs[idx]; }
      };
      telemetry.buffers.push(buf);
      return buf;
    }

    createBufferSource() {
      const node = {
        kind: 'bufferSource',
        buffer: null,
        loop: false,
        startedAt: null,
        stoppedAt: null,
        onended: null,
        connectedTo: [],
        disconnected: false,
        connect(dest) { this.connectedTo.push(dest); return dest; },
        disconnect() { this.disconnected = true; },
        start(when = 0, offset = 0, duration = undefined) {
          this.startedAt = { when, offset, duration };
        },
        stop(when = 0) { this.stoppedAt = when; }
      };
      telemetry.bufferSources.push(node);
      return node;
    }
  };
}

function createCanvas2DSpy(width = 1920, height = 1080) {
  const stack = [];
  let state = { globalAlpha: 1, tx: 0, ty: 0, sx: 1, sy: 1 };

  const spy = {
    canvas: { width, height },
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    nonFiniteCalls: [],
    invalidGradientCalls: [],
    drawnOps: [],
    clearRectCalls: [],
    get globalAlpha() { return state.globalAlpha; },
    set globalAlpha(v) {
      if (!Number.isFinite(v)) {
        spy.nonFiniteCalls.push({ op: 'set globalAlpha', value: v });
      }
      state.globalAlpha = v;
    }
  };

  function checkFinite(op, vals) {
    for (let i = 0; i < vals.length; i++) {
      if (!Number.isFinite(vals[i])) {
        spy.nonFiniteCalls.push({ op, argIndex: i, value: vals[i] });
      }
    }
  }

  function recordOp(op, extra = {}) {
    spy.drawnOps.push({
      op,
      globalAlpha: state.globalAlpha,
      tx: state.tx,
      ty: state.ty,
      sx: state.sx,
      sy: state.sy,
      strokeStyle: spy.strokeStyle,
      fillStyle: spy.fillStyle,
      ...extra
    });
  }

  spy.save = () => {
    stack.push({ ...state });
  };
  spy.restore = () => {
    if (stack.length > 0) state = stack.pop();
  };
  spy.translate = (x, y) => {
    checkFinite('translate', [x, y]);
    state.tx += x * state.sx;
    state.ty += y * state.sy;
    recordOp('translate', { x, y, worldX: state.tx, worldY: state.ty });
  };
  spy.rotate = (rad) => {
    checkFinite('rotate', [rad]);
  };
  spy.scale = (x, y) => {
    checkFinite('scale', [x, y]);
    state.sx *= x;
    state.sy *= y;
  };
  spy.clearRect = (x, y, w, h) => {
    checkFinite('clearRect', [x, y, w, h]);
    spy.clearRectCalls.push({ x, y, w, h });
    recordOp('clearRect', { x, y, w, h });
  };
  spy.fillRect = (x, y, w, h) => {
    checkFinite('fillRect', [x, y, w, h]);
    recordOp('fillRect', { x, y, w, h });
  };
  spy.beginPath = () => {
    recordOp('beginPath');
  };
  spy.closePath = () => {
    recordOp('closePath');
  };
  spy.moveTo = (x, y) => {
    checkFinite('moveTo', [x, y]);
    recordOp('moveTo', { x, y, worldX: state.tx + x * state.sx, worldY: state.ty + y * state.sy });
  };
  spy.lineTo = (x, y) => {
    checkFinite('lineTo', [x, y]);
    recordOp('lineTo', { x, y, worldX: state.tx + x * state.sx, worldY: state.ty + y * state.sy });
  };
  spy.arc = (x, y, r, sAngle, eAngle) => {
    checkFinite('arc', [x, y, r, sAngle, eAngle]);
    recordOp('arc', {
      x,
      y,
      r,
      worldX: state.tx + x * state.sx,
      worldY: state.ty + y * state.sy
    });
  };
  spy.ellipse = (x, y, rx, ry, rot, sAngle, eAngle) => {
    checkFinite('ellipse', [x, y, rx, ry, rot, sAngle, eAngle]);
    recordOp('ellipse', {
      x,
      y,
      rx,
      ry,
      worldX: state.tx + x * state.sx,
      worldY: state.ty + y * state.sy
    });
  };
  spy.bezierCurveTo = (cp1x, cp1y, cp2x, cp2y, x, y) => {
    checkFinite('bezierCurveTo', [cp1x, cp1y, cp2x, cp2y, x, y]);
  };
  spy.quadraticCurveTo = (cpx, cpy, x, y) => {
    checkFinite('quadraticCurveTo', [cpx, cpy, x, y]);
  };
  spy.fill = () => {
    recordOp('fill');
  };
  spy.stroke = () => {
    recordOp('stroke');
  };
  spy.createLinearGradient = (x0, y0, x1, y1) => {
    checkFinite('createLinearGradient', [x0, y0, x1, y1]);
    return { stops: [], addColorStop(off, col) { this.stops.push([off, col]); } };
  };
  spy.createRadialGradient = (x0, y0, r0, x1, y1, r1) => {
    checkFinite('createRadialGradient', [x0, y0, r0, x1, y1, r1]);
    if (!(r1 > r0)) {
      spy.invalidGradientCalls.push({ x0, y0, r0, x1, y1, r1 });
    }
    return { stops: [], addColorStop(off, col) { this.stops.push([off, col]); } };
  };

  return spy;
}

/**
 * Tạo môi trường VM hoàn chỉnh cho từng bài test, cô lập 100% giữa các test case.
 */
function createKnyEnv(opts = {}) {
  let nowMs = opts.nowDate instanceof RealDate
    ? opts.nowDate.getTime()
    : RealDate.parse('2026-11-22T12:00:00');
  let perfNowMs = 1000;
  let nextTimerId = 1;
  const timers = new Map();

  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(nowMs);
      } else {
        super(...args);
      }
    }
    static now() {
      return nowMs;
    }
    static [Symbol.hasInstance](instance) {
      return instance instanceof RealDate;
    }
  }

  function setTimeoutFake(fn, delay = 0) {
    const id = nextTimerId++;
    timers.set(id, {
      id,
      fn,
      delay: Math.max(0, Number(delay) || 0),
      nextAt: nowMs + Math.max(0, Number(delay) || 0),
      isInterval: false
    });
    return id;
  }

  function clearTimeoutFake(id) {
    timers.delete(id);
  }

  function setIntervalFake(fn, delay = 0) {
    const id = nextTimerId++;
    const d = Math.max(1, Number(delay) || 1);
    timers.set(id, {
      id,
      fn,
      delay: d,
      nextAt: nowMs + d,
      isInterval: true
    });
    return id;
  }

  function clearIntervalFake(id) {
    timers.delete(id);
  }

  function advanceTimers(ms) {
    const target = nowMs + Math.max(0, Number(ms) || 0);
    let safety = 0;
    while (safety < 5000) {
      safety += 1;
      let due = null;
      for (const entry of timers.values()) {
        if (entry.nextAt <= target && (!due || entry.nextAt < due.nextAt)) {
          due = entry;
        }
      }
      if (!due) break;
      nowMs = due.nextAt;
      if (due.isInterval) {
        due.nextAt = nowMs + due.delay;
      } else {
        timers.delete(due.id);
      }
      if (typeof due.fn === 'function') {
        due.fn();
      }
    }
    nowMs = target;
  }

  const doc = new FakeDocument();
  const localStorage = createMemoryStorage(opts.localStorage || {});
  const sessionStorage = createMemoryStorage(opts.sessionStorage || {});
  const audioTelemetry = {
    contexts: [],
    oscillators: [],
    filters: [],
    gains: [],
    bufferSources: [],
    buffers: []
  };
  const FakeAudioContext = createAudioSpyClass(audioTelemetry, opts.audio || {});

  const windowObj = {
    innerWidth: 1280,
    innerHeight: 800,
    AudioContext: FakeAudioContext,
    webkitAudioContext: FakeAudioContext,
    localStorage,
    sessionStorage,
    document: doc,
    navigator: {
      userActivation: {
        hasBeenActive: Boolean(opts.hasBeenActive)
      }
    },
    performance: {
      now: () => perfNowMs
    }
  };
  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.globalThis = windowObj;

  if (opts.chibiAura) windowObj.__AGY_KNY_CHIBI_AURA__ = opts.chibiAura;
  if (opts.cinemaDirector) windowObj.__AGY_CINEMA_DIRECTOR__ = opts.cinemaDirector;
  if (opts.tokenHud) windowObj.__AGY_TOKEN_HUD__ = opts.tokenHud;
  if (opts.audioUnlocked) windowObj.__AGY_AUDIO_UNLOCKED__ = true;

  const contextObj = {
    window: windowObj,
    globalThis: windowObj,
    self: windowObj,
    document: doc,
    navigator: windowObj.navigator,
    localStorage,
    sessionStorage,
    performance: windowObj.performance,
    AudioContext: FakeAudioContext,
    webkitAudioContext: FakeAudioContext,
    Date: FakeDate,
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    setInterval: setIntervalFake,
    clearInterval: clearIntervalFake,
    console
  };

  const vmCtx = vm.createContext(contextObj);

  function mountIdeShell() {
    const shell = doc.createElement('div');
    shell.className = 'agy-shell';
    const fxHost = doc.createElement('div');
    fxHost.id = 'agy-live-fx-host';
    const hudBar = doc.createElement('div');
    hudBar.id = 'agy-token-context-bar';
    shell.appendChild(fxHost);
    doc.body.appendChild(shell);
    doc.body.appendChild(hudBar);
    return { shell, fxHost, hudBar };
  }

  if (opts.mountShell !== false) {
    mountIdeShell();
  }

  function loadModule(source, filename) {
    vm.runInContext(source, vmCtx, { filename });
  }

  return {
    vmCtx,
    window: windowObj,
    document: doc,
    localStorage,
    sessionStorage,
    audioTelemetry,
    mountIdeShell,
    loadModule,
    setNow(dateObj) {
      nowMs = dateObj.getTime();
    },
    setPerfNow(v) {
      perfNowMs = v;
    },
    advanceTimers,
    getActiveTimers() {
      return Array.from(timers.values()).map((t) => ({
        id: t.id,
        isInterval: t.isInterval,
        delay: t.delay,
        nextAt: t.nextAt
      }));
    },
    getDocumentListenerCount(type) {
      return doc.getListenerCount(type);
    },
    async flushMicrotasks(rounds = 4) {
      for (let i = 0; i < rounds; i++) {
        await Promise.resolve();
      }
    }
  };
}

const activeEnvsToClean = [];
afterEach(() => {
  while (activeEnvsToClean.length > 0) {
    const env = activeEnvsToClean.pop();
    try {
      if (env.window.__AGY_BIO_AUDIO__ && typeof env.window.__AGY_BIO_AUDIO__.destroy === 'function') {
        env.window.__AGY_BIO_AUDIO__.destroy({ isReinject: false });
      }
    } catch (_) {}
  }
});

/* ============================================================================
 * 2. NHÓM F09 — HỆ THỐNG ICON SVG NGỮ NGHĨA (kny_semantic_icons.js)
 * ============================================================================ */

describe('F09 — Hệ thống icon SVG ngữ nghĩa (kny_semantic_icons.js)', () => {
  it('F09-T1-01 [Tier 1]: Export đầy đủ API trên window và globalThis', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');

    const icons = env.window.__AGY_KNY_ICONS__;
    assert.ok(icons && typeof icons === 'object', 'Phải export window.__AGY_KNY_ICONS__');
    assert.strictEqual(icons, env.vmCtx.globalThis.__AGY_KNY_ICONS__, 'window và globalThis phải trỏ cùng object API');
    for (const fnName of ['parseSessionIdentity', 'buildSessionAvatar', 'normalizeElementKey', 'getElementalSvg', 'getFuncSvg']) {
      assert.strictEqual(typeof icons[fnName], 'function', `Thiếu hàm public ${fnName}`);
    }
  });

  it('F09-T1-02 [Tier 1]: Đủ 18 SVG nguyên tố hợp lệ và phân biệt nhau từng cặp', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const icons = env.window.__AGY_KNY_ICONS__;

    const elements18 = [
      'water', 'flame', 'wisteria', 'royal_wisteria', 'sound', 'mist',
      'love', 'serpent', 'wind', 'stone', 'sun_water', 'nezuko',
      'thunder', 'beast', 'cosmic', 'obsidian', 'moon', 'yoriichi'
    ];
    assert.strictEqual(elements18.length, 18);

    const rendered = new Set();
    for (const key of elements18) {
      const svg = icons.getElementalSvg(key, 20);
      assert.ok(svg.startsWith('<svg '), `Icon ${key} phải bắt đầu bằng <svg`);
      assert.ok(svg.includes(`data-elem="${key}"`), `Icon ${key} phải gắn data-elem="${key}"`);
      assert.ok(svg.includes('width="20"') && svg.includes('height="20"'), `Icon ${key} phải đúng kích thước 20`);
      assert.ok(svg.includes('aria-hidden="true"'), `Icon ${key} phải có aria-hidden="true"`);
      assert.ok(!rendered.has(svg), `Icon ${key} bị trùng nội dung SVG với nguyên tố khác`);
      rendered.add(svg);
    }
    assert.strictEqual(rendered.size, 18, 'Phải tạo ra đúng 18 chuỗi SVG nguyên tố khác nhau');
  });

  it('F09-T1-03 [Tier 1]: Đủ 12 icon chức năng hợp lệ (có yoriichi_sun, kagura_bell, cinema_mask) và phân biệt nhau', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const icons = env.window.__AGY_KNY_ICONS__;

    const funcs16 = [
      'breathing_forms', 'katana_cast', 'nichirin_item', 'sfx_on', 'sfx_off',
      'kv_cache', 'draft_brush', 'session_sum', 'model_quota',
      'yoriichi_sun', 'kagura_bell', 'cinema_mask',
      'context_scroll', 'compact_seal', 'burn_velocity', 'task_scroll'
    ];
    assert.strictEqual(funcs16.length, 16);

    const rendered = new Set();
    for (const kind of funcs16) {
      const svg = icons.getFuncSvg(kind, 16);
      const svgCached = icons.getFuncSvg(kind, 16);
      assert.strictEqual(svg, svgCached, `Icon ${kind} phải được lưu bộ nhớ đệm O(1) nhất quán`);
      assert.ok(svg.includes('class="agy-sem-svg"'), `Icon ${kind} thiếu class agy-sem-svg`);
      assert.ok(svg.includes('width="16"') && svg.includes('height="16"'), `Icon ${kind} sai kích thước`);
      assert.ok(svg.includes('aria-hidden="true"'), `Icon ${kind} thiếu aria-hidden="true"`);
      assert.ok(!rendered.has(svg), `Icon ${kind} bị trùng nội dung với icon chức năng khác`);
      rendered.add(svg);
    }
    assert.strictEqual(rendered.size, 16, 'Phải tạo đủ 16 icon chức năng khác nhau');
  });

  it('F09-T1-04 [Tier 1]: normalizeElementKey chuẩn hóa alias tiếng Anh và tiếng Việt chính xác', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const { normalizeElementKey } = env.window.__AGY_KNY_ICONS__;

    const cases = [
      ['sun_water', 'sun_water'],
      ['Tanjiro', 'sun_water'],
      ['Nhật Luân', 'sun_water'],
      ['water', 'water'],
      ['Giyu', 'water'],
      ['Thủy Trụ', 'water'],
      ['moon', 'moon'],
      ['shadow', 'moon'],
      ['Kokushibo', 'moon'],
      ['Nguyệt', 'moon'],
      ['Chúa Công', 'royal_wisteria'],
      ['Trùng Trụ', 'wisteria'],
      ['WLOP', 'cosmic'],
      ['Midnight', 'obsidian']
    ];
    for (const [input, expected] of cases) {
      assert.strictEqual(
        normalizeElementKey(input),
        expected,
        `normalizeElementKey("${input}") phải trả về "${expected}"`
      );
    }
  });

  it('F09-T1-05 [Tier 1]: parseSessionIdentity phân loại 5 archetype và trích monogram Unicode tiếng Việt', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const { parseSessionIdentity } = env.window.__AGY_KNY_ICONS__;

    assert.strictEqual(parseSessionIdentity('YouTube Stream - Media - Antigravity', 'c1').archetype, 'media');
    assert.strictEqual(parseSessionIdentity('ArchViz Villa CSS - Antigravity', 'c2').archetype, 'design');
    assert.strictEqual(parseSessionIdentity('BigQuery Notebook - Antigravity', 'c3').archetype, 'data');
    assert.strictEqual(parseSessionIdentity('Deploy Daemon Fix - Antigravity', 'c4').archetype, 'forge');

    const mono = parseSessionIdentity('Hội Thoại - Điệp Phủ - Antigravity', 'c5');
    assert.strictEqual(mono.archetype, 'monogram');
    assert.strictEqual(mono.sessionName, 'Hội Thoại');
    assert.strictEqual(mono.projectName, 'Điệp Phủ');
    assert.strictEqual(mono.displayLabel, 'Hội Thoại • Điệp Phủ');
    assert.strictEqual(mono.initial, 'Đ', 'Phải trích đúng ký tự Unicode tiếng Việt chữ Đ viết hoa');
    assert.match(mono.c1, /^#[0-9a-f]{6}$/i);
    assert.match(mono.c2, /^#[0-9a-f]{6}$/i);
  });

  it('F09-T1-06 [Tier 1]: buildSessionAvatar dựng đầy đủ emblem SVG, linearGradient và info metadata', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const { buildSessionAvatar } = env.window.__AGY_KNY_ICONS__;

    const res = buildSessionAvatar('Phòng Huấn Luyện - Antigravity', 'cid-42', 18);
    assert.ok(res && typeof res.svg === 'string' && res.info, 'Phải trả về { svg, info }');
    assert.ok(res.svg.includes('class="agy-sem-svg agy-session-emblem"'));
    assert.ok(res.svg.includes('width="18"') && res.svg.includes('height="18"'));
    const gradMatch = res.svg.match(/<linearGradient\s+id="([^"]+)"/);
    assert.ok(gradMatch, 'SVG emblem phải chứa <linearGradient id="...">');
    const gid = gradMatch[1];
    assert.ok(res.svg.includes(`fill="url(#${gid})"`), 'Vòng tròn nền phải tham chiếu đúng url(#gid)');
    assert.ok(res.svg.includes(`stroke="url(#${gid})"`), 'Viền phải tham chiếu đúng url(#gid)');
  });

  it('F09-T2-01 [Tier 2]: buildSessionAvatar chống trùng <linearGradient id> khi render nhiều lần hoặc cùng kích cỡ', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const { buildSessionAvatar } = env.window.__AGY_KNY_ICONS__;

    const calls = [
      buildSessionAvatar('Phiên A', 'cid-same', 15),
      buildSessionAvatar('Phiên A', 'cid-same', 15),
      buildSessionAvatar('Phiên A', 'cid-same', 15),
      buildSessionAvatar('Phiên B', 'cid-other', 15)
    ];

    const ids = new Set();
    for (let i = 0; i < calls.length; i++) {
      const m = calls[i].svg.match(/<linearGradient\s+id="([^"]+)"/);
      assert.ok(m, `Lần gọi ${i} phải có id gradient`);
      const gid = m[1];
      assert.ok(!ids.has(gid), `ID <linearGradient> "${gid}" bị trùng lặp ở lần gọi thứ ${i + 1}`);
      assert.ok(calls[i].svg.includes(`url(#${gid})`), `Tham chiếu url(#${gid}) phải khớp id của từng SVG`);
      ids.add(gid);
    }
    assert.strictEqual(ids.size, calls.length);
  });

  it('F09-T2-02 [Tier 2]: XML escape an toàn với ký tự đặc biệt (< > & " \') và size dị biệt chống attribute breakout', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const { buildSessionAvatar } = env.window.__AGY_KNY_ICONS__;

    const xssRes = buildSessionAvatar('<script>alert(1)</script> & " \' > <', 'cid-xss', '15" onload="alert(1)');
    assert.ok(!xssRes.svg.includes('<script'), 'Không được để thẻ <script lọt vào chuỗi SVG');
    assert.ok(!xssRes.svg.includes('onload='), 'Không được để attribute breakout lọt qua tham số size');
    assert.ok(xssRes.svg.includes('width="15"') && xssRes.svg.includes('height="15"'), 'size dị biệt phải fallback an toàn về 15');

    const symbolsOnly = buildSessionAvatar('<<<>>>&&&"\'', 'cid-sym', 20);
    assert.strictEqual(symbolsOnly.info.initial, 'A', 'Chuỗi toàn ký tự đặc biệt phải fallback initial về "A"');
    assert.ok(!symbolsOnly.svg.includes('<<<'), 'Không được để ký tự < thô lọt vào SVG');
  });

  it('F09-T2-03 [Tier 2]: normalizeElementKey xử lý biên rỗng, null, số và ưu tiên chuỗi con không đè nhau', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const { normalizeElementKey } = env.window.__AGY_KNY_ICONS__;

    for (const emptyOrUnknown of ['', '   ', null, undefined, 0, 'unknown_element_999', 'yoriichi', 'sun']) {
      assert.strictEqual(normalizeElementKey(emptyOrUnknown), 'yoriichi');
    }
    assert.strictEqual(normalizeElementKey('sun_water'), 'sun_water', 'sun_water không được khớp nhầm sang water');
    assert.strictEqual(normalizeElementKey('royal_wisteria'), 'royal_wisteria', 'royal_wisteria không được khớp nhầm sang wisteria');
  });

  it('F09-T2-04 [Tier 2]: parseSessionIdentity xử lý chuỗi rỗng, hậu tố Antigravity và nhiều dấu gạch ngang', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const { parseSessionIdentity } = env.window.__AGY_KNY_ICONS__;

    const empty = parseSessionIdentity('', null);
    assert.strictEqual(empty.sessionName, 'Phiên làm việc hiện tại');
    assert.strictEqual(empty.projectName, 'Phiên làm việc hiện tại');

    const onlySuffix = parseSessionIdentity(' - Antigravity', undefined);
    assert.strictEqual(onlySuffix.sessionName, 'Phiên làm việc hiện tại');

    const multiDash = parseSessionIdentity('Tác vụ A — Nhánh B – Dự án C - Antigravity', '');
    assert.strictEqual(multiDash.sessionName, 'Tác vụ A');
    assert.strictEqual(multiDash.projectName, 'Dự án C');
    assert.strictEqual(multiDash.displayLabel, 'Tác vụ A • Dự án C');
  });

  it('F09-T2-05 [Tier 2]: getFuncSvg với kind không hợp lệ trả về fallback vòng tròn hợp lệ', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const { getFuncSvg } = env.window.__AGY_KNY_ICONS__;

    for (const badKind of ['', null, undefined, 'khong_ton_tai']) {
      const svg = getFuncSvg(badKind, 14);
      assert.ok(svg.includes('<circle cx="12" cy="12" r="7"'), `Fallback cho "${badKind}" phải là SVG vòng tròn chuẩn`);
      assert.ok(svg.includes('width="14"') && svg.includes('height="14"'));
    }
  });

  it('F09-T2-06 [Tier 2]: Tính xác định FNV-1a tạo bảng màu hợp lệ ổn định qua nhiều chuỗi Unicode/CJK', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(ICONS_SRC, 'kny_semantic_icons.js');
    const { parseSessionIdentity } = env.window.__AGY_KNY_ICONS__;

    const a1 = parseSessionIdentity('Dự án Thủy Trụ', 'cid-unicode-🔥');
    const a2 = parseSessionIdentity('Dự án Thủy Trụ', 'cid-unicode-🔥');
    assert.strictEqual(a1.c1, a2.c1);
    assert.strictEqual(a1.c2, a2.c2);
    assert.strictEqual(a1.uid, a2.uid);

    for (const cid of ['日本語セッション', 'Tiếng Việt có dấu ăâđêôơư', '🚀✨', '0']) {
      const info = parseSessionIdentity('Phiên bất kỳ', cid);
      assert.ok(info.uid && info.uid.length > 0, `cid="${cid}" phải sinh uid không rỗng`);
      assert.match(info.c1, /^#[0-9a-f]{6}$/i);
      assert.match(info.c2, /^#[0-9a-f]{6}$/i);
    }
  });
});

/* ============================================================================
 * 3. NHÓM F10 — ÂM CẢNH WEB AUDIO 0 KB & CIRCADIAN VEIL (kny_bio_audio.js)
 * ============================================================================ */

describe('F10 — Âm cảnh Điệp Phủ WebAudio 0 KB & Circadian Veil (kny_bio_audio.js)', () => {
  it('F10-T1-01 [Tier 1]: Export Object.freeze đủ 15 thuộc tính API và cấu hình mặc định DEFAULT_PREFS', () => {
    const env = createKnyEnv();
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');

    const api = env.window.__AGY_BIO_AUDIO__;
    assert.ok(api && Object.isFrozen(api), 'window.__AGY_BIO_AUDIO__ phải tồn tại và bị Object.freeze');
    const expectedKeys = [
      'toggle', 'openPopover', 'closePopover', 'onTelemetry',
      'playNichirinSheathe', 'playSheathe', 'playKaguraChime', 'playSwordDraw',
      'setSwordSfxEnabled', 'setAmbientMode', 'syncCircadianNow',
      'getPrefs', 'isEnabled', 'destroy', 'teardown'
    ];
    for (const k of expectedKeys) {
      assert.strictEqual(typeof api[k], 'function', `API thiếu phương thức ${k}`);
    }
    assert.deepStrictEqual({ ...api.getPrefs() }, {
      enabled: true,
      chimeEnabled: true,
      swordSfxEnabled: true,
      ambientMode: 'off',
      nightCare: true
    });
  });

  it('F10-T1-02 [Tier 1]: Âm cảnh WebAudio 0 KB rain/hearth sử dụng sóng LFO 0.12Hz và dừng sạch khi off', () => {
    const env = createKnyEnv({ hasBeenActive: true });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    // 1. Mưa đêm Điệp Phủ ('rain')
    assert.strictEqual(api.setAmbientMode('rain'), 'rain');
    assert.strictEqual(env.audioTelemetry.contexts.length, 1);
    assert.ok(env.audioTelemetry.bufferSources.some((s) => s.loop === true), 'rain phải tạo BufferSource lặp vô hạn');
    assert.ok(
      env.audioTelemetry.filters.some((f) => f.type === 'lowpass' && f.frequency.value === 510),
      'rain phải có bộ lọc lowpass tại 510Hz'
    );
    assert.ok(
      env.audioTelemetry.oscillators.some((o) => o.type === 'sine' && o.frequency.value === 0.12),
      'rain phải có LFO sine 0.12Hz'
    );

    // 2. Lửa than Khởi Nguyên ('hearth') + tiếng nổ lép bép ngẫu nhiên (1600..4400ms)
    const prevBufSrcCount = env.audioTelemetry.bufferSources.length;
    assert.strictEqual(api.setAmbientMode('hearth'), 'hearth');
    assert.ok(
      env.audioTelemetry.filters.some((f) => f.type === 'lowpass' && f.frequency.value === 265),
      'hearth phải có bộ lọc lowpass tại 265Hz'
    );
    assert.ok(
      env.audioTelemetry.oscillators.filter((o) => o.type === 'sine' && o.frequency.value === 0.12).length >= 2,
      'hearth phải có LFO sine 0.12Hz riêng'
    );
    env.advanceTimers(4500);
    assert.ok(
      env.audioTelemetry.bufferSources.length > prevBufSrcCount + 1,
      'hearth phải phát tiếng nổ lép bép (hearth crackle) trong khoảng 1600-4400ms'
    );

    // 3. Tắt âm cảnh ('off') phải hủy crackle timer và fade out dừng node
    assert.strictEqual(api.setAmbientMode('off'), 'off');
    env.advanceTimers(400); // Hoàn tất 320ms ambientFadeTimer
    const countAfterOff = env.audioTelemetry.bufferSources.length;
    env.advanceTimers(5000);
    assert.strictEqual(env.audioTelemetry.bufferSources.length, countAfterOff, 'Khi ambientMode=off không được phát thêm crackle');
  });

  it('F10-T1-03 [Tier 1]: playKaguraChime tăng masterPeak từ 0.078 lên 0.092 khi document.hidden và luân phiên phrase', () => {
    const env = createKnyEnv({
      hasBeenActive: true,
      audio: { initialState: 'running' }
    });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    // Lượt 1: Tab đang hiển thị (hidden=false, hasFocus=true)
    env.document.hidden = false;
    env.document._focused = true;
    assert.strictEqual(api.playKaguraChime({ force: true }), true);

    const gainL1 = env.audioTelemetry.gains.find((g) =>
      g.gain.history.some((h) => h.method === 'setValueAtTime' && h.args[0] === 0.078)
    );
    assert.ok(gainL1, 'Khi tab đang mở (visible & focused), masterPeak phải bằng 0.078');
    assert.ok(
      env.audioTelemetry.oscillators.some((o) => o.type === 'triangle' && Math.abs(o.frequency.history[0].args[0] - 587.33 * 1.011) < 0.5),
      'Lượt 1 phải dùng cụm ngũ cung KOTO_PHRASES[0] (D5=587.33Hz)'
    );

    // Lượt 2: Alt+Tab nền (document.hidden = true)
    const gainStartIdx = env.audioTelemetry.gains.length;
    const oscStartIdx = env.audioTelemetry.oscillators.length;
    env.document.hidden = true;
    assert.strictEqual(api.playKaguraChime({ force: true }), true);

    const newGains = env.audioTelemetry.gains.slice(gainStartIdx);
    const gainL2 = newGains.find((g) =>
      g.gain.history.some((h) => h.method === 'setValueAtTime' && h.args[0] === 0.092)
    );
    assert.ok(gainL2, 'Khi Alt+Tab (document.hidden=true), masterPeak phải tăng lên 0.092');

    const newOscs = env.audioTelemetry.oscillators.slice(oscStartIdx);
    assert.ok(
      newOscs.some((o) => o.type === 'triangle' && Math.abs(o.frequency.history[0].args[0] - 659.25 * 1.011) < 0.5),
      'Lượt 2 phải xoay vòng sang cụm ngũ cung KOTO_PHRASES[1] (E5=659.25Hz)'
    );
  });

  it('F10-T1-04 [Tier 1]: onTelemetry(snap) prime ở lần đầu, phát Koto khi xong lượt, phát Kachin khi trảm quỷ và giữ running khi đang làm việc', () => {
    const env = createKnyEnv({
      hasBeenActive: true,
      audio: { initialState: 'running' }
    });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    // Lần đầu chỉ prime, không phát âm thanh
    api.onTelemetry({ turnFinishedSeq: 1, slashSeq: 1, isWorking: false });
    assert.strictEqual(env.audioTelemetry.oscillators.length, 0, 'Lần onTelemetry đầu tiên chỉ prime, không được phát tiếng');

    // AI bắt đầu làm việc: giữ AudioContext running và không auto-suspend
    api.onTelemetry({ turnFinishedSeq: 1, slashSeq: 1, isWorking: true });
    assert.strictEqual(env.audioTelemetry.contexts.length, 1);
    const ctx = env.audioTelemetry.contexts[0];
    env.advanceTimers(10000);
    assert.strictEqual(ctx.suspendCount, 0, 'Khi isWorking=true tuyệt đối không được auto-suspend');

    // Tăng turnFinishedSeq -> phát chuông Koto + Furin
    const oscBeforeTurn = env.audioTelemetry.oscillators.length;
    api.onTelemetry({ turnFinishedSeq: 2, slashSeq: 1, isWorking: false });
    assert.ok(env.audioTelemetry.oscillators.length > oscBeforeTurn, 'turnFinishedSeq tăng phải phát chuông Koto');

    // Tăng slashSeq -> phát tiếng tra kiếm Kachin!
    const oscBeforeSlash = env.audioTelemetry.oscillators.length;
    api.onTelemetry({ turnFinishedSeq: 2, slashSeq: 2, isWorking: false });
    assert.ok(
      env.audioTelemetry.oscillators.slice(oscBeforeSlash).some((o) => o.frequency.history[0].args[0] === 2800),
      'slashSeq tăng phải phát Nichirin Sheathe (2800Hz)'
    );
  });

  it('F10-T1-05 [Tier 1]: <agy-circadian-veil> kích hoạt đúng ở đêm khuya (02:30), bình minh (06:05) và tự gỡ lúc ban ngày (15:00)', () => {
    const env = createKnyEnv({ nowDate: new RealDate(2026, 10, 22, 15, 0, 0) });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    const shell = env.document.querySelector('.agy-shell');
    assert.strictEqual(api.syncCircadianNow(new RealDate(2026, 10, 22, 2, 30, 0)), 'night');
    assert.strictEqual(shell.dataset.agyCircadian, 'night');
    assert.strictEqual(env.document.documentElement.dataset.agyCircadian, 'night');
    const veil = env.document.getElementById('agy-kny-circadian-veil');
    assert.ok(veil && veil.tagName === 'AGY-CIRCADIAN-VEIL', 'Phải gắn <agy-circadian-veil>');
    assert.strictEqual(shell.lastElementChild, veil, 'Veil phải nằm cuối .agy-shell');
    assert.ok(veil.children[0] && veil.children[0].tagName === 'I' && veil.children[0].getAttribute('aria-hidden') === 'true');
    assert.ok(env.document.getElementById('agy-kny-circadian-toast'), 'Đêm khuya lần đầu phải hiện toast nhắc nhở');

    assert.strictEqual(api.syncCircadianNow(new RealDate(2026, 10, 22, 6, 5, 0)), 'dawn');
    assert.strictEqual(shell.dataset.agyCircadian, 'dawn');
    assert.ok(env.document.getElementById('agy-kny-dawn-glow-layer'), 'Bình minh 06:05 phải gắn #agy-kny-dawn-glow-layer');

    assert.strictEqual(api.syncCircadianNow(new RealDate(2026, 10, 22, 15, 0, 0)), 'day');
    assert.strictEqual(shell.dataset.agyCircadian, undefined);
    assert.strictEqual(env.document.getElementById('agy-kny-circadian-veil'), null);
    assert.strictEqual(env.document.getElementById('agy-kny-dawn-glow-layer'), null);
  });

  it('F10-T1-06 [Tier 1]: Popover UI dùng DOM thuần an toàn, chuyển chế độ mưa và đồng bộ mute kiếm sang Chibi Aura', () => {
    const syncCalls = [];
    const env = createKnyEnv({
      chibiAura: { setSfxMuted(val) { syncCalls.push(val); } }
    });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    const anchor = env.document.createElement('button');
    env.document.body.appendChild(anchor);
    const pop = api.openPopover(anchor);
    assert.ok(pop && pop.id === 'agy-kny-bio-audio-popover', 'Phải mở popover #agy-kny-bio-audio-popover');

    // Bấm chọn "Mưa Điệp Phủ"
    const rainBtn = pop.querySelectorAll('.agy-ba-seg-btn').find((b) => b.textContent.includes('Mưa Điệp Phủ'));
    assert.ok(rainBtn, 'Phải có nút chọn Mưa Điệp Phủ');
    rainBtn.dispatchEvent({ type: 'click' });
    assert.strictEqual(api.getPrefs().ambientMode, 'rain');
    assert.strictEqual(JSON.parse(env.localStorage.getItem('agy_kny_audio_prefs')).ambientMode, 'rain');

    // Tắt công tắc Tiếng kiếm Nhật Luân Đao
    const switches = pop.querySelectorAll('.agy-ba-switch');
    assert.ok(switches.length >= 2, 'Phải có các switch cấu hình');
    switches[1].dispatchEvent({ type: 'click' }); // swordSfxEnabled switch
    assert.strictEqual(api.getPrefs().swordSfxEnabled, false);
    assert.strictEqual(env.localStorage.getItem('agy_kny_sfx_muted'), '1');
    assert.deepStrictEqual(syncCalls, [true], 'Phải đồng bộ setSfxMuted(true) sang __AGY_KNY_CHIBI_AURA__');
  });

  it('F10-T2-01 [Tier 2]: Tuân thủ Autoplay Policy — tuyệt đối không tạo AudioContext khi chưa có user gesture', () => {
    const env = createKnyEnv({ hasBeenActive: false, audioUnlocked: false });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    api.setAmbientMode('rain');
    api.onTelemetry({ turnFinishedSeq: 1, slashSeq: 1, isWorking: false });
    api.onTelemetry({ turnFinishedSeq: 2, slashSeq: 2, isWorking: false });
    api.playKaguraChime({ force: true });
    api.playNichirinSheathe({ force: true });
    api.playSwordDraw({ force: true });

    assert.strictEqual(env.audioTelemetry.contexts.length, 0, 'Chưa có gesture không được phép khởi tạo AudioContext');
    assert.strictEqual(api.getPrefs().ambientMode, 'rain', 'Vẫn phải lưu lựa chọn ambientMode=rain để tự phát sau gesture');
  });

  it('F10-T2-02 [Tier 2]: Mở khóa AudioContext từ pointerdown/click/keydown và chặn IME composition (isComposing / keyCode=229)', () => {
    for (const gestureEv of [
      { type: 'pointerdown' },
      { type: 'click' },
      { type: 'keydown', key: 'a', keyCode: 65, isComposing: false }
    ]) {
      const env = createKnyEnv({
        hasBeenActive: false,
        localStorage: {
          agy_kny_audio_prefs: JSON.stringify({ enabled: true, ambientMode: 'rain' })
        }
      });
      activeEnvsToClean.push(env);
      env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');

      // Thử gửi sự kiện IME đang gõ tiếng Việt/Nhật trước -> KHÔNG được unlock
      env.document.dispatchEvent({ type: 'keydown', key: 'Process', keyCode: 229, isComposing: false });
      env.document.dispatchEvent({ type: 'keydown', key: 'a', keyCode: 65, isComposing: true });
      assert.strictEqual(env.window.__AGY_AUDIO_UNLOCKED__, undefined, 'Sự kiện IME không được phép unlock audio');
      assert.strictEqual(env.audioTelemetry.contexts.length, 0);

      // Gửi gesture thật
      env.document.dispatchEvent(gestureEv);
      assert.strictEqual(env.window.__AGY_AUDIO_UNLOCKED__, true, `Sự kiện ${gestureEv.type} phải mở khóa __AGY_AUDIO_UNLOCKED__`);
      assert.strictEqual(env.audioTelemetry.contexts.length, 1, `Sự kiện ${gestureEv.type} phải tự bật lại ambient rain đã lưu`);
    }
  });

  it('F10-T2-03 [Tier 2]: Biên chính xác từng phút của Circadian (01:29..06:31), toast 1 lần/ngày và tắt nightCare', () => {
    const env = createKnyEnv({ nowDate: new RealDate(2026, 10, 22, 12, 0, 0) });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    const boundaryCases = [
      [1, 29, 'day'],
      [1, 30, 'night'],
      [5, 54, 'night'],
      [5, 55, 'dawn'],
      [6, 30, 'dawn'],
      [6, 31, 'day']
    ];
    for (const [hh, mm, expected] of boundaryCases) {
      assert.strictEqual(
        api.syncCircadianNow(new RealDate(2026, 10, 22, hh, mm, 0)),
        expected,
        `Mốc ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} phải là "${expected}"`
      );
    }

    // Toast đã hiện ở 01:30 -> đóng rồi gọi lại 02:00 cùng ngày không được tạo lại
    const toast1 = env.document.getElementById('agy-kny-circadian-toast');
    if (toast1) toast1.remove();
    api.syncCircadianNow(new RealDate(2026, 10, 22, 2, 0, 0));
    assert.strictEqual(env.document.getElementById('agy-kny-circadian-toast'), null, 'Toast chỉ được hiển thị 1 lần mỗi ngày');

    // Tắt nightCare qua popover ở 02:00 -> lập tức gỡ veil
    const pop = api.openPopover();
    const nightSwitch = pop.querySelectorAll('.agy-ba-switch')[2];
    nightSwitch.dispatchEvent({ type: 'click' });
    assert.strictEqual(env.document.getElementById('agy-kny-circadian-veil'), null, 'Tắt nightCare phải gỡ ngay lớp veil');
  });

  it('F10-T2-04 [Tier 2]: Bảo vệ Prototype Pollution và JSON hỏng trong localStorage', () => {
    const pollutedPayload = '{"enabled":true,"ambientMode":"<svg onload=1>","__proto__":{"polluted":true},"constructor":{"bad":1}}';
    const env1 = createKnyEnv({ localStorage: { agy_kny_audio_prefs: pollutedPayload } });
    activeEnvsToClean.push(env1);
    env1.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');

    assert.strictEqual(({}).polluted, undefined, 'Không được gây Prototype Pollution');
    assert.strictEqual(env1.window.__AGY_BIO_AUDIO__.getPrefs().ambientMode, 'off', 'ambientMode dị biệt phải fallback về off');

    const env2 = createKnyEnv({ localStorage: { agy_kny_audio_prefs: '{broken-json' } });
    activeEnvsToClean.push(env2);
    env2.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    assert.strictEqual(env2.window.__AGY_BIO_AUDIO__.getPrefs().enabled, true, 'JSON hỏng phải fallback an toàn về DEFAULT_PREFS');
  });

  it('F10-T2-05 [Tier 2]: Debounce SFX, tôn trọng mute ngoài và timeout resume() > 1200ms không bắn trễ', async () => {
    const env = createKnyEnv({
      hasBeenActive: true,
      audio: { initialState: 'suspended', hangResume: true }
    });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    // Khi ctx.resume() treo quá 1200ms rồi mới resolve muộn -> không được tạo oscillator trễ
    api.playKaguraChime();
    env.advanceTimers(1250);
    const ctx = env.audioTelemetry.contexts[0];
    assert.ok(ctx && typeof ctx._deferredResume === 'function');
    ctx._deferredResume();
    await env.flushMicrotasks();
    assert.strictEqual(env.audioTelemetry.oscillators.length, 0, 'Resume quá hạn 1200ms không được bắn chuông trễ');

    // Test debounce & external mute trên môi trường running
    const envRun = createKnyEnv({
      hasBeenActive: true,
      audio: { initialState: 'running' }
    });
    activeEnvsToClean.push(envRun);
    envRun.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const apiRun = envRun.window.__AGY_BIO_AUDIO__;

    assert.strictEqual(apiRun.playKaguraChime(), true);
    assert.strictEqual(apiRun.playKaguraChime(), false, 'Gọi Koto liên tiếp < 900ms phải bị debounce');
    assert.strictEqual(apiRun.playNichirinSheathe(), true);
    assert.strictEqual(apiRun.playNichirinSheathe(), false, 'Gọi Sheathe liên tiếp < 420ms phải bị debounce');
    assert.strictEqual(apiRun.playSwordDraw(), true);
    assert.strictEqual(apiRun.playSwordDraw(), false, 'Gọi SwordDraw liên tiếp < 380ms phải bị debounce');

    envRun.advanceTimers(500);
    envRun.localStorage.setItem('agy_kny_sfx_muted', '1');
    assert.strictEqual(apiRun.playNichirinSheathe(), false, 'agy_kny_sfx_muted=1 phải chặn playNichirinSheathe()');
    assert.strictEqual(apiRun.playSwordDraw(), false, 'agy_kny_sfx_muted=1 phải chặn playSwordDraw()');
  });

  it('F10-T2-06 [Tier 2]: destroy()/teardown() dọn sạch document listeners, statechange listener, timers, DOM và AudioContext', () => {
    const env = createKnyEnv({
      hasBeenActive: true,
      nowDate: new RealDate(2026, 10, 22, 2, 30, 0),
      audio: { initialState: 'running' }
    });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    api.setAmbientMode('hearth');
    api.openPopover();
    assert.ok(env.getDocumentListenerCount() >= 4);
    assert.ok(env.getActiveTimers().length >= 3);

    const ctx = env.audioTelemetry.contexts[0];
    assert.strictEqual(ctx.getListenerCount('statechange'), 1);

    // 1. Re-inject teardown phải giữ lại __AGY_AUDIO_UNLOCKED__
    env.window.__AGY_AUDIO_UNLOCKED__ = true;
    api.destroy({ isReinject: true });
    assert.strictEqual(env.window.__AGY_AUDIO_UNLOCKED__, true, 'isReinject=true phải giữ lại __AGY_AUDIO_UNLOCKED__');
    assert.strictEqual(ctx.closeCount, 1, 'Phải gọi audioCtx.close()');
    assert.strictEqual(ctx.getListenerCount('statechange'), 0, 'Phải gỡ listener statechange trên audioCtx');
    assert.strictEqual(env.getDocumentListenerCount(), 0, 'Phải gỡ toàn bộ listener trên document');
    assert.strictEqual(env.getActiveTimers().length, 0, 'Phải clear toàn bộ timeout & interval đang hoạt động');

    for (const id of [
      'antigravity-kny-bio-audio-style',
      'agy-kny-bio-audio-popover',
      'agy-kny-circadian-toast',
      'agy-kny-circadian-veil',
      'agy-kny-dawn-glow-layer',
      'agy-bio-audio-hud-btn'
    ]) {
      assert.strictEqual(env.document.getElementById(id), null, `Phần tử #${id} phải bị xóa sau destroy`);
    }
    assert.strictEqual(env.document.documentElement.dataset.agyCircadian, undefined);
    assert.strictEqual(env.document.querySelector('.agy-shell').dataset.agyCircadian, undefined);

    // Sau destroy mọi lệnh phát âm thanh phải trả về false
    assert.strictEqual(api.playKaguraChime({ force: true }), false);
    assert.strictEqual(api.playNichirinSheathe({ force: true }), false);
    assert.strictEqual(api.playSwordDraw({ force: true }), false);

    // 2. Full destroy (không phải reinject) phải xóa cả __AGY_AUDIO_UNLOCKED__
    const envFull = createKnyEnv({ hasBeenActive: true, audioUnlocked: true });
    activeEnvsToClean.push(envFull);
    envFull.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    envFull.window.__AGY_BIO_AUDIO__.teardown({ isReinject: false });
    assert.strictEqual(envFull.window.__AGY_AUDIO_UNLOCKED__, undefined, 'Full teardown phải xóa __AGY_AUDIO_UNLOCKED__');
  });

  it('F10-T2-07 [Tier 2]: Khi tắt chuông (chimeEnabled=false) và AI kết thúc lượt (isWorking: true -> false), AudioContext vẫn tự suspend() về 0% CPU', () => {
    const env = createKnyEnv({
      hasBeenActive: true,
      audio: { initialState: 'running' },
      localStorage: {
        agy_kny_audio_prefs: JSON.stringify({
          enabled: true,
          chimeEnabled: false,
          swordSfxEnabled: true,
          ambientMode: 'off',
          nightCare: true
        })
      }
    });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    assert.strictEqual(api.getPrefs().chimeEnabled, false);
    api.onTelemetry({ turnFinishedSeq: 1, slashSeq: 1, isWorking: false });
    api.onTelemetry({ turnFinishedSeq: 1, slashSeq: 1, isWorking: true });
    assert.strictEqual(env.audioTelemetry.contexts.length, 1);
    const ctx = env.audioTelemetry.contexts[0];
    assert.strictEqual(ctx.suspendCount, 0);

    // Kết thúc lượt khi chimeEnabled=false -> playKaguraChime() trả false -> phải kích hoạt auto-suspend sau ~3.5s
    api.onTelemetry({ turnFinishedSeq: 2, slashSeq: 1, isWorking: false });
    env.advanceTimers(4000);
    assert.ok(ctx.suspendCount >= 1, 'AudioContext phải tự suspend() sau khi AI xong lượt dù chimeEnabled=false');
  });

  it('F10-T2-08 [Tier 2 — BUG-AUDIO-01]: Gọi phát âm thanh trước gesture unlock không được ghi debounce làm nuốt tiếng ngay sau pointerdown', () => {
    const env = createKnyEnv({
      hasBeenActive: false,
      audioUnlocked: false,
      audio: { initialState: 'running' }
    });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    // Trước khi có user gesture: mọi hàm trả false và không được ghi lastChimeAt/lastSheatheAt/lastDrawAt
    assert.strictEqual(api.playKaguraChime(), false);
    assert.strictEqual(api.playNichirinSheathe(), false);
    assert.strictEqual(api.playSwordDraw(), false);
    assert.strictEqual(env.audioTelemetry.contexts.length, 0);

    // Sau 100ms (< 900ms / 420ms / 380ms), người dùng thực hiện gesture pointerdown
    env.advanceTimers(100);
    env.document.dispatchEvent({ type: 'pointerdown' });
    assert.strictEqual(env.window.__AGY_AUDIO_UNLOCKED__, true);

    const oscBefore = env.audioTelemetry.oscillators.length;
    assert.strictEqual(api.playKaguraChime(), true, 'Sau gesture 100ms, playKaguraChime() không được bị nuốt bởi debounce');
    assert.ok(env.audioTelemetry.oscillators.length > oscBefore, 'playKaguraChime() phải lập lịch WebAudio oscillators');

    const oscBeforeSheathe = env.audioTelemetry.oscillators.length;
    assert.strictEqual(api.playNichirinSheathe(), true, 'Sau gesture 100ms, playNichirinSheathe() không được bị nuốt bởi debounce');
    assert.ok(env.audioTelemetry.oscillators.length > oscBeforeSheathe);

    const bufBeforeDraw = env.audioTelemetry.bufferSources.length;
    assert.strictEqual(api.playSwordDraw(), true, 'Sau gesture 100ms, playSwordDraw() không được bị nuốt bởi debounce');
    assert.ok(env.audioTelemetry.bufferSources.length > bufBeforeDraw);
  });

  it('F10-T2-09 [Tier 2 — BUG-AUDIO-02]: Khi ctx.state === suspended và resume() bị reject, playKaguraChime() không trả true sai và không ghi debounce', async () => {
    const env = createKnyEnv({
      hasBeenActive: true,
      audio: { initialState: 'suspended', rejectResume: true }
    });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    const ret = api.playKaguraChime();
    assert.strictEqual(ret, false, 'Khi AudioContext chưa running (suspended / resume bị chặn), không được trả true đồng bộ');
    await env.flushMicrotasks(6);
    assert.strictEqual(env.audioTelemetry.oscillators.length, 0, 'Khi resume() bị reject, tuyệt đối không tạo WebAudio nodes');

    // 100ms sau, AudioContext được mở khóa sang running -> gọi lại phải phát bình thường (không bị debounce từ lần fail)
    env.advanceTimers(100);
    const ctx = env.audioTelemetry.contexts[0];
    ctx._allowResumeAfterReject = true;
    ctx.state = 'running';
    assert.strictEqual(api.playKaguraChime(), true, 'Lần gọi hợp lệ ngay sau resume() reject không được bị chặn debounce');
    assert.ok(env.audioTelemetry.oscillators.length > 0, 'Phải tạo oscillators khi AudioContext đã running');
  });

  it('F10-T1-07 [v3.5]: playBiwaPluck() & playKasugaiHeraldChime(kind) tổng hợp WebAudio 0KB chuẩn xác và tuân thủ chuông Kagura', () => {
    const env = createKnyEnv({
      hasBeenActive: true,
      audio: { initialState: 'running' }
    });
    activeEnvsToClean.push(env);
    env.loadModule(BIO_AUDIO_SRC, 'kny_bio_audio.js');
    const api = env.window.__AGY_BIO_AUDIO__;

    const osc0 = env.audioTelemetry.oscillators.length;
    const buf0 = env.audioTelemetry.bufferSources.length;
    assert.strictEqual(api.playBiwaPluck({ semitone: 2 }), true, 'playBiwaPluck phải phát thành công khi chimeEnabled=true');
    assert.ok(env.audioTelemetry.oscillators.length >= osc0 + 2, 'playBiwaPluck phải tạo ít nhất 2 oscillators dây đàn sawari');
    assert.ok(env.audioTelemetry.bufferSources.length >= buf0 + 1, 'playBiwaPluck phải tạo bachi plectrum snap');

    for (const kind of ['chuntaro', 'kaburamaru', 'butterfly', 'crow']) {
      env.advanceTimers(650);
      const before = env.audioTelemetry.oscillators.length;
      assert.strictEqual(api.playKasugaiHeraldChime(kind), true, `playKasugaiHeraldChime("${kind}") phải trả true`);
      assert.ok(env.audioTelemetry.oscillators.length > before, `playKasugaiHeraldChime("${kind}") phải tạo WebAudio oscillators`);
    }

    // Khi tắt chuông Kagura (toggle -> enabled=false), cả Biwa và Herald đều im lặng tuyệt đối
    env.advanceTimers(700);
    api.toggle();
    assert.strictEqual(api.isEnabled(), false);
    assert.strictEqual(api.playBiwaPluck(), false, 'Tắt chuông Kagura phải chặn playBiwaPluck');
    assert.strictEqual(api.playKasugaiHeraldChime('chuntaro'), false, 'Tắt chuông Kagura phải chặn playKasugaiHeraldChime');
  });
});

/* ============================================================================
 * 4. NHÓM F11 — 16 CHẾ ĐỘ HẠT FX 4K & RESIZE CLAMP (kny_fx_modes.js)
 * ============================================================================ */

describe('F11 — 16 chế độ hạt FX 4K & resize clamp (kny_fx_modes.js)', () => {
  const MODES_16 = [
    'royal_wisteria', 'wisteria', 'water', 'flame', 'sound', 'mist',
    'love', 'serpent', 'wind', 'stone', 'sun_water', 'nezuko',
    'thunder', 'beast', 'sun', 'moon'
  ];

  it('F11-T1-01 [Tier 1]: Đủ 16 SUPPORTED_MODES, .has() và shortcut methods cho từng mode', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
    const factory = env.window.__AGY_KNY_FX_DRAWERS__;

    assert.strictEqual(typeof factory, 'function');
    assert.ok(Array.isArray(factory.modes) && factory.modes.length === 16, 'factory.modes phải có đúng 16 mode');
    for (const m of MODES_16) {
      assert.ok(factory.modes.includes(m), `Thiếu mode "${m}"`);
      assert.strictEqual(factory.has(m), true, `factory.has("${m}") phải trả về true`);
      assert.strictEqual(typeof factory[m], 'function', `Thiếu shortcut factory.${m}`);
    }
  });

  it('F11-T1-02 [Tier 1]: Chuẩn hóa tên mode, 3 alias (wisteria_royal, solar, shadow) và fallback về wisteria', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
    const factory = env.window.__AGY_KNY_FX_DRAWERS__;

    assert.strictEqual(factory.create('wisteria_royal', 1280, 720).mode, 'royal_wisteria');
    assert.strictEqual(factory.create('solar', 1280, 720).mode, 'sun');
    assert.strictEqual(factory.create('shadow', 1280, 720).mode, 'moon');
    assert.strictEqual(factory.create('  ROYAL_WISTERIA  ', 1280, 720).mode, 'royal_wisteria');
    assert.strictEqual(factory.create('mode_khong_hop_le', 1280, 720).mode, 'wisteria');
    assert.strictEqual(factory.create('', 1280, 720).mode, 'wisteria');
  });

  it('F11-T1-03 [Tier 1]: Hợp đồng createDrawerInstance, các chữ ký gọi và WeakMap direct cache', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
    const factory = env.window.__AGY_KNY_FX_DRAWERS__;
    const spy = createCanvas2DSpy(1280, 720);

    // Chữ ký object { width, height, ctx }
    const dObj = factory('water', { width: 1280, height: 720, ctx: spy });
    for (const prop of ['resize', 'resetClock', 'render', 'draw', 'frame', 'drawStatic', 'renderStatic', 'drawStaticGlowFrame']) {
      assert.strictEqual(typeof dObj[prop], 'function', `Drawer thiếu phương thức .${prop}`);
    }
    dObj(1000);
    assert.ok(spy.drawnOps.length > 0, 'Gọi trực tiếp callableDrawer(now) phải vẽ ra canvas');

    // Chữ ký function () => ({ width, height })
    const dFn = factory.create(() => ({ width: 800, height: 600 }), 800, 600);
    assert.strictEqual(dFn.mode, 'wisteria');
    const dFnValid = factory.create('moon', () => ({ width: 800, height: 600 }));
    assert.strictEqual(dFnValid.mode, 'moon');
    dFnValid.drawStatic(spy);

    // Direct draw + WeakMap cache trên cùng canvas
    const spyDirect = createCanvas2DSpy(1280, 720);
    const cached1 = factory('flame', spyDirect, 1280, 720, 1000);
    const cached2 = factory('flame', spyDirect, 1280, 720, 1016.6667);
    assert.strictEqual(cached1, cached2, 'Cùng (canvas, mode) phải tái sử dụng drawer qua WeakMap cache');
  });

  it('F11-T1-04 [Tier 1]: Render drawStatic + 5 frame cho toàn bộ 16 modes ở 1920x1080 không lỗi, không NaN, gradient hợp lệ', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
    const factory = env.window.__AGY_KNY_FX_DRAWERS__;

    for (const mode of MODES_16) {
      const spy = createCanvas2DSpy(1920, 1080);
      const drawer = factory.create(mode, 1920, 1080);
      drawer.drawStatic(spy, 1920, 1080);
      for (let f = 0; f < 5; f++) {
        drawer.render(spy, 1920, 1080, 1000 + f * 16.6667);
      }
      assert.strictEqual(
        spy.nonFiniteCalls.length,
        0,
        `Mode "${mode}" phát sinh tọa độ/tham số NaN hoặc Infinity: ${JSON.stringify(spy.nonFiniteCalls)}`
      );
      assert.strictEqual(
        spy.invalidGradientCalls.length,
        0,
        `Mode "${mode}" gọi createRadialGradient với r1 <= r0: ${JSON.stringify(spy.invalidGradientCalls)}`
      );
      assert.ok(spy.drawnOps.length > 10, `Mode "${mode}" phải thực hiện các lệnh vẽ thật lên Canvas2D`);
    }
  });

  it('F11-T1-05 [Tier 1]: Tích hợp window.__AGY_TRANSPARENT_WORLD__ giảm alpha 35% (0.65) và giảm tốc độ hạt xuống 20%', () => {
    function runWaterAtTw(twVal) {
      const env = createKnyEnv({ mountShell: false });
      env.window.__AGY_TRANSPARENT_WORLD__ = twVal;
      env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
      const spy = createCanvas2DSpy(1280, 720);
      const drawer = env.window.__AGY_KNY_FX_DRAWERS__.create('water', 1280, 720);

      drawer.render(spy, 1280, 720, 1000);
      const f1Arcs = spy.drawnOps.filter((o) => o.op === 'arc' && o.r > 2 && o.r < 7 && o.tx === 0 && o.ty === 0);
      const opsBeforeF2 = spy.drawnOps.length;

      drawer.render(spy, 1280, 720, 1016.6667);
      const f2Ops = spy.drawnOps.slice(opsBeforeF2);
      const f2Arcs = f2Ops.filter((o) => o.op === 'arc' && o.r > 2 && o.r < 7 && o.tx === 0 && o.ty === 0);
      return { f1Arcs, f2Arcs, f2Ops };
    }

    const normal = runWaterAtTw(0);
    const slow = runWaterAtTw(1);

    // Ở chế độ tw=1, globalAlpha trong frame phải bằng 0.65 (giảm 35%)
    assert.ok(
      slow.f2Ops.some((o) => o.op === 'arc' && Math.abs(o.globalAlpha - 0.65) < 1e-6),
      'Khi __AGY_TRANSPARENT_WORLD__=1, globalAlpha khi vẽ hạt phải bằng 0.65'
    );
    assert.ok(
      normal.f2Ops.some((o) => o.op === 'arc' && Math.abs(o.globalAlpha - 1.0) < 1e-6),
      'Khi __AGY_TRANSPARENT_WORLD__=0, globalAlpha phải giữ nguyên 1.0'
    );

    const dyNormal = Math.abs(normal.f2Arcs[0].y - normal.f1Arcs[0].y);
    const dySlow = Math.abs(slow.f2Arcs[0].y - slow.f1Arcs[0].y);
    assert.ok(dyNormal > 0, 'Bọt nước phải di chuyển giữa 2 frame');
    assert.ok(
      Math.abs((dySlow / dyNormal) - 0.2) < 0.01,
      `Tỷ lệ vận tốc khi __AGY_TRANSPARENT_WORLD__=1 phải là 0.2 (20%), thực tế=${(dySlow / dyNormal).toFixed(4)}`
    );
  });

  it('F11-T1-06 [Tier 1]: Phục hồi delta về 1/60s khi elapsedMs > 250 (sau pause GPU Arbiter) và resetClock()', () => {
    function runSequence(secondTimestamp) {
      const env = createKnyEnv({ mountShell: false });
      env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
      const spy = createCanvas2DSpy(1280, 720);
      const drawer = env.window.__AGY_KNY_FX_DRAWERS__.create('water', 1280, 720);
      drawer.render(spy, 1280, 720, 1000);
      const beforeF2 = spy.drawnOps.length;
      drawer.render(spy, 1280, 720, secondTimestamp);
      const f2Arcs = spy.drawnOps.slice(beforeF2).filter((o) => o.op === 'arc' && o.r > 2 && o.r < 7 && o.tx === 0 && o.ty === 0);
      return { f2Arcs, drawer, spy };
    }

    const normal = runSequence(1016.6667);
    const afterLongPause = runSequence(25000); // elapsedMs = 24000 > 250ms

    assert.ok(
      Math.abs(normal.f2Arcs[0].y - afterLongPause.f2Arcs[0].y) < 1e-6,
      'Sau khoảng pause > 250ms, bước nhảy tọa độ hạt phải khớp mức 1/60s, không bị vọt'
    );

    // Kiểm tra resetClock() đưa lastNow về 0 -> frame tiếp theo sau resetClock dùng đúng 1/60s
    afterLongPause.drawer.resetClock();
    const beforeResetF = afterLongPause.spy.drawnOps.length;
    afterLongPause.drawer.render(afterLongPause.spy, 1280, 720, 999999);
    const postResetArcs = afterLongPause.spy.drawnOps.slice(beforeResetF).filter((o) => o.op === 'arc' && o.r > 2 && o.r < 7);
    assert.ok(postResetArcs.length > 0 && Number.isFinite(postResetArcs[0].y));
  });

  it('F11-T2-01 [Tier 2]: Khởi tạo e.y ban đầu hợp lệ cho flame và sun_water trước frame 1 và scale đúng khi resize sớm', () => {
    for (const targetMode of ['flame', 'sun_water']) {
      const env = createKnyEnv({ mountShell: false });
      env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');

      // Bắt mảng pool thật ngay trong sandbox VM khi createDrawerInstance khởi tạo scene
      const capturedPools = vm.runInContext(`(() => {
        const pools = [];
        const origPush = Array.prototype.push;
        Array.prototype.push = function(...args) {
          if (args.length === 1 && args[0] && typeof args[0] === 'object' && 'life' in args[0]) {
            if (!pools.includes(this)) pools.push(this);
          }
          return origPush.apply(this, args);
        };
        try {
          const drawer = window.__AGY_KNY_FX_DRAWERS__.create(${JSON.stringify(targetMode)}, 1280, 720);
          const beforeResize = pools[0].map((e) => ({ x: e.x, y: e.y, life: e.life }));
          drawer.resize(640, 360);
          const afterResize = pools[0].map((e) => ({ x: e.x, y: e.y, life: e.life }));
          return { poolCount: pools.length, beforeResize, afterResize };
        } finally {
          Array.prototype.push = origPush;
        }
      })()`, env.vmCtx);

      assert.ok(capturedPools.poolCount >= 1 && capturedPools.beforeResize.length >= 18, `Phải bắt được pool hạt của ${targetMode}`);
      for (let i = 0; i < capturedPools.beforeResize.length; i++) {
        const e = capturedPools.beforeResize[i];
        assert.strictEqual(
          typeof e.y,
          'number',
          `Mode "${targetMode}" hạt #${i} phải khởi tạo sẵn thuộc tính số e.y trước frame 1`
        );
        assert.ok(
          Number.isFinite(e.y) && e.y >= 0 && e.y <= 720,
          `Mode "${targetMode}" hạt #${i} có e.y=${e.y} nằm ngoài khoảng hợp lệ [0, 720]`
        );
        const expectedScaledY = e.y * 0.5;
        assert.ok(
          Math.abs(capturedPools.afterResize[i].y - expectedScaledY) < 1e-4,
          `Sau resize(640, 360) trước frame 1, e.y của ${targetMode} phải được scale theo tỷ lệ 0.5`
        );
      }
    }
  });

  it('F11-T2-02 [Tier 2]: resize(nw, nh) ngay khi vừa khởi tạo (trước frame 1) cho cả 16 modes không NaN & clamp đúng biên', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
    const factory = env.window.__AGY_KNY_FX_DRAWERS__;

    for (const mode of MODES_16) {
      const spy = createCanvas2DSpy(320, 240);
      const drawer = factory.create(mode, 2560, 1440);
      drawer.resize(420, 260);
      drawer.resize(320, 240);
      drawer.drawStatic(spy);
      drawer.render(spy, 1000);
      drawer.render(spy, 1016.6667);

      assert.strictEqual(spy.nonFiniteCalls.length, 0, `Mode "${mode}" phát sinh NaN/Infinity sau resize trước frame 1`);
      assert.strictEqual(spy.invalidGradientCalls.length, 0, `Mode "${mode}" có gradient lỗi sau resize trước frame 1`);

      if (mode === 'water') {
        // Các gợn sóng ripples của water (translate có ty gần đáy nh=240) phải bám đáy [200, 240]
        const rippleTranslates = spy.drawnOps.filter((o) => o.op === 'translate' && o.y > 180);
        assert.ok(
          rippleTranslates.length >= 4 && rippleTranslates.every((o) => o.y >= 200 && o.y <= 245),
          'Ripples của mode water sau resize(320, 240) phải bám đúng đáy 240px'
        );
      }
    }
  });

  it('F11-T2-03 [Tier 2]: Clamp kích thước tối thiểu 320x240 và an toàn khi ctx thiếu hoặc không hợp lệ', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
    const factory = env.window.__AGY_KNY_FX_DRAWERS__;
    const spy = createCanvas2DSpy(320, 240);

    const drawer = factory.create('wisteria', 0, 0);
    drawer.resize(-999, -999);
    drawer.resize(Number.NaN, Number.POSITIVE_INFINITY);
    drawer.render(spy, 1000);
    assert.deepStrictEqual(spy.clearRectCalls[0], { x: 0, y: 0, w: 320, h: 240 }, 'Kích thước phải bị clamp tối thiểu về 320x240');

    // Gọi render/drawStatic với ctx thiếu hoặc object giả không đủ beginPath/clearRect -> không ném ngoại lệ
    assert.doesNotThrow(() => {
      drawer.render(null, 1000);
      drawer.render({}, 1000);
      drawer.render({ clearRect() {} }, 1000);
      drawer.drawStatic(null);
      drawer.drawStatic({});
    });
  });

  it('F11-T2-04 [Tier 2]: Biên thời gian now (lùi giờ, NaN, delta=1ms, delta=150ms) không NaN và không nhảy vọt tọa độ', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
    const factory = env.window.__AGY_KNY_FX_DRAWERS__;
    const spy = createCanvas2DSpy(1280, 720);
    const drawer = factory.create('wind', 1280, 720);

    for (const t of [1000, 500, Number.NaN, 1001, 1151, 2000]) {
      drawer.render(spy, 1280, 720, t);
    }
    assert.strictEqual(spy.nonFiniteCalls.length, 0, 'Các mốc thời gian biên/NaN/lùi giờ không được gây lỗi NaN trên Canvas');
    assert.strictEqual(spy.invalidGradientCalls.length, 0);
  });

  it('F11-T2-05 [Tier 2]: Biên giá trị window.__AGY_TRANSPARENT_WORLD__ (-5, 99, "0.5", NaN, null)', () => {
    const cases = [
      [-5, 1.0],
      [Number.NaN, 1.0],
      [null, 1.0],
      ['0.5', 0.825],
      [99, 0.65]
    ];

    for (const [rawTw, expectedAlpha] of cases) {
      const env = createKnyEnv({ mountShell: false });
      env.window.__AGY_TRANSPARENT_WORLD__ = rawTw;
      env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
      const spy = createCanvas2DSpy(1280, 720);
      const drawer = env.window.__AGY_KNY_FX_DRAWERS__.create('water', 1280, 720);
      drawer.render(spy, 1280, 720, 1000);

      assert.ok(
        spy.drawnOps.some((o) => o.op === 'arc' && Math.abs(o.globalAlpha - expectedAlpha) < 1e-6),
        `__AGY_TRANSPARENT_WORLD__=${String(rawTw)} phải cho globalAlpha=${expectedAlpha}`
      );
    }
  });

  it('F11-T2-06 [Tier 2]: Mode thunder phát tia micro-arc strictly ở rìa ngoài và tôn trọng tùy chọn autoClear: false', () => {
    const env = createKnyEnv({ mountShell: false });
    env.loadModule(FX_MODES_SRC, 'kny_fx_modes.js');
    const factory = env.window.__AGY_KNY_FX_DRAWERS__;

    // 1. autoClear: false không gọi clearRect
    const spyNoClear = createCanvas2DSpy(1280, 720);
    const dNoClear = factory.create('thunder', { width: 1280, height: 720, ctx: spyNoClear, autoClear: false });
    dNoClear.drawStatic();
    dNoClear.render(1000);
    assert.strictEqual(spyNoClear.clearRectCalls.length, 0, 'Khi autoClear=false không được gọi ctx.clearRect');

    // 2. Kích hoạt micro-arc qua các mốc thời gian (> 1800ms theo simNow, mỗi bước 50ms không bị clamp)
    const spyArc = createCanvas2DSpy(1280, 720);
    const dThunder = factory.create('thunder', 1280, 720);
    let lineMoveOps = [];
    for (let t = 1000; t <= 3500; t += 50) {
      const prevLen = spyArc.drawnOps.length;
      dThunder.render(spyArc, 1280, 720, t);
      const slice = spyArc.drawnOps.slice(prevLen);
      const moves = slice.filter((o) => o.op === 'moveTo' || o.op === 'lineTo');
      if (moves.length > 0) lineMoveOps = lineMoveOps.concat(moves);
    }

    assert.ok(lineMoveOps.length >= 7, 'thunder phải kích hoạt vẽ tia sét micro-arc');
    for (const pt of lineMoveOps) {
      const inOuterMargin = pt.worldX < 1280 * 0.25 || pt.worldX > 1280 * 0.75;
      assert.ok(
        inOuterMargin,
        `Điểm tia sét tại x=${pt.worldX.toFixed(1)} phải nằm ở rìa ngoài (<320 hoặc >960), tránh che vùng trung tâm`
      );
    }
  });
});
