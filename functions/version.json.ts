// Cloudflare Pages Functions - 版本与健康检查
// 严格规范：绝不使用任何 emoji

import { jsonResponse } from './api/_shared';

export async function onRequestGet(): Promise<Response> {
  return jsonResponse({
    name: 'daka-worklog',
    version: '1.0.7',
    buildTime: '2026-10-14 12:56:00',
    title: '工时打卡系统',
    releaseNotes: '1. 接入 Capacitor 原生本地通知中心，支持安卓系统级 Alarm 精准唤醒与锁屏提醒\n2. 新增通知栏【一键打卡】与【10分钟后再提醒】快捷操作，即时更新工时与触感反馈\n3. 深度联动节假日引擎智能过滤非工作日，支持打卡后自动取消当天提醒防重复打扰\n4. 保留 Web/PWA 端优雅降级机制，优化跨端通知通道与权限申请流程',
    downloadUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.7-android.apk',
    apkUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.7-android.apk',
    platform: 'Cloudflare Pages & Functions',
    status: 'ok'
  });
}
