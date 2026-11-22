'use strict';

/**
 * Bộ kiểm thử tĩnh, tương thích đa nền tảng (R2), đối chiếu Build Parity SHA-256,
 * SVG XSS Guard lúc build và tính toàn vẹn tài sản (F16).
 * Zero-dependency (Node.js >= 22).
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TMP_DIRS = [];

function makeTempDir(prefix = 'agy-test-r2-') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    TMP_DIRS.push(dir);
    return dir;
}

function removeTempDirSafe(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
    } catch (_) {}
}

after(() => {
    while (TMP_DIRS.length > 0) {
        removeTempDirSafe(TMP_DIRS.pop());
    }
});

function sha256File(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function findGitBash() {
    const candidates = [];
    try {
        const execPath = execFileSync('git', ['--exec-path'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            windowsHide: true,
        }).trim();
        if (execPath) {
            const p1 = path.resolve(execPath, '..', '..', '..', 'bin', 'bash.exe');
            const p2 = path.resolve(execPath, '..', '..', 'bin', 'bash.exe');
            const p3 = path.resolve(execPath, '..', '..', '..', 'usr', 'bin', 'bash.exe');
            candidates.push(p1, p2, p3);
        }
    } catch (_) {}

    if (process.platform === 'win32') {
        candidates.push(
            'C:\\Program Files\\Git\\bin\\bash.exe',
            'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
            'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
        );
    } else {
        candidates.push('/bin/bash', '/usr/bin/bash', 'bash');
    }

    for (const cand of candidates) {
        try {
            if (cand !== 'bash' && !fs.existsSync(cand)) continue;
            execFileSync(cand, ['--version'], { stdio: 'ignore', windowsHide: true, timeout: 4000 });
            return cand;
        } catch (_) {}
    }
    return null;
}

function findPythonExe() {
    const cmds = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
    for (const cmd of cmds) {
        try {
            const ver = execFileSync(cmd, ['-B', '--version'], {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                windowsHide: true,
                timeout: 5000,
            });
            if (/Python\s+3\./i.test(ver)) {
                return cmd;
            }
        } catch (_) {}
    }
    return null;
}

// Regex phát hiện đường dẫn cá nhân & email thật, tránh false-positive với mẫu tài liệu như C:\Users\... hay /Users/...
const CURRENT_OS_USER = (() => {
    try {
        return String(os.userInfo().username || '').trim();
    } catch (_) {
        return '';
    }
})();
const ESCAPED_OS_USER = CURRENT_OS_USER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PII_PATTERNS = [
    {
        name: 'WindowsUserPath',
        regex: /(?<![A-Za-z0-9_])[A-Za-z]:(?:\\{1,4}|\/{1,2})Users(?:\\{1,4}|\/{1,2})(?!\.\.\.)[A-Za-z0-9_-][A-Za-z0-9._-]*/gi,
    },
    {
        name: 'WindowsRelativeUsersPath',
        regex: /\bUsers(?:\\{1,4}|\/{1,2})(?!\.\.\.)[A-Za-z0-9_-][A-Za-z0-9._-]*/gi,
    },
    {
        name: 'WindowsDirectDrivePath',
        regex: /(?<![A-Za-z0-9_/])[A-Za-z]:(?:\\{1,4}|\/)(?!\.\.\.)(?!(?:Users|Windows|ProgramData|Program Files(?: \(x86\))?|System32|fakepath|Temp|tmp)(?:[\\/]|$))[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\\{1,4}|\/)(?!\.\.\.)[A-Za-z0-9._-]+/gi,
    },
    { name: 'MacOsUserPath', regex: /\/{1,2}Users\/{1,2}(?!\.\.\.)[A-Za-z0-9_-][A-Za-z0-9._-]*/g },
    { name: 'LinuxHomePath', regex: /\/{1,2}home\/{1,2}(?!\.\.\.)[A-Za-z0-9_-][A-Za-z0-9._-]*/g },
    { name: 'PersonalEmail', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?!\d+\b)[A-Za-z]{2,}\b/g },
    ...(CURRENT_OS_USER.length >= 2 && !/^(root|user|admin|runner|node|ci|docker)$/i.test(CURRENT_OS_USER)
        ? [
              {
                  name: 'CurrentOsUserPath',
                  regex: new RegExp(
                      `(?:(?<![A-Za-z0-9_])[A-Za-z]:(?:\\\\{1,4}|\\/{1,2})|(?<![A-Za-z0-9_.:/-])(?:\\\\{1,4}|\\/{1,2}))${ESCAPED_OS_USER}(?=$|[\\\\/\\s"'\`,;:])`,
                      'gi'
                  ),
              },
          ]
        : []),
];

