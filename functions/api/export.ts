// Cloudflare Pages Functions - 工时核算长图与表格导出后端端点
// 严格规范：绝不使用任何 emoji

import { Env, handleOptions, jsonResponse } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request } = context;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: '非法的 JSON 请求体' }, 400);
  }

  const { action, reportData, imageBase64, filename } = body;

  // 1. 后端生成并返回标准 CSV 明细表格文件流
  if (action === 'export_csv') {
    if (!reportData) {
      return jsonResponse({ ok: false, error: '缺少核算报表数据' }, 400);
    }

    const lines: string[] = [];
    lines.push(`"工时与薪资结算单"`);
    lines.push(`"核算对象","${reportData.userName || '本人'}","打印时间","${reportData.printTimeStr || new Date().toLocaleString('zh-CN')}"`);
    lines.push(`"计薪周期","${reportData.periodStr || ''}","单号","${reportData.receiptNo || ''}"`);
    lines.push(`"时薪单价","￥${Number(reportData.wageRate || 0).toFixed(2)} 元/小时","标准日工时","${reportData.stdHours || 8} 小时"`);
    lines.push(`"出勤天数","${reportData.attendedDays || 0} 天","总计工时","${Number(reportData.totalHours || 0).toFixed(1)} 小时"`);
    lines.push(`"应发实付金额","￥${Number(reportData.totalSalary || 0).toFixed(2)}","大写金额","${reportData.totalSalaryCn || ''}"`);
    lines.push('');
    lines.push(`"日期","星期","上班时间","下班时间","扣除午休(分钟)","计入工时(小时)","当日薪资(元)","考勤状态","备注"`);

    if (Array.isArray(reportData.dailyItems)) {
      for (const item of reportData.dailyItems) {
        const row = [
          `"${item.dateKey || ''}"`,
          `"${item.dayOfWeek || ''}"`,
          `"${item.inTime || ''}"`,
          `"${item.outTime || ''}"`,
          `"${item.hasRecord ? item.lunchSpan : 0}"`,
          `"${Number(item.workedHours || 0).toFixed(1)}"`,
          `"${Number(item.daySalary || 0).toFixed(2)}"`,
          `"${item.status || ''}"`,
          `"${(item.note || '').replace(/"/g, '""')}"`
        ];
        lines.push(row.join(','));
      }
    }

    lines.push('');
    lines.push(`"合计","","","","","${Number(reportData.totalHours || 0).toFixed(1)}","${Number(reportData.totalSalary || 0).toFixed(2)}","共出勤 ${reportData.attendedDays || 0} 天",""`);

    const csvText = '\uFEFF' + lines.join('\r\n');
    const encoder = new TextEncoder();
    const csvBytes = encoder.encode(csvText);

    const targetName = filename || `工时薪资明细-${reportData.year || ''}年${reportData.month || ''}月-${reportData.userName || '本人'}.csv`;

    return new Response(csvBytes, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(targetName)}`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Disposition',
        'Cache-Control': 'no-cache'
      }
    });
  }

  // 2. 后端接收凭单长图并以标准二进制附件流返回
  if (action === 'export_image') {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return jsonResponse({ ok: false, error: '缺少长图 Base64 数据' }, 400);
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const targetName = filename || `工时凭单-${Date.now()}.png`;

    return new Response(bytes.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(targetName)}`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Disposition',
        'Cache-Control': 'no-cache'
      }
    });
  }

  return jsonResponse({ ok: false, error: '未知的导出动作' }, 400);
}
