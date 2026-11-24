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
    let bufferSubDataCalled = 0;
    let contextsCreated = 0;
    let cvListeners = 0;
    let docListeners = 0;
    const rendererName = opts.rendererName || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)';
    const enableWebGl = Boolean(opts.enableWebGl);
    const frameStepMs = Number(opts.frameStepMs) !== undefined && opts.frameStepMs !== undefined ? Number(opts.frameStepMs) : 4;
    let nowClock = 1000;
    let parallelReady = opts.parallelReady !== undefined ? Boolean(opts.parallelReady) : true;
    const createdCanvases = [];
    const timers = new Map();
    let nextTimerId = 1;
    const rafs = new Map();
    let nextRafId = 1;
    const storage = new Map();

    function createMockGl() {
        contextsCreated++;
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
                if (name === 'KHR_parallel_shader_compile' && opts.parallelCompile) {
                    return { COMPLETION_STATUS_KHR: 0x91b1 };
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
            getProgramParameter: (_p, k) => (k === 0x91b1 ? parallelReady : !opts.linkFail),
            getProgramInfoLog: () => '',
            deleteProgram: () => {},
            useProgram: () => {},
            getAttribLocation: (_p, name) => (name === 'a_pos' ? 0 : name === 'a_nrm' ? 1 : 2),
            getUniformLocation: (_p, name) => ({ name }),
            createBuffer: () => ({}),
            bindBuffer: () => {},
            bufferData: () => {},
            bufferSubData: () => {
                bufferSubDataCalled++;
            },
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

    function makeMockElement(tag) {
        const children = [];
        return {
            tagName: String(tag || 'div').toUpperCase(),
            isConnected: true,
            textContent: '',
            id: '',
            className: '',
            style: { setProperty: () => {}, removeProperty: () => {} },
            dataset: {},
            classList: { add: () => {}, remove: () => {}, contains: () => false },
            children,
            appendChild(ch) {
                children.push(ch);
                return ch;
            },
            remove: () => {},
            setAttribute: () => {},
            getAttribute: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
            removeEventListener: () => {},
        };
    }

    const docMap = new Map();
    const doc = {
        hidden: false,
        visibilityState: 'visible',
        head: makeMockElement('head'),
        body: makeMockElement('body'),
        documentElement: makeMockElement('html'),
        addEventListener(type, fn) {
            if (!docMap.has(type)) docMap.set(type, new Set());
            const s = docMap.get(type);
            if (!s.has(fn)) {
                s.add(fn);
                docListeners++;
            }
        },
        removeEventListener(type, fn) {
            const s = docMap.get(type);
            if (s && s.delete(fn)) docListeners--;
        },
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement(tag) {
            if (String(tag).toLowerCase() === 'canvas') {
                const lMap = new Map();
                const cv = {
                    width: 300,
                    height: 150,
                    style: { setProperty: () => {} },
                    dataset: {},
                    classList: { add: () => {}, remove: () => {} },
                    addEventListener(type, fn) {
                        if (!lMap.has(type)) lMap.set(type, new Set());
                        const s = lMap.get(type);
                        if (!s.has(fn)) {
                            s.add(fn);
                            cvListeners++;
                        }
                    },
                    removeEventListener(type, fn) {
                        const s = lMap.get(type);
                        if (s && s.delete(fn)) cvListeners--;
                    },
                    fireContextLost() {
                        const s = lMap.get('webglcontextlost');
                        if (s) {
                            for (const fn of [...s]) fn({ preventDefault: () => {} });
                        }
                    },
                    getContext(kind, attrs) {
                        if (kind === '2d') return createMockCtx2d(Boolean(opts.log2dCalls));
                        if (enableWebGl && (kind === 'webgl2' || kind === 'webgl')) {
                            if (opts.rejectContext) return null;
                            if (opts.failCaveat && attrs && attrs.failIfMajorPerformanceCaveat) return null;
                            return createMockGl();
                        }
                        return null;
                    },
                };
                createdCanvases.push(cv);
                return cv;
            }
            return makeMockElement(tag);
        },
    };

    const win = {
        document: doc,
        devicePixelRatio: 1.5,
        innerWidth: 1440,
        innerHeight: 900,
        localStorage: {
            getItem: (k) => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: (k) => storage.delete(k),
        },
        performance: {
            now() {
                if (!opts.manualClock) nowClock += frameStepMs;
                return nowClock;
            },
        },
        setTimeout: (fn, ms) => {
            if (opts.instantTimers) {
                fn();
                return 1;
            }
            const id = nextTimerId++;
            timers.set(id, { fn, at: nowClock + (Number(ms) || 0) });
            return id;
        },
        clearTimeout: (id) => {
            timers.delete(id);
        },
        matchMedia: () => ({ matches: Boolean(opts.reducedMotion), addEventListener: () => {}, removeEventListener: () => {} }),
    };
    if (!opts.noRaf) {
        win.requestAnimationFrame = (fn) => {
            const id = nextRafId++;
            rafs.set(id, fn);
            return id;
        };
        win.cancelAnimationFrame = (id) => {
            rafs.delete(id);
        };
    }
    if (enableWebGl) {
        win.WebGLRenderingContext = function WebGLRenderingContext() {};
        win.WebGL2RenderingContext = function WebGL2RenderingContext() {};
    }

    const ctx = vm.createContext({
        window: win,
        globalThis: win,
        document: doc,
        performance: win.performance,
        localStorage: win.localStorage,
        WebGLRenderingContext: win.WebGLRenderingContext,
        WebGL2RenderingContext: win.WebGL2RenderingContext,
        requestAnimationFrame: win.requestAnimationFrame,
        cancelAnimationFrame: win.cancelAnimationFrame,
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
    if (!opts.skipSkills) vm.runInContext(SKILLS_SRC, ctx);

    return {
        win,
        ctx,
        vfx: win.__AGY_KNY_3D_VFX__,
        skills: win.__AGY_KNY_SKILLS__,
        createdCanvases,
        setParallelReady: (v) => {
            parallelReady = Boolean(v);
        },
        advanceTime(ms) {
            const target = nowClock + ms;
            while (true) {
                let best = null;
                for (const [id, item] of timers.entries()) {
                    if (item.at <= target && (!best || item.at < best[1].at)) best = [id, item];
                }
                if (!best) break;
                timers.delete(best[0]);
                nowClock = Math.max(nowClock, best[1].at);
                best[1].fn();
            }
            nowClock = target;
        },
        stepRaf(dtMs) {
            nowClock += dtMs;
            const batch = [...rafs.values()];
            rafs.clear();
            for (const fn of batch) fn(nowClock);
        },
        hasRaf: () => rafs.size > 0,
        getStats: () => ({
            lostCalled,
            drawArraysCalled,
            bufferSubDataCalled,
            contextsCreated,
            cvListeners,
            docListeners,
            pendingTimers: timers.size,
            pendingRafs: rafs.size,
        }),
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

    it('F20-T2-03 [C-1 & M-5]: Kích hoạt Impact Frame/Hit-Stop ngay cả khi giật frame nhảy qua 0.365, effP không lùi & không sinh hit-stop ma', () => {
        const env = createKernelVm({ enableWebGl: false, manualClock: true, skipSkills: true });
        const frames = [];
        const real = env.vfx;
        const spy = {};
        for (const k of Object.keys(real)) {
            spy[k] = typeof real[k] === 'function'
                ? (...args) => {
                    const out = real[k](...args);
                    if (k === 'renderBackPass') {
                        frames.push({
                            effP: args[3],
                            opts: args[6] ? { ...args[6] } : {},
                            actorHit: Boolean(args[5] && args[5].hitStopActive),
                        });
                    }
                    return out;
                }
                : real[k];
        }
        env.win.__AGY_KNY_3D_VFX__ = spy;
        vm.runInContext(SKILLS_SRC, env.ctx);

        const res = env.win.__AGY_KNY_SKILLS__.castSkill('giyu', 'giyu_3', { composerEl: null, noActionSprite: true });
        assert.equal(res.ok, true);

        let jumped = false;
        let guard = 0;
        while (env.hasRaf() && guard++ < 400) {
            const lastRaw = frames.length ? frames[frames.length - 1].opts.rawP : 0;
            if (!jumped && lastRaw > 0.30) {
                jumped = true;
                env.stepRaf(230); // Giật 1 frame 230ms nhảy vọt qua cửa sổ hẹp 0.33..0.365
            } else {
                env.stepRaf(16.667);
            }
        }

        const impactFrames = frames.filter((f) => f.opts.impactFrameActive);
        const hitStopFrames = frames.filter((f) => f.opts.hitStopActive);
        assert.ok(impactFrames.length >= 2, 'Phải kích hoạt Impact Frame dù frame giật vọt qua 0.365');
        assert.ok(hitStopFrames.length >= 2, 'Phải kích hoạt Hit-Stop tiếp nối Impact Frame');

        for (let i = 1; i < frames.length; i++) {
            assert.ok(frames[i].effP >= frames[i - 1].effP - 1e-9, `effectiveP không được lùi ngược tại frame ${i}`);
        }
        const ghostHits = frames.filter((f) => !f.opts.hitStopActive && !f.opts.impactFrameActive && f.actorHit);
        assert.equal(ghostHits.length, 0, 'Không được xuất hiện hit-stop ma ngoài vùng freeze của skills');

        // Kiểm tra độc lập trên kernel: phase === 'hitstop' <=> hitStopActive và impactFrameKind trong [0.33, 0.36]
        let sawImpactKind = false;
        for (let p = 0.32; p <= 0.44; p += 0.002) {
            const a = real.computeActor3DTrajectory(1440, 900, p, { id: 'giyu_3' });
            assert.equal(a.phase === 'hitstop', a.hitStopActive, `Lệch phase vs hitStopActive tại p=${p}`);
            if (p >= 0.33 && p <= 0.36 && a.impactFrameKind) sawImpactKind = true;
        }
        assert.equal(sawImpactKind, true, 'Kernel phải phát impactFrameKind trong cửa sổ [0.33, 0.36]');
    });

    it('F20-T2-04 [C-2 & T-3]: Tái upload VBO sau releaseGpuNow/contextLost cùng rawP & giữ 0 VRAM ở chế độ reduced-motion', () => {
        const env = createKernelVm({ enableWebGl: true, manualClock: true });
        const ctx2d = createMockCtx2d(true);
        const giyu3 = env.skills.getSkillsForCharacter('giyu')[2];
        const actor = env.vfx.computeActor3DTrajectory(1440, 900, 0.345, giyu3, null, null, {});

        env.vfx.renderBackPass(ctx2d, 1440, 900, 0.345, giyu3, actor, {});
        env.vfx.renderFrontPass(ctx2d, 1440, 900, 0.345, giyu3, actor, {});
        const up1 = env.getStats().bufferSubDataCalled;
        assert.equal(up1, 1, 'Frame đầu phải upload VBO đúng 1 lần cho cả Back & Front pass');

        // Giải phóng GPU qua releaseGpuNow rồi render lại đúng cùng rawP = 0.345
        env.vfx.releaseGpuNow();
        env.vfx.renderBackPass(ctx2d, 1440, 900, 0.345, giyu3, actor, {});
        env.vfx.renderFrontPass(ctx2d, 1440, 900, 0.345, giyu3, actor, {});
        assert.equal(env.getStats().bufferSubDataCalled, 2, 'Sau releaseGpuNow phải upload lại VBO mới dù rawP không đổi');

        // Chế độ reduced-motion không được khởi tạo WebGL context và vẫn vẽ đủ ribbon qua Canvas2D sau 31s
        const redEnv = createKernelVm({ enableWebGl: true, manualClock: true, reducedMotion: true });
        const redCtx1 = createMockCtx2d(true);
        const redCtx2 = createMockCtx2d(true);
        const redActor = redEnv.vfx.computeActor3DTrajectory(1440, 900, 0.48, giyu3, null, null, { reducedMotion: true });
        redEnv.vfx.renderBackPass(redCtx1, 1440, 900, 0.35, giyu3, redActor, { reducedMotion: true });
        redEnv.vfx.renderFrontPass(redCtx1, 1440, 900, 0.35, giyu3, redActor, { reducedMotion: true });
        assert.equal(redEnv.getStats().contextsCreated, 0, 'reducedMotion không được cấp phát WebGL context');

        redEnv.advanceTime(31000);
        redEnv.vfx.renderBackPass(redCtx2, 1440, 900, 0.35, giyu3, redActor, { reducedMotion: true });
        redEnv.vfx.renderFrontPass(redCtx2, 1440, 900, 0.35, giyu3, redActor, { reducedMotion: true });
        const fills1 = redCtx1.ops.filter((o) => o.fn === 'fill').length;
        const fills2 = redCtx2.ops.filter((o) => o.fn === 'fill').length;
        assert.ok(fills1 > 20 && fills2 === fills1, 'Cast reduced-motion lần 2 sau 31s vẫn phải vẽ đủ ribbon 3D');
    });

    it('F20-T2-05 [M-1, M-2, M-4 & T-4]: Lease khi chờ KHR_parallel_shader_compile, chống hồi sinh sau destroy & xử lý mất context lặp lại', () => {
        // 1. M-1: Parallel shader compile chưa hoàn tất vẫn phải đặt Warm Lease 30s
        const par = createKernelVm({ enableWebGl: true, manualClock: true, parallelCompile: true, parallelReady: false });
        par.vfx.mountStageLayers(null);
        assert.equal(par.getStats().pendingTimers, 1, 'Đang chờ KHR_parallel_shader_compile vẫn phải có timer Warm Lease');
        par.advanceTime(31000);
        assert.equal(par.vfx.getDiagnostics().contextActive, false, 'Quá 30s chờ compile phải tự thu hồi WebGL context');

        // 2. M-4 & T-4: webglcontextlost gỡ listener cũ, xóa fallbackReason khi hồi phục, khóa 2D sau 2 lần mất
        const ctxEnv = createKernelVm({ enableWebGl: true, manualClock: true });
        const ctx2d = createMockCtx2d();
        const sk = { id: 'giyu_3' };
        const act = ctxEnv.vfx.computeActor3DTrajectory(1440, 900, 0.5, sk);
        ctxEnv.vfx.renderBackPass(ctx2d, 1440, 900, 0.5, sk, act, {});
        assert.equal(ctxEnv.getStats().cvListeners, 1);

        ctxEnv.createdCanvases[0].fireContextLost();
        assert.equal(ctxEnv.getStats().cvListeners, 0, 'Phải gỡ listener khỏi canvas bị mất context');
        ctxEnv.vfx.renderBackPass(ctx2d, 1440, 900, 0.52, sk, act, {});
        assert.equal(ctxEnv.vfx.getDiagnostics().mode, 'webgl2');
        assert.equal(ctxEnv.vfx.getDiagnostics().fallbackReason, '', 'Khôi phục WebGL2 thành công phải xóa fallbackReason');
        assert.equal(ctxEnv.getStats().cvListeners, 1);

        ctxEnv.createdCanvases[1].fireContextLost();
        ctxEnv.vfx.renderBackPass(ctx2d, 1440, 900, 0.54, sk, act, {});
        assert.equal(ctxEnv.vfx.getDiagnostics().mode, 'canvas2d-3d', 'Mất context ngoài ý muốn >= 2 lần phải khóa về canvas2d-3d');
        assert.equal(ctxEnv.vfx.getDiagnostics().fallbackReason, 'webgl_context_lost_repeated');

        const rejEnv = createKernelVm({ enableWebGl: true, rejectContext: true });
        rejEnv.vfx.renderBackPass(ctx2d, 1440, 900, 0.5, sk, act, {});
        assert.equal(rejEnv.getStats().cvListeners, 0, 'getContext trả null không được rò listener trên canvas bỏ đi');

        // 3. M-2: Không hồi sinh tài nguyên khi gọi render/mount sau destroy()
        const deadEnv = createKernelVm({ enableWebGl: true, manualClock: true });
        deadEnv.vfx.renderBackPass(ctx2d, 1440, 900, 0.5, sk, act, {});
        assert.equal(deadEnv.getStats().contextsCreated, 1);
        deadEnv.vfx.destroy();
        deadEnv.vfx.mountStageLayers(null);
        deadEnv.vfx.renderBackPass(ctx2d, 1440, 900, 0.5, sk, act, {});
        deadEnv.vfx.renderFrontPass(ctx2d, 1440, 900, 0.5, sk, act, {});
        assert.equal(deadEnv.getStats().contextsCreated, 1, 'Sau destroy() không được tạo thêm WebGL context');
        assert.equal(deadEnv.getStats().docListeners, 0, 'Sau destroy() không được gắn lại listener visibilitychange');
        assert.equal(deadEnv.getStats().pendingTimers, 0, 'Sau destroy() không được đặt lại timer Lease');
    });

    it('F20-T2-06 [M-3, T-1..T-9]: Rodrigues góc gắt chính xác, guard prototype/NaN, viewport nhỏ, fallback rAF & setMuted("false")', () => {
        // 1. M-3: Kiểm tra trực tiếp độ chính xác xoay Rodrigues trong appendRibbon trên đường gấp khúc góc gắt ~45°
        const sIdx = KERNEL_SRC.indexOf('const STRIDE = 9');
        const eIdx = KERNEL_SRC.indexOf('/* 3. 60 CANONICAL');
        const ribCtx = vm.createContext({
            Float32Array,
            Int32Array,
            hypot: Math.hypot,
            abs: Math.abs,
            cos: Math.cos,
            sin: Math.sin,
            clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
        });
        const rib = vm.runInContext(
            `${KERNEL_SRC.slice(sIdx, eIdx)};({ setNode, appendRibbon, RV, reset(){ RVC = 0; } })`,
            ribCtx
        );
        const nNodes = 32;
        for (let i = 0; i < nNodes; i++) {
            const ang = i * 0.72;
            rib.setNode(i, Math.cos(ang) * 180, Math.sin(ang * 1.7) * 150, i * 24, 44, 1, 0);
        }
        rib.reset();
        rib.appendRibbon(nNodes);
        const W = [];
        const T = [];
        for (let i = 0; i < nNodes; i++) {
            const o = i * 18;
            const wx = rib.RV[o + 9] - rib.RV[o];
            const wy = rib.RV[o + 10] - rib.RV[o + 1];
            const wz = rib.RV[o + 11] - rib.RV[o + 2];
            const wl = Math.hypot(wx, wy, wz);
            W.push([wx / wl, wy / wl, wz / wl]);
            const a = Math.max(0, i - 1) * 18;
            const b = Math.min(nNodes - 1, i + 1) * 18;
            const tx = (rib.RV[b] + rib.RV[b + 9] - rib.RV[a] - rib.RV[a + 9]) * 0.5;
            const ty = (rib.RV[b + 1] + rib.RV[b + 10] - rib.RV[a + 1] - rib.RV[a + 10]) * 0.5;
            const tz = (rib.RV[b + 2] + rib.RV[b + 11] - rib.RV[a + 2] - rib.RV[a + 11]) * 0.5;
            const tl = Math.hypot(tx, ty, tz);
            T.push([tx / tl, ty / tl, tz / tl]);
        }
        let maxTwistDeg = 0;
        for (let i = 1; i < nNodes; i++) {
            const p = T[i - 1];
            const t = T[i];
            const vx = p[1] * t[2] - p[2] * t[1];
            const vy = p[2] * t[0] - p[0] * t[2];
            const vz = p[0] * t[1] - p[1] * t[0];
            const sA = Math.hypot(vx, vy, vz);
            const cA = p[0] * t[0] + p[1] * t[1] + p[2] * t[2];
            let [wx, wy, wz] = W[i - 1];
            if (sA > 1e-6) {
                const kx = vx / sA;
                const ky = vy / sA;
                const kz = vz / sA;
                const kd = (kx * wx + ky * wy + kz * wz) * (1 - cA);
                const ox = wx;
                const oy = wy;
                const oz = wz;
                wx = ox * cA + (ky * oz - kz * oy) * sA + kx * kd;
                wy = oy * cA + (kz * ox - kx * oz) * sA + ky * kd;
                wz = oz * cA + (kx * oy - ky * ox) * sA + kz * kd;
            }
            const dot = Math.min(1, Math.abs(wx * W[i][0] + wy * W[i][1] + wz * W[i][2]));
            maxTwistDeg = Math.max(maxTwistDeg, (Math.acos(dot) * 180) / Math.PI);
        }
        assert.ok(maxTwistDeg < 0.5, `Sai số xoắn Rodrigues quá lớn: ${maxTwistDeg.toFixed(3)}°`);

        // 2. T-1, T-2, T-5, T-6: Prototype guard, NaN index, viewport nhỏ 200x150, near===far & mat4Multiply aliasing
        const env = createKernelVm({ enableWebGl: false, manualClock: true, noRaf: true });
        const validSet = new Set(Object.values(env.vfx.ARCHETYPES));
        for (const badInput of [
            [{ id: 'constructor' }, { persona: 'toString' }],
            [{ id: '__proto__', index: NaN }, { fxMode: 'constructor' }],
            [{ id: 'hasOwnProperty', index: Infinity }, {}],
        ]) {
            const prof = env.vfx.resolveSkill3DProfile(badInput[0], badInput[1]);
            assert.ok(validSet.has(prof.archetype), `Archetype hỏng với input prototype: ${prof.archetype}`);
            assert.equal(Number.isFinite(prof.elemMode), true);
            assert.equal(Number.isFinite(prof.formIndex), true);
        }

        const pEq = env.vfx.mat4Perspective(1.0, 1.6, 100, 100);
        assert.equal(Array.from(pEq).every(Number.isFinite), true, 'mat4Perspective(near===far) phải hữu hạn');
        const ma = Float32Array.from({ length: 16 }, (_, i) => (i % 5) - 1.5);
        const mb = Float32Array.from({ length: 16 }, (_, i) => ((i * 3) % 7) - 2.5);
        const mRef = env.vfx.mat4Multiply(ma, mb);
        const mAlias = env.vfx.mat4Multiply(ma, mb, ma);
        for (let i = 0; i < 16; i++) {
            assert.ok(Math.abs(mRef[i] - mAlias[i]) < 1e-5, `mat4Multiply sai tại phần tử ${i} khi out === a`);
        }

        const smallActor = env.vfx.computeActor3DTrajectory(200, 150, 0.5, { id: 'giyu_1' });
        const smallCam = env.vfx.computeCameraState(0.5, smallActor.archetype, { width: 200, height: 150 });
        const smallProj = env.vfx.projectPoint3D(smallActor.worldX, smallActor.worldY, smallActor.worldZ, smallCam.vpMat, 200, 150);
        assert.ok(Math.abs(smallActor.sx - smallProj.sx) < 1 && Math.abs(smallActor.sy - smallProj.sy) < 1, 'Viewport 200x150 phải đồng nhất');

        // 3. T-9: setMuted('false') / setMuted('0') -> false
        assert.equal(env.skills.setMuted('true'), true);
        assert.equal(env.skills.isMuted(), true);
        assert.equal(env.skills.setMuted('false'), false);
        assert.equal(env.skills.isMuted(), false);
        assert.equal(env.skills.setMuted('0'), false);
        assert.equal(env.skills.isMuted(), false);

        // 4. T-8: Fallback setTimeout khi thiếu requestAnimationFrame vẫn chạy nhiều frame bình thường
        const castRes = env.skills.castSkill('giyu', 'giyu_3', { composerEl: null, noActionSprite: true });
        assert.equal(castRes.ok, true);
        env.advanceTime(400);
        assert.ok(env.getStats().pendingTimers >= 1, 'Fallback setTimeout phải tiếp tục chạy chiêu thay vì dừng ngay frame đầu');
        env.skills.destroy();
    });
});

function createChibi3dVm(opts = {}) {
    const KERNEL_FILE_SRC = KERNEL_SRC;
    const SKILLS_FILE_SRC = SKILLS_SRC;
    const AURA_FILE_SRC = fs.readFileSync(path.join(REPO_ROOT, 'engine', 'kny_chibi_aura.js'), 'utf8');

    let texCreated = 0, texDeleted = 0;
    let bufCreated = 0, bufDeleted = 0;
    let progCreated = 0, progDeleted = 0;
    let drawElementsCalled = 0;
    let cullDisabledCount = 0;
    const drawElementsTypes = [];
    const cullModes = [];
    const createdCanvases = [];
    let nowClock = 2000;
    const timers = new Map();
    let nextTimerId = 1;
    const rafs = new Map();
    let nextRafId = 1;
    const storage = new Map();

    function createFullGl() {
        return {
            VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
            COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
            ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893,
            DYNAMIC_DRAW: 0x88e8, STATIC_DRAW: 0x88e4,
            FLOAT: 0x1406, UNSIGNED_SHORT: 0x1403, UNSIGNED_INT: 0x1405, UNSIGNED_BYTE: 0x1401,
            RGBA: 0x1908, TEXTURE_2D: 0x0de1, TEXTURE0: 0x84c0,
            TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
            TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
            LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812f, REPEAT: 0x2901, MIRRORED_REPEAT: 0x8370,
            UNPACK_FLIP_Y_WEBGL: 0x9240,
            DEPTH_TEST: 0x0b71, LEQUAL: 0x0203, BLEND: 0x0be2,
            ONE: 1, ONE_MINUS_SRC_ALPHA: 0x0303,
            COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100,
            TRIANGLE_STRIP: 0x0005, TRIANGLES: 0x0004,
            CULL_FACE: 0x0b44, FRONT: 0x0404, BACK: 0x0405, SCISSOR_TEST: 0x0c11,
            RENDERER: 0x1f01, VERSION: 0x1f02,
            getExtension(name) {
                if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 0x9246 };
                if (name === 'WEBGL_lose_context') return { loseContext: () => {} };
                if (name === 'OES_element_index_uint') return {};
                return null;
            },
            getParameter(p) {
                if (p === 0x9246 || p === 0x1f01) return 'ANGLE (AMD, Radeon Pro 5500M Direct3D11)';
                return 'WebGL 2.0';
            },
            createShader: () => ({}),
            shaderSource: () => {},
            compileShader: () => {},
            getShaderParameter: () => true,
            getShaderInfoLog: () => '',
            deleteShader: () => {},
            createProgram: () => { progCreated++; return {}; },
            bindAttribLocation: () => {},
            attachShader: () => {},
            linkProgram: () => {},
            getProgramParameter: () => true,
            getProgramInfoLog: () => '',
            deleteProgram: () => { progDeleted++; },
            useProgram: () => {},
            getUniformLocation: (_p, n) => ({ n }),
            createBuffer: () => { bufCreated++; return {}; },
            bindBuffer: () => {},
            bufferData: () => {},
            bufferSubData: () => {},
            deleteBuffer: () => { bufDeleted++; },
            createTexture: () => { texCreated++; return {}; },
            deleteTexture: () => { texDeleted++; },
            bindTexture: () => {},
            texParameteri: () => {},
            texImage2D: () => {},
            activeTexture: () => {},
            createVertexArray: () => ({}),
            bindVertexArray: () => {},
            deleteVertexArray: () => {},
            enableVertexAttribArray: () => {},
            disableVertexAttribArray: () => {},
            vertexAttribPointer: () => {},
            pixelStorei: () => {},
            viewport: () => {},
            scissor: () => {},
            enable: () => {},
            disable: (cap) => { if (cap === 0x0b44) cullDisabledCount++; },
            cullFace: (m) => { cullModes.push(m); },
            depthFunc: () => {},
            depthMask: () => {},
            blendFunc: () => {},
            clearColor: () => {},
            clear: () => {},
            uniform1f: () => {},
            uniform1i: () => {},
            uniform3f: () => {},
            uniformMatrix3fv: () => {},
            uniformMatrix4fv: () => {},
            drawArrays: () => {},
            drawElements: (_m, _c, t) => { drawElementsCalled++; if (t !== undefined) drawElementsTypes.push(t); },
        };
    }

    const docNodes = [];
    function attachDomHelpers(el) {
        const lMap = new Map();
        el._listeners = lMap;
        el.children = [];
        el.parentElement = null;
        el.isConnected = true;
        el.attributes = new Map();
        el.dataset = {};
        el.style = { setProperty: () => {}, removeProperty: () => {} };
        el.classList = {
            add: (...cls) => { el.className = (el.className ? el.className + ' ' : '') + cls.join(' '); },
            remove: () => {},
            contains: (c) => String(el.className || '').split(/\s+/).includes(c),
        };
        el.setAttribute = (k, v) => el.attributes.set(k, String(v));
        el.getAttribute = (k) => (el.attributes.has(k) ? el.attributes.get(k) : null);
        el.removeAttribute = (k) => el.attributes.delete(k);
        el.appendChild = (ch) => {
            ch.parentElement = el;
            el.children.push(ch);
            docNodes.push(ch);
            return ch;
        };
        el.insertBefore = (ch, ref) => {
            ch.parentElement = el;
            const idx = el.children.indexOf(ref);
            if (idx >= 0) el.children.splice(idx, 0, ch);
            else el.children.push(ch);
            docNodes.push(ch);
            return ch;
        };
        el.remove = () => {
            if (el.parentElement) {
                const idx = el.parentElement.children.indexOf(el);
                if (idx >= 0) el.parentElement.children.splice(idx, 1);
            }
            el.isConnected = false;
        };
        el.closest = (sel) => {
            const cls = sel.startsWith('.') ? sel.slice(1) : '';
            let cur = el;
            while (cur) {
                if (cls && String(cur.className || '').split(/\s+/).includes(cls)) return cur;
                cur = cur.parentElement;
            }
            return null;
        };
        const matchesSimple = (n, sel) => {
            if (!sel) return false;
            if (sel === 'canvas') return n.tagName === 'CANVAS';
            if (sel.startsWith('.')) return String(n.className || '').split(/\s+/).includes(sel.slice(1));
            if (sel.startsWith('#')) return n.id === sel.slice(1);
            const attrMatch = sel.match(/^\[data-npc-act="([^"]+)"\]$/);
            if (attrMatch) return Boolean(n.dataset && n.dataset.npcAct === attrMatch[1]);
            return n.tagName && n.tagName.toLowerCase() === sel.toLowerCase();
        };
        el.querySelector = (sel) => {
            for (const c of el.children) {
                if (matchesSimple(c, sel)) return c;
                if (typeof c.querySelector === 'function') {
                    const deep = c.querySelector(sel);
                    if (deep) return deep;
                }
            }
            return null;
        };
        el.querySelectorAll = (sel) => {
            const out = [];
            for (const c of el.children) {
                if (matchesSimple(c, sel)) out.push(c);
                if (typeof c.querySelectorAll === 'function') out.push(...c.querySelectorAll(sel));
            }
            return out;
        };
        el.getBoundingClientRect = () => ({ left: 1000, top: 760, width: 162, height: 84 });
        el.addEventListener = (type, fn, capOpts) => {
            const cap = typeof capOpts === 'boolean' ? capOpts : Boolean(capOpts && capOpts.capture);
            if (!lMap.has(type)) lMap.set(type, []);
            lMap.get(type).push({ fn, cap });
        };
        el.removeEventListener = (type, fn, capOpts) => {
            const cap = typeof capOpts === 'boolean' ? capOpts : Boolean(capOpts && capOpts.capture);
            const arr = lMap.get(type);
            if (!arr) return;
            for (let i = arr.length - 1; i >= 0; i--) {
                if (arr[i].fn === fn && arr[i].cap === cap) arr.splice(i, 1);
            }
        };
        el.dispatchEvent = (ev) => {
            const e = { target: el, currentTarget: el, button: 0, pointerType: 'mouse', clientX: 0, clientY: 0, preventDefault: () => {}, stopPropagation: () => {}, ...ev };
            const chain = [];
            let cur = el;
            while (cur) { chain.unshift(cur); cur = cur.parentElement; }
            for (const node of chain) {
                const arr = (node._listeners && node._listeners.get(e.type)) || [];
                for (const h of [...arr]) h.fn(e);
            }
        };
        return el;
    }

    function makeEl(tag) {
        const el = attachDomHelpers({ tagName: String(tag || 'div').toUpperCase(), id: '', className: '', textContent: '' });
        if (el.tagName === 'CANVAS') {
            el.width = 300;
            el.height = 150;
            el.getContext = (kind) => {
                if (kind === '2d') return createMockCtx2d(true);
                if (opts.enableWebGl && (kind === 'webgl2' || kind === 'webgl')) return createFullGl();
                return null;
            };
            createdCanvases.push(el);
        }
        return el;
    }

    const docListenersMap = new Map();
    const doc = {
        hidden: false,
        visibilityState: 'visible',
        head: makeEl('head'),
        body: makeEl('body'),
        documentElement: makeEl('html'),
        createElement: (t) => makeEl(t),
        getElementById: (id) => docNodes.find((n) => n.id === id) || null,
        querySelector: (sel) => (sel.startsWith('#') ? docNodes.find((n) => n.id === sel.slice(1)) || null : null),
        querySelectorAll: (sel) => docNodes.filter((n) => n.tagName.toLowerCase() === sel.toLowerCase() || (sel.startsWith('.') && String(n.className || '').split(/\s+/).includes(sel.slice(1)))),
        addEventListener(type, fn, capOpts) {
            const cap = typeof capOpts === 'boolean' ? capOpts : Boolean(capOpts && capOpts.capture);
            if (!docListenersMap.has(type)) docListenersMap.set(type, []);
            docListenersMap.get(type).push({ fn, cap });
        },
        removeEventListener(type, fn, capOpts) {
            const cap = typeof capOpts === 'boolean' ? capOpts : Boolean(capOpts && capOpts.capture);
            const arr = docListenersMap.get(type);
            if (!arr) return;
            for (let i = arr.length - 1; i >= 0; i--) {
                if (arr[i].fn === fn && arr[i].cap === cap) arr.splice(i, 1);
            }
        },
        dispatchEvent(ev) {
            const arr = docListenersMap.get(ev.type) || [];
            for (const h of [...arr]) h.fn(ev);
        },
    };

    const win = {
        document: doc,
        devicePixelRatio: opts.dpr || 1,
        innerWidth: 1440,
        innerHeight: 900,
        localStorage: {
            getItem: (k) => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: (k) => storage.delete(k),
        },
        performance: { now: () => nowClock },
        setTimeout: (fn, ms) => { const id = nextTimerId++; timers.set(id, { fn, at: nowClock + (Number(ms) || 0) }); return id; },
        clearTimeout: (id) => { timers.delete(id); },
        setInterval: (fn, ms) => { const id = nextTimerId++; timers.set(id, { fn, at: nowClock + (Number(ms) || 0) }); return id; },
        clearInterval: (id) => { timers.delete(id); },
        requestAnimationFrame: (fn) => { const id = nextRafId++; rafs.set(id, fn); return id; },
        cancelAnimationFrame: (id) => { rafs.delete(id); },
        matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
        addEventListener: () => {},
        removeEventListener: () => {},
    };
    if (opts.enableWebGl) {
        win.WebGLRenderingContext = function WebGLRenderingContext() {};
        win.WebGL2RenderingContext = function WebGL2RenderingContext() {};
    }

    const ctx = vm.createContext({
        window: win, globalThis: win, document: doc, performance: win.performance,
        localStorage: win.localStorage, WebGLRenderingContext: win.WebGLRenderingContext,
        WebGL2RenderingContext: win.WebGL2RenderingContext,
        requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: win.cancelAnimationFrame,
        setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
        setInterval: win.setInterval, clearInterval: win.clearInterval,
        Math, Number, String, Boolean, Object, Array, Float32Array, Uint16Array,
        Int32Array, Uint8Array, Uint32Array, Int8Array, Int16Array, DataView, ArrayBuffer,
        TextDecoder, TextEncoder, Map, Set, RegExp, Date, Promise, Error, console,
    });
    vm.runInContext(KERNEL_FILE_SRC, ctx);
    vm.runInContext(SKILLS_FILE_SRC, ctx);
    vm.runInContext(AURA_FILE_SRC, ctx);

    return {
        win, doc, makeEl,
        chibi3d: win.__AGY_KNY_CHIBI_3D__,
        vfx: win.__AGY_KNY_3D_VFX__,
        skills: win.__AGY_KNY_SKILLS__,
        aura: win.__AGY_KNY_CHIBI_AURA__,
        stepRaf(dtMs = 16) {
            nowClock += dtMs;
            const batch = [...rafs.values()];
            rafs.clear();
            for (const fn of batch) fn(nowClock);
        },
        getMetrics: () => ({
            texCreated, texDeleted, bufCreated, bufDeleted, progCreated, progDeleted,
            drawElementsCalled, drawElementsTypes: [...drawElementsTypes], cullDisabledCount, cullModes: [...cullModes],
            pendingTimers: timers.size, pendingRafs: rafs.size,
            docListeners: [...docListenersMap.values()].reduce((s, a) => s + a.length, 0),
        }),
    };
}

function buildMinimalGlbArrayBuffer(meshCount = 1, vertsPerMesh = 3, extraOpts = {}) {
    const rawCoords = [0, 0, 0, 1, 0, 0, 0.5, 2, 0];
    const posLen = vertsPerMesh * 12;
    const withColor0 = Boolean(extraOpts && extraOpts.withColor0);
    const colLen = withColor0 ? vertsPerMesh * 12 : 0;
    const binLen = posLen + colLen;
    const binBuf = Buffer.alloc(binLen);
    for (let i = 0; i < Math.min(vertsPerMesh, 3); i++) {
        binBuf.writeFloatLE(rawCoords[i * 3], i * 12);
        binBuf.writeFloatLE(rawCoords[i * 3 + 1], i * 12 + 4);
        binBuf.writeFloatLE(rawCoords[i * 3 + 2], i * 12 + 8);
    }
    if (withColor0) {
        const rgb = extraOpts.color0 || [0.95, 0.55, 0.8];
        for (let i = 0; i < vertsPerMesh; i++) {
            const off = posLen + i * 12;
            binBuf.writeFloatLE(rgb[0], off);
            binBuf.writeFloatLE(rgb[1], off + 4);
            binBuf.writeFloatLE(rgb[2], off + 8);
        }
    }
    const attrs = withColor0 ? { POSITION: 0, COLOR_0: 1 } : { POSITION: 0 };
    const meshes = [];
    for (let m = 0; m < meshCount; m++) {
        meshes.push({ primitives: [{ attributes: attrs, material: 0 }] });
    }
    const bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: posLen }];
    const accessors = [{ bufferView: 0, componentType: 5126, count: vertsPerMesh, type: 'VEC3' }];
    if (withColor0) {
        bufferViews.push({ buffer: 0, byteOffset: posLen, byteLength: colLen });
        accessors.push({ bufferView: 1, componentType: 5126, count: vertsPerMesh, type: 'VEC3' });
    }
    const mat0 = { pbrMetallicRoughness: { baseColorFactor: [0.92, 0.42, 0.74, 1.0] } };
    if (extraOpts && extraOpts.doubleSided) mat0.doubleSided = true;
    if (extraOpts && extraOpts.alphaMode) mat0.alphaMode = extraOpts.alphaMode;
    if (extraOpts && Number.isFinite(extraOpts.alphaCutoff)) mat0.alphaCutoff = extraOpts.alphaCutoff;
    const jsonObj = {
        asset: { version: '2.0' },
        buffers: [{ byteLength: binLen }],
        bufferViews,
        accessors,
        materials: [mat0],
        meshes,
    };
    let jsonStr = JSON.stringify(jsonObj);
    while (Buffer.byteLength(jsonStr, 'utf8') % 4 !== 0) jsonStr += ' ';
    const jsonBuf = Buffer.from(jsonStr, 'utf8');
    const totalLen = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
    const out = Buffer.alloc(totalLen);
    out.writeUInt32LE(0x46546C67, 0);
    out.writeUInt32LE(2, 4);
    out.writeUInt32LE(totalLen, 8);
    out.writeUInt32LE(jsonBuf.length, 12);
    out.writeUInt32LE(0x4E4F534A, 16);
    jsonBuf.copy(out, 20);
    const binOff = 20 + jsonBuf.length;
    out.writeUInt32LE(binBuf.length, binOff);
    out.writeUInt32LE(0x004E4942, binOff + 4);
    binBuf.copy(out, binOff + 8);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

describe('F23 — Nhân vật Chibi 3D Cel-Shaded (WebGL2 & Canvas2D Fallback), Bộ nạp .glb & Tích hợp Sân khấu', () => {
    it('F23-T1-01: Phủ đủ 15 anh hùng Kimetsu no Yaiba + alias moon, dựng 3D composer & stage 0 NaN trên WebGL2 lẫn Canvas2D fallback', () => {
        const glEnv = createChibi3dVm({ enableWebGl: true });
        const swEnv = createChibi3dVm({ enableWebGl: false });
        assert.equal(glEnv.chibi3d.CHARACTER_IDS.length, 15, 'Phải có đủ 15 anh hùng Chibi 3D');
        assert.equal(glEnv.chibi3d.CHIBI_PROFILES.moon.id, 'obanai', 'Alias moon phải trỏ về obanai');

        const ctxGl2d = createMockCtx2d(true);
        const ctxSw2d = createMockCtx2d(true);
        for (const cid of glEnv.chibi3d.CHARACTER_IDS) {
            assert.equal(glEnv.chibi3d.CHIBI_PROFILES[cid].id, cid);
            const pose = glEnv.chibi3d.computeChibiPose('composer', cid, { timeSec: 1.2, reaction: 'happy', blinkAmt: 0.4, orbitYaw: 1.5 });
            assert.equal(Number.isFinite(pose.rootY) && Number.isFinite(pose.headYaw), true);

            const r1 = glEnv.chibi3d.renderChibiTo2D(ctxGl2d, 136, 112, cid, { timeSec: 1.2, lookYaw: 0.2 }, { dpr: 1 });
            assert.equal(r1.ok, true);
            assert.equal(r1.mode, 'webgl2');

            const r2 = swEnv.chibi3d.renderChibiTo2D(ctxSw2d, 136, 112, cid, { timeSec: 1.2, lookYaw: 0.2 }, { force2dFallback: true });
            assert.equal(r2.ok, true);
            assert.equal(r2.mode, 'canvas2d-3d');

            const okStageGl = glEnv.chibi3d.renderStageChibi3D(ctxGl2d, 1440, 900, { sx: 720, sy: 450, size: 220, phase: 'slash', slashing: 1, facing: 1 }, { id: `${cid}_1`, charId: cid }, 0.42, { dpr: 1 });
            const okStageSw = swEnv.chibi3d.renderStageChibi3D(ctxSw2d, 1440, 900, { sx: 720, sy: 450, size: 220, phase: 'charge', charging: 1, facing: -1 }, { id: `${cid}_2`, charId: cid }, 0.14, { reducedMotion: true });
            assert.equal(okStageGl, true);
            assert.equal(okStageSw, true);
        }
        assert.ok(ctxSw2d.ops.some((o) => o.fn === 'fill'), 'Nhánh Canvas2D 3D fallback phải tô đa giác chiều sâu');
        glEnv.vfx.destroy();
        swEnv.vfx.destroy();
    });

    it('F23-T1-02: Render 2-pass Toon + Inverted-Hull Outline (FRONT + BACK), Face Texture cache <= 32 & thu hồi 100% VRAM', () => {
        const env = createChibi3dVm({ enableWebGl: true });
        const ctx2d = createMockCtx2d();
        for (const cid of env.chibi3d.CHARACTER_IDS) {
            for (const expr of ['idle', 'happy', 'focus', 'attack']) {
                env.chibi3d.renderChibiTo2D(ctx2d, 136, 112, cid, { timeSec: 0.5, reaction: expr, blinkAmt: 0 }, { dpr: 1 });
            }
        }
        const m = env.getMetrics();
        assert.ok(m.cullModes.includes(0x0404) && m.cullModes.includes(0x0405), 'Phải vẽ cả pass viền mực (FRONT) và pass Toon shading (BACK)');
        assert.ok(env.chibi3d.getDiagnostics().faceCacheCount <= 32, 'LRU cache khuôn mặt không được vượt ngưỡng 32');

        env.vfx.destroy();
        const after = env.getMetrics();
        assert.equal(after.texDeleted, after.texCreated, 'Toàn bộ WebGL texture phải được delete khi destroy()');
        assert.equal(after.bufDeleted, after.bufCreated, 'Toàn bộ VBO/IBO phải được delete khi destroy()');
        assert.equal(after.progDeleted, after.progCreated, 'Toàn bộ shader program phải được delete khi destroy()');
    });

    it('F23-T1-03: Parse binary glTF 2.0 / VRM (.glb / .vrm) tới 250.000 đỉnh (Uint32, COLOR_0, doubleSided, MASK) & render custom model', async () => {
        const env = createChibi3dVm({ enableWebGl: true });
        assert.equal(env.chibi3d.hasRealGlbModel('shinobu'), false);
        assert.equal(env.chibi3d.hasRealGlbModel('moon'), false);

        const glbBuf = buildMinimalGlbArrayBuffer(1, 3);
        const parsed = env.chibi3d.parseGlbArrayBuffer(glbBuf, { fileName: 'mini_chibi.glb' });
        assert.equal(parsed.vertexCount, 3);
        assert.equal(parsed.bounds.minY, 0);
        assert.ok(Math.abs(parsed.bounds.height - 1.68) < 1e-4, 'Chiều cao model .glb phải được chuẩn hóa về 1.68');
        assert.equal(parsed.primitives[0].vertices.length, 3 * 11, 'Stride đỉnh .glb phải là 11 float (pos+norm+uv+col)');

        // Hỗ trợ .vrm + COLOR_0 + doubleSided + alphaMode: 'MASK'
        const vrmBuf = buildMinimalGlbArrayBuffer(1, 3, {
            withColor0: true,
            color0: [0.95, 0.55, 0.8],
            doubleSided: true,
            alphaMode: 'MASK',
            alphaCutoff: 0.45,
        });
        const parsedVrm = env.chibi3d.parseGlbArrayBuffer(vrmBuf, { fileName: 'mitsuri.vrm' });
        assert.equal(parsedVrm.primitives[0].doubleSided, true);
        assert.ok(Math.abs(parsedVrm.primitives[0].alphaCutoff - 0.45) < 1e-4);
        assert.ok(Math.abs(parsedVrm.primitives[0].vertices[8] - 0.95) < 1e-4, 'Phải đọc COLOR_0 vào offset float +8');

        const loadedVrm = await env.chibi3d.setCustomGlbModel('mitsuri', vrmBuf, { fileName: 'mitsuri.vrm' });
        assert.equal(loadedVrm.charId, 'mitsuri');
        assert.equal(env.chibi3d.hasRealGlbModel('mitsuri'), true);
        assert.equal(env.chibi3d.getCustomGlbInfo('mitsuri').loaded, true);

        const ctx2d = createMockCtx2d(true);
        const cullCountBefore = env.getMetrics().cullModes.length;
        const vrmGlRes = env.chibi3d.renderChibiTo2D(ctx2d, 136, 112, 'mitsuri', { timeSec: 0.2 }, { dpr: 1 });
        assert.equal(vrmGlRes.ok, true);
        assert.equal(vrmGlRes.customGlb, true);
        assert.ok(env.getMetrics().cullDisabledCount >= 1, 'Primitive doubleSided phải tắt CULL_FACE');
        assert.equal(env.getMetrics().cullModes.slice(cullCountBefore).includes(0x0404), false, 'Model .glb/.vrm không được chạy pass Inverted-Hull FRONT');

        // Alias moon -> obanai đồng bộ trạng thái mô hình
        await env.chibi3d.setCustomGlbModel('moon', glbBuf, { fileName: 'obanai.glb' });
        assert.equal(env.chibi3d.hasRealGlbModel('moon'), true);
        assert.equal(env.chibi3d.hasRealGlbModel('obanai'), true);
        await env.chibi3d.clearCustomGlbModel('obanai');
        assert.equal(env.chibi3d.hasRealGlbModel('moon'), false);

        // Hỗ trợ > 65.535 đỉnh (ví dụ 80.000 đỉnh dùng Uint32Array + UNSIGNED_INT)
        const glb80k = buildMinimalGlbArrayBuffer(2, 40000);
        const parsed80k = env.chibi3d.parseGlbArrayBuffer(glb80k, { fileName: 'dense_80k.glb' });
        assert.equal(parsed80k.vertexCount, 80000);
        assert.ok(parsed80k.primitives[0].indices instanceof Uint32Array, 'Model > 65.535 đỉnh phải dùng Uint32Array');
        await env.chibi3d.setCustomGlbModel('shinobu', glb80k, { fileName: 'dense_80k.glb' });
        const denseRes = env.chibi3d.renderChibiTo2D(ctx2d, 136, 112, 'shinobu', { timeSec: 0.2 }, { dpr: 1 });
        assert.equal(denseRes.ok, true);
        assert.equal(denseRes.customGlb, true);
        assert.ok(env.getMetrics().drawElementsTypes.includes(0x1405), 'Phải vẽ bằng gl.UNSIGNED_INT cho mesh > 65.535 đỉnh');

        const swRes = env.chibi3d.renderChibiTo2D(ctx2d, 136, 112, 'shinobu', { timeSec: 0.2 }, { force2dFallback: true });
        assert.equal(swRes.ok, true);
        assert.equal(swRes.mode, 'canvas2d-3d');
        assert.equal(swRes.customGlb, true, 'Nhánh Canvas2D fallback cũng phải render được model .glb/.vrm tùy chỉnh');

        await env.chibi3d.clearCustomGlbModel('mitsuri');
        await env.chibi3d.clearCustomGlbModel('shinobu');
        assert.equal(env.chibi3d.hasRealGlbModel('shinobu'), false);
        assert.equal(env.chibi3d.getCustomGlbInfo('shinobu').loaded, false);

        assert.throws(() => env.chibi3d.parseGlbArrayBuffer(new ArrayBuffer(4)), /Kích thước tệp \.glb/);
        const badMagic = new Uint8Array(24);
        assert.throws(() => env.chibi3d.parseGlbArrayBuffer(badMagic.buffer), /Header glTF 2\.0/);
        const hugeGlb = buildMinimalGlbArrayBuffer(4, 70000);
        assert.throws(() => env.chibi3d.parseGlbArrayBuffer(hugeGlb), /250\.000 đỉnh/);

        env.vfx.destroy();
    });

    it('F23-T1-04: Mặc định 2D sắc nét khi thiếu .glb/.vrm, tự bật 3D khi nạp .glb, nút chuyển 2D/3D & không rò rỉ', async () => {
        const env = createChibi3dVm({ enableWebGl: true, dpr: 1 });
        const composer = env.makeEl('div');
        composer.className = 'surface-composer';
        const hitbox = env.makeEl('button');
        hitbox.className = 'agy-chibi-hitbox';
        composer.appendChild(hitbox);
        env.doc.body.appendChild(composer);

        // A. Khi chưa có .glb/.vrm và không opt-in allowProcedural3d -> chỉ giữ canvas aura 162x84, hiển thị ảnh 2D gốc
        const host2d = env.aura.mountChibiAura(composer, { fxMode: 'shinobu', chibi3dEnabled: true }, 'shinobu');
        assert.ok(host2d, 'mountChibiAura vẫn phải gắn <agy-chibi-aura> cho vòng khí');
        assert.equal(host2d.children.length, 1, 'Chưa có .glb/.vrm thì chỉ được gắn 1 canvas aura 162x84, dùng ảnh 2D gốc');
        assert.equal(composer.dataset.chibi3dActive, undefined);
        assert.equal(env.aura.getChibi3dState().active, false);

        // B. Khi nạp tệp .glb thật cho shinobu -> tự kích hoạt Chibi 3D (.agy-chibi-3d-canvas) giữ nguyên canvas đầu 162x84
        await env.chibi3d.setCustomGlbModel('shinobu', buildMinimalGlbArrayBuffer(1, 3), { fileName: 'shinobu.glb' });
        const host = env.aura.mountChibiAura(composer, { fxMode: 'shinobu', chibi3dEnabled: true }, 'shinobu');
        assert.ok(host, 'mountChibiAura phải gắn <agy-chibi-aura>');
        assert.equal(host.children.length, 2, 'Khi có .glb phải có 2 canvas: aura (162x84) và .agy-chibi-3d-canvas');
        assert.equal(host.querySelector('canvas').width, 162, 'Canvas đầu tiên phải giữ nguyên width=162');
        assert.equal(host.querySelector('canvas').height, 84, 'Canvas đầu tiên phải giữ nguyên height=84');
        assert.equal(host.children[1].className, 'agy-chibi-3d-canvas');
        assert.equal(composer.dataset.chibi3dActive, '1');

        env.stepRaf(16);
        assert.ok(env.aura.getChibi3dState().active);
        assert.equal(env.aura.getChibi3dState().mode, 'webgl2');

        // Kéo xoay 360° trên hitbox >= 6px -> kích hoạt orbitYaw & khóa click nhầm
        hitbox.dispatchEvent({ type: 'pointerdown', clientX: 50, clientY: 50, button: 0, pointerType: 'mouse' });
        env.doc.dispatchEvent({ type: 'pointermove', clientX: 110, clientY: 55 });
        assert.equal(composer.dataset.chibi3dDragging, '1');
        assert.ok(Math.abs(env.aura.getChibi3dState().orbitYaw) > 0.5, 'Kéo ngang phải xoay orbitYaw 3D');
        env.doc.dispatchEvent({ type: 'pointerup' });

        // Double-click reset góc xoay về 0 + biểu cảm happy
        hitbox.dispatchEvent({ type: 'dblclick' });
        assert.equal(env.aura.getChibi3dState().orbitYaw, 0);
        assert.equal(env.aura.getChibi3dState().reaction, 'happy');

        // Thi triển chiêu thức lên sân khấu khi có .glb -> phải gọi 3D Stage Chibi
        const beforeDraws = env.getMetrics().drawElementsCalled;
        const castRes = env.skills.castSkill('shinobu', 0, { composerEl: composer, chibi3dEnabled: true });
        assert.equal(castRes.ok, true);
        env.stepRaf(16);
        env.stepRaf(20);
        assert.ok(env.getMetrics().drawElementsCalled > beforeDraws, 'Sân khấu phải vẽ nhân vật Chibi 3D qua WebGL2 drawElements khi có .glb');

        // C. Nút chuyển nhanh trên NPC Popover (.agy-npc-mode-pill) cho phép bật về 2D ngay kể cả khi đang có .glb
        const npcWrap = env.makeEl('div');
        npcWrap.id = 'agy-shinobu-npc-wrap';
        const popover = env.makeEl('div');
        popover.className = 'agy-npc-popover';
        const pillsRow = env.makeEl('div');
        pillsRow.className = 'agy-npc-pills';
        const chatOpenBtn = env.makeEl('button');
        chatOpenBtn.dataset.npcAct = 'chat-open';
        pillsRow.appendChild(chatOpenBtn);
        popover.appendChild(pillsRow);
        npcWrap.appendChild(popover);
        env.doc.body.appendChild(npcWrap);

        env.aura.mountSkillTriggerUi(composer, npcWrap, { fxMode: 'shinobu', chibi3dEnabled: true }, 'shinobu');
        const modePill = npcWrap.querySelector('.agy-npc-mode-pill');
        assert.ok(modePill, 'Phải gắn nút chuyển chế độ .agy-npc-mode-pill vào NPC popover');
        assert.equal(modePill.dataset.mode, '3d');
        modePill.dispatchEvent({ type: 'click' });
        assert.equal(modePill.dataset.mode, '2d');
        assert.equal(env.win.localStorage.getItem('agy_chibi_3d_v1'), 'false');
        assert.equal(composer.dataset.chibi3dActive, undefined, 'Bấm chuyển về 2D phải gỡ Chibi 3D để hiển thị ảnh 2D gốc');

        env.aura.teardown();
        env.skills.destroy();
        env.vfx.destroy();
        assert.equal(composer.dataset.chibi3dActive, undefined);
        const mEnd = env.getMetrics();
        assert.equal(mEnd.pendingTimers, 0, 'Không được rò rỉ timer sau teardown toàn hệ thống');
        assert.equal(mEnd.pendingRafs, 0, 'Không được rò rỉ rAF sau teardown toàn hệ thống');
        assert.equal(mEnd.docListeners, 0, 'Không được rò rỉ document listener sau teardown');
    });
});
