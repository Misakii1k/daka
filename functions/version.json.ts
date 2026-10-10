// Cloudflare Pages Functions - 版本与健康检查
// 严格规范：绝不使用任何 emoji

import { jsonResponse } from './api/_shared';

export async function onRequestGet(): Promise<Response> {
  return jsonResponse({
    name: 'daka-worklog',
    version: '1.0.4',
    buildTime: '2026-10-10 12:55:00',
    title: '工时打卡系统',
    releaseNotes: '1. 软件内闭环极速更新：彻底告别浏览器与外部下载器跳转，内置下载校验与安装引导\n2. 全面对标 Google Material 3 灵动动效：M3 容器状态机形变、流体发光进度条\n3. 导航栏方向感知弹性拉伸指示器（Stretch-and-Snap）\n4. 全局动态水波纹剪裁与防溢出保护，微交互质感全面升级',
    downloadUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.4-android.apk',
    apkUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.4-android.apk',
    platform: 'Cloudflare Pages & Functions',
    status: 'ok'
  });
}
