// Cloudflare Pages Functions - 版本与健康检查
// 严格规范：绝不使用任何 emoji

import { jsonResponse } from './api/_shared';

export async function onRequestGet(): Promise<Response> {
  return jsonResponse({
    name: 'daka-worklog',
    version: '1.0.1',
    buildTime: '2026-10-09 18:45:00',
    title: '工时打卡系统',
    releaseNotes: '1. 修复当天打卡后长按仍可重复打卡问题，完善打卡态保护\n2. 彻底解决手写识别 [object Object] 报错，优化离线单字符识别通道\n3. 修正午休 11:30~13:00 估算错误，实现休息时长与时间段严格双向联动\n4. 增加手写分格与数字键盘输入时间范围约束（小时00~23，分钟00~59）\n5. 新增打卡记录修改与删除抽屉（支持列表点击编辑/删除与向导内快捷删除）\n6. 优化统计页面：删除超出标准，横向排列为三列并由两条垂直分割线分割\n7. 底部导航栏文字增大至 17px，更加醒目易读\n8. 工时微调支持像定时器一样的左右滑动刻度盘手感调节\n9. 统一黑白橙核心主题色，移除杂色并优化空间呼吸感',
    platform: 'Cloudflare Pages & Functions',
    status: 'ok'
  });
}
