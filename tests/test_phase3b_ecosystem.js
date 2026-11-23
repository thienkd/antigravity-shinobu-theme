'use strict';

/**
 * Bộ kiểm thử tự động F21 — Gói 3B: Hệ Sinh Thái Quốc Tế & Native Plugin v3.0
 * - Đa ngôn ngữ siêu nhẹ `engine/agy_i18n.js` (< 8 KB, vi/en/ja) & Studio Header
 * - Antigravity Native Plugin (`plugin.json`, `hooks.json`, `mcp_config.json`, `assets/logo.svg`)
 * - Lifecycle Hook `scripts/session_start_hook.js` & Workspace-Aware Profiles
 * - Zero-Dep Stdio MCP Server (`daemon/mcp_theme_server.js`) + MCP App `ui://agy-theme/studio.html`
 * - Clean Edition Exporter (`scripts/export_clean_edition.js`) & `.github/workflows/ci.yml`
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const TMP_DIRS = [];

function makeTempDir(prefix = 'agy-test-3b-') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP_DIRS.push(d);
  return d;
}

after(() => {
  while (TMP_DIRS.length > 0) {
    const dir = TMP_DIRS.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
    } catch (_) {}
  }
});

function createMinimalDomForI18n() {
  const storageMap = new Map();
  const localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(String(k), String(v)),
    removeItem: (k) => storageMap.delete(String(k))
  };
  const win = { localStorage };
  const ctx = vm.createContext({
    window: win,
    localStorage,
    __AGY_SEC__: { getInitialConfig: () => null },
    Object,
    String
  });
  const src = fs.readFileSync(path.join(REPO_ROOT, 'engine', 'agy_i18n.js'), 'utf8');
  vm.runInContext(src, ctx);
  return { win, storageMap, i18n: win.__AGY_I18N__ };
}

function sendMcpRequests(requests, useContentLength = false, customEnv = {}) {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(REPO_ROOT, 'daemon', 'mcp_theme_server.js');
    const child = spawn(process.execPath, [serverPath], {
      cwd: REPO_ROOT,
      env: { ...process.env, AGY_SKIP_DAEMON_SPAWN: '1', ...customEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    const outChunks = [];
    const responses = [];
    const expectedIds = requests.filter((r) => r.id !== undefined).length;
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      reject(new Error(`MCP server timed out (${responses.length}/${expectedIds} responses received)`));
    }, 10000);

    let rawBuf = Buffer.alloc(0);
    const parseIncoming = () => {
      if (useContentLength) {
        while (rawBuf.length > 0) {
          const sep = rawBuf.indexOf('\r\n\r\n');
          if (sep === -1) break;
          const hdr = rawBuf.subarray(0, sep).toString('ascii');
          const m = hdr.match(/Content-Length:\s*(\d+)/i);
          if (!m) break;
          const len = parseInt(m[1], 10);
          if (rawBuf.length < sep + 4 + len) break;
          const body = rawBuf.subarray(sep + 4, sep + 4 + len).toString('utf8');
          rawBuf = rawBuf.subarray(sep + 4 + len);
          responses.push(JSON.parse(body));
        }
      } else {
        while (rawBuf.length > 0) {
          const nl = rawBuf.indexOf(0x0a);
          if (nl === -1) break;
          const line = rawBuf.subarray(0, nl).toString('utf8').trim();
          rawBuf = rawBuf.subarray(nl + 1);
          if (line) responses.push(JSON.parse(line));
        }
      }
      if (responses.length >= expectedIds) {
        clearTimeout(timer);
        try { child.stdin.end(); } catch (_) {}
      }
    };

    child.stdout.on('data', (c) => {
      outChunks.push(c);
      rawBuf = Buffer.concat([rawBuf, c]);
      parseIncoming();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(responses);
    });

    for (const req of requests) {
      const json = JSON.stringify(req);
      if (useContentLength) {
        const bLen = Buffer.byteLength(json, 'utf8');
        child.stdin.write(`Content-Length: ${bLen}\r\n\r\n${json}`);
      } else {
        child.stdin.write(`${json}\n`);
      }
    }
  });
}

describe('F21 — Gói 3B: Đa Ngôn Ngữ, Native Plugin, MCP Controller & Hồ Sơ Dự Án', () => {
  it('F21-T1-01: agy_i18n.js nhỏ hơn 8 KB (< 8192 byte), mặc định Tiếng Việt và dịch chuẩn vi / en / ja', () => {
    const i18nPath = path.join(REPO_ROOT, 'engine', 'agy_i18n.js');
    const stat = fs.statSync(i18nPath);
    assert.ok(stat.size < 8192, `agy_i18n.js phải < 8192 byte, thực tế: ${stat.size} byte`);

    const { i18n } = createMinimalDomForI18n();
    assert.ok(i18n, 'window.__AGY_I18N__ phải được khởi tạo');
    assert.equal(i18n.getLang(), 'vi', 'Ngôn ngữ mặc định phải là Tiếng Việt (vi)');
    assert.equal(i18n.t('studioTitle'), 'Xưởng Giao Diện Tùy Biến');
    assert.equal(i18n.t('themesCount', { n: 16 }), '16 Chủ đề');

    assert.equal(i18n.setLang('en-US'), 'en');
    assert.equal(i18n.getLang(), 'en');
    assert.equal(i18n.t('studioTitle'), 'Theme Customizer Studio');
    assert.equal(i18n.t('themesCount', { n: 16 }), '16 Themes');
    assert.equal(i18n.t('tab_themes'), 'Gallery');

    assert.equal(i18n.setLang('ja-JP'), 'ja');
    assert.equal(i18n.getLang(), 'ja');
    assert.equal(i18n.t('studioTitle'), 'カスタムテーマ工房');
    assert.equal(i18n.t('themesCount', { n: 16 }), '16 テーマ');
    assert.equal(i18n.t('tab_forge'), '鍛冶場・設定');

    // Khóa lạ fallback an toàn về chuỗi Tiếng Việt gốc
    i18n.setLang('vi');
    assert.equal(i18n.t('unknownKey', 'Chuỗi gốc {x}', { x: 9 }), 'Chuỗi gốc 9');
  });

  it('F21-T1-02: Cấu trúc Antigravity Native Plugin (plugin.json, hooks.json, mcp_config.json, logo.svg, ci.yml) hợp chuẩn', () => {
    const pluginJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'plugin.json'), 'utf8'));
    const allowedTopFields = new Set([
      'name', 'description', 'logo', 'suggestedPrompts', 'displayName',
      'version', 'author', 'homepage', 'repository', 'disabled'
    ]);
    for (const k of Object.keys(pluginJson)) {
      assert.equal(allowedTopFields.has(k), true, `plugin.json chứa trường top-level không hợp lệ: ${k}`);
    }
    assert.equal(pluginJson.name, 'antigravity-shinobu-theme');
    assert.equal(pluginJson.suggestedPrompts.length, 3);

    const logoPath = path.join(REPO_ROOT, pluginJson.logo);
    assert.equal(fs.existsSync(logoPath), true, 'assets/logo.svg phải tồn tại');
    const logoSvg = fs.readFileSync(logoPath, 'utf8');
    assert.equal(/<script|<foreignobject|\bon[a-z]+\s*=/i.test(logoSvg), false, 'logo.svg phải sạch XSS');

    const hooksJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks.json'), 'utf8'));
    assert.ok(Array.isArray(hooksJson['antigravity-shinobu-theme']?.SessionStart), 'hooks.json phải khai báo SessionStart');

    const mcpJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'mcp_config.json'), 'utf8'));
    assert.ok(mcpJson.mcpServers && mcpJson.mcpServers.controller, 'mcp_config.json phải khai báo controller server');

    const rootSkill = fs.readFileSync(path.join(REPO_ROOT, 'SKILL.md'), 'utf8');
    const pluginSkill = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'antigravity-custom-theme', 'SKILL.md'), 'utf8');
    assert.equal(rootSkill, pluginSkill, 'SKILL.md gốc và skills/antigravity-custom-theme/SKILL.md phải đồng bộ 100%');

    const ciPath = path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
    assert.equal(fs.existsSync(ciPath), true, 'Phải có .github/workflows/ci.yml cho GitHub Actions');
  });

  it('F21-T1-03: Hook SessionStart tự áp dụng Hồ sơ giao diện theo Workspace và xuất đúng "{}" trên stdout', () => {
    const tmp = makeTempDir('agy-hook-');
    const cfgPath = path.join(tmp, 'theme_config.json');
    const bakPath = path.join(tmp, 'backup.json');
    const pidPath = path.join(tmp, 'daemon.pid');

    const preSeeded = {
      themeName: '🦋 Trùng Trụ — Shinobu Kocho',
      masterPersona: 'yoriichi',
      workspaceProfiles: {
        'acme-billing-api': {
          themeName: '📿 Nham Trụ — Gyomei Himejima',
          bubbleName: '📿 Nham Trụ — Gyomei Himejima',
          masterPersona: 'gyomei',
          dimming: 44,
          fxDensity: 60,
          chibiEnabled: false
        }
      }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(preSeeded, null, 2), 'utf8');

    const hookStdin = JSON.stringify({
      conversationId: '00000000-0000-4000-8000-000000000001',
      workspacePaths: ['file:///workspace/acme-billing-api'],
      hookEventName: 'SessionStart'
    });

    const stdout = execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'session_start_hook.js')], {
      cwd: REPO_ROOT,
      input: hookStdin,
      encoding: 'utf8',
      env: {
        ...process.env,
        AGY_CONFIG_PATH: cfgPath,
        AGY_BACKUP_CONFIG_PATH: bakPath,
        AGY_PID_FILE: pidPath,
        AGY_SKIP_DAEMON_SPAWN: '1'
      },
      windowsHide: true,
      timeout: 5000
    });

    assert.deepEqual(JSON.parse(stdout.trim()), {}, 'SessionStart hook bắt buộc trả về {} trên stdout');
    const updatedCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert.equal(updatedCfg.activeWorkspace, 'acme-billing-api');
    assert.equal(updatedCfg.themeName, '📿 Nham Trụ — Gyomei Himejima');
    assert.equal(updatedCfg.masterPersona, 'gyomei');
    assert.equal(updatedCfg.dimming, 44);
    assert.equal(updatedCfg.chibiEnabled, false);
  });

  it('F21-T1-04: Zero-Dep Stdio MCP Server hoạt động chuẩn trên cả Newline JSON & Content-Length framing + chặn Magic Bytes giả', async () => {
    const tmp = makeTempDir('agy-mcp-');
    const cfgPath = path.join(tmp, 'theme_config.json');
    const bakPath = path.join(tmp, 'backup.json');
    const pidPath = path.join(tmp, 'daemon.pid');
    const portPath = path.join(tmp, 'DevToolsActivePort');

    // Tạo 1 tệp PNG thật tối giản (1x1 pixel) và 1 tệp giả mạo chứa text
    const validPng1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    const validImgPath = path.join(tmp, 'wallpaper.png');
    const fakeImgPath = path.join(tmp, 'evil.png');
    fs.writeFileSync(validImgPath, validPng1x1);
    fs.writeFileSync(fakeImgPath, 'NOT_AN_IMAGE_<script>alert(1)</script>', 'utf8');

    const envVars = {
      AGY_CONFIG_PATH: cfgPath,
      AGY_BACKUP_CONFIG_PATH: bakPath,
      AGY_PID_FILE: pidPath,
      AGY_DEVTOOLS_PORT_FILE: portPath
    };

    // 1. Newline JSON framing
    const responses = await sendMcpRequests(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
        { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        { jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'ui://agy-theme/studio.html' } },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'switch_theme', arguments: { themeQuery: 'nham tru', uiLang: 'en' } } },
        { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'set_persona', arguments: { personaQuery: 'gojo' } } },
        { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'toggle_focus_mode', arguments: { enabled: true } } },
        { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'forge_theme_from_image', arguments: { imagePath: fakeImgPath } } },
        { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'forge_theme_from_image', arguments: { imagePath: validImgPath, themeName: 'Thiên Hà Xanh' } } },
        { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'bind_workspace_profile', arguments: { action: 'bind', workspace: 'core-engine', themeQuery: 'giyu' } } },
        { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'diagnose_cdp_onboarding', arguments: { autoFix: false } } }
      ],
      false,
      envVars
    );

    assert.equal(responses.length, 10);
    assert.equal(responses[0].result.protocolVersion, '2025-06-18');
    assert.equal(responses[1].result.tools.length, 7);
    const studioTool = responses[1].result.tools.find((t) => t.name === 'open_theme_studio');
    assert.equal(studioTool._meta.ui.resourceUri, 'ui://agy-theme/studio.html');

    assert.equal(responses[2].result.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.ok(responses[2].result.contents[0].text.includes('Onboarding Doctor'));

    assert.equal(responses[3].result.structuredContent.activeConfig.themeName, '📿 Nham Trụ — Gyomei Himejima');
    assert.equal(responses[3].result.structuredContent.activeConfig.uiLang, 'en');
    assert.equal(responses[4].result.structuredContent.activeConfig.masterPersona, 'six_eyes');
    assert.equal(responses[5].result.structuredContent.activeConfig.chibiEnabled, false);
    assert.equal(responses[5].result.structuredContent.activeConfig.fxDensity, 20);

    // Chặn file giả mạo không đúng Magic Bytes
    assert.equal(responses[6].result.isError, true, 'Phải từ chối tệp không khớp Magic Bytes ảnh');
    // Chấp nhận PNG thật
    assert.equal(Boolean(responses[7].result.isError), false);
    assert.equal(responses[7].result.structuredContent.activeConfig.themeName, 'Thiên Hà Xanh');

    // Bind workspace profile
    assert.equal(responses[8].result.structuredContent.workspaceProfiles['core-engine'].themeName, '🌊 Thủy Trụ — Giyu Tomioka');
    assert.equal(typeof responses[9].result.structuredContent.cdp.cdpHealthy, 'boolean');

    // 2. Content-Length framing
    const clRes = await sendMcpRequests(
      [
        { jsonrpc: '2.0', id: 101, method: 'ping', params: {} },
        { jsonrpc: '2.0', id: 102, method: 'resources/list', params: {} }
      ],
      true,
      envVars
    );
    assert.equal(clRes.length, 2);
    assert.deepEqual(clRes[0].result, {});
    assert.equal(clRes[1].result.resources[0].uri, 'ui://agy-theme/studio.html');
  });

  it('F21-T1-05: export_clean_edition.js xuất gói 100% Pure MIT (không chứa fan-art KNY) và biên dịch payload sạch cú pháp', () => {
    const outClean = makeTempDir('agy-clean-ed-');
    execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts', 'export_clean_edition.js'), '--out', outClean],
      { cwd: REPO_ROOT, stdio: 'pipe', windowsHide: true, timeout: 20000 }
    );

    const cleanThemes = JSON.parse(fs.readFileSync(path.join(outClean, 'themes', 'themes.json'), 'utf8'));
    const themeNames = Object.keys(cleanThemes);
    assert.equal(themeNames.length, 4);
    assert.equal(themeNames.some((n) => /Shinobu|Rengoku|Ubuyashiki/i.test(n)), false, 'Clean Edition không được chứa tên chủ đề KNY');

    const assetFiles = fs.readdirSync(path.join(outClean, 'themes', 'assets'));
    assert.equal(assetFiles.some((f) => /shinobu|rengoku|giyu|uzui/i.test(f)), false, 'Clean Edition không được chứa asset nhân vật KNY');

    const builtPayload = path.join(outClean, 'dist', 'theme_payload.js');
    assert.equal(fs.existsSync(builtPayload), true, 'Clean Edition phải biên dịch sẵn dist/theme_payload.js');
    execFileSync(process.execPath, ['--check', builtPayload], { cwd: outClean, stdio: 'pipe', windowsHide: true });
  });
});
