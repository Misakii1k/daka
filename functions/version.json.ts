// Cloudflare Pages Functions - 版本与健康检查
// 严格规范：绝不使用任何 emoji

import { jsonResponse } from './api/_shared';

export async function onRequestGet(): Promise<Response> {
  return jsonResponse({
    name: 'daka-worklog',
    version: '1.0.5',
    buildTime: '2026-10-10 15:55:00',
    title: '工时打卡系统',
    releaseNotes: '1. 修复凭单版式下拉抽屉层级，支持导出弹窗专属大面积抽屉选版\n2. 界面文案极致精简去括号，利落大方\n3. 工时作息设置方框严格平齐，彻底解决数值与单位重叠\n4. 单日记录底部按钮横向单行排版，不折行不挤压\n5. 时间滚轮红框绝对居中锁定，修复随动问题\n6. 统计与记录支持左右滑动手势与平滑推入动效，切换控件增大',
    downloadUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.5-android.apk',
    apkUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.5-android.apk',
    platform: 'Cloudflare Pages & Functions',
    status: 'ok'
  });
}
