(() => {
  'use strict';

  /**
   * Kimetsu no Yaiba — 60fps 2D Canvas Live Wallpaper FX Engine
   * Exposes window.__AGY_KNY_FX_DRAWERS__ supporting all 14 character/estate fxModes.
   * Zero-GC per-frame particle pools, DPR-independent physics, and reduced-motion static frames.
   */

  const TWO_PI = Math.PI * 2;
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

  function isCanvasContext(obj) {
    return Boolean(obj && typeof obj === 'object' && typeof obj.clearRect === 'function' && typeof obj.beginPath === 'function');
  }

  function clamp(val, min, max) {
    return val < min ? min : (val > max ? max : val);
  }

  function seededFrac(index, primeA, primeB) {
    return (((index * primeA + primeB) % 997) / 997);
  }

  /* ==========================================================================
   * SHARED ARTISTIC PRIMITIVES (Zero shadowBlur GPU readback overhead)
   * ========================================================================== */

  function drawSoftGlowOrb(ctx, x, y, r, rgb, coreAlpha, haloScale) {
    if (coreAlpha <= 0.005) return;
    const hScale = haloScale || 2.8;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, ${(coreAlpha * 0.24).toFixed(3)})`;
    ctx.arc(x, y, r * hScale, 0, TWO_PI);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, ${coreAlpha.toFixed(3)})`;
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();
  }

  function drawWisteriaPetal(ctx, x, y, r, rot, flipPhase, fillHex, alpha) {
    const flip = 0.26 + 0.74 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fillHex;
    ctx.beginPath();
    ctx.moveTo(-r * 1.35, 0);
    ctx.bezierCurveTo(-r * 0.65, -r * 0.95, r * 0.85, -r * 0.88, r * 1.45, 0);
    ctx.bezierCurveTo(r * 0.85, r * 0.88, -r * 0.65, r * 0.95, -r * 1.35, 0);
    ctx.closePath();
    ctx.fill();

    // Subtle luminous base highlight on each wisteria petal
    ctx.globalAlpha = alpha * 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-r * 0.45, 0, r * 0.42, r * 0.24, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawSakuraPetal(ctx, x, y, r, rot, flipPhase, fillHex, alpha) {
    const flip = 0.30 + 0.70 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fillHex;
    // Classic Japanese cherry blossom petal with heart-shaped notch at tip
    ctx.beginPath();
    ctx.moveTo(-r * 1.25, 0);
    ctx.bezierCurveTo(-r * 0.55, -r * 1.08, r * 0.75, -r * 1.05, r * 1.35, -r * 0.36);
    ctx.lineTo(r * 0.92, 0);
    ctx.lineTo(r * 1.35, r * 0.36);
    ctx.bezierCurveTo(r * 0.75, r * 1.05, -r * 0.55, r * 1.08, -r * 1.25, 0);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = alpha * 0.38;
    ctx.fillStyle = '#fff1f2';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, 0, r * 0.45, r * 0.25, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawGinkgoLeaf(ctx, x, y, r, rot, flipPhase, fillHex, alpha) {
    const flip = 0.38 + 0.62 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.globalAlpha = alpha;

    // Stem
    ctx.strokeStyle = fillHex;
    ctx.lineWidth = Math.max(0.9, r * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 1.45, r * 0.12);
    ctx.quadraticCurveTo(-r * 0.85, 0, -r * 0.42, 0);
    ctx.stroke();

    // Fan blade with central cleft
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
    const flip = 0.32 + 0.68 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fillHex;
    ctx.beginPath();
    ctx.moveTo(-r * 1.9, 0);
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.62, r * 1.95, -r * 0.06);
    ctx.quadraticCurveTo(-r * 0.2, r * 0.56, -r * 1.9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawButterfly(ctx, b, now, topRgb, botRgb, bodyRgb) {
    const flap = 0.30 + 0.70 * Math.abs(Math.sin(now * b.flapSpeed + b.phase));
    const tilt = Math.atan2(b.vy, b.vx) * 0.22;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(tilt);
    ctx.scale(b.scale, b.scale);

    // Soft ambient wing aura (fast circle instead of expensive shadowBlur)
    ctx.beginPath();
    ctx.fillStyle = `rgba(${topRgb}, 0.16)`;
    ctx.arc(0, 0, 15, 0, TWO_PI);
    ctx.fill();

    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.scale(s * flap, 1);

      // Forewing
      ctx.fillStyle = `rgba(${topRgb}, 0.80)`;
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.bezierCurveTo(5, -13, 17, -12.5, 14.5, -1.8);
      ctx.bezierCurveTo(13, 3.2, 6, 4.2, 0, 1.5);
      ctx.closePath();
      ctx.fill();

      // Hindwing
      ctx.fillStyle = `rgba(${botRgb}, 0.72)`;
      ctx.beginPath();
      ctx.moveTo(0, 1.5);
      ctx.bezierCurveTo(7.5, 4, 11.5, 11.5, 5.2, 12.4);
      ctx.bezierCurveTo(2, 12.2, 0.5, 7.2, 0, 2.5);
      ctx.closePath();
      ctx.fill();

      // Delicate inner wing accent dot
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
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
    const alpha = l.alpha;

    ctx.save();
    ctx.translate(l.x, l.y);

    // Warm golden-amber halo around lantern in the night sky
    const haloR = w * 3.1;
    const halo = ctx.createRadialGradient(0, 0, w * 0.15, 0, 0, haloR);
    halo.addColorStop(0, `rgba(254, 243, 199, ${(alpha * 0.44 * flicker).toFixed(3)})`);
    halo.addColorStop(0.36, `rgba(251, 191, 36, ${(alpha * 0.24 * flicker).toFixed(3)})`);
    halo.addColorStop(0.70, `rgba(217, 119, 6, ${(alpha * 0.08 * flicker).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, TWO_PI);
    ctx.fill();

    ctx.rotate(swayAngle);

    // Paper lantern body with warm inner candle gradient
    const bodyGrad = ctx.createRadialGradient(0, h * 0.08, w * 0.08, 0, 0, h * 0.72);
    bodyGrad.addColorStop(0, `rgba(255, 251, 235, ${(alpha * 0.96).toFixed(3)})`);
    bodyGrad.addColorStop(0.48, `rgba(253, 224, 71, ${(alpha * 0.88 * flicker).toFixed(3)})`);
    bodyGrad.addColorStop(0.85, `rgba(245, 158, 11, ${(alpha * 0.82).toFixed(3)})`);
    bodyGrad.addColorStop(1, `rgba(180, 83, 9, ${(alpha * 0.74).toFixed(3)})`);

    const rx = w * 0.5;
    const ry = h * 0.5;
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.68, -ry);
    ctx.quadraticCurveTo(rx * 0.68, -ry, rx * 0.68, -ry);
    ctx.bezierCurveTo(rx * 1.12, -ry * 0.45, rx * 1.12, ry * 0.45, rx * 0.66, ry);
    ctx.lineTo(-rx * 0.66, ry);
    ctx.bezierCurveTo(-rx * 1.12, ry * 0.45, -rx * 1.12, -ry * 0.45, -rx * 0.68, -ry);
    ctx.closePath();
    ctx.fill();

    // Subtle horizontal bamboo ribs across shoji paper
    ctx.strokeStyle = `rgba(146, 64, 14, ${(alpha * 0.34).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.6, w * 0.045);
    for (let rIdx = -1; rIdx <= 1; rIdx++) {
      const ribY = rIdx * ry * 0.42;
      const ribW = rx * (rIdx === 0 ? 0.96 : 0.88);
      ctx.beginPath();
      ctx.moveTo(-ribW, ribY);
      ctx.quadraticCurveTo(0, ribY + ry * 0.06, ribW, ribY);
      ctx.stroke();
    }

    // Top & bottom lacquered wood rims
    ctx.fillStyle = `rgba(69, 26, 3, ${(alpha * 0.88).toFixed(3)})`;
    ctx.fillRect(-rx * 0.62, -ry - 1.4, rx * 1.24, Math.max(1.5, h * 0.09));
    ctx.fillRect(-rx * 0.58, ry - 0.8, rx * 1.16, Math.max(1.5, h * 0.09));

    // Delicate silk tassel swaying beneath
    ctx.strokeStyle = `rgba(251, 191, 36, ${(alpha * 0.65).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.7, w * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, ry + 1);
    ctx.quadraticCurveTo(Math.sin(now * 0.0024 + l.phase) * 2.5, ry + h * 0.24, Math.sin(now * 0.0024 + l.phase) * 3.8, ry + h * 0.42);
    ctx.stroke();

    ctx.restore();
  }

  function drawDiamondStar(ctx, x, y, r, rot, rgb, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, ${(alpha * 0.22).toFixed(3)})`;
    ctx.arc(0, 0, r * 2.1, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.65);
    ctx.quadraticCurveTo(r * 0.22, -r * 0.22, r * 1.65, 0);
    ctx.quadraticCurveTo(r * 0.22, r * 0.22, 0, r * 1.65);
    ctx.quadraticCurveTo(-r * 0.22, r * 0.22, -r * 1.65, 0);
    ctx.quadraticCurveTo(-r * 0.22, -r * 0.22, 0, -r * 1.65);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.85).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawCrescentArc(ctx, arc, outerRgb, coreRgb, serrated) {
    const p = arc.life / arc.maxLife;
    const alpha = (p < 0.22 ? p / 0.22 : Math.max(0, 1 - (p - 0.22) / 0.78)) * arc.peakAlpha;
    if (alpha <= 0.01) return;

    ctx.save();
    ctx.translate(arc.x, arc.y);
    ctx.rotate(arc.angle);

    const halfL = arc.length * 0.5;
    const bend = arc.bend;
    const thick = arc.thickness;

    ctx.fillStyle = `rgba(${outerRgb}, ${(alpha * 0.78).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(-halfL, 0);
    ctx.quadraticCurveTo(0, -bend - thick, halfL, 0);
    if (serrated) {
      // Beast Breathing jagged Nichirin teeth along inner edge
      const steps = 6;
      for (let i = steps - 1; i >= 1; i--) {
        const t = i / steps;
        const px = -halfL + t * arc.length;
        const arch = -4 * t * (1 - t) * (bend - thick * 0.35);
        const tooth = (i % 2 === 0 ? -thick * 0.65 : thick * 0.35);
        ctx.lineTo(px, arch + tooth);
      }
      ctx.lineTo(-halfL, 0);
    } else {
      ctx.quadraticCurveTo(0, -bend + thick * 0.65, -halfL, 0);
    }
    ctx.closePath();
    ctx.fill();

    // Crisp luminous core blade line
    ctx.strokeStyle = `rgba(${coreRgb}, ${(alpha * 0.92).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.0, thick * 0.28);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-halfL * 0.82, -bend * 0.08);
    ctx.quadraticCurveTo(0, -bend - thick * 0.18, halfL * 0.82, -bend * 0.08);
    ctx.stroke();

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
    const p = m.life / m.maxLife;
    const opacity = p < 0.2 ? (p / 0.2) : Math.max(0, 1 - (p - 0.2) / 0.8);
    const tailX = m.x - m.vx * 12;
    const tailY = m.y - m.vy * 12;

    const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
    grad.addColorStop(0, `rgba(${headRgb}, ${(opacity * 0.95).toFixed(3)})`);
    grad.addColorStop(0.38, `rgba(${midRgb}, ${(opacity * 0.68).toFixed(3)})`);
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
    ctx.fillStyle = `rgba(255, 255, 255, ${(opacity * 0.96).toFixed(3)})`;
    ctx.arc(m.x, m.y, 2.0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    if (m.life >= m.maxLife) {
      state.meteor = null;
      state.nextMeteorAt = now + intervalMin + Math.random() * intervalSpan;
    }
  }

  /* ==========================================================================
   * 14 CHARACTER / ESTATE SCENE DEFINITIONS
   * ========================================================================== */

  const MODE_BUILDERS = {
    /**
     * 1. ROYAL WISTERIA — Gia Đình Chúa Công Ubuyashiki (Grand Masterpiece Scene)
     * 3 depth layers of wisteria petals (deep violet, blush pink, ivory white),
     * warm floating golden paper lanterns ascending in background, sacred golden motes,
     * violet-gold imperial butterflies, and gold-violet shooting stars.
     */
    royal_wisteria(w, h) {
      const lanterns = Array.from({ length: 9 }, (_, i) => {
        const depth = i < 5 ? 0 : 1; // 0 = distant sky, 1 = mid-ground
        return {
          x: ((i * 109 + 8) % 92 + 4) / 100 * w,
          y: ((i * 67 + 14) % 94 + 3) / 100 * h,
          size: depth === 0 ? (8.5 + (i % 3) * 2.2) : (13.5 + (i % 3) * 2.8),
          vy: depth === 0 ? (-0.16 - (i % 3) * 0.04) : (-0.26 - (i % 3) * 0.06),
          vx: (i % 2 === 0 ? 1 : -1) * (0.05 + (i % 3) * 0.025),
          phase: i * 1.37,
          alpha: depth === 0 ? (0.48 + (i % 3) * 0.08) : (0.68 + (i % 2) * 0.10)
        };
      });

      const palette = ['#c084fc', '#a855f7', '#f472b6', '#f9a8d4', '#fdf4ff', '#fef3c7'];
      const petals = Array.from({ length: 34 }, (_, i) => {
        const layer = i < 12 ? 0 : (i < 25 ? 1 : 2); // 0=far, 1=mid, 2=near foreground
        const scaleByLayer = layer === 0 ? 0.68 : (layer === 1 ? 1.0 : 1.42);
        return {
          layer,
          x: seededFrac(i, 131, 17) * w,
          y: seededFrac(i, 73, 29) * h,
          r: (2.5 + (i % 3) * 0.85) * scaleByLayer,
          vy: (0.22 + (i % 4) * 0.07) * scaleByLayer,
          vx: (-0.14 - (i % 3) * 0.06) * scaleByLayer,
          sway: i * 0.85,
          rot: (i * 0.9) % TWO_PI,
          vrot: 0.007 + (i % 4) * 0.0035,
          flip: i * 0.6,
          vflip: 0.018 + (i % 4) * 0.006,
          hue: palette[i % palette.length],
          alpha: layer === 0 ? 0.34 : (layer === 1 ? 0.56 : 0.74)
        };
      });

      const motes = Array.from({ length: 22 }, (_, i) => ({
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
        y: ((i * 83 + 16) % 72 + 12) / 100 * h,
        scale: 0.54 + (i % 3) * 0.16,
        vx: (i % 2 === 0 ? 1 : -1) * (0.24 + (i % 3) * 0.07),
        vy: -0.12 + (i % 3) * 0.06,
        phase: i * 1.55,
        flapSpeed: 0.0052 + (i % 3) * 0.0012,
        goldPrimary: i % 2 === 0
      }));

      const state = { meteor: null, nextMeteorAt: performance.now() + 2400, dt: 1 };

      return {
        pools: [lanterns, petals, motes, butterflies],
        drawStatic(ctx, width, height) {
          for (let i = 0; i < lanterns.length; i++) {
            drawFloatingLantern(ctx, lanterns[i], 1000);
          }
          for (let i = 0; i < motes.length; i++) {
            const m = motes[i];
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.2, m.rgb, 0.42, 2.6);
          }
        },
        step(ctx, width, height, now, dt) {
          state.dt = dt;

          // Subtle sacred upper wisteria-moon crown glow
          const topGlow = ctx.createLinearGradient(0, 0, 0, Math.min(220, height * 0.32));
          topGlow.addColorStop(0, 'rgba(192, 132, 252, 0.085)');
          topGlow.addColorStop(0.55, 'rgba(251, 191, 36, 0.032)');
          topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = topGlow;
          ctx.fillRect(0, 0, width, Math.min(220, height * 0.32));

          // 1. Far-layer wisteria petals (layer 0)
          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            if (p.layer !== 0) continue;
            p.x += (p.vx + Math.sin(now * 0.0009 + p.sway) * 0.20) * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            if (p.y > height + 16) { p.y = -14; p.x = (p.x + width * 0.31) % width; }
            if (p.x < -16) p.x = width + 14;
            drawWisteriaPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.hue, p.alpha);
          }

          // 2. Warm floating golden lanterns ascending into the night sky
          for (let i = 0; i < lanterns.length; i++) {
            const l = lanterns[i];
            l.x += (l.vx + Math.sin(now * 0.00065 + l.phase) * 0.14) * dt;
            l.y += l.vy * dt;
            if (l.y < -l.size * 3.5) {
              l.y = height + l.size * 3.2;
              l.x = ((l.x + width * 0.43) % (width * 0.90)) + width * 0.05;
            }
            if (l.x < -30) l.x = width + 25;
            if (l.x > width + 30) l.x = -25;
            drawFloatingLantern(ctx, l, now);
          }

          // 3. Golden sacred motes
          for (let i = 0; i < motes.length; i++) {
            const m = motes[i];
            m.x += (m.vx + Math.sin(now * 0.0008 + m.phase) * 0.12) * dt;
            m.y += m.vy * dt;
            if (m.x < -12) m.x = width + 12;
            if (m.x > width + 12) m.x = -12;
            if (m.y < -12) m.y = height + 12;
            const alpha = 0.24 + 0.48 * (0.5 + 0.5 * Math.sin(now * 0.0016 + m.phase));
            if (m.isStar) {
              drawDiamondStar(ctx, m.x, m.y, m.r * 1.45, now * 0.0004 + m.phase, m.rgb, alpha);
            } else {
              drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.35, m.rgb, alpha, 2.8);
            }
          }

          // 4. Mid & foreground wisteria petals (layers 1 & 2)
          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            if (p.layer === 0) continue;
            p.x += (p.vx + Math.sin(now * 0.0011 + p.sway) * 0.28) * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            if (p.y > height + 20) { p.y = -18; p.x = (p.x + width * 0.37) % width; }
            if (p.x < -20) p.x = width + 18;
            if (p.x > width + 20) p.x = -18;
            drawWisteriaPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.hue, p.alpha);
          }

          // 5. Violet-gold imperial butterflies
          for (let i = 0; i < butterflies.length; i++) {
            const b = butterflies[i];
            b.x += (b.vx + Math.cos(now * 0.0009 + b.phase) * 0.18) * dt;
            b.y += (b.vy + Math.sin(now * 0.0013 + b.phase) * 0.22) * dt;
            if (b.x < -28) b.x = width + 24;
            if (b.x > width + 28) b.x = -24;
            if (b.y < 24) b.vy = Math.abs(b.vy);
            if (b.y > height - 36) b.vy = -Math.abs(b.vy);
            const topRgb = b.goldPrimary ? '251, 191, 36' : '192, 132, 252';
            const botRgb = b.goldPrimary ? '216, 180, 254' : '253, 224, 71';
            drawButterfly(ctx, b, now, topRgb, botRgb, '254, 243, 199');
          }

          // 6. Gold-violet shooting star
          stepAndDrawMeteor(ctx, state, now, width, height, '254, 249, 195', '251, 191, 36', '192, 132, 252', 4800, 4200);
        }
      };
    },

    /**
     * 2. WISTERIA — Trùng Trụ Shinobu Kocho
     */
    wisteria(w, h) {
      const petals = Array.from({ length: 22 }, (_, i) => ({
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
        alpha: 0.38 + (i % 4) * 0.12
      }));

      const fireflies = Array.from({ length: 16 }, (_, i) => ({
        x: seededFrac(i, 67, 15) * w,
        y: seededFrac(i, 41, 20) * h,
        r: 1.4 + (i % 3) * 0.75,
        vx: (i % 2 === 0 ? 1 : -1) * (0.12 + (i % 4) * 0.04),
        vy: -0.10 - (i % 3) * 0.05,
        phase: i * 1.1,
        rgb: i % 3 === 0 ? '94, 234, 212' : '192, 132, 252'
      }));

      const butterflies = Array.from({ length: 7 }, (_, i) => ({
        x: ((i * 137 + 12) % 92 + 4) / 100 * w,
        y: ((i * 79 + 18) % 76 + 10) / 100 * h,
        scale: 0.52 + (i % 4) * 0.15,
        vx: (i % 2 === 0 ? 1 : -1) * (0.26 + (i % 3) * 0.08),
        vy: -0.14 + (i % 3) * 0.07,
        phase: i * 1.4,
        flapSpeed: 0.0055 + (i % 3) * 0.0014,
        mint: i % 2 === 0
      }));

      const state = { meteor: null, nextMeteorAt: performance.now() + 2600, dt: 1 };

      return {
        pools: [petals, fireflies, butterflies],
        drawStatic(ctx) {
          for (let i = 0; i < fireflies.length; i++) {
            const f = fireflies[i];
            drawSoftGlowOrb(ctx, f.x, f.y, f.r * 1.3, f.rgb, 0.38, 2.5);
          }
        },
        step(ctx, width, height, now, dt) {
          state.dt = dt;
          for (let i = 0; i < fireflies.length; i++) {
            const f = fireflies[i];
            f.x += (f.vx + Math.sin(now * 0.0008 + f.phase) * 0.12) * dt;
            f.y += f.vy * dt;
            if (f.x < -10) f.x = width + 10;
            if (f.x > width + 10) f.x = -10;
            if (f.y < -10) f.y = height + 10;
            const alpha = 0.22 + 0.38 * (0.5 + 0.5 * Math.sin(now * 0.0014 + f.phase));
            drawSoftGlowOrb(ctx, f.x, f.y, f.r * 1.25, f.rgb, alpha, 2.6);
          }

          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            p.x += (p.vx + Math.sin(now * 0.0011 + p.sway) * 0.25) * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            if (p.y > height + 14) { p.y = -12; p.x = (p.x + width * 0.37) % width; }
            if (p.x < -14) p.x = width + 12;
            drawWisteriaPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.hue, p.alpha);
          }

          for (let i = 0; i < butterflies.length; i++) {
            const b = butterflies[i];
            b.x += (b.vx + Math.cos(now * 0.0009 + b.phase) * 0.18) * dt;
            b.y += (b.vy + Math.sin(now * 0.0013 + b.phase) * 0.22) * dt;
            if (b.x < -28) b.x = width + 24;
            if (b.x > width + 28) b.x = -24;
            if (b.y < 24) b.vy = Math.abs(b.vy);
            if (b.y > height - 36) b.vy = -Math.abs(b.vy);
            drawButterfly(
              ctx,
              b,
              now,
              b.mint ? '94, 234, 212' : '232, 121, 249',
              b.mint ? '192, 132, 252' : '94, 234, 212'
            );
          }

          stepAndDrawMeteor(ctx, state, now, width, height, '240, 253, 250', '94, 234, 212', '192, 132, 252', 5200, 4500);
        }
      };
    },

    /**
     * 3. WATER — Thủy Trụ Giyu Tomioka (Dead Calm / Nagi Ripples & Azure Mist)
     */
    water(w, h) {
      const ripples = Array.from({ length: 6 }, (_, i) => ({
        x: ((i * 157 + 18) % 80 + 10) / 100 * w,
        y: ((i * 97 + 22) % 72 + 14) / 100 * h,
        progress: (i / 6),
        speed: 0.0034 + (i % 3) * 0.0007,
        maxR: 46 + (i % 3) * 24,
        tilt: 0.42 + (i % 2) * 0.12
      }));

      const droplets = Array.from({ length: 24 }, (_, i) => ({
        x: seededFrac(i, 83, 19) * w,
        y: seededFrac(i, 61, 31) * h,
        r: 1.5 + (i % 4) * 0.85,
        vx: 0.14 + (i % 3) * 0.06,
        vy: -0.14 - (i % 4) * 0.05,
        phase: i * 0.9,
        isBubble: i % 3 === 0,
        rgb: i % 2 === 0 ? '56, 189, 248' : '125, 211, 252'
      }));

      const glints = Array.from({ length: 10 }, (_, i) => ({
        x: seededFrac(i, 113, 7) * w,
        y: seededFrac(i, 71, 43) * h,
        len: 10 + (i % 4) * 6,
        vx: 0.35 + (i % 3) * 0.12,
        phase: i * 1.3
      }));

      return {
        pools: [ripples, droplets, glints],
        drawStatic(ctx) {
          for (let i = 0; i < ripples.length; i++) {
            const rp = ripples[i];
            ctx.save();
            ctx.translate(rp.x, rp.y);
            ctx.scale(1, rp.tilt);
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.25)';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.arc(0, 0, rp.maxR * 0.55, 0, TWO_PI);
            ctx.stroke();
            ctx.restore();
          }
          for (let i = 0; i < droplets.length; i += 2) {
            const d = droplets[i];
            drawSoftGlowOrb(ctx, d.x, d.y, d.r, d.rgb, 0.35, 2.4);
          }
        },
        step(ctx, width, height, now, dt) {
          // Expanding Dead Calm (Nagi) concentric water ripples
          for (let i = 0; i < ripples.length; i++) {
            const rp = ripples[i];
            rp.progress += rp.speed * dt;
            if (rp.progress >= 1) {
              rp.progress = 0;
              rp.x = width * (0.12 + Math.random() * 0.76);
              rp.y = height * (0.16 + Math.random() * 0.70);
            }
            const p = rp.progress;
            const alpha = (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85) * 0.44;
            const curR = 4 + p * rp.maxR;

            ctx.save();
            ctx.translate(rp.x, rp.y);
            ctx.scale(1, rp.tilt);
            ctx.strokeStyle = `rgba(125, 211, 252, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.arc(0, 0, curR, 0, TWO_PI);
            ctx.stroke();

            if (p > 0.18) {
              ctx.strokeStyle = `rgba(186, 230, 253, ${(alpha * 0.58).toFixed(3)})`;
              ctx.lineWidth = 0.85;
              ctx.beginPath();
              ctx.arc(0, 0, curR * 0.62, 0, TWO_PI);
              ctx.stroke();
            }
            ctx.restore();
          }

          // Floating water mist bubbles & spray droplets
          for (let i = 0; i < droplets.length; i++) {
            const d = droplets[i];
            d.x += (d.vx + Math.sin(now * 0.001 + d.phase) * 0.15) * dt;
            d.y += d.vy * dt;
            if (d.x > width + 14) d.x = -12;
            if (d.y < -14) { d.y = height + 12; d.x = (d.x + width * 0.29) % width; }
            const alpha = 0.26 + 0.38 * (0.5 + 0.5 * Math.sin(now * 0.0016 + d.phase));

            if (d.isBubble) {
              ctx.strokeStyle = `rgba(186, 230, 253, ${(alpha * 0.85).toFixed(3)})`;
              ctx.fillStyle = `rgba(56, 189, 248, ${(alpha * 0.18).toFixed(3)})`;
              ctx.lineWidth = 0.9;
              ctx.beginPath();
              ctx.arc(d.x, d.y, d.r * 1.55, 0, TWO_PI);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.8).toFixed(3)})`;
              ctx.beginPath();
              ctx.arc(d.x - d.r * 0.5, d.y - d.r * 0.5, d.r * 0.36, 0, TWO_PI);
              ctx.fill();
            } else {
              drawSoftGlowOrb(ctx, d.x, d.y, d.r * 1.15, d.rgb, alpha, 2.5);
            }
          }

          // Sparkling water surface glints
          for (let i = 0; i < glints.length; i++) {
            const g = glints[i];
            g.x += g.vx * dt;
            if (g.x > width + 24) { g.x = -24; g.y = (g.y + height * 0.37) % height; }
            const twinkle = Math.max(0, Math.sin(now * 0.0022 + g.phase));
            if (twinkle > 0.15) {
              const a = (twinkle - 0.15) * 0.55;
              drawDiamondStar(ctx, g.x, g.y, 2.6, 0, '186, 230, 253', a);
            }
          }
        }
      };
    },

    /**
     * 4. FLAME — Viêm Trụ Kyojuro Rengoku (Swirling Rising Embers & Blazing Sparks)
     */
    flame(w, h) {
      const embers = Array.from({ length: 32 }, (_, i) => ({
        x: seededFrac(i, 101, 17) * w,
        y: seededFrac(i, 67, 29) * h,
        r: 1.4 + (i % 4) * 0.85,
        vy: -0.55 - (i % 5) * 0.22,
        vx: (i % 2 === 0 ? 1 : -1) * (0.14 + (i % 3) * 0.08),
        swirl: i * 0.85,
        swirlAmp: 0.32 + (i % 4) * 0.14,
        rgb: i % 4 === 0 ? '254, 240, 138' : (i % 3 === 0 ? '251, 191, 36' : (i % 2 === 0 ? '249, 115, 22' : '239, 68, 68')),
        isStreak: i % 3 === 0
      }));

      return {
        pools: [embers],
        drawStatic(ctx, width, height) {
          const warmBase = ctx.createLinearGradient(0, height * 0.72, 0, height);
          warmBase.addColorStop(0, 'rgba(249, 115, 22, 0)');
          warmBase.addColorStop(1, 'rgba(234, 88, 12, 0.10)');
          ctx.fillStyle = warmBase;
          ctx.fillRect(0, height * 0.72, width, height * 0.28);
          for (let i = 0; i < embers.length; i += 2) {
            const e = embers[i];
            drawSoftGlowOrb(ctx, e.x, e.y, e.r * 1.1, e.rgb, 0.42, 2.5);
          }
        },
        step(ctx, width, height, now, dt) {
          // Subtle warm hearth updraft glow along bottom edge
          const hearthH = Math.min(180, height * 0.26);
          const warmGrad = ctx.createLinearGradient(0, height - hearthH, 0, height);
          warmGrad.addColorStop(0, 'rgba(249, 115, 22, 0)');
          warmGrad.addColorStop(1, 'rgba(239, 68, 68, 0.095)');
          ctx.fillStyle = warmGrad;
          ctx.fillRect(0, height - hearthH, width, hearthH);

          for (let i = 0; i < embers.length; i++) {
            const e = embers[i];
            const curlX = Math.sin(now * 0.0019 + e.swirl + e.y * 0.008) * e.swirlAmp;
            const dx = e.vx + curlX;
            const dy = e.vy;
            e.x += dx * dt;
            e.y += dy * dt;

            if (e.y < -20) {
              e.y = height + 14;
              e.x = (e.x + width * 0.39) % width;
            }
            if (e.x < -16) e.x = width + 14;
            if (e.x > width + 16) e.x = -14;

            const heightFade = clamp(e.y / (height * 0.22), 0.18, 1);
            const flicker = 0.62 + 0.38 * Math.sin(now * 0.0045 + e.swirl * 1.7);
            const alpha = 0.78 * heightFade * flicker;

            if (e.isStreak) {
              ctx.save();
              ctx.strokeStyle = `rgba(${e.rgb}, ${(alpha * 0.85).toFixed(3)})`;
              ctx.lineWidth = e.r * 1.05;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(e.x, e.y);
              ctx.lineTo(e.x - dx * 5.2, e.y - dy * 5.2);
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
     * 5. SOUND — Âm Trụ Tengen Uzui (Flamboyant Multi-Gem 4-Point Diamonds & Sound Fireworks)
     */
    sound(w, h) {
      const gemPalette = ['244, 63, 94', '251, 191, 36', '34, 211, 238', '232, 121, 249'];
      const diamonds = Array.from({ length: 24 }, (_, i) => ({
        x: seededFrac(i, 107, 19) * w,
        y: seededFrac(i, 79, 11) * h,
        r: 2.2 + (i % 4) * 0.9,
        vx: (i % 2 === 0 ? 1 : -1) * (0.12 + (i % 3) * 0.05),
        vy: -0.15 - (i % 3) * 0.06,
        rot: (i * 0.45) % TWO_PI,
        vrot: (i % 2 === 0 ? 1 : -1) * (0.008 + (i % 3) * 0.004),
        phase: i * 1.15,
        rgb: gemPalette[i % gemPalette.length]
      }));

      const bursts = [
        { x: w * 0.72, y: h * 0.28, progress: 0.15, speed: 0.0075, maxR: 58, rays: 12, colorIdx: 0 },
        { x: w * 0.28, y: h * 0.42, progress: 0.65, speed: 0.0068, maxR: 48, rays: 10, colorIdx: 2 }
      ];

      return {
        pools: [diamonds, bursts],
        drawStatic(ctx) {
          for (let i = 0; i < diamonds.length; i += 2) {
            const d = diamonds[i];
            drawDiamondStar(ctx, d.x, d.y, d.r, d.rot, d.rgb, 0.48);
          }
        },
        step(ctx, width, height, now, dt) {
          // Rotating jewel-toned 4-point diamond stars
          for (let i = 0; i < diamonds.length; i++) {
            const d = diamonds[i];
            d.x += (d.vx + Math.sin(now * 0.001 + d.phase) * 0.12) * dt;
            d.y += d.vy * dt;
            d.rot += d.vrot * dt;
            if (d.y < -16) { d.y = height + 14; d.x = (d.x + width * 0.33) % width; }
            if (d.x < -16) d.x = width + 14;
            if (d.x > width + 16) d.x = -14;

            const alpha = 0.26 + 0.56 * (0.5 + 0.5 * Math.sin(now * 0.0024 + d.phase));
            drawDiamondStar(ctx, d.x, d.y, d.r, d.rot, d.rgb, alpha);
          }

          // Elegant rhythmic musical firework rings
          for (let bIdx = 0; bIdx < bursts.length; bIdx++) {
            const b = bursts[bIdx];
            b.progress += b.speed * dt;
            if (b.progress >= 1.35) {
              b.progress = 0;
              b.x = width * (0.16 + Math.random() * 0.68);
              b.y = height * (0.12 + Math.random() * 0.54);
              b.colorIdx = (b.colorIdx + 1) % gemPalette.length;
            }
            if (b.progress > 1.0) continue;

            const p = b.progress;
            const ease = 1 - Math.pow(1 - p, 2.4);
            const alpha = (p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.15) / 0.85)) * 0.65;
            const rad = 6 + ease * b.maxR;
            const mainRgb = gemPalette[b.colorIdx];
            const altRgb = gemPalette[(b.colorIdx + 1) % gemPalette.length];

            // Soft acoustic shockwave ring
            ctx.strokeStyle = `rgba(${mainRgb}, ${(alpha * 0.35).toFixed(3)})`;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.arc(b.x, b.y, rad * 0.88, 0, TWO_PI);
            ctx.stroke();

            for (let r = 0; r < b.rays; r++) {
              const ang = (r / b.rays) * TWO_PI + p * 0.28;
              const px = b.x + Math.cos(ang) * rad;
              const py = b.y + Math.sin(ang) * rad;
              const tx = b.x + Math.cos(ang) * (rad * 0.72);
              const ty = b.y + Math.sin(ang) * (rad * 0.72);
              const useRgb = r % 2 === 0 ? mainRgb : altRgb;

              ctx.strokeStyle = `rgba(${useRgb}, ${(alpha * 0.82).toFixed(3)})`;
              ctx.lineWidth = 1.4;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(tx, ty);
              ctx.lineTo(px, py);
              ctx.stroke();

              drawSoftGlowOrb(ctx, px, py, 1.6, '255, 255, 255', alpha * 0.85, 2.0);
            }
          }
        }
      };
    },

    /**
     * 6. MIST — Hà Trụ Muichiro Tokito (Soft Drifting Mint Mist Wisps & Jade Leaves)
     */
    mist(w, h) {
      const wisps = Array.from({ length: 8 }, (_, i) => ({
        x: ((i * 139) % 100) / 100 * w,
        y: ((i * 73 + 12) % 82 + 8) / 100 * h,
        rx: 130 + (i % 3) * 55,
        ry: 24 + (i % 3) * 12,
        vx: (i % 2 === 0 ? 1 : -1) * (0.20 + (i % 3) * 0.07),
        phase: i * 1.2,
        alpha: 0.065 + (i % 3) * 0.025
      }));

      const leaves = Array.from({ length: 16 }, (_, i) => ({
        x: seededFrac(i, 97, 29) * w,
        y: seededFrac(i, 59, 17) * h,
        r: 3.6 + (i % 3) * 1.1,
        vx: 0.22 + (i % 3) * 0.08,
        vy: 0.16 + (i % 4) * 0.05,
        sway: i * 0.95,
        rot: (i * 0.8) % TWO_PI,
        vrot: 0.005 + (i % 3) * 0.003,
        flip: i * 0.7,
        vflip: 0.012 + (i % 3) * 0.004,
        isBamboo: i % 2 === 0,
        hue: i % 3 === 0 ? '#99f6e4' : (i % 2 === 0 ? '#5eead4' : '#a7f3d0'),
        alpha: 0.42 + (i % 3) * 0.12
      }));

      const motes = Array.from({ length: 14 }, (_, i) => ({
        x: seededFrac(i, 71, 37) * w,
        y: seededFrac(i, 43, 19) * h,
        r: 1.3 + (i % 3) * 0.6,
        vx: 0.14 + (i % 3) * 0.04,
        phase: i * 1.1
      }));

      return {
        pools: [wisps, leaves, motes],
        drawStatic(ctx) {
          for (let i = 0; i < motes.length; i++) {
            const m = motes[i];
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.2, '153, 246, 228', 0.34, 2.8);
          }
        },
        step(ctx, width, height, now, dt) {
          // Ethereal horizontal mint mist ribbons
          for (let i = 0; i < wisps.length; i++) {
            const ws = wisps[i];
            ws.x += ws.vx * dt;
            const curY = ws.y + Math.sin(now * 0.0006 + ws.phase) * 8;
            if (ws.x > width + ws.rx) ws.x = -ws.rx;
            if (ws.x < -ws.rx) ws.x = width + ws.rx;

            ctx.save();
            ctx.translate(ws.x, curY);
            ctx.scale(1, ws.ry / ws.rx);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ws.rx);
            g.addColorStop(0, `rgba(153, 246, 228, ${ws.alpha.toFixed(3)})`);
            g.addColorStop(0.55, `rgba(94, 234, 212, ${(ws.alpha * 0.45).toFixed(3)})`);
            g.addColorStop(1, 'rgba(45, 212, 191, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, ws.rx, 0, TWO_PI);
            ctx.fill();
            ctx.restore();
          }

          // Dew motes in the haze
          for (let i = 0; i < motes.length; i++) {
            const m = motes[i];
            m.x += m.vx * dt;
            if (m.x > width + 10) m.x = -10;
            const a = 0.20 + 0.32 * (0.5 + 0.5 * Math.sin(now * 0.0013 + m.phase));
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.2, '204, 251, 241', a, 2.6);
          }

          // Slow drifting jade ginkgo & bamboo leaves
          for (let i = 0; i < leaves.length; i++) {
            const lf = leaves[i];
            lf.x += (lf.vx + Math.sin(now * 0.0009 + lf.sway) * 0.22) * dt;
            lf.y += lf.vy * dt;
            lf.rot += lf.vrot * dt;
            lf.flip += lf.vflip * dt;
            if (lf.y > height + 18) { lf.y = -16; lf.x = (lf.x + width * 0.41) % width; }
            if (lf.x > width + 18) lf.x = -16;
            if (lf.isBamboo) {
              drawBambooLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, lf.alpha);
            } else {
              drawGinkgoLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, lf.alpha);
            }
          }
        }
      };
    },

    /**
     * 7. LOVE — Luyến Trụ Mitsuri Kanroji (Heart-Notched Sakura Petals & Pink-Mint Sparkles)
     */
    love(w, h) {
      const sakuraPalette = ['#f472b6', '#f9a8d4', '#fbcfe8', '#fda4af'];
      const petals = Array.from({ length: 26 }, (_, i) => ({
        x: seededFrac(i, 103, 13) * w,
        y: seededFrac(i, 61, 27) * h,
        r: 3.0 + (i % 4) * 1.0,
        vx: -0.24 - (i % 3) * 0.09,
        vy: 0.26 + (i % 4) * 0.08,
        swirl: i * 0.78,
        rot: (i * 0.65) % TWO_PI,
        vrot: 0.010 + (i % 4) * 0.004,
        flip: i * 0.5,
        vflip: 0.022 + (i % 3) * 0.006,
        hue: sakuraPalette[i % sakuraPalette.length],
        alpha: 0.48 + (i % 4) * 0.11
      }));

      const glows = Array.from({ length: 18 }, (_, i) => ({
        x: seededFrac(i, 79, 31) * w,
        y: seededFrac(i, 47, 17) * h,
        r: 1.5 + (i % 3) * 0.75,
        vx: (i % 2 === 0 ? 1 : -1) * 0.11,
        vy: -0.12 - (i % 3) * 0.04,
        phase: i * 1.05,
        // Signature Mitsuri pink & sakura-mochi mint green!
        rgb: i % 3 === 0 ? '110, 231, 183' : (i % 2 === 0 ? '244, 114, 182' : '251, 207, 232')
      }));

      return {
        pools: [petals, glows],
        drawStatic(ctx) {
          for (let i = 0; i < glows.length; i++) {
            const g = glows[i];
            drawSoftGlowOrb(ctx, g.x, g.y, g.r * 1.25, g.rgb, 0.38, 2.6);
          }
        },
        step(ctx, width, height, now, dt) {
          for (let i = 0; i < glows.length; i++) {
            const g = glows[i];
            g.x += (g.vx + Math.sin(now * 0.001 + g.phase) * 0.14) * dt;
            g.y += g.vy * dt;
            if (g.x < -12) g.x = width + 12;
            if (g.x > width + 12) g.x = -12;
            if (g.y < -12) g.y = height + 12;
            const alpha = 0.24 + 0.42 * (0.5 + 0.5 * Math.sin(now * 0.0018 + g.phase));
            drawSoftGlowOrb(ctx, g.x, g.y, g.r * 1.3, g.rgb, alpha, 2.8);
          }

          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            p.x += (p.vx + Math.cos(now * 0.0014 + p.swirl) * 0.34) * dt;
            p.y += (p.vy + Math.sin(now * 0.0014 + p.swirl) * 0.12) * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            if (p.y > height + 16) { p.y = -14; p.x = (p.x + width * 0.37) % width; }
            if (p.x < -18) p.x = width + 16;
            drawSakuraPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.hue, p.alpha);
          }
        }
      };
    },

    /**
     * 8. SERPENT — Xà Trụ Obanai Iguro (Sinusoidal Indigo & Emerald Moonlit Trails)
     */
    serpent(w, h) {
      const serpents = Array.from({ length: 12 }, (_, i) => ({
        baseX: seededFrac(i, 109, 23) * w,
        baseY: ((i * 71 + 10) % 82 + 9) / 100 * h,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 0.85 + (i % 4) * 0.24,
        amp: 14 + (i % 4) * 6,
        freq: 0.016 + (i % 3) * 0.004,
        phase: i * 1.4,
        r: 1.9 + (i % 3) * 0.55,
        rgb: i % 2 === 0 ? '52, 211, 153' : '129, 140, 248'
      }));

      const moonMotes = Array.from({ length: 16 }, (_, i) => ({
        x: seededFrac(i, 73, 19) * w,
        y: seededFrac(i, 53, 37) * h,
        r: 1.1 + (i % 3) * 0.55,
        vy: -0.07 - (i % 3) * 0.03,
        phase: i * 0.95,
        rgb: i % 3 === 0 ? '226, 232, 240' : (i % 2 === 0 ? '167, 139, 250' : '16, 185, 129')
      }));

      return {
        pools: [serpents, moonMotes],
        drawStatic(ctx) {
          for (let i = 0; i < moonMotes.length; i++) {
            const m = moonMotes[i];
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.2, m.rgb, 0.36, 2.5);
          }
        },
        step(ctx, width, height, now, dt) {
          for (let i = 0; i < moonMotes.length; i++) {
            const m = moonMotes[i];
            m.y += m.vy * dt;
            if (m.y < -10) m.y = height + 10;
            const a = 0.18 + 0.34 * (0.5 + 0.5 * Math.sin(now * 0.0014 + m.phase));
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.2, m.rgb, a, 2.5);
          }

          // Sinuous slithering silk-light ribbons along smooth sine waves
          for (let i = 0; i < serpents.length; i++) {
            const s = serpents[i];
            s.baseX += s.dir * s.speed * dt;
            if (s.dir > 0 && s.baseX > width + 80) s.baseX = -80;
            if (s.dir < 0 && s.baseX < -80) s.baseX = width + 80;

            const segs = 12;
            const stepX = 6.5 * s.dir;
            ctx.save();
            ctx.lineCap = 'round';
            for (let k = segs; k >= 1; k--) {
              const x1 = s.baseX - k * stepX;
              const y1 = s.baseY + Math.sin(x1 * s.freq + now * 0.0028 + s.phase) * s.amp;
              const x0 = s.baseX - (k - 1) * stepX;
              const y0 = s.baseY + Math.sin(x0 * s.freq + now * 0.0028 + s.phase) * s.amp;
              const t = 1 - k / (segs + 1);
              ctx.strokeStyle = `rgba(${s.rgb}, ${(t * 0.52).toFixed(3)})`;
              ctx.lineWidth = Math.max(0.7, s.r * 1.35 * t);
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x0, y0);
              ctx.stroke();
            }
            ctx.restore();

            const headY = s.baseY + Math.sin(s.baseX * s.freq + now * 0.0028 + s.phase) * s.amp;
            drawSoftGlowOrb(ctx, s.baseX, headY, s.r, '241, 245, 249', 0.75, 2.4);
            drawSoftGlowOrb(ctx, s.baseX, headY, s.r * 1.3, s.rgb, 0.45, 2.8);
          }
        }
      };
    },

    /**
     * 9. WIND — Phong Trụ Sanemi Shinazugawa (Emerald Wind Blade Arcs & Gusting Leaves)
     */
    wind(w, h) {
      const arcs = Array.from({ length: 7 }, (_, i) => ({
        x: seededFrac(i, 127, 15) * w,
        y: seededFrac(i, 67, 21) * h,
        vx: 4.8 + (i % 3) * 1.4,
        vy: -2.1 - (i % 3) * 0.7,
        length: 68 + (i % 4) * 26,
        bend: 14 + (i % 3) * 6,
        thickness: 2.6 + (i % 3) * 0.9,
        angle: -24 * DEG + (i % 3 - 1) * 8 * DEG,
        life: (i * 9) % 44,
        maxLife: 44 + (i % 3) * 10,
        peakAlpha: 0.58 + (i % 3) * 0.12
      }));

      const leaves = Array.from({ length: 20 }, (_, i) => ({
        x: seededFrac(i, 89, 11) * w,
        y: seededFrac(i, 53, 33) * h,
        r: 2.8 + (i % 3) * 0.95,
        vx: 1.65 + (i % 4) * 0.48,
        vy: -0.55 + (i % 3) * 0.25,
        rot: (i * 1.1) % TWO_PI,
        vrot: 0.032 + (i % 4) * 0.012,
        flip: i * 0.8,
        vflip: 0.04 + (i % 3) * 0.01,
        hue: i % 3 === 0 ? '#6ee7b7' : (i % 2 === 0 ? '#34d399' : '#10b981'),
        alpha: 0.52 + (i % 3) * 0.14
      }));

      return {
        pools: [arcs, leaves],
        drawStatic(ctx) {
          for (let i = 0; i < 3; i++) {
            const a = { ...arcs[i], life: 15, maxLife: 44, peakAlpha: 0.35 };
            drawCrescentArc(ctx, a, '16, 185, 129', '209, 250, 229', false);
          }
        },
        step(ctx, width, height, now, dt) {
          for (let i = 0; i < arcs.length; i++) {
            const a = arcs[i];
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.life += dt;
            if (a.life >= a.maxLife || a.x > width + 90 || a.y < -90) {
              a.life = 0;
              a.x = width * (-0.05 + Math.random() * 0.75);
              a.y = height * (0.20 + Math.random() * 0.78);
              a.angle = (-26 + (Math.random() * 16 - 8)) * DEG;
            }
            drawCrescentArc(ctx, a, '52, 211, 153', '236, 253, 245', false);
          }

          for (let i = 0; i < leaves.length; i++) {
            const lf = leaves[i];
            lf.x += lf.vx * dt;
            lf.y += (lf.vy + Math.sin(now * 0.003 + i) * 0.35) * dt;
            lf.rot += lf.vrot * dt;
            lf.flip += lf.vflip * dt;
            if (lf.x > width + 20) { lf.x = -18; lf.y = (lf.y + height * 0.43) % height; }
            if (lf.y < -20) lf.y = height + 16;
            if (lf.y > height + 20) lf.y = -16;
            drawBambooLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, lf.alpha);
          }
        }
      };
    },

    /**
     * 10. STONE — Nham Trụ Gyomei Himejima (Solemn Golden Ginkgo Leaves & Rising Amber Prayer Orbs)
     */
    stone(w, h) {
      const ginkgos = Array.from({ length: 20 }, (_, i) => ({
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
        alpha: 0.46 + (i % 3) * 0.14
      }));

      const beads = Array.from({ length: 18 }, (_, i) => ({
        x: seededFrac(i, 79, 29) * w,
        y: seededFrac(i, 47, 41) * h,
        r: 1.7 + (i % 3) * 0.75,
        vy: -0.18 - (i % 4) * 0.05,
        phase: i * 1.2,
        rgb: i % 2 === 0 ? '251, 191, 36' : '245, 158, 11'
      }));

      return {
        pools: [ginkgos, beads],
        drawStatic(ctx) {
          for (let i = 0; i < beads.length; i++) {
            const b = beads[i];
            drawSoftGlowOrb(ctx, b.x, b.y, b.r * 1.2, b.rgb, 0.40, 2.8);
          }
        },
        step(ctx, width, height, now, dt) {
          // Gently ascending amber prayer-bead orbs
          for (let i = 0; i < beads.length; i++) {
            const b = beads[i];
            b.x += Math.sin(now * 0.0007 + b.phase) * 0.10 * dt;
            b.y += b.vy * dt;
            if (b.y < -14) { b.y = height + 14; b.x = (b.x + width * 0.31) % width; }
            const alpha = 0.28 + 0.40 * (0.5 + 0.5 * Math.sin(now * 0.0013 + b.phase));
            drawSoftGlowOrb(ctx, b.x, b.y, b.r * 1.25, b.rgb, alpha, 3.0);
          }

          // Solemn autumn golden ginkgo leaves
          for (let i = 0; i < ginkgos.length; i++) {
            const g = ginkgos[i];
            g.x += (g.vx + Math.sin(now * 0.0009 + g.sway) * 0.22) * dt;
            g.y += g.vy * dt;
            g.rot += g.vrot * dt;
            g.flip += g.vflip * dt;
            if (g.y > height + 18) { g.y = -16; g.x = (g.x + width * 0.37) % width; }
            if (g.x < -18) g.x = width + 16;
            drawGinkgoLeaf(ctx, g.x, g.y, g.r, g.rot, g.flip, g.hue, g.alpha);
          }
        }
      };
    },

    /**
     * 11. SUN & WATER — Tanjiro Kamado (Hinokami Kagura Crimson Embers × Water Breathing Droplets)
     */
    sun_water(w, h) {
      const sunEmbers = Array.from({ length: 18 }, (_, i) => ({
        x: seededFrac(i, 107, 13) * w,
        y: seededFrac(i, 61, 29) * h,
        r: 1.5 + (i % 3) * 0.85,
        vx: 0.16 + (i % 3) * 0.07,
        vy: -0.46 - (i % 4) * 0.16,
        phase: i * 0.9,
        rgb: i % 3 === 0 ? '251, 191, 36' : (i % 2 === 0 ? '249, 115, 22' : '239, 68, 68')
      }));

      const waterDrops = Array.from({ length: 18 }, (_, i) => ({
        x: seededFrac(i, 83, 37) * w,
        y: seededFrac(i, 53, 19) * h,
        r: 1.6 + (i % 3) * 0.8,
        vx: 0.34 + (i % 3) * 0.12,
        vy: 0.08 * (i % 2 === 0 ? 1 : -1),
        phase: i * 1.15,
        isBubble: i % 3 === 0,
        rgb: i % 2 === 0 ? '56, 189, 248' : '14, 165, 233'
      }));

      return {
        pools: [sunEmbers, waterDrops],
        drawStatic(ctx) {
          for (let i = 0; i < sunEmbers.length; i += 2) {
            drawSoftGlowOrb(ctx, sunEmbers[i].x, sunEmbers[i].y, sunEmbers[i].r, sunEmbers[i].rgb, 0.42, 2.5);
          }
          for (let i = 0; i < waterDrops.length; i += 2) {
            drawSoftGlowOrb(ctx, waterDrops[i].x, waterDrops[i].y, waterDrops[i].r, waterDrops[i].rgb, 0.42, 2.5);
          }
        },
        step(ctx, width, height, now, dt) {
          // Rising Hinokami Kagura crimson-amber fire embers
          for (let i = 0; i < sunEmbers.length; i++) {
            const e = sunEmbers[i];
            const dx = e.vx + Math.sin(now * 0.0018 + e.phase) * 0.28;
            e.x += dx * dt;
            e.y += e.vy * dt;
            if (e.y < -16) { e.y = height + 14; e.x = (e.x + width * 0.41) % width; }
            if (e.x > width + 16) e.x = -14;

            const alpha = 0.34 + 0.48 * (0.5 + 0.5 * Math.sin(now * 0.0032 + e.phase));
            ctx.strokeStyle = `rgba(${e.rgb}, ${(alpha * 0.72).toFixed(3)})`;
            ctx.lineWidth = e.r * 0.95;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(e.x - dx * 4.2, e.y - e.vy * 4.2);
            ctx.stroke();
            drawSoftGlowOrb(ctx, e.x, e.y, e.r, '254, 243, 199', alpha, 2.4);
          }

          // Flowing Water Breathing azure stream droplets & bubbles
          for (let i = 0; i < waterDrops.length; i++) {
            const d = waterDrops[i];
            const waveY = Math.cos(now * 0.0015 + d.phase + d.x * 0.006) * 0.42;
            d.x += d.vx * dt;
            d.y += (d.vy + waveY) * dt;
            if (d.x > width + 16) { d.x = -14; d.y = (d.y + height * 0.33) % height; }
            if (d.y < -16) d.y = height + 14;
            if (d.y > height + 16) d.y = -14;

            const alpha = 0.30 + 0.44 * (0.5 + 0.5 * Math.sin(now * 0.0017 + d.phase));
            if (d.isBubble) {
              ctx.strokeStyle = `rgba(186, 230, 253, ${(alpha * 0.85).toFixed(3)})`;
              ctx.lineWidth = 0.95;
              ctx.beginPath();
              ctx.arc(d.x, d.y, d.r * 1.5, 0, TWO_PI);
              ctx.stroke();
            } else {
              drawSoftGlowOrb(ctx, d.x, d.y, d.r * 1.2, d.rgb, alpha, 2.6);
            }
          }
        }
      };
    },

    /**
     * 12. NEZUKO — Nezuko Kamado (Warm Sakura-Pink Exploding Blood Flames & Young Bamboo Leaves)
     */
    nezuko(w, h) {
      const pinkFlames = Array.from({ length: 22 }, (_, i) => ({
        x: seededFrac(i, 97, 17) * w,
        y: seededFrac(i, 59, 23) * h,
        r: 1.8 + (i % 4) * 0.9,
        vx: (i % 2 === 0 ? 1 : -1) * 0.12,
        vy: -0.26 - (i % 4) * 0.09,
        phase: i * 1.05,
        rgb: i % 3 === 0 ? '253, 164, 175' : (i % 2 === 0 ? '244, 114, 182' : '251, 113, 133')
      }));

      const bambooLeaves = Array.from({ length: 14 }, (_, i) => ({
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
        alpha: 0.50 + (i % 3) * 0.12
      }));

      return {
        pools: [pinkFlames, bambooLeaves],
        drawStatic(ctx) {
          for (let i = 0; i < pinkFlames.length; i += 2) {
            const f = pinkFlames[i];
            drawSoftGlowOrb(ctx, f.x, f.y, f.r * 1.25, f.rgb, 0.42, 2.8);
          }
        },
        step(ctx, width, height, now, dt) {
          // Warm sakura-pink Blood Demon Art wisps floating upward
          for (let i = 0; i < pinkFlames.length; i++) {
            const f = pinkFlames[i];
            f.x += (f.vx + Math.sin(now * 0.0014 + f.phase) * 0.20) * dt;
            f.y += f.vy * dt;
            if (f.y < -16) { f.y = height + 14; f.x = (f.x + width * 0.37) % width; }
            if (f.x < -14) f.x = width + 14;
            if (f.x > width + 14) f.x = -14;

            const alpha = 0.28 + 0.46 * (0.5 + 0.5 * Math.sin(now * 0.002 + f.phase));
            drawSoftGlowOrb(ctx, f.x, f.y, f.r * 1.35, f.rgb, alpha, 3.0);
            drawSoftGlowOrb(ctx, f.x, f.y - f.r * 0.3, f.r * 0.55, '255, 241, 242', alpha * 0.85, 1.5);
          }

          // Fresh green bamboo leaves drifting gently
          for (let i = 0; i < bambooLeaves.length; i++) {
            const lf = bambooLeaves[i];
            lf.x += (lf.vx + Math.sin(now * 0.001 + lf.sway) * 0.22) * dt;
            lf.y += lf.vy * dt;
            lf.rot += lf.vrot * dt;
            lf.flip += lf.vflip * dt;
            if (lf.y > height + 16) { lf.y = -14; lf.x = (lf.x + width * 0.43) % width; }
            if (lf.x < -16) lf.x = width + 14;
            drawBambooLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.hue, lf.alpha);
          }
        }
      };
    },

    /**
     * 13. THUNDER — Zenitsu Agatsuma (Crackling Golden Sparks & Eye-Safe Thunderclap Flash Bolt ~4–7s)
     * Strictly ZERO full-screen flash so dark-mode coding stays 100% comfortable.
     */
    thunder(w, h) {
      const sparks = Array.from({ length: 22 }, (_, i) => ({
        x: seededFrac(i, 101, 23) * w,
        y: seededFrac(i, 67, 17) * h,
        r: 1.3 + (i % 3) * 0.65,
        vx: (i % 2 === 0 ? 1 : -1) * (0.18 + (i % 3) * 0.08),
        vy: -0.14 - (i % 3) * 0.06,
        phase: i * 1.25,
        rgb: i % 3 === 0 ? '254, 249, 195' : (i % 2 === 0 ? '250, 204, 21' : '251, 191, 36')
      }));

      let bolt = null;
      let nextBoltAt = performance.now() + 2800;

      function createBolt(width, height) {
        const startX = width * (0.12 + Math.random() * 0.45);
        const startY = height * (0.06 + Math.random() * 0.22);
        const endX = startX + width * (0.32 + Math.random() * 0.28);
        const endY = startY + height * (0.28 + Math.random() * 0.34);
        const segs = 11;
        const pts = [];
        const branches = [];

        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const jitter = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 34;
          const px = startX + (endX - startX) * t + jitter * 0.55;
          const py = startY + (endY - startY) * t + jitter;
          pts.push({ x: px, y: py });

          if (i === 3 || i === 7) {
            const bPts = [{ x: px, y: py }];
            let bx = px;
            let by = py;
            for (let b = 1; b <= 3; b++) {
              bx += (endX - startX) * 0.08 + (Math.random() - 0.5) * 18;
              by += (endY - startY) * 0.09 + (Math.random() - 0.3) * 20;
              bPts.push({ x: bx, y: by });
            }
            branches.push(bPts);
          }
        }
        return { pts, branches, life: 0, maxLife: 24 };
      }

      return {
        pools: [sparks],
        drawStatic(ctx) {
          for (let i = 0; i < sparks.length; i++) {
            const s = sparks[i];
            drawSoftGlowOrb(ctx, s.x, s.y, s.r * 1.2, s.rgb, 0.38, 2.5);
          }
        },
        step(ctx, width, height, now, dt) {
          // Golden electric sparks & tiny crackling micro-arcs
          for (let i = 0; i < sparks.length; i++) {
            const s = sparks[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            if (s.x < -12) s.x = width + 12;
            if (s.x > width + 12) s.x = -12;
            if (s.y < -12) s.y = height + 12;

            const pulse = 0.5 + 0.5 * Math.sin(now * 0.0038 + s.phase);
            const alpha = 0.24 + 0.52 * pulse;
            drawSoftGlowOrb(ctx, s.x, s.y, s.r * 1.15, s.rgb, alpha, 2.6);

            // Occasional tiny 2-segment crackle twig around individual spark
            if (pulse > 0.86) {
              const ang = (now * 0.01 + s.phase) % TWO_PI;
              const mx = s.x + Math.cos(ang) * 5.5;
              const my = s.y + Math.sin(ang) * 5.5;
              const ex = mx + Math.cos(ang + 0.8) * 5.0;
              const ey = my + Math.sin(ang + 0.8) * 5.0;
              ctx.strokeStyle = `rgba(254, 240, 138, ${(alpha * 0.8).toFixed(3)})`;
              ctx.lineWidth = 0.95;
              ctx.beginPath();
              ctx.moveTo(s.x, s.y);
              ctx.lineTo(mx, my);
              ctx.lineTo(ex, ey);
              ctx.stroke();
            }
          }

          // Thunder Breathing First Form: Thunderclap and Flash (~4.3s - 6.8s cadence, crisp & eye-friendly)
          if (!bolt && now >= nextBoltAt) {
            bolt = createBolt(width, height);
          }
          if (bolt) {
            bolt.life += dt;
            const p = bolt.life / bolt.maxLife;
            const opacity = p < 0.18 ? (p / 0.18) : Math.max(0, 1 - (p - 0.18) / 0.82);

            const drawPolyline = (pts, lw, rgba) => {
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
            };

            ctx.save();
            // Outer warm golden aura stroke (local to bolt only — zero screen flash!)
            drawPolyline(bolt.pts, 5.5, `rgba(250, 204, 21, ${(opacity * 0.22).toFixed(3)})`);
            drawPolyline(bolt.pts, 2.4, `rgba(253, 224, 71, ${(opacity * 0.72).toFixed(3)})`);
            drawPolyline(bolt.pts, 1.1, `rgba(255, 255, 255, ${(opacity * 0.92).toFixed(3)})`);

            for (let b = 0; b < bolt.branches.length; b++) {
              drawPolyline(bolt.branches[b], 1.5, `rgba(250, 204, 21, ${(opacity * 0.52).toFixed(3)})`);
              drawPolyline(bolt.branches[b], 0.75, `rgba(255, 255, 255, ${(opacity * 0.75).toFixed(3)})`);
            }
            ctx.restore();

            if (bolt.life >= bolt.maxLife) {
              bolt = null;
              nextBoltAt = now + 4300 + Math.random() * 2600;
            }
          }
        }
      };
    },

    /**
     * 14. BEAST — Inosuke Hashibira (Wild Ice-Blue Mountain Mist & Dual Indigo Serrated Crescent Slashes)
     */
    beast(w, h) {
      const forestMist = Array.from({ length: 24 }, (_, i) => ({
        x: seededFrac(i, 97, 31) * w,
        y: seededFrac(i, 61, 13) * h,
        r: 1.5 + (i % 4) * 0.85,
        vx: (i % 2 === 0 ? 1 : -1) * (0.16 + (i % 3) * 0.06),
        vy: -0.15 - (i % 3) * 0.06,
        phase: i * 1.1,
        rgb: i % 3 === 0 ? '147, 197, 253' : (i % 2 === 0 ? '56, 189, 248' : '129, 140, 248')
      }));

      // Dual-blade crescent pairs (Fang slashes)
      const slashes = Array.from({ length: 6 }, (_, i) => ({
        x: seededFrac(i, 131, 19) * w,
        y: seededFrac(i, 73, 27) * h,
        vx: (i % 2 === 0 ? 1 : -1) * (3.6 + (i % 3) * 0.9),
        vy: 1.8 + (i % 2) * 0.7,
        length: 62 + (i % 3) * 22,
        bend: 16 + (i % 3) * 5,
        thickness: 3.0 + (i % 2) * 0.9,
        angle: (i % 2 === 0 ? 32 : 148) * DEG,
        life: (i * 11) % 42,
        maxLife: 42,
        peakAlpha: 0.62
      }));

      return {
        pools: [forestMist, slashes],
        drawStatic(ctx) {
          for (let i = 0; i < forestMist.length; i++) {
            const m = forestMist[i];
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.25, m.rgb, 0.36, 2.7);
          }
        },
        step(ctx, width, height, now, dt) {
          // Wild mountain forest ice-blue & indigo mist orbs
          for (let i = 0; i < forestMist.length; i++) {
            const m = forestMist[i];
            m.x += (m.vx + Math.sin(now * 0.0012 + m.phase) * 0.18) * dt;
            m.y += m.vy * dt;
            if (m.x < -14) m.x = width + 14;
            if (m.x > width + 14) m.x = -14;
            if (m.y < -14) m.y = height + 14;
            const alpha = 0.24 + 0.42 * (0.5 + 0.5 * Math.sin(now * 0.0017 + m.phase));
            drawSoftGlowOrb(ctx, m.x, m.y, m.r * 1.3, m.rgb, alpha, 2.8);
          }

          // Dual serrated indigo-ice crescent Nichirin slashes
          for (let i = 0; i < slashes.length; i++) {
            const sl = slashes[i];
            sl.x += sl.vx * dt;
            sl.y += sl.vy * dt;
            sl.life += dt;
            if (sl.life >= sl.maxLife || sl.x < -90 || sl.x > width + 90 || sl.y > height + 90) {
              sl.life = 0;
              const fromLeft = i % 2 === 0;
              sl.x = width * (fromLeft ? (0.12 + Math.random() * 0.55) : (0.35 + Math.random() * 0.55));
              sl.y = height * (0.12 + Math.random() * 0.58);
              sl.vx = (fromLeft ? 1 : -1) * (3.5 + Math.random() * 1.4);
              sl.vy = 1.6 + Math.random() * 1.1;
              sl.angle = Math.atan2(sl.vy, sl.vx) + 90 * DEG;
            }
            drawCrescentArc(ctx, sl, '99, 102, 241', '224, 242, 254', true);

            // Twin companion blade slash slightly offset (Inosuke's dual swords!)
            const twin = {
              x: sl.x - sl.vx * 3.2,
              y: sl.y - sl.vy * 3.2 + 9,
              length: sl.length * 0.84,
              bend: sl.bend * 0.85,
              thickness: sl.thickness * 0.82,
              angle: sl.angle - 8 * DEG,
              life: sl.life,
              maxLife: sl.maxLife,
              peakAlpha: sl.peakAlpha * 0.78
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

      const dt = lastNow > 0 ? clamp((now - lastNow) / 16.6667, 0.35, 2.2) : 1.0;
      lastNow = now;

      if (autoClear) {
        ctx.clearRect(0, 0, curW, curH);
      }
      scene.step(ctx, curW, curH, now, dt);
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
