#!/usr/bin/env node
'use strict';

/**
 * Bộ điều phối kiểm thử tuần tự nhẹ tải (Sequential Test Runner) cho Antigravity Custom Theme Engine v2.0.
 * Chạy lần lượt từng bộ kiểm thử một trong tiến trình đơn để không bao giờ gây quá tải RAM/CPU hay WMI.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SUITES = [
    'test_static_r2.js',
    'test_security.js',
    'test_daemon.js',
    'test_core_forge.js',
    'test_kny_icons_audio_fx.js',
    'test_kny_skills_hud_cinema.js',
    'test_scripts_cli.js',
    'test_live_e2e_cdp.js',
];

function main() {
    const startMs = Date.now();
    console.log('======================================================================');
    console.log(' KIỂM THỬ TOÀN DIỆN ANTIGRAVITY CUSTOM THEME v2.0 (CHẾ ĐỘ TUẦN TỰ)');
    console.log('======================================================================');

    let passedSuites = 0;
    for (let i = 0; i < SUITES.length; i++) {
        const suiteName = SUITES[i];
        const suitePath = path.join(__dirname, suiteName);
        console.log(`\n[${i + 1}/${SUITES.length}] Đang chạy ${suiteName}...`);
        const t0 = Date.now();

        const res = spawnSync(process.execPath, ['--test', suitePath], {
            cwd: path.resolve(__dirname, '..'),
            stdio: 'inherit',
            windowsHide: true,
        });

        const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
        if (res.status !== 0) {
            console.error(`\n[THẤT BẠI] Bộ kiểm thử ${suiteName} dừng với mã ${res.status} sau ${elapsed}s.`);
            process.exit(res.status || 1);
        }
        passedSuites++;
        console.log(`[ĐẠT] ${suiteName} hoàn tất trong ${elapsed}s.`);
    }

    const totalSec = ((Date.now() - startMs) / 1000).toFixed(2);
    console.log('\n======================================================================');
    console.log(` HOÀN TẤT 100%: ${passedSuites}/${SUITES.length} BỘ KIỂM THỬ ĐỀU ĐẠT (${totalSec}s)`);
    console.log('======================================================================');
}

main();
