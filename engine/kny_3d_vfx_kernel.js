(() => {
  'use strict';

  /* Kimetsu no Yaiba — Hybrid Micro-WebGL2 3D Ribbon & Z-Sandwich VFX Kernel (Option C) */
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const isFn = (f) => typeof f === 'function';
  const isFin = Number.isFinite;
  const { PI, sin, cos, tan, atan2, hypot, abs, min, max, floor, pow, sqrt } = Math;

  if (ROOT && ROOT.__AGY_KNY_3D_VFX__ && isFn(ROOT.__AGY_KNY_3D_VFX__.destroy)) {
    try { ROOT.__AGY_KNY_3D_VFX__.destroy({ isReinject: true }); } catch (_) {}
  }

  const TAU = PI * 2, HP = PI * 0.5, D2R = PI / 180;
  const REF_Z = 760, REF_TAN = tan(25 * D2R), LEASE_MS = 30000, BUDGET_MS = 24;
  const SW_RE = /swiftshader|llvmpipe|softpipe|software|basic render|virtualbox|vmware/i;

  const A0 = 'HELICAL_DRAGON', A1 = 'MULTI_RING_VORTEX', A2 = 'Z_SEVER_THRUST', A3 = 'SPHERICAL_DOMAIN';
  const A4 = 'ORBITAL_CHAINS_RIBBONS', A5 = 'PRIMORDIAL_SUN_13', A6 = 'RADIAL_PRISM_BARRAGE', A7 = 'LAYERED_PARALLAX_SWEEP';
  const ARCHETYPES = Object.freeze({
    HELICAL_DRAGON: A0, MULTI_RING_VORTEX: A1, Z_SEVER_THRUST: A2, SPHERICAL_DOMAIN: A3,
    ORBITAL_CHAINS_RIBBONS: A4, PRIMORDIAL_SUN_13: A5, RADIAL_PRISM_BARRAGE: A6, LAYERED_PARALLAX_SWEEP: A7
  });

  /* 1. 3D MATH & CINEMATIC CAMERA RIG (ZERO GC) */
  const _proj = new Float32Array(16), _view = new Float32Array(16), _vp = new Float32Array(16);
  const _eye = new Float32Array([0, 0, REF_Z]), _tgt = new Float32Array([0, 0, 0]), _up = new Float32Array([0, 1, 0]);

  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease3 = (t) => { const u = 1 - clamp(t, 0, 1); return 1 - u * u * u; };
  const ease5 = (t) => { const u = 1 - clamp(t, 0, 1); return 1 - u * u * u * u * u; };
  const easeS = (t) => -(cos(PI * clamp(t, 0, 1)) - 1) * 0.5;
  const seeded = (i, s) => { const x = sin((i + 1) * 12.9898 + (s || 1) * 78.233) * 43758.5453; return x - floor(x); };
  const rgba = (rgb, a) => `rgba(${rgb},${clamp(a, 0, 1).toFixed(3)})`;

  function hexInt(hex) {
    const c = String(hex || '#ffffff').replace('#', '');
    const f = c.length === 3 ? c[0] + c[0] + c[1] + c[1] + c[2] + c[2] : c.padEnd(6, 'f');
    const n = parseInt(f.slice(0, 6), 16);
    return Number.isNaN(n) ? 0xffffff : n;
  }
  function hexVec3(hex, out, o) {
    const n = hexInt(hex), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    if (out) { out[o] = r; out[o + 1] = g; out[o + 2] = b; return out; }
    return new Float32Array([r, g, b]);
  }
  const hexCss = (hex) => { const n = hexInt(hex); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };

  const hasOwn = (o, k) => Boolean(o && Object.prototype.hasOwnProperty.call(o, k));
  const normW = (w) => { const n = Number(w); return n > 0 && isFin(n) ? max(1, n) : 1440; };
  const normH = (h) => { const n = Number(h); return n > 0 && isFin(n) ? max(1, n) : 900; };

  function mat4Perspective(fovRad, aspect, near, far, out) {
    const m = out || new Float32Array(16), f = 1 / tan(clamp(Number(fovRad) || 0.87, 0.25, 2.2) * 0.5);
    const n = isFin(near) ? near : 20, fa = (isFin(far) && abs(far - n) > 1e-5) ? far : n + 1000, nf = 1 / (n - fa);
    m.fill(0);
    m[0] = f / (aspect > 0 && isFin(aspect) ? aspect : 1.6); m[5] = f; m[10] = (fa + n) * nf; m[11] = -1; m[14] = 2 * fa * n * nf;
    return m;
  }

  function mat4LookAt(e, t, u, out) {
    const m = out || new Float32Array(16);
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2], l = hypot(zx, zy, zz);
    if (l < 1e-6) zz = 1; else { zx /= l; zy /= l; zz /= l; }
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
    l = hypot(xx, xy, xz);
    if (l < 1e-6) { xx = 1; xy = 0; xz = 0; } else { xx /= l; xy /= l; xz /= l; }
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    m[0] = xx; m[4] = xy; m[8] = xz; m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
    m[1] = yx; m[5] = yy; m[9] = yz; m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
    m[2] = zx; m[6] = zy; m[10] = zz; m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
    m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
    return m;
  }

  function mat4Multiply(a, b, out) {
    const m = out || new Float32Array(16);
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7];
    const a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11], a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15];
    for (let c = 0; c < 4; c++) {
      const i = c * 4, b0 = b[i], b1 = b[i + 1], b2 = b[i + 2], b3 = b[i + 3];
      m[i] = b0 * a0 + b1 * a4 + b2 * a8 + b3 * a12;
      m[i + 1] = b0 * a1 + b1 * a5 + b2 * a9 + b3 * a13;
      m[i + 2] = b0 * a2 + b1 * a6 + b2 * a10 + b3 * a14;
      m[i + 3] = b0 * a3 + b1 * a7 + b2 * a11 + b3 * a15;
    }
    return m;
  }

  function projectPoint3D(x, y, z, vpMat, w, h) {
    const m = vpMat || _vp, vw = normW(w), vh = normH(h);
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (!(cw > 12)) return { sx: vw * 0.5, sy: vh * 0.5, zCam: cw || 0, scale: 0, visible: false };
    const iw = 1 / cw, nx = cx * iw, ny = cy * iw, fc = hypot(m[1], m[5], m[9]) || (1 / REF_TAN);
    return {
      sx: (nx * 0.5 + 0.5) * vw, sy: (0.5 - ny * 0.5) * vh, zCam: cw,
      scale: clamp((REF_Z * REF_TAN * fc) / cw, 0.06, 6.5),
      visible: nx >= -1.85 && nx <= 1.85 && ny >= -1.85 && ny <= 1.85
    };
  }

  function computeCameraState(rawP, arch, opts) {
    const o = opts || {}, p = clamp(Number(rawP) || 0, 0, 1);
    const w = normW(o.width), h = normH(o.height);
    let fovDeg = 50, dz = REF_Z, yaw = 0, pitch = 0, rollDeg = 0;
    if (!o.reducedMotion) {
      const pk = arch === A2 ? 66 : (arch === A5 ? 65 : (arch === A0 ? 62 : 59));
      if (p < 0.12) { const c = easeS(p / 0.12); fovDeg = lerp(50, 41.5, c); dz = lerp(REF_Z, 825, c); }
      else if (p < 0.24) { const b = ease3((p - 0.12) / 0.12); fovDeg = lerp(41.5, pk, b); dz = lerp(825, 690, b); }
      else if (p < 0.52) { const s = (p - 0.24) / 0.28; fovDeg = lerp(pk, pk - 3.5, s); dz = lerp(690, 725, s); }
      else { const r = easeS((p - 0.52) / 0.48); fovDeg = lerp(pk - 3.5, 50, r); dz = lerp(725, REF_Z, r); }
      const sw = sin(p * PI), dir = (arch === A2 || arch === A6) ? -1 : 1;
      yaw = sin(p * TAU * 0.85) * 0.13 * sw * dir;
      pitch = (arch === A3 ? 0.08 : 0.05 * cos(p * PI * 1.4)) * sw;
      if (p >= 0.16 && p <= 0.68) rollDeg = sin(((p - 0.16) / 0.52) * PI) * (arch === A3 ? 3.5 : 9.2) * dir;
    }
    const fovRad = fovDeg * D2R, rr = rollDeg * D2R, cp = cos(pitch);
    _eye[0] = sin(yaw) * cp * dz; _eye[1] = sin(pitch) * dz + (o.reducedMotion ? 8 : 0); _eye[2] = cos(yaw) * cp * dz;
    _tgt[0] = 0; _tgt[1] = 0; _tgt[2] = -24; _up[0] = sin(rr); _up[1] = cos(rr); _up[2] = 0;
    mat4Perspective(fovRad, w / h, 20, 3200, _proj);
    mat4LookAt(_eye, _tgt, _up, _view);
    mat4Multiply(_proj, _view, _vp);
    return { fovDeg, fovRad, rollDeg, yaw, pitch, eyeX: _eye[0], eyeY: _eye[1], eyeZ: _eye[2], vpMat: _vp };
  }

  /* 2. BISHOP PARALLEL TRANSPORT RIBBON MESH (T, N, B) */
  const STRIDE = 9, MAX_V = 4096, MAX_Q = 1800;
  const CP = new Float32Array(96 * 3), CW = new Float32Array(96), CA = new Float32Array(96), CT = new Float32Array(96), TG = new Float32Array(96 * 3);
  const RV = new Float32Array(MAX_V * STRIDE), QP = new Float32Array(MAX_Q * 10), QO = new Int32Array(MAX_Q);
  let RVC = 0;

  function setNode(i, x, y, z, w, a, tw) {
    const k = i * 3; CP[k] = x; CP[k + 1] = y; CP[k + 2] = z; CW[i] = w; CA[i] = a; CT[i] = tw;
  }
  function pushV(x, y, z, nx, ny, nz, u, v, a) {
    if (RVC >= MAX_V) return;
    const o = RVC * STRIDE;
    RV[o] = x; RV[o + 1] = y; RV[o + 2] = z; RV[o + 3] = nx; RV[o + 4] = ny; RV[o + 5] = nz; RV[o + 6] = u; RV[o + 7] = v; RV[o + 8] = a;
    RVC++;
  }

  function appendRibbon(cnt) {
    if (cnt < 2 || RVC + cnt * 2 + 2 >= MAX_V) return;
    for (let i = 0; i < cnt; i++) {
      const i0 = (i > 0 ? i - 1 : 0) * 3, i1 = (i < cnt - 1 ? i + 1 : cnt - 1) * 3;
      let tx = CP[i1] - CP[i0], ty = CP[i1 + 1] - CP[i0 + 1], tz = CP[i1 + 2] - CP[i0 + 2], l = hypot(tx, ty, tz);
      if (l < 1e-5) { tx = 1; ty = 0; tz = 0; } else { tx /= l; ty /= l; tz /= l; }
      const k = i * 3; TG[k] = tx; TG[k + 1] = ty; TG[k + 2] = tz;
    }
    const ux = abs(TG[1]) < 0.92 ? 0 : 1, uy = 1 - ux;
    let bx = -TG[2] * uy, by = TG[2] * ux, bz = TG[0] * uy - TG[1] * ux, bl = hypot(bx, by, bz) || 1;
    bx /= bl; by /= bl; bz /= bl;
    let nx = by * TG[2] - bz * TG[1], ny = bz * TG[0] - bx * TG[2], nz = bx * TG[1] - by * TG[0];
    const stitch = RVC > 0;

    for (let i = 0; i < cnt; i++) {
      const k = i * 3, tx = TG[k], ty = TG[k + 1], tz = TG[k + 2];
      if (i > 0) {
        const px = TG[k - 3], py = TG[k - 2], pz = TG[k - 1];
        const vx = py * tz - pz * ty, vy = pz * tx - px * tz, vz = px * ty - py * tx, sA = hypot(vx, vy, vz), cA = clamp(px * tx + py * ty + pz * tz, -1, 1);
        if (sA > 1e-5) {
          const kx = vx / sA, ky = vy / sA, kz = vz / sA, ox = nx, oy = ny, oz = nz, kd = (kx * ox + ky * oy + kz * oz) * (1 - cA);
          nx = ox * cA + (ky * oz - kz * oy) * sA + kx * kd;
          ny = oy * cA + (kz * ox - kx * oz) * sA + ky * kd;
          nz = oz * cA + (kx * oy - ky * ox) * sA + kz * kd;
        }
        const dt = nx * tx + ny * ty + nz * tz;
        nx -= tx * dt; ny -= ty * dt; nz -= tz * dt;
        const nl = hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        bx = ty * nz - tz * ny; by = tz * nx - tx * nz; bz = tx * ny - ty * nx;
      }
      const ct = cos(CT[i]), st = sin(CT[i]), hw = CW[i] * 0.5, u = i / (cnt - 1), a = CA[i];
      const wx = nx * ct + bx * st, wy = ny * ct + by * st, wz = nz * ct + bz * st;
      const mx = -nx * st + bx * ct, my = -ny * st + by * ct, mz = -nz * st + bz * ct;
      const lx = CP[k] - wx * hw, ly = CP[k + 1] - wy * hw, lz = CP[k + 2] - wz * hw;
      const lnx = mx * 0.85 - wx * 0.52, lny = my * 0.85 - wy * 0.52, lnz = mz * 0.85 - wz * 0.52;
      if (i === 0 && stitch) {
        const pv = (RVC - 1) * STRIDE;
        pushV(RV[pv], RV[pv + 1], RV[pv + 2], mx, my, mz, 0, 1, 0);
        pushV(lx, ly, lz, lnx, lny, lnz, 0, 0, 0);
      }
      pushV(lx, ly, lz, lnx, lny, lnz, u, 0, a);
      pushV(CP[k] + wx * hw, CP[k + 1] + wy * hw, CP[k + 2] + wz * hw, mx * 0.85 + wx * 0.52, my * 0.85 + wy * 0.52, mz * 0.85 + wz * 0.52, u, 1, a);
    }
  }

  /* 3. 60 CANONICAL SKILLS + 3 PERSONAS -> 8 ARCHETYPES */
  const SKILL_MAP = (() => {
    const m = {};
    [
      [A0, 'giyu_3,rengoku_4,yoriichi_3,tanjiro_3,zenitsu_4,obanai_1,obanai_3,obanai_4'],
      [A1, 'tanjiro_1,tanjiro_2,yoriichi_1,yoriichi_2,giyu_2,rengoku_2,rengoku_3,nezuko_1,nezuko_2,sanemi_1,sanemi_3'],
      [A2, 'zenitsu_1,zenitsu_2,zenitsu_3,shinobu_2,shinobu_4,rengoku_1,inosuke_1,obanai_2'],
      [A3, 'giyu_4,muichiro_3,muichiro_4,ubuyashiki_1,ubuyashiki_2,ubuyashiki_3,ubuyashiki_4,inosuke_4,nezuko_4'],
      [A4, 'gyomei_1,gyomei_2,gyomei_3,gyomei_4,uzui_1,uzui_2,uzui_3,uzui_4,mitsuri_1,mitsuri_2,mitsuri_3,mitsuri_4,nezuko_3'],
      [A5, 'yoriichi_4,tanjiro_4'],
      [A6, 'shinobu_1,shinobu_3,sanemi_2,sanemi_4,inosuke_2,inosuke_3'],
      [A7, 'giyu_1,muichiro_1,muichiro_2']
    ].forEach(([k, s]) => s.split(',').forEach((id) => { m[id] = k; }));
    return m;
  })();

  const PERSONAS = { shadow_monarch: [A0, 5, '#a855f7', '#e0f2fe'], six_eyes: [A3, 5, '#38bdf8', '#f5d0fe'], great_sage: [A4, 6, '#38bdf8', '#fef08a'] };
  const SPECS = {
    [A0]: [-680, 220, 3.25, 185, 0.24, 68, 42], [A1]: [-260, 210, 1.65, 235, 0.48, 62, 38],
    [A2]: [-1100, 280, 0.85, 150, 0.16, 52, 40], [A3]: [-380, 240, 2.0, 290, 0.35, 44, 46],
    [A4]: [-420, 230, 2.6, 250, 0.42, 48, 40], [A5]: [-460, 260, 3.6, 275, 0.38, 64, 56],
    [A6]: [-540, 220, 1.4, 240, 0.52, 46, 36], [A7]: [-480, 190, 1.15, 225, 0.22, 58, 32]
  };

  function resolveElem(sfx, cid) {
    const s = String(sfx || '').toLowerCase(), c = String(cid || '').toLowerCase();
    if (/water|calm|beast/.test(s) || c === 'giyu' || c === 'inosuke') return 0;
    if (/flame|sun|blood/.test(s) || /rengoku|tanjiro|yoriichi|nezuko/.test(c)) return 1;
    if (s.includes('thunder') || c === 'zenitsu') return 2;
    if (/mist|wind/.test(s) || c === 'muichiro' || c === 'sanemi') return 3;
    if (/insect|love|royal/.test(s) || /shinobu|mitsuri|ubuyashiki/.test(c)) return 4;
    if (/serpent|moon|shadow/.test(s) || c === 'obanai') return 5;
    return (/sound|stone/.test(s) || c === 'uzui' || c === 'gyomei') ? 6 : 0;
  }

  function resolveSkill3DProfile(skill, opts) {
    const sk = (skill && typeof skill === 'object') ? skill : (typeof skill === 'string' ? { id: skill } : {});
    const o = (opts && typeof opts === 'object') ? opts : {};
    const rawId = (typeof sk.id === 'string' || typeof sk.id === 'number') ? String(sk.id).trim().toLowerCase() : '';
    const rawPart = rawId ? rawId.split('_')[0] : '';
    const charId = String(sk.charId || (rawPart && !hasOwn( Object.prototype, rawPart) ? rawPart : '') || 'giyu').toLowerCase();
    const formIndex = isFin(sk.index) ? clamp(floor(sk.index), 0, 3) : (/\d+$/.test(rawId) ? clamp(parseInt(rawId.match(/(\d+)$/)[1], 10) - 1, 0, 3) : 0);
    const pKey = String(o.persona || o.personaId || o.fxMode || sk.persona || (hasOwn(PERSONAS, rawId) ? rawId : '')).trim().toLowerCase();
    const pr = hasOwn(PERSONAS, pKey) ? PERSONAS[pKey] : null;
    const fb = ((charId === 'yoriichi' || charId === 'tanjiro') && formIndex === 3) ? A5
      : (charId === 'ubuyashiki' ? A3 : (/gyomei|uzui|mitsuri/.test(charId) ? A4 : (charId === 'zenitsu' ? (formIndex === 3 ? A0 : A2) : (charId === 'obanai' ? (formIndex === 1 ? A2 : A0) : [A7, A1, A0, A3][formIndex]))));
    const mapped = hasOwn(SKILL_MAP, rawId) ? SKILL_MAP[rawId] : null;
    const archetype = (pr && pr[0]) || mapped || fb || A7;
    const elemMode = pr ? pr[1] : resolveElem(sk.sfxElement, charId);
    const rimHex = (pr && pr[2]) || sk.primaryColor || '#38bdf8', coreHex = (pr && pr[3]) || sk.accentColor || '#ffffff';
    const sp = hasOwn(SPECS, archetype) ? SPECS[archetype] : SPECS[A7];
    return {
      id: rawId || `${charId}_${formIndex + 1}`, charId, formIndex, archetype, elemMode,
      zStart: sp[0], zEnd: sp[1], turns: sp[2], radius: sp[3], pitch: sp[4], ribbonWidth: sp[5], particleCount: sp[6],
      rimHex, secondaryHex: sk.secondaryColor || rimHex, coreHex
    };
  }

  /* 4. 8 SPATIAL 3D CURVE GENERATORS */
  const slashEnv = (rawP) => {
    const p = clamp(rawP, 0, 1);
    return p < 0.08 ? ease3(p / 0.08) * 0.35 : (p < 0.32 ? 0.35 + ease3((p - 0.08) / 0.24) * 0.65 : (p < 0.72 ? 1 : max(0, 1 - easeS((p - 0.72) / 0.28))));
  };

  function buildRibbons(prof, rawP, w, h) {
    RVC = 0;
    const env = slashEnv(rawP);
    if (env <= 0.005) return;
    const p = clamp(rawP, 0, 1), hd = p < 0.06 ? 0.08 : (p < 0.54 ? 0.08 + ease3((p - 0.06) / 0.48) * 0.92 : 1);
    const tl = p > 0.56 ? easeS((p - 0.56) / 0.44) * 0.58 : 0;
    const sXY = clamp(min(w, h) / 900, 0.72, 1.38), R = prof.radius * sXY, bW = prof.ribbonWidth * sXY, ar = prof.archetype;

    if (ar === A0) {
      for (let s = 0, n = 84; s < 2; s++) {
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), su = lerp(tl * 0.65, hd, u), th = su * TAU * prof.turns + s * PI - p * 3.2, fn = (0.45 + 0.65 * sin(su * PI * 0.88)) * R, tp = sin(u * PI);
          setNode(i, lerp(-w * 0.26, w * 0.24, su) * 0.65 + cos(th) * fn, lerp(-h * 0.14, h * 0.15, su) * 0.55 + sin(th) * fn * 0.68, lerp(prof.zStart, prof.zEnd, su), bW * (s ? 0.76 : 1.08) * (0.25 + 0.95 * tp), env * pow(tp, 0.55) * (s ? 0.78 : 0.96), u * PI * 1.5 + s * 0.7);
        }
        appendRibbon(n);
      }
    } else if (ar === A1) {
      const ts = [[0.42, 0.22, -0.35], [-0.52, -0.28, 0.44], [0.18, 0.62, 0.15], [-0.3, -0.55, -0.58]];
      for (let r = 0, n = 80; r < 4; r++) {
        const [rx, ry, rz] = ts[r], cx = cos(rx), sx = sin(rx), cy = cos(ry), sy = sin(ry), cz = cos(rz), sz = sin(rz);
        const rr = R * (0.78 + r * 0.14), sp = p * (5.2 + r * 0.9) * (r % 2 ? -1 : 1) + r * 1.3, span = TAU * clamp(hd * 1.12, 0.25, 0.94);
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), a = sp + u * span, tp = sin(u * PI), lx = cos(a) * rr, ly = sin(a) * rr * 0.32, lz = sin(a) * rr;
          const x1 = lx * cz - ly * sz, y1 = lx * sz + ly * cz, y2 = y1 * cx - lz * sx, z2 = y1 * sx + lz * cx;
          setNode(i, x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy, bW * (1.05 - r * 0.11) * (0.18 + 0.92 * tp), env * pow(tp, 0.6) * (0.95 - r * 0.08), u * 0.9);
        }
        appendRibbon(n);
      }
    } else if (ar === A2) {
      const n = 78;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), su = lerp(tl * 0.72, hd, u), tp = sin(u * PI), jg = (prof.elemMode === 2 ? sin(su * 34) * 26 : sin(su * 12) * 14) * sXY;
        setNode(i, lerp(-w * 0.34, w * 0.3, su) + jg, lerp(-h * 0.16, h * 0.14, su) + cos(su * 22) * 12 * sXY, lerp(prof.zStart, prof.zEnd, su), bW * 1.18 * (0.15 + 0.95 * tp), env * pow(tp, 0.45), su * PI * 2.2);
      }
      appendRibbon(n);
      for (let k = 0, an = 40; k < 5; k++) {
        const kf = k / 4, act = clamp((hd - kf * 0.55) / 0.45, 0, 1);
        if (act <= 0.04) continue;
        const ti = (k % 2 ? -1 : 1) * (0.42 + k * 0.12), ct = cos(ti), st = sin(ti), sr = R * (1.28 - kf * 0.22);
        for (let i = 0; i < an; i++) {
          const u = i / (an - 1), ag = -1.25 + u * 2.5 * act + k * 0.55, tp = sin(u * PI), cx = cos(ag) * sr, cy = sin(ag) * sr * 0.55;
          setNode(i, cx * ct - cy * st, cx * st + cy * ct, lerp(-640, 210, kf) + tp * 55, bW * 0.72 * tp, env * act * tp * 0.88, ti);
        }
        appendRibbon(an);
      }
    } else if (ar === A3) {
      const n = 56, dR = R * (0.65 + 0.45 * ease3(hd)), fy = -130 * sXY;
      for (let d = 0; d < 6; d++) {
        const ya = (d / 6) * PI + p * 1.15, cy = cos(ya), sy = sin(ya);
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), ph = -0.35 + u * (PI + 0.7), rh = cos(ph) * dR, tp = sin(u * PI);
          setNode(i, cy * rh, sin(ph) * dR * 0.82 + 12, sy * rh, bW * 0.66 * (0.25 + 0.75 * tp), env * tp * 0.76, HP * 0.5);
        }
        appendRibbon(n);
      }
      for (let m = 0; m < 2; m++) {
        const mr = dR * (0.58 + m * 0.48) * (0.7 + 0.3 * p);
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), a = u * TAU + p * (m ? -1.4 : 1.8), tp = sin(u * PI);
          setNode(i, cos(a) * mr, fy + sin(a * 4 + p * 8) * 4, sin(a) * mr, bW * 0.58 * (0.35 + 0.65 * tp), env * 0.72 * (0.4 + 0.6 * tp), 0);
        }
        appendRibbon(n);
      }
    } else if (ar === A4) {
      for (let k = 0, n = 76; k < 4; k++) {
        const ph = (k / 4) * TAU, fx = 1 + (k % 2), fy = 2 + (k % 3 === 0 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), su = lerp(tl * 0.45, hd, u), t = su * TAU * 1.15 + ph + p * 2.6, tp = sin(u * PI);
          setNode(i, cos(t * fx) * R * (1.15 - k * 0.06), sin(t * fy + k) * R * 0.68, sin(t * 2 + ph * 0.5) * 235, bW * 0.85 * (0.2 + 0.85 * tp), env * pow(tp, 0.55) * 0.88, su * TAU + k);
        }
        appendRibbon(n);
      }
    } else if (ar === A5) {
      const n = 28, hR = R * 1.06, cp = cos(0.34), sp = sin(0.34);
      for (let k = 0; k < 12; k++) {
        const ul = clamp((p - k * 0.026) / 0.22, 0, 1);
        if (ul <= 0.02) continue;
        const bA = (k / 12) * TAU + p * 1.85, aL = (TAU / 12) * 1.55 * ease3(ul), wb = sin(k * 1.7 + p * 4) * 0.24, cw = cos(wb), sw = sin(wb);
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), a = bA + u * aL, tp = sin(u * PI), lx = cos(a) * hR, ly = sin(a) * hR, lz = tp * 95 * (1 - ul * 0.45) * (k % 2 ? -1 : 1);
          const yr = ly * cp - lz * sp, zr = ly * sp + lz * cp;
          setNode(i, lx * cw - zr * sw, yr, lx * sw + zr * cw, bW * (0.42 + 0.78 * tp), env * ul * (0.35 + 0.65 * tp), u * 0.8 + k * 0.25);
        }
        appendRibbon(n);
      }
      if (p > 0.26) {
        const cn = 72, la = clamp((p - 0.26) / 0.25, 0, 1) * env;
        for (let i = 0; i < cn; i++) {
          const u = i / (cn - 1), a = u * TAU - p * 4.5, tp = sin(u * PI);
          setNode(i, cos(a) * hR * 0.62, sin(a) * hR * 0.56, sin(a * 2 + p * 6) * 145, bW * 0.88 * (0.35 + 0.65 * tp), la * (0.45 + 0.55 * tp), u * PI);
        }
        appendRibbon(cn);
      }
    } else if (ar === A6) {
      for (let k = 0, n = 44; k < 6; k++) {
        const lp = clamp((hd - k * 0.08) / 0.55, 0, 1);
        if (lp <= 0.03) continue;
        const ag = (k / 6) * PI + 0.38 + (k % 2 ? -0.18 : 0.18), ca = cos(ag), sa = sin(ag), zM = lerp(-360, 195, k / 5), ln = R * 1.55;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), su = lerp(tl * 0.5, lp, u), tp = sin(u * PI), al = (su - 0.5) * 2 * ln, bw = sin(su * PI) * R * 0.34 * (k % 2 ? -1 : 1);
          setNode(i, al * ca - bw * sa, al * sa + bw * ca, zM + cos(su * PI) * 140, bW * 0.82 * (0.15 + 0.9 * tp), env * tp * 0.92, ag * 0.5);
        }
        appendRibbon(n);
      }
    } else {
      for (let l = 0, n = 72; l < 5; l++) {
        const lf = l / 4, zB = lerp(prof.zStart, prof.zEnd, lf), yB = lerp(95, -85, lf) * sXY, sW = R * (1.65 - lf * 0.22), dir = l % 2 ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), su = lerp(tl * 0.45, hd, u), tp = sin(u * PI);
          setNode(i, (su - 0.5) * 2 * dir * sW, yB + sin(su * PI * 1.5 + l) * 62 * sXY, zB + sin(su * PI) * 85, bW * (0.85 + lf * 0.25) * (0.2 + 0.85 * tp), env * tp * (0.68 + lf * 0.08), 0.35 * dir);
        }
        appendRibbon(n);
      }
    }
  }

  /* 5. 6-PHASE 3D ACTOR TRAJECTORY */
  function sampleCombat3D(prof, u, w, h) {
    const t = clamp(u, 0, 1), sXY = clamp(min(w, h) / 900, 0.75, 1.35), R = prof.radius * sXY * 0.72, ar = prof.archetype;
    if (ar === A0) { const a = t * TAU * 1.35, et = ease3(t); return { wx: lerp(-210, 195, et) * sXY + cos(a) * R * 0.45, wy: lerp(-75, 85, t) * sXY + sin(a) * R * 0.38, wz: lerp(-280, 135, et), rot: sin(a) * 0.24, facing: 1 }; }
    if (ar === A2) { const d = ease5(t); return { wx: lerp(-250, 235, d) * sXY, wy: lerp(-65, 48, d) * sXY, wz: lerp(-420, 165, d), rot: -0.18 * (1 - d), facing: 1 }; }
    if (ar === A3) return { wx: sin(t * PI) * 18 * sXY, wy: 14 + sin(t * TAU) * 12 * sXY, wz: lerp(-40, 45, sin(t * PI)), rot: sin(t * PI) * 0.05, facing: -1 };
    if (ar === A5) { const a = -HP + ease3(t) * TAU * 1.15, sh = 1 - t * 0.45; return { wx: cos(a) * R * 0.72 * sh, wy: sin(a) * R * 0.58 * sh + 18, wz: lerp(-160, 125, sin(t * PI)), rot: t < 0.78 ? ease3(t / 0.78) * TAU : 0, spin: true, facing: cos(a) >= 0 ? 1 : -1 }; }
    if (ar === A1) { const a = -HP + ease3(t) * TAU, sh = 1 - t * 0.35; return { wx: cos(a) * R * 0.58 * sh, wy: sin(a) * R * 0.48 * sh, wz: lerp(-150, 110, sin(t * PI)), rot: sin(t * PI) * 0.32, facing: cos(a) >= 0 ? 1 : -1 }; }
    if (ar === A4) { const a = t * PI * 2.2; return { wx: sin(a) * R * 0.62, wy: cos(a * 0.5) * R * 0.36, wz: sin(a) * 115, rot: cos(a) * 0.22, facing: cos(a) >= 0 ? 1 : -1 }; }
    if (ar === A6) {
      const st = min(3, floor(t * 4)), lc = ease3(t * 4 - st), pts = [[-175, -60, -180], [165, 75, -40], [-140, 65, 75], [85, -20, 120]], c = pts[st], nx = pts[min(3, st + 1)], dx = nx[0] - c[0];
      return { wx: lerp(c[0], nx[0], lc) * sXY, wy: lerp(c[1], nx[1], lc) * sXY, wz: lerp(c[2], nx[2], lc), rot: clamp(dx / 260, -0.3, 0.3), facing: dx >= 0 ? 1 : -1 };
    }
    const s = ease3(t);
    return { wx: lerp(-215, 205, s) * sXY, wy: sin(s * PI) * 44 * sXY, wz: lerp(-180, 95, s), rot: 0.14 * (1 - s), facing: 1 };
  }

  function computeActor3DTrajectory(w, h, rawP, skill, homeOrigin, spriteMeta, opts) {
    const vw = normW(w), vh = normH(h);
    const o = opts || {}, red = Boolean(o.reducedMotion), p = clamp(Number(rawP) || 0, 0, 1);
    const wp = red ? p : (p < 0.35 ? (p / 0.35) * 0.365 : (p <= 0.41 ? 0.365 + ((p - 0.35) / 0.06) * 0.015 : 0.38 + ((p - 0.41) / 0.59) * 0.62));
    const prof = resolveSkill3DProfile(skill, o), cam = computeCameraState(p, prof.archetype, { width: vw, height: vh, reducedMotion: red }), m = cam.vpMat;
    const meta = spriteMeta || {}, baseSize = Number(meta.baseSize) > 0 ? Number(meta.baseSize) : 206;
    const nativeFacing = meta.nativeFacing === 1 ? 1 : -1, spinOk = Boolean(meta.spinCapable);
    const home = (homeOrigin && isFin(homeOrigin.x) && isFin(homeOrigin.y)) ? { x: homeOrigin.x, y: homeOrigin.y } : { x: vw * 0.8, y: vh * 0.84 };
    const hZ = -40, cw = REF_Z - hZ, hWx = (((home.x / vw) * 2 - 1) * cw - m[8] * hZ - m[12]) / (m[0] || 1.3), hWy = ((1 - (home.y / vh) * 2) * cw - m[9] * hZ - m[13]) / (m[5] || 2.14);
    const c0 = sampleCombat3D(prof, 0, vw, vh), c1 = sampleCombat3D(prof, 1, vw, vh);
    const hasCallerHs = typeof o.hitStopActive === 'boolean' || typeof o.impactFrameActive === 'boolean';
    const impAct = !red && (hasCallerHs ? Boolean(o.impactFrameActive) : (p >= 0.33 && p <= 0.36));
    const hitStopActive = !red && (hasCallerHs ? Boolean(o.hitStopActive || o.impactFrameActive) : (p >= 0.33 && p <= 0.365));
    const impactFrameKind = impAct
      ? (hasCallerHs
        ? ((isFin(o.impactFlashProgress) ? o.impactFlashProgress : 0) < 0.5 ? 'invert_white' : 'crimson_flash')
        : (p < 0.345 ? 'invert_white' : 'crimson_flash'))
      : null;

    let worldX = 0, worldY = 0, worldZ = 0, rot = 0, facing = c0.facing || -1;
    let phase = 'slash', slashing = 0, charging = 0, stretch = 1, squash = 1, notoGleam = 0, hBlend = 0;

    if (wp < 0.11) {
      phase = 'charge'; const u = wp / 0.11; charging = ease3(u);
      worldX = hWx; worldY = hWy - sin(u * PI) * 10; worldZ = lerp(hZ, hZ - 35, u);
      facing = c0.wx >= hWx ? 1 : -1; rot = -0.12 * charging * facing;
      stretch = lerp(1, 0.91, charging); squash = lerp(1, 1.09, charging); hBlend = 1 - u * 0.25;
    } else if (wp < 0.24) {
      phase = 'launch'; const u = (wp - 0.11) / 0.13, eu = ease3(u);
      worldX = lerp(hWx, c0.wx, eu); worldY = lerp(hWy, c0.wy, eu) + sin(u * PI) * 95; worldZ = lerp(hZ - 35, c0.wz, eu);
      facing = c0.wx >= hWx ? 1 : -1; rot = facing * sin(u * PI) * 0.28;
      charging = 1 - u; slashing = u * 0.5; stretch = 1 + sin(u * PI) * 0.16; squash = 1 / sqrt(stretch);
    } else if (wp < 0.84) {
      const cu = (wp - 0.24) / 0.6, pt = sampleCombat3D(prof, cu, vw, vh);
      worldX = pt.wx; worldY = pt.wy; worldZ = pt.wz; rot = (pt.spin && !spinOk) ? sin(cu * PI) * 0.25 : (pt.rot || 0); facing = pt.facing || -1;
      if (wp < 0.48) { phase = 'slash'; slashing = 1; stretch = 1.08; squash = 0.95; }
      else {
        phase = 'followthrough'; slashing = max(0, 1 - ((wp - 0.48) / 0.36) * 1.4);
        if (p >= 0.68 && p <= 0.84) notoGleam = sin(((p - 0.68) / 0.16) * PI);
      }
    } else {
      phase = 'return'; const ru = (wp - 0.84) / 0.16, er = easeS(ru);
      worldX = lerp(c1.wx, hWx, er); worldY = lerp(c1.wy, hWy, er) + sin(ru * PI) * 82; worldZ = lerp(c1.wz, hZ, er);
      facing = hWx >= c1.wx ? 1 : -1; rot = (spinOk ? 0.55 : 0.22) * sin(ru * PI) * facing; hBlend = pow(ru, 2.2);
    }
    if (hitStopActive) { phase = 'hitstop'; slashing = 1; stretch = 1.12; squash = 0.92; }

    const prj = projectPoint3D(worldX, worldY, worldZ, m, vw, vh);
    let sx = hBlend > 0 ? lerp(prj.sx, home.x, hBlend) : prj.sx, sy = hBlend > 0 ? lerp(prj.sy, home.y, hBlend) : prj.sy;
    sx = isFin(sx) ? sx : vw * 0.5; sy = isFin(sy) ? sy : vh * 0.5;
    const nxt = sampleCombat3D(prof, clamp((wp - 0.24) / 0.6 + 0.03, 0, 1), vw, vh);
    const velAngle = atan2(-(nxt.wy - worldY), (nxt.wx - worldX) || 1);
    const tiltX = red ? 0 : clamp((worldY / vh) * -0.45, -0.32, 0.32), tiltY = red ? 0 : clamp((worldX / vw) * 0.52 * facing, -0.38, 0.38);
    const pScale = clamp(prj.scale || 1, 0.45, 2.35);
    const endMul = phase === 'charge' ? lerp(92 / baseSize, 1, charging) : (phase === 'return' ? lerp(1, 90 / baseSize, hBlend) : 1);
    const size = baseSize * lerp(1, pScale, 0.68) * endMul;
    const rimGlowAlpha = clamp(0.28 + slashing * 0.55 + charging * 0.35 + (hitStopActive ? 0.25 : 0), 0, 1);

    return {
      worldX, worldY, worldZ, sx, sy, x: sx, y: sy, pScale, size, rot, tiltX, tiltY,
      stretch: red ? 1 : stretch, squash: red ? 1 : squash, velAngle, facing, nativeFacing,
      phase, archetype: prof.archetype, slashing, charging, hitStopActive, impactFrameKind, rimGlowAlpha, notoGleam, home
    };
  }

  /* 6. MICRO WEBGL2/WEBGL1 UBER-SHADER + 3-TIER CIRCUIT BREAKER + 30s LEASE */
  function buildShaders(gl2) {
    const vs = `${gl2 ? '#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_pos;layout(location=1) in vec3 a_normal;layout(location=2) in vec3 a_uva;out vec3 v_wp,v_n;out vec2 v_uv;out float v_a;' : 'precision highp float;\nattribute vec3 a_pos,a_normal,a_uva;varying vec3 v_wp,v_n;varying vec2 v_uv;varying float v_a;'}uniform mat4 u_vp;void main(){v_wp=a_pos;v_n=a_normal;v_uv=a_uva.xy;v_a=a_uva.z;gl_Position=u_vp*vec4(a_pos,1.0);}`;
    const fs = `${gl2 ? '#version 300 es\nprecision highp float;\nin vec3 v_wp,v_n;in vec2 v_uv;in float v_a;out vec4 fragColor;' : 'precision highp float;\nvarying vec3 v_wp,v_n;varying vec2 v_uv;varying float v_a;'}
uniform vec3 u_eyePos,u_primaryCol,u_secondaryCol,u_accentCol;uniform float u_time,u_elemMode,u_passClip,u_actorZ;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){return vn(p)*0.65+vn(p*2.13+3.7)*0.35;}
void main(){
  if(v_a<=0.004||(u_passClip<-0.5&&v_wp.z>=u_actorZ)||(u_passClip>0.5&&v_wp.z<u_actorZ))discard;
  vec2 fu=vec2(v_uv.x*6.5-u_time*3.6,v_uv.y*2.4);
  float w=fbm(fu+vec2(0.0,u_time*0.9)),n=fbm(fu*1.8+w*1.65),ct=1.0-abs(v_uv.y-0.5)*2.0,we=ct+(n-0.5)*0.42;
  if(we<=0.02)discard;
  float pat=n;
  if(u_elemMode<0.5)pat=smoothstep(0.25,0.85,n+sin(fu.x*3.2+w*4.0)*0.25);
  else if(u_elemMode<1.5)pat=pow(clamp(n*1.35+sin(fu.x*5.0)*0.18,0.0,1.4),1.2);
  else if(u_elemMode<2.5){float b=1.0-abs(fract(fu.x*1.9+w*2.2)-0.5)*2.0;pat=max(n*0.7,pow(b,3.0)*1.45);}
  else if(u_elemMode<3.5)pat=smoothstep(0.15,0.95,n*0.85+ct*0.35);
  else if(u_elemMode<4.5)pat=n*0.9+pow(vn(fu*4.5),3.0)*0.85;
  else if(u_elemMode<5.5)pat=smoothstep(0.35,0.88,n)*1.15;
  else pat=n*0.85+abs(sin(fu.x*6.0))*0.45;
  vec3 hdr=mix(mix(u_secondaryCol,u_primaryCol,clamp(pat,0.0,1.0))*1.35,u_accentCol*2.25,smoothstep(0.52,0.96,we+pat*0.24));
  hdr+=u_accentCol*pow(1.0-clamp(abs(dot(normalize(v_n),normalize(u_eyePos-v_wp))),0.0,1.0),2.1)*1.45;
  float ink=smoothstep(0.03,0.16,we)*(1.0-smoothstep(0.16,0.30,we));
  hdr=mix(hdr,vec3(0.018,0.02,0.038),ink*(u_elemMode>4.5&&u_elemMode<5.5?0.88:0.68));
  vec3 x=hdr*1.15,aces=clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);
  float al=clamp(v_a*smoothstep(0.02,0.22,we),0.0,1.0);
  ${gl2 ? 'fragColor' : 'gl_FragColor'}=vec4(aces*al,al);
}`;
    return { vs, fs };
  }

  const _colBuf = new Float32Array(9);
  let glCv = null, gl = null, glVer = 0, prog = null, vsObj = null, fsObj = null, vbo = null, vao = null, uLoc = null;
  let extPar = null, shOk = false, shPend = false, force2D = false, fbReason = '';
  let leaseT = 0, slowStreak = 0, accMs = 0, visBound = false, dead = false, selfLosing = false, lostCount = 0;
  let cKey = '', cProf = null, cCam = null, geoUp = false;
  const nowMs = (typeof performance !== 'undefined' && isFn(performance.now)) ? () => performance.now() : () => Date.now();

  function touchLease() {
    if (dead) return;
    if (leaseT) clearTimeout(leaseT);
    leaseT = setTimeout(() => { leaseT = 0; releaseGpuNow(); }, LEASE_MS);
  }

  function onLost(e) {
    if (e && isFn(e.preventDefault)) e.preventDefault();
    if (glCv) {
      try { glCv.removeEventListener('webglcontextlost', onLost, false); } catch (_) {}
      glCv = null;
    }
    if (leaseT) { clearTimeout(leaseT); leaseT = 0; }
    gl = null; glVer = 0; prog = null; vsObj = null; fsObj = null; vbo = null; vao = null; uLoc = null; extPar = null;
    shOk = false; shPend = false; geoUp = false; cKey = '';
    if (!selfLosing) {
      if (++lostCount >= 2) { force2D = true; fbReason = 'webgl_context_lost_repeated'; }
      else if (!fbReason) fbReason = 'webgl_context_lost';
    }
  }
  function onVis() { try { if (typeof document !== 'undefined' && document && document.hidden) releaseGpuNow(); } catch (_) {} }

  function releaseGpuNow() {
    if (leaseT) { clearTimeout(leaseT); leaseT = 0; }
    if (glCv) {
      try { glCv.removeEventListener('webglcontextlost', onLost, false); } catch (_) {}
    }
    if (gl) {
      selfLosing = true;
      try {
        if (vao && glVer === 2 && isFn(gl.deleteVertexArray)) gl.deleteVertexArray(vao);
        if (vbo) gl.deleteBuffer(vbo);
        if (prog) gl.deleteProgram(prog);
        if (vsObj) gl.deleteShader(vsObj);
        if (fsObj) gl.deleteShader(fsObj);
        const lx = gl.getExtension('WEBGL_lose_context');
        if (lx && isFn(lx.loseContext)) lx.loseContext();
      } catch (_) {}
      selfLosing = false;
    }
    if (glCv) {
      glCv.width = 1; glCv.height = 1; glCv = null;
    }
    gl = null; glVer = 0; prog = null; vsObj = null; fsObj = null; vbo = null; vao = null; uLoc = null; extPar = null;
    shOk = false; shPend = false; geoUp = false; cKey = '';
  }

  function linkSetup(g) {
    if (!prog || !g.getProgramParameter(prog, g.LINK_STATUS)) { force2D = true; fbReason = 'shader_link_failed'; releaseGpuNow(); return false; }
    vbo = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, vbo); g.bufferData(g.ARRAY_BUFFER, RV.byteLength, g.DYNAMIC_DRAW);
    geoUp = false;
    if (glVer === 2 && isFn(g.createVertexArray)) { vao = g.createVertexArray(); g.bindVertexArray(vao); }
    for (let k = 0; k < 3; k++) { g.enableVertexAttribArray(k); g.vertexAttribPointer(k, 3, g.FLOAT, false, STRIDE * 4, k * 12); }
    if (vao && glVer === 2) g.bindVertexArray(null);
    uLoc = {};
    ['vp', 'eyePos', 'time', 'elemMode', 'passClip', 'actorZ', 'primaryCol', 'secondaryCol', 'accentCol'].forEach((n) => { uLoc[n] = g.getUniformLocation(prog, 'u_' + n); });
    g.enable(g.DEPTH_TEST); g.depthFunc(g.LEQUAL); g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA); g.disable(g.CULL_FACE);
    shOk = true; shPend = false; fbReason = '';
    return true;
  }

  function ensureGl(vw, vh, opts) {
    if (dead || force2D || (opts && opts.reducedMotion)) return false;
    if (typeof document === 'undefined' || !document || !isFn(document.createElement)) { fbReason = fbReason || 'headless_no_dom'; return false; }
    if (typeof WebGLRenderingContext === 'undefined') { fbReason = fbReason || 'webgl_api_missing'; return false; }
    if (!gl) {
      if (glCv) {
        try { glCv.removeEventListener('webglcontextlost', onLost, false); } catch (_) {}
        glCv = null;
      }
      try {
        glCv = document.createElement('canvas');
        glCv.addEventListener('webglcontextlost', onLost, false);
        const at = { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, stencil: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true, preserveDrawingBuffer: false };
        let c = glCv.getContext('webgl2', at);
        if (c) glVer = 2; else { c = glCv.getContext('webgl', at); if (c) { glVer = 1; c.getExtension('OES_standard_derivatives'); } }
        if (!c) {
          try { glCv.removeEventListener('webglcontextlost', onLost, false); } catch (_) {}
          force2D = true; fbReason = 'webgl_context_rejected'; glCv = null; return false;
        }
        let ren = String(c.getParameter(c.RENDERER) || '');
        const dbg = c.getExtension('WEBGL_debug_renderer_info');
        if (dbg) ren += ' ' + String(c.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
        if (!(opts && opts.allowSoftwareWebGL) && SW_RE.test(ren)) {
          try { glCv.removeEventListener('webglcontextlost', onLost, false); } catch (_) {}
          const lx = c.getExtension('WEBGL_lose_context');
          if (lx && isFn(lx.loseContext)) lx.loseContext();
          glCv.width = 1; glCv.height = 1; glCv = null; force2D = true; fbReason = 'software_renderer_blocked';
          return false;
        }
        gl = c; extPar = c.getExtension('KHR_parallel_shader_compile') || null;
        const s = buildShaders(glVer === 2);
        vsObj = c.createShader(c.VERTEX_SHADER); c.shaderSource(vsObj, s.vs); c.compileShader(vsObj);
        fsObj = c.createShader(c.FRAGMENT_SHADER); c.shaderSource(fsObj, s.fs); c.compileShader(fsObj);
        prog = c.createProgram();
        if (glVer === 1) { c.bindAttribLocation(prog, 0, 'a_pos'); c.bindAttribLocation(prog, 1, 'a_normal'); c.bindAttribLocation(prog, 2, 'a_uva'); }
        c.attachShader(prog, vsObj); c.attachShader(prog, fsObj); c.linkProgram(prog);
        if (!visBound && isFn(document.addEventListener)) { document.addEventListener('visibilitychange', onVis, false); visBound = true; }
        touchLease();
        if (extPar) { shPend = true; shOk = false; } else if (!linkSetup(c)) return false;
      } catch (_) { force2D = true; fbReason = 'webgl_init_exception'; releaseGpuNow(); return false; }
    }
    if (shPend && gl && prog && extPar) {
      if (!gl.getProgramParameter(prog, extPar.COMPLETION_STATUS_KHR)) { touchLease(); return false; }
      if (!linkSetup(gl)) return false;
    }
    if (!gl || !shOk || !glCv) return false;
    const dpr = min(max(1, Number(ROOT && ROOT.devicePixelRatio) || 1), vw > 2400 ? 1 : 1.25);
    const tw = max(1, floor(vw * dpr)), th = max(1, floor(vh * dpr));
    if (glCv.width !== tw || glCv.height !== th) { glCv.width = tw; glCv.height = th; }
    touchLease();
    return true;
  }

  function drawGlPass(ctx2d, w, h, rawP, prof, cam, actorZ, clip, upload) {
    if (!gl || !prog || !uLoc || !glCv) return false;
    const t0 = nowMs();
    gl.viewport(0, 0, glCv.width, glCv.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (RVC >= 4) {
      gl.useProgram(prog); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      if (upload) gl.bufferSubData(gl.ARRAY_BUFFER, 0, RV.subarray(0, RVC * STRIDE));
      hexVec3(prof.rimHex, _colBuf, 0); hexVec3(prof.secondaryHex, _colBuf, 3); hexVec3(prof.coreHex, _colBuf, 6);
      gl.uniformMatrix4fv(uLoc.vp, false, cam.vpMat);
      gl.uniform3f(uLoc.eyePos, cam.eyeX, cam.eyeY, cam.eyeZ);
      gl.uniform1f(uLoc.time, rawP * 2.8); gl.uniform1f(uLoc.elemMode, prof.elemMode);
      gl.uniform1f(uLoc.passClip, clip); gl.uniform1f(uLoc.actorZ, actorZ);
      gl.uniform3f(uLoc.primaryCol, _colBuf[0], _colBuf[1], _colBuf[2]);
      gl.uniform3f(uLoc.secondaryCol, _colBuf[3], _colBuf[4], _colBuf[5]);
      gl.uniform3f(uLoc.accentCol, _colBuf[6], _colBuf[7], _colBuf[8]);
      if (vao && glVer === 2) { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, RVC); gl.bindVertexArray(null); }
      else {
        for (let k = 0; k < 3; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 3, gl.FLOAT, false, STRIDE * 4, k * 12); }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, RVC);
      }
      if (ctx2d && isFn(ctx2d.drawImage)) ctx2d.drawImage(glCv, 0, 0, w, h);
    }
    const dt = nowMs() - t0;
    if (clip < 0) accMs = dt; else {
      const tot = accMs + dt; accMs = 0;
      if (tot > BUDGET_MS) { if (++slowStreak >= 2) { force2D = true; fbReason = 'watchdog_24ms_exceeded'; releaseGpuNow(); } }
      else slowStreak = 0;
    }
    return true;
  }

  /* 7. 3D CANVAS2D FALLBACK, DEPTH PARTICLES, SOLAR GOD-RAYS, NOTO & IMPACT FRAMES */
  function strokeLine(ctx, x0, y0, x1, y1, lw, col) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
  }

  function draw2DPass(ctx, w, h, prof, cam, actorZ, clip) {
    if (!ctx || RVC < 4) return;
    let qc = 0, pairs = RVC >> 1;
    for (let p = 0; p < pairs - 1 && qc < MAX_Q; p++) {
      const o0 = p * 2 * STRIDE, o1 = o0 + STRIDE, o2 = o0 + 2 * STRIDE, o3 = o2 + STRIDE, a0 = RV[o0 + 8], a2 = RV[o2 + 8];
      if (a0 <= 0.01 || a2 <= 0.01) continue;
      const mz = (RV[o0 + 2] + RV[o1 + 2] + RV[o2 + 2] + RV[o3 + 2]) * 0.25;
      if ((clip < -0.5 && mz >= actorZ) || (clip > 0.5 && mz < actorZ)) continue;
      const p0 = projectPoint3D(RV[o0], RV[o0 + 1], RV[o0 + 2], cam.vpMat, w, h);
      const p1 = projectPoint3D(RV[o1], RV[o1 + 1], RV[o1 + 2], cam.vpMat, w, h);
      const p2 = projectPoint3D(RV[o2], RV[o2 + 1], RV[o2 + 2], cam.vpMat, w, h);
      const p3 = projectPoint3D(RV[o3], RV[o3 + 1], RV[o3 + 2], cam.vpMat, w, h);
      if (!p0.visible || !p1.visible || !p2.visible || !p3.visible) continue;
      const qi = qc * 10;
      QP[qi] = p0.sx; QP[qi + 1] = p0.sy; QP[qi + 2] = p1.sx; QP[qi + 3] = p1.sy;
      QP[qi + 4] = p3.sx; QP[qi + 5] = p3.sy; QP[qi + 6] = p2.sx; QP[qi + 7] = p2.sy;
      QP[qi + 8] = (p0.zCam + p2.zCam) * 0.5; QP[qi + 9] = (a0 + a2) * 0.5;
      QO[qc] = qc; qc++;
    }
    if (!qc) return;
    for (let gap = qc >> 1; gap > 0; gap >>= 1) {
      for (let i = gap; i < qc; i++) {
        const tmp = QO[i], tz = QP[tmp * 10 + 8]; let j = i;
        while (j >= gap && QP[QO[j - gap] * 10 + 8] < tz) { QO[j] = QO[j - gap]; j -= gap; }
        QO[j] = tmp;
      }
    }
    const pRgb = hexCss(prof.rimHex), cRgb = hexCss(prof.coreHex);
    ctx.save();
    for (let k = 0; k < qc; k++) {
      const qi = QO[k] * 10, a = QP[qi + 9];
      ctx.beginPath(); ctx.moveTo(QP[qi], QP[qi + 1]); ctx.lineTo(QP[qi + 2], QP[qi + 3]); ctx.lineTo(QP[qi + 4], QP[qi + 5]); ctx.lineTo(QP[qi + 6], QP[qi + 7]); ctx.closePath();
      ctx.fillStyle = rgba(pRgb, a * 0.76); ctx.fill();
      ctx.lineWidth = 1.25; ctx.strokeStyle = rgba('10,12,24', a * 0.42); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < qc; k++) {
      const qi = QO[k] * 10, a = QP[qi + 9], sp = hypot(QP[qi + 2] - QP[qi], QP[qi + 3] - QP[qi + 1]);
      strokeLine(ctx, (QP[qi] + QP[qi + 2]) * 0.5, (QP[qi + 1] + QP[qi + 3]) * 0.5, (QP[qi + 4] + QP[qi + 6]) * 0.5, (QP[qi + 5] + QP[qi + 7]) * 0.5, max(1.5, sp * 0.36), rgba(cRgb, a * 0.82));
    }
    ctx.restore();
  }

  function drawParticles(ctx, w, h, rawP, prof, cam, actorZ, front) {
    const env = slashEnv(rawP);
    if (!ctx || env <= 0.02) return;
    const pRgb = hexCss(prof.rimHex), cRgb = hexCss(prof.coreHex), salt = prof.elemMode * 17 + prof.formIndex * 5 + 3;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < prof.particleCount; i++) {
      const s1 = seeded(i, salt), s2 = seeded(i, salt + 11), s3 = seeded(i, salt + 29);
      const wz = ((lerp(-620, 410, s3) + rawP * 480 + 700) % 1120) - 680;
      if (front ? wz < actorZ : wz >= actorZ) continue;
      const ang = s1 * TAU + rawP * (1.8 + s2 * 2.4), r = 80 + s2 * prof.radius * 1.35;
      const prj = projectPoint3D(cos(ang) * r, (s2 - 0.5) * 340 + sin(rawP * 5 + i) * 32, wz, cam.vpMat, w, h);
      if (!prj.visible) continue;
      const bk = front && wz > 120 ? lerp(2.5, 4.5, clamp((wz - 120) / 300, 0, 1)) : 1;
      const rad = clamp((2.2 + s1 * 3.8) * prj.scale * bk, 1, 26);
      const al = clamp(env * (front && wz > 140 ? 0.42 : 0.72) * (1 - abs(rawP - 0.45)), 0.04, 0.85);
      if (rad > 8 && isFn(ctx.createRadialGradient)) {
        const g = ctx.createRadialGradient(prj.sx, prj.sy, 0.5, prj.sx, prj.sy, rad);
        g.addColorStop(0, rgba(cRgb, al)); g.addColorStop(0.45, rgba(pRgb, al * 0.55)); g.addColorStop(1, rgba(pRgb, 0));
        ctx.fillStyle = g;
      } else ctx.fillStyle = rgba(i % 2 === 0 ? cRgb : pRgb, al);
      ctx.beginPath(); ctx.arc(prj.sx, prj.sy, rad, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawFinisher(ctx, w, h, rawP, prof, cam, actor3D) {
    if (!ctx) return;
    const cRgb = hexCss(prof.coreHex), pRgb = hexCss(prof.rimHex);
    if (prof.archetype === A5 && rawP > 0.16 && rawP < 0.92) {
      const sc = projectPoint3D(0, 14, 0, cam.vpMat, w, h), re = sin(clamp((rawP - 0.16) / 0.76, 0, 1) * PI);
      if (sc.visible && re > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const rl = max(w, h) * 0.72;
        for (let r = 0; r < 12; r++) {
          const a = (r / 12) * TAU + rawP * 0.65, sp = 0.048 + (r % 2) * 0.022;
          const x1 = sc.sx + cos(a - sp) * rl, y1 = sc.sy + sin(a - sp) * rl, x2 = sc.sx + cos(a + sp) * rl, y2 = sc.sy + sin(a + sp) * rl;
          if (isFn(ctx.createLinearGradient)) {
            const lg = ctx.createLinearGradient(sc.sx, sc.sy, (x1 + x2) * 0.5, (y1 + y2) * 0.5);
            lg.addColorStop(0, rgba(cRgb, re * 0.34)); lg.addColorStop(0.45, rgba(pRgb, re * 0.16)); lg.addColorStop(1, rgba(pRgb, 0));
            ctx.fillStyle = lg;
          } else ctx.fillStyle = rgba(pRgb, re * 0.18);
          ctx.beginPath(); ctx.moveTo(sc.sx, sc.sy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }
    const gm = actor3D && Number(actor3D.notoGleam) > 0 ? actor3D.notoGleam : (rawP >= 0.7 && rawP <= 0.84 ? sin(((rawP - 0.7) / 0.14) * PI) : 0);
    if (gm > 0.04 && actor3D) {
      const gx = (isFin(actor3D.sx) ? actor3D.sx : w * 0.5) + (actor3D.facing || -1) * 26, gy = (isFin(actor3D.sy) ? actor3D.sy : h * 0.5) + 12;
      const arm = (34 + gm * 62) * clamp(actor3D.pScale || 1, 0.7, 1.8);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const ang = k * HP + 0.22, ln = k === 0 ? arm * 1.35 : arm * 0.82;
        strokeLine(ctx, gx - cos(ang) * ln, gy - sin(ang) * ln, gx + cos(ang) * ln, gy + sin(ang) * ln, 3.2 * gm, rgba('255,255,255', gm * 0.92));
      }
      ctx.beginPath(); ctx.arc(gx, gy, 5.5 * gm, 0, TAU); ctx.fillStyle = rgba(cRgb, gm * 0.95); ctx.fill();
      ctx.restore();
    }
  }

  function mountStageLayers(overlayEl, opts) {
    if (dead) return { ok: false, mode: 'canvas2d-3d', glReady: false, stageCanvas: null };
    let stageCanvas = null;
    if (overlayEl) {
      if (overlayEl.dataset) overlayEl.dataset.kny3dSandwich = 'single-gl-compositor';
      if (isFn(overlayEl.querySelector)) stageCanvas = overlayEl.querySelector('.agy-kny-vfx-canvas');
    }
    const glReady = (opts && opts.reducedMotion) ? false : ensureGl(1280, 720, opts || null);
    return { ok: true, mode: getDiagnostics().mode, glReady, stageCanvas };
  }

  function prepFrame(w, h, rawP, skill, opts) {
    const o = opts || {}, pk = String(o.persona || o.personaId || o.fxMode || (skill && skill.persona) || '');
    const k = `${(skill && skill.id) || 'giyu_1'}|${pk}|${w}x${h}|${rawP.toFixed(5)}|${Boolean(o.reducedMotion)}`;
    if (cKey === k && cProf && cCam) return { prof: cProf, cam: cCam };
    cProf = resolveSkill3DProfile(skill, o);
    cCam = computeCameraState(rawP, cProf.archetype, { width: w, height: h, reducedMotion: Boolean(o.reducedMotion) });
    buildRibbons(cProf, rawP, w, h);
    cKey = k; geoUp = false;
    return { prof: cProf, cam: cCam };
  }

  function renderBackPass(ctx2d, w, h, rawP, skill, actor3D, opts) {
    if (dead || !ctx2d) return;
    const vw = normW(w), vh = normH(h), p = clamp(Number(rawP) || 0, 0, 1);
    const az = actor3D && isFin(actor3D.worldZ) ? actor3D.worldZ : 0, { prof, cam } = prepFrame(vw, vh, p, skill, opts);
    drawParticles(ctx2d, vw, vh, p, prof, cam, az, false);
    if (ensureGl(vw, vh, opts) && drawGlPass(ctx2d, vw, vh, p, prof, cam, az, -1, !geoUp)) { geoUp = true; return; }
    draw2DPass(ctx2d, vw, vh, prof, cam, az, -1);
  }

  function renderFrontPass(ctx2d, w, h, rawP, skill, actor3D, opts) {
    if (dead || !ctx2d) return;
    const vw = normW(w), vh = normH(h), p = clamp(Number(rawP) || 0, 0, 1);
    const az = actor3D && isFin(actor3D.worldZ) ? actor3D.worldZ : 0, { prof, cam } = prepFrame(vw, vh, p, skill, opts);
    if (ensureGl(vw, vh, opts) && drawGlPass(ctx2d, vw, vh, p, prof, cam, az, 1, !geoUp)) geoUp = true;
    else draw2DPass(ctx2d, vw, vh, prof, cam, az, 1);
    drawParticles(ctx2d, vw, vh, p, prof, cam, az, true);
    drawFinisher(ctx2d, vw, vh, p, prof, cam, actor3D);
  }

  function renderImpactFrame(ctx2d, w, h, actor3D, skill, spriteEntry) {
    if (dead || !ctx2d || !actor3D || !actor3D.impactFrameKind) return false;
    const vw = normW(w), vh = normH(h);
    const cx = isFin(actor3D.sx) ? actor3D.sx : vw * 0.5, cy = isFin(actor3D.sy) ? actor3D.sy : vh * 0.5, mR = hypot(vw, vh);
    ctx2d.save();
    if (actor3D.impactFrameKind === 'invert_white') {
      ctx2d.fillStyle = 'rgba(248,250,252,0.84)'; ctx2d.fillRect(0, 0, vw, vh); ctx2d.fillStyle = '#09090b';
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU + seeded(i, 7) * 0.08, ir = 65 + seeded(i, 19) * 110, sp = 0.016 + seeded(i, 31) * 0.028;
        ctx2d.beginPath(); ctx2d.moveTo(cx + cos(a) * ir, cy + sin(a) * ir);
        ctx2d.lineTo(cx + cos(a - sp) * mR, cy + sin(a - sp) * mR); ctx2d.lineTo(cx + cos(a + sp) * mR, cy + sin(a + sp) * mR);
        ctx2d.closePath(); ctx2d.fill();
      }
    } else {
      ctx2d.fillStyle = 'rgba(6,7,15,0.86)'; ctx2d.fillRect(0, 0, vw, vh); ctx2d.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 3; b++) {
        const ba = -0.34 + b * 0.34;
        ctx2d.beginPath();
        for (let s = -8; s <= 8; s++) {
          const d = (s / 8) * mR * 0.65, jt = s === 0 ? 0 : (seeded(s + 12, b + 5) - 0.5) * 46;
          const px = cx + cos(ba) * d - sin(ba) * jt, py = cy + sin(ba) * d + cos(ba) * jt;
          if (s === -8) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
        }
        ctx2d.lineWidth = b === 1 ? 9 : 4.5; ctx2d.strokeStyle = b === 1 ? '#ef4444' : '#dc2626'; ctx2d.stroke();
        ctx2d.lineWidth = b === 1 ? 3 : 1.5; ctx2d.strokeStyle = '#ffffff'; ctx2d.stroke();
      }
    }
    if (spriteEntry && spriteEntry.loaded && !spriteEntry.failed && spriteEntry.img && isFn(ctx2d.drawImage)) {
      const s = Number(actor3D.size) || 206;
      ctx2d.save(); ctx2d.translate(cx, cy); ctx2d.rotate(actor3D.rot || 0);
      ctx2d.scale((actor3D.facing || -1) * (actor3D.nativeFacing || -1) < 0 ? -1 : 1, 1);
      ctx2d.globalAlpha = 0.95; ctx2d.drawImage(spriteEntry.img, -s * 0.5, -s * 0.5, s, s); ctx2d.restore();
    }
    ctx2d.restore();
    return true;
  }

  function getDiagnostics() {
    const mode = (!force2D && gl && shOk) ? (glVer === 2 ? 'webgl2' : 'webgl1') : 'canvas2d-3d';
    return { mode, contextActive: Boolean(gl), shaderCompiled: Boolean(shOk), fallbackReason: fbReason || '' };
  }

  function destroy() {
    dead = true;
    releaseGpuNow();
    if (visBound && typeof document !== 'undefined' && document && isFn(document.removeEventListener)) {
      try { document.removeEventListener('visibilitychange', onVis, false); } catch (_) {}
      visBound = false;
    }
    cKey = ''; cProf = null; cCam = null; geoUp = false; RVC = 0; slowStreak = 0; accMs = 0;
  }

  ROOT.__AGY_KNY_3D_VFX__ = Object.freeze({
    ARCHETYPES, mat4Perspective, mat4LookAt, mat4Multiply, projectPoint3D, computeCameraState,
    resolveSkill3DProfile, computeActor3DTrajectory, mountStageLayers, renderBackPass, renderFrontPass,
    renderImpactFrame, releaseGpuNow, getDiagnostics, destroy, teardown: destroy
  });
})();
