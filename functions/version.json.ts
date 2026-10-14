// Cloudflare Pages Functions - 版本与健康检查
// 严格规范：绝不使用任何 emoji

import { jsonResponse } from './api/_shared';

export async function onRequestGet(): Promise<Response> {
  return jsonResponse({
    name: 'daka-worklog',
    version: '1.0.8',
    buildTime: '2026-10-14 13:30:00',
    title: '工时打卡系统',
    releaseNotes: '1. 遵循 oil-tone 规范精简各界面文本与提示信息，去冗去说教\n2. 优化手写向导、结算单导出与设置页交互文案\n3. 完善更新流程各阶段状态与提示反馈',
    downloadUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.8-android.apk',
    apkUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.8-android.apk',
    platform: 'Cloudflare Pages & Functions',
    status: 'ok'
  });
}
