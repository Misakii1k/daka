// Cloudflare Pages Functions - 版本与健康检查
// 严格规范：绝不使用任何 emoji

import { jsonResponse } from './api/_shared';

export async function onRequestGet(): Promise<Response> {
  return jsonResponse({
    name: 'daka-worklog',
    version: '1.0.6',
    buildTime: '2026-10-10 16:10:00',
    title: '工时打卡系统',
    releaseNotes: '1. 重构长图与表格导出体系，新增后端流式支持与系统级存储\n2. Android 端接入 MediaStore 原生相册保存与系统分享\n3. 全面脱敏清理项目个人信息，新增开源 README 与架构图\n4. 优化离线离网能力与 PWA 静态资源缓存',
    downloadUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.6-android.apk',
    apkUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.6-android.apk',
    platform: 'Cloudflare Pages & Functions',
    status: 'ok'
  });
}
