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
    if (typeof _glFaceTextures !== 'undefined' && _glFaceTextures) _glFaceTextures.clear();
    if (typeof _glCustomRes !== 'undefined' && _glCustomRes) _glCustomRes.clear();
    chGlProg = null; chGlOutProg = null; chGlVbo = null; chGlIbo = null; chGlLoc = null; chOutLoc = null; chGlReady = false;
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
    if (typeof releaseChibiGlResources === 'function') {
      try { releaseChibiGlResources(); } catch (_) {}
    }
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

  function getDiagnostics() {
    return {
      mode: (gl && shOk) ? (glVer === 2 ? 'webgl2' : 'webgl1') : 'canvas2d-3d',
      contextActive: Boolean(gl),
      shaderCompiled: Boolean(gl && shOk),
      fallbackReason: fbReason || '',
      webglVersion: glVer,
      leaseActive: Boolean(leaseT),
      destroyed: Boolean(dead),
      slowStreak,
      lostCount
    };
  }

  function destroy() {
    dead = true;
    releaseGpuNow();
    if (typeof _faceTexCache !== 'undefined' && _faceTexCache) _faceTexCache.clear();
    if (typeof _customGlbModels !== 'undefined' && _customGlbModels) _customGlbModels.clear();
    if (typeof _assetGlbProbed !== 'undefined' && _assetGlbProbed) _assetGlbProbed.clear();
    if (typeof _idbHydrated !== 'undefined') _idbHydrated = false;
    if (visBound && typeof document !== 'undefined' && document && isFn(document.removeEventListener)) {
      try { document.removeEventListener('visibilitychange', onVis, false); } catch (_) {}
      visBound = false;
    }
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
        if (!extPar) {
          c.enable(c.DEPTH_TEST); c.depthFunc(c.LEQUAL); c.enable(c.BLEND); c.blendFunc(c.ONE, c.ONE_MINUS_SRC_ALPHA); c.disable(c.CULL_FACE);
        }
        shOk = false;
        if (extPar) { shPend = true; } else if (!linkSetup(c)) return false;
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
    if (gl.SCISSOR_TEST && isFn(gl.disable)) gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, glCv.width, glCv.height);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
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
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE * 4, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE * 4, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE * 4, 24);
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

  function renderImpactFrame(ctx2d, w, h, actor3D, skill, spriteEntry, opts) {
    if (dead || !ctx2d || !actor3D || !actor3D.impactFrameKind) return false;
    const vw = normW(w), vh = normH(h);
    const o = opts || {};
    const reducedM = Boolean(o.reducedMotion || actor3D.reducedMotion);
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
    let use3dSilhouette = false;
    try {
      const cid = String((skill && skill.charId) || actor3D.charId || 'shinobu').trim().toLowerCase();
      const ch3dDisabled = o.chibi3dEnabled === false || (typeof localStorage !== 'undefined' && localStorage && localStorage.getItem('agy_chibi_3d_v1') === 'false');
      const hasReal3d = Boolean(o.allowProcedural3d === true || (typeof hasRealGlbModel === 'function' && hasRealGlbModel(cid)));
      if (!ch3dDisabled && hasReal3d && typeof renderStageChibi3D === 'function') {
        renderStageChibi3D(ctx2d, vw, vh, actor3D, skill, 0.345, { impactSilhouette: true, reducedMotion: reducedM, dpr: o.dpr });
        use3dSilhouette = true;
      }
    } catch (_) {}
    if (!use3dSilhouette && spriteEntry && spriteEntry.loaded && !spriteEntry.failed && spriteEntry.img && isFn(ctx2d.drawImage)) {
      const s = Number(actor3D.size) || 206;
      ctx2d.save(); ctx2d.translate(cx, cy); ctx2d.rotate(actor3D.rot || 0);
      ctx2d.scale((actor3D.facing || -1) * (actor3D.nativeFacing || -1) < 0 ? -1 : 1, 1);
      ctx2d.globalAlpha = 0.95; ctx2d.drawImage(spriteEntry.img, -s * 0.5, -s * 0.5, s, s); ctx2d.restore();
    }
    ctx2d.restore();
    return true;
  }

  /* ==========================================================================
   * 8. REAL 3D CEL-SHADED NENDOROID CHIBI ENGINE + glTF 2.0 (.glb/.vrm) LOADER
   * ========================================================================== */

  const CHIBI_DB_NAME = 'agy_chibi_3d_models_db';
  const CHIBI_DB_STORE = 'models';
  const CHIBI_MAX_GLB_BYTES = 25 * 1024 * 1024;
  const CHIBI_MAX_GLB_VERTS = 250000;
  const CHIBI_MAX_GLB_PRIMS = 128;
  const CHIBI_FACE_CACHE_MAX = 32;
  const CHIBI_CANVAS_2D_TRI_CAP = 2800;

  function normalizeChibiCharId(charId) {
    const k = String(charId || 'shinobu').trim().toLowerCase();
    return k === 'moon' ? 'obanai' : k;
  }

  function mat4Identity(out) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }
  function mat4Copy(out, src) {
    for (let i = 0; i < 16; i++) out[i] = src[i];
    return out;
  }
  function mat4Translate(out, x, y, z) {
    out[12] += out[0] * x + out[4] * y + out[8] * z;
    out[13] += out[1] * x + out[5] * y + out[9] * z;
    out[14] += out[2] * x + out[6] * y + out[10] * z;
    out[15] += out[3] * x + out[7] * y + out[11] * z;
    return out;
  }
  function mat4Scale(out, x, y, z) {
    out[0] *= x; out[1] *= x; out[2] *= x; out[3] *= x;
    out[4] *= y; out[5] *= y; out[6] *= y; out[7] *= y;
    out[8] *= z; out[9] *= z; out[10] *= z; out[11] *= z;
    return out;
  }
  function mat4RotateX(out, rad) {
    if (abs(rad) < 1e-6) return out;
    const s = sin(rad), c = cos(rad);
    const a10 = out[4], a11 = out[5], a12 = out[6], a13 = out[7];
    const a20 = out[8], a21 = out[9], a22 = out[10], a23 = out[11];
    out[4] = a10 * c + a20 * s; out[5] = a11 * c + a21 * s; out[6] = a12 * c + a22 * s; out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s; out[9] = a21 * c - a11 * s; out[10] = a22 * c - a12 * s; out[11] = a23 * c - a13 * s;
    return out;
  }
  function mat4RotateY(out, rad) {
    if (abs(rad) < 1e-6) return out;
    const s = sin(rad), c = cos(rad);
    const a00 = out[0], a01 = out[1], a02 = out[2], a03 = out[3];
    const a20 = out[8], a21 = out[9], a22 = out[10], a23 = out[11];
    out[0] = a00 * c - a20 * s; out[1] = a01 * c - a21 * s; out[2] = a02 * c - a22 * s; out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c; out[9] = a01 * s + a21 * c; out[10] = a02 * s + a22 * c; out[11] = a03 * s + a23 * c;
    return out;
  }
  function mat4RotateZ(out, rad) {
    if (abs(rad) < 1e-6) return out;
    const s = sin(rad), c = cos(rad);
    const a00 = out[0], a01 = out[1], a02 = out[2], a03 = out[3];
    const a10 = out[4], a11 = out[5], a12 = out[6], a13 = out[7];
    out[0] = a00 * c + a10 * s; out[1] = a01 * c + a11 * s; out[2] = a02 * c + a12 * s; out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s; out[5] = a11 * c - a01 * s; out[6] = a12 * c - a02 * s; out[7] = a13 * c - a03 * s;
    return out;
  }
  function mat4FromQuat(out, qx, qy, qz, qw) {
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2;
    const yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    out[0] = 1 - (yy + zz); out[1] = xy + wz; out[2] = xz - wy; out[3] = 0;
    out[4] = xy - wz; out[5] = 1 - (xx + zz); out[6] = yz + wx; out[7] = 0;
    out[8] = xz + wy; out[9] = yz - wx; out[10] = 1 - (xx + yy); out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }
  const _tmpTrs = new Float32Array(16);
  function mat4ComposeTRS(out, t, q, s) {
    mat4FromQuat(_tmpTrs, q ? q[0] : 0, q ? q[1] : 0, q ? q[2] : 0, q ? q[3] : 1);
    const sx = s ? s[0] : 1, sy = s ? s[1] : 1, sz = s ? s[2] : 1;
    out[0] = _tmpTrs[0] * sx; out[1] = _tmpTrs[1] * sx; out[2] = _tmpTrs[2] * sx; out[3] = 0;
    out[4] = _tmpTrs[4] * sy; out[5] = _tmpTrs[5] * sy; out[6] = _tmpTrs[6] * sy; out[7] = 0;
    out[8] = _tmpTrs[8] * sz; out[9] = _tmpTrs[9] * sz; out[10] = _tmpTrs[10] * sz; out[11] = 0;
    out[12] = t ? t[0] : 0; out[13] = t ? t[1] : 0; out[14] = t ? t[2] : 0; out[15] = 1;
    return out;
  }
  function mat3NormalFromMat4(out9, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[4], a11 = m[5], a12 = m[6], a20 = m[8], a21 = m[9], a22 = m[10];
    const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (abs(det) < 1e-8) {
      out9[0] = 1; out9[1] = 0; out9[2] = 0; out9[3] = 0; out9[4] = 1; out9[5] = 0; out9[6] = 0; out9[7] = 0; out9[8] = 1;
      return out9;
    }
    det = 1 / det;
    out9[0] = b01 * det; out9[1] = (-a22 * a01 + a02 * a21) * det; out9[2] = (a12 * a01 - a02 * a11) * det;
    out9[3] = b11 * det; out9[4] = (a22 * a00 - a02 * a20) * det; out9[5] = (-a12 * a00 + a02 * a10) * det;
    out9[6] = b21 * det; out9[7] = (-a21 * a00 + a01 * a20) * det; out9[8] = (a11 * a00 - a01 * a10) * det;
    return out9;
  }

  const _mStack = [];
  for (let i = 0; i < 16; i++) _mStack.push(new Float32Array(16));
  const _chibiProj = new Float32Array(16), _chibiView = new Float32Array(16), _chibiVP = new Float32Array(16);
  const _chibiEye = new Float32Array([0, 0.96, 3.35]), _chibiTgt = new Float32Array([0, 0.88, 0]), _chibiUp = new Float32Array([0, 1, 0]);
  const _chibiNrmMat = new Float32Array(9), _chibiTmpCol = new Float32Array(9);

  function buildChibiMeshAtlas() {
    const verts = [];
    const indices = [];
    const meshes = Object.create(null);

    function beginMesh() {
      return { baseVert: verts.length / 8, idxStart: indices.length };
    }
    function pushVert(px, py, pz, nx, ny, nz, u, v) {
      const nl = hypot(nx, ny, nz) || 1;
      verts.push(px, py, pz, nx / nl, ny / nl, nz / nl, u, v);
    }
    function recomputeNormalsRange(vStart, vEnd, idxStart, idxEnd) {
      for (let v = vStart; v < vEnd; v++) {
        const o = v * 8; verts[o + 3] = 0; verts[o + 4] = 0; verts[o + 5] = 0;
      }
      for (let i = idxStart; i < idxEnd; i += 3) {
        const i0 = indices[i] * 8, i1 = indices[i + 1] * 8, i2 = indices[i + 2] * 8;
        const e1x = verts[i1] - verts[i0], e1y = verts[i1 + 1] - verts[i0 + 1], e1z = verts[i1 + 2] - verts[i0 + 2];
        const e2x = verts[i2] - verts[i0], e2y = verts[i2 + 1] - verts[i0 + 1], e2z = verts[i2 + 2] - verts[i0 + 2];
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        verts[i0 + 3] += nx; verts[i0 + 4] += ny; verts[i0 + 5] += nz;
        verts[i1 + 3] += nx; verts[i1 + 4] += ny; verts[i1 + 5] += nz;
        verts[i2 + 3] += nx; verts[i2 + 4] += ny; verts[i2 + 5] += nz;
      }
      for (let v = vStart; v < vEnd; v++) {
        const o = v * 8;
        const l = hypot(verts[o + 3], verts[o + 4], verts[o + 5]) || 1;
        verts[o + 3] /= l; verts[o + 4] /= l; verts[o + 5] /= l;
      }
    }
    function ensureOutwardWinding(vStart, vEnd, idxStart, idxEnd, cx0, cy0, cz0) {
      let cx = 0, cy = 0, cz = 0;
      const vCount = vEnd - vStart;
      if (vCount <= 0) return;
      if (cx0 !== undefined) {
        cx = cx0; cy = cy0; cz = cz0;
      } else {
        for (let v = vStart; v < vEnd; v++) {
          const o = v * 8; cx += verts[o]; cy += verts[o + 1]; cz += verts[o + 2];
        }
        cx /= vCount; cy /= vCount; cz /= vCount;
      }
      let signedVol = 0;
      for (let i = idxStart; i < idxEnd; i += 3) {
        const i0 = indices[i] * 8, i1 = indices[i + 1] * 8, i2 = indices[i + 2] * 8;
        const ax = verts[i0], ay = verts[i0 + 1], az = verts[i0 + 2];
        const e1x = verts[i1] - ax, e1y = verts[i1 + 1] - ay, e1z = verts[i1 + 2] - az;
        const e2x = verts[i2] - ax, e2y = verts[i2 + 1] - ay, e2z = verts[i2 + 2] - az;
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const tx = (ax + verts[i1] + verts[i2]) * 0.3333 - cx;
        const ty = (ay + verts[i1 + 1] + verts[i2 + 1]) * 0.3333 - cy;
        const tz = (az + verts[i1 + 2] + verts[i2 + 2]) * 0.3333 - cz;
        signedVol += nx * tx + ny * ty + nz * tz;
      }
      if (signedVol < 0) {
        for (let i = idxStart; i < idxEnd; i += 3) {
          const tmp = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = tmp;
        }
      }
    }
    function appendBackFaceShell(vStart, vEnd, idxStart, idxEnd, thick) {
      const nV = vEnd - vStart;
      const baseNew = verts.length / 8;
      for (let v = vStart; v < vEnd; v++) {
        const o = v * 8;
        verts.push(
          verts[o] - verts[o + 3] * thick,
          verts[o + 1] - verts[o + 4] * thick,
          verts[o + 2] - verts[o + 5] * thick,
          -verts[o + 3], -verts[o + 4], -verts[o + 5],
          verts[o + 6], verts[o + 7]
        );
      }
      for (let i = idxStart; i < idxEnd; i += 3) {
        const a = (indices[i] - vStart) + baseNew;
        const b = (indices[i + 1] - vStart) + baseNew;
        const c = (indices[i + 2] - vStart) + baseNew;
        indices.push(a, c, b);
      }
      void nV;
    }
    function endMesh(name, mStart, optsEnd) {
      const o = optsEnd || {};
      const vEnd = verts.length / 8;
      if (!o.skipWindingCheck) ensureOutwardWinding(mStart.baseVert, vEnd, mStart.idxStart, indices.length, o.cx, o.cy, o.cz);
      recomputeNormalsRange(mStart.baseVert, vEnd, mStart.idxStart, indices.length);
      if (o.doubleSided) {
        const origIdxEnd = indices.length;
        const origVEnd = verts.length / 8;
        appendBackFaceShell(mStart.baseVert, origVEnd, mStart.idxStart, origIdxEnd, o.thickness || 0.008);
      }
      meshes[name] = { idxStart: mStart.idxStart, idxCount: indices.length - mStart.idxStart };
    }
    function buildLatheGrid(segsU, segsV, posFn, uvFn) {
      const base = verts.length / 8;
      const stride = segsU + 1;
      for (let j = 0; j <= segsV; j++) {
        const v = j / segsV;
        for (let i = 0; i <= segsU; i++) {
          const u = i / segsU;
          const p = posFn(u, v);
          const uv = uvFn ? uvFn(u, v, p) : [u, v];
          pushVert(p[0], p[1], p[2], p[0], p[1], p[2], uv[0], uv[1]);
        }
      }
      for (let j = 0; j < segsV; j++) {
        for (let i = 0; i < segsU; i++) {
          const a = base + j * stride + i;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }

    // 1. chibiHead (24x18): Sculpted Nendoroid cheeks + soft anime chin + planar front face UV
    {
      const m = beginMesh();
      buildLatheGrid(24, 18, (u, v) => {
        const ph = (u - 0.5) * TAU; // 0 = front (+Z) at u = 0.5
        const th = v * PI;          // 0 = top (+Y), PI = bottom (-Y)
        const sT = sin(th), cT = cos(th);
        let x = sin(ph) * sT * 0.44;
        let y = cT * 0.41;
        let z = cos(ph) * sT * 0.42;
        const frontMask = max(0, cos(ph));
        const lowerMask = smoothstepN(0.45, 0.85, v);
        // Puffy Nendoroid cheeks on lower-left/right front
        const cheekL = expMask(-hypot(x - 0.19, y + 0.11, z - 0.25) * 4.8);
        const cheekR = expMask(-hypot(x + 0.19, y + 0.11, z - 0.25) * 4.8);
        x *= 1 + lowerMask * 0.08 * (1 - abs(x) * 0.4);
        z += (cheekL + cheekR) * 0.036;
        // Soft tapered chin & slightly flatter front face plane for crisp anime eyes
        if (y < -0.18) y -= (-0.18 - y) * 0.18 * frontMask;
        if (z > 0.28) z = 0.28 + (z - 0.28) * 0.78;
        return [x, y, z];
      }, (u, v, p) => {
        if (p[2] > 0.08) {
          const fu = clamp(p[0] / 0.68 + 0.5, 0.02, 0.98);
          const fv = clamp(0.5 - p[1] / 0.66, 0.02, 0.98);
          return [fu, fv];
        }
        return [0.02, 0.02];
      });
      endMesh('chibiHead', m);
    }

    // 2. sphere (18x12): Hands, prayer beads, orb, buns
    {
      const m = beginMesh();
      buildLatheGrid(18, 12, (u, v) => {
        const ph = u * TAU, th = v * PI;
        return [sin(ph) * sin(th) * 0.5, cos(th) * 0.5, cos(ph) * sin(th) * 0.5];
      });
      endMesh('sphere', m);
    }

    // 3. capsule (14x10): Torso, limbs, snake segments, bamboo
    {
      const m = beginMesh();
      buildLatheGrid(14, 10, (u, v) => {
        const ph = u * TAU;
        const y = 0.5 - v; // +0.5 -> -0.5
        const capT = v < 0.2 ? sin((v / 0.2) * HP) : (v > 0.8 ? sin(((1 - v) / 0.2) * HP) : 1);
        const r = 0.5 * capT;
        return [sin(ph) * r, y, cos(ph) * r];
      });
      endMesh('capsule', m);
    }

    // 4. taperedCoat (18x10): Flared Haori, Hakama, Kimono Sleeves with crisp [0..1] UVs
    {
      const m = beginMesh();
      buildLatheGrid(18, 10, (u, v) => {
        const ph = (u - 0.5) * TAU; // u=0.5 is front (+Z)
        const r = 0.30 + v * 0.28;
        const y = 0.5 - v;
        return [sin(ph) * r, y, cos(ph) * r * 0.88];
      }, (u, v) => [u, v]);
      endMesh('taperedCoat', m);
    }

    // 5. hairStrand (10x8): Curved teardrop lock pointing downward at tip
    {
      const m = beginMesh();
      buildLatheGrid(10, 8, (u, v) => {
        const ph = u * TAU;
        const taper = v < 0.18 ? sin((v / 0.18) * HP) : pow(max(0.02, 1 - (v - 0.18) / 0.82), 0.72);
        const rx = 0.22 * taper, rz = 0.14 * taper;
        const curveZ = -sin(v * PI) * 0.10 + v * v * 0.14;
        return [cos(ph) * rx, -v, sin(ph) * rz + curveZ];
      });
      endMesh('hairStrand', m);
    }

    // 6. blade (diamond cross-section tapering cleanly to kissaki tip along +Y)
    {
      const m = beginMesh();
      const base = verts.length / 8;
      const segsY = 8;
      const profile = [[0, 0.04], [0.042, 0], [0, -0.04], [-0.042, 0], [0, 0.04]];
      for (let j = 0; j <= segsY; j++) {
        const t = j / segsY;
        const y = t;
        const tipScale = t > 0.82 ? max(0.05, 1 - (t - 0.82) / 0.18) : (1 - t * 0.12);
        const curveZ = t * t * 0.06;
        for (let i = 0; i <= 4; i++) {
          const px = profile[i][0] * (i === 0 || i === 2 ? 1 : tipScale);
          const pz = profile[i][1] * tipScale + curveZ;
          pushVert(px, y, pz, px, 0, pz, i / 4, t);
        }
      }
      for (let j = 0; j < segsY; j++) {
        for (let i = 0; i < 4; i++) {
          const a = base + j * 5 + i;
          const b = a + 1;
          const c = a + 5;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      endMesh('blade', m);
    }

    // 7. box: Tsuba, earrings, headbands, belt, hilt
    {
      const m = beginMesh();
      const faces = [
        { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
        { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
        { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
        { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
        { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }
      ];
      for (let f = 0; f < 6; f++) {
        const fc = faces[f], b = verts.length / 8;
        const c = fc.n, ux = fc.u, vx = fc.v;
        const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
        for (let k = 0; k < 4; k++) {
          const sx = pts[k][0], sy = pts[k][1];
          pushVert(c[0] * 0.5 + ux[0] * sx + vx[0] * sy, c[1] * 0.5 + ux[1] * sx + vx[1] * sy, c[2] * 0.5 + ux[2] * sx + vx[2] * sy, c[0], c[1], c[2], k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0);
        }
        indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      endMesh('box', m);
    }

    // 8. wing: Sculpted butterfly wing (double-sided for 360° orbit visibility)
    {
      const m = beginMesh();
      buildLatheGrid(10, 6, (u, v) => {
        const t = u;
        const w = sin(v * PI);
        const span = 0.55 * t;
        const hLobe = (v - 0.42) * (0.28 + 0.52 * sin(t * PI * 0.85));
        const z = sin(t * PI) * 0.04 + (w - 0.5) * 0.02;
        return [span, hLobe, z];
      });
      endMesh('wing', m, { cx: 0.25, cy: 0, cz: -0.25, doubleSided: true, thickness: 0.006 });
    }

    // 9. boarSnout: Tapered cylinder toward +Z for Inosuke mask
    {
      const m = beginMesh();
      buildLatheGrid(12, 6, (u, v) => {
        const ph = u * TAU;
        const r = lerp(0.32, 0.16, v);
        return [cos(ph) * r, sin(ph) * r * 0.82, v * 0.44];
      });
      endMesh('boarSnout', m);
    }

    // 10. tusk: Curved horn/tusk curving up & forward
    {
      const m = beginMesh();
      buildLatheGrid(8, 8, (u, v) => {
        const ph = u * TAU;
        const r = 0.09 * pow(max(0.05, 1 - v), 0.75);
        const cy = sin(v * HP) * 0.36;
        const cz = (1 - cos(v * HP)) * 0.24;
        return [cos(ph) * r, cy + sin(ph) * r * 0.4, cz];
      });
      endMesh('tusk', m);
    }

    // 11. hairCap: Open-front crown + back-of-head hair shell (never covers the anime face)
    {
      const m = beginMesh();
      // Upper crown dome above eyebrow line (th = 0 .. 0.35*PI)
      buildLatheGrid(20, 7, (u, v) => {
        const ph = (u - 0.5) * TAU;
        const th = v * 0.35 * PI;
        const sT = sin(th), cT = cos(th);
        return [sin(ph) * sT * 0.46, cT * 0.43, cos(ph) * sT * 0.44];
      });
      ensureOutwardWinding(m.baseVert, verts.length / 8, m.idxStart, indices.length, 0, 0, 0);
      // Temple-to-nape back shell excluding open face wedge [-65 deg, +65 deg]
      const b2 = verts.length / 8, i2 = indices.length;
      buildLatheGrid(18, 8, (u, v) => {
        const ph = 0.36 * PI + u * 1.28 * PI;
        const th = (0.33 + v * 0.44) * PI;
        const sT = sin(th), cT = cos(th);
        return [sin(ph) * sT * 0.465, cT * 0.43, cos(ph) * sT * 0.45];
      });
      ensureOutwardWinding(b2, verts.length / 8, i2, indices.length, 0, 0, 0);
      endMesh('hairCap', m, { skipWindingCheck: true, doubleSided: true, thickness: 0.012 });
    }

    // 12. haoriCoat: Front V-open flared Haori cloak showing Slayer uniform & obi underneath
    {
      const m = beginMesh();
      buildLatheGrid(18, 10, (u, v) => {
        // Leave front center gap around ph = 0 so uniform + buttons + obi are visible
        const ph = 0.30 + u * (TAU - 0.60);
        const r = 0.31 + v * 0.27;
        const y = 0.5 - v;
        return [sin(ph) * r, y, cos(ph) * r * 0.90];
      }, (u, v) => [u, v]);
      ensureOutwardWinding(m.baseVert, verts.length / 8, m.idxStart, indices.length, 0, 0, 0);
      endMesh('haoriCoat', m, { skipWindingCheck: true, doubleSided: true, thickness: 0.012 });
    }

    return {
      vertices: new Float32Array(verts),
      indices: new Uint16Array(indices),
      meshes
    };
  }

  function smoothstepN(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function expMask(x) {
    return x < -10 ? 0 : Math.exp(x);
  }

  let _atlasCache = null;
  function getChibiAtlas() {
    if (!_atlasCache) _atlasCache = buildChibiMeshAtlas();
    return _atlasCache;
  }

  // 15 Canonical KNY 3D Chibi Appearance Profiles
  const CHIBI_PROFILES = {
    ubuyashiki: {
      hairCol: '#171522', hairTipCol: '#312e81', skinCol: '#fdf2ee', haoriCol: '#f5f3ff', haoriSubCol: '#c084fc',
      uniformCol: '#2e1065', eyeCol: '#7e22ce', bladeCol: '#fde047', rimCol: '#facc15', accentCol: '#e879f9',
      pattern: 8, bangs: 6, sideLocks: true, backStyle: 'bob', foreheadMark: 'curse', weapon: 'fan'
    },
    shinobu: {
      hairCol: '#181424', hairTipCol: '#9333ea', skinCol: '#fde8e2', haoriCol: '#f8fafc', haoriSubCol: '#5eead4',
      uniformCol: '#1e1b2e', eyeCol: '#9333ea', bladeCol: '#c084fc', rimCol: '#c084fc', accentCol: '#5eead4',
      pattern: 5, bangs: 5, sideLocks: true, backStyle: 'bun', butterflyPin: true, weapon: 'needle_blade'
    },
    giyu: {
      hairCol: '#111827', hairTipCol: '#1e293b', skinCol: '#fce4db', haoriCol: '#7f1d1d', haoriSubCol: '#eab308',
      uniformCol: '#111827', eyeCol: '#0284c7', bladeCol: '#38bdf8', rimCol: '#38bdf8', accentCol: '#bae6fd',
      pattern: 2, bangs: 7, sideLocks: false, backStyle: 'spiky_ponytail', spikyHair: true, weapon: 'katana'
    },
    rengoku: {
      hairCol: '#facc15', hairTipCol: '#dc2626', skinCol: '#fde3d7', haoriCol: '#fefce8', haoriSubCol: '#ef4444',
      uniformCol: '#1c1917', eyeCol: '#ea580c', bladeCol: '#f97316', rimCol: '#f97316', accentCol: '#facc15',
      pattern: 7, bangs: 7, sideLocks: true, backStyle: 'flame_mane', spikyHair: true, strongBrows: true, weapon: 'katana'
    },
    uzui: {
      hairCol: '#f1f5f9', hairTipCol: '#cbd5e1', skinCol: '#f7d8c8', haoriCol: '#1e1b2e', haoriSubCol: '#facc15',
      uniformCol: '#0f172a', eyeCol: '#be123c', bladeCol: '#facc15', rimCol: '#facc15', accentCol: '#f472b6',
      pattern: 0, bangs: 3, sideLocks: false, backStyle: 'short', headband: 'gems', faceTattoo: 'uzui', weapon: 'dual_cleaver'
    },
    muichiro: {
      hairCol: '#111827', hairTipCol: '#5eead4', skinCol: '#fdf0ea', haoriCol: '#0f172a', haoriSubCol: '#2dd4bf',
      uniformCol: '#111827', eyeCol: '#14b8a6', bladeCol: '#99f6e4', rimCol: '#5eead4', accentCol: '#ccfbf1',
      pattern: 0, bangs: 6, sideLocks: true, backStyle: 'long_mist', weapon: 'katana'
    },
    mitsuri: {
      hairCol: '#f472b6', hairTipCol: '#84cc16', skinCol: '#ffe6e6', haoriCol: '#ffffff', haoriSubCol: '#f472b6',
      uniformCol: '#3b0764', eyeCol: '#22c55e', bladeCol: '#f472b6', rimCol: '#f472b6', accentCol: '#a3e635',
      pattern: 0, bangs: 5, sideLocks: true, backStyle: 'braids3', weapon: 'whip_blade'
    },
    obanai: {
      hairCol: '#0f172a', hairTipCol: '#334155', skinCol: '#fbe6df', haoriCol: '#f8fafc', haoriSubCol: '#0f172a',
      uniformCol: '#111827', eyeCol: '#facc15', eyeCol2: '#14b8a6', bladeCol: '#a855f7', rimCol: '#a855f7', accentCol: '#34d399',
      pattern: 4, bangs: 6, sideLocks: true, backStyle: 'bob', bandageMouth: true, snakePet: true, weapon: 'wavy_blade'
    },
    sanemi: {
      hairCol: '#e2e8f0', hairTipCol: '#cbd5e1', skinCol: '#f8dcd0', haoriCol: '#f8fafc', haoriSubCol: '#22c55e',
      uniformCol: '#14532d', eyeCol: '#7e22ce', bladeCol: '#22c55e', rimCol: '#22c55e', accentCol: '#bbf7d0',
      pattern: 0, bangs: 7, sideLocks: false, backStyle: 'spiky', spikyHair: true, faceScar: 'sanemi', weapon: 'katana'
    },
    gyomei: {
      hairCol: '#1c1917', hairTipCol: '#292524', skinCol: '#f2cfbe', haoriCol: '#4d7c0f', haoriSubCol: '#fde047',
      uniformCol: '#1c1917', eyeCol: '#e2e8f0', bladeCol: '#f59e0b', rimCol: '#f59e0b', accentCol: '#fde68a',
      pattern: 0, bangs: 4, sideLocks: false, backStyle: 'short', foreheadMark: 'gyomei', blindEyes: true, prayerBeads: true, weapon: 'flail_axe'
    },
    tanjiro: {
      hairCol: '#1a0b0e', hairTipCol: '#991b1b', skinCol: '#fadbc8', haoriCol: '#10b981', haoriSubCol: '#090d16',
      uniformCol: '#18181b', eyeCol: '#b91c1c', bladeCol: '#f97316', rimCol: '#f97316', accentCol: '#38bdf8',
      pattern: 1, bangs: 7, sideLocks: false, backStyle: 'spiky', spikyHair: true, foreheadMark: 'tanjiro', hanafudaEarrings: true, weapon: 'katana'
    },
    nezuko: {
      hairCol: '#1c1418', hairTipCol: '#ea580c', skinCol: '#fce4e4', haoriCol: '#18181b', haoriSubCol: '#fb7185',
      uniformCol: '#f9a8d4', eyeCol: '#f43f5e', bladeCol: '#fb7185', rimCol: '#fb7185', accentCol: '#f9a8d4',
      pattern: 6, bangs: 5, sideLocks: true, backStyle: 'long_wavy', bambooMuzzle: true, hairRibbon: true, demonHorn: false, weapon: 'blood_orb'
    },
    zenitsu: {
      hairCol: '#facc15', hairTipCol: '#ea580c', skinCol: '#fce0d2', haoriCol: '#facc15', haoriSubCol: '#f97316',
      uniformCol: '#1c1917', eyeCol: '#d97706', bladeCol: '#fde047', rimCol: '#facc15', accentCol: '#38bdf8',
      pattern: 3, bangs: 7, sideLocks: false, backStyle: 'square_cut', spikyHair: true, weapon: 'katana'
    },
    inosuke: {
      hairCol: '#64748b', hairTipCol: '#334155', skinCol: '#f6d4c2', haoriCol: '#1e3a8a', haoriSubCol: '#78350f',
      uniformCol: '#f6d4c2', eyeCol: '#38bdf8', bladeCol: '#60a5fa', rimCol: '#60a5fa', accentCol: '#e2e8f0',
      pattern: 0, bangs: 0, sideLocks: false, backStyle: 'short', boarMask: true, shirtless: true, weapon: 'dual_serrated'
    },
    yoriichi: {
      hairCol: '#1f0808', hairTipCol: '#dc2626', skinCol: '#fae0d4', haoriCol: '#b91c1c', haoriSubCol: '#f59e0b',
      uniformCol: '#09090b', eyeCol: '#b91c1c', bladeCol: '#ef4444', rimCol: '#ef4444', accentCol: '#fde047',
      pattern: 0, bangs: 6, sideLocks: true, backStyle: 'high_ponytail', foreheadMark: 'sun', hanafudaEarrings: true, weapon: 'red_blade'
    }
  };
  const CHARACTER_IDS = Object.freeze(Object.keys(CHIBI_PROFILES));
  for (let i = 0; i < CHARACTER_IDS.length; i++) {
    CHIBI_PROFILES[CHARACTER_IDS[i]].id = CHARACTER_IDS[i];
  }
  CHIBI_PROFILES.moon = CHIBI_PROFILES.obanai;

  function resolveChibiProfile(charId) {
    const k = String(charId || 'shinobu').trim().toLowerCase();
    return CHIBI_PROFILES[k] || CHIBI_PROFILES.shinobu;
  }

  // Dynamic Procedural 256x256 Anime Face Atlas Texture
  const _faceTexCache = new Map();
  let _glFaceTextures = new Map();

  function paintChibiFaceCanvas(charId, expression, blinkAmt, outCanvas, eyeGazeX, eyeGazeY) {
    const prof = resolveChibiProfile(charId);
    const cv = outCanvas || (typeof document !== 'undefined' && isFn(document.createElement) ? document.createElement('canvas') : null);
    if (!cv) return null;
    if (cv.width !== 256) cv.width = 256;
    if (cv.height !== 256) cv.height = 256;
    const ctx = isFn(cv.getContext) ? cv.getContext('2d') : null;
    if (!ctx) return null;

    ctx.clearRect(0, 0, 256, 256);
    const expr = String(expression || 'idle');
    const blink = expr === 'blink' ? 1 : clamp(Number(blinkAmt) || 0, 0, 1);
    const gx = clamp(Number(eyeGazeX) || 0, -1, 1);
    const gy = clamp(Number(eyeGazeY) || 0, -1, 1);

    // Subtle soft blush cheeks
    const blushA = expr === 'happy' ? 0.48 : 0.30;
    for (let s = -1; s <= 1; s += 2) {
      const bx = 128 + s * 46, by = 152;
      if (isFn(ctx.createRadialGradient)) {
        const g = ctx.createRadialGradient(bx, by, 2, bx, by, 22);
        g.addColorStop(0, `rgba(251, 113, 133, ${blushA})`);
        g.addColorStop(1, 'rgba(251, 113, 133, 0)');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = `rgba(251, 113, 133, ${blushA * 0.5})`;
      }
      ctx.beginPath(); ctx.ellipse(bx, by, 22, 11, 0, 0, TAU); ctx.fill();
    }

    // Draw anime eyes (left & right)
    for (let s = -1; s <= 1; s += 2) {
      const ex = 128 + s * 36;
      const ey = 128;
      const eyeHex = (s === 1 && prof.eyeCol2) ? prof.eyeCol2 : prof.eyeCol;
      const eRgb = hexCss(eyeHex);

      // Eyebrow
      ctx.strokeStyle = '#18101c';
      ctx.lineWidth = prof.strongBrows ? 5.2 : 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const browTilt = expr === 'attack' || expr === 'focus' ? s * 5 : (expr === 'happy' ? -s * 4 : 0);
      ctx.moveTo(ex - s * 17, ey - 28 + browTilt);
      ctx.quadraticCurveTo(ex, ey - 33 - (expr === 'happy' ? 3 : 0), ex + s * 16, ey - 27 - browTilt);
      ctx.stroke();

      if (expr === 'happy' || blink > 0.72) {
        // Curved cheerful ^ ^ or calm closed lashes
        ctx.strokeStyle = '#120c18';
        ctx.lineWidth = 4.6;
        ctx.beginPath();
        if (expr === 'happy') {
          ctx.moveTo(ex - 16, ey + 4);
          ctx.quadraticCurveTo(ex, ey - 14, ex + 16, ey + 4);
        } else {
          ctx.moveTo(ex - 16, ey + 2);
          ctx.quadraticCurveTo(ex, ey + 8, ex + 16, ey + 2);
        }
        ctx.stroke();
      } else {
        const openH = (1 - blink * 0.85) * (expr === 'focus' ? 0.78 : (expr === 'attack' ? 1.06 : 1.0));
        const rx = 18.5, ry = 21.5 * openH;
        // Sclera white
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU);
        ctx.fill();

        // Multi-stop Anime Iris
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU);
        ctx.clip();
        if (prof.blindEyes) {
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath(); ctx.arc(ex + gx * 1.8, ey + gy * 1.5, 14, 0, TAU); ctx.fill();
        } else {
          const ix = ex + gx * 5.2;
          const iy = ey + 1 + gy * 4.4 * openH;
          const ig = isFn(ctx.createLinearGradient) ? ctx.createLinearGradient(ix, iy - 17, ix, iy + 17) : null;
          if (ig) {
            ig.addColorStop(0, '#090910');
            ig.addColorStop(0.45, `rgb(${eRgb})`);
            ig.addColorStop(1, '#f8fafc');
            ctx.fillStyle = ig;
          } else {
            ctx.fillStyle = `rgb(${eRgb})`;
          }
          ctx.beginPath(); ctx.ellipse(ix, iy, 14.5, 17 * openH, 0, 0, TAU); ctx.fill();
          // Pupil
          ctx.fillStyle = '#070612';
          ctx.beginPath(); ctx.ellipse(ix + gx * 0.8, iy + gy * 0.6, 6.5, 7.8 * openH, 0, 0, TAU); ctx.fill();
          // Double anime catchlights
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(ix - 5.5 + gx * 0.9, iy - 7 * openH + gy * 0.6, 4.4, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(ix + 5.2 + gx * 0.5, iy + 4.5 * openH + gy * 0.4, 2.3, 0, TAU); ctx.fill();
        }
        ctx.restore();

        // Crisp upper eyelash arch & lower lash
        ctx.strokeStyle = '#0e0916';
        ctx.lineWidth = 4.6;
        ctx.beginPath();
        ctx.moveTo(ex - s * 19, ey - 2);
        ctx.quadraticCurveTo(ex, ey - ry * 1.18, ex + s * 18.5, ey + 1);
        ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(ex - 11, ey + ry * 0.9);
        ctx.quadraticCurveTo(ex, ey + ry * 1.05, ex + 11, ey + ry * 0.9);
        ctx.stroke();
      }
    }

    // Character-specific forehead marks / scars / Uzui tattoo / Obanai bandage / Nezuko muzzle
    if (prof.foreheadMark === 'sun' || prof.foreheadMark === 'tanjiro') {
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.ellipse(98, 72, 16, 10, -0.35, 0, TAU);
      ctx.fill();
    } else if (prof.foreheadMark === 'curse') {
      ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(106, 62); ctx.lineTo(126, 74); ctx.lineTo(146, 60); ctx.stroke();
    } else if (prof.foreheadMark === 'gyomei') {
      ctx.strokeStyle = '#991b1b'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(96, 72); ctx.lineTo(160, 72); ctx.stroke();
    }
    if (prof.faceScar === 'sanemi') {
      ctx.strokeStyle = '#be123c'; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(102, 104); ctx.lineTo(164, 152); ctx.stroke();
    }
    if (prof.faceTattoo === 'uzui') {
      ctx.fillStyle = '#e11d48';
      ctx.beginPath(); ctx.arc(92, 148, 4.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(102, 104, 3.2, 0, TAU); ctx.fill();
    }

    // Nose dot + mouth (or Obanai bandage)
    if (prof.bandageMouth) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.rect(86, 154, 84, 36); ctx.fill();
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(86, 166); ctx.lineTo(170, 174); ctx.stroke();
    } else if (!prof.bambooMuzzle) {
      ctx.fillStyle = 'rgba(180, 90, 90, 0.5)';
      ctx.beginPath(); ctx.arc(128, 150, 1.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      if (expr === 'happy') {
        ctx.fillStyle = '#fb7185';
        ctx.moveTo(118, 163);
        ctx.quadraticCurveTo(128, 178, 138, 163);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (expr === 'attack') {
        ctx.fillStyle = '#be123c';
        ctx.ellipse(128, 168, 8.5, 6.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      } else if (expr === 'focus') {
        ctx.moveTo(121, 167); ctx.lineTo(135, 166); ctx.stroke();
      } else {
        ctx.moveTo(121, 165); ctx.quadraticCurveTo(128, 171, 135, 165); ctx.stroke();
      }
    }

    return cv;
  }

  function getCachedFaceCanvas(charId, expression, blinkAmt, eyeGazeX, eyeGazeY) {
    const bBucket = expression === 'blink' ? 3 : min(3, max(0, floor((Number(blinkAmt) || 0) * 3.5)));
    const gxB = Math.round(clamp(Number(eyeGazeX) || 0, -1, 1) * 4);
    const gyB = Math.round(clamp(Number(eyeGazeY) || 0, -1, 1) * 3);
    const key = `${charId}|${expression || 'idle'}|${bBucket}|${gxB}|${gyB}`;
    if (_faceTexCache.has(key)) {
      const hit = _faceTexCache.get(key);
      _faceTexCache.delete(key);
      _faceTexCache.set(key, hit);
      return hit;
    }
    const cv = paintChibiFaceCanvas(charId, expression, blinkAmt, null, gxB / 4, gyB / 3);
    if (!cv) return null;
    while (_faceTexCache.size >= CHIBI_FACE_CACHE_MAX) {
      const oldest = _faceTexCache.keys().next().value;
      _faceTexCache.delete(oldest);
      if (gl && _glFaceTextures.has(oldest)) {
        try { gl.deleteTexture(_glFaceTextures.get(oldest)); } catch (_) {}
        _glFaceTextures.delete(oldest);
      }
    }
    _faceTexCache.set(key, cv);
    return cv;
  }

  function getOrUploadFaceTexture(charId, expression, blinkAmt, eyeGazeX, eyeGazeY) {
    const bBucket = expression === 'blink' ? 3 : min(3, max(0, floor((Number(blinkAmt) || 0) * 3.5)));
    const gxB = Math.round(clamp(Number(eyeGazeX) || 0, -1, 1) * 4);
    const gyB = Math.round(clamp(Number(eyeGazeY) || 0, -1, 1) * 3);
    const key = `${charId}|${expression || 'idle'}|${bBucket}|${gxB}|${gyB}`;
    if (!gl || !isFn(gl.createTexture) || !isFn(gl.texImage2D)) return null;
    if (_glFaceTextures.has(key)) return _glFaceTextures.get(key);

    if (!_faceTexCache.has(key)) {
      const painted = paintChibiFaceCanvas(charId, expression, blinkAmt, null, gxB / 4, gyB / 3);
      if (!painted) return null;
      while (_faceTexCache.size >= CHIBI_FACE_CACHE_MAX) {
        const oldest = _faceTexCache.keys().next().value;
        _faceTexCache.delete(oldest);
        if (_glFaceTextures.has(oldest)) {
          try { gl.deleteTexture(_glFaceTextures.get(oldest)); } catch (_) {}
          _glFaceTextures.delete(oldest);
        }
      }
      _faceTexCache.set(key, painted);
    }
    const srcCanvas = _faceTexCache.get(key);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
    _glFaceTextures.set(key, tex);
    return tex;
  }

  // Dedicated 2-Pass Cel-Shaded Chibi Shaders & glTF/VRM Shader (WebGL2 & WebGL1)
  function buildChibiShaders(gl2) {
    const attrDec = gl2
      ? '#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_pos;layout(location=1) in vec3 a_normal;layout(location=2) in vec2 a_uv;layout(location=3) in vec3 a_col;'
      : 'precision highp float;\nattribute vec3 a_pos,a_normal,a_col;attribute vec2 a_uv;';
    const outDec = gl2 ? 'out vec3 v_wp,v_n,v_col;out vec2 v_uv;' : 'varying vec3 v_wp,v_n,v_col;varying vec2 v_uv;';
    const inDec = gl2 ? 'in vec3 v_wp,v_n,v_col;in vec2 v_uv;out vec4 fragColor;' : 'varying vec3 v_wp,v_n,v_col;varying vec2 v_uv;';
    const outAttrDec = gl2
      ? '#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_pos;layout(location=1) in vec3 a_normal;layout(location=2) in vec2 a_uv;'
      : 'precision highp float;\nattribute vec3 a_pos,a_normal;attribute vec2 a_uv;';
    const texFn = gl2 ? 'texture' : 'texture2D';
    const outVar = gl2 ? 'fragColor' : 'gl_FragColor';

    const chibiVs = `${attrDec}\n${outDec}
uniform mat4 u_model,u_vp;uniform mat3 u_normalMat;
void main(){
  vec4 wp=u_model*vec4(a_pos,1.0);
  v_wp=wp.xyz;
  v_n=normalize(u_normalMat*a_normal);
  v_uv=a_uv;
  v_col=a_col;
  gl_Position=u_vp*wp;
}`;
    const chibiFs = `${gl2 ? '#version 300 es\nprecision highp float;' : 'precision highp float;'}\n${inDec}
uniform vec3 u_eyePos,u_baseCol,u_subCol,u_rimCol,u_glowCol;
uniform float u_matType,u_patternType,u_rimPower,u_emissive,u_useTex,u_silhouette,u_alphaCutoff;
uniform sampler2D u_tex;
void main(){
  if(u_silhouette>0.5){${outVar}=vec4(u_baseCol,0.96);return;}
  vec3 N=normalize(v_n);
  if(u_matType>1.5&&!gl_FrontFacing)N=-N;
  vec3 V=normalize(u_eyePos-v_wp);
  vec3 L=normalize(vec3(0.45,0.78,0.68));
  vec3 col=u_baseCol*v_col;
  if(u_useTex>1.5){
    vec4 t=${texFn}(u_tex,v_uv);
    if(u_alphaCutoff>0.0&&t.a<u_alphaCutoff)discard;
    col=t.rgb*col;
  }else if(u_useTex>0.5){
    vec4 t=${texFn}(u_tex,v_uv);
    col=mix(col,t.rgb,t.a);
  }
  if(u_matType>1.5){
    float hemi=mix(0.84,1.06,clamp(N.y*0.5+0.5,0.0,1.0));
    float keyL=max(0.0,dot(N,L))*0.14;
    float fresG=pow(1.0-clamp(dot(N,V),0.0,1.0),2.8);
    vec3 litG=col*(hemi+keyL)+u_rimCol*fresG*(u_rimPower*0.45)+u_glowCol*u_emissive;
    ${outVar}=vec4(clamp(litG,0.0,1.0),1.0);
    return;
  }
  float ndl=dot(N,L);
  float band=ndl>0.38?1.06:(ndl>-0.08?0.88:0.62);
  vec3 shadTint=mix(vec3(0.84,0.80,0.96),vec3(1.0),step(-0.08,ndl));
  if(u_patternType>0.5){
    float pt=u_patternType;
    if(pt<1.5){
      float c=mod(floor(v_uv.x*8.0)+floor(v_uv.y*8.0),2.0);
      col=mix(u_baseCol,u_subCol,c);
    }else if(pt<2.5){
      col=v_uv.x<0.5?u_baseCol:mix(u_subCol,vec3(0.08,0.50,0.24),step(0.42,sin(v_uv.x*36.0)*sin(v_uv.y*28.0)));
    }else if(pt<3.5){
      float tr=step(fract(v_uv.y*5.0),fract(v_uv.x*5.0+0.5*floor(v_uv.y*5.0)));
      col=mix(u_baseCol,u_subCol,tr*0.85);
    }else if(pt<4.5){
      col=mix(u_baseCol,u_subCol,step(0.5,fract(v_uv.x*7.0)));
    }else if(pt<5.5){
      float g=smoothstep(0.32,0.85,v_uv.y);
      col=mix(u_baseCol,mix(u_subCol,vec3(0.96,0.45,0.71),clamp((v_uv.y-0.55)*2.2,0.0,1.0)),g);
    }else if(pt<6.5){
      float st=abs(sin((v_uv.x+v_uv.y)*22.0))*abs(sin((v_uv.x-v_uv.y)*22.0));
      col=mix(u_baseCol,u_subCol,step(0.35,st)*0.35);
    }else if(pt<7.5){
      float fl=smoothstep(0.42,0.88,v_uv.y+sin(v_uv.x*26.0)*0.08);
      col=mix(u_baseCol,mix(vec3(0.98,0.45,0.08),u_subCol,0.5),fl);
    }else{
      float wis=smoothstep(0.2,0.8,sin(v_uv.y*12.0+v_uv.x*8.0));
      col=mix(u_baseCol,u_subCol,wis*0.32);
    }
  }
  vec3 lit=col*band*shadTint;
  if(u_matType>0.5&&u_matType<1.5){
    float halo=pow(clamp(1.0-abs(N.y-0.52)*2.6,0.0,1.0),4.0)*max(0.25,dot(N,V));
    lit+=u_rimCol*halo*0.42;
  }
  float fres=pow(1.0-clamp(dot(N,V),0.0,1.0),2.6);
  lit+=u_rimCol*fres*u_rimPower;
  lit+=u_glowCol*u_emissive;
  ${outVar}=vec4(clamp(lit,0.0,1.0),1.0);
}`;

    const outVs = `${outAttrDec}
uniform mat4 u_model,u_vp;uniform float u_outlineWidth;
void main(){
  vec3 p=a_pos+normalize(a_normal)*u_outlineWidth;
  gl_Position=u_vp*(u_model*vec4(p,1.0));
}`;
    const outFs = `${gl2 ? '#version 300 es\nprecision highp float;' : 'precision highp float;'}${gl2 ? '\nout vec4 fragColor;' : ''}
uniform vec3 u_outlineCol;
void main(){${outVar}=vec4(u_outlineCol,1.0);}`;

    return { chibiVs, chibiFs, outVs, outFs };
  }

  let chGlProg = null, chGlOutProg = null, chGlVbo = null, chGlIbo = null, chGlLoc = null, chOutLoc = null;
  let chGlReady = false, chGlFailed = false;
  const _glCustomRes = new Map(); // cacheId -> { texs, meshes }

  function releaseChibiGlResources() {
    if (gl) {
      try {
        for (const tex of _glFaceTextures.values()) gl.deleteTexture(tex);
        for (const item of _glCustomRes.values()) {
          if (item.vbo) gl.deleteBuffer(item.vbo);
          if (item.ibo) gl.deleteBuffer(item.ibo);
          if (Array.isArray(item.texs)) {
            for (const tx of item.texs) if (tx) gl.deleteTexture(tx);
          }
        }
        if (chGlIbo) gl.deleteBuffer(chGlIbo);
        if (chGlVbo) gl.deleteBuffer(chGlVbo);
        if (chGlProg) gl.deleteProgram(chGlProg);
        if (chGlOutProg) gl.deleteProgram(chGlOutProg);
      } catch (_) {}
    }
    _glFaceTextures.clear();
    _glCustomRes.clear();
    chGlProg = null; chGlOutProg = null; chGlVbo = null; chGlIbo = null; chGlLoc = null; chOutLoc = null;
    chGlReady = false;
  }

  function compileProgramPair(g, vsSrc, fsSrc, isGl2) {
    const vs = g.createShader(g.VERTEX_SHADER);
    g.shaderSource(vs, vsSrc); g.compileShader(vs);
    const fs = g.createShader(g.FRAGMENT_SHADER);
    g.shaderSource(fs, fsSrc); g.compileShader(fs);
    const pr = g.createProgram();
    if (!isGl2 && isFn(g.bindAttribLocation)) {
      g.bindAttribLocation(pr, 0, 'a_pos');
      g.bindAttribLocation(pr, 1, 'a_normal');
      g.bindAttribLocation(pr, 2, 'a_uv');
      g.bindAttribLocation(pr, 3, 'a_col');
    }
    g.attachShader(pr, vs); g.attachShader(pr, fs); g.linkProgram(pr);
    g.deleteShader(vs); g.deleteShader(fs);
    if (!g.getProgramParameter(pr, g.LINK_STATUS)) {
      g.deleteProgram(pr);
      return null;
    }
    return pr;
  }

  function ensureChibiGlResources(opts, reqW, reqH) {
    if (dead || force2D || chGlFailed) return false;
    const minW = max(reqW || 256, glCv ? glCv.width : 256);
    const minH = max(reqH || 256, glCv ? glCv.height : 256);
    if (!ensureGl(minW, minH, opts)) return false;
    if (chGlReady && chGlProg && chGlOutProg && chGlVbo && chGlIbo) return true;
    const g = gl;
    if (!g || !isFn(g.createTexture) || !isFn(g.drawElements) || !isFn(g.cullFace) || !isFn(g.texImage2D) || !isFn(g.uniformMatrix3fv)) {
      return false;
    }
    try {
      const sh = buildChibiShaders(glVer === 2);
      chGlProg = compileProgramPair(g, sh.chibiVs, sh.chibiFs, glVer === 2);
      chGlOutProg = compileProgramPair(g, sh.outVs, sh.outFs, glVer === 2);
      if (!chGlProg || !chGlOutProg) {
        chGlFailed = true; releaseChibiGlResources(); return false;
      }
      const atlas = getChibiAtlas();
      chGlVbo = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, chGlVbo);
      g.bufferData(g.ARRAY_BUFFER, atlas.vertices, g.STATIC_DRAW);

      chGlIbo = g.createBuffer();
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, chGlIbo);
      g.bufferData(g.ELEMENT_ARRAY_BUFFER, atlas.indices, g.STATIC_DRAW);

      chGlLoc = {};
      ['model', 'vp', 'normalMat', 'eyePos', 'baseCol', 'subCol', 'rimCol', 'glowCol', 'matType', 'patternType', 'rimPower', 'emissive', 'useTex', 'tex', 'silhouette', 'alphaCutoff'].forEach((n) => {
        chGlLoc[n] = g.getUniformLocation(chGlProg, 'u_' + n);
      });
      chOutLoc = {
        model: g.getUniformLocation(chGlOutProg, 'u_model'),
        vp: g.getUniformLocation(chGlOutProg, 'u_vp'),
        outlineWidth: g.getUniformLocation(chGlOutProg, 'u_outlineWidth'),
        outlineCol: g.getUniformLocation(chGlOutProg, 'u_outlineCol')
      };
      chGlReady = true;
      return true;
    } catch (_) {
      chGlFailed = true; releaseChibiGlResources(); return false;
    }
  }

  // Skeletal Pose Solver for both 'composer' and 'stage' modes
  function computeChibiPose(mode, charId, poseState) {
    const s = poseState && typeof poseState === 'object' ? poseState : {};
    const timeSec = isFin(s.timeSec) ? s.timeSec : 0;
    const isStatic = Boolean(s.isStatic);
    const breath = isStatic ? 0 : sin(timeSec * 2.4);
    const sway = isStatic ? 0 : sin(timeSec * 1.45);
    const lookYaw = clamp(Number(s.lookYaw) || 0, -0.60, 0.60);
    const lookPitch = clamp(Number(s.lookPitch) || 0, -0.45, 0.45);
    const eyeGazeX = clamp(lookYaw / 0.48, -1, 1);
    const eyeGazeY = clamp(-lookPitch / 0.36, -1, 1);
    const orbitYaw = Number(s.orbitYaw) || 0;
    const orbitPitch = clamp(Number(s.orbitPitch) || 0, -0.65, 0.65);
    const reaction = String(s.reaction || 'idle');
    const expr = reaction === 'attack' || reaction === 'surge' ? 'attack'
      : (reaction === 'happy' ? 'happy'
        : (reaction === 'focus' ? 'focus' : 'idle'));
    const blinkAmt = clamp(Number(s.blinkAmt) || 0, 0, 1);

    if (mode === 'stage') {
      const ph = String(s.phase || 'slash');
      const slash = clamp(Number(s.slashing) || 0, 0, 1.5);
      const chg = clamp(Number(s.charging) || 0, 0, 1.5);
      const facing = Number(s.facing) >= 0 ? 1 : -1;
      const p = clamp(Number(s.rawP) || 0.4, 0, 1);
      let rootRotX = 0.08, rootRotY = facing * 0.45, rootRotZ = 0;
      let torsoPitch = 0.12, armR_X = -0.6, armR_Z = 0.35, armL_X = 0.3, legSwing = 0.35, swordDraw = 1;
      let yBob = 0;
      if (ph === 'charge') {
        rootRotY = facing * 0.85; torsoPitch = 0.38; armR_X = 0.65; armR_Z = -0.35; legSwing = 0.55; yBob = -0.09 * chg;
      } else if (ph === 'launch' || ph === 'z_dash') {
        rootRotX = 0.36; rootRotY = facing * 0.55; torsoPitch = 0.28; armR_X = -1.25; legSwing = 0.72;
      } else if (ph === 'slash' || ph === 'hitstop' || ph === 'combat') {
        rootRotY = facing * (0.4 + p * TAU * 1.1);
        rootRotZ = -facing * 0.24 * slash;
        armR_X = -1.55 + sin(p * 18) * 0.45; armR_Z = 0.82; armL_X = -0.5; legSwing = 0.62;
      } else if (ph === 'followthrough') {
        rootRotY = facing * 0.35; torsoPitch = 0.08; armR_X = 0.35; armR_Z = -0.25; swordDraw = 0.25;
      } else {
        // return / landing somersault
        rootRotX = sin(p * PI * 3) * 0.65;
        rootRotY = facing * 0.25;
        yBob = 0.05;
      }
      return {
        mode: 'stage', timeSec, isStatic, expression: slash > 0.2 ? 'attack' : (ph === 'followthrough' ? 'focus' : 'idle'),
        blinkAmt, eyeGazeX, eyeGazeY, rootY: yBob, rootRotX, rootRotY, rootRotZ,
        torsoPitch, headYaw: lookYaw * 0.35, headPitch: lookPitch * 0.3,
        armR_X, armR_Z, armL_X, armL_Z: -0.32, legSwing, swordDraw,
        surge: clamp(slash * 0.8 + chg * 0.5 + (s.hitStopActive ? 1.0 : 0), 0, 1.5),
        capeFlutter: 0.25 + slash * 0.35,
        facing
      };
    }

    // Composer mode (interactive corner companion)
    const happyBump = reaction === 'happy' && !isStatic ? abs(sin(timeSec * 8.5)) * 0.085 : 0;
    const focusLean = reaction === 'focus' ? 0.12 : 0;
    const surgeAmt = clamp(Number(s.surge) || (reaction === 'attack' ? 1 : 0), 0, 1.5);
    return {
      mode: 'composer', timeSec, isStatic, expression: expr, blinkAmt,
      eyeGazeX, eyeGazeY,
      rootY: breath * 0.022 + happyBump,
      rootRotX: orbitPitch + 0.04 - lookPitch * 0.28,
      rootRotY: orbitYaw - 0.14 + sway * 0.04 + lookYaw * 0.44,
      rootRotZ: (reaction === 'happy' ? sway * 0.08 : 0) - lookYaw * 0.08,
      torsoPitch: breath * 0.03 + focusLean - lookPitch * 0.12,
      headYaw: lookYaw * 0.72,
      headPitch: -lookPitch * 0.68 - breath * 0.03 + (reaction === 'focus' ? 0.08 : 0),
      armR_X: reaction === 'happy' ? -1.1 + sin(timeSec * 10) * 0.35 : (surgeAmt > 0.1 ? -1.15 : -0.18 + breath * 0.05),
      armR_Z: reaction === 'happy' ? 0.55 : (surgeAmt > 0.1 ? 0.45 : 0.26),
      armL_X: -0.16 - breath * 0.04,
      armL_Z: -0.26,
      legSwing: 0,
      swordDraw: surgeAmt > 0.1 ? 1.0 : 0.0,
      surge: surgeAmt,
      capeFlutter: 0.05 + abs(sway) * 0.04 + surgeAmt * 0.18,
      facing: -1
    };
  }

  // Emit Draw List of 3D Transformed Primitives for the Active Character
  function collectChibiDrawCommands(charId, pose, isSilhouette) {
    const prof = resolveChibiProfile(charId);
    const cmds = [];
    const rimRgb = hexVec3(prof.rimCol);
    const accRgb = hexVec3(prof.accentCol);
    const skinRgb = hexVec3(prof.skinCol);
    const hairRgb = hexVec3(prof.hairCol);
    const tipRgb = hexVec3(prof.hairTipCol);
    const haoriRgb = hexVec3(prof.haoriCol);
    const haoriSubRgb = hexVec3(prof.haoriSubCol);
    const uniRgb = hexVec3(prof.uniformCol);
    const bladeRgb = hexVec3(prof.bladeCol);
    const darkInk = isSilhouette ? [1, 1, 1] : [0.06, 0.05, 0.10];

    let depth = 0;
    mat4Identity(_mStack[0]);
    mat4Translate(_mStack[0], 0, pose.rootY, 0);
    mat4RotateY(_mStack[0], pose.rootRotY);
    mat4RotateX(_mStack[0], pose.rootRotX);
    mat4RotateZ(_mStack[0], pose.rootRotZ);

    function pushMat() {
      mat4Copy(_mStack[depth + 1], _mStack[depth]);
      depth++;
      return _mStack[depth];
    }
    function popMat() {
      if (depth > 0) depth--;
    }
    function emit(meshName, baseRgb, opts) {
      const o = opts || {};
      const mCopy = new Float32Array(_mStack[depth]);
      const bc = isSilhouette ? [0.06, 0.06, 0.10] : baseRgb;
      const sc = o.subRgb || haoriSubRgb;
      cmds.push({
        mesh: meshName,
        model: mCopy,
        baseCol: [bc[0], bc[1], bc[2]],
        subCol: [sc[0], sc[1], sc[2]],
        rimCol: [rimRgb[0], rimRgb[1], rimRgb[2]],
        glowCol: o.glowRgb ? [o.glowRgb[0], o.glowRgb[1], o.glowRgb[2]] : [accRgb[0], accRgb[1], accRgb[2]],
        matType: o.matType || 0,
        patternType: isSilhouette ? 0 : (o.patternType || 0),
        rimPower: o.rimPower !== undefined ? o.rimPower : (0.35 + pose.surge * 0.45),
        emissive: o.emissive || 0,
        useFaceTex: Boolean(!isSilhouette && o.useFaceTex),
        outlineW: o.outlineW !== undefined ? o.outlineW : 0.018
      });
    }

    // 1. Legs & Hakama / Sandals
    for (let s = -1; s <= 1; s += 2) {
      const legM = pushMat();
      mat4Translate(legM, s * 0.14, 0.44, 0);
      mat4RotateX(legM, s * pose.legSwing);
      mat4Translate(legM, 0, -0.22, 0);
      pushMat();
      mat4Scale(_mStack[depth], 0.24, 0.42, 0.24);
      emit('taperedCoat', uniRgb, { patternType: 0 });
      popMat();
      // Foot / Zori sandal
      const footM = pushMat();
      mat4Translate(footM, 0, -0.21, 0.04);
      mat4Scale(footM, 0.14, 0.09, 0.22);
      emit('sphere', [0.16, 0.12, 0.22]);
      popMat();
      popMat();
    }

    // 2. Pelvis & Torso Root
    const torsoM = pushMat();
    mat4Translate(torsoM, 0, 0.48, 0);
    mat4RotateX(torsoM, pose.torsoPitch);

    // Core chest + Slayer Uniform Gold Buttons
    pushMat();
    mat4Translate(_mStack[depth], 0, 0.18, 0);
    mat4Scale(_mStack[depth], 0.40, 0.42, 0.30);
    emit('capsule', prof.shirtless ? skinRgb : uniRgb);
    popMat();
    if (!prof.shirtless && prof.id !== 'nezuko') {
      for (let bi = 0; bi < 3; bi++) {
        pushMat();
        mat4Translate(_mStack[depth], 0, 0.28 - bi * 0.08, 0.148);
        mat4Scale(_mStack[depth], 0.04, 0.04, 0.03);
        emit('sphere', [0.96, 0.80, 0.24]);
        popMat();
      }
    }

    // Haori / Kimono Cloak (front-open patterned V-coat)
    if (!prof.shirtless) {
      pushMat();
      mat4Translate(_mStack[depth], 0, 0.08, -0.01);
      mat4RotateX(_mStack[depth], -pose.capeFlutter * 0.35);
      mat4Scale(_mStack[depth], 0.94, 0.52, 0.88);
      emit('haoriCoat', haoriRgb, { patternType: prof.pattern, subRgb: haoriSubRgb });
      popMat();
    } else {
      // Inosuke fur belt
      pushMat();
      mat4Translate(_mStack[depth], 0, 0.02, 0);
      mat4Scale(_mStack[depth], 0.42, 0.12, 0.34);
      emit('capsule', [0.48, 0.24, 0.08]);
      popMat();
    }

    // White belt / Obi
    pushMat();
    mat4Translate(_mStack[depth], 0, 0.08, 0.01);
    mat4Scale(_mStack[depth], 0.38, 0.07, 0.30);
    emit('box', prof.id === 'nezuko' ? [0.88, 0.18, 0.32] : [0.95, 0.96, 0.98]);
    popMat();

    // Gyomei 14-bead Prayer Necklace
    if (prof.prayerBeads) {
      for (let b = 0; b < 10; b++) {
        const a = (b / 10) * TAU;
        pushMat();
        mat4Translate(_mStack[depth], cos(a) * 0.20, 0.34 - abs(cos(a)) * 0.06, sin(a) * 0.17);
        mat4Scale(_mStack[depth], 0.09, 0.09, 0.09);
        emit('sphere', [0.76, 0.14, 0.12]);
        popMat();
      }
    }

    // Obanai coiled white serpent Kaburamaru around shoulders
    if (prof.snakePet) {
      for (let sg = 0; sg < 8; sg++) {
        const a = -0.5 + (sg / 7) * 4.4;
        pushMat();
        mat4Translate(_mStack[depth], cos(a) * 0.22, 0.37 + sin(a * 2) * 0.03, sin(a) * 0.18);
        mat4Scale(_mStack[depth], 0.075, 0.075, 0.075);
        emit('sphere', [0.96, 0.97, 1.0]);
        popMat();
      }
      // Snake head looking ahead on left shoulder
      pushMat();
      mat4Translate(_mStack[depth], -0.22, 0.43, 0.16);
      mat4Scale(_mStack[depth], 0.09, 0.07, 0.13);
      emit('box', [0.98, 0.98, 1.0]);
      popMat();
    }

    // Left Arm (non-dominant)
    {
      const armLM = pushMat();
      mat4Translate(armLM, -0.25, 0.32, 0);
      mat4RotateX(armLM, pose.armL_X);
      mat4RotateZ(armLM, pose.armL_Z);
      pushMat();
      mat4Translate(_mStack[depth], 0, -0.12, 0);
      mat4Scale(_mStack[depth], 0.24, 0.26, 0.24);
      emit(prof.shirtless ? 'capsule' : 'taperedCoat', prof.shirtless ? skinRgb : haoriRgb, { patternType: prof.pattern === 2 ? 0 : prof.pattern });
      popMat();
      // Left Hand
      pushMat();
      mat4Translate(_mStack[depth], 0, -0.26, 0.03);
      mat4Scale(_mStack[depth], 0.11, 0.11, 0.11);
      emit('sphere', skinRgb);
      popMat();
      // Nezuko Exploding Blood Orb or Dual Weapons
      if (prof.weapon === 'blood_orb') {
        pushMat();
        mat4Translate(_mStack[depth], 0, -0.28, 0.12);
        mat4Scale(_mStack[depth], 0.18, 0.18, 0.18);
        emit('sphere', [0.98, 0.44, 0.56], { emissive: 0.9, rimPower: 1.1 });
        popMat();
      } else if (prof.weapon === 'dual_cleaver' || prof.weapon === 'dual_serrated') {
        const wM = pushMat();
        mat4Translate(wM, 0, -0.26, 0.06);
        mat4RotateX(wM, 1.35);
        mat4Scale(wM, prof.weapon === 'dual_cleaver' ? 1.5 : 1.0, 0.72, 1.0);
        emit('blade', bladeRgb, { emissive: 0.45 + pose.surge * 0.65 });
        popMat();
      }
      popMat();
    }

    // Right Arm (dominant Nichirin sword arm)
    {
      const armRM = pushMat();
      mat4Translate(armRM, 0.25, 0.32, 0);
      mat4RotateX(armRM, pose.armR_X);
      mat4RotateZ(armRM, pose.armR_Z);
      pushMat();
      mat4Translate(_mStack[depth], 0, -0.12, 0);
      mat4Scale(_mStack[depth], 0.24, 0.26, 0.24);
      emit(prof.shirtless ? 'capsule' : 'taperedCoat', prof.shirtless ? skinRgb : (prof.pattern === 2 ? haoriSubRgb : haoriRgb), { patternType: prof.pattern === 2 ? 2 : prof.pattern });
      popMat();
      // Right Hand
      pushMat();
      mat4Translate(_mStack[depth], 0, -0.26, 0.03);
      mat4Scale(_mStack[depth], 0.11, 0.11, 0.11);
      emit('sphere', skinRgb);
      popMat();
      // Nichirin Sword / Weapon in Right Hand (always visible in stage, or drawn on surge/pose)
      if (pose.mode === 'stage' || pose.swordDraw > 0.2 || prof.weapon === 'katana' || prof.weapon === 'red_blade' || prof.weapon === 'needle_blade' || prof.weapon === 'wavy_blade') {
        const swM = pushMat();
        mat4Translate(swM, 0, -0.26, 0.05);
        mat4RotateX(swM, pose.mode === 'stage' ? 1.45 : (0.95 - pose.swordDraw * 0.45));
        mat4RotateZ(swM, -0.2);
        // Hilt
        pushMat();
        mat4Translate(_mStack[depth], 0, -0.06, 0);
        mat4Scale(_mStack[depth], 0.04, 0.20, 0.04);
        emit('box', darkInk);
        popMat();
        // Tsuba guard
        pushMat();
        mat4Translate(_mStack[depth], 0, 0.05, 0);
        mat4Scale(_mStack[depth], 0.13, 0.025, 0.13);
        emit('box', accRgb, { emissive: 0.25 });
        popMat();
        // Nichirin Blade
        const bLen = prof.weapon === 'whip_blade' ? 0.96 : 0.78;
        const bScaleX = prof.weapon === 'dual_cleaver' ? 1.65 : (prof.weapon === 'needle_blade' ? 0.68 : 1.0);
        pushMat();
        mat4Translate(_mStack[depth], 0, 0.06, 0);
        if (prof.weapon === 'whip_blade') mat4RotateZ(_mStack[depth], sin(pose.timeSec * 8) * 0.25);
        mat4Scale(_mStack[depth], bScaleX, bLen, 1.0);
        emit('blade', bladeRgb, { emissive: (prof.id === 'yoriichi' ? 0.85 : 0.38) + pose.surge * 0.7, glowRgb: rimRgb });
        popMat();
        popMat();
      }
      popMat();
    }

    // 3. Neck & Oversized Nendoroid Chibi Head (1:1.55 proportion!)
    {
      const headM = pushMat();
      mat4Translate(headM, 0, 0.44, 0);
      mat4RotateY(headM, pose.headYaw);
      mat4RotateX(headM, pose.headPitch);
      mat4Translate(headM, 0, 0.36, 0);

      if (prof.boarMask) {
        // Inosuke Boar Mask 3D Head
        pushMat();
        mat4Scale(_mStack[depth], 0.95, 0.92, 0.96);
        emit('chibiHead', [0.56, 0.60, 0.68]);
        popMat();
        // Snout
        pushMat();
        mat4Translate(_mStack[depth], 0, -0.06, 0.26);
        mat4Scale(_mStack[depth], 0.56, 0.56, 0.78);
        emit('boarSnout', [0.96, 0.68, 0.66]);
        popMat();
        // Curved tusks + ears + boar eye spots
        for (let s = -1; s <= 1; s += 2) {
          pushMat();
          mat4Translate(_mStack[depth], s * 0.14, -0.06, 0.46);
          mat4RotateZ(_mStack[depth], -s * 0.38);
          mat4Scale(_mStack[depth], 0.55, 0.55, 0.55);
          emit('tusk', [0.98, 0.97, 0.92]);
          popMat();
          pushMat();
          mat4Translate(_mStack[depth], s * 0.28, 0.32, 0.04);
          mat4RotateZ(_mStack[depth], -s * 0.32);
          mat4Scale(_mStack[depth], 0.16, 0.22, 0.12);
          emit('hairStrand', [0.46, 0.50, 0.58]);
          popMat();
          pushMat();
          mat4Translate(_mStack[depth], s * 0.16, 0.08, 0.32);
          mat4Scale(_mStack[depth], 0.12, 0.12, 0.08);
          emit('sphere', [0.22, 0.74, 0.97], { emissive: 0.4 });
          popMat();
        }
      } else {
        // Sculpted Human Nendoroid Head + Animated Face Atlas UV
        emit('chibiHead', skinRgb, { useFaceTex: true, rimPower: 0.22 + pose.surge * 0.35 });

        // Cute tiny ears
        for (let s = -1; s <= 1; s += 2) {
          pushMat();
          mat4Translate(_mStack[depth], s * 0.41, -0.03, 0);
          mat4Scale(_mStack[depth], 0.10, 0.14, 0.10);
          emit('sphere', skinRgb);
          popMat();
        }

        // Nezuko green bamboo muzzle & red tie
        if (prof.bambooMuzzle) {
          pushMat();
          mat4Translate(_mStack[depth], 0, -0.14, 0.37);
          mat4RotateZ(_mStack[depth], HP);
          mat4Scale(_mStack[depth], 0.11, 0.26, 0.11);
          emit('capsule', [0.20, 0.72, 0.34]);
          popMat();
        }

        // Hanafuda Earrings (Tanjiro & Yoriichi) swinging gracefully
        if (prof.hanafudaEarrings) {
          const swing = sin(pose.timeSec * 3.1) * 0.16;
          for (let s = -1; s <= 1; s += 2) {
            pushMat();
            mat4Translate(_mStack[depth], s * 0.43, -0.17, 0.04);
            mat4RotateZ(_mStack[depth], swing * s);
            mat4Scale(_mStack[depth], 0.025, 0.16, 0.09);
            emit('box', [0.98, 0.96, 0.94]);
            popMat();
          }
        }

        // Crown Hair Cap (open front face wedge so eyes & cheeks remain 100% clear)
        pushMat();
        mat4Translate(_mStack[depth], 0, 0.02, -0.01);
        mat4Scale(_mStack[depth], 1.02, 1.02, 1.02);
        emit('hairCap', hairRgb, { matType: 1 });
        popMat();

        // Front Bangs (5 to 7 sculpted 3D locks)
        const nBangs = prof.bangs || 5;
        for (let b = 0; b < nBangs; b++) {
          const fracB = nBangs === 1 ? 0 : (b / (nBangs - 1) - 0.5);
          const ang = fracB * 1.45;
          pushMat();
          mat4RotateY(_mStack[depth], ang);
          mat4Translate(_mStack[depth], 0, 0.36, 0.35);
          mat4RotateX(_mStack[depth], prof.spikyHair ? -0.35 : -0.12);
          mat4RotateZ(_mStack[depth], fracB * 0.22);
          mat4Scale(_mStack[depth], prof.spikyHair ? 0.65 : 0.78, 0.42 + (b % 2) * 0.08, 0.65);
          emit('hairStrand', b % 3 === 1 && prof.spikyHair ? tipRgb : hairRgb, { matType: 1 });
          popMat();
        }

        // Side Face-Framing Locks
        if (prof.sideLocks) {
          for (let s = -1; s <= 1; s += 2) {
            pushMat();
            mat4Translate(_mStack[depth], s * 0.38, 0.16, 0.18);
            mat4RotateZ(_mStack[depth], s * 0.14);
            mat4Scale(_mStack[depth], 0.56, 0.52, 0.58);
            emit('hairStrand', tipRgb, { matType: 1 });
            popMat();
          }
        }

        // Back / Accessory Hairstyles
        const bs = prof.backStyle;
        if (bs === 'bun' || bs === 'bob') {
          for (let k = -2; k <= 2; k++) {
            pushMat();
            mat4RotateY(_mStack[depth], PI + k * 0.38);
            mat4Translate(_mStack[depth], 0, 0.28, 0.38);
            mat4Scale(_mStack[depth], 0.95, bs === 'bun' ? 0.52 : 0.68, 0.90);
            emit('hairStrand', k === 0 ? hairRgb : tipRgb, { matType: 1 });
            popMat();
          }
          if (bs === 'bun') {
            pushMat();
            mat4Translate(_mStack[depth], 0, 0.22, -0.44);
            mat4Scale(_mStack[depth], 0.28, 0.28, 0.24);
            emit('sphere', hairRgb, { matType: 1 });
            popMat();
          }
        } else if (bs === 'long_mist' || bs === 'long_wavy') {
          for (let k = -2; k <= 2; k++) {
            pushMat();
            mat4RotateY(_mStack[depth], PI + k * 0.34);
            mat4Translate(_mStack[depth], 0, 0.24, 0.38);
            mat4RotateX(_mStack[depth], -0.22 - pose.capeFlutter * 0.45);
            mat4Scale(_mStack[depth], 0.92, 0.98, 0.85);
            emit('hairStrand', abs(k) >= 1 ? tipRgb : hairRgb, { matType: 1 });
            popMat();
          }
        } else if (bs === 'braids3') {
          for (let k = -1; k <= 1; k++) {
            const bm = pushMat();
            mat4Translate(bm, k * 0.24, 0.08, -0.34 + abs(k) * 0.12);
            mat4RotateZ(bm, k * 0.18 + sin(pose.timeSec * 2 + k) * 0.05);
            for (let seg = 0; seg < 4; seg++) {
              pushMat();
              mat4Translate(_mStack[depth], 0, -seg * 0.16, 0);
              mat4Scale(_mStack[depth], 0.17 - seg * 0.02, 0.19, 0.17 - seg * 0.02);
              emit('sphere', seg >= 3 ? tipRgb : hairRgb, { matType: 1 });
              popMat();
            }
            popMat();
          }
        } else if (bs === 'high_ponytail' || bs === 'spiky_ponytail' || bs === 'flame_mane' || bs === 'spiky' || bs === 'square_cut') {
          const count = bs === 'flame_mane' ? 9 : 7;
          for (let k = 0; k < count; k++) {
            const ang = PI + (k / (count - 1) - 0.5) * 2.1;
            pushMat();
            mat4RotateY(_mStack[depth], ang);
            mat4Translate(_mStack[depth], 0, 0.24, 0.39);
            mat4RotateX(_mStack[depth], bs === 'high_ponytail' ? -0.45 - pose.capeFlutter * 0.4 : -0.32);
            mat4Scale(_mStack[depth], 0.88, bs === 'high_ponytail' ? 0.92 : 0.62, 0.88);
            emit('hairStrand', k % 2 === 0 ? tipRgb : hairRgb, { matType: 1 });
            popMat();
          }
        }

        // Shinobu 3D Flapping Butterfly Hairpin
        if (prof.butterflyPin) {
          const pinM = pushMat();
          mat4Translate(pinM, 0.24, 0.34, -0.34);
          mat4RotateY(pinM, -0.4);
          const flap = pose.isStatic ? 0.35 : 0.3 + abs(sin(pose.timeSec * 5.2)) * 0.45;
          for (let s = -1; s <= 1; s += 2) {
            pushMat();
            mat4RotateY(_mStack[depth], s < 0 ? (PI - flap) : flap);
            mat4Scale(_mStack[depth], 0.42, 0.42, 0.42);
            emit('wing', s > 0 ? accRgb : rimRgb, { emissive: 0.28 + pose.surge * 0.35 });
            popMat();
          }
          popMat();
        }

        // Uzui Jeweled Shinobi Headband
        if (prof.headband === 'gems') {
          pushMat();
          mat4Translate(_mStack[depth], 0, 0.16, 0.36);
          mat4Scale(_mStack[depth], 0.44, 0.10, 0.12);
          emit('box', [0.75, 0.80, 0.86]);
          popMat();
          for (let g = -1; g <= 1; g++) {
            pushMat();
            mat4Translate(_mStack[depth], g * 0.12, 0.16, 0.43);
            mat4Scale(_mStack[depth], 0.06, 0.06, 0.04);
            emit('sphere', [0.96, 0.25, 0.52], { emissive: 0.6 });
            popMat();
          }
        }

        // Nezuko Pink Hair Ribbon
        if (prof.hairRibbon) {
          pushMat();
          mat4Translate(_mStack[depth], -0.26, 0.30, 0.24);
          mat4RotateZ(_mStack[depth], 0.35);
          mat4Scale(_mStack[depth], 0.18, 0.11, 0.10);
          emit('box', [0.96, 0.44, 0.66]);
          popMat();
        }
      }
      popMat();
    }

    popMat();
    return cmds;
  }

  function bindChibiAttribs(g) {
    const stride = 32;
    g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, stride, 0);
    g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 3, g.FLOAT, false, stride, 12);
    g.enableVertexAttribArray(2); g.vertexAttribPointer(2, 2, g.FLOAT, false, stride, 24);
    if (isFn(g.disableVertexAttribArray)) g.disableVertexAttribArray(3);
    if (isFn(g.vertexAttrib3f)) g.vertexAttrib3f(3, 1, 1, 1);
  }

  function bindGlbAttribs(g) {
    const stride = 44;
    g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, stride, 0);
    g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 3, g.FLOAT, false, stride, 12);
    g.enableVertexAttribArray(2); g.vertexAttribPointer(2, 2, g.FLOAT, false, stride, 24);
    g.enableVertexAttribArray(3); g.vertexAttribPointer(3, 3, g.FLOAT, false, stride, 32);
  }

  function renderProceduralChibiGl(charId, pose, vpMat, eyeArr, outWidth, silhouette) {
    const g = gl;
    const atlas = getChibiAtlas();
    const cmds = collectChibiDrawCommands(charId, pose, silhouette);

    if (glVer === 2 && isFn(g.bindVertexArray)) g.bindVertexArray(null);
    g.disable(g.BLEND);
    g.enable(g.DEPTH_TEST);
    g.depthFunc(g.LEQUAL);
    g.depthMask(true);
    g.enable(g.CULL_FACE);

    // Pass 1: Inverted-Hull Ink Outline
    if (!silhouette && outWidth > 0.0005) {
      g.useProgram(chGlOutProg);
      g.bindBuffer(g.ARRAY_BUFFER, chGlVbo);
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, chGlIbo);
      bindChibiAttribs(g);
      g.cullFace(g.FRONT);
      g.uniformMatrix4fv(chOutLoc.vp, false, vpMat);
      g.uniform1f(chOutLoc.outlineWidth, outWidth);
      const pr = resolveChibiProfile(charId);
      const rc = hexVec3(pr.rimCol);
      g.uniform3f(chOutLoc.outlineCol, rc[0] * 0.18 + 0.04, rc[1] * 0.16 + 0.04, rc[2] * 0.22 + 0.07);
      for (let i = 0; i < cmds.length; i++) {
        const c = cmds[i];
        const mInfo = atlas.meshes[c.mesh];
        if (!mInfo || !mInfo.idxCount) continue;
        g.uniformMatrix4fv(chOutLoc.model, false, c.model);
        g.drawElements(g.TRIANGLES, mInfo.idxCount, g.UNSIGNED_SHORT, mInfo.idxStart * 2);
      }
    }

    // Pass 2: Anime Toon 3-Band Cel Shading + Face Texture
    g.useProgram(chGlProg);
    g.bindBuffer(g.ARRAY_BUFFER, chGlVbo);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, chGlIbo);
    bindChibiAttribs(g);
    g.cullFace(g.BACK);
    g.uniformMatrix4fv(chGlLoc.vp, false, vpMat);
    g.uniform3f(chGlLoc.eyePos, eyeArr[0], eyeArr[1], eyeArr[2]);
    g.uniform1f(chGlLoc.silhouette, silhouette ? 1.0 : 0.0);
    g.uniform1f(chGlLoc.alphaCutoff, 0.0);

    let boundFaceTex = null;
    for (let i = 0; i < cmds.length; i++) {
      const c = cmds[i];
      const mInfo = atlas.meshes[c.mesh];
      if (!mInfo || !mInfo.idxCount) continue;
      mat3NormalFromMat4(_chibiNrmMat, c.model);
      g.uniformMatrix4fv(chGlLoc.model, false, c.model);
      g.uniformMatrix3fv(chGlLoc.normalMat, false, _chibiNrmMat);
      g.uniform3f(chGlLoc.baseCol, c.baseCol[0], c.baseCol[1], c.baseCol[2]);
      g.uniform3f(chGlLoc.subCol, c.subCol[0], c.subCol[1], c.subCol[2]);
      g.uniform3f(chGlLoc.rimCol, c.rimCol[0], c.rimCol[1], c.rimCol[2]);
      g.uniform3f(chGlLoc.glowCol, c.glowCol[0], c.glowCol[1], c.glowCol[2]);
      g.uniform1f(chGlLoc.matType, c.matType);
      g.uniform1f(chGlLoc.patternType, c.patternType);
      g.uniform1f(chGlLoc.rimPower, c.rimPower);
      g.uniform1f(chGlLoc.emissive, c.emissive);
      if (c.useFaceTex) {
        if (!boundFaceTex) boundFaceTex = getOrUploadFaceTexture(charId, pose.expression, pose.blinkAmt, pose.eyeGazeX, pose.eyeGazeY);
        if (boundFaceTex) {
          if (isFn(g.activeTexture)) g.activeTexture(g.TEXTURE0);
          g.bindTexture(g.TEXTURE_2D, boundFaceTex);
          g.uniform1i(chGlLoc.tex, 0);
          g.uniform1f(chGlLoc.useTex, 1.0);
        } else {
          g.uniform1f(chGlLoc.useTex, 0.0);
        }
      } else {
        g.uniform1f(chGlLoc.useTex, 0.0);
      }
      g.drawElements(g.TRIANGLES, mInfo.idxCount, g.UNSIGNED_SHORT, mInfo.idxStart * 2);
    }
    g.disable(g.CULL_FACE);
    return true;
  }

  // Software 3D Projected Cel-Shaded Mesh Fallback on Canvas 2D (Zero WebGL required, 0 NaN)
  const _swTriBuf = new Float32Array(CHIBI_CANVAS_2D_TRI_CAP * 11);
  const _swTriOrder = new Int32Array(CHIBI_CANVAS_2D_TRI_CAP);

  function shadeSwRgb(rgb, band, rimRgb, rimAmt, emissive) {
    const r = clamp(Math.round((rgb[0] * band + rimRgb[0] * rimAmt + emissive * 0.4) * 255), 0, 255);
    const g = clamp(Math.round((rgb[1] * band + rimRgb[1] * rimAmt + emissive * 0.4) * 255), 0, 255);
    const b = clamp(Math.round((rgb[2] * band + rimRgb[2] * rimAmt + emissive * 0.4) * 255), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function projectChibiPoint(x, y, z, vp, w, h) {
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (!(cw > 0.05)) return null;
    return [(cx / cw * 0.5 + 0.5) * w, (0.5 - cy / cw * 0.5) * h, cw];
  }

  function renderProceduralChibi2DFallback(ctx, w, h, charId, pose, vpMat, silhouette) {
    if (!ctx) return false;
    const atlas = getChibiAtlas();
    const V = atlas.vertices, I = atlas.indices;
    const cmds = collectChibiDrawCommands(charId, pose, silhouette);
    let tc = 0;
    let faceAnchor = null;

    for (let ci = 0; ci < cmds.length && tc < CHIBI_CANVAS_2D_TRI_CAP; ci++) {
      const c = cmds[ci];
      const mInfo = atlas.meshes[c.mesh];
      if (!mInfo || !mInfo.idxCount) continue;
      const m = c.model;
      mat3NormalFromMat4(_chibiNrmMat, m);

      if (c.useFaceTex && !faceAnchor) {
        const fc = projectChibiPoint(m[12] + m[8] * 0.37, m[13] + m[9] * 0.37, m[14] + m[10] * 0.37, vpMat, w, h);
        if (fc) {
          faceAnchor = {
            x: fc[0], y: fc[1], z: fc[2],
            fwdZ: _chibiNrmMat[8], tiltZ: atan2(m[1], m[0])
          };
        }
      }

      const endIdx = mInfo.idxStart + mInfo.idxCount;
      for (let ii = mInfo.idxStart; ii < endIdx && tc < CHIBI_CANVAS_2D_TRI_CAP; ii += 3) {
        const i0 = I[ii] * 8, i1 = I[ii + 1] * 8, i2 = I[ii + 2] * 8;
        const x0 = V[i0], y0 = V[i0 + 1], z0 = V[i0 + 2];
        const x1 = V[i1], y1 = V[i1 + 1], z1 = V[i1 + 2];
        const x2 = V[i2], y2 = V[i2 + 1], z2 = V[i2 + 2];
        const wx0 = m[0] * x0 + m[4] * y0 + m[8] * z0 + m[12], wy0 = m[1] * x0 + m[5] * y0 + m[9] * z0 + m[13], wz0 = m[2] * x0 + m[6] * y0 + m[10] * z0 + m[14];
        const wx1 = m[0] * x1 + m[4] * y1 + m[8] * z1 + m[12], wy1 = m[1] * x1 + m[5] * y1 + m[9] * z1 + m[13], wz1 = m[2] * x1 + m[6] * y1 + m[10] * z1 + m[14];
        const wx2 = m[0] * x2 + m[4] * y2 + m[8] * z2 + m[12], wy2 = m[1] * x2 + m[5] * y2 + m[9] * z2 + m[13], wz2 = m[2] * x2 + m[6] * y2 + m[10] * z2 + m[14];
        const p0 = projectChibiPoint(wx0, wy0, wz0, vpMat, w, h);
        const p1 = projectChibiPoint(wx1, wy1, wz1, vpMat, w, h);
        const p2 = projectChibiPoint(wx2, wy2, wz2, vpMat, w, h);
        if (!p0 || !p1 || !p2) continue;
        // Screen-space backface cull
        const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
        if (cross >= 0) continue;

        const mx = (V[i0 + 3] + V[i1 + 3] + V[i2 + 3]) * 0.3333;
        const my = (V[i0 + 4] + V[i1 + 4] + V[i2 + 4]) * 0.3333;
        const mz = (V[i0 + 5] + V[i1 + 5] + V[i2 + 5]) * 0.3333;
        let wnx = _chibiNrmMat[0] * mx + _chibiNrmMat[3] * my + _chibiNrmMat[6] * mz;
        let wny = _chibiNrmMat[1] * mx + _chibiNrmMat[4] * my + _chibiNrmMat[7] * mz;
        let wnz = _chibiNrmMat[2] * mx + _chibiNrmMat[5] * my + _chibiNrmMat[8] * mz;
        const nl = hypot(wnx, wny, wnz) || 1;
        wnx /= nl; wny /= nl; wnz /= nl;
        const ndl = (wnx * 0.45 + wny * 0.78 + wnz * 0.68) / 1.12;
        const band = silhouette ? 0.15 : (ndl > 0.35 ? 1.06 : (ndl > -0.10 ? 0.88 : 0.64));

        const qi = tc * 11;
        _swTriBuf[qi] = p0[0]; _swTriBuf[qi + 1] = p0[1];
        _swTriBuf[qi + 2] = p1[0]; _swTriBuf[qi + 3] = p1[1];
        _swTriBuf[qi + 4] = p2[0]; _swTriBuf[qi + 5] = p2[1];
        _swTriBuf[qi + 6] = (p0[2] + p1[2] + p2[2]) * 0.3333;
        _swTriBuf[qi + 7] = ci;
        _swTriBuf[qi + 8] = band;
        _swTriBuf[qi + 9] = c.patternType > 0.5 && (V[i0 + 7] > 0.55 || V[i0 + 6] > 0.5) ? 1 : 0;
        _swTriBuf[qi + 10] = c.emissive;
        _swTriOrder[tc] = tc;
        tc++;
      }
    }

    if (!tc) return false;
    for (let gap = tc >> 1; gap > 0; gap >>= 1) {
      for (let i = gap; i < tc; i++) {
        const tmp = _swTriOrder[i], tz = _swTriBuf[tmp * 11 + 6];
        let j = i;
        while (j >= gap && _swTriBuf[_swTriOrder[j - gap] * 11 + 6] < tz) {
          _swTriOrder[j] = _swTriOrder[j - gap];
          j -= gap;
        }
        _swTriOrder[j] = tmp;
      }
    }

    ctx.save();
    let faceDrawn = !faceAnchor;
    ctx.lineJoin = 'round';
    for (let k = 0; k < tc; k++) {
      const qi = _swTriOrder[k] * 11;
      const triZ = _swTriBuf[qi + 6];
      if (!faceDrawn && faceAnchor && triZ < faceAnchor.z - 0.12 && faceAnchor.fwdZ > -0.15) {
        drawSoftwareFaceSticker(ctx, w, h, charId, pose, faceAnchor);
        faceDrawn = true;
      }
      const cmd = cmds[_swTriBuf[qi + 7]];
      const rgb = _swTriBuf[qi + 9] > 0.5 ? cmd.subCol : cmd.baseCol;
      const fillStr = shadeSwRgb(rgb, _swTriBuf[qi + 8], cmd.rimCol, 0.12 * cmd.rimPower, _swTriBuf[qi + 10]);
      ctx.fillStyle = fillStr;
      ctx.strokeStyle = fillStr;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(_swTriBuf[qi], _swTriBuf[qi + 1]);
      ctx.lineTo(_swTriBuf[qi + 2], _swTriBuf[qi + 3]);
      ctx.lineTo(_swTriBuf[qi + 4], _swTriBuf[qi + 5]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (!faceDrawn && faceAnchor && faceAnchor.fwdZ > -0.15) {
      drawSoftwareFaceSticker(ctx, w, h, charId, pose, faceAnchor);
    }
    ctx.restore();
    return true;
  }

  function drawSoftwareFaceSticker(ctx, w, h, charId, pose, faceAnchor) {
    const cv = getCachedFaceCanvas(charId, pose.expression, pose.blinkAmt, pose.eyeGazeX, pose.eyeGazeY) || paintChibiFaceCanvas(charId, pose.expression, pose.blinkAmt, null, pose.eyeGazeX, pose.eyeGazeY);
    if (!cv || !isFn(ctx.drawImage)) return;
    const faceScale = clamp(min(w, h) * 0.25 * (3.3 / max(1.2, faceAnchor.z)), 14, min(w, h) * 0.45);
    ctx.save();
    ctx.translate(faceAnchor.x, faceAnchor.y);
    ctx.rotate(-faceAnchor.tiltZ);
    ctx.drawImage(cv, -faceScale * 0.5, -faceScale * 0.5, faceScale, faceScale);
    ctx.restore();
  }

  // Strict glTF 2.0 (.glb / .vrm) Parser + IndexedDB Persistence + Assets Preload + Custom Render Path
  const _customGlbModels = new Map(); // charId -> { id, fileName, primitives: [...] }
  const _assetGlbProbed = new Map(); // charId -> Promise<boolean>
  let _idbHydrated = false;

  function readAscii4(bytes, off) {
    return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  }

  function parseGlbArrayBuffer(arrayBuffer, opts) {
    if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer) && !ArrayBuffer.isView(arrayBuffer)) {
      throw new Error('Dữ liệu .glb không phải ArrayBuffer hợp lệ.');
    }
    const buf = arrayBuffer instanceof ArrayBuffer ? new Uint8Array(arrayBuffer) : new Uint8Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);
    if (buf.byteLength < 20 || buf.byteLength > CHIBI_MAX_GLB_BYTES) {
      throw new Error(`Kích thước tệp .glb không hợp lệ (${buf.byteLength} bytes, giới hạn 25MB).`);
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const magic = dv.getUint32(0, true);
    const version = dv.getUint32(4, true);
    const totalLen = dv.getUint32(8, true);
    if (magic !== 0x46546C67 || version !== 2 || totalLen > buf.byteLength || totalLen < 20) {
      throw new Error('Header glTF 2.0 (.glb) không hợp lệ.');
    }

    let offset = 12;
    let jsonObj = null;
    let binBytes = null;
    while (offset + 8 <= totalLen) {
      const chunkLen = dv.getUint32(offset, true);
      const chunkType = dv.getUint32(offset + 4, true);
      offset += 8;
      if (offset + chunkLen > totalLen) throw new Error('Chunk glTF .glb bị cắt cụt.');
      const slice = buf.subarray(offset, offset + chunkLen);
      if (chunkType === 0x4E4F534A && !jsonObj) {
        const jsonText = typeof TextDecoder === 'function'
          ? new TextDecoder('utf-8').decode(slice)
          : String.fromCharCode.apply(null, slice);
        jsonObj = JSON.parse(jsonText);
      } else if (chunkType === 0x004E4942 && !binBytes) {
        binBytes = slice;
      }
      offset += chunkLen;
    }
    if (!jsonObj || typeof jsonObj !== 'object' || !Array.isArray(jsonObj.meshes) || !jsonObj.meshes.length) {
      throw new Error('File .glb thiếu dữ liệu JSON glTF hoặc không có mesh.');
    }
    if (!binBytes) {
      throw new Error('File .glb thiếu chunk nhị phân BIN.');
    }

    const bufferViews = Array.isArray(jsonObj.bufferViews) ? jsonObj.bufferViews : [];
    const accessors = Array.isArray(jsonObj.accessors) ? jsonObj.accessors : [];
    const materials = Array.isArray(jsonObj.materials) ? jsonObj.materials : [];
    const textures = Array.isArray(jsonObj.textures) ? jsonObj.textures : [];
    const images = Array.isArray(jsonObj.images) ? jsonObj.images : [];
    const samplers = Array.isArray(jsonObj.samplers) ? jsonObj.samplers : [];
    const nodes = Array.isArray(jsonObj.nodes) ? jsonObj.nodes : [];

    const TYPE_COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    function readAccessor(accIdx) {
      const acc = accessors[accIdx];
      if (!acc || typeof acc.count !== 'number' || acc.count <= 0) return null;
      const compCount = TYPE_COMPS[acc.type] || 1;
      const bv = bufferViews[acc.bufferView];
      if (!bv) return null;
      const baseOff = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      const cType = acc.componentType;
      const compBytes = (cType === 5126 || cType === 5125) ? 4 : ((cType === 5122 || cType === 5123) ? 2 : 1);
      const stride = bv.byteStride || (compCount * compBytes);
      if (baseOff + (acc.count - 1) * stride + compCount * compBytes > binBytes.byteLength) return null;
      const out = (cType === 5126) ? new Float32Array(acc.count * compCount) : new Uint32Array(acc.count * compCount);
      for (let i = 0; i < acc.count; i++) {
        const ro = baseOff + i * stride;
        for (let k = 0; k < compCount; k++) {
          const bo = binBytes.byteOffset + ro + k * compBytes;
          if (cType === 5126) out[i * compCount + k] = dv.getFloat32(bo - buf.byteOffset, true);
          else if (cType === 5125) out[i * compCount + k] = dv.getUint32(bo - buf.byteOffset, true);
          else if (cType === 5123) out[i * compCount + k] = dv.getUint16(bo - buf.byteOffset, true);
          else if (cType === 5122) out[i * compCount + k] = dv.getInt16(bo - buf.byteOffset, true);
          else if (cType === 5121) out[i * compCount + k] = dv.getUint8(bo - buf.byteOffset);
          else out[i * compCount + k] = dv.getInt8(bo - buf.byteOffset);
        }
      }
      return { data: out, count: acc.count, comps: compCount, cType };
    }

    // Build node world matrices
    const nodeWorld = nodes.map(() => new Float32Array(16));
    const visited = new Uint8Array(nodes.length);
    function evalNode(idx, parentMat) {
      if (idx < 0 || idx >= nodes.length || visited[idx]) return;
      visited[idx] = 1;
      const nd = nodes[idx];
      const local = new Float32Array(16);
      if (Array.isArray(nd.matrix) && nd.matrix.length === 16) {
        for (let i = 0; i < 16; i++) local[i] = Number(nd.matrix[i]) || 0;
      } else {
        mat4ComposeTRS(local, nd.translation || [0, 0, 0], nd.rotation || [0, 0, 0, 1], nd.scale || [1, 1, 1]);
      }
      if (parentMat) mat4Multiply(parentMat, local, nodeWorld[idx]);
      else mat4Copy(nodeWorld[idx], local);
      if (Array.isArray(nd.children)) {
        for (let c = 0; c < nd.children.length; c++) evalNode(nd.children[c], nodeWorld[idx]);
      }
    }
    const scenes = Array.isArray(jsonObj.scenes) ? jsonObj.scenes : [];
    const scIdx = Number.isFinite(jsonObj.scene) ? jsonObj.scene : 0;
    const rootNodes = (scenes[scIdx] && Array.isArray(scenes[scIdx].nodes)) ? scenes[scIdx].nodes : nodes.map((_, i) => i);
    for (let i = 0; i < rootNodes.length; i++) evalNode(rootNodes[i], null);

    // Collect primitives + global AABB (11 floats per vertex: pos3, nrm3, uv2, col3)
    const primitives = [];
    let totalVerts = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    function addMeshPrimitives(meshIdx, worldM) {
      const mesh = jsonObj.meshes[meshIdx];
      if (!mesh || !Array.isArray(mesh.primitives)) return;
      const nm = new Float32Array(9);
      mat3NormalFromMat4(nm, worldM);
      for (let pi = 0; pi < mesh.primitives.length; pi++) {
        if (primitives.length >= CHIBI_MAX_GLB_PRIMS) break;
        const prim = mesh.primitives[pi];
        if (!prim || !prim.attributes || prim.attributes.POSITION === undefined) continue;
        const posAcc = readAccessor(prim.attributes.POSITION);
        if (!posAcc || posAcc.comps < 3) continue;
        if (totalVerts + posAcc.count > CHIBI_MAX_GLB_VERTS) {
          throw new Error('Model .glb vượt giới hạn 250.000 đỉnh an toàn.');
        }
        totalVerts += posAcc.count;
        const nrmAcc = prim.attributes.NORMAL !== undefined ? readAccessor(prim.attributes.NORMAL) : null;
        const uvAcc = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(prim.attributes.TEXCOORD_0) : null;
        const colAcc = prim.attributes.COLOR_0 !== undefined ? readAccessor(prim.attributes.COLOR_0) : null;
        let idxArr = null;
        if (prim.indices !== undefined) {
          const iAcc = readAccessor(prim.indices);
          if (iAcc) {
            idxArr = new Uint32Array(iAcc.count);
            for (let i = 0; i < iAcc.count; i++) {
              const vIdx = iAcc.data[i];
              if (vIdx >= posAcc.count) throw new Error('Chỉ số đỉnh .glb vượt phạm vi.');
              idxArr[i] = vIdx;
            }
          }
        }
        if (!idxArr) {
          idxArr = new Uint32Array(posAcc.count);
          for (let i = 0; i < posAcc.count; i++) idxArr[i] = i;
        }

        const inter = new Float32Array(posAcc.count * 11);
        const colScale = colAcc ? (colAcc.cType === 5121 ? 1 / 255 : (colAcc.cType === 5123 ? 1 / 65535 : 1)) : 1;
        for (let v = 0; v < posAcc.count; v++) {
          const x = posAcc.data[v * posAcc.comps], y = posAcc.data[v * posAcc.comps + 1], z = posAcc.data[v * posAcc.comps + 2];
          const wx = worldM[0] * x + worldM[4] * y + worldM[8] * z + worldM[12];
          const wy = worldM[1] * x + worldM[5] * y + worldM[9] * z + worldM[13];
          const wz = worldM[2] * x + worldM[6] * y + worldM[10] * z + worldM[14];
          if (wx < minX) minX = wx; if (wy < minY) minY = wy; if (wz < minZ) minZ = wz;
          if (wx > maxX) maxX = wx; if (wy > maxY) maxY = wy; if (wz > maxZ) maxZ = wz;
          const o = v * 11;
          inter[o] = wx; inter[o + 1] = wy; inter[o + 2] = wz;
          if (nrmAcc && nrmAcc.comps >= 3) {
            const nx = nrmAcc.data[v * nrmAcc.comps], ny = nrmAcc.data[v * nrmAcc.comps + 1], nz = nrmAcc.data[v * nrmAcc.comps + 2];
            const wnx = nm[0] * nx + nm[3] * ny + nm[6] * nz;
            const wny = nm[1] * nx + nm[4] * ny + nm[7] * nz;
            const wnz = nm[2] * nx + nm[5] * ny + nm[8] * nz;
            const nl = hypot(wnx, wny, wnz) || 1;
            inter[o + 3] = wnx / nl; inter[o + 4] = wny / nl; inter[o + 5] = wnz / nl;
          } else {
            inter[o + 4] = 1;
          }
          if (uvAcc && uvAcc.comps >= 2) {
            inter[o + 6] = uvAcc.data[v * uvAcc.comps];
            inter[o + 7] = uvAcc.data[v * uvAcc.comps + 1];
          }
          if (colAcc && colAcc.comps >= 3) {
            inter[o + 8] = clamp(colAcc.data[v * colAcc.comps] * colScale, 0, 1);
            inter[o + 9] = clamp(colAcc.data[v * colAcc.comps + 1] * colScale, 0, 1);
            inter[o + 10] = clamp(colAcc.data[v * colAcc.comps + 2] * colScale, 0, 1);
          } else {
            inter[o + 8] = 1; inter[o + 9] = 1; inter[o + 10] = 1;
          }
        }
        if (!nrmAcc) {
          for (let i = 0; i + 2 < idxArr.length; i += 3) {
            const i0 = idxArr[i] * 11, i1 = idxArr[i + 1] * 11, i2 = idxArr[i + 2] * 11;
            const e1x = inter[i1] - inter[i0], e1y = inter[i1 + 1] - inter[i0 + 1], e1z = inter[i1 + 2] - inter[i0 + 2];
            const e2x = inter[i2] - inter[i0], e2y = inter[i2 + 1] - inter[i0 + 1], e2z = inter[i2 + 2] - inter[i0 + 2];
            const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
            inter[i0 + 3] += nx; inter[i0 + 4] += ny; inter[i0 + 5] += nz;
            inter[i1 + 3] += nx; inter[i1 + 4] += ny; inter[i1 + 5] += nz;
            inter[i2 + 3] += nx; inter[i2 + 4] += ny; inter[i2 + 5] += nz;
          }
          for (let v = 0; v < posAcc.count; v++) {
            const o = v * 11, nl = hypot(inter[o + 3], inter[o + 4], inter[o + 5]) || 1;
            inter[o + 3] /= nl; inter[o + 4] /= nl; inter[o + 5] /= nl;
          }
        }

        const mat = prim.material !== undefined ? materials[prim.material] : null;
        const pbr = mat && mat.pbrMetallicRoughness ? mat.pbrMetallicRoughness : null;
        const baseCol = (pbr && Array.isArray(pbr.baseColorFactor))
          ? [Number(pbr.baseColorFactor[0]) || 1.0, Number(pbr.baseColorFactor[1]) || 1.0, Number(pbr.baseColorFactor[2]) || 1.0]
          : [1.0, 1.0, 1.0];
        const doubleSided = Boolean(mat && mat.doubleSided);
        const alphaCutoff = (mat && mat.alphaMode === 'MASK')
          ? (Number.isFinite(mat.alphaCutoff) ? clamp(mat.alphaCutoff, 0.01, 0.99) : 0.5)
          : 0.0;
        let texPayload = null;
        if (pbr && pbr.baseColorTexture && Number.isInteger(pbr.baseColorTexture.index)) {
          const texDef = textures[pbr.baseColorTexture.index];
          const smpDef = texDef && Number.isInteger(texDef.sampler) ? samplers[texDef.sampler] : null;
          const imgDef = texDef && Number.isInteger(texDef.source) ? images[texDef.source] : null;
          const imgBv = imgDef && Number.isInteger(imgDef.bufferView) ? bufferViews[imgDef.bufferView] : null;
          const mime = imgDef && typeof imgDef.mimeType === 'string' ? imgDef.mimeType : '';
          if (imgBv && /^image\/(png|jpeg|webp)$/i.test(mime) && (imgBv.byteLength || 0) > 0 && (imgBv.byteLength || 0) <= 16 * 1024 * 1024) {
            const imgOff = imgBv.byteOffset || 0;
            if (imgOff + imgBv.byteLength <= binBytes.byteLength) {
              texPayload = {
                bytes: binBytes.slice(imgOff, imgOff + imgBv.byteLength),
                mimeType: mime,
                wrapS: (smpDef && Number.isInteger(smpDef.wrapS)) ? smpDef.wrapS : 10497,
                wrapT: (smpDef && Number.isInteger(smpDef.wrapT)) ? smpDef.wrapT : 10497
              };
            }
          }
        }
        primitives.push({ vertices: inter, indices: idxArr, baseCol, doubleSided, alphaCutoff, texPayload });
      }
    }

    let boundFromNodes = false;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i] && nodes[i].mesh !== undefined) {
        addMeshPrimitives(nodes[i].mesh, nodeWorld[i]);
        boundFromNodes = true;
      }
    }
    if (!boundFromNodes) {
      const idM = mat4Identity(new Float32Array(16));
      for (let i = 0; i < jsonObj.meshes.length; i++) addMeshPrimitives(i, idM);
    }
    if (!primitives.length || !isFin(minY)) {
      throw new Error('Không tìm thấy hình học 3D hợp lệ trong tệp .glb.');
    }

    // Auto-normalize so model fits 1.68 height, resting on y = 0, centered on X/Z = 0
    const spanY = max(0.001, maxY - minY);
    const scaleNorm = 1.68 / spanY;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    for (let pi = 0; pi < primitives.length; pi++) {
      const v = primitives[pi].vertices;
      for (let o = 0; o < v.length; o += 11) {
        v[o] = (v[o] - cx) * scaleNorm;
        v[o + 1] = (v[o + 1] - minY) * scaleNorm;
        v[o + 2] = (v[o + 2] - cz) * scaleNorm;
      }
    }

    return {
      fileName: (opts && opts.fileName) ? String(opts.fileName).slice(0, 80) : 'custom_chibi.glb',
      vertexCount: totalVerts,
      primitiveCount: primitives.length,
      bounds: { minY: 0, maxY: (maxY - minY) * scaleNorm, height: 1.68 },
      primitives
    };
  }

  function openChibiIdb() {
    return new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB || !isFn(indexedDB.open)) {
          resolve(null);
          return;
        }
        const req = indexedDB.open(CHIBI_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(CHIBI_DB_STORE)) db.createObjectStore(CHIBI_DB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  function disposeCustomGlRes(cid) {
    if (!_glCustomRes.has(cid)) return;
    const old = _glCustomRes.get(cid);
    if (gl && old) {
      try {
        if (old.vbo) gl.deleteBuffer(old.vbo);
        if (old.ibo) gl.deleteBuffer(old.ibo);
        if (Array.isArray(old.texs)) {
          for (let i = 0; i < old.texs.length; i++) {
            if (old.texs[i]) gl.deleteTexture(old.texs[i]);
          }
        }
      } catch (_) {}
    }
    _glCustomRes.delete(cid);
  }

  async function setCustomGlbModel(charId, arrayBuffer, meta) {
    const cid = normalizeChibiCharId(charId);
    const parsed = parseGlbArrayBuffer(arrayBuffer, meta);
    const entry = { charId: cid, ...parsed };
    _customGlbModels.set(cid, entry);
    disposeCustomGlRes(cid);
    try {
      const db = await openChibiIdb();
      if (db) {
        await new Promise((res) => {
          const tx = db.transaction(CHIBI_DB_STORE, 'readwrite');
          tx.objectStore(CHIBI_DB_STORE).put({ charId: cid, fileName: entry.fileName, buffer: arrayBuffer instanceof ArrayBuffer ? arrayBuffer : arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength) }, cid);
          tx.oncomplete = () => { db.close(); res(); };
          tx.onerror = () => { db.close(); res(); };
        });
      }
    } catch (_) {}
    return { charId: cid, fileName: entry.fileName, vertexCount: entry.vertexCount, primitiveCount: entry.primitiveCount };
  }

  async function clearCustomGlbModel(charId) {
    const cid = normalizeChibiCharId(charId);
    _customGlbModels.delete(cid);
    disposeCustomGlRes(cid);
    try {
      const db = await openChibiIdb();
      if (db) {
        await new Promise((res) => {
          const tx = db.transaction(CHIBI_DB_STORE, 'readwrite');
          tx.objectStore(CHIBI_DB_STORE).delete(cid);
          tx.oncomplete = () => { db.close(); res(); };
          tx.onerror = () => { db.close(); res(); };
        });
      }
    } catch (_) {}
    return true;
  }

  function getCustomGlbInfo(charId) {
    const cid = normalizeChibiCharId(charId);
    const m = _customGlbModels.get(cid);
    return m ? { loaded: true, charId: cid, fileName: m.fileName, vertexCount: m.vertexCount } : { loaded: false, charId: cid };
  }

  function hasRealGlbModel(charId) {
    return _customGlbModels.has(normalizeChibiCharId(charId));
  }

  function preloadAssetGlb(charId, onLoaded) {
    const cid = normalizeChibiCharId(charId);
    if (_customGlbModels.has(cid)) return Promise.resolve(true);
    if (_assetGlbProbed.has(cid)) return _assetGlbProbed.get(cid);
    if (typeof fetch !== 'function') return Promise.resolve(false);
    let url = '';
    try {
      const sec = ROOT && ROOT.__AGY_SEC__;
      const rel = `assets/${cid.replace(/[^a-z0-9_-]/g, '')}_chibi.glb`;
      if (sec && isFn(sec.resolveAssetUrl)) {
        url = sec.resolveAssetUrl(rel);
      } else if (typeof location !== 'undefined' && /^https?:/i.test(String(location.protocol || ''))) {
        url = `./themes/${rel}`;
      }
    } catch (_) { url = ''; }
    if (!url || (!/^https?:\/\/127\.0\.0\.1:/i.test(url) && !url.startsWith('./themes/'))) {
      const doneFalse = Promise.resolve(false);
      _assetGlbProbed.set(cid, doneFalse);
      return doneFalse;
    }
    const p = fetch(url, { mode: 'cors', credentials: 'omit' })
      .then((res) => (res && res.ok ? res.arrayBuffer() : null))
      .then((ab) => {
        if (!ab || dead || _customGlbModels.has(cid)) return _customGlbModels.has(cid);
        const parsed = parseGlbArrayBuffer(ab, { fileName: `${cid}_chibi.glb` });
        const entry = { charId: cid, source: 'asset', ...parsed };
        _customGlbModels.set(cid, entry);
        disposeCustomGlRes(cid);
        if (isFn(onLoaded)) {
          try { onLoaded(cid, entry); } catch (_) {}
        }
        return true;
      })
      .catch(() => false);
    _assetGlbProbed.set(cid, p);
    return p;
  }

  async function hydrateCustomModelsFromDb() {
    if (_idbHydrated) return _customGlbModels.size;
    _idbHydrated = true;
    try {
      const db = await openChibiIdb();
      if (!db) return 0;
      const rows = await new Promise((res) => {
        const tx = db.transaction(CHIBI_DB_STORE, 'readonly');
        const req = tx.objectStore(CHIBI_DB_STORE).getAll();
        req.onsuccess = () => { db.close(); res(req.result || []); };
        req.onerror = () => { db.close(); res([]); };
      });
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r && r.charId && r.buffer) {
          const cid = normalizeChibiCharId(r.charId);
          if (!_customGlbModels.has(cid)) {
            try {
              const parsed = parseGlbArrayBuffer(r.buffer, { fileName: r.fileName });
              _customGlbModels.set(cid, { charId: cid, source: 'idb', ...parsed });
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
    return _customGlbModels.size;
  }

  function loadGlbDrawTexture(g, res, draw) {
    if (!draw.texPayload || draw.glTexPending || draw.glTex) return;
    if (typeof Blob !== 'function' || typeof Image !== 'function' || typeof URL === 'undefined' || !isFn(URL.createObjectURL)) return;
    draw.glTexPending = true;
    try {
      const blob = new Blob([draw.texPayload.bytes], { type: draw.texPayload.mimeType });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try { URL.revokeObjectURL(url); } catch (_) {}
        if (dead || gl !== g) return;
        try {
          const tx = g.createTexture();
          g.bindTexture(g.TEXTURE_2D, tx);
          if (isFn(g.pixelStorei) && g.UNPACK_FLIP_Y_WEBGL) g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
          const isPot = (v) => v > 0 && (v & (v - 1)) === 0;
          const canRep = glVer === 2 || (isPot(img.width) && isPot(img.height));
          const mapWrap = (wm) => {
            if (!canRep) return g.CLAMP_TO_EDGE;
            if (wm === 33071) return g.CLAMP_TO_EDGE;
            if (wm === 33648 && g.MIRRORED_REPEAT) return g.MIRRORED_REPEAT;
            return g.REPEAT;
          };
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, mapWrap(draw.texPayload.wrapS));
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, mapWrap(draw.texPayload.wrapT));
          g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, img);
          draw.glTex = tx;
          if (!Array.isArray(res.texs)) res.texs = [];
          res.texs.push(tx);
        } catch (_) {}
      };
      img.onerror = () => {
        try { URL.revokeObjectURL(url); } catch (_) {}
      };
      img.src = url;
    } catch (_) {}
  }

  function renderCustomGlbModelGl(cid, modelEntry, pose, vpMat, eyeArr, outWidth, silhouette) {
    const g = gl;
    let res = _glCustomRes.get(cid);
    if (!res) {
      let totalV = 0, totalI = 0;
      for (const pr of modelEntry.primitives) { totalV += pr.vertices.length; totalI += pr.indices.length; }
      const totalVertCnt = totalV / 11;
      const can32 = glVer === 2 || Boolean(isFn(g.getExtension) && g.getExtension('OES_element_index_uint'));
      const useUint32 = Boolean(totalVertCnt > 65535 && can32 && g.UNSIGNED_INT);
      const vAll = new Float32Array(totalV);
      const iAll = useUint32 ? new Uint32Array(totalI) : new Uint16Array(totalI);
      const draws = [];
      let vOff = 0, iOff = 0;
      for (const pr of modelEntry.primitives) {
        const vBase = vOff / 11;
        if (!useUint32 && vBase + pr.vertices.length / 11 > 65535) continue;
        vAll.set(pr.vertices, vOff);
        for (let k = 0; k < pr.indices.length; k++) iAll[iOff + k] = pr.indices[k] + vBase;
        draws.push({
          iStart: iOff,
          iCount: pr.indices.length,
          baseCol: pr.baseCol,
          doubleSided: Boolean(pr.doubleSided),
          alphaCutoff: pr.alphaCutoff || 0,
          texPayload: pr.texPayload || null,
          glTex: null,
          glTexPending: false
        });
        vOff += pr.vertices.length;
        iOff += pr.indices.length;
      }
      const vboC = g.createBuffer(), iboC = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, vboC); g.bufferData(g.ARRAY_BUFFER, vAll, g.STATIC_DRAW);
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, iboC); g.bufferData(g.ELEMENT_ARRAY_BUFFER, iAll, g.STATIC_DRAW);
      res = { vbo: vboC, ibo: iboC, draws, texs: [], useUint32 };
      _glCustomRes.set(cid, res);
    }

    const pr = resolveChibiProfile(cid);
    const rimRgb = hexVec3(pr.rimCol);
    const m = _mStack[0];
    mat4Identity(m);
    mat4Translate(m, 0, pose.rootY, 0);
    mat4RotateY(m, pose.rootRotY);
    mat4RotateX(m, pose.rootRotX);
    mat4RotateZ(m, pose.rootRotZ);
    mat3NormalFromMat4(_chibiNrmMat, m);

    if (glVer === 2 && isFn(g.bindVertexArray)) g.bindVertexArray(null);
    g.disable(g.BLEND);
    g.enable(g.DEPTH_TEST); g.depthFunc(g.LEQUAL); g.depthMask(true);

    const elemType = res.useUint32 ? g.UNSIGNED_INT : g.UNSIGNED_SHORT;
    const elemBytes = res.useUint32 ? 4 : 2;
    void outWidth;

    g.useProgram(chGlProg);
    g.bindBuffer(g.ARRAY_BUFFER, res.vbo);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, res.ibo);
    bindGlbAttribs(g);
    g.uniformMatrix4fv(chGlLoc.vp, false, vpMat);
    g.uniformMatrix4fv(chGlLoc.model, false, m);
    g.uniformMatrix3fv(chGlLoc.normalMat, false, _chibiNrmMat);
    g.uniform3f(chGlLoc.eyePos, eyeArr[0], eyeArr[1], eyeArr[2]);
    g.uniform3f(chGlLoc.rimCol, rimRgb[0], rimRgb[1], rimRgb[2]);
    g.uniform3f(chGlLoc.glowCol, rimRgb[0], rimRgb[1], rimRgb[2]);
    g.uniform1f(chGlLoc.matType, 2.0);
    g.uniform1f(chGlLoc.patternType, 0);
    g.uniform1f(chGlLoc.rimPower, 0.35 + pose.surge * 0.45);
    g.uniform1f(chGlLoc.emissive, 0);
    g.uniform1f(chGlLoc.silhouette, silhouette ? 1.0 : 0.0);
    for (const d of res.draws) {
      if (d.doubleSided) {
        g.disable(g.CULL_FACE);
      } else {
        g.enable(g.CULL_FACE);
        g.cullFace(g.BACK);
      }
      if (!silhouette && d.texPayload && !d.glTex && !d.glTexPending) loadGlbDrawTexture(g, res, d);
      if (!silhouette && d.glTex) {
        if (isFn(g.activeTexture)) g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, d.glTex);
        g.uniform1i(chGlLoc.tex, 0);
        g.uniform1f(chGlLoc.useTex, 2.0);
      } else {
        g.uniform1f(chGlLoc.useTex, 0.0);
      }
      g.uniform1f(chGlLoc.alphaCutoff, silhouette ? 0.0 : (d.alphaCutoff || 0));
      g.uniform3f(chGlLoc.baseCol, silhouette ? 0.06 : d.baseCol[0], silhouette ? 0.06 : d.baseCol[1], silhouette ? 0.1 : d.baseCol[2]);
      g.uniform3f(chGlLoc.subCol, d.baseCol[0], d.baseCol[1], d.baseCol[2]);
      g.drawElements(g.TRIANGLES, d.iCount, elemType, d.iStart * elemBytes);
    }
    if (isFn(g.disableVertexAttribArray)) g.disableVertexAttribArray(3);
    g.disable(g.CULL_FACE);
    return true;
  }

  function renderCustomGlbModel2DFallback(ctx, w, h, cid, modelEntry, pose, vpMat, silhouette) {
    if (!ctx || !modelEntry || !Array.isArray(modelEntry.primitives)) return false;
    const pr = resolveChibiProfile(cid);
    const rimRgb = hexVec3(pr.rimCol);
    const m = _mStack[0];
    mat4Identity(m);
    mat4Translate(m, 0, pose.rootY, 0);
    mat4RotateY(m, pose.rootRotY);
    mat4RotateX(m, pose.rootRotX);
    mat4RotateZ(m, pose.rootRotZ);
    mat3NormalFromMat4(_chibiNrmMat, m);

    let tc = 0;
    const prims = modelEntry.primitives;
    for (let pi = 0; pi < prims.length && tc < CHIBI_CANVAS_2D_TRI_CAP; pi++) {
      const prim = prims[pi];
      const V = prim.vertices, I = prim.indices;
      for (let ii = 0; ii + 2 < I.length && tc < CHIBI_CANVAS_2D_TRI_CAP; ii += 3) {
        const i0 = I[ii] * 11, i1 = I[ii + 1] * 11, i2 = I[ii + 2] * 11;
        if (i0 + 10 >= V.length || i1 + 10 >= V.length || i2 + 10 >= V.length) continue;
        const wx0 = m[0] * V[i0] + m[4] * V[i0 + 1] + m[8] * V[i0 + 2] + m[12];
        const wy0 = m[1] * V[i0] + m[5] * V[i0 + 1] + m[9] * V[i0 + 2] + m[13];
        const wz0 = m[2] * V[i0] + m[6] * V[i0 + 1] + m[10] * V[i0 + 2] + m[14];
        const wx1 = m[0] * V[i1] + m[4] * V[i1 + 1] + m[8] * V[i1 + 2] + m[12];
        const wy1 = m[1] * V[i1] + m[5] * V[i1 + 1] + m[9] * V[i1 + 2] + m[13];
        const wz1 = m[2] * V[i1] + m[6] * V[i1 + 1] + m[10] * V[i1 + 2] + m[14];
        const wx2 = m[0] * V[i2] + m[4] * V[i2 + 1] + m[8] * V[i2 + 2] + m[12];
        const wy2 = m[1] * V[i2] + m[5] * V[i2 + 1] + m[9] * V[i2 + 2] + m[13];
        const wz2 = m[2] * V[i2] + m[6] * V[i2 + 1] + m[10] * V[i2 + 2] + m[14];
        const p0 = projectChibiPoint(wx0, wy0, wz0, vpMat, w, h);
        const p1 = projectChibiPoint(wx1, wy1, wz1, vpMat, w, h);
        const p2 = projectChibiPoint(wx2, wy2, wz2, vpMat, w, h);
        if (!p0 || !p1 || !p2) continue;

        const mx = (V[i0 + 3] + V[i1 + 3] + V[i2 + 3]) * 0.3333;
        const my = (V[i0 + 4] + V[i1 + 4] + V[i2 + 4]) * 0.3333;
        const mz = (V[i0 + 5] + V[i1 + 5] + V[i2 + 5]) * 0.3333;
        let wnx = _chibiNrmMat[0] * mx + _chibiNrmMat[3] * my + _chibiNrmMat[6] * mz;
        let wny = _chibiNrmMat[1] * mx + _chibiNrmMat[4] * my + _chibiNrmMat[7] * mz;
        let wnz = _chibiNrmMat[2] * mx + _chibiNrmMat[5] * my + _chibiNrmMat[8] * mz;
        const nl = hypot(wnx, wny, wnz) || 1;
        wnx /= nl; wny /= nl; wnz /= nl;
        const ndl = (wnx * 0.45 + wny * 0.78 + wnz * 0.68) / 1.12;
        const band = silhouette ? 0.15 : (ndl > 0.35 ? 1.06 : (ndl > -0.10 ? 0.88 : 0.64));

        const qi = tc * 11;
        _swTriBuf[qi] = p0[0]; _swTriBuf[qi + 1] = p0[1];
        _swTriBuf[qi + 2] = p1[0]; _swTriBuf[qi + 3] = p1[1];
        _swTriBuf[qi + 4] = p2[0]; _swTriBuf[qi + 5] = p2[1];
        _swTriBuf[qi + 6] = (p0[2] + p1[2] + p2[2]) * 0.3333;
        _swTriBuf[qi + 7] = pi;
        _swTriBuf[qi + 8] = band;
        _swTriBuf[qi + 9] = (V[i0 + 8] + V[i1 + 8] + V[i2 + 8]) * 0.3333;
        _swTriBuf[qi + 10] = (V[i0 + 9] + V[i1 + 9] + V[i2 + 9]) * 0.3333;
        _swTriOrder[tc] = tc;
        tc++;
      }
    }
    if (!tc) return false;
    for (let gap = tc >> 1; gap > 0; gap >>= 1) {
      for (let i = gap; i < tc; i++) {
        const tmp = _swTriOrder[i], tz = _swTriBuf[tmp * 11 + 6];
        let j = i;
        while (j >= gap && _swTriBuf[_swTriOrder[j - gap] * 11 + 6] < tz) {
          _swTriOrder[j] = _swTriOrder[j - gap];
          j -= gap;
        }
        _swTriOrder[j] = tmp;
      }
    }
    ctx.save();
    ctx.lineJoin = 'round';
    for (let k = 0; k < tc; k++) {
      const qi = _swTriOrder[k] * 11;
      const prim = prims[_swTriBuf[qi + 7]];
      const cR = prim.baseCol[0] * _swTriBuf[qi + 9];
      const cG = prim.baseCol[1] * _swTriBuf[qi + 10];
      const cB = prim.baseCol[2];
      const fillStr = shadeSwRgb(silhouette ? [0.08, 0.08, 0.12] : [cR, cG, cB], _swTriBuf[qi + 8], rimRgb, 0.10, 0);
      ctx.fillStyle = fillStr;
      ctx.strokeStyle = fillStr;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(_swTriBuf[qi], _swTriBuf[qi + 1]);
      ctx.lineTo(_swTriBuf[qi + 2], _swTriBuf[qi + 3]);
      ctx.lineTo(_swTriBuf[qi + 4], _swTriBuf[qi + 5]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function renderChibiGlSubRect(ctx2d, tw, th, dx, dy, dw, dh, drawFn) {
    if (glCv.width < tw || glCv.height < th) {
      glCv.width = max(glCv.width, tw);
      glCv.height = max(glCv.height, th);
    }
    const useScissor = (glCv.width > tw || glCv.height > th) && isFn(gl.scissor) && gl.SCISSOR_TEST;
    if (useScissor) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, tw, th);
    }
    gl.viewport(0, 0, tw, th);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawFn();
    if (useScissor) gl.disable(gl.SCISSOR_TEST);
    if (isFn(ctx2d.drawImage)) {
      if (useScissor || glCv.width !== tw || glCv.height !== th) {
        ctx2d.drawImage(glCv, 0, glCv.height - th, tw, th, dx, dy, dw, dh);
      } else {
        ctx2d.drawImage(glCv, dx, dy, dw, dh);
      }
    }
  }

  function setupChibiCamera(w, h, opts) {
    const o = opts || {};
    const fov = (o.fovDeg || 36) * D2R;
    _chibiEye[0] = 0; _chibiEye[1] = 0.94; _chibiEye[2] = o.camDist || 3.25;
    _chibiTgt[0] = 0; _chibiTgt[1] = 0.84; _chibiTgt[2] = 0;
    _chibiUp[0] = 0; _chibiUp[1] = 1; _chibiUp[2] = 0;
    mat4Perspective(fov, w / h, 0.2, 40, _chibiProj);
    mat4LookAt(_chibiEye, _chibiTgt, _chibiUp, _chibiView);
    mat4Multiply(_chibiProj, _chibiView, _chibiVP);
  }

  function renderChibiTo2D(ctx2d, w, h, charId, poseState, opts) {
    if (dead || !ctx2d) return { ok: false, mode: 'none' };
    const vw = normW(w), vh = normH(h), cid = normalizeChibiCharId(charId);
    const pose = computeChibiPose('composer', cid, poseState);
    setupChibiCamera(vw, vh, opts);
    ctx2d.clearRect(0, 0, vw, vh);

    const dpr = min(2, max(1, Number((opts && opts.dpr) || (ROOT && ROOT.devicePixelRatio) || 1)));
    const tw = max(1, floor(vw * dpr)), th = max(1, floor(vh * dpr));
    const useGl = !(opts && opts.force2dFallback) && ensureChibiGlResources(opts, tw, th);
    const customGlb = _customGlbModels.get(cid);
    if (useGl && glCv && gl) {
      renderChibiGlSubRect(ctx2d, tw, th, 0, 0, vw, vh, () => {
        if (customGlb) renderCustomGlbModelGl(cid, customGlb, pose, _chibiVP, _chibiEye, 0.016, false);
        else renderProceduralChibiGl(cid, pose, _chibiVP, _chibiEye, 0.016, false);
      });
      return { ok: true, mode: glVer === 2 ? 'webgl2' : 'webgl1', customGlb: Boolean(customGlb) };
    }

    if (customGlb) {
      renderCustomGlbModel2DFallback(ctx2d, vw, vh, cid, customGlb, pose, _chibiVP, false);
    } else {
      renderProceduralChibi2DFallback(ctx2d, vw, vh, cid, pose, _chibiVP, false);
    }
    return { ok: true, mode: 'canvas2d-3d', customGlb: Boolean(customGlb) };
  }

  function renderStageChibi3D(ctx2d, w, h, actor3D, skill, rawP, opts) {
    if (dead || !ctx2d) return false;
    const vw = normW(w), vh = normH(h);
    const a = actor3D || {};
    const cid = normalizeChibiCharId((skill && skill.charId) || a.charId || 'shinobu');
    const o = opts || {};
    const ax = isFin(a.sx) ? a.sx : vw * 0.5;
    const ay = isFin(a.sy) ? a.sy : vh * 0.5;
    const drawSize = clamp(Number(a.size) || 206, 80, 520);
    const pose = computeChibiPose('stage', cid, {
      phase: a.phase || 'slash',
      slashing: a.slashing,
      charging: a.charging,
      facing: a.facing,
      hitStopActive: a.hitStopActive,
      rawP,
      timeSec: Number(rawP || 0) * 2.8,
      lookYaw: 0,
      lookPitch: 0,
      isStatic: Boolean(o.reducedMotion)
    });
    const boxSize = Math.round(drawSize * 1.18);
    setupChibiCamera(boxSize, boxSize, { camDist: 3.1 });

    const glSide = min(480, max(160, Math.round(boxSize * clamp(Number(o.dpr) || 1, 1, 1.5))));
    const useGl = !o.reducedMotion && ensureChibiGlResources(o, glSide, glSide);
    const customGlb = _customGlbModels.get(cid);
    const sil = Boolean(o.impactSilhouette);

    ctx2d.save();
    ctx2d.translate(ax, ay);
    ctx2d.rotate(isFin(a.rot) ? a.rot : 0);

    if (useGl && glCv && gl) {
      renderChibiGlSubRect(ctx2d, glSide, glSide, -boxSize * 0.5, -boxSize * 0.52, boxSize, boxSize, () => {
        if (customGlb) renderCustomGlbModelGl(cid, customGlb, pose, _chibiVP, _chibiEye, sil ? 0 : 0.018, sil);
        else renderProceduralChibiGl(cid, pose, _chibiVP, _chibiEye, sil ? 0 : 0.018, sil);
      });
    } else {
      ctx2d.translate(-boxSize * 0.5, -boxSize * 0.52);
      if (customGlb) {
        renderCustomGlbModel2DFallback(ctx2d, boxSize, boxSize, cid, customGlb, pose, _chibiVP, sil);
      } else {
        renderProceduralChibi2DFallback(ctx2d, boxSize, boxSize, cid, pose, _chibiVP, sil);
      }
    }

    ctx2d.restore();
    return true;
  }

  function getChibi3dDiagnostics() {
    return {
      ...getDiagnostics(),
      chibiGlReady: Boolean(chGlReady && gl),
      chibiCharacters: CHARACTER_IDS.length,
      customGlbCount: _customGlbModels.size,
      faceCacheCount: _faceTexCache.size
    };
  }

  const CHIBI_3D_API = Object.freeze({
    CHARACTER_IDS,
    CHIBI_PROFILES,
    resolveChibiProfile,
    computeChibiPose,
    renderChibiTo2D,
    renderStageChibi3D,
    parseGlbArrayBuffer,
    setCustomGlbModel,
    clearCustomGlbModel,
    getCustomGlbInfo,
    hasRealGlbModel,
    preloadAssetGlb,
    hydrateCustomModelsFromDb,
    getDiagnostics: getChibi3dDiagnostics,
    readAscii4
  });

  if (ROOT) {
    ROOT.__AGY_KNY_CHIBI_3D__ = CHIBI_3D_API;
  }

  ROOT.__AGY_KNY_3D_VFX__ = Object.freeze({
    ARCHETYPES, mat4Perspective, mat4LookAt, mat4Multiply, projectPoint3D, computeCameraState,
    resolveSkill3DProfile, computeActor3DTrajectory, mountStageLayers, renderBackPass, renderFrontPass,
    renderImpactFrame, releaseGpuNow, getDiagnostics, destroy, teardown: destroy,
    chibi3d: CHIBI_3D_API
  });
})();
