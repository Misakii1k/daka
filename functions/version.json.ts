// Cloudflare Pages Functions - 版本与健康检查
// 严格规范：绝不使用任何 emoji

import { jsonResponse } from './api/_shared';

export async function onRequestGet(): Promise<Response> {
  return jsonResponse({
    name: 'daka-worklog',
    version: '1.0.3',
    buildTime: '2026-10-10 11:25:00',
    title: '工时打卡系统',
    releaseNotes: '1. 顶部更新提醒自适应横幅避让系统状态栏与打孔屏，杜绝通知栏遮挡\n2. 新版本更新弹窗按钮高度与触控质感升级，暗黑模式自适应亮橙主操作\n3. 首页工时文字加大加粗，合理舒展首屏垂直布局与卡片韵律\n4. 界面主题分段切换器滑块实现像素级 1:1:1 均分与精确贴合覆盖\n5. 月度薪资金额升级为高饱和鲜艳正红与暗黑微发光亮粉红\n6. Cloudflare D1 极简存储：专属同步识别码免配置、打卡后无感后台自动同步、智能双向合并\n7. 深度优化深色模式：Token 彻底隔离，消除硬编码白底与 Toast 隐形反白，纯净暗黑体验\n8. 导出结算单页面排版重塑：双行对称 Bento 架构，彻底消除核算对象文字挤压竖排与输入框变形',
    downloadUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.3-android.apk',
    apkUrl: 'https://daka-f3o.pages.dev/release/daka-1.0.3-android.apk',
    platform: 'Cloudflare Pages & Functions',
    status: 'ok'
  });
}

