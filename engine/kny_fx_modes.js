(() => {
  'use strict';

  /**
   * Kimetsu no Yaiba — Wallpaper Engine Cinematic Atmosphere (60fps Zero-GC 2D Canvas)
   * Exposes window.__AGY_KNY_FX_DRAWERS__(fxMode, { width, height }) -> { resize, render, draw, drawStatic }
   *
   * Craft & Motion Philosophy (bexa-motion & atelier-ui):
   * - "Meaning Before Movement": Every particle obeys real-world physics (Archimedes buoyancy,
   *   thermal convection updrafts, aerodynamic flutter-and-glide, natural wind gust envelopes,
   *   electrostatic micro-discharges, and bioluminescent firefly rhythms).
   * - Respects 4K UHD Artwork: Zero center-crossing ribbons, zero opaque bottom wave slabs,
   *   zero fake equalizers, zero unprompted blade slashes. Uses subtle 'screen' light blending
   *   (alpha 0.03..0.28), edge-weighted framing, and 3-layer Depth-of-Field (foreground bokeh,
   *   crisp midground, fine distant background).
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
    'beast',
    'sun',
    'moon'
  ];

  function isCanvasContext(obj) {
    return Boolean(
      obj &&
      typeof obj === 'object' &&
      typeof obj.clearRect === 'function' &&
      typeof obj.beginPath === 'function'
    );
  }

  function clamp(val, min, max) {
    if (!(val === val)) return min;
    return val < min ? min : (val > max ? max : val);
  }

  function seededFrac(index, primeA, primeB) {
    return (((index * primeA + primeB) % 997) / 997);
  }

  function fmtA(alpha) {
    return clamp(alpha, 0, 1).toFixed(4);
  }

  /**
   * Maps uniform [0..1) into an edge-weighted horizontal coordinate [0..1)
   * so ~76% of ambient elements frame the left/right margins while keeping
   * the central 4K character portrait airy and unobstructed.
   */
  function edgeWeightedFrac(u) {
    const f = clamp(u, 0, 0.9999);
    if (f < 0.38) {
      return 0.015 + (f / 0.38) * 0.265;
    }
    if (f > 0.62) {
      return 0.72 + ((f - 0.62) / 0.38) * 0.265;
    }
    return 0.28 + ((f - 0.38) / 0.24) * 0.44;
  }

  /**
   * Strictly places elements in the left or right outer margins (never across center).
   */
  function strictMarginX(u, side, width) {
    const f = clamp(u, 0, 1);
    if (side < 0) {
      return width * (0.025 + f * 0.205);
    }
    return width * (0.77 + f * 0.205);
  }

  /**
   * Softly attenuates alpha when a drifting bokeh/cloud passes near the center subject.
   */
  function centerAttenuation(x, width) {
    const norm = Math.abs((x / Math.max(1, width)) - 0.5) * 2; // 0 at center, 1 at edges
    return 0.48 + 0.52 * clamp(norm * 1.25, 0, 1);
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
   * SHARED CINEMATIC ATMOSPHERIC PRIMITIVES (Zero filter/shadowBlur overhead)
   * ========================================================================== */

  /**
   * Soft optical bokeh circle (f/1.4 Circle-of-Confusion simulation).
   */
  function drawOpticalBokeh(ctx, x, y, r, rgb, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.003 || !(r > 1)) return;
    const grad = safeRadialGradient(ctx, x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb}, ${fmtA(a * 0.78)})`);
    grad.addColorStop(0.58, `rgba(${rgb}, ${fmtA(a * 0.95)})`);
    grad.addColorStop(0.84, `rgba(${rgb}, ${fmtA(a * 0.38)})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();
  }

  /**
   * Volumetric radial mist puff (ultra-low alpha 0.03..0.06, large radius 220..380px).
   */
  function drawVolumetricMistPuff(ctx, x, y, rx, ry, rgb, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.002 || !(rx > 4) || !(ry > 4)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const grad = safeRadialGradient(ctx, 0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, `rgba(${rgb}, ${fmtA(a)})`);
    grad.addColorStop(0.45, `rgba(${rgb}, ${fmtA(a * 0.62)})`);
    grad.addColorStop(0.78, `rgba(${rgb}, ${fmtA(a * 0.20)})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Soft multi-band caustic / moonbeam shaft without hard lateral edges.
   */
  function drawCausticLightShaft(ctx, anchorX, anchorY, topWidth, bottomWidth, length, angleRad, rgb, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.003 || !(length > 10)) return;
    ctx.save();
    ctx.translate(anchorX, anchorY);
    ctx.rotate(angleRad);

    const grad = safeLinearGradient(ctx, 0, 0, 0, length);
    grad.addColorStop(0, `rgba(${rgb}, ${fmtA(a * 0.85)})`);
    grad.addColorStop(0.28, `rgba(${rgb}, ${fmtA(a)})`);
    grad.addColorStop(0.72, `rgba(${rgb}, ${fmtA(a * 0.34)})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;

    // Three nested soft-tapered trapezoids eliminate sharp polygon borders
    const parentAlpha = ctx.globalAlpha;
    const bands = [1.0, 0.64, 0.34];
    const weights = [0.30, 0.38, 0.36];
    for (let i = 0; i < 3; i++) {
      const s = bands[i];
      ctx.globalAlpha = parentAlpha * weights[i];
      const hw0 = topWidth * 0.5 * s;
      const hw1 = bottomWidth * 0.5 * s;
      ctx.beginPath();
      ctx.moveTo(-hw0, -12);
      ctx.lineTo(hw0, -12);
      ctx.lineTo(hw1, length);
      ctx.lineTo(-hw1, length);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Zero-GC luminous mote / ember / firefly with 3 concentric glow shells.
   */
  function drawGlowMote(ctx, x, y, r, haloRgb, coreRgb, alpha, haloScale) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.004 || !(r > 0.15)) return;
    const hs = haloScale || 3.2;

    ctx.fillStyle = `rgba(${haloRgb}, ${fmtA(a * 0.14)})`;
    ctx.beginPath();
    ctx.arc(x, y, r * hs, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = `rgba(${haloRgb}, ${fmtA(a * 0.38)})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.65, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = `rgba(${coreRgb}, ${fmtA(Math.min(1, a * 1.15))})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();
  }

  /**
   * Crystal-clear underwater glass bubble / dew droplet:
   * ultra-thin ice-blue rim + crisp upper-left specular dot + faint lower-right bounce arc.
   */
  function drawCrystalBubble(ctx, x, y, r, alpha, isForegroundBokeh) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.004 || !(r > 0.4)) return;

    if (isForegroundBokeh) {
      drawOpticalBokeh(ctx, x, y, r, '165, 243, 252', a);
      return;
    }

    // Barely-there interior refraction so 4K pixels shine right through
    ctx.fillStyle = `rgba(186, 230, 253, ${fmtA(a * 0.09)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();

    // Delicate ice-cyan glass rim
    ctx.strokeStyle = `rgba(165, 243, 252, ${fmtA(a * 0.85)})`;
    ctx.lineWidth = clamp(r * 0.16, 0.55, 1.05);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.stroke();

    // Subtle secondary caustic crescent at bottom-right
    if (r >= 2.6) {
      ctx.strokeStyle = `rgba(224, 242, 254, ${fmtA(a * 0.38)})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.76, 0.18 * Math.PI, 0.66 * Math.PI);
      ctx.stroke();
    }

    // Tiny upper-left specular glint dot
    ctx.fillStyle = `rgba(255, 255, 255, ${fmtA(Math.min(0.95, a * 1.25))})`;
    ctx.beginPath();
    ctx.arc(x - r * 0.36, y - r * 0.36, Math.max(0.55, r * 0.21), 0, TWO_PI);
    ctx.fill();
  }

  /**
   * Hairline silk water ripple strictly near the bottom edge (strokeWidth = 0.8px, alpha <= 0.22).
   */
  function drawSilkRipple(ctx, x, y, radius, alpha, rgb) {
    const a = clamp(alpha, 0, 0.22);
    if (a <= 0.004 || !(radius > 1)) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.19);

    ctx.strokeStyle = `rgba(${rgb}, ${fmtA(a)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TWO_PI);
    ctx.stroke();

    if (radius > 9) {
      ctx.strokeStyle = `rgba(224, 242, 254, ${fmtA(a * 0.48)})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.62, 0, TWO_PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 3D-tumbling Wisteria petal (supports soft out-of-focus foreground bokeh layer).
   */
  function drawWisteriaPetal(ctx, x, y, r, rot, flipPhase, fillRgb, alpha, layer) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.005) return;
    if (layer === 2) {
      drawOpticalBokeh(ctx, x, y, r * 2.4, fillRgb, a);
      return;
    }
    const flip = 0.28 + 0.72 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);

    ctx.fillStyle = `rgba(${fillRgb}, ${fmtA(a)})`;
    ctx.beginPath();
    ctx.moveTo(-r * 1.25, 0);
    ctx.bezierCurveTo(-r * 0.55, -r * 0.88, r * 0.78, -r * 0.82, r * 1.35, 0);
    ctx.bezierCurveTo(r * 0.78, r * 0.82, -r * 0.55, r * 0.88, -r * 1.25, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${fmtA(a * 0.36)})`;
    ctx.beginPath();
    ctx.ellipse(-r * 0.42, 0, r * 0.38, r * 0.20, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Notched Japanese Sakura blossom petal with aerodynamic 3D tumble.
   */
  function drawSakuraPetal(ctx, x, y, r, rot, flipPhase, fillRgb, alpha, layer) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.005) return;
    if (layer === 2) {
      drawOpticalBokeh(ctx, x, y, r * 2.5, fillRgb, a);
      return;
    }
    const flip = 0.30 + 0.70 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);

    ctx.fillStyle = `rgba(${fillRgb}, ${fmtA(a)})`;
    ctx.beginPath();
    ctx.moveTo(-r * 1.20, 0);
    ctx.bezierCurveTo(-r * 0.52, -r * 1.02, r * 0.72, -r * 0.98, r * 1.32, -r * 0.34);
    ctx.lineTo(r * 0.88, 0);
    ctx.lineTo(r * 1.32, r * 0.34);
    ctx.bezierCurveTo(r * 0.72, r * 0.98, -r * 0.52, r * 1.02, -r * 1.20, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255, 241, 242, ${fmtA(a * 0.34)})`;
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, 0, r * 0.40, r * 0.22, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Slender Bamboo leaf.
   */
  function drawBambooLeaf(ctx, x, y, r, rot, flipPhase, fillRgb, alpha, layer) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.005) return;
    if (layer === 2) {
      drawOpticalBokeh(ctx, x, y, r * 2.2, fillRgb, a * 0.75);
      return;
    }
    const flip = 0.32 + 0.68 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.fillStyle = `rgba(${fillRgb}, ${fmtA(a)})`;
    ctx.beginPath();
    ctx.moveTo(-r * 1.85, 0);
    ctx.quadraticCurveTo(-r * 0.20, -r * 0.55, r * 1.90, -r * 0.04);
    ctx.quadraticCurveTo(-r * 0.20, r * 0.52, -r * 1.85, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Golden/Mint Ginkgo fan leaf.
   */
  function drawGinkgoLeaf(ctx, x, y, r, rot, flipPhase, fillRgb, alpha, layer) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.005) return;
    if (layer === 2) {
      drawOpticalBokeh(ctx, x, y, r * 2.3, fillRgb, a * 0.8);
      return;
    }
    const flip = 0.36 + 0.64 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);

    ctx.strokeStyle = `rgba(${fillRgb}, ${fmtA(a * 0.9)})`;
    ctx.lineWidth = Math.max(0.7, r * 0.15);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 1.38, r * 0.10);
    ctx.quadraticCurveTo(-r * 0.82, 0, -r * 0.40, 0);
    ctx.stroke();

    ctx.fillStyle = `rgba(${fillRgb}, ${fmtA(a)})`;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, 0);
    ctx.quadraticCurveTo(0, -r * 1.15, r * 1.12, -r * 0.88);
    ctx.quadraticCurveTo(r * 1.30, -r * 0.36, r * 0.74, -r * 0.06);
    ctx.lineTo(r * 1.22, r * 0.16);
    ctx.quadraticCurveTo(r * 1.16, r * 0.88, r * 0.90, r * 0.96);
    ctx.quadraticCurveTo(-0.04 * r, r * 1.08, -r * 0.45, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Japanese Maple leaf (Momiji / Ao-momiji).
   */
  function drawMapleLeaf(ctx, x, y, r, rot, flipPhase, fillRgb, alpha, layer) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.005) return;
    if (layer === 2) {
      drawOpticalBokeh(ctx, x, y, r * 2.2, fillRgb, a * 0.75);
      return;
    }
    const flip = 0.34 + 0.66 * Math.abs(Math.cos(flipPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flip);
    ctx.fillStyle = `rgba(${fillRgb}, ${fmtA(a)})`;
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, 0);
    ctx.lineTo(-r * 0.32, -r * 0.32);
    ctx.lineTo(-r * 0.50, -r * 0.98);
    ctx.lineTo(0, -r * 0.48);
    ctx.lineTo(r * 0.60, -r * 1.10);
    ctx.lineTo(r * 0.42, -r * 0.28);
    ctx.lineTo(r * 1.28, 0);
    ctx.lineTo(r * 0.42, r * 0.28);
    ctx.lineTo(r * 0.60, r * 1.10);
    ctx.lineTo(0, r * 0.48);
    ctx.lineTo(-r * 0.50, r * 0.98);
    ctx.lineTo(-r * 0.32, r * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Mountain Pine needle pair for alpine forest breeze (`beast`).
   */
  function drawPineNeedlePair(ctx, x, y, r, rot, flipPhase, fillRgb, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.005) return;
    const spread = 0.16 + 0.08 * Math.sin(flipPhase);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = `rgba(${fillRgb}, ${fmtA(a)})`;
    ctx.lineWidth = Math.max(0.75, r * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 1.5, 0);
    ctx.quadraticCurveTo(0, -r * spread * 2.2, r * 1.7, -r * spread * 3.4);
    ctx.moveTo(-r * 1.5, 0);
    ctx.quadraticCurveTo(0, r * spread * 1.8, r * 1.65, r * spread * 2.9);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Delicate glowing butterfly for Shinobu's Wisteria courtyard (organic wingbeat, subtle alpha).
   */
  function drawGlowingButterfly(ctx, b, now) {
    const a = clamp(b.alpha, 0, 0.28);
    if (a <= 0.005) return;
    // Organic asymmetric wingbeat: quicker downstroke, graceful glide open
    const wave = Math.sin(now * b.flapSpeed + b.phase);
    const flap = 0.22 + 0.78 * Math.pow(Math.abs(wave), 0.72);
    const heading = Math.atan2(b.vy, b.vx) * 0.25;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(heading);
    ctx.scale(b.scale, b.scale);

    // Subtle bioluminescent aura
    ctx.fillStyle = `rgba(${b.topRgb}, ${fmtA(a * 0.22)})`;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TWO_PI);
    ctx.fill();

    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.scale(s * flap, 1);

      ctx.fillStyle = `rgba(${b.topRgb}, ${fmtA(a * 0.92)})`;
      ctx.beginPath();
      ctx.moveTo(0, -0.8);
      ctx.bezierCurveTo(4.5, -11.5, 15.5, -11.0, 13.2, -1.5);
      ctx.bezierCurveTo(11.8, 2.8, 5.2, 3.8, 0, 1.2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(${b.botRgb}, ${fmtA(a * 0.80)})`;
      ctx.beginPath();
      ctx.moveTo(0, 1.2);
      ctx.bezierCurveTo(6.8, 3.6, 10.2, 10.2, 4.6, 11.0);
      ctx.bezierCurveTo(1.8, 10.8, 0.4, 6.4, 0, 2.2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${fmtA(a * 0.55)})`;
      ctx.beginPath();
      ctx.arc(7.6, -4.0, 1.15, 0, TWO_PI);
      ctx.fill();

      ctx.restore();
    }

    ctx.fillStyle = `rgba(245, 243, 255, ${fmtA(a * 0.88)})`;
    ctx.fillRect(-0.6, -4.4, 1.2, 8.8);
    ctx.restore();
  }

  /**
   *Tiny 4-point specular glint for luxury metallic dust (`sound`).
   */
  function drawFineGlitter(ctx, x, y, r, rot, rgb, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0.005 || !(r > 0.15)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.fillStyle = `rgba(${rgb}, ${fmtA(a * 0.25)})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.9, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = `rgba(${rgb}, ${fmtA(a)})`;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.6);
    ctx.quadraticCurveTo(r * 0.18, -r * 0.18, r * 1.6, 0);
    ctx.quadraticCurveTo(r * 0.18, r * 0.18, 0, r * 1.6);
    ctx.quadraticCurveTo(-r * 0.18, r * 0.18, -r * 1.6, 0);
    ctx.quadraticCurveTo(-r * 0.18, -r * 0.18, 0, -r * 1.6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${fmtA(Math.min(1, a * 1.1))})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.32, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  /* ==========================================================================
   * 14 CHARACTER / ESTATE CINEMATIC ATMOSPHERE BUILDERS
   * ========================================================================== */

  const MODE_BUILDERS = {
    /* ------------------------------------------------------------------------
     * 1. WATER (Thủy Trụ Giyu) — Deep Still Midnight Water ("Tĩnh Thủy")
     * - 4 subtle underwater caustic moonbeam shafts angling gently from top
     * - ~22 crystal-clear glass bubbles rising vertically via Archimedes buoyancy
     *   (±0.15px micro horizontal oscillation, edge-weighted framing)
     * - 4 hairline silk ripples right at the bottom margin (height - 28px..height)
     * ------------------------------------------------------------------------ */
    water(initW, initH) {
      const shafts = [
        { rx: 0.11, topW: 54, botW: 135, lenRatio: 0.68, baseAng: 14 * DEG, phase: 0.4, rgb: '125, 211, 252', alpha: 0.052 },
        { rx: 0.23, topW: 38, botW: 98, lenRatio: 0.56, baseAng: 16 * DEG, phase: 1.9, rgb: '186, 230, 253', alpha: 0.040 },
        { rx: 0.78, topW: 62, botW: 152, lenRatio: 0.74, baseAng: -15 * DEG, phase: 3.1, rgb: '56, 189, 248', alpha: 0.058 },
        { rx: 0.89, topW: 44, botW: 112, lenRatio: 0.62, baseAng: -13 * DEG, phase: 4.7, rgb: '165, 243, 252', alpha: 0.044 }
      ];

      const bubbles = [];
      for (let i = 0; i < 22; i++) {
        const layer = i < 3 ? 2 : (i < 14 ? 1 : 0);
        const r = layer === 2
          ? (11 + seededFrac(i, 41, 7) * 7)
          : (layer === 1 ? (2.4 + seededFrac(i, 53, 19) * 3.1) : (1.2 + seededFrac(i, 67, 11) * 1.3));
        const u = seededFrac(i, 89, 23);
        const x = layer === 2
          ? strictMarginX(u, i % 2 === 0 ? -1 : 1, initW)
          : edgeWeightedFrac(u) * initW;
        // Larger bubbles have stronger buoyancy upward
        const vy = layer === 2
          ? -(0.32 + seededFrac(i, 31, 5) * 0.16)
          : -(0.18 + (r / 5.5) * 0.34);
        bubbles.push({
          x,
          y: seededFrac(i, 97, 37) * initH,
          r,
          vy,
          phase: seededFrac(i, 73, 13) * TWO_PI,
          wobbleFreq: 0.0014 + seededFrac(i, 29, 3) * 0.0009,
          layer,
          baseAlpha: layer === 2 ? 0.052 : (layer === 1 ? 0.23 : 0.14)
        });
      }

      const ripples = [];
      for (let i = 0; i < 4; i++) {
        ripples.push({
          x: initW * (0.12 + i * 0.25 + seededFrac(i, 43, 9) * 0.06),
          y: initH - 6 - seededFrac(i, 61, 17) * 18,
          progress: i * 0.25,
          speed: 0.0026 + seededFrac(i, 37, 11) * 0.0008,
          maxR: 26 + seededFrac(i, 59, 7) * 18,
          seed: i
        });
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < shafts.length; i++) {
          const s = shafts[i];
          drawCausticLightShaft(ctx, width * s.rx, -8, s.topW, s.botW, height * s.lenRatio, s.baseAng, s.rgb, s.alpha * 0.85);
        }
        for (let i = 0; i < 10; i++) {
          const b = bubbles[i + 3];
          drawCrystalBubble(ctx, b.x, b.y, b.r, b.baseAlpha * 0.8, false);
        }
        ctx.restore();
      }

      return {
        pools: [bubbles, ripples],
        onResize(nw, nh) {
          for (let i = 0; i < ripples.length; i++) {
            ripples[i].y = nh - 6 - seededFrac(i, 61, 17) * 18;
          }
        },
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';

          // 1. Subtle underwater caustic moonbeam shafts
          for (let i = 0; i < shafts.length; i++) {
            const s = shafts[i];
            const swayAng = s.baseAng + Math.sin(now * 0.00042 + s.phase) * (1.6 * DEG);
            const breathe = s.alpha * (0.82 + 0.18 * Math.sin(now * 0.00068 + s.phase * 1.4));
            const shiftX = Math.sin(now * 0.00031 + s.phase) * 14;
            drawCausticLightShaft(
              ctx,
              width * s.rx + shiftX,
              -10,
              s.topW,
              s.botW,
              height * s.lenRatio,
              swayAng,
              s.rgb,
              breathe
            );
          }

          // 2. Crystal-clear buoyant water bubbles (±0.15px gentle oscillation)
          for (let i = 0; i < bubbles.length; i++) {
            const b = bubbles[i];
            const dx = Math.sin(now * b.wobbleFreq + b.phase) * 0.14;
            b.x += dx * dt;
            b.y += b.vy * dt;

            if (b.y < -b.r * 2 - 8) {
              b.y = height + b.r + 6;
              const u = seededFrac(i + Math.floor(now * 0.001), 89, 23);
              b.x = b.layer === 2
                ? strictMarginX(u, i % 2 === 0 ? -1 : 1, width)
                : edgeWeightedFrac(u) * width;
            }

            // Soft fade near very top & bottom edges
            const vFade = clamp(Math.min(b.y / (height * 0.12), (height - b.y + 24) / 48), 0.15, 1);
            const shimmer = 0.88 + 0.12 * Math.sin(now * 0.0021 + b.phase);
            drawCrystalBubble(ctx, b.x, b.y, b.r, b.baseAlpha * vFade * shimmer, b.layer === 2);
          }

          // 3. Hairline silk surface ripples strictly along bottom 28px
          for (let i = 0; i < ripples.length; i++) {
            const rp = ripples[i];
            rp.progress += rp.speed * dt;
            if (rp.progress >= 1) {
              rp.progress -= 1;
              const slotBase = 0.08 + i * 0.24;
              rp.x = width * (slotBase + ((Math.floor(now * 0.001) * 37 + i * 19) % 100) / 100 * 0.16);
              rp.y = height - 5 - ((i * 7 + Math.floor(now * 0.002)) % 19);
            }
            const p = rp.progress;
            const radius = 2.5 + p * rp.maxR;
            const env = p < 0.18 ? (p / 0.18) : (1 - (p - 0.18) / 0.82);
            const alpha = 0.20 * env * env;
            drawSilkRipple(ctx, rp.x, rp.y, radius, alpha, '165, 243, 252');
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 2. ROYAL_WISTERIA (Gia Đình Chúa Công Ubuyashiki)
     * - Warm golden ambient breathing glow from the right veranda (alpha 0.05..0.09)
     * - Pastel lavender & ivory wisteria petals drifting naturally from top edge
     *   with unified breeze angle, 3D tumble, and 3-layer DoF
     * - ~16 ultra-fine golden dust motes floating slowly like summer night fireflies
     * ------------------------------------------------------------------------ */
    royal_wisteria(initW, initH) {
      const petalPalette = [
        '233, 213, 255', // pastel wisteria lilac
        '216, 180, 254', // soft orchid
        '254, 252, 232', // warm ivory blossom
        '245, 208, 254'  // pale violet-blush
      ];

      const petals = [];
      for (let i = 0; i < 24; i++) {
        const layer = i < 3 ? 2 : (i < 16 ? 1 : 0);
        const r = layer === 2 ? (7.5 + (i % 3) * 1.8) : (layer === 1 ? (3.6 + seededFrac(i, 47, 11) * 1.8) : (2.1 + seededFrac(i, 59, 7) * 1.1));
        const speedMul = layer === 2 ? 1.28 : (layer === 1 ? 1.0 : 0.64);
        petals.push({
          x: (layer === 2 ? strictMarginX(seededFrac(i, 83, 19), i % 2 === 0 ? -1 : 1, initW) : edgeWeightedFrac(seededFrac(i, 83, 19)) * initW),
          y: seededFrac(i, 97, 29) * initH,
          r,
          vxBase: -(0.22 + seededFrac(i, 31, 13) * 0.14) * speedMul,
          vyBase: (0.42 + seededFrac(i, 43, 5) * 0.24) * speedMul,
          rot: seededFrac(i, 67, 17) * TWO_PI,
          vrot: (seededFrac(i, 71, 23) - 0.5) * 0.018,
          flip: seededFrac(i, 53, 3) * TWO_PI,
          vflip: 0.020 + seededFrac(i, 37, 7) * 0.016,
          phase: seededFrac(i, 61, 11) * TWO_PI,
          rgb: petalPalette[i % petalPalette.length],
          layer,
          alpha: layer === 2 ? 0.068 : (layer === 1 ? 0.24 : 0.15)
        });
      }

      const goldDust = [];
      for (let i = 0; i < 16; i++) {
        goldDust.push({
          x: edgeWeightedFrac(seededFrac(i, 79, 31)) * initW,
          y: (0.18 + seededFrac(i, 61, 13) * 0.76) * initH,
          r: 0.9 + seededFrac(i, 41, 17) * 1.3,
          vx: (seededFrac(i, 29, 7) - 0.5) * 0.12,
          vy: -(0.06 + seededFrac(i, 53, 19) * 0.10),
          phase: seededFrac(i, 89, 11) * TWO_PI,
          rgb: i % 3 === 0 ? '254, 240, 138' : '251, 191, 36'
        });
      }

      function drawVerandaGlow(ctx, width, height, alpha) {
        const gx = width * 0.90;
        const gy = height * 0.38;
        const gr = Math.max(width, height) * 0.56;
        const glow = safeRadialGradient(ctx, gx, gy, 0, gx, gy, gr);
        glow.addColorStop(0, `rgba(253, 224, 71, ${fmtA(alpha)})`);
        glow.addColorStop(0.42, `rgba(245, 158, 11, ${fmtA(alpha * 0.52)})`);
        glow.addColorStop(0.75, `rgba(192, 132, 252, ${fmtA(alpha * 0.18)})`);
        glow.addColorStop(1, 'rgba(192, 132, 252, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        drawVerandaGlow(ctx, width, height, 0.068);
        for (let i = 0; i < 10; i++) {
          const d = goldDust[i];
          drawGlowMote(ctx, d.x, d.y, d.r, d.rgb, '255, 251, 235', 0.16, 3.0);
        }
        ctx.restore();
      }

      return {
        pools: [petals, goldDust],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();

          // 1. Warm golden veranda breathing glow (alpha 0.05..0.09)
          ctx.globalCompositeOperation = 'screen';
          const verandaAlpha = 0.052 + 0.036 * (0.5 + 0.5 * Math.sin(now * 0.00075));
          drawVerandaGlow(ctx, width, height, verandaAlpha);

          // 2. Ultra-fine summer night golden dust motes
          for (let i = 0; i < goldDust.length; i++) {
            const d = goldDust[i];
            d.x += (d.vx + Math.sin(now * 0.0008 + d.phase) * 0.08) * dt;
            d.y += (d.vy + Math.cos(now * 0.0007 + d.phase * 1.3) * 0.05) * dt;
            if (d.x < -12) d.x = width + 12;
            if (d.x > width + 12) d.x = -12;
            if (d.y < -12) d.y = height + 12;
            if (d.y > height + 12) d.y = -12;

            const pulse = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(now * 0.0015 + d.phase), 1.6);
            drawGlowMote(ctx, d.x, d.y, d.r, d.rgb, '255, 251, 235', 0.22 * pulse, 3.2);
          }

          // 3. Natural wisteria petals falling from top edge along unified gentle breeze
          ctx.globalCompositeOperation = 'source-over';
          const sharedBreeze = -0.14 + Math.sin(now * 0.00045) * 0.10;
          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            // Aerodynamic flutter-and-glide: horizontal drag modulates fall speed slightly
            const flutter = Math.sin(now * 0.0017 + p.phase);
            const glideLift = Math.abs(flutter) * 0.12;
            p.x += (p.vxBase + sharedBreeze + flutter * 0.22) * dt;
            p.y += Math.max(0.18, p.vyBase - glideLift) * dt;
            p.rot += (p.vrot + flutter * 0.005) * dt;
            p.flip += p.vflip * dt;

            if (p.y > height + 20) {
              p.y = -16 - (i % 5) * 6;
              const u = seededFrac(i + Math.floor(now * 0.0008), 83, 19);
              p.x = p.layer === 2 ? strictMarginX(u, i % 2 === 0 ? -1 : 1, width) : (edgeWeightedFrac(u) * width + width * 0.08) % width;
            }
            if (p.x < -24) p.x = width + 20;
            if (p.x > width + 24) p.x = -20;

            const atten = p.layer === 2 ? centerAttenuation(p.x, width) : 1;
            drawWisteriaPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.rgb, p.alpha * atten, p.layer);
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 3. FLAME (Viêm Trụ Rengoku)
     * - Warm orange-red thermal glow breathing right along bottom edge
     *   (height * 0.88 .. height, screen blend alpha 0.08..0.14)
     * - ~32 Natural Rising Embers (1.2..3.5px) carried upward by convective
     *   hot air: curling softly, bright gold-orange near bottom, shrinking and
     *   cooling/fading out naturally as they ascend
     * ------------------------------------------------------------------------ */
    flame(initW, initH) {
      const embers = [];
      for (let i = 0; i < 32; i++) {
        const isBokeh = i < 3;
        const life = seededFrac(i, 97, 19);
        embers.push({
          x: isBokeh ? strictMarginX(seededFrac(i, 71, 13), i % 2 === 0 ? -1 : 1, initW) : edgeWeightedFrac(seededFrac(i, 71, 13)) * initW,
          y: initH - life * initH * 0.68,
          life, // 0 = bottom birth, 1 = extinguished aloft
          lifeSpeed: 0.0022 + seededFrac(i, 43, 7) * 0.0020,
          r0: isBokeh ? (12 + i * 3) : (1.2 + seededFrac(i, 59, 11) * 2.3),
          vyBase: isBokeh ? (0.45 + i * 0.08) : (0.68 + seededFrac(i, 37, 23) * 0.62),
          curlAmp: 0.22 + seededFrac(i, 67, 5) * 0.34,
          curlFreq: 0.0018 + seededFrac(i, 29, 17) * 0.0014,
          phase: seededFrac(i, 83, 31) * TWO_PI,
          isBokeh
        });
      }

      function drawThermalBase(ctx, width, height, alpha) {
        const topY = height * 0.88;
        const grad = safeLinearGradient(ctx, 0, topY, 0, height);
        grad.addColorStop(0, 'rgba(234, 88, 12, 0)');
        grad.addColorStop(0.45, `rgba(249, 115, 22, ${fmtA(alpha * 0.52)})`);
        grad.addColorStop(1, `rgba(239, 68, 68, ${fmtA(alpha)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, topY, width, height - topY);
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        drawThermalBase(ctx, width, height, 0.105);
        for (let i = 3; i < 17; i++) {
          const e = embers[i];
          const y = height - e.life * height * 0.62;
          const r = e.r0 * (1 - e.life * 0.65);
          drawGlowMote(ctx, e.x, y, r, '251, 146, 60', '254, 243, 199', (1 - e.life) * 0.22, 2.8);
        }
        ctx.restore();
      }

      return {
        pools: [embers],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';

          // 1. Breathing warm hearth/hearthfire glow along bottom 12%
          const heatAlpha = 0.082 + 0.056 * (0.5 + 0.5 * Math.sin(now * 0.0011) * 0.7 + 0.3 * Math.sin(now * 0.0023));
          drawThermalBase(ctx, width, height, heatAlpha);

          // 2. Natural convective rising embers (bright & hot below -> cool, shrink & fade aloft)
          const thermalDraft = Math.sin(now * 0.00055) * 0.16;
          for (let i = 0; i < embers.length; i++) {
            const e = embers[i];
            e.life += e.lifeSpeed * dt;
            if (e.life >= 1 || e.y < -20) {
              e.life = 0;
              const u = seededFrac(i + Math.floor(now * 0.0013), 71, 13);
              e.x = e.isBokeh ? strictMarginX(u, i % 2 === 0 ? -1 : 1, width) : edgeWeightedFrac(u) * width;
              e.y = height + 4 + (i % 5) * 3;
            }
            if (typeof e.y !== 'number' || !Number.isFinite(e.y)) {
              e.y = height - e.life * height * 0.68;
            }

            const p = clamp(e.life, 0, 1);
            // Convective swirl widens slightly as hot air rises and decelerates
            const swirl = Math.sin(now * e.curlFreq + e.phase + p * 4.2) * e.curlAmp * (0.6 + p * 0.8);
            e.x += (thermalDraft + swirl) * dt;
            e.y -= e.vyBase * (1.08 - p * 0.38) * dt;

            if (e.x < -16) e.x = width + 16;
            if (e.x > width + 16) e.x = -16;

            const fadeIn = clamp(p / 0.08, 0, 1);
            const fadeOut = Math.pow(clamp(1 - p, 0, 1), 1.55);
            const flicker = 0.84 + 0.16 * Math.sin(now * 0.006 + e.phase * 2.1);

            if (e.isBokeh) {
              drawOpticalBokeh(ctx, e.x, e.y, e.r0, '251, 146, 60', 0.055 * fadeIn * fadeOut);
            } else {
              const curR = Math.max(0.35, e.r0 * (1 - p * 0.74));
              // Blackbody cooling palette: white-gold -> bright orange -> deep crimson ember
              const haloRgb = p < 0.38 ? '251, 146, 60' : (p < 0.72 ? '234, 88, 12' : '220, 38, 38');
              const coreRgb = p < 0.32 ? '255, 251, 235' : (p < 0.65 ? '253, 224, 71' : '251, 146, 60');
              const alpha = 0.27 * fadeIn * fadeOut * flicker;
              drawGlowMote(ctx, e.x, e.y, curR, haloRgb, coreRgb, alpha, 2.9);
            }
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 4. WISTERIA (Trùng Trụ Shinobu)
     * - Fine violet-teal pollen dust suspended in moonlight
     * - Wisteria petals drifting gently from top edge
     * - Exactly 4 small glowing butterflies flapping and wandering organically
     *   in the outer margins (zero figure-8 robotic loops!)
     * ------------------------------------------------------------------------ */
    wisteria(initW, initH) {
      const pollen = [];
      for (let i = 0; i < 20; i++) {
        const isTeal = i % 3 === 0;
        pollen.push({
          x: edgeWeightedFrac(seededFrac(i, 67, 13)) * initW,
          y: seededFrac(i, 89, 29) * initH,
          r: 0.85 + seededFrac(i, 41, 7) * 1.35,
          vx: (seededFrac(i, 31, 11) - 0.5) * 0.12,
          vy: -(0.05 + seededFrac(i, 53, 17) * 0.11),
          phase: seededFrac(i, 79, 23) * TWO_PI,
          rgb: isTeal ? '94, 234, 212' : '192, 132, 252',
          core: isTeal ? '240, 253, 250' : '250, 245, 255'
        });
      }

      const petalColors = ['216, 180, 254', '192, 132, 252', '233, 213, 255', '167, 243, 208'];
      const petals = [];
      for (let i = 0; i < 18; i++) {
        const layer = i < 2 ? 2 : (i < 12 ? 1 : 0);
        const r = layer === 2 ? 7.2 : (layer === 1 ? (3.2 + seededFrac(i, 43, 9) * 1.7) : (1.9 + seededFrac(i, 61, 5) * 1.0));
        petals.push({
          x: layer === 2 ? strictMarginX(seededFrac(i, 73, 19), i % 2 === 0 ? -1 : 1, initW) : edgeWeightedFrac(seededFrac(i, 73, 19)) * initW,
          y: seededFrac(i, 97, 31) * initH,
          r,
          vx: -(0.14 + seededFrac(i, 29, 7) * 0.16),
          vy: 0.36 + seededFrac(i, 53, 13) * 0.24,
          rot: seededFrac(i, 37, 11) * TWO_PI,
          vrot: (seededFrac(i, 47, 3) - 0.5) * 0.016,
          flip: seededFrac(i, 83, 17) * TWO_PI,
          vflip: 0.018 + seededFrac(i, 31, 9) * 0.015,
          phase: seededFrac(i, 59, 21) * TWO_PI,
          rgb: petalColors[i % petalColors.length],
          layer,
          alpha: layer === 2 ? 0.058 : (layer === 1 ? 0.22 : 0.14)
        });
      }

      // Exactly 4 small luminous butterflies wandering naturally in left/right margins
      const butterflies = [];
      for (let i = 0; i < 4; i++) {
        const side = i < 2 ? -1 : 1;
        const startX = strictMarginX(0.25 + (i % 2) * 0.45, side, initW);
        const startY = initH * (0.24 + (i % 2) * 0.36 + seededFrac(i, 41, 9) * 0.12);
        butterflies.push({
          side,
          x: startX,
          y: startY,
          tx: startX,
          ty: startY,
          vx: side * 0.2,
          vy: -0.1,
          scale: 0.44 + (i % 2) * 0.11,
          flapSpeed: 0.0085 + i * 0.0011,
          phase: i * 1.7,
          retargetTimer: i * 90,
          topRgb: i % 2 === 0 ? '192, 132, 252' : '94, 234, 212',
          botRgb: i % 2 === 0 ? '94, 234, 212' : '168, 85, 247',
          alpha: 0.23
        });
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const moon = safeRadialGradient(ctx, width * 0.16, height * 0.14, 0, width * 0.16, height * 0.14, Math.max(width, height) * 0.45);
        moon.addColorStop(0, 'rgba(192, 132, 252, 0.055)');
        moon.addColorStop(0.55, 'rgba(94, 234, 212, 0.024)');
        moon.addColorStop(1, 'rgba(94, 234, 212, 0)');
        ctx.fillStyle = moon;
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 10; i++) {
          const m = pollen[i];
          drawGlowMote(ctx, m.x, m.y, m.r, m.rgb, m.core, 0.15, 2.8);
        }
        ctx.restore();
      }

      return {
        pools: [pollen, petals, butterflies],
        onResize(nw, nh, sx, sy) {
          for (let i = 0; i < butterflies.length; i++) {
            butterflies[i].tx = clamp(butterflies[i].tx * sx, 0, nw);
            butterflies[i].ty = clamp(butterflies[i].ty * sy, 0, nh);
          }
        },
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();

          // 1. Soft moonlit wisteria glow in upper corner + suspended pollen motes
          ctx.globalCompositeOperation = 'screen';
          const moonA = 0.042 + 0.022 * Math.sin(now * 0.0006);
          const moon = safeRadialGradient(ctx, width * 0.16, height * 0.14, 0, width * 0.16, height * 0.14, Math.max(width, height) * 0.46);
          moon.addColorStop(0, `rgba(192, 132, 252, ${fmtA(moonA)})`);
          moon.addColorStop(0.55, `rgba(94, 234, 212, ${fmtA(moonA * 0.42)})`);
          moon.addColorStop(1, 'rgba(94, 234, 212, 0)');
          ctx.fillStyle = moon;
          ctx.fillRect(0, 0, width, height);

          for (let i = 0; i < pollen.length; i++) {
            const m = pollen[i];
            m.x += (m.vx + Math.sin(now * 0.0009 + m.phase) * 0.09) * dt;
            m.y += (m.vy + Math.cos(now * 0.0008 + m.phase) * 0.06) * dt;
            if (m.x < -10) m.x = width + 10;
            if (m.x > width + 10) m.x = -10;
            if (m.y < -10) m.y = height + 10;
            if (m.y > height + 10) m.y = -10;

            const tw = 0.38 + 0.62 * (0.5 + 0.5 * Math.sin(now * 0.0018 + m.phase));
            drawGlowMote(ctx, m.x, m.y, m.r, m.rgb, m.core, 0.20 * tw, 3.0);
          }

          // 2. 4 margin-dwelling glowing butterflies with autonomous steering & wingbeat lift
          for (let i = 0; i < butterflies.length; i++) {
            const b = butterflies[i];
            b.retargetTimer -= dt;
            const dxT = b.tx - b.x;
            const dyT = b.ty - b.y;
            if (b.retargetTimer <= 0 || (dxT * dxT + dyT * dyT) < 500) {
              const seedStep = Math.floor(now * 0.0005) + i * 31;
              const uX = ((seedStep * 73 + 19) % 97) / 97;
              const uY = ((seedStep * 59 + 43) % 89) / 89;
              b.tx = strictMarginX(uX, b.side, width);
              b.ty = height * (0.14 + uY * 0.68);
              b.retargetTimer = 190 + (seedStep % 140);
            }

            // Gentle spring-like autonomous steering + subtle vertical lift per wingbeat
            const dist = Math.max(1, Math.hypot(dxT, dyT));
            const desiredVx = (dxT / dist) * 0.42;
            const desiredVy = (dyT / dist) * 0.34;
            b.vx += (desiredVx - b.vx) * 0.018 * dt;
            b.vy += (desiredVy - b.vy) * 0.018 * dt;
            const wingLift = -Math.sin(now * b.flapSpeed + b.phase) * 0.11;

            b.x += b.vx * dt;
            b.y += (b.vy + wingLift) * dt;
            drawGlowingButterfly(ctx, b, now);
          }

          // 3. Drifting wisteria petals
          ctx.globalCompositeOperation = 'source-over';
          const nightDraft = -0.10 + Math.sin(now * 0.0004) * 0.08;
          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            const sway = Math.sin(now * 0.0016 + p.phase) * 0.18;
            p.x += (p.vx + nightDraft + sway) * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            if (p.y > height + 18) {
              p.y = -14;
              const u = seededFrac(i + Math.floor(now * 0.001), 73, 19);
              p.x = p.layer === 2 ? strictMarginX(u, i % 2 === 0 ? -1 : 1, width) : edgeWeightedFrac(u) * width;
            }
            if (p.x < -20) p.x = width + 18;
            if (p.x > width + 20) p.x = -18;
            drawWisteriaPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.rgb, p.alpha, p.layer);
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 5. MIST (Hà Trụ Muichiro)
     * - Ultra-soft volumetric mist puffs (RadialGradient r = 220..380px,
     *   alpha 0.03..0.06) drifting very slowly left-to-right while keeping
     *   the 4K artwork razor-sharp
     * - ~10 mint bamboo & ginkgo leaves drifting slowly on the breeze
     * ------------------------------------------------------------------------ */
    mist(initW, initH) {
      const mistPuffs = [];
      for (let i = 0; i < 7; i++) {
        const rx = 220 + seededFrac(i, 61, 17) * 160; // 220..380px
        const ry = rx * (0.48 + seededFrac(i, 43, 9) * 0.24);
        // Place along upper canopy & lower forest floor so center stays crystal clear
        const yBand = i % 2 === 0
          ? (0.08 + seededFrac(i, 53, 7) * 0.20)
          : (0.76 + seededFrac(i, 71, 13) * 0.20);
        mistPuffs.push({
          x: seededFrac(i, 89, 19) * (initW + rx * 2) - rx,
          y: initH * yBand,
          rx,
          ry,
          vx: 0.11 + seededFrac(i, 37, 11) * 0.14,
          phase: seededFrac(i, 79, 5) * TWO_PI,
          rgb: i % 2 === 0 ? '204, 251, 241' : '186, 230, 253',
          baseAlpha: 0.032 + seededFrac(i, 47, 23) * 0.026 // 0.032..0.058
        });
      }

      const leafColors = ['204, 251, 241', '153, 246, 228', '167, 243, 208'];
      const leaves = [];
      for (let i = 0; i < 10; i++) {
        const layer = i === 0 ? 2 : (i < 7 ? 1 : 0);
        leaves.push({
          x: edgeWeightedFrac(seededFrac(i, 83, 17)) * initW,
          y: seededFrac(i, 97, 29) * initH,
          r: layer === 2 ? 6.5 : (layer === 1 ? (3.4 + seededFrac(i, 41, 7) * 1.4) : 2.3),
          vx: 0.20 + seededFrac(i, 31, 13) * 0.18, // drifts gently left -> right with mist
          vy: 0.28 + seededFrac(i, 53, 19) * 0.20,
          rot: seededFrac(i, 67, 11) * TWO_PI,
          vrot: (seededFrac(i, 73, 3) - 0.5) * 0.012,
          flip: seededFrac(i, 59, 23) * TWO_PI,
          vflip: 0.014 + seededFrac(i, 29, 7) * 0.012,
          phase: seededFrac(i, 47, 17) * TWO_PI,
          isGinkgo: i % 3 === 0,
          rgb: leafColors[i % leafColors.length],
          layer,
          alpha: layer === 2 ? 0.055 : (layer === 1 ? 0.21 : 0.14)
        });
      }

      const dewMotes = [];
      for (let i = 0; i < 12; i++) {
        dewMotes.push({
          x: edgeWeightedFrac(seededFrac(i, 71, 29)) * initW,
          y: seededFrac(i, 61, 13) * initH,
          r: 0.8 + seededFrac(i, 37, 7) * 1.1,
          vx: 0.08 + seededFrac(i, 43, 11) * 0.08,
          vy: -0.04 + (seededFrac(i, 53, 5) - 0.5) * 0.06,
          phase: seededFrac(i, 89, 17) * TWO_PI
        });
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < mistPuffs.length; i++) {
          const mp = mistPuffs[i];
          drawVolumetricMistPuff(ctx, mp.x, mp.y, mp.rx, mp.ry, mp.rgb, mp.baseAlpha * 0.85);
        }
        ctx.restore();
      }

      return {
        pools: [mistPuffs, leaves, dewMotes],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();

          // 1. Volumetric soft mist drifting very slowly left-to-right
          ctx.globalCompositeOperation = 'screen';
          for (let i = 0; i < mistPuffs.length; i++) {
            const mp = mistPuffs[i];
            mp.x += mp.vx * dt;
            const yFloat = Math.sin(now * 0.00038 + mp.phase) * 8;
            if (mp.x - mp.rx > width + 40) {
              mp.x = -mp.rx - 20;
            } else if (mp.x + mp.rx < -40) {
              mp.x = width + mp.rx + 20;
            }
            if (mp.y + mp.ry < -40) {
              mp.y = height * 0.14;
            } else if (mp.y - mp.ry > height + 40) {
              mp.y = height * 0.86;
            }
            const breathe = mp.baseAlpha * (0.85 + 0.15 * Math.sin(now * 0.00055 + mp.phase));
            drawVolumetricMistPuff(ctx, mp.x, mp.y + yFloat, mp.rx, mp.ry, mp.rgb, breathe);
          }

          // Subtle suspended mist dew motes
          for (let i = 0; i < dewMotes.length; i++) {
            const m = dewMotes[i];
            m.x += m.vx * dt;
            m.y += (m.vy + Math.sin(now * 0.0009 + m.phase) * 0.04) * dt;
            if (m.x < -10) m.x = width + 10;
            if (m.x > width + 10) m.x = -10;
            if (m.y < -10) m.y = height + 10;
            if (m.y > height + 10) m.y = -10;
            const a = 0.06 + 0.09 * (0.5 + 0.5 * Math.sin(now * 0.0014 + m.phase));
            drawGlowMote(ctx, m.x, m.y, m.r, '153, 246, 228', '240, 253, 250', a, 2.6);
          }

          // 2. ~10 Mint bamboo & ginkgo leaves drifting gently on the breeze
          ctx.globalCompositeOperation = 'source-over';
          for (let i = 0; i < leaves.length; i++) {
            const lf = leaves[i];
            const sway = Math.sin(now * 0.0013 + lf.phase) * 0.16;
            lf.x += (lf.vx + sway) * dt;
            lf.y += (lf.vy + Math.cos(now * 0.0011 + lf.phase) * 0.06) * dt;
            lf.rot += lf.vrot * dt;
            lf.flip += lf.vflip * dt;

            if (lf.y > height + 18) {
              lf.y = -16;
              lf.x = edgeWeightedFrac(seededFrac(i + Math.floor(now * 0.0007), 83, 17)) * width;
            } else if (lf.y < -22) {
              lf.y = height + 16;
            }
            if (lf.x > width + 22) lf.x = -20;
            else if (lf.x < -22) lf.x = width + 20;

            if (lf.isGinkgo) {
              drawGinkgoLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.rgb, lf.alpha, lf.layer);
            } else {
              drawBambooLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.rgb, lf.alpha, lf.layer);
            }
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 6. THUNDER (Zenitsu Agatsuma)
     * - Tiny golden electrostatic dust motes floating slowly in pre-storm air
     * - Every 3.5–6.0 seconds, a single crisp micro static arc flashes briefly
     *   in a dark outer margin for ~180ms and vanishes (never crossing the face!)
     * ------------------------------------------------------------------------ */
    thunder(initW, initH) {
      const chargeMotes = [];
      for (let i = 0; i < 24; i++) {
        const isBokeh = i < 3;
        chargeMotes.push({
          x: isBokeh ? strictMarginX(seededFrac(i, 79, 13), i % 2 === 0 ? -1 : 1, initW) : edgeWeightedFrac(seededFrac(i, 79, 13)) * initW,
          y: seededFrac(i, 97, 23) * initH,
          r: isBokeh ? (13 + i * 3.5) : (0.8 + seededFrac(i, 43, 7) * 1.4),
          vx: (seededFrac(i, 31, 17) - 0.5) * 0.14,
          vy: -(0.06 + seededFrac(i, 59, 11) * 0.12),
          phase: seededFrac(i, 67, 19) * TWO_PI,
          isCyan: i % 5 === 0,
          isBokeh
        });
      }

      // Micro static arc state (strictly 3500..6000ms interval, 180ms duration, outer margins only)
      const arcState = {
        nextTriggerAt: 0,
        initialized: false,
        activeStart: -1000,
        duration: 180,
        ptsX: new Float64Array(7),
        ptsY: new Float64Array(7),
        branchX: new Float64Array(3),
        branchY: new Float64Array(3),
        cx: 0,
        cy: 0,
        seq: 0
      };

      function spawnMicroArc(width, height, now) {
        arcState.seq += 1;
        const s = arcState.seq;
        const side = s % 2 === 0 ? -1 : 1;
        // Strictly outer dark margins (4%..17% or 83%..96% width)
        const baseX = side < 0
          ? width * (0.045 + seededFrac(s, 61, 13) * 0.125)
          : width * (0.83 + seededFrac(s, 61, 13) * 0.125);
        const baseY = height * (0.14 + seededFrac(s, 79, 29) * 0.68);
        const totalLen = 30 + seededFrac(s, 43, 7) * 26;
        const baseAng = seededFrac(s, 53, 19) * TWO_PI;
        const dirX = Math.cos(baseAng);
        const dirY = Math.sin(baseAng);
        const perpX = -dirY;
        const perpY = dirX;

        for (let i = 0; i < 7; i++) {
          const t = (i / 6) - 0.5;
          const jag = (i === 0 || i === 6) ? 0 : (((s * 37 + i * 59) % 20) / 10 - 1) * 5.2;
          arcState.ptsX[i] = baseX + dirX * (t * totalLen) + perpX * jag;
          arcState.ptsY[i] = baseY + dirY * (t * totalLen) + perpY * jag;
        }
        // Tiny secondary fork off segment 3
        arcState.branchX[0] = arcState.ptsX[3];
        arcState.branchY[0] = arcState.ptsY[3];
        const forkAng = baseAng + (side < 0 ? 0.65 : -0.65);
        arcState.branchX[1] = arcState.ptsX[3] + Math.cos(forkAng) * 8 + perpX * 2.5;
        arcState.branchY[1] = arcState.ptsY[3] + Math.sin(forkAng) * 8 + perpY * 2.5;
        arcState.branchX[2] = arcState.branchX[1] + Math.cos(forkAng + 0.25) * 7;
        arcState.branchY[2] = arcState.branchY[1] + Math.sin(forkAng + 0.25) * 7;

        arcState.cx = baseX;
        arcState.cy = baseY;
        arcState.activeStart = now;
        arcState.nextTriggerAt = now + 3500 + seededFrac(s, 89, 17) * 2500; // 3.5s .. 6.0s
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 3; i < 15; i++) {
          const m = chargeMotes[i];
          drawGlowMote(ctx, m.x, m.y, m.r, '250, 204, 21', '254, 249, 195', 0.16, 2.8);
        }
        ctx.restore();
      }

      return {
        pools: [chargeMotes],
        drawStatic,
        onResize(_nw, _nh, sx, sy) {
          if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
          arcState.cx *= sx;
          arcState.cy *= sy;
          for (let i = 0; i < arcState.ptsX.length; i++) {
            arcState.ptsX[i] *= sx;
            arcState.ptsY[i] *= sy;
          }
          for (let i = 0; i < arcState.branchX.length; i++) {
            arcState.branchX[i] *= sx;
            arcState.branchY[i] *= sy;
          }
        },
        step(ctx, width, height, now, dt) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';

          if (!arcState.initialized) {
            arcState.initialized = true;
            arcState.nextTriggerAt = now + 1800;
          }

          // 1. Floating electrostatic golden dust motes
          for (let i = 0; i < chargeMotes.length; i++) {
            const m = chargeMotes[i];
            m.x += (m.vx + Math.sin(now * 0.0011 + m.phase) * 0.08) * dt;
            m.y += (m.vy + Math.cos(now * 0.0009 + m.phase) * 0.05) * dt;
            if (m.x < -14) m.x = width + 14;
            if (m.x > width + 14) m.x = -14;
            if (m.y < -14) m.y = height + 14;
            if (m.y > height + 14) m.y = -14;

            if (m.isBokeh) {
              const ba = 0.042 * (0.7 + 0.3 * Math.sin(now * 0.0009 + m.phase));
              drawOpticalBokeh(ctx, m.x, m.y, m.r, '250, 204, 21', ba);
            } else {
              const spark = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(now * 0.0024 + m.phase), 2.0);
              const halo = m.isCyan ? '56, 189, 248' : '250, 204, 21';
              const core = m.isCyan ? '224, 242, 254' : '255, 251, 235';
              drawGlowMote(ctx, m.x, m.y, m.r, halo, core, 0.23 * spark, 3.0);
            }
          }

          // 2. Crisp 180ms micro static arc in outer dark margin every 3.5–6.0s
          if (now >= arcState.nextTriggerAt) {
            spawnMicroArc(width, height, now);
          }
          const elapsed = now - arcState.activeStart;
          if (elapsed >= 0 && elapsed <= arcState.duration) {
            const p = elapsed / arcState.duration;
            const env = p < 0.16 ? (p / 0.16) : Math.pow(1 - (p - 0.16) / 0.84, 1.6);
            // Subtle local air ionization pocket
            drawOpticalBokeh(ctx, arcState.cx, arcState.cy, 38, '250, 204, 21', 0.13 * env);

            ctx.lineCap = 'round';
            ctx.lineJoin = 'bevel';

            // Outer golden corona
            ctx.strokeStyle = `rgba(250, 204, 21, ${fmtA(0.28 * env)})`;
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(arcState.ptsX[0], arcState.ptsY[0]);
            for (let i = 1; i < 7; i++) ctx.lineTo(arcState.ptsX[i], arcState.ptsY[i]);
            ctx.stroke();

            // Crisp white-gold static filament
            ctx.strokeStyle = `rgba(254, 252, 232, ${fmtA(0.82 * env)})`;
            ctx.lineWidth = 0.95;
            ctx.beginPath();
            ctx.moveTo(arcState.ptsX[0], arcState.ptsY[0]);
            for (let i = 1; i < 7; i++) ctx.lineTo(arcState.ptsX[i], arcState.ptsY[i]);
            ctx.stroke();

            // Micro branch
            ctx.strokeStyle = `rgba(253, 224, 71, ${fmtA(0.58 * env)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(arcState.branchX[0], arcState.branchY[0]);
            ctx.lineTo(arcState.branchX[1], arcState.branchY[1]);
            ctx.lineTo(arcState.branchX[2], arcState.branchY[2]);
            ctx.stroke();
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 7. SUN_WATER (Tanjiro Kamado)
     * - Warm Hinokami Kagura fine embers drifting gently upward
     * - Clear azure water-mist droplets suspended peacefully in the night
     * - Zero twisting dual ribbons!
     * ------------------------------------------------------------------------ */
    sun_water(initW, initH) {
      const sunEmbers = [];
      for (let i = 0; i < 18; i++) {
        const life = seededFrac(i, 89, 19);
        sunEmbers.push({
          x: edgeWeightedFrac(seededFrac(i, 73, 11)) * initW,
          y: initH - life * initH * 0.72,
          life,
          lifeSpeed: 0.0019 + seededFrac(i, 41, 7) * 0.0016,
          r0: 1.0 + seededFrac(i, 59, 13) * 1.9,
          vy: 0.48 + seededFrac(i, 37, 23) * 0.42,
          phase: seededFrac(i, 67, 29) * TWO_PI
        });
      }

      const waterDew = [];
      for (let i = 0; i < 18; i++) {
        const isGlassDrop = i % 3 === 0;
        waterDew.push({
          x: edgeWeightedFrac(seededFrac(i, 83, 31)) * initW,
          y: seededFrac(i, 97, 17) * initH,
          r: isGlassDrop ? (1.8 + seededFrac(i, 47, 9) * 1.8) : (0.9 + seededFrac(i, 53, 5) * 1.2),
          vx: (seededFrac(i, 29, 13) - 0.5) * 0.12,
          vy: -(0.10 + seededFrac(i, 61, 7) * 0.16),
          phase: seededFrac(i, 71, 19) * TWO_PI,
          isGlassDrop
        });
      }

      function drawDualCornerBreath(ctx, width, height, aSun, aWater) {
        const gSun = safeRadialGradient(ctx, width * 0.12, height * 0.92, 0, width * 0.12, height * 0.92, Math.max(width, height) * 0.44);
        gSun.addColorStop(0, `rgba(249, 115, 22, ${fmtA(aSun)})`);
        gSun.addColorStop(0.6, `rgba(220, 38, 38, ${fmtA(aSun * 0.35)})`);
        gSun.addColorStop(1, 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = gSun;
        ctx.fillRect(0, 0, width, height);

        const gWater = safeRadialGradient(ctx, width * 0.88, height * 0.14, 0, width * 0.88, height * 0.14, Math.max(width, height) * 0.46);
        gWater.addColorStop(0, `rgba(56, 189, 248, ${fmtA(aWater)})`);
        gWater.addColorStop(0.6, `rgba(14, 165, 233, ${fmtA(aWater * 0.35)})`);
        gWater.addColorStop(1, 'rgba(14, 165, 233, 0)');
        ctx.fillStyle = gWater;
        ctx.fillRect(0, 0, width, height);
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        drawDualCornerBreath(ctx, width, height, 0.055, 0.048);
        for (let i = 0; i < 8; i++) {
          const d = waterDew[i];
          drawGlowMote(ctx, d.x, d.y, d.r, '56, 189, 248', '224, 242, 254', 0.15, 2.8);
        }
        ctx.restore();
      }

      return {
        pools: [sunEmbers, waterDew],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';

          const aSun = 0.045 + 0.024 * Math.sin(now * 0.00085);
          const aWater = 0.040 + 0.020 * Math.cos(now * 0.00072);
          drawDualCornerBreath(ctx, width, height, aSun, aWater);

          // 1. Warm Hinokami rising embers
          for (let i = 0; i < sunEmbers.length; i++) {
            const e = sunEmbers[i];
            e.life += e.lifeSpeed * dt;
            if (e.life >= 1 || e.y < -16) {
              e.life = 0;
              e.x = edgeWeightedFrac(seededFrac(i + Math.floor(now * 0.001), 73, 11)) * width;
              e.y = height + 6;
            }
            if (typeof e.y !== 'number' || !Number.isFinite(e.y)) {
              e.y = height - e.life * height * 0.72;
            }
            const p = clamp(e.life, 0, 1);
            e.x += Math.sin(now * 0.0016 + e.phase + p * 3.0) * 0.24 * dt;
            e.y -= e.vy * (1.05 - p * 0.35) * dt;

            const env = clamp(p / 0.10, 0, 1) * Math.pow(1 - p, 1.45);
            const curR = Math.max(0.35, e.r0 * (1 - p * 0.68));
            const halo = p < 0.45 ? '251, 146, 60' : '239, 68, 68';
            drawGlowMote(ctx, e.x, e.y, curR, halo, '255, 237, 213', 0.25 * env, 2.9);
          }

          // 2. Clear azure night dew & water mist
          for (let i = 0; i < waterDew.length; i++) {
            const d = waterDew[i];
            d.x += (d.vx + Math.sin(now * 0.0010 + d.phase) * 0.09) * dt;
            d.y += d.vy * dt;
            if (d.y < -12) {
              d.y = height + 10;
              d.x = edgeWeightedFrac(seededFrac(i + Math.floor(now * 0.0009), 83, 31)) * width;
            }
            if (d.x < -12) d.x = width + 12;
            if (d.x > width + 12) d.x = -12;

            const shimmer = 0.65 + 0.35 * Math.sin(now * 0.0019 + d.phase);
            if (d.isGlassDrop) {
              drawCrystalBubble(ctx, d.x, d.y, d.r, 0.20 * shimmer, false);
            } else {
              drawGlowMote(ctx, d.x, d.y, d.r, '56, 189, 248', '224, 242, 254', 0.19 * shimmer, 3.0);
            }
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 8. LOVE (Luyến Trụ Mitsuri)
     * - Pastel sakura petals falling slowly on a natural spring breeze from
     *   top-right toward bottom-left (notched petals + 3D wind tumble + DoF)
     * - Soft rose & matcha-tinted optical bokeh along the outer margins
     * ------------------------------------------------------------------------ */
    love(initW, initH) {
      const sakuraPalette = [
        '251, 207, 232', // soft sakura pink
        '249, 168, 212', // warm blossom rose
        '255, 228, 230', // pale petal blush
        '244, 114, 182'  // deeper accent petal
      ];

      const petals = [];
      for (let i = 0; i < 24; i++) {
        const layer = i < 3 ? 2 : (i < 16 ? 1 : 0);
        const r = layer === 2 ? (7.8 + i * 1.4) : (layer === 1 ? (3.5 + seededFrac(i, 47, 9) * 1.9) : (2.1 + seededFrac(i, 61, 13) * 1.0));
        const spd = layer === 2 ? 1.25 : (layer === 1 ? 1.0 : 0.66);
        petals.push({
          x: layer === 2 ? strictMarginX(seededFrac(i, 89, 17), i % 2 === 0 ? -1 : 1, initW) : seededFrac(i, 89, 17) * initW,
          y: seededFrac(i, 97, 29) * initH,
          r,
          vx: -(0.38 + seededFrac(i, 37, 7) * 0.26) * spd, // top-right -> bottom-left
          vy: (0.40 + seededFrac(i, 53, 19) * 0.26) * spd,
          rot: seededFrac(i, 67, 11) * TWO_PI,
          vrot: -(0.008 + seededFrac(i, 41, 3) * 0.014),
          flip: seededFrac(i, 73, 23) * TWO_PI,
          vflip: 0.020 + seededFrac(i, 29, 13) * 0.016,
          phase: seededFrac(i, 59, 7) * TWO_PI,
          rgb: sakuraPalette[i % sakuraPalette.length],
          layer,
          alpha: layer === 2 ? 0.062 : (layer === 1 ? 0.24 : 0.15)
        });
      }

      const marginBokeh = [];
      for (let i = 0; i < 8; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        marginBokeh.push({
          side,
          x: strictMarginX(seededFrac(i, 71, 19), side, initW),
          y: (0.12 + seededFrac(i, 83, 11) * 0.78) * initH,
          r: 18 + seededFrac(i, 43, 7) * 26,
          vy: -(0.06 + seededFrac(i, 31, 5) * 0.08),
          phase: seededFrac(i, 61, 17) * TWO_PI,
          rgb: i % 4 === 3 ? '167, 243, 208' : '249, 168, 212', // delicate matcha hint + sakura pink
          alpha: 0.042 + seededFrac(i, 53, 9) * 0.028
        });
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < marginBokeh.length; i++) {
          const b = marginBokeh[i];
          drawOpticalBokeh(ctx, b.x, b.y, b.r, b.rgb, b.alpha * 0.85);
        }
        ctx.restore();
      }

      return {
        pools: [petals, marginBokeh],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();

          // 1. Soft rose bokeh in the outer margins
          ctx.globalCompositeOperation = 'screen';
          for (let i = 0; i < marginBokeh.length; i++) {
            const b = marginBokeh[i];
            b.y += b.vy * dt;
            const swayX = Math.sin(now * 0.0006 + b.phase) * 0.08;
            b.x += swayX * dt;
            if (b.y < -b.r * 2 || b.y > height + b.r * 2 || b.x < -b.r * 2 || b.x > width + b.r * 2) {
              const u = seededFrac(i + Math.floor(now * 0.0007), 71, 19);
              b.x = strictMarginX(u, b.side || (i % 2 === 0 ? -1 : 1), width);
              if (b.y < -b.r * 2) b.y = height + b.r * 1.8;
              else if (b.y > height + b.r * 2) b.y = -b.r * 1.8;
              else b.y = clamp(b.y, 0, height);
            }
            const pulse = 0.80 + 0.20 * Math.sin(now * 0.0011 + b.phase);
            drawOpticalBokeh(ctx, b.x, b.y, b.r, b.rgb, b.alpha * pulse);
          }

          // 2. Spring sakura blossom shower (top-right -> bottom-left)
          ctx.globalCompositeOperation = 'source-over';
          const springGust = -0.12 * (0.6 + 0.4 * Math.sin(now * 0.00052));
          for (let i = 0; i < petals.length; i++) {
            const p = petals[i];
            const flutter = Math.sin(now * 0.0018 + p.phase);
            p.x += (p.vx + springGust + flutter * 0.18) * dt;
            p.y += (p.vy - Math.abs(flutter) * 0.08) * dt;
            p.rot += (p.vrot + flutter * 0.004) * dt;
            p.flip += p.vflip * dt;

            if (p.y > height + 20 || p.x < -28 || p.x > width + 28 || p.y < -28) {
              const u = seededFrac(i + Math.floor(now * 0.0009), 89, 17);
              if (p.layer === 2) {
                p.x = strictMarginX(u, i % 2 === 0 ? -1 : 1, width);
                p.y = -18;
              } else if (u < 0.72) {
                // Spawn along top edge biased right
                p.x = width * (0.18 + (u / 0.72) * 0.82);
                p.y = -16;
              } else {
                // Spawn along upper-right edge so diagonal stream stays full
                p.x = width + 16;
                p.y = height * (((u - 0.72) / 0.28) * 0.55);
              }
            }

            const atten = p.layer === 1 ? (0.68 + 0.32 * centerAttenuation(p.x, width)) : 1;
            drawSakuraPetal(ctx, p.x, p.y, p.r, p.rot, p.flip, p.rgb, p.alpha * atten, p.layer);
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 9. SERPENT (Xà Trụ Obanai)
     * - Misty silver-violet moonlight shafts slanting through dark canopy
     * - Night forest fireflies in emerald green & lavender drifting lazily
     *   among dark branches (zero slithering ribbons across the screen!)
     * ------------------------------------------------------------------------ */
    serpent(initW, initH) {
      const moonShafts = [
        { rx: 0.14, topW: 48, botW: 124, lenRatio: 0.64, ang: 17 * DEG, phase: 0.8, rgb: '216, 180, 254', alpha: 0.044 },
        { rx: 0.82, topW: 58, botW: 146, lenRatio: 0.70, ang: -16 * DEG, phase: 2.4, rgb: '203, 213, 225', alpha: 0.048 },
        { rx: 0.92, topW: 36, botW: 96, lenRatio: 0.54, ang: -14 * DEG, phase: 4.1, rgb: '167, 243, 208', alpha: 0.034 }
      ];

      const fireflies = [];
      for (let i = 0; i < 22; i++) {
        const isEmerald = i % 2 === 0;
        const isBokeh = i < 3;
        let initVy = (seededFrac(i, 53, 13) - 0.55) * 0.15;
        if (Math.abs(initVy) < 0.045) {
          initVy = (initVy < 0 ? -1 : 1) * 0.055;
        }
        fireflies.push({
          x: isBokeh ? strictMarginX(seededFrac(i, 79, 17), i % 2 === 0 ? -1 : 1, initW) : edgeWeightedFrac(seededFrac(i, 79, 17)) * initW,
          y: (0.14 + seededFrac(i, 97, 23) * 0.80) * initH,
          r: isBokeh ? (15 + i * 4) : (1.1 + seededFrac(i, 43, 11) * 1.6),
          vx: (seededFrac(i, 31, 7) - 0.5) * 0.18,
          vy: initVy,
          phase: seededFrac(i, 67, 29) * TWO_PI,
          pulseSpeed: 0.0012 + seededFrac(i, 37, 5) * 0.0010,
          haloRgb: isEmerald ? '52, 211, 153' : '192, 132, 252',
          coreRgb: isEmerald ? '209, 250, 229' : '243, 232, 255',
          isBokeh
        });
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < moonShafts.length; i++) {
          const s = moonShafts[i];
          drawCausticLightShaft(ctx, width * s.rx, -10, s.topW, s.botW, height * s.lenRatio, s.ang, s.rgb, s.alpha * 0.85);
        }
        for (let i = 3; i < 13; i++) {
          const f = fireflies[i];
          drawGlowMote(ctx, f.x, f.y, f.r, f.haloRgb, f.coreRgb, 0.16, 3.2);
        }
        ctx.restore();
      }

      return {
        pools: [fireflies],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';

          // 1. Slanting silver-lavender moonlight beams through tree canopy
          for (let i = 0; i < moonShafts.length; i++) {
            const s = moonShafts[i];
            const ang = s.ang + Math.sin(now * 0.00035 + s.phase) * (1.2 * DEG);
            const a = s.alpha * (0.82 + 0.18 * Math.sin(now * 0.00062 + s.phase));
            drawCausticLightShaft(ctx, width * s.rx, -10, s.topW, s.botW, height * s.lenRatio, ang, s.rgb, a);
          }

          // 2. Emerald & lavender forest fireflies with biological lantern pulse
          for (let i = 0; i < fireflies.length; i++) {
            const f = fireflies[i];
            const wanderX = Math.sin(now * 0.00085 + f.phase) * 0.14;
            const wanderY = Math.cos(now * 0.00072 + f.phase * 1.4) * 0.11;
            f.x += (f.vx + wanderX) * dt;
            f.y += (f.vy + wanderY) * dt;

            if (f.x < -18) f.x = width + 18;
            if (f.x > width + 18) f.x = -18;
            if (f.y < height * 0.06) {
              f.y = height * 0.06;
              f.vy = Math.max(0.045, Math.abs(f.vy));
            } else if (f.y > height * 0.96) {
              f.y = height * 0.96;
              f.vy = -Math.max(0.045, Math.abs(f.vy));
            }

            // Natural firefly glow curve: smooth swell with calm dark rest
            const rawWave = 0.5 + 0.5 * Math.sin(now * f.pulseSpeed + f.phase);
            const bioGlow = Math.pow(rawWave, 2.2);

            if (f.isBokeh) {
              drawOpticalBokeh(ctx, f.x, f.y, f.r, f.haloRgb, 0.055 * (0.35 + 0.65 * bioGlow));
            } else {
              const a = (0.045 + 0.215 * bioGlow) * centerAttenuation(f.x, width);
              drawGlowMote(ctx, f.x, f.y, f.r, f.haloRgb, f.coreRgb, a, 3.4);
            }
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 10. WIND (Phong Trụ Sanemi)
     * - Green maple leaves & grass-pollen motes sweeping along a single
     *   diagonal wind direction with realistic outdoor gust cadence
     *   (calm lulls -> smooth brisk gust -> calm lull)
     * - 4 ultra-thin translucent air-current wisps (alpha <= 0.11) during gusts
     * ------------------------------------------------------------------------ */
    wind(initW, initH) {
      const leafPalette = ['134, 239, 172', '74, 222, 128', '187, 247, 208'];
      const leaves = [];
      for (let i = 0; i < 14; i++) {
        const layer = i < 2 ? 2 : (i < 10 ? 1 : 0);
        leaves.push({
          x: seededFrac(i, 83, 13) * initW,
          y: seededFrac(i, 97, 29) * initH,
          r: layer === 2 ? 6.8 : (layer === 1 ? (3.3 + seededFrac(i, 41, 7) * 1.5) : 2.1),
          vxBase: 0.72 + seededFrac(i, 53, 11) * 0.42, // consistent diagonal left -> right
          vyBase: 0.34 + seededFrac(i, 37, 19) * 0.24,
          rot: seededFrac(i, 67, 5) * TWO_PI,
          vrot: 0.014 + seededFrac(i, 29, 17) * 0.016,
          flip: seededFrac(i, 73, 23) * TWO_PI,
          vflip: 0.024 + seededFrac(i, 47, 9) * 0.018,
          phase: seededFrac(i, 61, 3) * TWO_PI,
          rgb: leafPalette[i % leafPalette.length],
          layer,
          alpha: layer === 2 ? 0.058 : (layer === 1 ? 0.23 : 0.14)
        });
      }

      const grassMotes = [];
      for (let i = 0; i < 18; i++) {
        grassMotes.push({
          x: seededFrac(i, 79, 31) * initW,
          y: seededFrac(i, 89, 17) * initH,
          r: 0.8 + seededFrac(i, 43, 13) * 1.1,
          vxBase: 0.85 + seededFrac(i, 59, 7) * 0.55,
          vyBase: 0.26 + seededFrac(i, 31, 11) * 0.20,
          phase: seededFrac(i, 71, 19) * TWO_PI
        });
      }

      const wisps = [];
      for (let i = 0; i < 4; i++) {
        wisps.push({
          x: seededFrac(i, 67, 19) * initW,
          y: initH * (0.14 + i * 0.23),
          len: 85 + seededFrac(i, 47, 7) * 55,
          life: i * 0.27,
          speed: 0.008 + seededFrac(i, 37, 13) * 0.004
        });
      }

      /**
       * Realistic outdoor breeze envelope: calm drift (~0.45) punctuated by smooth
       * natural gusts (~1.65) every few seconds.
       */
      function getGustMultiplier(now) {
        const slow = 0.5 + 0.5 * Math.sin(now * 0.00058);
        const swell = Math.pow(0.5 + 0.5 * Math.sin(now * 0.00105 - 0.8), 2.6);
        return 0.44 + slow * 0.36 + swell * 0.92;
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 2; i < 8; i++) {
          const lf = leaves[i];
          drawMapleLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.rgb, lf.alpha * 0.85, lf.layer);
        }
        ctx.restore();
      }

      return {
        pools: [leaves, grassMotes, wisps],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();
          const gust = getGustMultiplier(now);

          // 1. Subtle translucent air-current wisps during wind swells (alpha <= 0.11)
          ctx.globalCompositeOperation = 'screen';
          const wispVisibility = clamp((gust - 0.65) / 0.85, 0, 1);
          for (let i = 0; i < wisps.length; i++) {
            const w = wisps[i];
            w.life += w.speed * (0.6 + gust * 0.6) * dt;
            w.x += (3.2 + gust * 2.6) * dt;
            w.y += (0.85 + gust * 0.65) * dt;
            if (w.life >= 1 || w.x > width + w.len) {
              w.life = 0;
              const s = Math.floor(now * 0.001) + i * 29;
              w.x = -w.len - (s % 80);
              w.y = height * (0.08 + ((s * 43) % 84) / 100);
            }
            const env = Math.sin(clamp(w.life, 0, 1) * Math.PI);
            const a = 0.108 * env * wispVisibility * centerAttenuation(w.x, width);
            if (a > 0.006) {
              const x2 = w.x + w.len;
              const y2 = w.y + w.len * 0.25;
              const grad = safeLinearGradient(ctx, w.x, w.y, x2, y2);
              grad.addColorStop(0, 'rgba(187, 247, 208, 0)');
              grad.addColorStop(0.5, `rgba(220, 252, 231, ${fmtA(a)})`);
              grad.addColorStop(1, 'rgba(187, 247, 208, 0)');
              ctx.strokeStyle = grad;
              ctx.lineWidth = 0.85;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(w.x, w.y);
              ctx.quadraticCurveTo((w.x + x2) * 0.5, (w.y + y2) * 0.5 - 7, x2, y2);
              ctx.stroke();
            }
          }

          // 2. sunlit grass-seed / wind motes sweeping diagonally
          for (let i = 0; i < grassMotes.length; i++) {
            const m = grassMotes[i];
            m.x += m.vxBase * gust * dt;
            m.y += (m.vyBase * (0.7 + gust * 0.3) + Math.sin(now * 0.002 + m.phase) * 0.10) * dt;
            if (m.x > width + 16 || m.y > height + 16) {
              const u = seededFrac(i + Math.floor(now * 0.0011), 79, 31);
              if (u < 0.55) {
                m.x = -12;
                m.y = u / 0.55 * height * 0.85;
              } else {
                m.x = ((u - 0.55) / 0.45) * width * 0.85;
                m.y = -12;
              }
            }
            const a = 0.16 * centerAttenuation(m.x, width);
            drawGlowMote(ctx, m.x, m.y, m.r, '134, 239, 172', '240, 253, 244', a, 2.5);
          }

          // 3. Green maple leaves carried naturally on the variable wind
          ctx.globalCompositeOperation = 'source-over';
          for (let i = 0; i < leaves.length; i++) {
            const lf = leaves[i];
            const eddy = Math.sin(now * 0.0022 + lf.phase) * 0.18 * gust;
            lf.x += lf.vxBase * gust * dt;
            lf.y += (lf.vyBase * (0.85 + 0.15 * gust) + eddy) * dt;
            lf.rot += lf.vrot * (0.6 + 0.7 * gust) * dt;
            lf.flip += lf.vflip * (0.6 + 0.7 * gust) * dt;

            if (lf.x > width + 24 || lf.y > height + 24) {
              const u = seededFrac(i + Math.floor(now * 0.0008), 83, 13);
              if (u < 0.52) {
                lf.x = -18;
                lf.y = (u / 0.52) * height * 0.82;
              } else {
                lf.x = ((u - 0.52) / 0.48) * width * 0.85;
                lf.y = -18;
              }
            }
            const atten = lf.layer === 1 ? (0.72 + 0.28 * centerAttenuation(lf.x, width)) : centerAttenuation(lf.x, width);
            drawMapleLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.rgb, lf.alpha * atten, lf.layer);
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 11. STONE (Nham Trụ Gyomei)
     * - Solemn golden autumn ginkgo leaves drifting slowly down from above
     * - Warm amber prayer-incense light motes rising straight and serenely
     * ------------------------------------------------------------------------ */
    stone(initW, initH) {
      const ginkgoColors = ['253, 224, 71', '250, 204, 21', '254, 240, 138', '245, 158, 11'];
      const leaves = [];
      for (let i = 0; i < 14; i++) {
        const layer = i < 2 ? 2 : (i < 10 ? 1 : 0);
        leaves.push({
          x: layer === 2 ? strictMarginX(seededFrac(i, 79, 13), i % 2 === 0 ? -1 : 1, initW) : edgeWeightedFrac(seededFrac(i, 79, 13)) * initW,
          y: seededFrac(i, 97, 23) * initH,
          r: layer === 2 ? 7.2 : (layer === 1 ? (3.6 + seededFrac(i, 43, 9) * 1.6) : 2.3),
          vy: 0.28 + seededFrac(i, 53, 7) * 0.18, // slow, meditative descent
          rot: seededFrac(i, 67, 19) * TWO_PI,
          vrot: (seededFrac(i, 31, 11) - 0.5) * 0.010,
          flip: seededFrac(i, 73, 5) * TWO_PI,
          vflip: 0.012 + seededFrac(i, 37, 13) * 0.010,
          phase: seededFrac(i, 61, 17) * TWO_PI,
          rgb: ginkgoColors[i % ginkgoColors.length],
          layer,
          alpha: layer === 2 ? 0.056 : (layer === 1 ? 0.23 : 0.15)
        });
      }

      const amberMotes = [];
      for (let i = 0; i < 20; i++) {
        amberMotes.push({
          x: edgeWeightedFrac(seededFrac(i, 89, 29)) * initW,
          y: seededFrac(i, 83, 17) * initH,
          r: 0.9 + seededFrac(i, 47, 11) * 1.5,
          vy: -(0.16 + seededFrac(i, 59, 7) * 0.16), // rises straight and still
          phase: seededFrac(i, 71, 23) * TWO_PI,
          rgb: i % 3 === 0 ? '245, 158, 11' : '251, 191, 36'
        });
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const baseGlow = safeLinearGradient(ctx, 0, height * 0.88, 0, height);
        baseGlow.addColorStop(0, 'rgba(245, 158, 11, 0)');
        baseGlow.addColorStop(1, 'rgba(245, 158, 11, 0.065)');
        ctx.fillStyle = baseGlow;
        ctx.fillRect(0, height * 0.88, width, height * 0.12);
        for (let i = 0; i < 10; i++) {
          const m = amberMotes[i];
          drawGlowMote(ctx, m.x, m.y, m.r, m.rgb, '255, 251, 235', 0.16, 2.8);
        }
        ctx.restore();
      }

      return {
        pools: [leaves, amberMotes],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();

          // 1. Tranquil amber temple warmth & straight-rising serene light motes
          ctx.globalCompositeOperation = 'screen';
          const warmA = 0.048 + 0.022 * Math.sin(now * 0.00065);
          const baseGlow = safeLinearGradient(ctx, 0, height * 0.88, 0, height);
          baseGlow.addColorStop(0, 'rgba(245, 158, 11, 0)');
          baseGlow.addColorStop(1, `rgba(245, 158, 11, ${fmtA(warmA)})`);
          ctx.fillStyle = baseGlow;
          ctx.fillRect(0, height * 0.88, width, height * 0.12);

          for (let i = 0; i < amberMotes.length; i++) {
            const m = amberMotes[i];
            // Straight meditative ascent (±0.03px near-zero horizontal drift)
            m.x += Math.sin(now * 0.0007 + m.phase) * 0.03 * dt;
            m.y += m.vy * dt;
            if (m.y < -12) {
              m.y = height + 10;
              m.x = edgeWeightedFrac(seededFrac(i + Math.floor(now * 0.0008), 89, 29)) * width;
            } else if (m.y > height + 16) {
              m.y = -10;
            }
            if (m.x < -14) m.x = width + 14;
            if (m.x > width + 14) m.x = -14;
            const vEnv = clamp(Math.min(m.y / (height * 0.16), (height - m.y + 20) / 60), 0.1, 1);
            const calmPulse = 0.72 + 0.28 * Math.sin(now * 0.0012 + m.phase);
            drawGlowMote(ctx, m.x, m.y, m.r, m.rgb, '255, 251, 235', 0.22 * vEnv * calmPulse, 3.0);
          }

          // 2. Solemn autumn ginkgo leaves drifting gently down
          ctx.globalCompositeOperation = 'source-over';
          for (let i = 0; i < leaves.length; i++) {
            const lf = leaves[i];
            const pendulum = Math.sin(now * 0.0011 + lf.phase) * 0.15;
            lf.x += pendulum * dt;
            lf.y += lf.vy * dt;
            lf.rot += (lf.vrot + pendulum * 0.006) * dt;
            lf.flip += lf.vflip * dt;
            if (lf.y > height + 18) {
              lf.y = -16;
              const u = seededFrac(i + Math.floor(now * 0.0007), 79, 13);
              lf.x = lf.layer === 2 ? strictMarginX(u, i % 2 === 0 ? -1 : 1, width) : edgeWeightedFrac(u) * width;
            } else if (lf.y < -22) {
              lf.y = height + 16;
            }
            if (lf.x < -22) lf.x = width + 20;
            if (lf.x > width + 22) lf.x = -20;
            drawGinkgoLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.rgb, lf.alpha, lf.layer);
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 12. SOUND (Âm Trụ Uzui)
     * - Soft night-festival optical bokeh lights gleaming gently in background
     * - Fine luxury gold & ruby shimmer dust drifting softly down
     * - Zero fake equalizer bars, zero chaotic firework explosions!
     * ------------------------------------------------------------------------ */
    sound(initW, initH) {
      const bokehPalette = [
        '251, 191, 36',  // warm festival lantern gold
        '244, 63, 94',   // ruby jewel
        '45, 212, 191',  // tengen headband teal-gem
        '217, 70, 239'   // night festival magenta-violet
      ];

      const festivalBokeh = [];
      for (let i = 0; i < 12; i++) {
        festivalBokeh.push({
          x: edgeWeightedFrac(seededFrac(i, 73, 19)) * initW,
          y: (0.06 + seededFrac(i, 89, 11) * 0.82) * initH,
          r: 22 + seededFrac(i, 53, 7) * 38,
          vx: (seededFrac(i, 31, 13) - 0.5) * 0.06,
          vy: -(0.03 + seededFrac(i, 41, 5) * 0.05),
          phase: seededFrac(i, 67, 23) * TWO_PI,
          rgb: bokehPalette[i % bokehPalette.length],
          baseAlpha: 0.038 + seededFrac(i, 47, 17) * 0.044 // 0.038..0.082
        });
      }

      const glitter = [];
      for (let i = 0; i < 26; i++) {
        const isRuby = i % 3 === 1;
        glitter.push({
          x: edgeWeightedFrac(seededFrac(i, 83, 29)) * initW,
          y: seededFrac(i, 97, 17) * initH,
          r: 0.85 + seededFrac(i, 43, 9) * 1.35,
          vx: (seededFrac(i, 29, 7) - 0.5) * 0.12,
          vy: 0.22 + seededFrac(i, 59, 13) * 0.22, // slow luxurious snowfall-like drift
          rot: seededFrac(i, 61, 11) * TWO_PI,
          vrot: (seededFrac(i, 37, 3) - 0.5) * 0.018,
          phase: seededFrac(i, 71, 19) * TWO_PI,
          rgb: isRuby ? '251, 113, 133' : '253, 224, 71'
        });
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < festivalBokeh.length; i++) {
          const b = festivalBokeh[i];
          drawOpticalBokeh(ctx, b.x, b.y, b.r, b.rgb, b.baseAlpha * centerAttenuation(b.x, width) * 0.85);
        }
        ctx.restore();
      }

      return {
        pools: [festivalBokeh, glitter],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';

          // 1. Soft night-festival background lens bokeh
          for (let i = 0; i < festivalBokeh.length; i++) {
            const b = festivalBokeh[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.x < -b.r) b.x = width + b.r;
            if (b.x > width + b.r) b.x = -b.r;
            if (b.y < -b.r) b.y = height + b.r;
            if (b.y > height + b.r) b.y = -b.r;

            const breathe = 0.72 + 0.28 * Math.sin(now * 0.0010 + b.phase);
            const a = b.baseAlpha * breathe * centerAttenuation(b.x, width);
            drawOpticalBokeh(ctx, b.x, b.y, b.r, b.rgb, a);
          }

          // 2. Fine gold & ruby shimmer dust drifting softly down
          for (let i = 0; i < glitter.length; i++) {
            const g = glitter[i];
            g.x += (g.vx + Math.sin(now * 0.0012 + g.phase) * 0.09) * dt;
            g.y += g.vy * dt;
            g.rot += g.vrot * dt;
            if (g.y > height + 12) {
              g.y = -10;
              g.x = edgeWeightedFrac(seededFrac(i + Math.floor(now * 0.0009), 83, 29)) * width;
            } else if (g.y < -14) {
              g.y = height + 10;
            }
            if (g.x < -12) g.x = width + 12;
            if (g.x > width + 12) g.x = -12;

            // Specular facet catch-light as dust grain rotates
            const glint = Math.pow(0.5 + 0.5 * Math.sin(now * 0.0028 + g.phase), 2.2);
            const a = (0.055 + 0.205 * glint) * (0.65 + 0.35 * centerAttenuation(g.x, width));
            drawFineGlitter(ctx, g.x, g.y, g.r, g.rot, g.rgb, a);
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 13. NEZUKO (Nezuko Kamado)
     * - Warm sakura-pink firefly embers rising gently through the night
     * - A few green bamboo leaves drifting quietly in a moonlit bamboo grove
     * ------------------------------------------------------------------------ */
    nezuko(initW, initH) {
      const pinkFireflies = [];
      for (let i = 0; i < 22; i++) {
        const isBokeh = i < 3;
        pinkFireflies.push({
          x: isBokeh ? strictMarginX(seededFrac(i, 79, 13), i % 2 === 0 ? -1 : 1, initW) : edgeWeightedFrac(seededFrac(i, 79, 13)) * initW,
          y: seededFrac(i, 97, 23) * initH,
          r: isBokeh ? (14 + i * 3.5) : (1.1 + seededFrac(i, 43, 7) * 1.7),
          vy: -(0.18 + seededFrac(i, 53, 11) * 0.22),
          swayAmp: 0.12 + seededFrac(i, 37, 19) * 0.14,
          phase: seededFrac(i, 67, 29) * TWO_PI,
          haloRgb: i % 3 === 0 ? '251, 113, 133' : '244, 114, 182',
          coreRgb: '255, 241, 242',
          isBokeh
        });
      }

      const bambooColors = ['134, 239, 172', '74, 222, 128', '167, 243, 208'];
      const bambooLeaves = [];
      for (let i = 0; i < 9; i++) {
        const layer = i === 0 ? 2 : (i < 6 ? 1 : 0);
        bambooLeaves.push({
          x: edgeWeightedFrac(seededFrac(i, 83, 17)) * initW,
          y: seededFrac(i, 89, 31) * initH,
          r: layer === 2 ? 6.2 : (layer === 1 ? (3.4 + seededFrac(i, 41, 9) * 1.4) : 2.3),
          vx: -(0.12 + seededFrac(i, 29, 7) * 0.12),
          vy: 0.28 + seededFrac(i, 59, 13) * 0.18,
          rot: seededFrac(i, 61, 5) * TWO_PI,
          vrot: (seededFrac(i, 47, 11) - 0.5) * 0.012,
          flip: seededFrac(i, 73, 19) * TWO_PI,
          vflip: 0.015 + seededFrac(i, 31, 3) * 0.012,
          phase: seededFrac(i, 53, 23) * TWO_PI,
          rgb: bambooColors[i % bambooColors.length],
          layer,
          alpha: layer === 2 ? 0.052 : (layer === 1 ? 0.20 : 0.13)
        });
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const warmPink = safeLinearGradient(ctx, 0, height * 0.88, 0, height);
        warmPink.addColorStop(0, 'rgba(244, 114, 182, 0)');
        warmPink.addColorStop(1, 'rgba(244, 114, 182, 0.062)');
        ctx.fillStyle = warmPink;
        ctx.fillRect(0, height * 0.88, width, height * 0.12);
        for (let i = 3; i < 13; i++) {
          const f = pinkFireflies[i];
          drawGlowMote(ctx, f.x, f.y, f.r, f.haloRgb, f.coreRgb, 0.17, 3.0);
        }
        ctx.restore();
      }

      return {
        pools: [pinkFireflies, bambooLeaves],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();

          // 1. Warm sakura-pink firefly embers rising gently
          ctx.globalCompositeOperation = 'screen';
          const glowA = 0.045 + 0.025 * Math.sin(now * 0.00075);
          const warmPink = safeLinearGradient(ctx, 0, height * 0.88, 0, height);
          warmPink.addColorStop(0, 'rgba(244, 114, 182, 0)');
          warmPink.addColorStop(1, `rgba(244, 114, 182, ${fmtA(glowA)})`);
          ctx.fillStyle = warmPink;
          ctx.fillRect(0, height * 0.88, width, height * 0.12);

          for (let i = 0; i < pinkFireflies.length; i++) {
            const f = pinkFireflies[i];
            f.x += Math.sin(now * 0.0011 + f.phase) * f.swayAmp * dt;
            f.y += f.vy * dt;
            if (f.y < -16) {
              f.y = height + 12;
              const u = seededFrac(i + Math.floor(now * 0.0009), 79, 13);
              f.x = f.isBokeh ? strictMarginX(u, i % 2 === 0 ? -1 : 1, width) : edgeWeightedFrac(u) * width;
            } else if (f.y > height + 20) {
              f.y = -12;
            }
            if (f.x < -20) {
              f.x = f.isBokeh ? strictMarginX(0.5, -1, width) : (width + 18);
            } else if (f.x > width + 20) {
              f.x = f.isBokeh ? strictMarginX(0.5, 1, width) : -18;
            }
            const pulse = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(now * 0.0017 + f.phase), 1.5);
            if (f.isBokeh) {
              drawOpticalBokeh(ctx, f.x, f.y, f.r, f.haloRgb, 0.056 * pulse);
            } else {
              const vFade = clamp(Math.min(f.y / (height * 0.14), (height - f.y + 24) / 56), 0.12, 1);
              drawGlowMote(ctx, f.x, f.y, f.r, f.haloRgb, f.coreRgb, 0.24 * pulse * vFade, 3.1);
            }
          }

          // 2. Quiet bamboo leaves drifting in the night grove
          ctx.globalCompositeOperation = 'source-over';
          for (let i = 0; i < bambooLeaves.length; i++) {
            const lf = bambooLeaves[i];
            const sway = Math.sin(now * 0.0012 + lf.phase) * 0.14;
            lf.x += (lf.vx + sway) * dt;
            lf.y += lf.vy * dt;
            lf.rot += lf.vrot * dt;
            lf.flip += lf.vflip * dt;
            if (lf.y > height + 18) {
              lf.y = -16;
              lf.x = edgeWeightedFrac(seededFrac(i + Math.floor(now * 0.0008), 83, 17)) * width;
            } else if (lf.y < -22) {
              lf.y = height + 16;
            }
            if (lf.x < -20) lf.x = width + 18;
            else if (lf.x > width + 20) lf.x = -18;
            drawBambooLeaf(ctx, lf.x, lf.y, lf.r, lf.rot, lf.flip, lf.rgb, lf.alpha, lf.layer);
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 14. BEAST (Inosuke Hashibira)
     * - Thin cold mountain breath-mist hugging the very bottom floor
     * - Crisp ice-blue frost motes & wild pine needles / forest leaves carried
     *   on a natural alpine draft (zero unprompted X-slashes or wave slabs!)
     * ------------------------------------------------------------------------ */
    beast(initW, initH) {
      const floorMist = [];
      for (let i = 0; i < 5; i++) {
        const rx = 240 + seededFrac(i, 61, 13) * 140;
        const ry = 68 + seededFrac(i, 43, 7) * 38;
        floorMist.push({
          x: seededFrac(i, 89, 19) * (initW + rx) - rx * 0.5,
          yRatio: 0.92 + seededFrac(i, 53, 11) * 0.07,
          rx,
          ry,
          vx: (i % 2 === 0 ? 1 : -1) * (0.14 + seededFrac(i, 37, 5) * 0.12),
          phase: seededFrac(i, 73, 23) * TWO_PI,
          rgb: i % 2 === 0 ? '186, 230, 253' : '147, 197, 253',
          alpha: 0.038 + seededFrac(i, 47, 17) * 0.024 // 0.038..0.062
        });
      }

      const frostMotes = [];
      for (let i = 0; i < 18; i++) {
        frostMotes.push({
          x: edgeWeightedFrac(seededFrac(i, 79, 29)) * initW,
          y: seededFrac(i, 97, 17) * initH,
          r: 0.85 + seededFrac(i, 41, 9) * 1.45,
          vx: 0.24 + seededFrac(i, 31, 13) * 0.24,
          vy: -(0.06 + seededFrac(i, 59, 7) * 0.12),
          phase: seededFrac(i, 67, 19) * TWO_PI,
          rgb: i % 3 === 0 ? '96, 165, 250' : '125, 211, 252'
        });
      }

      const pineColors = ['110, 231, 183', '94, 234, 212', '147, 197, 253'];
      const pineNeedles = [];
      for (let i = 0; i < 12; i++) {
        pineNeedles.push({
          x: seededFrac(i, 83, 11) * initW,
          y: seededFrac(i, 89, 23) * initH,
          r: 3.0 + seededFrac(i, 43, 17) * 1.6,
          vx: 0.48 + seededFrac(i, 53, 7) * 0.34,
          vy: 0.32 + seededFrac(i, 37, 13) * 0.22,
          rot: seededFrac(i, 61, 19) * TWO_PI,
          vrot: 0.012 + seededFrac(i, 29, 5) * 0.015,
          flip: seededFrac(i, 71, 11) * TWO_PI,
          vflip: 0.018 + seededFrac(i, 47, 3) * 0.014,
          phase: seededFrac(i, 59, 29) * TWO_PI,
          isLeaf: i % 3 === 0,
          rgb: pineColors[i % pineColors.length],
          alpha: 0.15 + seededFrac(i, 31, 9) * 0.08
        });
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < floorMist.length; i++) {
          const fm = floorMist[i];
          drawVolumetricMistPuff(ctx, fm.x, height * fm.yRatio, fm.rx, fm.ry, fm.rgb, fm.alpha * 0.85);
        }
        ctx.restore();
      }

      return {
        pools: [floorMist, frostMotes, pineNeedles],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();
          const mountainDraft = 0.78 + 0.42 * (0.5 + 0.5 * Math.sin(now * 0.00068));

          // 1. Thin cold mountain breath-mist hugging bottom edge + ice-blue frost motes
          ctx.globalCompositeOperation = 'screen';
          for (let i = 0; i < floorMist.length; i++) {
            const fm = floorMist[i];
            fm.x += fm.vx * dt;
            if (fm.x - fm.rx > width + 20) fm.x = -fm.rx;
            else if (fm.x + fm.rx < -20) fm.x = width + fm.rx;
            const a = fm.alpha * (0.84 + 0.16 * Math.sin(now * 0.0007 + fm.phase));
            drawVolumetricMistPuff(ctx, fm.x, height * fm.yRatio, fm.rx, fm.ry, fm.rgb, a);
          }

          for (let i = 0; i < frostMotes.length; i++) {
            const m = frostMotes[i];
            m.x += (m.vx * mountainDraft + Math.sin(now * 0.0012 + m.phase) * 0.10) * dt;
            m.y += (m.vy + Math.cos(now * 0.0010 + m.phase) * 0.06) * dt;
            if (m.x > width + 14) m.x = -14;
            else if (m.x < -14) m.x = width + 14;
            if (m.y < -14) m.y = height + 14;
            else if (m.y > height + 14) m.y = -14;
            const glint = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now * 0.0020 + m.phase));
            drawGlowMote(ctx, m.x, m.y, m.r, m.rgb, '240, 249, 255', 0.21 * glint, 2.9);
          }

          // 2. Wild pine needles & forest leaves carried on alpine breeze
          ctx.globalCompositeOperation = 'source-over';
          for (let i = 0; i < pineNeedles.length; i++) {
            const p = pineNeedles[i];
            const sway = Math.sin(now * 0.0016 + p.phase) * 0.16;
            p.x += p.vx * mountainDraft * dt;
            p.y += (p.vy + sway) * dt;
            p.rot += p.vrot * dt;
            p.flip += p.vflip * dt;
            if (p.x > width + 22 || p.y > height + 22 || p.x < -24 || p.y < -24) {
              const u = seededFrac(i + Math.floor(now * 0.0009), 83, 11);
              if (u < 0.5) {
                p.x = -18;
                p.y = (u / 0.5) * height * 0.82;
              } else {
                p.x = ((u - 0.5) / 0.5) * width * 0.85;
                p.y = -18;
              }
            }
            const a = p.alpha * (0.72 + 0.28 * centerAttenuation(p.x, width));
            if (p.isLeaf) {
              drawBambooLeaf(ctx, p.x, p.y, p.r, p.rot, p.flip, p.rgb, a, 1);
            } else {
              drawPineNeedlePair(ctx, p.x, p.y, p.r, p.rot, p.flip, p.rgb, a);
            }
          }

          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 15. SUN (Nhật Chi Hô Hấp — Khai Tổ Yoriichi / Golden Solar Halo)
     * - Sacred crimson-gold solar corona breathing gently at the upper-right margin
     * - 24 buoyant solar embers & golden motes rising cleanly along outer margins
     * ------------------------------------------------------------------------ */
    sun(initW, initH) {
      const embers = [];
      for (let i = 0; i < 24; i++) {
        const layer = i < 3 ? 2 : (i < 16 ? 1 : 0);
        const r = layer === 2 ? (9 + (i % 3) * 2.5) : (layer === 1 ? (1.6 + seededFrac(i, 47, 13) * 1.8) : (0.9 + seededFrac(i, 61, 7) * 0.9));
        embers.push({
          x: layer === 2 ? strictMarginX(seededFrac(i, 79, 17), i % 2 === 0 ? -1 : 1, initW) : edgeWeightedFrac(seededFrac(i, 79, 17)) * initW,
          y: seededFrac(i, 97, 31) * initH,
          r,
          vx: (seededFrac(i, 37, 11) - 0.5) * 0.18,
          vy: -(0.34 + seededFrac(i, 53, 19) * 0.42) * (layer === 0 ? 0.68 : 1),
          phase: seededFrac(i, 89, 23) * TWO_PI,
          haloRgb: i % 3 === 0 ? '239, 68, 68' : (i % 3 === 1 ? '249, 115, 22' : '250, 204, 21'),
          coreRgb: '254, 249, 195',
          layer,
          alpha: layer === 2 ? 0.055 : (layer === 1 ? 0.25 : 0.15)
        });
      }

      function drawSolarCorona(ctx, width, height, alpha) {
        const sx = width * 0.86;
        const sy = height * 0.24;
        const sr = Math.max(width, height) * 0.48;
        const grad = safeRadialGradient(ctx, sx, sy, 0, sx, sy, sr);
        grad.addColorStop(0, `rgba(254, 240, 138, ${fmtA(alpha)})`);
        grad.addColorStop(0.32, `rgba(249, 115, 22, ${fmtA(alpha * 0.62)})`);
        grad.addColorStop(0.68, `rgba(220, 38, 38, ${fmtA(alpha * 0.24)})`);
        grad.addColorStop(1, 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        drawSolarCorona(ctx, width, height, 0.068);
        for (let i = 3; i < 13; i++) {
          const e = embers[i];
          drawGlowMote(ctx, e.x, e.y, e.r, e.haloRgb, e.coreRgb, e.alpha * 0.85, 3.4);
        }
        ctx.restore();
      }

      return {
        pools: [embers],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const coronaAlpha = 0.055 + 0.028 * (0.5 + 0.5 * Math.sin(now * 0.0008));
          drawSolarCorona(ctx, width, height, coronaAlpha);

          for (let i = 0; i < embers.length; i++) {
            const e = embers[i];
            e.x += (e.vx + Math.sin(now * 0.0014 + e.phase) * 0.16) * dt;
            e.y += e.vy * dt;
            if (e.y < -20) {
              e.y = height + 16;
              const u = seededFrac(i + Math.floor(now * 0.001), 79, 17);
              e.x = e.layer === 2 ? strictMarginX(u, i % 2 === 0 ? -1 : 1, width) : edgeWeightedFrac(u) * width;
            } else if (e.y > height + 24) {
              e.y = -16;
            }
            if (e.x < -20) {
              e.x = e.layer === 2 ? strictMarginX(0.5, -1, width) : (width + 18);
            } else if (e.x > width + 20) {
              e.x = e.layer === 2 ? strictMarginX(0.5, 1, width) : -18;
            }
            const flicker = 0.68 + 0.32 * Math.sin(now * 0.0032 + e.phase);
            const att = centerAttenuation(e.x, width);
            if (e.layer === 2) {
              drawOpticalBokeh(ctx, e.x, e.y, e.r, e.haloRgb, e.alpha * flicker);
            } else {
              drawGlowMote(ctx, e.x, e.y, e.r, e.haloRgb, e.coreRgb, e.alpha * flicker * att, 3.4);
            }
          }
          ctx.restore();
        }
      };
    },

    /* ------------------------------------------------------------------------
     * 16. MOON (Nguyệt Tử Linh — Abyssal Moonbeams & Necro-AzureCrescents)
     * - Cool abyssal violet & cyan-ice moonbeams + drifting crescent shards
     * ------------------------------------------------------------------------ */
    moon(initW, initH) {
      const motes = [];
      for (let i = 0; i < 24; i++) {
        const isCrescent = i >= 14;
        motes.push({
          x: edgeWeightedFrac(seededFrac(i, 83, 19)) * initW,
          y: seededFrac(i, 97, 29) * initH,
          r: isCrescent ? (3.2 + seededFrac(i, 41, 7) * 2.4) : (1.1 + seededFrac(i, 53, 11) * 1.5),
          vx: (seededFrac(i, 31, 5) - 0.5) * 0.16,
          vy: isCrescent ? (0.22 + seededFrac(i, 67, 13) * 0.22) : -(0.14 + seededFrac(i, 43, 17) * 0.20),
          rot: seededFrac(i, 71, 23) * TWO_PI,
          vrot: (seededFrac(i, 29, 3) - 0.5) * 0.022,
          phase: seededFrac(i, 89, 7) * TWO_PI,
          isCrescent,
          rgb: i % 2 === 0 ? '168, 85, 247' : '56, 189, 248',
          alpha: isCrescent ? 0.22 : 0.20
        });
      }

      function drawCrescentShard(ctx, x, y, r, rot, rgb, alpha) {
        const a = clamp(alpha, 0, 1);
        if (a <= 0.004) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillStyle = `rgba(${rgb}, ${fmtA(a)})`;
        ctx.beginPath();
        ctx.arc(0, 0, r, -0.75 * Math.PI, 0.75 * Math.PI, false);
        ctx.quadraticCurveTo(r * 0.22, 0, r * Math.cos(-0.75 * Math.PI), r * Math.sin(-0.75 * Math.PI));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function drawStatic(ctx, width, height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        drawCausticLightShaft(ctx, width * 0.84, -10, 56, 148, height * 0.68, -16 * DEG, '168, 85, 247', 0.052);
        drawCausticLightShaft(ctx, width * 0.15, -10, 42, 114, height * 0.58, 14 * DEG, '56, 189, 248', 0.044);
        for (let i = 0; i < 10; i++) {
          const m = motes[i];
          drawGlowMote(ctx, m.x, m.y, m.r, m.rgb, '240, 249, 255', m.alpha * 0.8, 3.2);
        }
        ctx.restore();
      }

      return {
        pools: [motes],
        drawStatic,
        step(ctx, width, height, now, dt) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const breathe = 0.82 + 0.18 * Math.sin(now * 0.00065);
          drawCausticLightShaft(ctx, width * 0.84, -10, 56, 148, height * 0.68, (-16 + Math.sin(now * 0.0004) * 1.4) * DEG, '168, 85, 247', 0.054 * breathe);
          drawCausticLightShaft(ctx, width * 0.15, -10, 42, 114, height * 0.58, (14 + Math.cos(now * 0.00045) * 1.2) * DEG, '56, 189, 248', 0.044 * breathe);

          for (let i = 0; i < motes.length; i++) {
            const m = motes[i];
            m.x += (m.vx + Math.sin(now * 0.0011 + m.phase) * 0.12) * dt;
            m.y += m.vy * dt;
            m.rot += m.vrot * dt;
            if (m.y < -18) m.y = height + 16;
            if (m.y > height + 18) m.y = -16;
            if (m.x < -18) m.x = width + 16;
            if (m.x > width + 18) m.x = -16;

            const pulse = 0.60 + 0.40 * Math.sin(now * 0.0022 + m.phase);
            const att = centerAttenuation(m.x, width);
            if (m.isCrescent) {
              drawCrescentShard(ctx, m.x, m.y, m.r, m.rot, m.rgb, m.alpha * pulse * att);
            } else {
              drawGlowMote(ctx, m.x, m.y, m.r, m.rgb, '240, 249, 255', m.alpha * pulse * att, 3.2);
            }
          }
          ctx.restore();
        }
      };
    }
  };

  /* ==========================================================================
   * UNIVERSAL FACTORY & ADAPTER (Preserves exact API contract + Transparent World)
   * ========================================================================== */

  const directCanvasCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  const MODE_ALIASES = {
    wisteria_royal: 'royal_wisteria',
    solar: 'sun',
    shadow: 'moon'
  };

  function normalizeMode(mode) {
    const raw = String(mode || 'wisteria').trim().toLowerCase();
    const key = MODE_ALIASES[raw] || raw;
    return MODE_BUILDERS[key] ? key : 'wisteria';
  }

  function sanitizeDim(v, minV, fb) {
    const n = Number(v);
    return (Number.isFinite(n) && n > 0) ? Math.max(minV, n) : fb;
  }

  function extractDimensions(optsOrW, maybeH) {
    if (typeof optsOrW === 'number' && typeof maybeH === 'number') {
      return {
        width: Number.isFinite(optsOrW) ? Math.max(320, optsOrW) : 1280,
        height: Number.isFinite(maybeH) ? Math.max(240, maybeH) : 720,
        ctx: null,
        autoClear: true
      };
    }
    if (typeof optsOrW === 'function') {
      const dims = optsOrW() || {};
      return {
        width: sanitizeDim(dims.width, 320, 1280),
        height: sanitizeDim(dims.height, 240, 720),
        ctx: null,
        autoClear: true
      };
    }
    if (optsOrW && typeof optsOrW === 'object' && !isCanvasContext(optsOrW)) {
      return {
        width: sanitizeDim(optsOrW.width, 320, 1280),
        height: sanitizeDim(optsOrW.height, 240, 720),
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
    const boundCtx = initCfg.ctx;
    const autoClear = initCfg.autoClear;

    const scene = MODE_BUILDERS[resolvedMode](curW, curH);
    let lastNow = 0;
    let simNow = 0;

    function resetClock() {
      lastNow = 0;
    }

    function resize(nextW, nextH) {
      const rawW = Number(nextW);
      const rawH = Number(nextH);
      const nw = (Number.isFinite(rawW) && rawW > 0) ? Math.max(320, rawW) : curW;
      const nh = (Number.isFinite(rawH) && rawH > 0) ? Math.max(240, rawH) : curH;
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
            const marginX = Math.max(80, (item.rx || item.r || item.r0 || item.len || 24) * 1.2);
            const marginY = Math.max(80, (item.ry || item.r || item.r0 || 24) * 1.2);
            if (typeof item.x === 'number') {
              item.x = clamp(item.x * sx, -marginX, nw + marginX);
            }
            if (typeof item.y === 'number') {
              item.y = clamp(item.y * sy, -marginY, nh + marginY);
            }
            if (typeof item.baseX === 'number') {
              item.baseX = clamp(item.baseX * sx, -marginX, nw + marginX);
            }
            if (typeof item.baseY === 'number') {
              item.baseY = clamp(item.baseY * sy, -marginY, nh + marginY);
            }
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
      // Clamp frame delta strictly to <= 0.05s (50ms) and recover smoothly from multi-window focus pause
      const elapsedMs = lastNow > 0 ? (safeNow - lastNow) : 16.6667;
      const deltaSec = (elapsedMs <= 0 || elapsedMs > 250)
        ? (1 / 60)
        : clamp(elapsedMs / 1000, 0.004, 0.05);
      lastNow = safeNow;

      // Yoriichi's Transparent World ("Sukitōru Sekai"): slow particle velocity down to 20% & soften glare by 35%
      const tw = clamp(
        Number(typeof window !== 'undefined' && window.__AGY_TRANSPARENT_WORLD__ != null ? window.__AGY_TRANSPARENT_WORLD__ : 0) || 0,
        0,
        1
      );
      const velScale = 1.0 - 0.80 * tw;
      const alphaScale = 1.0 - 0.35 * tw;
      const effectiveDt = (deltaSec * 60) * velScale;
      simNow += (deltaSec * 1000) * velScale;

      if (autoClear) {
        ctx.clearRect(0, 0, curW, curH);
      }
      ctx.save();
      if (tw > 0.001) {
        ctx.globalAlpha *= alphaScale;
      }
      scene.step(ctx, curW, curH, simNow, effectiveDt);
      ctx.restore();
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
    callableDrawer.resetClock = resetClock;
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
  knyFxFactory.has = (mode) => {
    const raw = String(mode || '').trim().toLowerCase();
    const key = MODE_ALIASES[raw] || raw;
    return Boolean(MODE_BUILDERS[key]);
  };

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
