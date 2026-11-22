(() => {
  'use strict';

  /**
   * Kimetsu no Yaiba — ufotable-Style 60fps 2D Canvas Live Scenic & Breathing Aura Engine
   * Exposes window.__AGY_KNY_FX_DRAWERS__ supporting all 14 character/estate fxModes.
   * Features multi-layered animated bottom landscapes, Ukiyo-e / ufotable Breathing ribbons,
   * zero shadowBlur/filter GPU overhead, pre-allocated geometry buffers, and DPR-safe physics.
   */

  const TWO_PI = Math.PI * 2;
  const HALF_PI = Math.PI * 0.5;
  const DEG = Math.PI / 180;

  const SUPPORTED_MODES = [
    'royal_wisteria',
    'wisteria',
    'water',
    'flame',
    'sound',
    'mist',
    'love',
    'serpent',
    'wind',
    'stone',
    'sun_water',
    'nezuko',
    'thunder',
    'beast'
  ];

  // Pre-allocated scratch buffers for zero-GC ribbon extrusion (max 64 spine nodes)
  const MAX_RIBBON_PTS = 64;
  const SCRATCH_LX = new Float64Array(MAX_RIBBON_PTS);
  const SCRATCH_LY = new Float64Array(MAX_RIBBON_PTS);
  const SCRATCH_RX = new Float64Array(MAX_RIBBON_PTS);
  const SCRATCH_RY = new Float64Array(MAX_RIBBON_PTS);
  const SCRATCH_NX = new Float64Array(MAX_RIBBON_PTS);
  const SCRATCH_NY = new Float64Array(MAX_RIBBON_PTS);

  function isCanvasContext(obj) {
    return Boolean(obj && typeof obj === 'object' && typeof obj.clearRect === 'function' && typeof obj.beginPath === 'function');
  }

  function clamp(val, min, max) {
    if (!(val === val)) return min; // NaN guard
    return val < min ? min : (val > max ? max : val);
  }

  function seededFrac(index, primeA, primeB) {
    return (((index * primeA + primeB) % 997) / 997);
  }

  function fmtA(alpha) {
    return clamp(alpha, 0, 1).toFixed(3);
  }

  function safeLinearGradient(ctx, x0, y0, x1, y1) {
    const sx0 = Number.isFinite(x0) ? x0 : 0;
    const sy0 = Number.isFinite(y0) ? y0 : 0;
    let sx1 = Number.isFinite(x1) ? x1 : sx0;
    let sy1 = Number.isFinite(y1) ? y1 : sy0 + 1;
    if (Math.abs(sx1 - sx0) < 0.001 && Math.abs(sy1 - sy0) < 0.001) {
      sy1 = sy0 + 1;
    }
    return ctx.createLinearGradient(sx0, sy0, sx1, sy1);
  }

  function safeRadialGradient(ctx, x0, y0, r0, x1, y1, r1) {
    const sx0 = Number.isFinite(x0) ? x0 : 0;
    const sy0 = Number.isFinite(y0) ? y0 : 0;
    const sr0 = Math.max(0, Number.isFinite(r0) ? r0 : 0);
    const sx1 = Number.isFinite(x1) ? x1 : sx0;
    const sy1 = Number.isFinite(y1) ? y1 : sy0;
    const sr1 = Math.max(sr0 + 0.05, Number.isFinite(r1) ? r1 : 1);
    return ctx.createRadialGradient(sx0, sy0, sr0, sx1, sy1, sr1);
  }

  /* ==========================================================================
   * SHARED UFOTABLE ARTISTIC PRIMITIVES (Zero filter/shadowBlur overhead)
   * ========================================================================== */

  function drawSoftGlowOrb(ctx, x, y, r, rgb, coreAlpha, haloScale) {
    const a = clamp(coreAlpha, 0, 1);
    if (a <= 0.005 || !(r > 0)) return;
    const hScale = haloScale || 2.8;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, ${fmtA(a * 0.24)})`;
    ctx.arc(x, y, r * hScale, 0, TWO_PI);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, ${fmtA(a)})`;
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();
  }

  /**
   * Translucent anime water bubble with crisp cyan/teal rim, upper-left specular crescent,
   * and subtle lower-right secondary bounce light.
   */
  function drawWaterBubble(ctx, x, y, r, rimRgb, fillRgb, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.01 || !(r > 0.4)) return;

    // Subtle inner translucent tint
    ctx.beginPath();
    ctx.fillStyle = `rgba(${fillRgb}, ${fmtA(a * 0.16)})`;
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();

    // Crisp thin turquoise-cyan rim
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${rimRgb}, ${fmtA(a * 0.88)})`;
    ctx.lineWidth = clamp(r * 0.17, 0.75, 1.45);
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.stroke();

    // Secondary soft inner rim sheen on bottom-right
    if (r >= 3.2) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(186, 230, 253, ${fmtA(a * 0.42)})`;
      ctx.lineWidth = Math.max(0.6, r * 0.11);
      ctx.arc(x, y, r * 0.78, 0.18 * Math.PI, 0.68 * Math.PI);
      ctx.stroke();
    }

    // Bright white specular highlight dot at top-left
    ctx.save();
    ctx.translate(x - r * 0.36, y - r * 0.36);
    ctx.rotate(-0.65);
    ctx.fillStyle = `rgba(255, 255, 255, ${fmtA(a * 0.92)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(0.65, r * 0.27), Math.max(0.45, r * 0.16), 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Multi-layered undulating water surface at the bottom of the screen with moonlit crest highlights.
   */
  function drawLayeredWaterSurface(ctx, width, height, now, layers, moonXRatio, glintRgb) {
    const cols = Math.max(24, Math.min(48, Math.round(width / 36)));
    const stepX = width / cols;
    const moonX = width * (moonXRatio !== undefined ? moonXRatio : 0.72);
    const moonSpread = Math.max(140, width * 0.24);

    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const baseY = height * L.yRatio;
      const amp1 = L.amp1;
      const amp2 = L.amp2;
      const freq1 = L.freq1;
      const freq2 = L.freq2;
      const spd1 = L.spd1;
      const spd2 = L.spd2;

      const grad = safeLinearGradient(ctx, 0, baseY - amp1 - amp2, 0, height);
      grad.addColorStop(0, `rgba(${L.topRgb}, ${fmtA(L.topAlpha)})`);
      grad.addColorStop(0.48, `rgba(${L.midRgb}, ${fmtA(L.midAlpha)})`);
      grad.addColorStop(1, `rgba(${L.botRgb}, ${fmtA(L.botAlpha)})`);

      ctx.beginPath();
      for (let i = 0; i <= cols; i++) {
        const x = i * stepX;
        const wy = baseY
          + Math.sin(x * freq1 + now * spd1 + L.phase) * amp1
          + Math.cos(x * freq2 - now * spd2 + L.phase * 1.7) * amp2;
        if (i === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.lineTo(width, height + 2);
      ctx.lineTo(0, height + 2);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Luminous silver-azure / royal crest line
      const crestGrad = safeLinearGradient(ctx, 0, baseY, width, baseY);
      const mStart = clamp((moonX - moonSpread) / width, 0.02, 0.90);
      const mMid = clamp(moonX / width, mStart + 0.02, 0.96);
      const mEnd = clamp((moonX + moonSpread) / width, mMid + 0.02, 0.99);
      crestGrad.addColorStop(0, `rgba(${L.crestRgb}, ${fmtA(L.crestAlpha * 0.35)})`);
      crestGrad.addColorStop(mStart, `rgba(${L.crestRgb}, ${fmtA(L.crestAlpha * 0.65)})`);
      crestGrad.addColorStop(mMid, `rgba(${glintRgb || '240, 249, 255'}, ${fmtA(Math.min(0.95, L.crestAlpha * 1.45))})`);
      crestGrad.addColorStop(mEnd, `rgba(${L.crestRgb}, ${fmtA(L.crestAlpha * 0.65)})`);
      crestGrad.addColorStop(1, `rgba(${L.crestRgb}, ${fmtA(L.crestAlpha * 0.35)})`);

      ctx.beginPath();
      for (let i = 0; i <= cols; i++) {
        const x = i * stepX;
        const wy = baseY
          + Math.sin(x * freq1 + now * spd1 + L.phase) * amp1
          + Math.cos(x * freq2 - now * spd2 + L.phase * 1.7) * amp2;
        if (i === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.strokeStyle = crestGrad;
      ctx.lineWidth = L.crestWidth || 1.35;
      ctx.stroke();

      // Shimmering moonlit wave-top sparkles near moon column
      if (L.sparkles) {
        for (let s = 0; s < L.sparkles; s++) {
          const sx = ((moonX - moonSpread * 0.85) + ((s * 97 + li * 43) % 100) / 100 * (moonSpread * 1.7) + Math.sin(now * 0.0007 + s) * 14 + width) % width;
          const sy = baseY
            + Math.sin(sx * freq1 + now * spd1 + L.phase) * amp1
            + Math.cos(sx * freq2 - now * spd2 + L.phase * 1.7) * amp2;
          const tw = Math.max(0, Math.sin(now * 0.0034 + s * 2.1 + li));
          if (tw > 0.35) {
            const sa = (tw - 0.35) * 0.82 * L.crestAlpha;
            ctx.fillStyle = `rgba(${glintRgb || '255, 255, 255'}, ${fmtA(sa)})`;
            ctx.fillRect(sx - 3.5, sy - 0.8, 7.0, 1.6);
          }
        }
      }
    }
  }

  /**
   * Extrudes and renders a tapered ufotable Breathing Aura Ribbon along spine points [(x,y)...].
   * Supports Ukiyo-e white foam edges (foamMode=true) or blazing inner core filaments.
   */
  function drawBreathingRibbon(ctx, xs, ys, count, maxHalfWidth, outerRgb, midRgb, coreRgb, alpha, opts) {
    const n = Math.min(count, MAX_RIBBON_PTS);
    const a = clamp(alpha, 0, 1);
    if (n < 3 || a <= 0.008 || !(maxHalfWidth > 0.2)) return;

    for (let i = 0; i < n; i++) {
      const iPrev = i > 0 ? i - 1 : 0;
      const iNext = i < n - 1 ? i + 1 : n - 1;
      let tx = xs[iNext] - xs[iPrev];
      let ty = ys[iNext] - ys[iPrev];
      const len = Math.hypot(tx, ty);
      if (len > 1e-4) {
        tx /= len;
        ty /= len;
      } else {
        tx = 1;
        ty = 0;
      }
      const nx = -ty;
      const ny = tx;
      SCRATCH_NX[i] = nx;
      SCRATCH_NY[i] = ny;

      const t = i / (n - 1);
      // Smooth tapered profile (sin envelope with fuller head)
      const env = Math.sin(t * Math.PI) * (0.72 + 0.28 * Math.sin(t * Math.PI * 0.85));
      const ripple = opts && opts.flutter
        ? (1 + 0.18 * Math.sin(t * 16 - (opts.now || 0) * 0.008))
        : 1;
      const hw = maxHalfWidth * env * ripple;
      SCRATCH_LX[i] = xs[i] + nx * hw;
      SCRATCH_LY[i] = ys[i] + ny * hw;
      SCRATCH_RX[i] = xs[i] - nx * hw;
      SCRATCH_RY[i] = ys[i] - ny * hw;
    }

    const grad = safeLinearGradient(ctx, xs[0], ys[0], xs[n - 1], ys[n - 1]);
    grad.addColorStop(0, `rgba(${outerRgb}, 0)`);
    grad.addColorStop(0.16, `rgba(${outerRgb}, ${fmtA(a * 0.68)})`);
    grad.addColorStop(0.52, `rgba(${midRgb}, ${fmtA(a * 0.88)})`);
    grad.addColorStop(0.84, `rgba(${outerRgb}, ${fmtA(a * 0.68)})`);
    grad.addColorStop(1, `rgba(${outerRgb}, 0)`);

    // Outer body polygon
    ctx.beginPath();
    ctx.moveTo(SCRATCH_LX[0], SCRATCH_LY[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(SCRATCH_LX[i], SCRATCH_LY[i]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(SCRATCH_RX[i], SCRATCH_RY[i]);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner luminous stream veins
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Mid-core aura stroke
    ctx.beginPath();
    for (let i = 1; i < n - 1; i++) {
      if (i === 1) ctx.moveTo(xs[i], ys[i]);
      else ctx.lineTo(xs[i], ys[i]);
    }
    ctx.strokeStyle = `rgba(${midRgb}, ${fmtA(a * 0.72)})`;
    ctx.lineWidth = Math.max(1.2, maxHalfWidth * 0.58);
    ctx.stroke();

    // Bright white-tinted center filament
    ctx.beginPath();
    for (let i = 2; i < n - 2; i++) {
      const off = Math.sin(i * 0.55 + ((opts && opts.now) || 0) * 0.005) * maxHalfWidth * 0.16;
      const px = xs[i] + SCRATCH_NX[i] * off;
      const py = ys[i] + SCRATCH_NY[i] * off;
      if (i === 2) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = `rgba(${coreRgb}, ${fmtA(a * 0.92)})`;
    ctx.lineWidth = Math.max(0.9, maxHalfWidth * 0.22);
    ctx.stroke();

    // Ukiyo-e / ufotable white sea-foam edges & curling wave crests
    if (opts && opts.ukiyoeFoam) {
      const foamRgb = opts.foamRgb || '240, 249, 255';
      ctx.strokeStyle = `rgba(${foamRgb}, ${fmtA(a * 0.86)})`;
      ctx.lineWidth = Math.max(1.05, maxHalfWidth * 0.14);

      ctx.beginPath();
      for (let i = 2; i < n - 2; i++) {
        const jag = Math.sin(i * 1.4 - (opts.now || 0) * 0.009) * 2.2;
        const fx = SCRATCH_LX[i] + SCRATCH_NX[i] * jag;
        const fy = SCRATCH_LY[i] + SCRATCH_NY[i] * jag;
        if (i === 2) ctx.moveTo(fx, fy);
        else ctx.lineTo(fx, fy);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let i = 3; i < n - 3; i++) {
        const jag = Math.cos(i * 1.3 + (opts.now || 0) * 0.008) * 1.8;
        const fx = SCRATCH_RX[i] - SCRATCH_NX[i] * jag;
        const fy = SCRATCH_RY[i] - SCRATCH_NY[i] * jag;
        if (i === 3) ctx.moveTo(fx, fy);
        else ctx.lineTo(fx, fy);
      }
      ctx.lineWidth = Math.max(0.85, maxHalfWidth * 0.10);
      ctx.strokeStyle = `rgba(${foamRgb}, ${fmtA(a * 0.68)})`;
      ctx.stroke();

      // Foam spray beads along the upper crest
      ctx.fillStyle = `rgba(255, 255, 255, ${fmtA(a * 0.85)})`;
      for (let i = 4; i < n - 3; i += 3) {
        const side = i % 2 === 0 ? 1 : -1;
        const bx = (side > 0 ? SCRATCH_LX[i] : SCRATCH_RX[i]) + SCRATCH_NX[i] * side * (3.5 + (i % 3) * 2.2);
        const by = (side > 0 ? SCRATCH_LY[i] : SCRATCH_RY[i]) + SCRATCH_NY[i] * side * (3.5 + (i % 3) * 2.2);
        const br = 1.1 + (i % 3) * 0.55;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, TWO_PI);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Rolling cloud/mist bank spanning horizontally across the viewport.
   */
  function drawRollingMistBank(ctx, width, height, yCenter, thickness, phase, speed, now, rgbTop, rgbBot, peakAlpha) {
    const a = clamp(peakAlpha, 0, 1);
    if (a <= 0.005 || !(thickness > 2)) return;
    const cols = 28;
    const stepX = width / cols;
    const topLim = yCenter - thickness * 0.65;
    const botLim = yCenter + thickness * 0.65;

    const grad = safeLinearGradient(ctx, 0, topLim, 0, botLim);
    grad.addColorStop(0, `rgba(${rgbTop}, 0)`);
    grad.addColorStop(0.36, `rgba(${rgbTop}, ${fmtA(a)})`);
    grad.addColorStop(0.72, `rgba(${rgbBot}, ${fmtA(a * 0.78)})`);
    grad.addColorStop(1, `rgba(${rgbBot}, 0)`);

    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
      const x = i * stepX;
      const billow = Math.sin(x * 0.0055 + now * speed + phase) * (thickness * 0.24)
        + Math.cos(x * 0.011 - now * speed * 0.7 + phase * 1.6) * (thickness * 0.14);
      const y = yCenter - thickness * 0.30 + billow;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = cols; i >= 0; i--) {
      const x = i * stepX;
      const under = Math.cos(x * 0.0048 - now * speed * 0.8 + phase + 1.2) * (thickness * 0.18);
      ctx.lineTo(x, yCenter + thickness * 0.48 + under);
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function drawWisteriaPetal(ctx, x, y, r, rot, flipPhase, fillHex, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.01) return;
    const flip = 0.26 + 0.74 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.globalAlpha = a;
    ctx.fillStyle = fillHex;
    ctx.beginPath();
    ctx.moveTo(-r * 1.35, 0);
    ctx.bezierCurveTo(-r * 0.65, -r * 0.95, r * 0.85, -r * 0.88, r * 1.45, 0);
    ctx.bezierCurveTo(r * 0.85, r * 0.88, -r * 0.65, r * 0.95, -r * 1.35, 0);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = a * 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-r * 0.45, 0, r * 0.42, r * 0.24, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawSakuraPetal(ctx, x, y, r, rot, flipPhase, fillHex, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.01) return;
    const flip = 0.30 + 0.70 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.globalAlpha = a;
    ctx.fillStyle = fillHex;
    ctx.beginPath();
    ctx.moveTo(-r * 1.25, 0);
    ctx.bezierCurveTo(-r * 0.55, -r * 1.08, r * 0.75, -r * 1.05, r * 1.35, -r * 0.36);
    ctx.lineTo(r * 0.92, 0);
    ctx.lineTo(r * 1.35, r * 0.36);
    ctx.bezierCurveTo(r * 0.75, r * 1.05, -r * 0.55, r * 1.08, -r * 1.25, 0);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = a * 0.38;
    ctx.fillStyle = '#fff1f2';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, 0, r * 0.45, r * 0.25, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawGinkgoLeaf(ctx, x, y, r, rot, flipPhase, fillHex, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.01) return;
    const flip = 0.38 + 0.62 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.globalAlpha = a;

    ctx.strokeStyle = fillHex;
    ctx.lineWidth = Math.max(0.9, r * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 1.45, r * 0.12);
    ctx.quadraticCurveTo(-r * 0.85, 0, -r * 0.42, 0);
    ctx.stroke();

    ctx.fillStyle = fillHex;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, 0);
    ctx.quadraticCurveTo(0, -r * 1.22, r * 1.18, -r * 0.92);
    ctx.quadraticCurveTo(r * 1.38, -r * 0.38, r * 0.78, -r * 0.08);
    ctx.lineTo(r * 1.28, r * 0.18);
    ctx.quadraticCurveTo(r * 1.22, r * 0.92, r * 0.95, r * 1.02);
    ctx.quadraticCurveTo(-0.05 * r, r * 1.15, -r * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBambooLeaf(ctx, x, y, r, rot, flipPhase, fillHex, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.01) return;
    const flip = 0.32 + 0.68 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.globalAlpha = a;
    ctx.fillStyle = fillHex;
    ctx.beginPath();
    ctx.moveTo(-r * 1.9, 0);
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.62, r * 1.95, -r * 0.06);
    ctx.quadraticCurveTo(-r * 0.2, r * 0.56, -r * 1.9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMapleLeaf(ctx, x, y, r, rot, flipPhase, fillHex, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.01) return;
    const flip = 0.34 + 0.66 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.globalAlpha = a;
    ctx.fillStyle = fillHex;
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, 0);
    ctx.lineTo(-r * 0.35, -r * 0.35);
    ctx.lineTo(-r * 0.55, -r * 1.05);
    ctx.lineTo(0, -r * 0.52);
    ctx.lineTo(r * 0.65, -r * 1.18);
    ctx.lineTo(r * 0.45, -r * 0.32);
    ctx.lineTo(r * 1.35, 0);
    ctx.lineTo(r * 0.45, r * 0.32);
    ctx.lineTo(r * 0.65, r * 1.18);
    ctx.lineTo(0, r * 0.52);
    ctx.lineTo(-r * 0.55, r * 1.05);
    ctx.lineTo(-r * 0.35, r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Nezuko's signature Japanese Asanoha (hemp-leaf 6-point geometric star) motif.
   */
  function drawAsanohaStar(ctx, x, y, r, rot, rgb, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.008 || !(r > 1)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = `rgba(${rgb}, ${fmtA(a)})`;
    ctx.lineWidth = 0.95;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      const nextAng = ((i + 1) * Math.PI) / 3;
      const midAng = ang + Math.PI / 6;
      const ox = Math.cos(ang) * r;
      const oy = Math.sin(ang) * r;
      const nx = Math.cos(nextAng) * r;
      const ny = Math.sin(nextAng) * r;
      const mx = Math.cos(midAng) * (r * 0.48);
      const my = Math.sin(midAng) * (r * 0.48);
      ctx.moveTo(0, 0);
      ctx.lineTo(ox, oy);
      ctx.lineTo(nx, ny);
      ctx.moveTo(0, 0);
      ctx.lineTo(mx, my);
      ctx.lineTo(ox, oy);
      ctx.moveTo(mx, my);
      ctx.lineTo(nx, ny);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawButterfly(ctx, b, now, topRgb, botRgb, bodyRgb) {
    const flap = 0.28 + 0.72 * Math.abs(Math.sin(now * b.flapSpeed + b.phase));
    const tilt = Math.atan2(b.vy || 0, b.vx || 0.01) * 0.22;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(tilt);
    ctx.scale(b.scale, b.scale);

    ctx.beginPath();
    ctx.fillStyle = `rgba(${topRgb}, 0.16)`;
    ctx.arc(0, 0, 15, 0, TWO_PI);
    ctx.fill();

    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.scale(s * flap, 1);

      ctx.fillStyle = `rgba(${topRgb}, 0.82)`;
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.bezierCurveTo(5, -13, 17, -12.5, 14.5, -1.8);
      ctx.bezierCurveTo(13, 3.2, 6, 4.2, 0, 1.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(${botRgb}, 0.74)`;
      ctx.beginPath();
      ctx.moveTo(0, 1.5);
      ctx.bezierCurveTo(7.5, 4, 11.5, 11.5, 5.2, 12.4);
      ctx.bezierCurveTo(2, 12.2, 0.5, 7.2, 0, 2.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
      ctx.beginPath();
      ctx.arc(8.5, -4.5, 1.4, 0, TWO_PI);
      ctx.fill();

      ctx.restore();
    }

    ctx.fillStyle = `rgba(${bodyRgb || '248, 250, 252'}, 0.90)`;
    ctx.fillRect(-0.8, -5.2, 1.6, 10.4);
    ctx.restore();
  }

  function drawFloatingLantern(ctx, l, now) {
    const swayAngle = Math.sin(now * 0.0012 + l.phase) * 0.075;
    const flicker = 0.86 + 0.14 * Math.sin(now * 0.0042 + l.phase * 2.3);
    const w = l.size;
    const h = l.size * 1.36;
    const alpha = clamp(l.alpha, 0, 1);

    ctx.save();
    ctx.translate(l.x, l.y);

    const haloR = w * 3.1;
    const halo = safeRadialGradient(ctx, 0, 0, w * 0.15, 0, 0, haloR);
    halo.addColorStop(0, `rgba(254, 243, 199, ${fmtA(alpha * 0.44 * flicker)})`);
    halo.addColorStop(0.36, `rgba(251, 191, 36, ${fmtA(alpha * 0.24 * flicker)})`);
    halo.addColorStop(0.70, `rgba(217, 119, 6, ${fmtA(alpha * 0.08 * flicker)})`);
    halo.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, TWO_PI);
    ctx.fill();

    ctx.rotate(swayAngle);

    const bodyGrad = safeRadialGradient(ctx, 0, h * 0.08, w * 0.08, 0, 0, h * 0.72);
    bodyGrad.addColorStop(0, `rgba(255, 251, 235, ${fmtA(alpha * 0.96)})`);
    bodyGrad.addColorStop(0.48, `rgba(253, 224, 71, ${fmtA(alpha * 0.88 * flicker)})`);
    bodyGrad.addColorStop(0.85, `rgba(245, 158, 11, ${fmtA(alpha * 0.82)})`);
    bodyGrad.addColorStop(1, `rgba(180, 83, 9, ${fmtA(alpha * 0.74)})`);

    const rx = w * 0.5;
    const ry = h * 0.5;
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.68, -ry);
    ctx.lineTo(rx * 0.68, -ry);
    ctx.bezierCurveTo(rx * 1.12, -ry * 0.45, rx * 1.12, ry * 0.45, rx * 0.66, ry);
    ctx.lineTo(-rx * 0.66, ry);
    ctx.bezierCurveTo(-rx * 1.12, ry * 0.45, -rx * 1.12, -ry * 0.45, -rx * 0.68, -ry);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(146, 64, 14, ${fmtA(alpha * 0.34)})`;
    ctx.lineWidth = Math.max(0.6, w * 0.045);
    for (let rIdx = -1; rIdx <= 1; rIdx++) {
      const ribY = rIdx * ry * 0.42;
      const ribW = rx * (rIdx === 0 ? 0.96 : 0.88);
      ctx.beginPath();
      ctx.moveTo(-ribW, ribY);
      ctx.quadraticCurveTo(0, ribY + ry * 0.06, ribW, ribY);
      ctx.stroke();
    }

    ctx.fillStyle = `rgba(69, 26, 3, ${fmtA(alpha * 0.88)})`;
    ctx.fillRect(-rx * 0.62, -ry - 1.4, rx * 1.24, Math.max(1.5, h * 0.09));
    ctx.fillRect(-rx * 0.58, ry - 0.8, rx * 1.16, Math.max(1.5, h * 0.09));

    ctx.strokeStyle = `rgba(251, 191, 36, ${fmtA(alpha * 0.65)})`;
    ctx.lineWidth = Math.max(0.7, w * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, ry + 1);
    ctx.quadraticCurveTo(
      Math.sin(now * 0.0024 + l.phase) * 2.5,
      ry + h * 0.24,
      Math.sin(now * 0.0024 + l.phase) * 3.8,
      ry + h * 0.42
    );
    ctx.stroke();

    ctx.restore();
  }

  function drawDiamondStar(ctx, x, y, r, rot, rgb, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.01 || !(r > 0.2)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, ${fmtA(a * 0.22)})`;
    ctx.arc(0, 0, r * 2.1, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = `rgba(${rgb}, ${fmtA(a)})`;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.65);
    ctx.quadraticCurveTo(r * 0.22, -r * 0.22, r * 1.65, 0);
    ctx.quadraticCurveTo(r * 0.22, r * 0.22, 0, r * 1.65);
    ctx.quadraticCurveTo(-r * 0.22, r * 0.22, -r * 1.65, 0);
    ctx.quadraticCurveTo(-r * 0.22, -r * 0.22, 0, -r * 1.65);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${fmtA(a * 0.85)})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawCrescentArc(ctx, arc, outerRgb, coreRgb, serrated) {
    const p = clamp(arc.life / Math.max(1, arc.maxLife), 0, 1);
    const alpha = clamp((p < 0.20 ? p / 0.20 : Math.max(0, 1 - (p - 0.20) / 0.80)) * arc.peakAlpha, 0, 1);
    if (alpha <= 0.01) return;

    ctx.save();
    ctx.translate(arc.x, arc.y);
    ctx.rotate(arc.angle);

    const halfL = arc.length * 0.5;
    const bend = arc.bend;
    const thick = arc.thickness;

    // Outer wind/blade aura
    ctx.fillStyle = `rgba(${outerRgb}, ${fmtA(alpha * 0.32)})`;
    ctx.beginPath();
    ctx.moveTo(-halfL * 1.06, 0);
    ctx.quadraticCurveTo(0, -bend - thick * 1.75, halfL * 1.06, 0);
    ctx.quadraticCurveTo(0, -bend + thick * 1.1, -halfL * 1.06, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(${outerRgb}, ${fmtA(alpha * 0.82)})`;
    ctx.beginPath();
    ctx.moveTo(-halfL, 0);
    ctx.quadraticCurveTo(0, -bend - thick, halfL, 0);
    if (serrated) {
      const steps = 8;
      for (let i = steps - 1; i >= 1; i--) {
        const t = i / steps;
        const px = -halfL + t * arc.length;
        const arch = -4 * t * (1 - t) * (bend - thick * 0.35);
        const tooth = (i % 2 === 0 ? -thick * 0.78 : thick * 0.45);
        ctx.lineTo(px, arch + tooth);
      }
      ctx.lineTo(-halfL, 0);
    } else {
      ctx.quadraticCurveTo(0, -bend + thick * 0.65, -halfL, 0);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(${coreRgb}, ${fmtA(alpha * 0.95)})`;
    ctx.lineWidth = Math.max(1.05, thick * 0.32);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-halfL * 0.84, -bend * 0.08);
    ctx.quadraticCurveTo(0, -bend - thick * 0.20, halfL * 0.84, -bend * 0.08);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Soft flickering anime flame tongue anchored along the bottom edge.
   */
  function drawBottomFlameTongue(ctx, x, baseY, w, h, sway, outerRgb, midRgb, coreRgb, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.01 || !(h > 2)) return;

    ctx.save();
    // Outer flame tongue
    ctx.fillStyle = `rgba(${outerRgb}, ${fmtA(a * 0.48)})`;
    ctx.beginPath();
    ctx.moveTo(x - w, baseY);
    ctx.quadraticCurveTo(x - w * 0.65 + sway * 0.4, baseY - h * 0.55, x + sway, baseY - h);
    ctx.quadraticCurveTo(x + w * 0.65 + sway * 0.4, baseY - h * 0.55, x + w, baseY);
    ctx.closePath();
    ctx.fill();

    // Inner brighter flame body
    ctx.fillStyle = `rgba(${midRgb}, ${fmtA(a * 0.72)})`;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.58, baseY);
    ctx.quadraticCurveTo(x - w * 0.35 + sway * 0.35, baseY - h * 0.45, x + sway * 0.78, baseY - h * 0.74);
    ctx.quadraticCurveTo(x + w * 0.35 + sway * 0.35, baseY - h * 0.45, x + w * 0.58, baseY);
    ctx.closePath();
    ctx.fill();

    // White-gold / blush core
    ctx.fillStyle = `rgba(${coreRgb}, ${fmtA(a * 0.84)})`;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.26, baseY);
    ctx.quadraticCurveTo(x + sway * 0.25, baseY - h * 0.28, x + sway * 0.45, baseY - h * 0.42);
    ctx.quadraticCurveTo(x + w * 0.26, baseY - h * 0.22, x + w * 0.26, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Concentric elliptical surface ripple (used on water lakes & seismic stone ground).
   */
  function drawEllipticalRipple(ctx, x, y, radius, tiltY, outerRgb, innerRgb, alpha, lineWidth) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.008 || !(radius > 0.5)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, tiltY);

    ctx.strokeStyle = `rgba(${outerRgb}, ${fmtA(a)})`;
    ctx.lineWidth = lineWidth || 1.25;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TWO_PI);
    ctx.stroke();

    if (innerRgb && radius > 8) {
      ctx.strokeStyle = `rgba(${innerRgb}, ${fmtA(a * 0.62)})`;
      ctx.lineWidth = (lineWidth || 1.25) * 0.72;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.60, 0, TWO_PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  function stepAndDrawMeteor(ctx, state, now, width, height, headRgb, midRgb, tailRgb, intervalMin, intervalSpan) {
    if (!state.meteor && now >= state.nextMeteorAt) {
      state.meteor = {
        x: width * (0.30 + Math.random() * 0.58),
        y: height * (0.04 + Math.random() * 0.22),
        vx: -6.6 - Math.random() * 2.5,
        vy: 2.7 + Math.random() * 1.3,
        life: 0,
        maxLife: 46
      };
    }
    const m = state.meteor;
    if (!m) return;

    m.x += m.vx * state.dt;
    m.y += m.vy * state.dt;
    m.life += state.dt;
    const p = clamp(m.life / m.maxLife, 0, 1);
    const opacity = p < 0.2 ? (p / 0.2) : Math.max(0, 1 - (p - 0.2) / 0.8);
    const tailX = m.x - m.vx * 12;
    const tailY = m.y - m.vy * 12;

    const grad = safeLinearGradient(ctx, m.x, m.y, tailX, tailY);
    grad.addColorStop(0, `rgba(${headRgb}, ${fmtA(opacity * 0.95)})`);
    grad.addColorStop(0.38, `rgba(${midRgb}, ${fmtA(opacity * 0.68)})`);
    grad.addColorStop(1, `rgba(${tailRgb}, 0)`);

    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.75;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${fmtA(opacity * 0.96)})`;
    ctx.arc(m.x, m.y, 2.0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    if (m.life >= m.maxLife) {
      state.meteor = null;
      state.nextMeteorAt = now + intervalMin + Math.random() * intervalSpan;
    }
  }

  /* ==========================================================================
   * 14 CHARACTER / ESTATE UFOTABLE SCENIC & BREATHING AURA DEFINITIONS
   * ========================================================================== */

  const MODE_BUILDERS = {
    /**
     * 1. ROYAL WISTERIA — Gia Đình Chúa Công Ubuyashiki (Grand Sacred Estate Lake)
     * Violet-indigo moonlit lake at bottom reflecting golden lanterns, ripples spawned
     * right where falling wisteria petals kiss the lake surface, royal violet mist banks,
     * floating washi lanterns, 3D wisteria petals, sacred gold dust, butterflies & meteors.
     */
    royal_wisteria(w, h) {
      const lakeLayers = [
        {
          yRatio: 0.835, amp1: 4.2, amp2: 2.2, freq1: 0.0085, freq2: 0.015, spd1: 0.0011, spd2: 0.0008, phase: 0.4,
          topRgb: '88, 28, 135', topAlpha: 0.26, midRgb: '59, 7, 100', midAlpha: 0.38, botRgb: '30, 10, 60', botAlpha: 0.52,
          crestRgb: '216, 180, 254', crestAlpha: 0.36, crestWidth: 1.15, sparkles: 5
        },
        {
          yRatio: 0.885, amp1: 5.5, amp2: 2.8, freq1: 0.0072, freq2: 0.013, spd1: -0.0014, spd2: 0.0010, phase: 1.9,
          topRgb: '126, 34, 206', topAlpha: 0.24, midRgb: '76, 29, 149', midAlpha: 0.38, botRgb: '24, 9, 48', botAlpha: 0.56,
          crestRgb: '253, 224, 71', crestAlpha: 0.40, crestWidth: 1.3, sparkles: 7
        },
        {
          yRatio: 0.938, amp1: 6.4, amp2: 3.1, freq1: 0.0064, freq2: 0.011, spd1: 0.0017, spd2: -0.0012, phase: 3.3,
          topRgb: '168, 85, 247', topAlpha: 0.22, midRgb: '88, 28, 135', midAlpha: 0.40, botRgb: '19, 7, 38', botAlpha: 0.62,
          crestRgb: '254, 243, 199', crestAlpha: 0.46, crestWidth: 1.45, sparkles: 8
        }
      ];

      const lanterns = Array.from({ length: 10 }, (_, i) => {
        const depth = i < 5 ? 0 : 1;
        return {
          x: ((i * 109 + 8) % 92 + 4) / 100 * w,
          y: ((i * 67 + 14) % 78 + 5) / 100 * h,
          size: depth === 0 ? (8.8 + (i % 3) * 2.2) : (13.8 + (i % 3) * 2.8),
          vy: depth === 0 ? (-0.15 - (i % 3) * 0.04) : (-0.24 - (i % 3) * 0.055),
          vx: (i % 2 === 0 ? 1 : -1) * (0.05 + (i % 3) * 0.022),
          phase: i * 1.37,
          alpha: depth === 0 ? (0.50 + (i % 3) * 0.08) : (0.70 + (i % 2) * 0.10)
        };
      });

      const palette = ['#c084fc', '#a855f7', '#f472b6', '#f9a8d4', '#fdf4ff', '#fef3c7'];
      const petals = Array.from({ length: 36 }, (_, i) => {
        const layer = i < 12 ? 0 : (i < 26 ? 1 : 2);
        const scaleByLayer = layer === 0 ? 0.70 : (layer === 1 ? 1.02 : 1.42);
        return {
          layer,
          x: seededFrac(i, 131, 17) * w,
          y: seededFrac(i, 73, 29) * h * 0.90,
          r: (2.5 + (i % 3) * 0.85) * scaleByLayer,
          vy: (0.24 + (i % 4) * 0.075) * scaleByLayer,
          vx: (-0.14 - (i % 3) * 0.06) * scaleByLayer,
          sway: i * 0.85,
          rot: (i * 0.9) % TWO_PI,
          vrot: 0.007 + (i % 4) * 0.0035,
          flip: i * 0.6,
          vflip: 0.018 + (i % 4) * 0.006,
          hue: palette[i % palette.length],
          alpha: layer === 0 ? 0.36 : (layer === 1 ? 0.58 : 0.76),
          splashYRatio: 0.845 + (i % 5) * 0.028
        };
      });

      // Pool of petal-touch lake ripples
      const lakeRipples = Array.from({ length: 10 }, (_, i) => ({
        x: seededFrac(i, 97, 31) * w,
        y: h * (0.85 + (i % 5) * 0.026),
        progress: (i / 10),
        speed: 0.011 + (i % 3) * 0.003,
        maxR: 26 + (i % 3) * 12,
        gold: i % 2 === 0
      }));
      let nextRippleSlot = 0;

      const motes = Array.from({ length: 24 }, (_, i) => ({
        x: seededFrac(i, 89, 41) * w,
        y: seededFrac(i, 59, 13) * h,
        r: 1.2 + (i % 4) * 0.55,
        vx: (i % 2 === 0 ? 1 : -1) * (0.08 + (i % 3) * 0.03),
        vy: -0.09 - (i % 4) * 0.035,
        phase: i * 0.95,
        isStar: i % 4 === 0,
        rgb: i % 3 === 0 ? '233, 213, 255' : (i % 2 === 0 ? '251, 191, 36' : '253, 224, 71')
      }));

      const butterflies = Array.from({ length: 6 }, (_, i) => ({
        x: ((i * 149 + 14) % 88 + 6) / 100 * w,
        y: ((i * 83 + 16) % 64 + 10) / 100 * h,
        scale: 0.55 + (i % 3) * 0.16,
        vx: (i % 2 === 0 ? 1 : -1) * (0.24 + (i % 3) * 0.07),
        vy: -0.12 + (i % 3) * 0.06,
        phase: i * 1.55,
        flapSpeed: 0.0052 + (i % 3) * 0.0012,
        goldPrimary: i % 2 === 0
      }));

      const state = { meteor: null, nextMeteorAt: 1800, dt: 1 };

      return {
        pools: [lanterns, petals, lakeRipples, motes, butterflies],
        drawStatic(ctx, width, height) {
          drawLayeredWaterSurface(ctx, width, height, 1000, lakeLayers, 0.74, '254, 243, 199');
          for (let i = 0; i < lanterns.length; i++) {
            drawFloatingLantern(ctx, lanterns[i], 1000);
          }
          for (let i = 0; i < motes.length; i++) {
            drawSoftGlowOrb(ctx, motes[i].x, motes[i].y, motes[i].r * 1.2, motes[i].rgb, 0.42, 2.6);
          }
        },
        step(ctx, width, height, now, dt) {
          state.dt = dt;

          // Sacred upper wisteria-moon crown glow
          const topH = Math.min(220, height * 0.30);
          const topGlow = safeLinearGradient(ctx, 0, 0, 0, topH);
          topGlow.addColorStop(0, 'rgba(192, 132, 252, 0.09)');
          topGlow.addColorStop(0.55, 'rgba(251, 191, 36, 0.035)');
          topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = topGlow;
          ctx.fillRect(0, 0, width, topH);

          // 1. Far-layer wisteria petals
          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            if (p.layer !== 0) continue;
            p.x += (p.vx + Math.sin(now * 0.0009 + p.sway) * 0.20) * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            const touchY = height * p.splashYRatio;
            if (p.y >= touchY) {
              const rp = lakeRipples[nextRippleSlot];
              nextRippleSlot = (nextRippleSlot + 1) % lakeRipples.length;
              rp.x = clamp(p.x, 16, width - 16);
              rp.y = touchY;
              rp.progress = 0.02;
              rp.gold = i % 2 === 0;
              p.y = -14;
              p.x = (p.x + width * 0.31 + width) % width;
            }
            if (p.x < -16) p.x = width + 14;
            drawWisteriaPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.hue, p.alpha);
          }

          // 2. Royal violet mist drifting softly right above the night lake
          drawRollingMistBank(ctx, width, height, height * 0.81, height * 0.11, 0.5, 0.00065, now, '192, 132, 252', '88, 28, 135', 0.11);

          // 3. Ascending floating washi lanterns
          for (let i = 0; i < lanterns.length; i++) {
            const l = lanterns[i];
            l.x += (l.vx + Math.sin(now * 0.00065 + l.phase) * 0.14) * dt;
            l.y += l.vy * dt;
            if (l.y < -l.size * 3.5) {
              l.y = height * 0.82;
              l.x = ((l.x + width * 0.43) % (width * 0.90)) + width * 0.05;
            }
            if (l.x < -30) l.x = width + 25;
            if (l.x > width + 30) l.x = -25;
            drawFloatingLantern(ctx, l, now);
          }

          // 4. Violet-indigo estate night lake + warm golden lantern reflections
          drawLayeredWaterSurface(ctx, width, height, now, lakeLayers, 0.74, '254, 243, 199');

          const lakeTopY = height * 0.835;
          for (let i = 0; i < lanterns.length; i++) {
            const l = lanterns[i];
            if (l.y > lakeTopY || l.y < -20) continue;
            const heightFactor = clamp(1 - (lakeTopY - l.y) / (height * 0.85), 0.18, 1);
            const reflAlpha = l.alpha * 0.28 * heightFactor;
            for (let seg = 0; seg < 4; seg++) {
              const ry = lakeTopY + 6 + seg * (height * 0.034);
              if (ry >= height) break;
              const shimmerX = l.x + Math.sin(now * 0.0032 + l.phase + seg * 1.4) * (4 + seg * 2.2);
              const rw = l.size * (0.85 - seg * 0.12);
              ctx.fillStyle = `rgba(253, 224, 71, ${fmtA(reflAlpha * (1 - seg * 0.2))})`;
              ctx.beginPath();
              ctx.ellipse(shimmerX, ry, Math.max(2, rw), 1.8 + seg * 0.45, 0, 0, TWO_PI);
              ctx.fill();
            }
          }

          // 5. Ripples on lake where wisteria petals touch the water
          for (let i = 0; i < lakeRipples.length; i++) {
            const rp = lakeRipples[i];
            rp.progress += rp.speed * dt;
            if (rp.progress >= 1) {
              rp.progress = 1;
              continue;
            }
            const p = rp.progress;
            const a = (p < 0.16 ? p / 0.16 : 1 - (p - 0.16) / 0.84) * 0.52;
            const outerRgb = rp.gold ? '253, 224, 71' : '216, 180, 254';
            const innerRgb = rp.gold ? '254, 249, 195' : '243, 232, 255';
            drawEllipticalRipple(ctx, rp.x, rp.y, 3 + p * rp.maxR, 0.34, outerRgb, innerRgb, a, 1.15);
          }

          // 6. Low velvet mist skimming the lake surface
          drawRollingMistBank(ctx, width, height, height * 0.87, height * 0.08, 2.2, -0.0008, now, '233, 213, 255', '126, 34, 206', 0.085);

          // 7. Sacred golden motes & stars
          for (let i = 0; i < motes.length; i++) {
            const m = motes[i];
            m.x += (m.vx + Math.sin(now * 0.0008 + m.phase) * 0.12) * dt;
            m.y += m.vy * dt;
            if (m.x < -12) m.x = width + 12;
            if (m.x > width + 12) m.x = -12;
            if (m.y < -12) m.y = height * 0.86;
            const alpha = 0.24 + 0.48 * (0.5 + 0.5 * Math.sin(now * 0.0016 + m.phase));
            if (m.isStar) {
              drawDiamondStar(ctx, m.x, m.y, m.r * 1.45, now * 0.0004 + m.phase, m.rgb, alpha);
            } else {
              drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.35, m.rgb, alpha, 2.8);
            }
          }

          // 8. Mid & foreground wisteria petals kissing the lake surface
          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            if (p.layer === 0) continue;
            p.x += (p.vx + Math.sin(now * 0.0011 + p.sway) * 0.28) * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            const touchY = height * p.splashYRatio;
            if (p.y >= touchY) {
              const rp = lakeRipples[nextRippleSlot];
              nextRippleSlot = (nextRippleSlot + 1) % lakeRipples.length;
              rp.x = clamp(p.x, 16, width - 16);
              rp.y = touchY;
              rp.progress = 0.01;
              rp.gold = p.layer === 2;
              p.y = -18;
              p.x = (p.x + width * 0.37 + width) % width;
            }
            if (p.x < -20) p.x = width + 18;
            if (p.x > width + 20) p.x = -18;
            drawWisteriaPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.hue, p.alpha);
          }

          // 9. Violet-gold imperial butterflies
          for (let i = 0; i < butterflies.length; i++) {
            const b = butterflies[i];
            b.x += (b.vx + Math.cos(now * 0.0009 + b.phase) * 0.18) * dt;
            b.y += (b.vy + Math.sin(now * 0.0013 + b.phase) * 0.22) * dt;
            if (b.x < -28) b.x = width + 24;
            if (b.x > width + 28) b.x = -24;
            if (b.y < 24) b.vy = Math.abs(b.vy);
            if (b.y > height * 0.80) b.vy = -Math.abs(b.vy);
            const topRgb = b.goldPrimary ? '251, 191, 36' : '192, 132, 252';
            const botRgb = b.goldPrimary ? '216, 180, 254' : '253, 224, 71';
            drawButterfly(ctx, b, now, topRgb, botRgb, '254, 243, 199');
          }

          // 10. Gold-violet shooting star
          stepAndDrawMeteor(ctx, state, now, width, height, '254, 249, 195', '251, 191, 36', '192, 132, 252', 4500, 3800);
        }
      };
    },

    /**
     * 2. WISTERIA — Trùng Trụ Shinobu Kocho (Butterfly Dance: Caprice / Cho no Mai: Tawamure)
     * Dreamy wisteria-scented violet haze along bottom, luminous purple-teal butterflies flying
     * in swirling Dance of the Butterfly trajectories leaving sparkling scale-dust trails,
     * falling wisteria petals & night shooting stars.
     */
    wisteria(w, h) {
      const petals = Array.from({ length: 24 }, (_, i) => ({
        x: seededFrac(i, 97, 11) * w,
        y: seededFrac(i, 53, 23) * h,
        r: 2.6 + (i % 4) * 1.05,
        vy: 0.28 + (i % 5) * 0.09,
        vx: -0.18 - (i % 3) * 0.07,
        sway: (i % 7) * 0.9,
        rot: (i * 0.7) % TWO_PI,
        vrot: 0.008 + (i % 4) * 0.004,
        flip: i * 0.55,
        vflip: 0.02 + (i % 3) * 0.006,
        hue: i % 3 === 0 ? '#e879f9' : (i % 2 === 0 ? '#c084fc' : '#a855f7'),
        alpha: 0.40 + (i % 4) * 0.12
      }));

      const TRAIL_LEN = 12;
      const butterflies = Array.from({ length: 8 }, (_, i) => {
        const cx = ((i * 137 + 14) % 80 + 10) / 100 * w;
        const cy = ((i * 79 + 16) % 62 + 14) / 100 * h;
        const trailX = new Float64Array(TRAIL_LEN).fill(cx);
        const trailY = new Float64Array(TRAIL_LEN).fill(cy);
        return {
          baseX: cx,
          baseY: cy,
          x: cx,
          y: cy,
          vx: 0.3,
          vy: -0.1,
          driftVx: (i % 2 === 0 ? 1 : -1) * (0.28 + (i % 3) * 0.09),
          driftVy: -0.08 + (i % 3) * 0.04,
          orbitRx: 34 + (i % 3) * 18,
          orbitRy: 20 + (i % 4) * 10,
          orbitSpd: (i % 2 === 0 ? 1 : -1) * (0.0018 + (i % 3) * 0.0005),
          scale: 0.54 + (i % 4) * 0.14,
          phase: i * 1.45,
          flapSpeed: 0.0058 + (i % 3) * 0.0014,
          mint: i % 2 === 0,
          trailX,
          trailY,
          trailHead: 0,
          trailTick: 0
        };
      });

      const scaleDust = Array.from({ length: 20 }, (_, i) => ({
        x: seededFrac(i, 67, 15) * w,
        y: seededFrac(i, 41, 20) * h,
        r: 1.3 + (i % 3) * 0.7,
        vx: (i % 2 === 0 ? 1 : -1) * (0.12 + (i % 4) * 0.04),
        vy: -0.12 - (i % 3) * 0.05,
        phase: i * 1.1,
        rgb: i % 3 === 0 ? '94, 234, 212' : '216, 180, 254'
      }));

      const state = { meteor: null, nextMeteorAt: 2200, dt: 1 };

      return {
        pools: [petals, butterflies, scaleDust],
        onResize(nw, nh, sx, sy) {
          for (let i = 0; i < butterflies.length; i++) {
            const b = butterflies[i];
            for (let k = 0; k < TRAIL_LEN; k++) {
              b.trailX[k] *= sx;
              b.trailY[k] *= sy;
            }
          }
        },
        drawStatic(ctx, width, height) {
          drawRollingMistBank(ctx, width, height, height * 0.90, height * 0.18, 0.4, 0, 1000, '192, 132, 252', '88, 28, 135', 0.14);
          for (let i = 0; i < scaleDust.length; i++) {
            const f = scaleDust[i];
            drawSoftGlowOrb(ctx, f.x, f.y, f.r * 1.3, f.rgb, 0.38, 2.5);
          }
        },
        step(ctx, width, height, now, dt) {
          state.dt = dt;

          // 1. Wisteria-scented violet & mint poison mist banks along the bottom edge
          const footGrad = safeLinearGradient(ctx, 0, height * 0.76, 0, height);
          footGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
          footGrad.addColorStop(0.65, 'rgba(147, 51, 234, 0.09)');
          footGrad.addColorStop(1, 'rgba(88, 28, 135, 0.22)');
          ctx.fillStyle = footGrad;
          ctx.fillRect(0, height * 0.76, width, height * 0.24);

          drawRollingMistBank(ctx, width, height, height * 0.86, height * 0.14, 0.6, 0.0008, now, '192, 132, 252', '107, 33, 168', 0.12);
          drawRollingMistBank(ctx, width, height, height * 0.93, height * 0.13, 2.4, -0.0010, now, '94, 234, 212', '126, 34, 206', 0.095);

          // 2. Luminous scale-dust motes
          for (let i = 0; i < scaleDust.length; i++) {
            const f = scaleDust[i];
            f.x += (f.vx + Math.sin(now * 0.0008 + f.phase) * 0.14) * dt;
            f.y += f.vy * dt;
            if (f.x < -10) f.x = width + 10;
            if (f.x > width + 10) f.x = -10;
            if (f.y < -10) f.y = height + 10;
            const alpha = 0.24 + 0.42 * (0.5 + 0.5 * Math.sin(now * 0.0016 + f.phase));
            drawSoftGlowOrb(ctx, f.x, f.y, f.r * 1.25, f.rgb, alpha, 2.6);
          }

          // 3. Falling wisteria petals
          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            p.x += (p.vx + Math.sin(now * 0.0011 + p.sway) * 0.25) * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            if (p.y > height + 14) { p.y = -12; p.x = (p.x + width * 0.37 + width) % width; }
            if (p.x < -14) p.x = width + 12;
            drawWisteriaPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.hue, p.alpha);
          }

          // 4. Swirling Dance of the Butterfly (Cho no Mai) with glittering scale-dust trails
          for (let i = 0; i < butterflies.length; i++) {
            const b = butterflies[i];
            const prevX = b.x;
            const prevY = b.y;

            b.baseX += b.driftVx * dt;
            b.baseY += b.driftVy * dt;
            let wrapped = false;
            if (b.baseX < -50) { b.baseX = width + 45; wrapped = true; }
            if (b.baseX > width + 50) { b.baseX = -45; wrapped = true; }
            if (b.baseY < height * 0.12) b.driftVy = Math.abs(b.driftVy);
            if (b.baseY > height * 0.80) b.driftVy = -Math.abs(b.driftVy);

            // Figure-8 / spiral vortex offset
            const ang = now * b.orbitSpd + b.phase;
            b.x = b.baseX + Math.cos(ang) * b.orbitRx;
            b.y = b.baseY + Math.sin(ang * 2) * (b.orbitRy * 0.65);
            b.vx = b.x - prevX;
            b.vy = b.y - prevY;

            if (wrapped) {
              b.trailX.fill(b.x);
              b.trailY.fill(b.y);
            } else {
              b.trailTick += dt;
              if (b.trailTick >= 2.2) {
                b.trailTick = 0;
                b.trailHead = (b.trailHead + 1) % TRAIL_LEN;
                b.trailX[b.trailHead] = b.x;
                b.trailY[b.trailHead] = b.y;
              }
            }

            // Render glittering dust trail behind butterfly
            const trailRgb = b.mint ? '94, 234, 212' : '232, 121, 249';
            ctx.save();
            ctx.beginPath();
            for (let k = 0; k < TRAIL_LEN; k++) {
              const idx = (b.trailHead - k + TRAIL_LEN) % TRAIL_LEN;
              const tx = b.trailX[idx];
              const ty = b.trailY[idx];
              if (k === 0) ctx.moveTo(b.x, b.y);
              ctx.lineTo(tx, ty);
            }
            ctx.strokeStyle = `rgba(${trailRgb}, 0.22)`;
            ctx.lineWidth = 1.4;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.restore();

            for (let k = 1; k < TRAIL_LEN; k += 2) {
              const idx = (b.trailHead - k + TRAIL_LEN) % TRAIL_LEN;
              const fade = (1 - k / TRAIL_LEN) * 0.48;
              drawSoftGlowOrb(ctx, b.trailX[idx], b.trailY[idx], 1.35 * (1 - k / (TRAIL_LEN * 1.4)), trailRgb, fade, 2.2);
            }

            drawButterfly(
              ctx,
              b,
              now,
              b.mint ? '94, 234, 212' : '232, 121, 249',
              b.mint ? '192, 132, 252' : '94, 234, 212'
            );
          }

          stepAndDrawMeteor(ctx, state, now, width, height, '240, 253, 250', '94, 234, 212', '192, 132, 252', 5000, 4200);
        }
      };
    },

    /**
     * 3. WATER — Thủy Trụ Giyu Tomioka (SHOWCASE UFOTABLE & UKIYO-E MASTERPIECE)
     * - 3-layer moonlit undulating water surface at bottom (0.80h .. h) with silver-azure crests
     * - Concentric Dead Calm (Nagi) elliptical ripples expanding across the bottom water surface
     * - Translucent water bubbles (r = 2..9px) with thin teal-cyan rims & white upper-left specular highlights swaying upward
     * - Ukiyo-e / ufotable Water Breathing ribbons (deep cobalt -> cyan -> white sea-foam crests & spray droplets)
     */
    water(w, h) {
      const waterLayers = [
        {
          yRatio: 0.805, amp1: 5.5, amp2: 2.8, freq1: 0.0075, freq2: 0.014, spd1: 0.0014, spd2: 0.0009, phase: 0.2,
          topRgb: '14, 116, 144', topAlpha: 0.26, midRgb: '3, 105, 161', midAlpha: 0.36, botRgb: '12, 74, 110', botAlpha: 0.50,
          crestRgb: '125, 211, 252', crestAlpha: 0.44, crestWidth: 1.25, sparkles: 6
        },
        {
          yRatio: 0.865, amp1: 7.2, amp2: 3.4, freq1: 0.0062, freq2: 0.012, spd1: -0.0018, spd2: 0.0012, phase: 1.8,
          topRgb: '2, 132, 199', topAlpha: 0.28, midRgb: '7, 89, 133', midAlpha: 0.42, botRgb: '8, 47, 73', botAlpha: 0.58,
          crestRgb: '186, 230, 253', crestAlpha: 0.54, crestWidth: 1.45, sparkles: 8
        },
        {
          yRatio: 0.928, amp1: 8.5, amp2: 4.0, freq1: 0.0054, freq2: 0.010, spd1: 0.0022, spd2: -0.0015, phase: 3.5,
          topRgb: '56, 189, 248', topAlpha: 0.25, midRgb: '14, 116, 144', midAlpha: 0.44, botRgb: '8, 47, 73', botAlpha: 0.66,
          crestRgb: '240, 249, 255', crestAlpha: 0.65, crestWidth: 1.65, sparkles: 10
        }
      ];

      // Dead Calm (Nagi) concentric elliptical ripples on bottom water surface
      const ripples = Array.from({ length: 8 }, (_, i) => ({
        x: ((i * 137 + 12) % 86 + 7) / 100 * w,
        y: (0.82 + (i % 5) * 0.036) * h,
        progress: (i / 8),
        speed: 0.0036 + (i % 3) * 0.0008,
        maxR: 42 + (i % 4) * 18,
        tilt: 0.30 + (i % 3) * 0.06
      }));

      // Translucent Water Bubbles (r = 2..9px) rising & swaying from the water surface
      const bubbles = Array.from({ length: 34 }, (_, i) => ({
        x: seededFrac(i, 83, 19) * w,
        y: seededFrac(i, 61, 31) * h,
        r: 2.0 + seededFrac(i, 47, 13) * 7.0, // 2..9px
        vy: -0.26 - (i % 5) * 0.095,
        vx: (i % 2 === 0 ? 1 : -1) * (0.05 + (i % 3) * 0.03),
        wobbleAmp: 0.32 + (i % 4) * 0.14,
        wobbleSpd: 0.0018 + (i % 4) * 0.0005,
        phase: i * 1.17,
        rimRgb: i % 3 === 0 ? '94, 234, 212' : (i % 2 === 0 ? '125, 211, 252' : '56, 189, 248'),
        fillRgb: i % 2 === 0 ? '14, 165, 233' : '45, 212, 191',
        baseAlpha: 0.42 + (i % 4) * 0.12
      }));

      // Ukiyo-e Water Breathing Stream Ribbons (2 staggered graceful flowing waves)
      const RIBBON_NODES = 28;
      const streams = [0, 1].map((idx) => ({
        xs: new Float64Array(RIBBON_NODES),
        ys: new Float64Array(RIBBON_NODES),
        progress: idx === 0 ? 0.18 : 0.68,
        speed: 0.0023 + idx * 0.0003,
        yBaseRatio: idx === 0 ? 0.56 : 0.36,
        slopeRatio: idx === 0 ? -0.22 : 0.16,
        waveAmp: idx === 0 ? 38 : 30,
        dir: idx === 0 ? 1 : -1,
        halfW: idx === 0 ? 16 : 13
      }));

      // Fine sea-spray droplets accompanying the water breathing streams
      const spray = Array.from({ length: 18 }, (_, i) => ({
        x: seededFrac(i, 113, 7) * w,
        y: seededFrac(i, 71, 43) * h * 0.85,
        r: 1.2 + (i % 3) * 0.65,
        vx: 0.42 + (i % 4) * 0.14,
        vy: -0.08 + (i % 3 - 1) * 0.06,
        phase: i * 1.3
      }));

      return {
        pools: [ripples, bubbles, spray],
        drawStatic(ctx, width, height) {
          drawLayeredWaterSurface(ctx, width, height, 1000, waterLayers, 0.72, '240, 249, 255');
          for (let i = 0; i < ripples.length; i += 2) {
            const rp = ripples[i];
            drawEllipticalRipple(ctx, rp.x, rp.y, rp.maxR * 0.55, rp.tilt, '125, 211, 252', '224, 242, 254', 0.32, 1.15);
          }
          for (let i = 0; i < bubbles.length; i += 2) {
            const b = bubbles[i];
            drawWaterBubble(ctx, b.x, b.y, b.r, b.rimRgb, b.fillRgb, 0.52);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Ukiyo-e / ufotable Water Breathing ribbons gracefully curving across space
          for (let sIdx = 0; sIdx < streams.length; sIdx++) {
            const st = streams[sIdx];
            st.progress += st.speed * dt;
            if (st.progress >= 1.28) {
              st.progress = 0;
              st.yBaseRatio = 0.28 + ((sIdx * 0.27 + Math.random() * 0.32) % 0.46);
              st.slopeRatio = (Math.random() - 0.5) * 0.34;
            }
            if (st.progress <= 1.0) {
              const p = st.progress;
              const visAlpha = (p < 0.18 ? p / 0.18 : (p > 0.78 ? (1 - p) / 0.22 : 1)) * 0.72;
              const spanLen = width * 0.56;
              const headTravel = -spanLen * 0.2 + p * (width + spanLen * 0.6);

              for (let k = 0; k < RIBBON_NODES; k++) {
                const u = k / (RIBBON_NODES - 1); // 0 = tail, 1 = head
                const localX = headTravel - (1 - u) * spanLen;
                const x = st.dir > 0 ? localX : (width - localX);
                const normX = x / Math.max(320, width);
                const y = height * st.yBaseRatio
                  + (normX - 0.5) * height * st.slopeRatio
                  + Math.sin(u * 6.2 - now * 0.0045 + sIdx * 2.1) * st.waveAmp
                  + Math.cos(u * 11.0 + now * 0.003) * (st.waveAmp * 0.26);
                st.xs[k] = x;
                st.ys[k] = y;
              }

              // Deep cobalt outer -> bright cyan mid -> pure white foam crest
              drawBreathingRibbon(
                ctx,
                st.xs,
                st.ys,
                RIBBON_NODES,
                st.halfW,
                '3, 105, 161',
                '34, 211, 238',
                '240, 249, 255',
                visAlpha,
                { ukiyoeFoam: true, foamRgb: '240, 249, 255', flutter: true, now }
              );

              // Splash droplets dancing around the leading head of the water stream
              const hx = st.xs[RIBBON_NODES - 2];
              const hy = st.ys[RIBBON_NODES - 2];
              for (let d = 0; d < 4; d++) {
                const ang = now * 0.004 + d * 1.57;
                const dx = hx + Math.cos(ang) * (10 + d * 5);
                const dy = hy + Math.sin(ang) * (8 + d * 4);
                drawSoftGlowOrb(ctx, dx, dy, 1.8, '224, 242, 254', visAlpha * 0.78, 2.1);
              }
            }
          }

          // 2. Ambient azure water mist above the surface
          const mistGrad = safeLinearGradient(ctx, 0, height * 0.72, 0, height);
          mistGrad.addColorStop(0, 'rgba(14, 165, 233, 0)');
          mistGrad.addColorStop(0.55, 'rgba(56, 189, 248, 0.065)');
          mistGrad.addColorStop(1, 'rgba(3, 105, 161, 0.16)');
          ctx.fillStyle = mistGrad;
          ctx.fillRect(0, height * 0.72, width, height * 0.28);

          // 3. 3-Layer Moonlit Undulating Water Surface (height * 0.80 .. height)
          drawLayeredWaterSurface(ctx, width, height, now, waterLayers, 0.72, '240, 249, 255');

          // 4. Dead Calm (Nagi) concentric elliptical ripples on the bottom water surface
          for (let i = 0; i < ripples.length; i++) {
            const rp = ripples[i];
            rp.progress += rp.speed * dt;
            if (rp.progress >= 1) {
              rp.progress = 0;
              rp.x = width * (0.08 + Math.random() * 0.84);
              rp.y = height * (0.815 + Math.random() * 0.16);
            }
            const p = rp.progress;
            const alpha = (p < 0.16 ? p / 0.16 : 1 - (p - 0.16) / 0.84) * 0.52;
            const curR = 4 + p * rp.maxR;
            drawEllipticalRipple(ctx, rp.x, rp.y, curR, rp.tilt, '125, 211, 252', '224, 242, 254', alpha, 1.25);
          }

          // 5. Fine glowing water spray & moonlit glints
          for (let i = 0; i < spray.length; i++) {
            const sp = spray[i];
            sp.x += sp.vx * dt;
            sp.y += (sp.vy + Math.sin(now * 0.0016 + sp.phase) * 0.15) * dt;
            if (sp.x > width + 16) { sp.x = -14; sp.y = height * (0.25 + seededFrac(i, 53, 11) * 0.60); }
            const tw = 0.25 + 0.50 * (0.5 + 0.5 * Math.sin(now * 0.0024 + sp.phase));
            if (i % 3 === 0) {
              drawDiamondStar(ctx, sp.x, sp.y, sp.r * 1.5, 0, '186, 230, 253', tw * 0.75);
            } else {
              drawSoftGlowOrb(ctx, sp.x, sp.y, sp.r, '125, 211, 252', tw, 2.4);
            }
          }

          // 6. Translucent Water Bubbles (r = 2..9px) rising & swaying gently from water surface
          for (let i = 0; i < bubbles.length; i++) {
            const b = bubbles[i];
            const swayDx = Math.sin(now * b.wobbleSpd + b.phase) * b.wobbleAmp;
            b.x += (b.vx + swayDx) * dt;
            b.y += b.vy * dt;

            if (b.y < -b.r * 2.5) {
              // Spawn right from the bottom water surface!
              b.y = height * (0.83 + (i % 5) * 0.032);
              b.x = (b.x + width * 0.29 + width) % width;
            }
            if (b.x < -16) b.x = width + 14;
            if (b.x > width + 16) b.x = -14;

            const topFade = clamp(b.y / (height * 0.14), 0.12, 1);
            const shimmer = 0.82 + 0.18 * Math.sin(now * 0.0025 + b.phase);
            drawWaterBubble(ctx, b.x, b.y, b.r, b.rimRgb, b.fillRgb, b.baseAlpha * topFade * shimmer);
          }
        }
      };
    },

    /**
     * 4. FLAME — Viêm Trụ Kyojuro Rengoku (Blazing Flame Breathing Silk Ribbons & Hearth Flames)
     * Warm crimson-amber flame tongues dancing at the bottom edge, soaring Flame Breathing
     * silk ribbons (white-gold core -> orange-crimson edge), and dozens of swirling embers.
     */
    flame(w, h) {
      const tongues = Array.from({ length: 20 }, (_, i) => ({
        x: ((i + 0.5) / 20) * w,
        w: Math.max(24, w / 22) * (0.85 + (i % 3) * 0.22),
        baseH: 32 + (i % 4) * 16,
        phase: i * 1.23,
        spd: 0.0042 + (i % 4) * 0.0011
      }));

      const FLAME_NODES = 26;
      const flameRibbons = [0, 1].map((idx) => ({
        xs: new Float64Array(FLAME_NODES),
        ys: new Float64Array(FLAME_NODES),
        progress: idx === 0 ? 0.12 : 0.62,
        speed: 0.0031 + idx * 0.0004,
        startXRatio: idx === 0 ? 0.18 : 0.82,
        dir: idx === 0 ? 1 : -1,
        halfW: idx === 0 ? 18 : 14
      }));

      const embers = Array.from({ length: 42 }, (_, i) => ({
        x: seededFrac(i, 101, 17) * w,
        y: seededFrac(i, 67, 29) * h,
        r: 1.4 + (i % 4) * 0.85,
        vy: -0.68 - (i % 5) * 0.25,
        vx: (i % 2 === 0 ? 1 : -1) * (0.16 + (i % 3) * 0.09),
        swirl: i * 0.85,
        swirlAmp: 0.38 + (i % 4) * 0.16,
        rgb: i % 4 === 0 ? '254, 240, 138' : (i % 3 === 0 ? '251, 191, 36' : (i % 2 === 0 ? '249, 115, 22' : '239, 68, 68')),
        isStreak: i % 2 === 0
      }));

      return {
        pools: [tongues, embers],
        onResize(nw) {
          for (let i = 0; i < tongues.length; i++) {
            tongues[i].w = Math.max(24, nw / 22) * (0.85 + (i % 3) * 0.22);
          }
        },
        drawStatic(ctx, width, height) {
          const warmBase = safeLinearGradient(ctx, 0, height * 0.72, 0, height);
          warmBase.addColorStop(0, 'rgba(249, 115, 22, 0)');
          warmBase.addColorStop(1, 'rgba(220, 38, 38, 0.18)');
          ctx.fillStyle = warmBase;
          ctx.fillRect(0, height * 0.72, width, height * 0.28);
          for (let i = 0; i < tongues.length; i += 2) {
            const t = tongues[i];
            drawBottomFlameTongue(ctx, t.x, height + 4, t.w, t.baseH, 4, '220, 38, 38', '249, 115, 22', '254, 240, 138', 0.42);
          }
          for (let i = 0; i < embers.length; i += 2) {
            const e = embers[i];
            drawSoftGlowOrb(ctx, e.x, e.y, e.r * 1.1, e.rgb, 0.44, 2.5);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Blazing thermal updraft glow along the bottom edge
          const hearthH = Math.min(220, height * 0.28);
          const warmGrad = safeLinearGradient(ctx, 0, height - hearthH, 0, height);
          warmGrad.addColorStop(0, 'rgba(249, 115, 22, 0)');
          warmGrad.addColorStop(0.62, 'rgba(234, 88, 12, 0.11)');
          warmGrad.addColorStop(1, 'rgba(220, 38, 38, 0.24)');
          ctx.fillStyle = warmGrad;
          ctx.fillRect(0, height - hearthH, width, hearthH);

          // 2. Soaring Flame Breathing silk ribbons (crimson-orange edge -> white-gold core)
          for (let rIdx = 0; rIdx < flameRibbons.length; rIdx++) {
            const rb = flameRibbons[rIdx];
            rb.progress += rb.speed * dt;
            if (rb.progress >= 1.25) {
              rb.progress = 0;
              rb.startXRatio = rIdx === 0 ? (0.12 + Math.random() * 0.30) : (0.58 + Math.random() * 0.30);
            }
            if (rb.progress <= 1.0) {
              const p = rb.progress;
              const visAlpha = (p < 0.18 ? p / 0.18 : (p > 0.76 ? (1 - p) / 0.24 : 1)) * 0.76;
              const startX = width * rb.startXRatio;
              const startY = height * 0.98;
              const travelX = width * 0.52 * rb.dir;
              const travelY = -height * 0.78;

              for (let k = 0; k < FLAME_NODES; k++) {
                const u = k / (FLAME_NODES - 1);
                const trailT = clamp(p * 1.25 - (1 - u) * 0.48, 0, 1.15);
                const swirl = Math.sin(trailT * 7.5 - now * 0.006 + rIdx * 2.4) * (36 * (0.4 + 0.6 * trailT));
                rb.xs[k] = startX + travelX * trailT + swirl;
                rb.ys[k] = startY + travelY * trailT + Math.cos(trailT * 5.2 + now * 0.004) * 16;
              }

              drawBreathingRibbon(
                ctx,
                rb.xs,
                rb.ys,
                FLAME_NODES,
                rb.halfW,
                '220, 38, 38',
                '249, 115, 22',
                '254, 249, 195',
                visAlpha,
                { flutter: true, now }
              );
            }
          }

          // 3. Soft flickering flame tongues along bottom edge
          for (let i = 0; i < tongues.length; i++) {
            const t = tongues[i];
            const pulse = 0.72 + 0.28 * Math.sin(now * t.spd + t.phase);
            const sway = Math.sin(now * 0.0031 + t.phase * 1.4) * 12;
            drawBottomFlameTongue(
              ctx,
              t.x,
              height + 5,
              t.w,
              t.baseH * pulse,
              sway,
              '220, 38, 38',
              '249, 115, 22',
              '254, 240, 138',
              0.46 * pulse
            );
          }

          // 4. Swirling thermal embers & blazing spark streaks
          for (let i = 0; i < embers.length; i++) {
            const e = embers[i];
            const curlX = Math.sin(now * 0.0021 + e.swirl + e.y * 0.0085) * e.swirlAmp;
            const dx = e.vx + curlX;
            const dy = e.vy;
            e.x += dx * dt;
            e.y += dy * dt;

            if (e.y < -20) {
              e.y = height + 10;
              e.x = (e.x + width * 0.39 + width) % width;
            }
            if (e.x < -16) e.x = width + 14;
            if (e.x > width + 16) e.x = -14;

            const heightFade = clamp(e.y / (height * 0.20), 0.16, 1);
            const flicker = 0.64 + 0.36 * Math.sin(now * 0.0048 + e.swirl * 1.7);
            const alpha = 0.82 * heightFade * flicker;

            if (e.isStreak) {
              ctx.save();
              ctx.strokeStyle = `rgba(${e.rgb}, ${fmtA(alpha * 0.86)})`;
              ctx.lineWidth = e.r * 1.05;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(e.x, e.y);
              ctx.lineTo(e.x - dx * 5.6, e.y - dy * 5.6);
              ctx.stroke();
              ctx.restore();
              drawSoftGlowOrb(ctx, e.x, e.y, e.r * 0.9, '254, 249, 195', alpha, 2.2);
            } else {
              drawSoftGlowOrb(ctx, e.x, e.y, e.r * 1.2, e.rgb, alpha, 2.7);
            }
          }
        }
      };
    },

    /**
     * 5. SOUND — Âm Trụ Tengen Uzui (Musical Score / Fumen Equalizer Waves & Gem Fireworks)
     * Flamboyant acoustic equalizer bars + golden string wave along the bottom edge,
     * multi-gem (ruby, gold, cyan) Musical Score firework star-bursts, and spinning glitter.
     */
    sound(w, h) {
      const gemPalette = ['244, 63, 94', '251, 191, 36', '34, 211, 238', '232, 121, 249'];
      const diamonds = Array.from({ length: 26 }, (_, i) => ({
        x: seededFrac(i, 107, 19) * w,
        y: seededFrac(i, 79, 11) * h,
        r: 2.2 + (i % 4) * 0.9,
        vx: (i % 2 === 0 ? 1 : -1) * (0.14 + (i % 3) * 0.05),
        vy: -0.16 - (i % 3) * 0.06,
        rot: (i * 0.45) % TWO_PI,
        vrot: (i % 2 === 0 ? 1 : -1) * (0.010 + (i % 3) * 0.005),
        phase: i * 1.15,
        rgb: gemPalette[i % gemPalette.length]
      }));

      const bursts = [
        { x: w * 0.74, y: h * 0.28, progress: 0.12, speed: 0.0078, maxR: 66, rays: 12, colorIdx: 0 },
        { x: w * 0.26, y: h * 0.42, progress: 0.56, speed: 0.0072, maxR: 56, rays: 10, colorIdx: 2 },
        { x: w * 0.52, y: h * 0.22, progress: 0.92, speed: 0.0075, maxR: 60, rays: 12, colorIdx: 1 }
      ];

      const barCount = 32;

      return {
        pools: [diamonds, bursts],
        drawStatic(ctx, width, height) {
          for (let i = 0; i < barCount; i++) {
            const bx = ((i + 0.5) / barCount) * width;
            const bh = 10 + (i % 5) * 6;
            const rgb = gemPalette[i % gemPalette.length];
            ctx.fillStyle = `rgba(${rgb}, 0.28)`;
            ctx.fillRect(bx - 2, height - bh, 4, bh);
          }
          for (let i = 0; i < diamonds.length; i += 2) {
            const d = diamonds[i];
            drawDiamondStar(ctx, d.x, d.y, d.r, d.rot, d.rgb, 0.48);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Flamboyant Musical Score (Fumen) acoustic bars & harmonic wave along bottom edge
          const stageGlow = safeLinearGradient(ctx, 0, height * 0.85, 0, height);
          stageGlow.addColorStop(0, 'rgba(244, 63, 94, 0)');
          stageGlow.addColorStop(0.55, 'rgba(251, 191, 36, 0.055)');
          stageGlow.addColorStop(1, 'rgba(34, 211, 238, 0.14)');
          ctx.fillStyle = stageGlow;
          ctx.fillRect(0, height * 0.85, width, height * 0.15);

          // Harmonic golden acoustic string wave near bottom
          ctx.beginPath();
          const waveCols = 48;
          for (let i = 0; i <= waveCols; i++) {
            const wx = (i / waveCols) * width;
            const env = Math.sin((i / waveCols) * Math.PI);
            const wy = height - 18
              + Math.sin(i * 0.45 - now * 0.0065) * 9 * env
              + Math.cos(i * 0.9 + now * 0.009) * 5 * env;
            if (i === 0) ctx.moveTo(wx, wy);
            else ctx.lineTo(wx, wy);
          }
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.42)';
          ctx.lineWidth = 1.35;
          ctx.stroke();

          // Sleek jewel-toned rhythm columns along the bottom rim
          const barSpan = width / barCount;
          const barW = clamp(barSpan * 0.28, 2.5, 6.5);
          for (let i = 0; i < barCount; i++) {
            const centerDist = 1 - Math.abs((i + 0.5) / barCount - 0.5) * 1.35;
            const beat = 0.35
              + 0.35 * Math.abs(Math.sin(now * 0.0052 + i * 0.48))
              + 0.30 * Math.abs(Math.cos(now * 0.0084 - i * 0.75));
            const bh = Math.max(5, (14 + 36 * beat) * clamp(centerDist, 0.35, 1));
            const bx = (i + 0.5) * barSpan;
            const rgb = gemPalette[i % gemPalette.length];

            const bGrad = safeLinearGradient(ctx, bx, height - bh, bx, height);
            bGrad.addColorStop(0, `rgba(${rgb}, 0.68)`);
            bGrad.addColorStop(1, `rgba(${rgb}, 0.12)`);
            ctx.fillStyle = bGrad;
            ctx.fillRect(bx - barW * 0.5, height - bh, barW, bh);

            // Tiny bright jewel cap at top of each bar
            ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.fillRect(bx - barW * 0.5, height - bh - 1.6, barW, 1.6);
          }

          // 2. Rotating jewel-toned 4-point diamond glitter
          for (let i = 0; i < diamonds.length; i++) {
            const d = diamonds[i];
            d.x += (d.vx + Math.sin(now * 0.001 + d.phase) * 0.14) * dt;
            d.y += d.vy * dt;
            d.rot += d.vrot * dt;
            if (d.y < -16) { d.y = height + 14; d.x = (d.x + width * 0.33 + width) % width; }
            if (d.x < -16) d.x = width + 14;
            if (d.x > width + 16) d.x = -14;

            const alpha = 0.28 + 0.56 * (0.5 + 0.5 * Math.sin(now * 0.0026 + d.phase));
            drawDiamondStar(ctx, d.x, d.y, d.r, d.rot, d.rgb, alpha);
          }

          // 3. Flamboyant multi-gem Musical Score firework bursts
          for (let bIdx = 0; bIdx < bursts.length; bIdx++) {
            const b = bursts[bIdx];
            b.progress += b.speed * dt;
            if (b.progress >= 1.28) {
              b.progress = 0;
              b.x = width * (0.14 + Math.random() * 0.72);
              b.y = height * (0.12 + Math.random() * 0.55);
              b.colorIdx = (b.colorIdx + 1) % gemPalette.length;
            }
            if (b.progress > 1.0) continue;

            const p = b.progress;
            const ease = 1 - Math.pow(1 - p, 2.4);
            const alpha = (p < 0.14 ? p / 0.14 : Math.max(0, 1 - (p - 0.14) / 0.86)) * 0.74;
            const rad = 6 + ease * b.maxR;
            const mainRgb = gemPalette[b.colorIdx];
            const altRgb = gemPalette[(b.colorIdx + 1) % gemPalette.length];
            const goldRgb = '251, 191, 36';

            // Double acoustic shockwave rings
            ctx.strokeStyle = `rgba(${mainRgb}, ${fmtA(alpha * 0.42)})`;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.arc(b.x, b.y, rad * 0.90, 0, TWO_PI);
            ctx.stroke();

            ctx.strokeStyle = `rgba(${goldRgb}, ${fmtA(alpha * 0.32)})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.arc(b.x, b.y, rad * 0.58, 0, TWO_PI);
            ctx.stroke();

            for (let r = 0; r < b.rays; r++) {
              const ang = (r / b.rays) * TWO_PI + p * 0.34;
              const px = b.x + Math.cos(ang) * rad;
              const py = b.y + Math.sin(ang) * rad;
              const tx = b.x + Math.cos(ang) * (rad * 0.64);
              const ty = b.y + Math.sin(ang) * (rad * 0.64);
              const useRgb = r % 3 === 0 ? goldRgb : (r % 2 === 0 ? mainRgb : altRgb);

              ctx.strokeStyle = `rgba(${useRgb}, ${fmtA(alpha * 0.88)})`;
              ctx.lineWidth = 1.55;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(tx, ty);
              ctx.lineTo(px, py);
              ctx.stroke();

              drawDiamondStar(ctx, px, py, 2.4, ang, useRgb, alpha * 0.90);
            }
          }
        }
      };
    },

    /**
     * 6. MIST — Hà Trụ Muichiro Tokito (Seventh Form: Obscuring Clouds / Oboro)
     * Multi-layered rolling sea of mist banks across the lower & middle viewport creating
     * ethereal depth, accented by glowing jade-mint motes and slow-drifting mint bamboo leaves.
     */
    mist(w, h) {
      const bankDefs = [
        { yRatio: 0.44, hRatio: 0.14, phase: 0.3, speed: 0.00045, topRgb: '153, 246, 228', botRgb: '45, 212, 191', alpha: 0.065 },
        { yRatio: 0.58, hRatio: 0.16, phase: 1.8, speed: -0.00055, topRgb: '204, 251, 241', botRgb: '20, 184, 166', alpha: 0.080 },
        { yRatio: 0.74, hRatio: 0.18, phase: 3.1, speed: 0.00070, topRgb: '153, 246, 228', botRgb: '13, 148, 136', alpha: 0.115 },
        { yRatio: 0.85, hRatio: 0.20, phase: 4.5, speed: -0.00085, topRgb: '204, 251, 241', botRgb: '15, 118, 110', alpha: 0.150 },
        { yRatio: 0.94, hRatio: 0.18, phase: 5.7, speed: 0.00100, topRgb: '240, 253, 250', botRgb: '17, 94, 89', alpha: 0.185 }
      ];

      const wisps = Array.from({ length: 9 }, (_, i) => ({
        x: ((i * 139) % 100) / 100 * w,
        y: ((i * 73 + 22) % 68 + 24) / 100 * h,
        rx: 150 + (i % 3) * 65,
        ry: 28 + (i % 3) * 14,
        vx: (i % 2 === 0 ? 1 : -1) * (0.22 + (i % 3) * 0.08),
        phase: i * 1.2,
        alpha: 0.075 + (i % 3) * 0.028
      }));

      const leaves = Array.from({ length: 18 }, (_, i) => ({
        x: seededFrac(i, 97, 29) * w,
        y: seededFrac(i, 59, 17) * h,
        r: 3.6 + (i % 3) * 1.1,
        vx: 0.20 + (i % 3) * 0.07,
        vy: 0.14 + (i % 4) * 0.045,
        sway: i * 0.95,
        rot: (i * 0.8) % TWO_PI,
        vrot: 0.005 + (i % 3) * 0.003,
        flip: i * 0.7,
        vflip: 0.012 + (i % 3) * 0.004,
        hue: i % 3 === 0 ? '#99f6e4' : (i % 2 === 0 ? '#5eead4' : '#a7f3d0'),
        alpha: 0.44 + (i % 3) * 0.12
      }));

      const motes = Array.from({ length: 20 }, (_, i) => ({
        x: seededFrac(i, 71, 37) * w,
        y: seededFrac(i, 43, 19) * h,
        r: 1.3 + (i % 3) * 0.65,
        vx: 0.12 + (i % 3) * 0.04,
        vy: -0.05 - (i % 3) * 0.02,
        phase: i * 1.1,
        rgb: i % 2 === 0 ? '153, 246, 228' : '110, 231, 183'
      }));

      return {
        pools: [wisps, leaves, motes],
        drawStatic(ctx, width, height) {
          for (let b = 0; b < bankDefs.length; b++) {
            const bd = bankDefs[b];
            drawRollingMistBank(ctx, width, height, height * bd.yRatio, height * bd.hRatio, bd.phase, 0, 1000, bd.topRgb, bd.botRgb, bd.alpha);
          }
          for (let i = 0; i < motes.length; i++) {
            const m = motes[i];
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.2, m.rgb, 0.36, 2.8);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Mid-ground rolling mist banks (depth layers 0 & 1)
          for (let b = 0; b < 2; b++) {
            const bd = bankDefs[b];
            drawRollingMistBank(ctx, width, height, height * bd.yRatio, height * bd.hRatio, bd.phase, bd.speed, now, bd.topRgb, bd.botRgb, bd.alpha);
          }

          // 2. Drifting jade-mint mist wisps
          for (let i = 0; i < wisps.length; i++) {
            const ws = wisps[i];
            ws.x += ws.vx * dt;
            const curY = ws.y + Math.sin(now * 0.0006 + ws.phase) * 9;
            if (ws.x > width + ws.rx) ws.x = -ws.rx;
            if (ws.x < -ws.rx) ws.x = width + ws.rx;

            ctx.save();
            ctx.translate(ws.x, curY);
            ctx.scale(1, ws.ry / ws.rx);
            const g = safeRadialGradient(ctx, 0, 0, 0, 0, 0, ws.rx);
            g.addColorStop(0, `rgba(204, 251, 241, ${fmtA(ws.alpha)})`);
            g.addColorStop(0.55, `rgba(94, 234, 212, ${fmtA(ws.alpha * 0.48)})`);
            g.addColorStop(1, 'rgba(45, 212, 191, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, ws.rx, 0, TWO_PI);
            ctx.fill();
            ctx.restore();
          }

          // 3. Glowing jade-emerald dew motes suspended in the haze
          for (let i = 0; i < motes.length; i++) {
            const m = motes[i];
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            if (m.x > width + 12) m.x = -12;
            if (m.y < -12) m.y = height + 12;
            const a = 0.22 + 0.38 * (0.5 + 0.5 * Math.sin(now * 0.0014 + m.phase));
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.25, m.rgb, a, 2.8);
          }

          // 4. Lower sea of rolling clouds (Obscuring Clouds / Bình Lưu Vụ)
          for (let b = 2; b < bankDefs.length; b++) {
            const bd = bankDefs[b];
            drawRollingMistBank(ctx, width, height, height * bd.yRatio, height * bd.hRatio, bd.phase, bd.speed, now, bd.topRgb, bd.botRgb, bd.alpha);
          }

          // 5. Slow-drifting mint bamboo leaves emerging through the mist
          for (let i = 0; i < leaves.length; i++) {
            const lf = leaves[i];
            lf.x += (lf.vx + Math.sin(now * 0.00085 + lf.sway) * 0.20) * dt;
            lf.y += lf.vy * dt;
            lf.rot += lf.vrot * dt;
            lf.flip += lf.vflip * dt;
            if (lf.y > height + 18) { lf.y = -16; lf.x = (lf.x + width * 0.41 + width) % width; }
            if (lf.x > width + 18) lf.x = -16;
            drawBambooLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, lf.alpha);
          }
        }
      };
    },

    /**
     * 7. LOVE — Luyến Trụ Mitsuri Kanroji (Flexible Whip-Katana Silk Ribbons & Sakura Vortex)
     * Graceful neon-pink & sakura-mochi mint whip-blade ribbons looping across the air,
     * swirling vortex of heart-notched sakura petals, and sweet blush glowing bubbles.
     */
    love(w, h) {
      const sakuraPalette = ['#f472b6', '#f9a8d4', '#fbcfe8', '#fda4af'];
      const petals = Array.from({ length: 28 }, (_, i) => ({
        x: seededFrac(i, 103, 13) * w,
        y: seededFrac(i, 61, 27) * h,
        r: 3.0 + (i % 4) * 1.0,
        vx: -0.28 - (i % 3) * 0.10,
        vy: 0.24 + (i % 4) * 0.08,
        swirl: i * 0.78,
        rot: (i * 0.65) % TWO_PI,
        vrot: 0.011 + (i % 4) * 0.004,
        flip: i * 0.5,
        vflip: 0.022 + (i % 3) * 0.006,
        hue: sakuraPalette[i % sakuraPalette.length],
        alpha: 0.50 + (i % 4) * 0.11
      }));

      const bubbles = Array.from({ length: 22 }, (_, i) => ({
        x: seededFrac(i, 79, 31) * w,
        y: seededFrac(i, 47, 17) * h,
        r: 2.2 + (i % 4) * 1.35,
        vx: (i % 2 === 0 ? 1 : -1) * 0.12,
        vy: -0.18 - (i % 3) * 0.06,
        phase: i * 1.05,
        isMint: i % 3 === 0
      }));

      const LOVE_NODES = 32;
      const ribbons = [0, 1].map((idx) => ({
        xs: new Float64Array(LOVE_NODES),
        ys: new Float64Array(LOVE_NODES),
        progress: idx === 0 ? 0.15 : 0.65,
        speed: 0.0024 + idx * 0.0003,
        yCenterRatio: idx === 0 ? 0.44 : 0.64,
        dir: idx === 0 ? 1 : -1
      }));

      return {
        pools: [petals, bubbles],
        drawStatic(ctx, width, height) {
          drawRollingMistBank(ctx, width, height, height * 0.91, height * 0.16, 0.5, 0, 1000, '244, 114, 182', '110, 231, 183', 0.12);
          for (let i = 0; i < bubbles.length; i += 2) {
            const b = bubbles[i];
            const rgb = b.isMint ? '110, 231, 183' : '244, 114, 182';
            drawSoftGlowOrb(ctx, b.x, b.y, b.r, rgb, 0.38, 2.6);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Soft rose-blush & sakura-mint pastel glow along bottom edge
          const blushGrad = safeLinearGradient(ctx, 0, height * 0.78, 0, height);
          blushGrad.addColorStop(0, 'rgba(244, 114, 182, 0)');
          blushGrad.addColorStop(0.65, 'rgba(244, 114, 182, 0.08)');
          blushGrad.addColorStop(1, 'rgba(110, 231, 183, 0.12)');
          ctx.fillStyle = blushGrad;
          ctx.fillRect(0, height * 0.78, width, height * 0.22);

          drawRollingMistBank(ctx, width, height, height * 0.90, height * 0.15, 0.8, 0.00075, now, '249, 168, 212', '244, 114, 182', 0.105);

          // 2. Graceful neon-pink & mint silk whip-sword ribbons curving in calligraphic loops
          for (let rIdx = 0; rIdx < ribbons.length; rIdx++) {
            const rb = ribbons[rIdx];
            rb.progress += rb.speed * dt;
            if (rb.progress >= 1.25) {
              rb.progress = 0;
              rb.yCenterRatio = 0.28 + Math.random() * 0.44;
            }
            if (rb.progress <= 1.0) {
              const p = rb.progress;
              const visAlpha = (p < 0.16 ? p / 0.16 : (p > 0.80 ? (1 - p) / 0.20 : 1)) * 0.74;
              const span = width * 0.54;
              const leadX = -span * 0.15 + p * (width + span * 0.55);

              for (let k = 0; k < LOVE_NODES; k++) {
                const u = k / (LOVE_NODES - 1);
                const rawX = leadX - (1 - u) * span;
                const loopX = Math.sin(u * TWO_PI * 1.5 - now * 0.004) * 26;
                const x = rb.dir > 0 ? (rawX + loopX) : (width - rawX - loopX);
                const y = height * rb.yCenterRatio
                  + Math.sin(u * TWO_PI * 1.25 - now * 0.0045 + rIdx * 1.9) * 52
                  + Math.cos(u * TWO_PI * 2.5 + now * 0.003) * 18;
                rb.xs[k] = x;
                rb.ys[k] = y;
              }

              const outerRgb = rIdx === 0 ? '236, 72, 153' : '52, 211, 153';
              const midRgb = rIdx === 0 ? '110, 231, 183' : '244, 114, 182';
              drawBreathingRibbon(
                ctx,
                rb.xs,
                rb.ys,
                LOVE_NODES,
                10.5,
                outerRgb,
                midRgb,
                '255, 241, 242',
                visAlpha,
                { flutter: true, now }
              );
            }
          }

          // 3. Sweet pink & mint glowing bubbles floating upward
          for (let i = 0; i < bubbles.length; i++) {
            const b = bubbles[i];
            b.x += (b.vx + Math.sin(now * 0.0012 + b.phase) * 0.20) * dt;
            b.y += b.vy * dt;
            if (b.x < -14) b.x = width + 14;
            if (b.x > width + 14) b.x = -14;
            if (b.y < -14) b.y = height + 12;
            const alpha = 0.28 + 0.42 * (0.5 + 0.5 * Math.sin(now * 0.0019 + b.phase));
            if (b.r >= 3.4) {
              const rim = b.isMint ? '110, 231, 183' : '249, 168, 212';
              const fill = b.isMint ? '52, 211, 153' : '244, 114, 182';
              drawWaterBubble(ctx, b.x, b.y, b.r, rim, fill, alpha * 0.9);
            } else {
              drawSoftGlowOrb(ctx, b.x, b.y, b.r, b.isMint ? '110, 231, 183' : '244, 114, 182', alpha, 2.8);
            }
          }

          // 4. Swirling breeze of heart-notched sakura petals
          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            p.x += (p.vx + Math.cos(now * 0.0016 + p.swirl) * 0.48) * dt;
            p.y += (p.vy + Math.sin(now * 0.0016 + p.swirl) * 0.24) * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            if (p.y > height + 16) { p.y = -14; p.x = (p.x + width * 0.37 + width) % width; }
            if (p.x < -18) p.x = width + 16;
            drawSakuraPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.hue, p.alpha);
          }
        }
      };
    },

    /**
     * 8. SERPENT — Xà Trụ Obanai Iguro (Slithering Indigo-Emerald Python Ribbons & Heterochromia Trails)
     * Mysterious ground fog, multi-segmented indigo-emerald serpent silk bodies slithering
     * across the night, accompanied by twin gold & turquoise heterochromia eye-light trails.
     */
    serpent(w, h) {
      const SERP_NODES = 28;
      const pythons = Array.from({ length: 4 }, (_, i) => ({
        xs: new Float64Array(SERP_NODES),
        ys: new Float64Array(SERP_NODES),
        baseX: ((i * 29 + 12) % 100) / 100 * w,
        baseY: (0.26 + i * 0.16) * h,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 1.55 + (i % 3) * 0.32,
        amp: 24 + (i % 3) * 8,
        freq: 0.015 + (i % 2) * 0.004,
        phase: i * 1.75,
        halfW: 9.5 + (i % 2) * 3.0
      }));

      const moonMotes = Array.from({ length: 20 }, (_, i) => ({
        x: seededFrac(i, 73, 19) * w,
        y: seededFrac(i, 53, 37) * h,
        r: 1.1 + (i % 3) * 0.55,
        vy: -0.08 - (i % 3) * 0.03,
        phase: i * 0.95,
        rgb: i % 3 === 0 ? '250, 204, 21' : (i % 2 === 0 ? '129, 140, 248' : '45, 212, 191')
      }));

      return {
        pools: [pythons, moonMotes],
        drawStatic(ctx, width, height) {
          drawRollingMistBank(ctx, width, height, height * 0.90, height * 0.16, 1.1, 0, 1000, '99, 102, 241', '16, 185, 129', 0.13);
          for (let i = 0; i < moonMotes.length; i++) {
            const m = moonMotes[i];
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.2, m.rgb, 0.36, 2.5);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Mysterious indigo-emerald ground mist along the bottom
          const fogGrad = safeLinearGradient(ctx, 0, height * 0.78, 0, height);
          fogGrad.addColorStop(0, 'rgba(79, 70, 229, 0)');
          fogGrad.addColorStop(0.62, 'rgba(67, 56, 202, 0.10)');
          fogGrad.addColorStop(1, 'rgba(6, 95, 70, 0.22)');
          ctx.fillStyle = fogGrad;
          ctx.fillRect(0, height * 0.78, width, height * 0.22);

          drawRollingMistBank(ctx, width, height, height * 0.88, height * 0.14, 0.9, 0.0007, now, '129, 140, 248', '16, 185, 129', 0.115);
          drawRollingMistBank(ctx, width, height, height * 0.95, height * 0.12, 2.7, -0.0009, now, '52, 211, 153', '49, 46, 129', 0.125);

          // 2. Moonlit motes
          for (let i = 0; i < moonMotes.length; i++) {
            const m = moonMotes[i];
            m.y += m.vy * dt;
            if (m.y < -10) m.y = height + 10;
            const a = 0.20 + 0.36 * (0.5 + 0.5 * Math.sin(now * 0.0015 + m.phase));
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.2, m.rgb, a, 2.5);
          }

          // 3. Multi-segmented Serpent Breathing silk pythons + heterochromia gold/teal eye trails
          for (let i = 0; i < pythons.length; i++) {
            const s = pythons[i];
            const segStep = 10.5;
            const totalLen = SERP_NODES * segStep;
            s.baseX += s.dir * s.speed * dt;
            if (s.dir > 0 && s.baseX - totalLen > width + 60) {
              s.baseX = -40;
              s.baseY = height * (0.20 + ((i * 0.19 + Math.random() * 0.25) % 0.62));
            }
            if (s.dir < 0 && s.baseX + totalLen < -60) {
              s.baseX = width + 40;
              s.baseY = height * (0.20 + ((i * 0.19 + Math.random() * 0.25) % 0.62));
            }

            for (let k = 0; k < SERP_NODES; k++) {
              // k = 0 is tail, k = SERP_NODES - 1 is serpent head
              const distFromHead = (SERP_NODES - 1 - k) * segStep;
              const px = s.baseX - s.dir * distFromHead;
              const py = s.baseY
                + Math.sin(px * s.freq - now * 0.0038 * s.dir + s.phase) * s.amp
                + Math.cos(px * s.freq * 0.45 + now * 0.0018) * (s.amp * 0.35);
              s.xs[k] = px;
              s.ys[k] = py;
            }

            drawBreathingRibbon(
              ctx,
              s.xs,
              s.ys,
              SERP_NODES,
              s.halfW,
              '67, 56, 202',
              '16, 185, 129',
              '224, 231, 255',
              0.66,
              { now }
            );

            // Subtle scale-vertebrae chevrons along the serpent body
            ctx.save();
            ctx.strokeStyle = 'rgba(167, 243, 208, 0.28)';
            ctx.lineWidth = 0.9;
            for (let k = 4; k < SERP_NODES - 3; k += 3) {
              ctx.beginPath();
              ctx.arc(s.xs[k], s.ys[k], 2.2, 0, TWO_PI);
              ctx.stroke();
            }

            // Heterochromia twin eye-light trails near serpent head (Amber Gold + Turquoise Teal)
            const hIdx = SERP_NODES - 2;
            const hx = s.xs[hIdx];
            const hy = s.ys[hIdx];
            const nx = SCRATCH_NX[hIdx] || 0;
            const ny = SCRATCH_NY[hIdx] || 1;
            const eyeOff = 3.8;

            // Gold right eye streak & glow
            ctx.beginPath();
            for (let t = 0; t < 6; t++) {
              const idx = hIdx - t;
              const ex = s.xs[idx] + SCRATCH_NX[idx] * eyeOff;
              const ey = s.ys[idx] + SCRATCH_NY[idx] * eyeOff;
              if (t === 0) ctx.moveTo(ex, ey);
              else ctx.lineTo(ex, ey);
            }
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.78)';
            ctx.lineWidth = 1.35;
            ctx.stroke();
            drawSoftGlowOrb(ctx, hx + nx * eyeOff, hy + ny * eyeOff, 1.9, '250, 204, 21', 0.92, 2.5);

            // Turquoise left eye streak & glow
            ctx.beginPath();
            for (let t = 0; t < 6; t++) {
              const idx = hIdx - t;
              const ex = s.xs[idx] - SCRATCH_NX[idx] * eyeOff;
              const ey = s.ys[idx] - SCRATCH_NY[idx] * eyeOff;
              if (t === 0) ctx.moveTo(ex, ey);
              else ctx.lineTo(ex, ey);
            }
            ctx.strokeStyle = 'rgba(45, 212, 191, 0.78)';
            ctx.lineWidth = 1.35;
            ctx.stroke();
            drawSoftGlowOrb(ctx, hx - nx * eyeOff, hy - ny * eyeOff, 1.9, '45, 212, 191', 0.92, 2.5);
            ctx.restore();
          }
        }
      };
    },

    /**
     * 9. WIND — Phong Trụ Sanemi Shinazugawa (Emerald Cyclone Vortex & Razor Wind Blade Slashes)
     * Swirling emerald wind vortex churning at the bottom, razor-sharp crescent wind-blade
     * slashes tearing diagonally across the sky, and green maple leaves swept in the gale.
     */
    wind(w, h) {
      const cyclones = [
        { xRatio: 0.28, rings: 5, baseRx: 95, phase: 0 },
        { xRatio: 0.72, rings: 5, baseRx: 110, phase: 2.1 }
      ];

      const arcs = Array.from({ length: 9 }, (_, i) => ({
        x: seededFrac(i, 127, 15) * w,
        y: seededFrac(i, 67, 21) * h,
        vx: 5.4 + (i % 3) * 1.5,
        vy: -2.3 - (i % 3) * 0.75,
        length: 78 + (i % 4) * 28,
        bend: 16 + (i % 3) * 7,
        thickness: 2.8 + (i % 3) * 0.95,
        angle: -24 * DEG + (i % 3 - 1) * 8 * DEG,
        life: (i * 7) % 44,
        maxLife: 44 + (i % 3) * 8,
        peakAlpha: 0.64 + (i % 3) * 0.10,
        hasClawTwin: i % 2 === 0
      }));

      const leaves = Array.from({ length: 26 }, (_, i) => ({
        x: seededFrac(i, 89, 11) * w,
        y: seededFrac(i, 53, 33) * h,
        r: 3.2 + (i % 3) * 1.05,
        vx: 2.1 + (i % 4) * 0.58,
        vy: -0.65 + (i % 3) * 0.28,
        rot: (i * 1.1) % TWO_PI,
        vrot: 0.038 + (i % 4) * 0.014,
        flip: i * 0.8,
        vflip: 0.045 + (i % 3) * 0.012,
        hue: i % 3 === 0 ? '#6ee7b7' : (i % 2 === 0 ? '#34d399' : '#10b981'),
        alpha: 0.56 + (i % 3) * 0.14
      }));

      return {
        pools: [arcs, leaves],
        drawStatic(ctx, width, height) {
          for (let i = 0; i < 3; i++) {
            const a = { ...arcs[i], life: 15, maxLife: 44, peakAlpha: 0.38 };
            drawCrescentArc(ctx, a, '16, 185, 129', '209, 250, 229', false);
          }
          for (let i = 0; i < leaves.length; i += 2) {
            const lf = leaves[i];
            drawMapleLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, 0.45);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Emerald gale ground glow & churning cyclone vortices at the bottom
          const galeGrad = safeLinearGradient(ctx, 0, height * 0.78, 0, height);
          galeGrad.addColorStop(0, 'rgba(16, 185, 129, 0)');
          galeGrad.addColorStop(0.65, 'rgba(16, 185, 129, 0.085)');
          galeGrad.addColorStop(1, 'rgba(5, 150, 105, 0.18)');
          ctx.fillStyle = galeGrad;
          ctx.fillRect(0, height * 0.78, width, height * 0.22);

          for (let c = 0; c < cyclones.length; c++) {
            const cy = cyclones[c];
            const cx = width * cy.xRatio + Math.sin(now * 0.0011 + cy.phase) * 38;
            for (let r = 0; r < cy.rings; r++) {
              const ry = height - 10 - r * (height * 0.032);
              const rx = cy.baseRx * (0.52 + r * 0.18);
              const spin = now * 0.007 + r * 0.9 + cy.phase;
              ctx.save();
              ctx.translate(cx + Math.sin(spin * 0.5) * (r * 4), ry);
              ctx.scale(1, 0.22);
              ctx.strokeStyle = `rgba(110, 231, 183, ${fmtA(0.32 - r * 0.045)})`;
              ctx.lineWidth = 1.5 - r * 0.15;
              ctx.beginPath();
              ctx.arc(0, 0, rx, spin, spin + Math.PI * 1.45);
              ctx.stroke();
              ctx.restore();
            }
          }

          // Sweeping horizontal wind-shear lines near the floor
          ctx.save();
          ctx.strokeStyle = 'rgba(167, 243, 208, 0.22)';
          ctx.lineWidth = 1.1;
          for (let s = 0; s < 5; s++) {
            const sx = ((now * (0.45 + s * 0.08) + s * 230) % (width + 240)) - 120;
            const sy = height * (0.83 + s * 0.032);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.quadraticCurveTo(sx + 65, sy - 10, sx + 130, sy - 3);
            ctx.stroke();
          }
          ctx.restore();

          // 2. Razor-sharp emerald Wind Breathing crescent slashes
          for (let i = 0; i < arcs.length; i++) {
            const a = arcs[i];
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.life += dt;
            if (a.life >= a.maxLife || a.x > width + 110 || a.y < -110) {
              a.life = 0;
              a.x = width * (-0.08 + Math.random() * 0.76);
              a.y = height * (0.24 + Math.random() * 0.74);
              a.angle = (-26 + (Math.random() * 18 - 9)) * DEG;
            }
            drawCrescentArc(ctx, a, '52, 211, 153', '236, 253, 245', false);
            if (a.hasClawTwin) {
              const twin = {
                x: a.x - 14,
                y: a.y + 12,
                length: a.length * 0.82,
                bend: a.bend * 0.86,
                thickness: a.thickness * 0.78,
                angle: a.angle + 4 * DEG,
                life: a.life,
                maxLife: a.maxLife,
                peakAlpha: a.peakAlpha * 0.72
              };
              drawCrescentArc(ctx, twin, '16, 185, 129', '209, 250, 229', false);
            }
          }

          // 3. Green maple leaves whipped rapidly along the windstream
          for (let i = 0; i < leaves.length; i++) {
            const lf = leaves[i];
            lf.x += lf.vx * dt;
            lf.y += (lf.vy + Math.sin(now * 0.0034 + i) * 0.42) * dt;
            lf.rot += lf.vrot * dt;
            lf.flip += lf.vflip * dt;
            if (lf.x > width + 22) { lf.x = -20; lf.y = (lf.y + height * 0.43 + height) % height; }
            if (lf.y < -22) lf.y = height + 18;
            if (lf.y > height + 22) lf.y = -18;
            drawMapleLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, lf.alpha);
          }
        }
      };
    },

    /**
     * 10. STONE — Nham Trụ Gyomei Himejima (Solemn Amber Aura, Seismic Ripples, Prayer Beads & Ginkgo)
     * Warm amber-gold spiritual aura at the bottom, deep seismic ground ripples expanding
     * calmly, golden Bodhi prayer beads ascending vertically in solemn alignment, and autumn ginkgo rain.
     */
    stone(w, h) {
      const seismicRipples = Array.from({ length: 5 }, (_, i) => ({
        x: ((i * 19 + 18) % 76 + 12) / 100 * w,
        y: (0.87 + (i % 3) * 0.042) * h,
        progress: i / 5,
        speed: 0.0026 + (i % 2) * 0.0005,
        maxR: 68 + (i % 3) * 28
      }));

      const beads = Array.from({ length: 20 }, (_, i) => ({
        x: ((i * 53 + 7) % 92 + 4) / 100 * w,
        y: seededFrac(i, 47, 41) * h,
        r: 2.2 + (i % 3) * 0.95,
        vy: -0.22 - (i % 4) * 0.055,
        phase: i * 1.2,
        rgb: i % 2 === 0 ? '251, 191, 36' : '245, 158, 11'
      }));

      const ginkgos = Array.from({ length: 22 }, (_, i) => ({
        x: seededFrac(i, 103, 19) * w,
        y: seededFrac(i, 67, 13) * h,
        r: 4.0 + (i % 4) * 1.15,
        vx: -0.14 - (i % 3) * 0.06,
        vy: 0.24 + (i % 4) * 0.07,
        sway: i * 0.9,
        rot: (i * 0.75) % TWO_PI,
        vrot: 0.006 + (i % 3) * 0.003,
        flip: i * 0.65,
        vflip: 0.014 + (i % 3) * 0.005,
        hue: i % 3 === 0 ? '#fde047' : (i % 2 === 0 ? '#fbbf24' : '#d97706'),
        alpha: 0.48 + (i % 3) * 0.14
      }));

      return {
        pools: [seismicRipples, beads, ginkgos],
        drawStatic(ctx, width, height) {
          const groundAura = safeLinearGradient(ctx, 0, height * 0.78, 0, height);
          groundAura.addColorStop(0, 'rgba(217, 119, 6, 0)');
          groundAura.addColorStop(1, 'rgba(245, 158, 11, 0.18)');
          ctx.fillStyle = groundAura;
          ctx.fillRect(0, height * 0.78, width, height * 0.22);
          for (let i = 0; i < beads.length; i++) {
            const b = beads[i];
            drawSoftGlowOrb(ctx, b.x, b.y, b.r * 1.2, b.rgb, 0.42, 2.8);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Warm solemn amber-gold ground aura
          const auraH = height * 0.24;
          const auraGrad = safeLinearGradient(ctx, 0, height - auraH, 0, height);
          auraGrad.addColorStop(0, 'rgba(217, 119, 6, 0)');
          auraGrad.addColorStop(0.58, 'rgba(245, 158, 11, 0.09)');
          auraGrad.addColorStop(1, 'rgba(180, 83, 9, 0.22)');
          ctx.fillStyle = auraGrad;
          ctx.fillRect(0, height - auraH, width, auraH);

          // 2. Deep seismic ground shockwave rings expanding with solemn weight
          for (let i = 0; i < seismicRipples.length; i++) {
            const sr = seismicRipples[i];
            sr.progress += sr.speed * dt;
            if (sr.progress >= 1) {
              sr.progress = 0;
              sr.x = width * (0.14 + Math.random() * 0.72);
              sr.y = height * (0.86 + Math.random() * 0.11);
            }
            const p = sr.progress;
            const alpha = (p < 0.18 ? p / 0.18 : 1 - (p - 0.18) / 0.82) * 0.46;
            drawEllipticalRipple(ctx, sr.x, sr.y, 6 + p * sr.maxR, 0.24, '251, 191, 36', '254, 243, 199', alpha, 1.5);
          }

          // 3. Sacred Bodhi prayer beads rising straight & true
          for (let i = 0; i < beads.length; i++) {
            const b = beads[i];
            b.y += b.vy * dt; // Strictly straight solemn vertical ascent
            if (b.y < -16) {
              b.y = height + 12;
            }
            const alpha = 0.34 + 0.44 * (0.5 + 0.5 * Math.sin(now * 0.0015 + b.phase));

            // Vertical spiritual light thread beneath bead
            ctx.strokeStyle = `rgba(251, 191, 36, ${fmtA(alpha * 0.28)})`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y + b.r);
            ctx.lineTo(b.x, b.y + b.r * 6.5);
            ctx.stroke();

            drawSoftGlowOrb(ctx, b.x, b.y, b.r * 1.25, b.rgb, alpha, 2.9);
            // Crisp prayer-bead rim & specular highlight
            ctx.strokeStyle = `rgba(254, 243, 199, ${fmtA(alpha * 0.75)})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r * 1.35, 0, TWO_PI);
            ctx.stroke();
          }

          // 4. Autumn golden ginkgo rain
          for (let i = 0; i < ginkgos.length; i++) {
            const g = ginkgos[i];
            g.x += (g.vx + Math.sin(now * 0.0009 + g.sway) * 0.22) * dt;
            g.y += g.vy * dt;
            g.rot += g.vrot * dt;
            g.flip += g.vflip * dt;
            if (g.y > height + 18) { g.y = -16; g.x = (g.x + width * 0.37 + width) % width; }
            if (g.x < -18) g.x = width + 16;
            drawGinkgoLeaf(ctx, g.x, g.y, g.r, g.rot, g.flip, g.hue, g.alpha);
          }
        }
      };
    },

    /**
     * 11. SUN & WATER — Tanjiro Kamado (Intertwining Hinokami Kagura × Water Breathing Dual Helix)
     * Two companion Breathing ribbons spiraling around each other in harmony: a blazing crimson-orange
     * Hinokami Kagura Sun ribbon shedding fire sparks and an azure Water Breathing ribbon with white sea-foam!
     */
    sun_water(w, h) {
      const bottomWaves = [
        {
          yRatio: 0.895, amp1: 5.5, amp2: 2.6, freq1: 0.007, freq2: 0.013, spd1: 0.0016, spd2: 0.0011, phase: 0.6,
          topRgb: '14, 116, 144', topAlpha: 0.22, midRgb: '12, 74, 110', midAlpha: 0.34, botRgb: '15, 23, 42', botAlpha: 0.50,
          crestRgb: '125, 211, 252', crestAlpha: 0.42, crestWidth: 1.25, sparkles: 5
        },
        {
          yRatio: 0.945, amp1: 6.5, amp2: 3.2, freq1: 0.006, freq2: 0.011, spd1: -0.0019, spd2: 0.0013, phase: 2.3,
          topRgb: '234, 88, 12', topAlpha: 0.16, midRgb: '3, 105, 161', midAlpha: 0.34, botRgb: '8, 47, 73', botAlpha: 0.56,
          crestRgb: '253, 224, 71', crestAlpha: 0.46, crestWidth: 1.35, sparkles: 6
        }
      ];

      const DUAL_NODES = 30;
      const sunXs = new Float64Array(DUAL_NODES);
      const sunYs = new Float64Array(DUAL_NODES);
      const watXs = new Float64Array(DUAL_NODES);
      const watYs = new Float64Array(DUAL_NODES);
      const dualState = { progress: 0.18, speed: 0.0025, yBaseRatio: 0.52, slopeRatio: -0.18 };

      const sunEmbers = Array.from({ length: 20 }, (_, i) => ({
        x: seededFrac(i, 107, 13) * w,
        y: seededFrac(i, 61, 29) * h,
        r: 1.5 + (i % 3) * 0.85,
        vx: 0.20 + (i % 3) * 0.08,
        vy: -0.48 - (i % 4) * 0.16,
        phase: i * 0.9,
        rgb: i % 3 === 0 ? '251, 191, 36' : (i % 2 === 0 ? '249, 115, 22' : '239, 68, 68')
      }));

      const waterBubbles = Array.from({ length: 18 }, (_, i) => ({
        x: seededFrac(i, 83, 37) * w,
        y: seededFrac(i, 53, 19) * h,
        r: 2.2 + (i % 4) * 1.35,
        vx: 0.26 + (i % 3) * 0.10,
        vy: -0.20 - (i % 3) * 0.07,
        phase: i * 1.15
      }));

      return {
        pools: [sunEmbers, waterBubbles],
        drawStatic(ctx, width, height) {
          drawLayeredWaterSurface(ctx, width, height, 1000, bottomWaves, 0.65, '254, 243, 199');
          for (let i = 0; i < sunEmbers.length; i += 2) {
            drawSoftGlowOrb(ctx, sunEmbers[i].x, sunEmbers[i].y, sunEmbers[i].r, sunEmbers[i].rgb, 0.44, 2.5);
          }
          for (let i = 0; i < waterBubbles.length; i += 2) {
            drawWaterBubble(ctx, waterBubbles[i].x, waterBubbles[i].y, waterBubbles[i].r, '125, 211, 252', '14, 165, 233', 0.48);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Harmonized Sun & Water horizon glow + waves at bottom
          const horizonGrad = safeLinearGradient(ctx, 0, height * 0.78, width, height);
          horizonGrad.addColorStop(0, 'rgba(14, 165, 233, 0.08)');
          horizonGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.05)');
          horizonGrad.addColorStop(1, 'rgba(249, 115, 22, 0.14)');
          ctx.fillStyle = horizonGrad;
          ctx.fillRect(0, height * 0.78, width, height * 0.22);

          drawLayeredWaterSurface(ctx, width, height, now, bottomWaves, 0.65, '254, 243, 199');

          // 2. Intertwining Dual Breathing Ribbons (Hinokami Kagura × Water Breathing)
          dualState.progress += dualState.speed * dt;
          if (dualState.progress >= 1.24) {
            dualState.progress = 0;
            dualState.yBaseRatio = 0.34 + Math.random() * 0.34;
            dualState.slopeRatio = -0.26 + Math.random() * 0.52;
          }
          if (dualState.progress <= 1.0) {
            const p = dualState.progress;
            const visAlpha = (p < 0.16 ? p / 0.16 : (p > 0.80 ? (1 - p) / 0.20 : 1)) * 0.76;
            const span = width * 0.60;
            const headX = -span * 0.15 + p * (width + span * 0.55);

            for (let k = 0; k < DUAL_NODES; k++) {
              const u = k / (DUAL_NODES - 1);
              const cx = headX - (1 - u) * span;
              const cy = height * dualState.yBaseRatio
                + ((cx / Math.max(320, width)) - 0.5) * height * dualState.slopeRatio
                + Math.sin(u * 4.2 - now * 0.0032) * 26;

              const helixOffset = Math.sin(u * TWO_PI * 1.65 - now * 0.0055) * 24;
              sunXs[k] = cx;
              sunYs[k] = cy + helixOffset;
              watXs[k] = cx;
              watYs[k] = cy - helixOffset;
            }

            // Draw back-crossing ribbon first based on current phase for natural depth feel
            const sunInFront = Math.cos(now * 0.0055) >= 0;
            if (!sunInFront) {
              drawBreathingRibbon(ctx, sunXs, sunYs, DUAL_NODES, 13.5, '220, 38, 38', '249, 115, 22', '254, 249, 195', visAlpha, { flutter: true, now });
              drawBreathingRibbon(ctx, watXs, watYs, DUAL_NODES, 13.5, '3, 105, 161', '34, 211, 238', '240, 249, 255', visAlpha, { ukiyoeFoam: true, now });
            } else {
              drawBreathingRibbon(ctx, watXs, watYs, DUAL_NODES, 13.5, '3, 105, 161', '34, 211, 238', '240, 249, 255', visAlpha, { ukiyoeFoam: true, now });
              drawBreathingRibbon(ctx, sunXs, sunYs, DUAL_NODES, 13.5, '220, 38, 38', '249, 115, 22', '254, 249, 195', visAlpha, { flutter: true, now });
            }

            // Sparks flying off the Hinokami Kagura ribbon
            for (let k = 5; k < DUAL_NODES - 2; k += 5) {
              const sx = sunXs[k] + Math.sin(now * 0.008 + k) * 8;
              const sy = sunYs[k] - 8 - (k % 3) * 4;
              drawSoftGlowOrb(ctx, sx, sy, 1.8, '253, 224, 71', visAlpha * 0.85, 2.2);
            }
          }

          // 3. Rising Hinokami Kagura crimson-amber embers
          for (let i = 0; i < sunEmbers.length; i++) {
            const e = sunEmbers[i];
            const dx = e.vx + Math.sin(now * 0.0018 + e.phase) * 0.28;
            e.x += dx * dt;
            e.y += e.vy * dt;
            if (e.y < -16) { e.y = height + 14; e.x = (e.x + width * 0.41 + width) % width; }
            if (e.x > width + 16) e.x = -14;

            const alpha = 0.36 + 0.48 * (0.5 + 0.5 * Math.sin(now * 0.0034 + e.phase));
            ctx.strokeStyle = `rgba(${e.rgb}, ${fmtA(alpha * 0.76)})`;
            ctx.lineWidth = e.r * 0.95;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(e.x - dx * 4.5, e.y - e.vy * 4.5);
            ctx.stroke();
            drawSoftGlowOrb(ctx, e.x, e.y, e.r, '254, 243, 199', alpha, 2.4);
          }

          // 4. Rising translucent Water Breathing bubbles
          for (let i = 0; i < waterBubbles.length; i++) {
            const d = waterBubbles[i];
            d.x += (d.vx + Math.cos(now * 0.0015 + d.phase) * 0.22) * dt;
            d.y += d.vy * dt;
            if (d.x > width + 16) d.x = -14;
            if (d.y < -16) { d.y = height * 0.92; d.x = (d.x + width * 0.33 + width) % width; }
            const alpha = 0.38 + 0.38 * (0.5 + 0.5 * Math.sin(now * 0.0018 + d.phase));
            drawWaterBubble(ctx, d.x, d.y, d.r, '125, 211, 252', '14, 165, 233', alpha);
          }
        }
      };
    },

    /**
     * 12. NEZUKO — Nezuko Kamado (Exploding Blood / Bakuketsu Pink-Crimson Flames, Bamboo & Asanoha)
     * Mystical lotus-pink & crimson Exploding Blood flame clusters flickering along the bottom,
     * floating rose flame wisps, fresh green bamboo leaves, and faint rotating Asanoha stars.
     */
    nezuko(w, h) {
      const bloodFlames = Array.from({ length: 18 }, (_, i) => ({
        x: ((i + 0.5) / 18) * w,
        w: Math.max(26, w / 20) * (0.85 + (i % 3) * 0.24),
        baseH: 28 + (i % 4) * 15,
        phase: i * 1.37,
        spd: 0.0038 + (i % 3) * 0.001
      }));

      const asanohaStars = Array.from({ length: 8 }, (_, i) => ({
        x: ((i * 131 + 14) % 86 + 7) / 100 * w,
        y: ((i * 79 + 18) % 72 + 12) / 100 * h,
        r: 18 + (i % 3) * 10,
        rot: (i * 0.5) % TWO_PI,
        vrot: (i % 2 === 0 ? 1 : -1) * 0.0018,
        phase: i * 1.4
      }));

      const pinkWisps = Array.from({ length: 24 }, (_, i) => ({
        x: seededFrac(i, 97, 17) * w,
        y: seededFrac(i, 59, 23) * h,
        r: 1.8 + (i % 4) * 0.95,
        vx: (i % 2 === 0 ? 1 : -1) * 0.13,
        vy: -0.32 - (i % 4) * 0.10,
        phase: i * 1.05,
        rgb: i % 3 === 0 ? '253, 164, 175' : (i % 2 === 0 ? '244, 114, 182' : '225, 29, 72')
      }));

      const bambooLeaves = Array.from({ length: 15 }, (_, i) => ({
        x: seededFrac(i, 113, 31) * w,
        y: seededFrac(i, 67, 11) * h,
        r: 3.4 + (i % 3) * 1.0,
        vx: -0.22 - (i % 3) * 0.07,
        vy: 0.22 + (i % 3) * 0.06,
        sway: i * 0.85,
        rot: (i * 0.7) % TWO_PI,
        vrot: 0.008 + (i % 3) * 0.003,
        flip: i * 0.6,
        vflip: 0.016 + (i % 3) * 0.005,
        hue: i % 2 === 0 ? '#4ade80' : '#86efac',
        alpha: 0.52 + (i % 3) * 0.12
      }));

      return {
        pools: [bloodFlames, asanohaStars, pinkWisps, bambooLeaves],
        onResize(nw) {
          for (let i = 0; i < bloodFlames.length; i++) {
            bloodFlames[i].w = Math.max(26, nw / 20) * (0.85 + (i % 3) * 0.24);
          }
        },
        drawStatic(ctx, width, height) {
          for (let i = 0; i < asanohaStars.length; i += 2) {
            const st = asanohaStars[i];
            drawAsanohaStar(ctx, st.x, st.y, st.r, st.rot, '249, 168, 212', 0.12);
          }
          for (let i = 0; i < pinkWisps.length; i += 2) {
            const f = pinkWisps[i];
            drawSoftGlowOrb(ctx, f.x, f.y, f.r * 1.25, f.rgb, 0.44, 2.8);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Faint ethereal Japanese Asanoha hemp-leaf geometric motifs in background
          for (let i = 0; i < asanohaStars.length; i++) {
            const st = asanohaStars[i];
            st.rot += st.vrot * dt;
            const pulse = 0.06 + 0.09 * (0.5 + 0.5 * Math.sin(now * 0.0012 + st.phase));
            drawAsanohaStar(ctx, st.x, st.y, st.r, st.rot, '249, 168, 212', pulse);
          }

          // 2. Mystical Exploding Blood (Bakuketsu) crimson-pink glow & flickering flames at bottom
          const bdaGrad = safeLinearGradient(ctx, 0, height * 0.78, 0, height);
          bdaGrad.addColorStop(0, 'rgba(244, 114, 182, 0)');
          bdaGrad.addColorStop(0.62, 'rgba(225, 29, 72, 0.10)');
          bdaGrad.addColorStop(1, 'rgba(236, 72, 153, 0.22)');
          ctx.fillStyle = bdaGrad;
          ctx.fillRect(0, height * 0.78, width, height * 0.22);

          for (let i = 0; i < bloodFlames.length; i++) {
            const bf = bloodFlames[i];
            const pulse = 0.70 + 0.30 * Math.sin(now * bf.spd + bf.phase);
            const sway = Math.sin(now * 0.0028 + bf.phase * 1.5) * 10;
            drawBottomFlameTongue(
              ctx,
              bf.x,
              height + 4,
              bf.w,
              bf.baseH * pulse,
              sway,
              '190, 18, 60',
              '244, 114, 182',
              '255, 228, 230',
              0.45 * pulse
            );
          }

          // 3. Floating lotus-pink flame blossoms
          for (let i = 0; i < pinkWisps.length; i++) {
            const f = pinkWisps[i];
            f.x += (f.vx + Math.sin(now * 0.0015 + f.phase) * 0.22) * dt;
            f.y += f.vy * dt;
            if (f.y < -16) { f.y = height + 10; f.x = (f.x + width * 0.37 + width) % width; }
            if (f.x < -14) f.x = width + 14;
            if (f.x > width + 14) f.x = -14;

            const alpha = 0.30 + 0.48 * (0.5 + 0.5 * Math.sin(now * 0.0022 + f.phase));
            drawSoftGlowOrb(ctx, f.x, f.y, f.r * 1.35, f.rgb, alpha, 3.0);
            drawSoftGlowOrb(ctx, f.x, f.y - f.r * 0.35, f.r * 0.58, '255, 241, 242', alpha * 0.88, 1.5);
          }

          // 4. Fresh green bamboo leaves drifting gently
          for (let i = 0; i < bambooLeaves.length; i++) {
            const lf = bambooLeaves[i];
            lf.x += (lf.vx + Math.sin(now * 0.001 + lf.sway) * 0.22) * dt;
            lf.y += lf.vy * dt;
            lf.rot += lf.vrot * dt;
            lf.flip += lf.vflip * dt;
            if (lf.y > height + 16) { lf.y = -14; lf.x = (lf.x + width * 0.43 + width) % width; }
            if (lf.x < -16) lf.x = width + 14;
            drawBambooLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, lf.alpha);
          }
        }
      };
    },

    /**
     * 13. THUNDER — Zenitsu Agatsuma (Ground Electric Arcs & Thunderclap and Flash Afterimage)
     * Crackling gold & ice-blue electric arcs snapping along the bottom rim, dancing charge
     * sparks, and crisp branching Hekireki Issen lightning bolts with lingering golden afterimages.
     */
    thunder(w, h) {
      const groundArcs = Array.from({ length: 6 }, (_, i) => ({
        x: ((i + 0.5) / 6) * w,
        span: 65 + (i % 3) * 28,
        life: (i * 5) % 16,
        maxLife: 12 + (i % 3) * 5,
        iceBlue: i % 2 === 1,
        seed: i * 31
      }));

      const sparks = Array.from({ length: 26 }, (_, i) => ({
        x: seededFrac(i, 101, 23) * w,
        y: seededFrac(i, 67, 17) * h,
        r: 1.3 + (i % 3) * 0.65,
        vx: (i % 2 === 0 ? 1 : -1) * (0.22 + (i % 3) * 0.09),
        vy: -0.16 - (i % 3) * 0.07,
        phase: i * 1.25,
        rgb: i % 4 === 0 ? '125, 211, 252' : (i % 2 === 0 ? '250, 204, 21' : '254, 240, 138')
      }));

      let bolt = null;
      let nextBoltAt = 1600;

      function createBolt(width, height) {
        const fromLeft = Math.random() < 0.55;
        const startX = fromLeft ? width * (0.06 + Math.random() * 0.25) : width * (0.68 + Math.random() * 0.26);
        const startY = height * (0.08 + Math.random() * 0.26);
        const endX = fromLeft ? width * (0.66 + Math.random() * 0.28) : width * (0.06 + Math.random() * 0.28);
        const endY = height * (0.56 + Math.random() * 0.30);
        const segs = 14;
        const pts = [];
        const branches = [];

        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const jitter = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 38;
          const px = startX + (endX - startX) * t + jitter * 0.45;
          const py = startY + (endY - startY) * t + jitter;
          pts.push({ x: px, y: py });

          if (i === 3 || i === 7 || i === 10) {
            const bPts = [{ x: px, y: py }];
            let bx = px;
            let by = py;
            for (let b = 1; b <= 4; b++) {
              bx += (endX - startX) * 0.065 + (Math.random() - 0.5) * 22;
              by += (endY - startY) * 0.075 + (Math.random() - 0.3) * 22;
              bPts.push({ x: bx, y: by });
            }
            branches.push({ pts: bPts, ice: i === 7 });
          }
        }
        // maxLife = 44 gives crisp initial strike + smooth lingering golden afterimage!
        return { pts, branches, life: 0, maxLife: 44 };
      }

      function drawPolyline(ctx, pts, lw, rgba) {
        if (!pts || pts.length < 2) return;
        ctx.strokeStyle = rgba;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) {
          ctx.lineTo(pts[k].x, pts[k].y);
        }
        ctx.stroke();
      }

      return {
        pools: [groundArcs, sparks],
        drawStatic(ctx, width, height) {
          const baseGrad = safeLinearGradient(ctx, 0, height * 0.85, 0, height);
          baseGrad.addColorStop(0, 'rgba(250, 204, 21, 0)');
          baseGrad.addColorStop(1, 'rgba(250, 204, 21, 0.14)');
          ctx.fillStyle = baseGrad;
          ctx.fillRect(0, height * 0.85, width, height * 0.15);
          for (let i = 0; i < sparks.length; i++) {
            const s = sparks[i];
            drawSoftGlowOrb(ctx, s.x, s.y, s.r * 1.2, s.rgb, 0.38, 2.5);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Charged golden-blue static field & crackling electric arcs along bottom edge
          const fieldGrad = safeLinearGradient(ctx, 0, height * 0.84, 0, height);
          fieldGrad.addColorStop(0, 'rgba(250, 204, 21, 0)');
          fieldGrad.addColorStop(0.65, 'rgba(56, 189, 248, 0.06)');
          fieldGrad.addColorStop(1, 'rgba(250, 204, 21, 0.15)');
          ctx.fillStyle = fieldGrad;
          ctx.fillRect(0, height * 0.84, width, height * 0.16);

          ctx.save();
          for (let i = 0; i < groundArcs.length; i++) {
            const ga = groundArcs[i];
            ga.life += dt;
            if (ga.life >= ga.maxLife) {
              ga.life = 0;
              ga.x = width * (0.06 + Math.random() * 0.88);
              ga.iceBlue = Math.random() < 0.42;
              ga.seed = Math.floor(Math.random() * 1000);
            }
            const p = ga.life / ga.maxLife;
            const a = (p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75) * 0.78;
            const segs = 7;
            const startX = ga.x - ga.span * 0.5;
            const baseY = height - 8 - (i % 3) * 7;
            const mainRgb = ga.iceBlue ? '56, 189, 248' : '250, 204, 21';

            ctx.beginPath();
            for (let k = 0; k <= segs; k++) {
              const px = startX + (k / segs) * ga.span;
              const jag = (k === 0 || k === segs)
                ? 0
                : Math.sin(k * 3.7 + ga.seed + now * 0.03) * 11;
              const py = baseY - Math.abs(jag) * 0.7 + jag * 0.35;
              if (k === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = `rgba(${mainRgb}, ${fmtA(a * 0.55)})`;
            ctx.lineWidth = 2.6;
            ctx.stroke();
            ctx.strokeStyle = `rgba(255, 255, 255, ${fmtA(a * 0.90)})`;
            ctx.lineWidth = 1.0;
            ctx.stroke();
          }
          ctx.restore();

          // 2. Jumping golden & ice-blue charge particles
          for (let i = 0; i < sparks.length; i++) {
            const s = sparks[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            if (s.x < -12) s.x = width + 12;
            if (s.x > width + 12) s.x = -12;
            if (s.y < -12) s.y = height + 12;

            const pulse = 0.5 + 0.5 * Math.sin(now * 0.0042 + s.phase);
            const alpha = 0.26 + 0.54 * pulse;
            drawSoftGlowOrb(ctx, s.x, s.y, s.r * 1.15, s.rgb, alpha, 2.6);

            if (pulse > 0.84) {
              const ang = (now * 0.012 + s.phase) % TWO_PI;
              const mx = s.x + Math.cos(ang) * 6.0;
              const my = s.y + Math.sin(ang) * 6.0;
              const ex = mx + Math.cos(ang + 0.9) * 5.5;
              const ey = my + Math.sin(ang + 0.9) * 5.5;
              ctx.strokeStyle = `rgba(${s.rgb}, ${fmtA(alpha * 0.85)})`;
              ctx.lineWidth = 0.95;
              ctx.beginPath();
              ctx.moveTo(s.x, s.y);
              ctx.lineTo(mx, my);
              ctx.lineTo(ex, ey);
              ctx.stroke();
            }
          }

          // 3. Hekireki Issen (Thunderclap and Flash) bolt + golden afterimage trail
          if (!bolt && now >= nextBoltAt) {
            bolt = createBolt(width, height);
          }
          if (bolt) {
            bolt.life += dt;
            const p = clamp(bolt.life / bolt.maxLife, 0, 1);
            // Strike phase (0..0.32) -> Golden afterimage decay (0.32..1.0)
            const strikeAlpha = p < 0.32 ? (p < 0.10 ? p / 0.10 : 1 - (p - 0.10) / 0.22) : 0;
            const afterAlpha = p < 0.15 ? p / 0.15 : Math.pow(1 - (p - 0.15) / 0.85, 1.6);

            ctx.save();
            // Lingering warm golden afterimage ribbon + glowing nodes
            drawPolyline(ctx, bolt.pts, 9.5, `rgba(250, 204, 21, ${fmtA(afterAlpha * 0.18)})`);
            drawPolyline(ctx, bolt.pts, 3.6, `rgba(251, 191, 36, ${fmtA(afterAlpha * 0.56)})`);

            if (strikeAlpha > 0.01) {
              drawPolyline(ctx, bolt.pts, 1.5, `rgba(255, 255, 255, ${fmtA(strikeAlpha * 0.96)})`);
            }

            for (let b = 0; b < bolt.branches.length; b++) {
              const br = bolt.branches[b];
              const brRgb = br.ice ? '56, 189, 248' : '250, 204, 21';
              drawPolyline(ctx, br.pts, 2.0, `rgba(${brRgb}, ${fmtA(afterAlpha * 0.52)})`);
              if (strikeAlpha > 0.01) {
                drawPolyline(ctx, br.pts, 0.85, `rgba(255, 255, 255, ${fmtA(strikeAlpha * 0.85)})`);
              }
            }

            // Sparkling golden ionized motes lingering along the afterimage path
            for (let k = 1; k < bolt.pts.length; k += 2) {
              drawSoftGlowOrb(ctx, bolt.pts[k].x, bolt.pts[k].y, 2.2, '253, 224, 71', afterAlpha * 0.65, 2.4);
            }
            ctx.restore();

            if (bolt.life >= bolt.maxLife) {
              bolt = null;
              nextBoltAt = now + 3200 + Math.random() * 2400;
            }
          }
        }
      };
    },

    /**
     * 14. BEAST — Inosuke Hashibira (Wild Ice-Blue Mountain Mist, Crossed Serrated Dual-Fang Slashes & Forest Leaves)
     * Churning wild ice-blue mountain mist along the bottom, crossed X-slash & twin serrated
     * indigo-cyan Beast Breathing blade arcs, and deep-forest leaves swirling in the untamed breeze.
     */
    beast(w, h) {
      const mistMotes = Array.from({ length: 22 }, (_, i) => ({
        x: seededFrac(i, 97, 31) * w,
        y: seededFrac(i, 61, 13) * h,
        r: 1.5 + (i % 4) * 0.85,
        vx: (i % 2 === 0 ? 1 : -1) * (0.18 + (i % 3) * 0.06),
        vy: -0.16 - (i % 3) * 0.06,
        phase: i * 1.1,
        rgb: i % 3 === 0 ? '147, 197, 253' : (i % 2 === 0 ? '56, 189, 248' : '129, 140, 248')
      }));

      // Crossed dual-sword Beast Breathing Fang slashes
      const fangPairs = Array.from({ length: 6 }, (_, i) => ({
        x: seededFrac(i, 131, 19) * w,
        y: seededFrac(i, 73, 27) * h * 0.80,
        vx: (i % 2 === 0 ? 1 : -1) * (3.2 + (i % 3) * 0.9),
        vy: 1.5 + (i % 2) * 0.65,
        length: 76 + (i % 3) * 24,
        bend: 17 + (i % 3) * 6,
        thickness: 3.4 + (i % 2) * 0.9,
        angle: (i % 2 === 0 ? 34 : 146) * DEG,
        crossed: i % 2 === 0, // Crossed X-fang slash vs parallel twin-fang slash
        life: (i * 8) % 44,
        maxLife: 44,
        peakAlpha: 0.68
      }));

      const forestLeaves = Array.from({ length: 18 }, (_, i) => ({
        x: seededFrac(i, 109, 23) * w,
        y: seededFrac(i, 59, 41) * h,
        r: 3.2 + (i % 3) * 1.0,
        vx: (i % 2 === 0 ? 1 : -1) * (0.45 + (i % 3) * 0.22),
        vy: 0.28 + (i % 3) * 0.10,
        sway: i * 0.9,
        rot: (i * 0.85) % TWO_PI,
        vrot: 0.015 + (i % 3) * 0.008,
        flip: i * 0.7,
        vflip: 0.024 + (i % 3) * 0.008,
        isMaple: i % 2 === 0,
        hue: i % 3 === 0 ? '#38bdf8' : (i % 2 === 0 ? '#34d399' : '#60a5fa'),
        alpha: 0.48 + (i % 3) * 0.12
      }));

      return {
        pools: [mistMotes, fangPairs, forestLeaves],
        drawStatic(ctx, width, height) {
          drawRollingMistBank(ctx, width, height, height * 0.89, height * 0.18, 0.7, 0, 1000, '125, 211, 252', '49, 46, 129', 0.16);
          for (let i = 0; i < mistMotes.length; i += 2) {
            const m = mistMotes[i];
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.25, m.rgb, 0.38, 2.7);
          }
        },
        step(ctx, width, height, now, dt) {
          // 1. Wild ice-blue mountain mist surging & rolling along the bottom edge
          const mountainGlow = safeLinearGradient(ctx, 0, height * 0.75, 0, height);
          mountainGlow.addColorStop(0, 'rgba(56, 189, 248, 0)');
          mountainGlow.addColorStop(0.58, 'rgba(59, 130, 246, 0.095)');
          mountainGlow.addColorStop(1, 'rgba(49, 46, 129, 0.24)');
          ctx.fillStyle = mountainGlow;
          ctx.fillRect(0, height * 0.75, width, height * 0.25);

          drawRollingMistBank(ctx, width, height, height * 0.83, height * 0.15, 0.5, 0.0011, now, '147, 197, 253', '30, 58, 138', 0.125);
          drawRollingMistBank(ctx, width, height, height * 0.90, height * 0.16, 2.1, -0.0014, now, '125, 211, 252', '49, 46, 129', 0.155);
          drawRollingMistBank(ctx, width, height, height * 0.96, height * 0.13, 3.8, 0.0017, now, '224, 242, 254', '30, 64, 175', 0.175);

          // 2. Ice-blue mountain spirit motes
          for (let i = 0; i < mistMotes.length; i++) {
            const m = mistMotes[i];
            m.x += (m.vx + Math.sin(now * 0.0013 + m.phase) * 0.20) * dt;
            m.y += m.vy * dt;
            if (m.x < -14) m.x = width + 14;
            if (m.x > width + 14) m.x = -14;
            if (m.y < -14) m.y = height + 14;
            const alpha = 0.26 + 0.42 * (0.5 + 0.5 * Math.sin(now * 0.0018 + m.phase));
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.3, m.rgb, alpha, 2.8);
          }

          // 3. Deep mountain forest leaves swirling in the wild draft
          for (let i = 0; i < forestLeaves.length; i++) {
            const lf = forestLeaves[i];
            lf.x += (lf.vx + Math.sin(now * 0.0015 + lf.sway) * 0.30) * dt;
            lf.y += lf.vy * dt;
            lf.rot += lf.vrot * dt;
            lf.flip += lf.vflip * dt;
            if (lf.y > height + 18) { lf.y = -16; lf.x = (lf.x + width * 0.39 + width) % width; }
            if (lf.x < -18) lf.x = width + 16;
            if (lf.x > width + 18) lf.x = -16;
            if (lf.isMaple) {
              drawMapleLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, lf.alpha);
            } else {
              drawBambooLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, lf.alpha);
            }
          }

          // 4. Dual serrated Nichirin blade slashes (Crossed X-Fang & Twin Parallel Fang)
          for (let i = 0; i < fangPairs.length; i++) {
            const sl = fangPairs[i];
            sl.x += sl.vx * dt;
            sl.y += sl.vy * dt;
            sl.life += dt;
            if (sl.life >= sl.maxLife || sl.x < -110 || sl.x > width + 110 || sl.y > height + 110) {
              sl.life = 0;
              const fromLeft = i % 2 === 0;
              sl.x = width * (fromLeft ? (0.14 + Math.random() * 0.52) : (0.34 + Math.random() * 0.52));
              sl.y = height * (0.12 + Math.random() * 0.54);
              sl.vx = (fromLeft ? 1 : -1) * (3.0 + Math.random() * 1.4);
              sl.vy = 1.4 + Math.random() * 1.0;
              sl.angle = Math.atan2(sl.vy, sl.vx) + HALF_PI;
              sl.crossed = Math.random() < 0.65;
            }

            drawCrescentArc(ctx, sl, '99, 102, 241', '224, 242, 254', true);

            const twin = sl.crossed
              ? {
                  // Crossed X-slash ("Pierce / Devour" dual-fang intersection!)
                  x: sl.x,
                  y: sl.y,
                  length: sl.length * 0.94,
                  bend: sl.bend * 0.92,
                  thickness: sl.thickness * 0.90,
                  angle: sl.angle + 68 * DEG,
                  life: sl.life,
                  maxLife: sl.maxLife,
                  peakAlpha: sl.peakAlpha * 0.88
                }
              : {
                  // Twin parallel jagged slash
                  x: sl.x - sl.vx * 3.2,
                  y: sl.y - sl.vy * 3.2 + 11,
                  length: sl.length * 0.86,
                  bend: sl.bend * 0.85,
                  thickness: sl.thickness * 0.84,
                  angle: sl.angle - 8 * DEG,
                  life: sl.life,
                  maxLife: sl.maxLife,
                  peakAlpha: sl.peakAlpha * 0.80
                };

            drawCrescentArc(ctx, twin, '56, 189, 248', '240, 249, 255', true);
          }
        }
      };
    }
  };

  /* ==========================================================================
   * UNIVERSAL FACTORY & ADAPTER (Supports factory call, mode map, & direct draw)
   * ========================================================================== */

  const directCanvasCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  function normalizeMode(mode) {
    const key = String(mode || 'wisteria').trim().toLowerCase();
    return MODE_BUILDERS[key] ? key : 'wisteria';
  }

  function extractDimensions(optsOrW, maybeH) {
    if (typeof optsOrW === 'number' && typeof maybeH === 'number') {
      return {
        width: Math.max(320, optsOrW),
        height: Math.max(240, maybeH),
        ctx: null,
        autoClear: true
      };
    }
    if (typeof optsOrW === 'function') {
      const dims = optsOrW() || {};
      return {
        width: Math.max(320, Number(dims.width) || 1280),
        height: Math.max(240, Number(dims.height) || 720),
        ctx: null,
        autoClear: true
      };
    }
    if (optsOrW && typeof optsOrW === 'object' && !isCanvasContext(optsOrW)) {
      return {
        width: Math.max(320, Number(optsOrW.width) || 1280),
        height: Math.max(240, Number(optsOrW.height) || 720),
        ctx: isCanvasContext(optsOrW.ctx) ? optsOrW.ctx : null,
        autoClear: optsOrW.autoClear !== false
      };
    }
    return { width: 1280, height: 720, ctx: null, autoClear: true };
  }

  function createDrawerInstance(mode, optsOrW, maybeH) {
    const resolvedMode = normalizeMode(mode);
    const initCfg = extractDimensions(optsOrW, maybeH);
    let curW = initCfg.width;
    let curH = initCfg.height;
    let boundCtx = initCfg.ctx;
    const autoClear = initCfg.autoClear;

    const scene = MODE_BUILDERS[resolvedMode](curW, curH);
    let lastNow = 0;

    function resize(nextW, nextH) {
      const nw = Math.max(320, Number(nextW) || curW);
      const nh = Math.max(240, Number(nextH) || curH);
      if (nw === curW && nh === curH) return;
      const sx = nw / curW;
      const sy = nh / curH;
      curW = nw;
      curH = nh;
      if (Array.isArray(scene.pools)) {
        for (let p = 0; p < scene.pools.length; p++) {
          const pool = scene.pools[p];
          for (let i = 0; i < pool.length; i++) {
            const item = pool[i];
            if (typeof item.x === 'number') item.x *= sx;
            if (typeof item.y === 'number') item.y *= sy;
            if (typeof item.baseX === 'number') item.baseX *= sx;
            if (typeof item.baseY === 'number') item.baseY *= sy;
          }
        }
      }
      if (typeof scene.onResize === 'function') {
        scene.onResize(nw, nh, sx, sy);
      }
    }

    function renderFrame(arg0, arg1, arg2, arg3) {
      let ctx = boundCtx;
      let w = curW;
      let h = curH;
      let now;

      if (isCanvasContext(arg0)) {
        ctx = arg0;
        if (typeof arg1 === 'number' && typeof arg2 === 'number' && typeof arg3 === 'number') {
          w = arg1;
          h = arg2;
          now = arg3;
        } else if (typeof arg1 === 'number' && arg2 === undefined) {
          now = arg1;
        } else {
          w = Number(arg1) || curW;
          h = Number(arg2) || curH;
          now = typeof arg3 === 'number' ? arg3 : performance.now();
        }
      } else if (typeof arg0 === 'number') {
        now = arg0;
      } else {
        now = performance.now();
      }

      if (!ctx) return;
      if (w !== curW || h !== curH) {
        resize(w, h);
      }

      const safeNow = Number.isFinite(now) ? now : 0;
      const dt = lastNow > 0 ? clamp((safeNow - lastNow) / 16.6667, 0.35, 2.2) : 1.0;
      lastNow = safeNow;

      if (autoClear) {
        ctx.clearRect(0, 0, curW, curH);
      }
      scene.step(ctx, curW, curH, safeNow, dt);
    }

    function renderStaticFrame(arg0, arg1, arg2) {
      const ctx = isCanvasContext(arg0) ? arg0 : boundCtx;
      const w = typeof arg1 === 'number' ? arg1 : curW;
      const h = typeof arg2 === 'number' ? arg2 : curH;
      if (!ctx) return;
      if (w !== curW || h !== curH) {
        resize(w, h);
      }
      if (autoClear) {
        ctx.clearRect(0, 0, curW, curH);
      }
      scene.drawStatic(ctx, curW, curH);
    }

    const callableDrawer = function drawerInvoke(a0, a1, a2, a3) {
      return renderFrame(a0, a1, a2, a3);
    };

    callableDrawer.mode = resolvedMode;
    callableDrawer.resize = resize;
    callableDrawer.render = renderFrame;
    callableDrawer.draw = renderFrame;
    callableDrawer.frame = renderFrame;
    callableDrawer.drawStatic = renderStaticFrame;
    callableDrawer.renderStatic = renderStaticFrame;
    callableDrawer.drawStaticGlowFrame = renderStaticFrame;

    return callableDrawer;
  }

  function getOrRunDirectDrawer(mode, ctx, w, h, now) {
    const resolved = normalizeMode(mode);
    const canvasKey = (ctx && ctx.canvas) || ctx;
    if (directCanvasCache && canvasKey && typeof canvasKey === 'object') {
      let byMode = directCanvasCache.get(canvasKey);
      if (!byMode) {
        byMode = Object.create(null);
        directCanvasCache.set(canvasKey, byMode);
      }
      if (!byMode[resolved]) {
        byMode[resolved] = createDrawerInstance(resolved, w, h);
      }
      byMode[resolved].render(ctx, w, h, typeof now === 'number' ? now : performance.now());
      return byMode[resolved];
    }
    const oneShot = createDrawerInstance(resolved, w, h);
    oneShot.render(ctx, w, h, typeof now === 'number' ? now : performance.now());
    return oneShot;
  }

  function knyFxFactory(mode, arg1, arg2, arg3, arg4) {
    if (isCanvasContext(arg1)) {
      return getOrRunDirectDrawer(mode, arg1, arg2, arg3, arg4);
    }
    return createDrawerInstance(mode, arg1, arg2);
  }

  knyFxFactory.create = createDrawerInstance;
  knyFxFactory.modes = SUPPORTED_MODES.slice();
  knyFxFactory.has = (mode) => Boolean(MODE_BUILDERS[String(mode || '').trim().toLowerCase()]);

  for (let i = 0; i < SUPPORTED_MODES.length; i++) {
    const modeName = SUPPORTED_MODES[i];
    knyFxFactory[modeName] = function modeEntry(arg0, arg1, arg2, arg3) {
      if (isCanvasContext(arg0)) {
        return getOrRunDirectDrawer(modeName, arg0, arg1, arg2, arg3);
      }
      return createDrawerInstance(modeName, arg0, arg1);
    };
  }

  if (typeof window !== 'undefined') {
    window.__AGY_KNY_FX_DRAWERS__ = knyFxFactory;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__AGY_KNY_FX_DRAWERS__ = knyFxFactory;
  }
})();
