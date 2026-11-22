'use strict';

/**
 * F20 — Kiểm thử Động Cơ Thi Triển Hơi Thở 3D Siêu Nhẹ (`engine/kny_3d_vfx_kernel.js` & `kny_breathing_skills.js`)
 * - 8 Khuôn mẫu Không gian 3D (ARCHETYPES) phủ trọn 60 Thức của 15 nhân vật + 3 Multiverse Personas
 * - Độc quyền PRIMORDIAL_SUN_13 cho Thập Tam Thức của Kiếm Sĩ Đầu Tiên Yoriichi
 * - Pinhole Camera Rig 3D, 6 Pha Điện ảnh (Anticipation, Z-Dash, Hit-Stop & Impact Frame, Foreground Bokeh, Noto, Landing)
 * - Z-Zero Depth Sandwich (renderBackPass Z < actorZ, Chibi Billboard Z = actorZ, renderFrontPass Z >= actorZ)
 * - Cầu dao phần cứng 3 tầng: Mock WebGL2 Uber-Shader, chặn SwiftShader/llvmpipe, Watchdog > 24ms & thu hồi 0 MB VRAM qua WEBGL_lose_context
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const KERNEL_SRC = fs.readFileSync(path.join(REPO_ROOT, 'engine', 'kny_3d_vfx_kernel.js'), 'utf8');
const SKILLS_SRC = fs.readFileSync(path.join(REPO_ROOT, 'engine', 'kny_breathing_skills.js'), 'utf8');

function createMockCtx2d(logCalls = false) {
    const ops = [];
    const grad = { addColorStop: () => {} };
    return new Proxy(
        { ops },
        {
            get(target, prop) {
                if (prop === 'ops') return target.ops;
                if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
                    return () => grad;
                }
                return (...args) => {
                    if (logCalls) target.ops.push({ fn: String(prop), args });
                };
            },
            set(target, prop, val) {
                target[prop] = val;
                return true;
            },
        }
    );
}

function createKernelVm(opts = {}) {
    let lostCalled = 0;
    let drawArraysCalled = 0;
    const rendererName = opts.rendererName || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)';
    const enableWebGl = Boolean(opts.enableWebGl);
    const frameStepMs = Number(opts.frameStepMs) || 4;
    let nowClock = 1000;

    function createMockGl() {
        return {
            VERTEX_SHADER: 0x8b31,
            FRAGMENT_SHADER: 0x8b30,
            COMPILE_STATUS: 0x8b81,
            LINK_STATUS: 0x8b82,
            ARRAY_BUFFER: 0x8892,
            DYNAMIC_DRAW: 0x88e8,
            FLOAT: 0x1406,
            DEPTH_TEST: 0x0b71,
            LEQUAL: 0x0203,
            BLEND: 0x0be2,
            ONE: 1,
            ONE_MINUS_SRC_ALPHA: 0x0303,
            COLOR_BUFFER_BIT: 0x4000,
            DEPTH_BUFFER_BIT: 0x0100,
            TRIANGLE_STRIP: 0x0005,
            RENDERER: 0x1f01,
            VERSION: 0x1f02,
            getExtension(name) {
                if (name === 'WEBGL_debug_renderer_info') {
                    return { UNMASKED_RENDERER_WEBGL: 0x9246 };
                }
                if (name === 'WEBGL_lose_context') {
                    return {
                        loseContext() {
                            lostCalled++;
                        },
                    };
                }
                if (name === 'OES_standard_derivatives') return {};
                return null;
            },
            getParameter(p) {
                if (p === 0x9246 || p === 0x1f01) return rendererName;
                return 'WebGL 2.0';
            },
            createShader: () => ({}),
            shaderSource: () => {},
            compileShader: () => {},
            getShaderParameter: () => true,
            getShaderInfoLog: () => '',
            deleteShader: () => {},
            createProgram: () => ({}),
            attachShader: () => {},
            linkProgram: () => {},
            getProgramParameter: () => true,
            getProgramInfoLog: () => '',
            deleteProgram: () => {},
            useProgram: () => {},
            getAttribLocation: (_p, name) => (name === 'a_pos' ? 0 : name === 'a_nrm' ? 1 : 2),
            getUniformLocation: (_p, name) => ({ name }),
            createBuffer: () => ({}),
            bindBuffer: () => {},
            bufferData: () => {},
            bufferSubData: () => {},
            deleteBuffer: () => {},
            createVertexArray: () => ({}),
            bindVertexArray: () => {},
            deleteVertexArray: () => {},
            enableVertexAttribArray: () => {},
            vertexAttribPointer: () => {},
            viewport: () => {},
            enable: () => {},
            disable: () => {},
            depthFunc: () => {},
            depthMask: () => {},
            blendFunc: () => {},
            clearColor: () => {},
            clear: () => {},
            uniform1f: () => {},
            uniform1i: () => {},
            uniform2f: () => {},
            uniform3f: () => {},
            uniform3fv: () => {},
            uniformMatrix4fv: () => {},
            drawArrays: () => {
                drawArraysCalled++;
            },
        };
    }

    const doc = {
        hidden: false,
        visibilityState: 'visible',
        addEventListener: () => {},
        removeEventListener: () => {},
        createElement(tag) {
            if (String(tag).toLowerCase() === 'canvas') {
                return {
                    width: 300,
                    height: 150,
                    style: {},
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    getContext(kind, attrs) {
                        if (kind === '2d') return createMockCtx2d();
                        if (enableWebGl && (kind === 'webgl2' || kind === 'webgl')) {
                            if (opts.failCaveat && attrs && attrs.failIfMajorPerformanceCaveat) return null;
                            return createMockGl();
                        }
                        return null;
                    },
                };
            }
            return { style: {}, dataset: {}, appendChild: () => {}, remove: () => {} };
        },
    };

    const win = {
        document: doc,
        devicePixelRatio: 1.5,
        innerWidth: 1440,
        innerHeight: 900,
        performance: {
            now() {
                nowClock += frameStepMs;
                return nowClock;
            },
        },
        setTimeout: (fn) => {
            if (opts.instantTimers) fn();
            return 1;
        },
        clearTimeout: () => {},
        matchMedia: () => ({ matches: Boolean(opts.reducedMotion) }),
    };
    if (enableWebGl) {
        win.WebGLRenderingContext = function WebGLRenderingContext() {};
        win.WebGL2RenderingContext = function WebGL2RenderingContext() {};
    }

    const ctx = vm.createContext({
        window: win,
        globalThis: win,
        document: doc,
        performance: win.performance,
        WebGLRenderingContext: win.WebGLRenderingContext,
        WebGL2RenderingContext: win.WebGL2RenderingContext,
        Math,
        Number,
        String,
        Boolean,
        Object,
        Array,
        Float32Array,
        Uint16Array,
        Int32Array,
        Map,
        Set,
        RegExp,
        Date,
        setTimeout: win.setTimeout,
        clearTimeout: win.clearTimeout,
        console,
    });

    vm.runInContext(KERNEL_SRC, ctx);
    vm.runInContext(SKILLS_SRC, ctx);

    return {
        win,
        vfx: win.__AGY_KNY_3D_VFX__,
        skills: win.__AGY_KNY_SKILLS__,
        getStats: () => ({ lostCalled, drawArraysCalled }),
    };
}

describe('F20 — Động Cơ Thi Triển Hơi Thở 3D Siêu Nhẹ (`kny_3d_vfx_kernel.js` & `kny_breathing_skills.js`)', () => {
    it('F20-T1-01: Khởi tạo đầy đủ 8 Khuôn mẫu Không gian 3D (ARCHETYPES) & đóng băng API an toàn', () => {
        const { vfx, skills } = createKernelVm();
        assert.ok(vfx, '__AGY_KNY_3D_VFX__ phải tồn tại');
        assert.equal(Object.isFrozen(vfx), true, 'API __AGY_KNY_3D_VFX__ phải được Object.freeze');
        assert.equal(Object.keys(vfx.ARCHETYPES).length, 8, 'Phải có đúng 8 Khuôn mẫu Không gian 3D');
        assert.equal(typeof skills.get3DStatus, 'function', 'kny_breathing_skills phải xuất hàm get3DStatus()');
    });

    it('F20-T1-02: Ánh xạ trọn vẹn 60 Thức của 15 Nhân vật + 3 Multiverse Personas và độc quyền PRIMORDIAL_SUN_13 cho Yoriichi Thức 4', () => {
        const { vfx, skills } = createKernelVm();
        const chars = [
            'ubuyashiki', 'shinobu', 'giyu', 'rengoku', 'uzui',
            'muichiro', 'mitsuri', 'obanai', 'sanemi', 'gyomei',
            'tanjiro', 'nezuko', 'zenitsu', 'inosuke', 'yoriichi',
        ];
        const validArchetypes = new Set(Object.values(vfx.ARCHETYPES));
        let totalChecked = 0;

        for (const cid of chars) {
            const list = skills.getSkillsForCharacter(cid);
            assert.equal(list.length, 4, `Nhân vật ${cid} phải có đủ 4 thức`);
            for (const sk of list) {
                const prof = vfx.resolveSkill3DProfile(sk, {});
                assert.ok(validArchetypes.has(prof.archetype), `Archetype không hợp lệ cho ${sk.id}: ${prof.archetype}`);
                totalChecked++;
            }
        }
        assert.equal(totalChecked, 60, 'Phải kiểm tra đủ 60/60 Thức Hơi Thở');

        const yori4 = skills.getSkillsForCharacter('yoriichi')[3];
        const yoriProf = vfx.resolveSkill3DProfile(yori4, {});
        assert.equal(yoriProf.archetype, vfx.ARCHETYPES.PRIMORDIAL_SUN_13, 'Thập Tam Thức của Yoriichi phải dùng PRIMORDIAL_SUN_13');

        const sixEyesProf = vfx.resolveSkill3DProfile(skills.getSkillsForCharacter('muichiro')[3], { personaId: 'six_eyes' });
        assert.equal(sixEyesProf.archetype, vfx.ARCHETYPES.SPHERICAL_DOMAIN, 'Lục Nhãn Vô Lượng Không Xứ phải mở vòm cầu 3D SPHERICAL_DOMAIN');
    });

    it('F20-T1-03: 6 Pha Điện ảnh 3D, Z-Sandwich (BackPass/FrontPass) & Impact Frame chạy 0 NaN trên toàn bộ 8 Archetypes', () => {
        const { vfx, skills } = createKernelVm({ enableWebGl: false });
        const sampleSkills = [
            skills.getSkillsForCharacter('giyu')[2],      // HELICAL_DRAGON
            skills.getSkillsForCharacter('tanjiro')[0],   // MULTI_RING_VORTEX
            skills.getSkillsForCharacter('zenitsu')[0],   // Z_SEVER_THRUST
            skills.getSkillsForCharacter('giyu')[3],      // SPHERICAL_DOMAIN
            skills.getSkillsForCharacter('gyomei')[0],    // ORBITAL_CHAINS_RIBBONS
            skills.getSkillsForCharacter('yoriichi')[3],  // PRIMORDIAL_SUN_13
            skills.getSkillsForCharacter('shinobu')[0],   // RADIAL_PRISM_BARRAGE
            skills.getSkillsForCharacter('giyu')[0],      // LAYERED_PARALLAX_SWEEP
        ];
        const ctx2d = createMockCtx2d(true);
        const home = { x: 1320, y: 810 };

        for (const sk of sampleSkills) {
            for (const p of [0.02, 0.16, 0.34, 0.55, 0.74, 0.94]) {
                const actor = vfx.computeActor3DTrajectory(1440, 900, p, sk, home, { baseSize: 210, nativeFacing: -1 }, {});
                assert.equal(Number.isFinite(actor.sx), true, `sx NaN tại ${sk.id} p=${p}`);
                assert.equal(Number.isFinite(actor.sy), true, `sy NaN tại ${sk.id} p=${p}`);
                assert.equal(Number.isFinite(actor.worldZ), true, `worldZ NaN tại ${sk.id} p=${p}`);
                assert.equal(Number.isFinite(actor.pScale) && actor.pScale > 0, true, `pScale không hợp lệ tại ${sk.id}`);

                vfx.renderBackPass(ctx2d, 1440, 900, p, sk, actor, {});
                vfx.renderFrontPass(ctx2d, 1440, 900, p, sk, actor, {});
            }
        }

        const impactRes = vfx.renderImpactFrame(
            ctx2d,
            1440,
            900,
            { sx: 720, sy: 450, size: 220, impactFrameKind: 'crimson_flash' },
            sampleSkills[5],
            null
        );
        assert.equal(impactRes, true, 'renderImpactFrame phải vẽ thành công khung hình đảo sắc ufotable');
        assert.ok(ctx2d.ops.length > 50, 'Z-Sandwich fallback 3D Canvas 2D phải thực hiện các lệnh vẽ đa giác/hạt');
    });

    it('F20-T2-01: Micro WebGL2 Uber-Shader biên dịch thành công, vẽ TRIANGLE_STRIP 3D và trả 0 MB VRAM qua WEBGL_lose_context', () => {
        const { vfx, skills, getStats } = createKernelVm({ enableWebGl: true });
        const ctx2d = createMockCtx2d();
        const yori4 = skills.getSkillsForCharacter('yoriichi')[3];
        const actor = vfx.computeActor3DTrajectory(1440, 900, 0.38, yori4, { x: 1300, y: 800 }, {}, {});

        vfx.renderBackPass(ctx2d, 1440, 900, 0.38, yori4, actor, {});
        vfx.renderFrontPass(ctx2d, 1440, 900, 0.38, yori4, actor, {});

        const diagLive = vfx.getDiagnostics();
        assert.equal(diagLive.mode, 'webgl2', 'Khi có GPU phần cứng phải kích hoạt chế độ webgl2');
        assert.equal(diagLive.contextActive, true);
        assert.equal(diagLive.shaderCompiled, true);
        assert.ok(getStats().drawArraysCalled >= 2, 'WebGL2 phải thực thi drawArrays cho cả Back-Pass và Front-Pass');

        vfx.releaseGpuNow();
        const diagIdle = vfx.getDiagnostics();
        assert.equal(diagIdle.contextActive, false, 'Sau releaseGpuNow() phải giải phóng hoàn toàn WebGL context');
        assert.ok(getStats().lostCalled >= 1, 'Phải gọi cưỡng bức WEBGL_lose_context.loseContext() để trả 0 MB VRAM');
    });

    it('F20-T2-02: Cầu dao phần cứng chặn đứng SwiftShader / llvmpipe và Watchdog > 24ms tự rơi êm về canvas2d-3d', () => {
        // 1. Chặn SwiftShader ngay lập tức
        const sw = createKernelVm({
            enableWebGl: true,
            rendererName: 'Google SwiftShader (Subzero)',
        });
        const ctx2d = createMockCtx2d();
        const giyu3 = sw.skills.getSkillsForCharacter('giyu')[2];
        const actor = sw.vfx.computeActor3DTrajectory(1280, 720, 0.4, giyu3, { x: 1100, y: 650 }, {}, {});
        sw.vfx.renderBackPass(ctx2d, 1280, 720, 0.4, giyu3, actor, {});

        const swDiag = sw.vfx.getDiagnostics();
        assert.equal(swDiag.mode, 'canvas2d-3d', 'Phát hiện SwiftShader phải ngắt WebGL và chuyển ngay về canvas2d-3d');
        assert.equal(swDiag.contextActive, false);
        assert.ok(sw.getStats().lostCalled >= 1, 'Phải gọi loseContext() ngay khi phát hiện software renderer');

        // 2. Watchdog tự ngắt khi 2 frame Z-Sandwich liên tiếp (BackPass + FrontPass) vượt 24ms
        const slow = createKernelVm({
            enableWebGl: true,
            frameStepMs: 16,
        });
        slow.vfx.renderBackPass(ctx2d, 1280, 720, 0.3, giyu3, actor, {});
        slow.vfx.renderFrontPass(ctx2d, 1280, 720, 0.3, giyu3, actor, {});
        slow.vfx.renderBackPass(ctx2d, 1280, 720, 0.35, giyu3, actor, {});
        slow.vfx.renderFrontPass(ctx2d, 1280, 720, 0.35, giyu3, actor, {});
        assert.equal(slow.vfx.getDiagnostics().mode, 'canvas2d-3d', 'Watchdog phải tự hạ cấp về canvas2d-3d khi frame > 24ms');
        assert.equal(slow.vfx.getDiagnostics().fallbackReason, 'watchdog_24ms_exceeded');
    });
});