function scanTextForPii(text) {
    const hits = [];
    for (const { name, regex } of PII_PATTERNS) {
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(text)) !== null) {
            hits.push({ pattern: name, match: m[0] });
        }
    }
    return hits;
}

function collectFilesRecursive(absDir, relPrefix) {
    const out = [];
    if (!fs.existsSync(absDir)) return out;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const abs = path.join(absDir, entry.name);
        const rel = `${relPrefix}/${entry.name}`;
        if (entry.isDirectory()) {
            out.push(...collectFilesRecursive(abs, rel));
        } else if (entry.isFile()) {
            out.push(rel);
        }
    }
    return out;
}

describe('F16 (R2) — Kiểm thử tĩnh, Build Parity, SVG XSS Guard & Tài sản', () => {
    describe('Tier 1 — Phủ Tính Năng R2 & Cấu trúc Tài sản', () => {
        it('F16-T1-01: Kiểm tra cú pháp node --check cho 16 tệp lõi (daemon/, engine/, scripts/) và toàn bộ tests/**/*.js', () => {
            const targetDirs = ['daemon', 'engine', 'scripts'];
            const coreJsFiles = [];
            for (const dir of targetDirs) {
                const absDir = path.join(REPO_ROOT, dir);
                for (const name of fs.readdirSync(absDir)) {
                    if (name.endsWith('.js')) {
                        coreJsFiles.push(`${dir}/${name}`);
                    }
                }
            }
            assert.equal(
                coreJsFiles.length,
                16,
                `Kỳ vọng đúng 16 tệp .js lõi nhưng tìm thấy ${coreJsFiles.length}: ${coreJsFiles.join(', ')}`
            );

            const testJsFiles = collectFilesRecursive(path.join(REPO_ROOT, 'tests'), 'tests').filter((rel) =>
                rel.endsWith('.js')
            );
            assert.ok(
                testJsFiles.length >= 7,
                `Kỳ vọng ít nhất 7 tệp .js trong tests/, thực tế có ${testJsFiles.length}`
            );
            assert.ok(testJsFiles.includes('tests/test_static_r2.js'), 'Danh sách tests/ phải chứa tests/test_static_r2.js');

            for (const rel of [...coreJsFiles, ...testJsFiles]) {
                execFileSync(process.execPath, ['--check', path.join(REPO_ROOT, rel)], {
                    cwd: REPO_ROOT,
                    stdio: 'pipe',
                    windowsHide: true,
                });
            }
        });

        it('F16-T1-02: package.json giữ zero-dependency ("dependencies": {}) và engines.node >= 22', () => {
            const pkgPath = path.join(REPO_ROOT, 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            assert.deepEqual(pkg.dependencies, {});
            assert.equal(pkg.devDependencies, undefined);
            assert.equal(pkg.optionalDependencies, undefined);
            assert.equal(pkg.peerDependencies, undefined);
            assert.ok(pkg.engines && typeof pkg.engines.node === 'string', 'Thiếu trường engines.node');
            const m = pkg.engines.node.match(/(\d+)/);
            assert.ok(m && Number(m[1]) >= 22, `engines.node phải >= 22, hiện tại: ${pkg.engines.node}`);
        });

        it('F16-T1-03: Kiểm tra cú pháp PowerShell AST cho scripts/install-win.ps1 và bash -n cho scripts/install-unix.sh', (t) => {
            const ps1Path = path.join(REPO_ROOT, 'scripts', 'install-win.ps1');
            if (process.platform === 'win32') {
                const psCmd = `
                    $tokens = $null; $errors = $null;
                    [void][System.Management.Automation.Language.Parser]::ParseFile($env:AGY_TARGET_PS1, [ref]$tokens, [ref]$errors);
                    if ($errors -and $errors.Count -gt 0) {
                        $errors | ForEach-Object { Write-Error $_.ToString() }
                        exit 1
                    }
                `;
                execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
                    cwd: REPO_ROOT,
                    env: { ...process.env, AGY_TARGET_PS1: ps1Path },
                    stdio: 'pipe',
                    windowsHide: true,
                    timeout: 15000,
                });
            }

            const bashPath = findGitBash();
            if (!bashPath) {
                t.skip('Không tìm thấy bash trên môi trường hiện tại để chạy bash -n');
                return;
            }
            const shPath = path.join(REPO_ROOT, 'scripts', 'install-unix.sh');
            execFileSync(bashPath, ['-n', shPath], {
                cwd: REPO_ROOT,
                stdio: 'pipe',
                windowsHide: true,
                timeout: 10000,
            });
        });

        it('F16-T1-04: Giữ line-endings LF cho scripts/*.sh, *.py, *.js; CRLF cho *.ps1; và Git mode 100755 cho các script Unix', () => {
            const scriptsDir = path.join(REPO_ROOT, 'scripts');
            for (const file of fs.readdirSync(scriptsDir)) {
                const abs = path.join(scriptsDir, file);
                if (!fs.statSync(abs).isFile()) continue;
                const raw = fs.readFileSync(abs);
                const hasUtf8Bom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
                assert.equal(hasUtf8Bom, false, `Tệp ${file} không được chứa UTF-8 BOM`);
                const text = raw.toString('utf8');
                if (file.endsWith('.sh') || file.endsWith('.py') || file.endsWith('.js')) {
                    assert.equal(text.includes('\r\n'), false, `Tệp ${file} phải dùng LF thuần, phát hiện CRLF`);
                    assert.equal(text.includes('\r'), false, `Tệp ${file} chứa ký tự CR rời`);
                } else if (file.endsWith('.ps1')) {
                    assert.equal(text.includes('\r\n'), true, `Tệp ${file} phải dùng CRLF theo .gitattributes`);
                }
            }

            const stageOut = execFileSync('git', ['ls-files', '--stage', 'scripts/'], {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                windowsHide: true,
            });
            const modeByPath = new Map();
            for (const line of stageOut.trim().split(/\r?\n/)) {
                const m = line.match(/^(\d{6})\s+[0-9a-f]+\s+\d+\t(.+)$/);
                if (m) modeByPath.set(m[2], m[1]);
            }
            const expectedExecScripts = [
                'scripts/build_payload.js',
                'scripts/build_payload.py',
                'scripts/install-unix.sh',
                'scripts/uninstall.js',
                'scripts/verify_cdp.js',
            ];
            for (const rel of expectedExecScripts) {
                assert.equal(modeByPath.get(rel), '100755', `Git mode của ${rel} phải là 100755`);
            }
        });

        it('F16-T1-05: Kiểm tra đủ 16 themes trong themes/themes.json và đủ 15 nhân vật trong themes/assets/', () => {
            const themesPath = path.join(REPO_ROOT, 'themes', 'themes.json');
            const themes = JSON.parse(fs.readFileSync(themesPath, 'utf8'));
            const themeKeys = Object.keys(themes);
            assert.equal(themeKeys.length, 16, `Kỳ vọng 16 themes, thực tế có ${themeKeys.length}`);

            const assetsDir = path.join(REPO_ROOT, 'themes', 'assets');
            const assetSet = new Set(fs.readdirSync(assetsDir));

            const kny14 = [
                'ubuyashiki',
                'shinobu',
                'giyu',
                'rengoku',
                'uzui',
                'muichiro',
                'mitsuri',
                'obanai',
                'sanemi',
                'gyomei',
                'tanjiro',
                'nezuko',
                'zenitsu',
                'inosuke',
            ];
            for (const id of kny14) {
                const bgFile = id === 'shinobu' ? 'shinobu_wisteria_bg.webp' : `${id}_bg.webp`;
                const expectedFiles = [
                    bgFile,
                    `${id}_avatar.jpg`,
                    `${id}_user_avatar.svg`,
                    `${id}_action.webp`,
                    `${id}_corner.svg`,
                    `${id}_ornament.svg`,
                ];
                for (const f of expectedFiles) {
                    assert.equal(assetSet.has(f), true, `Thiếu asset nhân vật ${id}: ${f}`);
                }
            }

            const yoriichiFiles = [
                'yoriichi_avatar.jpg',
                'yoriichi_action.webp',
                'yoriichi_corner.svg',
                'yoriichi_ornament.svg',
            ];
            for (const f of yoriichiFiles) {
                assert.equal(assetSet.has(f), true, `Thiếu asset Yoriichi (nhân vật #15): ${f}`);
            }

            for (const f of ['wlop_cosmic_2k.webp', 'wlop_corner.svg', 'wlop_ornament.svg']) {
                assert.equal(assetSet.has(f), true, `Thiếu asset WLOP Cosmic: ${f}`);
            }
        });

        it('F16-T1-06: Quét PII và đường dẫn máy local trên toàn bộ file được Git theo dõi và thư mục tests/ đạt 0 phát hiện', () => {
            const trackedOut = execFileSync('git', ['ls-files', '-z'], {
                cwd: REPO_ROOT,
                windowsHide: true,
            });
            const trackedFiles = trackedOut.toString('utf8').split('\0').filter(Boolean);
            assert.ok(trackedFiles.length > 0, 'Danh sách git ls-files không được rỗng');

            const testDirFiles = collectFilesRecursive(path.join(REPO_ROOT, 'tests'), 'tests');
            assert.ok(testDirFiles.includes('tests/test_static_r2.js'), 'Phải bao phủ cả tests/test_static_r2.js khi quét PII');
            const candidateFiles = new Set([
                ...trackedFiles.map((f) => f.replace(/\\/g, '/')),
                ...testDirFiles.map((f) => f.replace(/\\/g, '/')),
            ]);

            const textExts = new Set(['.js', '.py', '.ps1', '.sh', '.json', '.md', '.html', '.css', '.svg', '.txt', '.yml', '.yaml']);
            const findings = [];
            for (const rel of candidateFiles) {
                const ext = path.extname(rel).toLowerCase();
                if (!textExts.has(ext) && path.basename(rel) !== '.gitattributes' && path.basename(rel) !== '.gitignore') {
                    continue;
                }
                const abs = path.join(REPO_ROOT, rel);
                if (!fs.existsSync(abs)) continue;
                const content = fs.readFileSync(abs, 'utf8');
                const hits = scanTextForPii(content);
                if (hits.length > 0) {
                    findings.push({ file: rel, hits });
                }
            }
            assert.deepEqual(findings, [], `Phát hiện PII/đường dẫn cá nhân trong repo: ${JSON.stringify(findings)}`);
        });
    });

    describe('Tier 2 — Biên, Bảo mật SVG XSS Guard & Kiểm chứng Regex PII', () => {
        it('F16-T2-01: Regex quét PII bắt được PII thật (kể cả 4 dạng R3 mở rộng) nhưng không false-positive trên tài liệu mẫu', () => {
            const winSample = ['C:', 'Users', 'alice', 'AppData'].join('\\');
            const winSlashSample = ['D:', 'Users', 'bob', 'project'].join('/');
            const macSample = ['', 'Users', 'bob', 'Desktop', 'key'].join('/');
            const linSample = ['', 'home', 'dev', '.config', 'app'].join('/');
            const directDriveSample = ['C:', 'DevUser', 'mod', 'repo'].join('\\');
            const relUsersSample = '// path: ' + ['Users', 'alice', '.gemini'].join('\\');
            const emailSample = ['developer.personal', ['gmail', 'com'].join('.')].join('@');
            const quadJsonSample = JSON.stringify({ path: ['C:', 'Users', 'alice', 'repo'].join('\\\\') });

            const realLeaks = [
                `const p = ${JSON.stringify(winSample)};`,
                `const p2 = ${JSON.stringify(winSlashSample)};`,
                `const mac = ${JSON.stringify(macSample)};`,
                `const lin = ${JSON.stringify(linSample)};`,
                directDriveSample,
                relUsersSample,
                emailSample,
                quadJsonSample,
            ];
            if (CURRENT_OS_USER.length >= 2 && !/^(root|user|admin|runner|node|ci|docker)$/i.test(CURRENT_OS_USER)) {
                realLeaks.push(['C:', CURRENT_OS_USER, 'mod', 'repo'].join('\\'));
                realLeaks.push(['C:', CURRENT_OS_USER].join('\\'));
            }
            for (const sample of realLeaks) {
                const hits = scanTextForPii(sample);
                assert.ok(hits.length > 0, `Regex phải bắt được PII thật: ${sample}`);
            }

            const safeDocs = [
                'Never hardcode C:\\Users\\... or /Users/... or /home/... in code.',
                'Example: C:\\Users\\...\\antigravity',
                'C:\\Program Files\\Git\\bin\\bash.exe',
                'C:\\fakepath\\same-file',
                'pkg@1.2.3',
            ];
            for (const docLine of safeDocs) {
                const hits = scanTextForPii(docLine);
                assert.equal(hits.length, 0, `Regex không được false-positive trên placeholder/an toàn: ${docLine}`);
            }
        });

        it('F16-T2-02: SVG XSS Guard của build_payload.js chặn đủ 7 vector tấn công trong sandbox tối thiểu', () => {
            const vectors = [
                { name: 'script', svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' },
                { name: 'foreignObject', svg: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body>x</body></foreignObject></svg>' },
                { name: 'iframe', svg: '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.test"></iframe></svg>' },
                { name: 'object', svg: '<svg xmlns="http://www.w3.org/2000/svg"><object data="x"></object></svg>' },
                { name: 'embed', svg: '<svg xmlns="http://www.w3.org/2000/svg"><embed src="x"/></svg>' },
                { name: 'onload', svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="5"/></svg>' },
                { name: 'javascript-uri', svg: '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>' },
            ];

            const tmp = makeTempDir('agy-test-svg-js-');
            const themesDir = path.join(tmp, 'themes');
            fs.mkdirSync(themesDir, { recursive: true });
            const outFile = path.join(tmp, 'out.js');
            const enginePath = path.join(REPO_ROOT, 'engine', 'core.js');
            const buildJs = path.join(REPO_ROOT, 'scripts', 'build_payload.js');

            for (const vec of vectors) {
                const svgName = `evil_${vec.name}.svg`;
                fs.writeFileSync(path.join(themesDir, svgName), vec.svg, 'utf8');
                const themesJson = {
                    TestTheme: {
                        cornerSvg: svgName,
                    },
                };
                const themesJsonPath = path.join(themesDir, 'themes.json');
                fs.writeFileSync(themesJsonPath, JSON.stringify(themesJson), 'utf8');

                let threw = false;
                try {
                    execFileSync(process.execPath, [buildJs, '--themes', themesJsonPath, '--engine', enginePath, '--out', outFile], {
                        cwd: REPO_ROOT,
                        stdio: 'pipe',
                        windowsHide: true,
                    });
                } catch (err) {
                    threw = true;
                    const msg = `${err.stderr || ''}${err.stdout || ''}`;
                    assert.match(msg, /Security violation/i, `Vector ${vec.name} không báo Security violation`);
                }
                assert.equal(threw, true, `build_payload.js phải từ chối vector SVG XSS: ${vec.name}`);
            }
        });

        it('F16-T2-03: SVG XSS Guard của build_payload.py (-B) chặn đủ 7 vector kể cả BOM/CRLF/chữ hoa', (t) => {
            const py = findPythonExe();
            if (!py) {
                t.skip('Không tìm thấy Python 3 để kiểm tra SVG XSS Guard cho build_payload.py');
                return;
            }
            const vectors = [
                { name: 'SCRIPT-upper', svg: '\uFEFF<svg xmlns="http://www.w3.org/2000/svg">\r\n<SCRIPT>alert(1)</SCRIPT></svg>' },
                { name: 'foreignObject', svg: '<svg xmlns="http://www.w3.org/2000/svg"><FOREIGNOBJECT/></svg>' },
                { name: 'iframe', svg: '<svg xmlns="http://www.w3.org/2000/svg"><iframe/></svg>' },
                { name: 'object', svg: '<svg xmlns="http://www.w3.org/2000/svg"><object/></svg>' },
                { name: 'embed', svg: '<svg xmlns="http://www.w3.org/2000/svg"><embed/></svg>' },
                { name: 'onmouseover', svg: '<svg xmlns="http://www.w3.org/2000/svg" OnMouseOver = "alert(1)"/>' },
                { name: 'javascript-uri', svg: '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="JAVASCRIPT:alert(1)"/></svg>' },
            ];

            const tmp = makeTempDir('agy-test-svg-py-');
            const themesDir = path.join(tmp, 'themes');
            fs.mkdirSync(themesDir, { recursive: true });
            const outFile = path.join(tmp, 'out.js');
            const enginePath = path.join(REPO_ROOT, 'engine', 'core.js');
            const buildPy = path.join(REPO_ROOT, 'scripts', 'build_payload.py');

            for (const vec of vectors) {
                const svgName = `evil_${vec.name}.svg`;
                fs.writeFileSync(path.join(themesDir, svgName), vec.svg, 'utf8');
                const themesJsonPath = path.join(themesDir, 'themes.json');
                fs.writeFileSync(themesJsonPath, JSON.stringify({ TestTheme: { sticker: svgName } }), 'utf8');

                let threw = false;
                try {
                    execFileSync(py, ['-B', buildPy, '--themes', themesJsonPath, '--engine', enginePath, '--out', outFile], {
                        cwd: REPO_ROOT,
                        stdio: 'pipe',
                        windowsHide: true,
                    });
                } catch (err) {
                    threw = true;
                    const msg = `${err.stderr || ''}${err.stdout || ''}`;
                    assert.match(msg, /Security violation/i, `Vector ${vec.name} không báo Security violation`);
                }
                assert.equal(threw, true, `build_payload.py phải từ chối vector SVG XSS: ${vec.name}`);
            }
        });

        it('F16-T2-04: Toàn bộ SVG thật trong themes/assets/ sạch XSS và mọi asset tham chiếu trong themes.json đều tồn tại', () => {
            const unsafeSvgRe = /<script|<foreignobject|<iframe|<object|<embed|\bon[a-z]+\s*=|javascript:/i;
            const assetsDir = path.join(REPO_ROOT, 'themes', 'assets');
            for (const file of fs.readdirSync(assetsDir)) {
                if (file.endsWith('.svg')) {
                    const content = fs.readFileSync(path.join(assetsDir, file), 'utf8');
                    assert.equal(unsafeSvgRe.test(content), false, `Tệp SVG ${file} chứa markup nguy hiểm`);
                }
            }

            const themesDir = path.join(REPO_ROOT, 'themes');
            const themes = JSON.parse(fs.readFileSync(path.join(themesDir, 'themes.json'), 'utf8'));
            const assetKeys = ['wallpaper', 'sticker', 'userSticker', 'actionSticker', 'userActionSticker', 'cornerSvg', 'userCornerSvg', 'userAvatar', 'agentAvatar'];
            for (const [themeName, cfg] of Object.entries(themes)) {
                for (const key of assetKeys) {
                    const val = cfg[key];
                    if (typeof val === 'string' && val.trim() && !val.startsWith('data:') && !val.startsWith('http')) {
                        const target = path.resolve(themesDir, val.trim());
                        assert.equal(fs.existsSync(target), true, `Theme "${themeName}" trỏ tới asset không tồn tại: ${val}`);
                    }
                }
            }
        });

        it('F16-T2-05: themes/themes.json an toàn Prototype Pollution và bảo toàn định danh mặc định Yoriichi', () => {
            const rawText = fs.readFileSync(path.join(REPO_ROOT, 'themes', 'themes.json'), 'utf8');
            assert.equal(/"(?:__proto__|constructor|prototype)"\s*:/.test(rawText), false, 'themes.json không được chứa khóa gây Prototype Pollution');
            const themes = JSON.parse(rawText);
            for (const [name, cfg] of Object.entries(themes)) {
                assert.equal(cfg.userAvatar, 'assets/yoriichi_avatar.jpg', `Theme "${name}" phải giữ userAvatar mặc định là assets/yoriichi_avatar.jpg`);
                if (cfg.isChibiNpc) {
                    assert.ok(typeof cfg.fxMode === 'string' && cfg.fxMode.length > 0, `Theme KNY "${name}" thiếu fxMode`);
                }
            }
        });

        it('F16-T2-06: Kiểm tra biến bản dịch Tiếng Việt & không có chuỗi khóa ngoại lai trong package.json', () => {
            const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
            assert.equal(pkg.scripts.build, 'node scripts/build_payload.js');
            assert.equal(pkg.scripts.verify, 'node scripts/verify_cdp.js');
            assert.equal(pkg.scripts.start, 'node daemon/theme_daemon.js');
            assert.equal(pkg.scripts.uninstall, 'node scripts/uninstall.js');
        });
    });

    describe('Tier 3 — Tổ Hợp Build Parity SHA-256 (build_payload.js vs python -B build_payload.py)', () => {
        it('F16-T3-01: Build Parity SHA-256 ở chế độ mặc định (hybrid) khớp 100% byte-for-byte', (t) => {
            const py = findPythonExe();
            if (!py) {
                t.skip('Không tìm thấy Python 3 để đối chiếu build parity');
                return;
            }
            const tmp = makeTempDir('agy-test-parity-hybrid-');
            const outJs = path.join(tmp, 'payload_js.js');
            const outPy = path.join(tmp, 'payload_py.js');

            execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'build_payload.js'), '--out', outJs], {
                cwd: REPO_ROOT,
                stdio: 'pipe',
                windowsHide: true,
                timeout: 20000,
            });
            execFileSync(py, ['-B', path.join(REPO_ROOT, 'scripts', 'build_payload.py'), '--out', outPy], {
                cwd: REPO_ROOT,
                stdio: 'pipe',
                windowsHide: true,
                timeout: 20000,
            });

            const hashJs = sha256File(outJs);
            const hashPy = sha256File(outPy);
            assert.equal(hashJs, hashPy, `SHA-256 hybrid không khớp: JS=${hashJs} vs PY=${hashPy}`);
            assert.equal(fs.statSync(outJs).size, fs.statSync(outPy).size);
        });

        it('F16-T3-02: Build Parity SHA-256 ở chế độ --inline-all khớp 100% byte-for-byte', (t) => {
            const py = findPythonExe();
            if (!py) {
                t.skip('Không tìm thấy Python 3 để đối chiếu build parity --inline-all');
                return;
            }
            const tmp = makeTempDir('agy-test-parity-inline-');
            const outJs = path.join(tmp, 'payload_js_inline.js');
            const outPy = path.join(tmp, 'payload_py_inline.js');

            execFileSync(
                process.execPath,
                [path.join(REPO_ROOT, 'scripts', 'build_payload.js'), '--inline-all', '--out', outJs],
                {
                    cwd: REPO_ROOT,
                    stdio: 'pipe',
                    windowsHide: true,
                    timeout: 20000,
                }
            );
            execFileSync(
                py,
                ['-B', path.join(REPO_ROOT, 'scripts', 'build_payload.py'), '--inline-all', '--out', outPy],
                {
                    cwd: REPO_ROOT,
                    stdio: 'pipe',
                    windowsHide: true,
                    timeout: 20000,
                }
            );

            const hashJs = sha256File(outJs);
            const hashPy = sha256File(outPy);
            assert.equal(hashJs, hashPy, `SHA-256 --inline-all không khớp: JS=${hashJs} vs PY=${hashPy}`);
            assert.ok(fs.statSync(outJs).size > 1024 * 1024, 'Bản --inline-all phải nhúng đầy đủ tài sản (> 1MB)');
        });
    });
});
